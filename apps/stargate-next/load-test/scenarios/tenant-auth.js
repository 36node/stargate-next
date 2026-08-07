import { check, fail, sleep } from "k6";
import { Trend } from "k6/metrics";

import { request, requireEnv } from "../lib/http.js";
import { buildSummaryFiles } from "../lib/report.js";

const captchaDuration = new Trend("captcha_duration", true);
const loginDuration = new Trend("login_duration", true);
const refreshDuration = new Trend("refresh_duration", true);

const profile = __ENV.K6_PROFILE || "ramp";
const prepUserCount = Number(
  __ENV.PREP_USER_COUNT ||
    (profile === "smoke" ? "5" : profile === "ci" ? "120" : "1000")
);
const stepThinkTimeMin = Number(__ENV.STEP_THINK_TIME_MIN || "1");
const stepThinkTimeMax = Number(__ENV.STEP_THINK_TIME_MAX || "3");
const cycleThinkTimeMin = Number(__ENV.THINK_TIME_MIN || "5");
const cycleThinkTimeMax = Number(__ENV.THINK_TIME_MAX || "15");

const INITIAL_PASSWORD = "load-test-initial-password";
const RESET_PASSWORD = "load-test-reset-password";

function executorOptions() {
  if (profile === "smoke") {
    return {
      duration: __ENV.K6_DURATION || "30s",
      vus: Number(__ENV.K6_VUS || "2"),
    };
  }
  if (profile === "ci") {
    // CI-friendly: climb to 100, short hold, fast down (~5m).
    return {
      stages: [
        { duration: "30s", target: 10 },
        { duration: "1m", target: 50 },
        { duration: "2m", target: 100 },
        { duration: "1m", target: 100 },
        { duration: "30s", target: 0 },
      ],
    };
  }
  // Fast climb to 800, hold, fast ramp-down (~10m total).
  return {
    stages: [
      { duration: "1m", target: 100 },
      { duration: "2m", target: 400 },
      { duration: "2m", target: 800 },
      { duration: "3m", target: 800 },
      { duration: "2m", target: 0 },
    ],
  };
}

export const options = {
  ...executorOptions(),
  setupTimeout: profile === "ci" || profile === "smoke" ? "15m" : "45m",
  thresholds: {
    checks: ["rate>0.95"],
    http_req_failed: ["rate<0.05"],
    login_duration: ["p(95)<2000"],
    refresh_duration: ["p(95)<2000"],
  },
};

function sleepBetween(minValue, maxValue, fallbackMin, fallbackMax) {
  const min = Number.isFinite(minValue) ? minValue : fallbackMin;
  const max = Number.isFinite(maxValue) ? maxValue : fallbackMax;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  sleep(lo + Math.random() * (hi - lo));
}

function stepThinkTime() {
  sleepBetween(stepThinkTimeMin, stepThinkTimeMax, 1, 3);
}

function cycleThinkTime() {
  sleepBetween(cycleThinkTimeMin, cycleThinkTimeMax, 5, 15);
}

function uniqueSuffix() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function forwardedFor(seed) {
  const n = Number(seed) || 1;
  const third = 100 + (Math.floor(n / 250) % 50);
  const fourth = 1 + (n % 250);
  return `203.0.${third}.${fourth}`;
}

function mustOk(step, result, expectedStatus) {
  const ok = check(result, {
    [`${step} status ${expectedStatus}`]: (r) => r.status === expectedStatus,
  });
  if (!ok) {
    const body =
      result.body === undefined ? "" : ` body=${JSON.stringify(result.body)}`;
    fail(`${step} expected ${expectedStatus}, got ${result.status}${body}`);
  }
}

export function setup() {
  const adminApiKey = requireEnv("STARGATE_ADMIN_API_KEY");
  requireEnv("CAPTCHA_TEST_CODE");
  requireEnv("STARGATE_ENDPOINT");

  if (!Number.isFinite(prepUserCount) || prepUserCount < 1) {
    fail("PREP_USER_COUNT must be a positive number");
  }

  const suffix = uniqueSuffix();
  const tenantId = `lt-${suffix}`.slice(0, 63);

  const createdTenant = request("/v1/tenants", "POST", {
    apiKey: adminApiKey,
    body: { id: tenantId, name: `Load Test ${suffix}` },
    tags: { name: "setup_create_tenant" },
  });
  mustOk("create tenant", createdTenant, 201);

  const createdKey = request("/v1/tenant-api-keys", "POST", {
    apiKey: adminApiKey,
    body: { name: "load-test-worker" },
    tags: { name: "setup_create_tenant_api_key" },
    tenantId,
  });
  mustOk("create tenant api key", createdKey, 201);
  const tenantApiKey = createdKey.body?.key;
  if (!tenantApiKey) {
    fail("tenant api key missing from create response");
  }

  const users = [];
  for (let index = 0; index < prepUserCount; index += 1) {
    const username = `u${index}${suffix}`.replace(/[^a-z0-9._-]/g, "").slice(0, 64);
    const createdAccount = request("/v1/accounts", "POST", {
      apiKey: tenantApiKey,
      body: {
        idempotencyKey: `load-${tenantId}-${index}`,
        password: INITIAL_PASSWORD,
        username,
      },
      tags: { name: "setup_create_account" },
    });
    mustOk(`create account ${index}`, createdAccount, 201);
    const accountId = createdAccount.body?.id;
    if (!accountId) {
      fail(`account id missing for user ${username}`);
    }

    const reset = request(`/v1/accounts/${accountId}/password`, "POST", {
      apiKey: tenantApiKey,
      body: { password: RESET_PASSWORD },
      tags: { name: "setup_reset_password" },
    });
    mustOk(`reset password ${index}`, reset, 204);

    users.push({ password: RESET_PASSWORD, username });
  }

  return { tenantId, users };
}

export default function (data) {
  const captchaCode = requireEnv("CAPTCHA_TEST_CODE").trim().toUpperCase();
  const { tenantId, users } = data;
  if (!users || users.length === 0) {
    fail("setup did not return users");
  }

  const user = users[(__VU - 1 + __ITER) % users.length];
  const ip = forwardedFor(__VU * 1000 + (__ITER % 1000));

  const captcha = request("/v1/captchas", "POST", {
    forwardedFor: ip,
    tags: { name: "captcha" },
    tenantId,
  });
  captchaDuration.add(captcha.response.timings.duration);
  const captchaOk = check(captcha, {
    "captcha status 201": (r) => r.status === 201,
    "captcha has id": (r) => Boolean(r.body?.id),
  });
  if (!captchaOk) {
    return;
  }

  stepThinkTime();

  const login = request("/v1/auth/login", "POST", {
    body: {
      captchaCode,
      captchaId: captcha.body.id,
      login: user.username,
      password: user.password,
    },
    forwardedFor: ip,
    tags: { name: "login" },
    tenantId,
  });
  loginDuration.add(login.response.timings.duration);
  const loginOk = check(login, {
    "login status 200": (r) => r.status === 200,
    "login has refreshKey": (r) => Boolean(r.body?.refreshKey),
  });
  if (!loginOk) {
    return;
  }

  stepThinkTime();

  const refresh = request("/v1/auth/refresh", "POST", {
    body: { refreshKey: login.body.refreshKey },
    forwardedFor: ip,
    tags: { name: "refresh" },
    tenantId,
  });
  refreshDuration.add(refresh.response.timings.duration);
  check(refresh, {
    "refresh status 200": (r) => r.status === 200,
    "refresh keeps session": (r) =>
      r.body?.sessionId === login.body.sessionId &&
      r.body?.refreshKey === login.body.refreshKey,
  });

  // Longer pause before the next captcha → login → refresh cycle.
  cycleThinkTime();
}

export function handleSummary(data) {
  return buildSummaryFiles(data);
}
