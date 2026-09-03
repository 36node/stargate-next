/** 生成 SDK 的认证消费契约与稳定错误映射黑盒回归。 */

import { StargateApiError, StargateNextClient } from "@repo/stargate-next-sdk";
import { describe, expect, it } from "vitest";

import { env, uniqueUsername } from "./support/black-box.js";

const endpoint = env("STARGATE_ENDPOINT");
const apiKey = env("STARGATE_API_KEY");
const captchaCode = env("CAPTCHA_TEST_CODE").trim().toUpperCase();

const withForwardedFor =
  (ip: string): typeof fetch =>
  (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("x-forwarded-for", ip);
    return fetch(input, { ...init, headers });
  };

const client = (ip: string, key = apiKey) =>
  new StargateNextClient(endpoint, {
    apiKey: key,
    fetch: withForwardedFor(ip),
  });

function account(sdk: StargateNextClient, password: string) {
  const username = uniqueUsername();
  return sdk.createAccount({
    idempotencyKey: `auth-sdk-${username}`,
    password,
    username,
  });
}

async function login(
  sdk: StargateNextClient,
  username: string,
  password: string
) {
  const captcha = await sdk.createCaptcha();
  return sdk.login(username, password, captcha.id, captchaCode);
}

async function expectApiError(
  promise: Promise<unknown>,
  status: number,
  code: string
) {
  try {
    await promise;
    throw new Error(`expected StargateApiError ${code}`);
  } catch (error) {
    // biome-ignore lint/suspicious/noMisplacedAssertion: 此 helper 只在测试用例中调用。
    expect(error).toBeInstanceOf(StargateApiError);
    // biome-ignore lint/suspicious/noMisplacedAssertion: 此 helper 只在测试用例中调用。
    expect(error).toMatchObject({ code, status });
  }
}

describe("authentication SDK", () => {
  it("changes a password with Bearer auth and no API key", async () => {
    const adminSdk = client("203.0.113.15");
    const created = await account(adminSdk, "sdk-self-change-password");
    const tokens = await login(
      adminSdk,
      created.username,
      "sdk-self-change-password"
    );
    const bearerSdk = new StargateNextClient(endpoint, {
      fetch: withForwardedFor("203.0.113.16"),
    });

    await expect(
      bearerSdk.selfChangePassword(
        tokens.accessToken,
        "sdk-self-change-password",
        "sdk-self-change-new-password"
      )
    ).resolves.toBeUndefined();
    await expect(
      login(adminSdk, created.username, "sdk-self-change-new-password")
    ).resolves.toMatchObject({ accountId: created.id });
  });

  it("creates and consumes a captcha once", async () => {
    const sdk = client("203.0.113.10");
    const captcha = await sdk.createCaptcha();
    await expect(sdk.verifyCaptcha(captcha.id, captchaCode)).resolves.toEqual({
      verified: true,
    });
    await expect(sdk.verifyCaptcha(captcha.id, captchaCode)).resolves.toEqual({
      verified: false,
    });
  });

  it("logs in, refreshes, lists, and revokes a single session", async () => {
    const sdk = client("203.0.113.11");
    const created = await account(sdk, "sdk-session-password");
    const tokens = await login(sdk, created.username, "sdk-session-password");
    await expect(sdk.refresh(tokens.refreshKey)).resolves.toMatchObject({
      refreshKey: tokens.refreshKey,
      sessionId: tokens.sessionId,
    });
    await expect(sdk.listSessions(created.id)).resolves.toHaveLength(1);
    await sdk.revokeSessions(created.id, tokens.sessionId);
    await expectApiError(
      sdk.refresh(tokens.refreshKey),
      401,
      "REFRESH_INVALID"
    );
  });

  it("logs out and invalidates its refresh key", async () => {
    const sdk = client("203.0.113.12");
    const created = await account(sdk, "sdk-logout-password");
    const tokens = await login(sdk, created.username, "sdk-logout-password");
    await expect(sdk.logout(tokens.accessToken)).resolves.toBeUndefined();
    await expectApiError(
      sdk.refresh(tokens.refreshKey),
      401,
      "REFRESH_INVALID"
    );
  });

  it("bulk revokes every account session", async () => {
    const sdk = client("203.0.113.13");
    const created = await account(sdk, "sdk-bulk-password");
    await login(sdk, created.username, "sdk-bulk-password");
    await login(sdk, created.username, "sdk-bulk-password");
    await expect(sdk.listSessions(created.id)).resolves.toHaveLength(2);
    await sdk.revokeSessions(created.id);
    await expect(sdk.listSessions(created.id)).resolves.toEqual([]);
  });

  it("maps authentication errors to stable SDK errors", async () => {
    const sdk = client("203.0.113.14");
    const created = await account(sdk, "sdk-errors-password");
    await expectApiError(
      sdk.login("captcha-only-missing", "wrong", "missing", captchaCode),
      401,
      "CAPTCHA_INVALID"
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expectApiError(
        login(sdk, created.username, "wrong"),
        401,
        "LOGIN_INVALID"
      );
    }
    const lockedCaptcha = await sdk.createCaptcha();
    await expectApiError(
      sdk.login(created.username, "wrong", lockedCaptcha.id, captchaCode),
      401,
      "LOGIN_LOCKED"
    );
    await expectApiError(
      sdk.refresh("missing-refresh-key"),
      401,
      "REFRESH_INVALID"
    );
    await expectApiError(
      sdk.logout("invalid-token"),
      401,
      "ACCESS_TOKEN_INVALID"
    );
    await expectApiError(
      client("203.0.113.14", "wrong-api-key").listSessions(created.id),
      401,
      "API_KEY_INVALID"
    );
    await expectApiError(
      sdk.login("", "password", "missing", captchaCode),
      400,
      "LOGIN_IDENTIFIER_INVALID"
    );
    await expectApiError(sdk.refresh(""), 400, "REFRESH_KEY_INVALID");
  });
});
