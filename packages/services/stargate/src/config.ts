const CAPTCHA_TEST_CODE_PATTERN = /^[A-Z0-9]{4}$/;
const NON_NEGATIVE_DECIMAL = /^(0|[1-9][0-9]*)$/;

export type StargateConfig = {
  accountCreateIdempotencyTtlSeconds: number;
  apiKey: string;
  captchaAttempts: number;
  captchaCreateLimit: number;
  captchaCreateWindowSeconds: number;
  captchaHmacSecret: string;
  captchaTestCode?: string;
  captchaTtlSeconds: number;
  clockToleranceSeconds: number;
  jwtSecret: string;
  loginAttempts: number;
  loginLockSeconds: number;
  primary: { id: string; secret: string };
  redisKeyPrefix: string;
  refreshTtlSeconds: number;
  secondary?: { id: string; secret: string };
  testCaptcha: boolean;
  tokenTtlSeconds: number;
};

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (!value) {
    throw new Error(`${name} must be configured`);
  }
  return value;
}

function positiveInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: string
): number {
  const value = Number(environment[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function nonNegativeInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: string
): number {
  const raw = environment[name];
  const candidate = raw === undefined ? fallback : raw;
  if (!NON_NEGATIVE_DECIMAL.test(candidate)) {
    throw new Error(`${name} must be a decimal non-negative integer`);
  }
  const value = Number(candidate);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a safe integer`);
  }
  return value;
}

function optionalPair(
  environment: NodeJS.ProcessEnv,
  firstName: string,
  secondName: string
): { id: string; secret: string } | undefined {
  const id = environment[firstName];
  const secret = environment[secondName];
  if (Boolean(id) !== Boolean(secret)) {
    throw new Error(
      `${firstName} and ${secondName} must be configured together`
    );
  }
  return id && secret ? { id, secret } : undefined;
}

function assertDistinctSecrets(secrets: [string, string][]): void {
  for (let first = 0; first < secrets.length; first += 1) {
    for (let second = first + 1; second < secrets.length; second += 1) {
      const [firstName, firstValue] = secrets[first] as [string, string];
      const [secondName, secondValue] = secrets[second] as [string, string];
      if (firstValue === secondValue) {
        throw new Error(
          `${firstName} and ${secondName} must not share the same value`
        );
      }
    }
  }
}

export function loadStargateConfig(
  environment: NodeJS.ProcessEnv = process.env
): StargateConfig {
  const primary = {
    id: required(environment, "REFRESH_KEY_HMAC_PRIMARY_KEY_ID"),
    secret: required(environment, "REFRESH_KEY_HMAC_PRIMARY_SECRET"),
  };
  const secondary = optionalPair(
    environment,
    "REFRESH_KEY_HMAC_SECONDARY_KEY_ID",
    "REFRESH_KEY_HMAC_SECONDARY_SECRET"
  );
  if (secondary && secondary.id === primary.id) {
    throw new Error("refresh HMAC key ids must be distinct");
  }
  const testCaptcha = environment.CAPTCHA_TEST_MODE === "true";
  if (testCaptcha && environment.NODE_ENV === "production") {
    throw new Error("CAPTCHA_TEST_MODE cannot be enabled in production");
  }
  const captchaTestCode = testCaptcha
    ? required(environment, "CAPTCHA_TEST_CODE").trim().toUpperCase()
    : undefined;
  if (captchaTestCode && !CAPTCHA_TEST_CODE_PATTERN.test(captchaTestCode)) {
    throw new Error(
      "CAPTCHA_TEST_CODE must contain exactly 4 ASCII letters or digits"
    );
  }
  const captchaHmacSecret = required(environment, "CAPTCHA_HMAC_SECRET");
  const jwtSecret = required(environment, "STARGATE_JWT_SECRET");
  const tokenTtlSeconds = positiveInteger(
    environment,
    "ACCESS_TOKEN_TTL_SECONDS",
    "3600"
  );
  const clockToleranceSeconds = nonNegativeInteger(
    environment,
    "JWT_CLOCK_TOLERANCE_SECONDS",
    "30"
  );
  if (clockToleranceSeconds * 2 > tokenTtlSeconds) {
    throw new Error(
      "JWT_CLOCK_TOLERANCE_SECONDS must not exceed half of ACCESS_TOKEN_TTL_SECONDS"
    );
  }
  const secrets: [string, string][] = [
    ["CAPTCHA_HMAC_SECRET", captchaHmacSecret],
    ["STARGATE_JWT_SECRET", jwtSecret],
    ["REFRESH_KEY_HMAC_PRIMARY_SECRET", primary.secret],
  ];
  if (secondary) {
    secrets.push(["REFRESH_KEY_HMAC_SECONDARY_SECRET", secondary.secret]);
  }
  assertDistinctSecrets(secrets);
  return {
    accountCreateIdempotencyTtlSeconds: positiveInteger(
      environment,
      "ACCOUNT_CREATE_IDEMPOTENCY_TTL_SECONDS",
      "3600"
    ),
    apiKey: required(environment, "STARGATE_API_KEY"),
    captchaAttempts: positiveInteger(environment, "CAPTCHA_MAX_ATTEMPTS", "5"),
    captchaCreateLimit: positiveInteger(
      environment,
      "CAPTCHA_CREATE_LIMIT",
      "30"
    ),
    captchaCreateWindowSeconds: positiveInteger(
      environment,
      "CAPTCHA_CREATE_WINDOW_SECONDS",
      "60"
    ),
    captchaHmacSecret,
    captchaTestCode,
    captchaTtlSeconds: positiveInteger(
      environment,
      "CAPTCHA_TTL_SECONDS",
      "300"
    ),
    clockToleranceSeconds,
    jwtSecret,
    loginAttempts: positiveInteger(environment, "LOGIN_MAX_ATTEMPTS", "5"),
    loginLockSeconds: positiveInteger(environment, "LOGIN_LOCK_SECONDS", "60"),
    primary,
    redisKeyPrefix: environment.REDIS_KEY_PREFIX ?? "stargate-next:",
    refreshTtlSeconds: positiveInteger(
      environment,
      "REFRESH_TTL_SECONDS",
      "604800"
    ),
    secondary,
    testCaptcha,
    tokenTtlSeconds,
  };
}
