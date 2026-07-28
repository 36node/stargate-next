export type AuthConfig = {
  apiKey: string;
  captchaAttempts: number;
  captchaCreateLimit: number;
  captchaCreateWindowSeconds: number;
  captchaHmacSecret: string;
  captchaTtlSeconds: number;
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

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be configured`);
  }
  return value;
}

function positiveInteger(name: string, fallback: string): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function optionalPair(
  firstName: string,
  secondName: string
): { id: string; secret: string } | undefined {
  const id = process.env[firstName];
  const secret = process.env[secondName];
  if (Boolean(id) !== Boolean(secret)) {
    throw new Error(
      `${firstName} and ${secondName} must be configured together`
    );
  }
  return id && secret ? { id, secret } : undefined;
}

export function loadAuthConfig(): AuthConfig {
  const primary = {
    id: required("REFRESH_KEY_HMAC_PRIMARY_KEY_ID"),
    secret: required("REFRESH_KEY_HMAC_PRIMARY_SECRET"),
  };
  const secondary = optionalPair(
    "REFRESH_KEY_HMAC_SECONDARY_KEY_ID",
    "REFRESH_KEY_HMAC_SECONDARY_SECRET"
  );
  if (
    (secondary && secondary.id === primary.id) ||
    (secondary && secondary.secret === primary.secret)
  ) {
    throw new Error("refresh HMAC key ids and secrets must be distinct");
  }

  const testCaptcha = process.env.CAPTCHA_TEST_MODE === "true";
  if (testCaptcha && process.env.NODE_ENV === "production") {
    throw new Error("CAPTCHA_TEST_MODE cannot be enabled in production");
  }

  return {
    apiKey: required("STARGATE_API_KEY"),
    captchaAttempts: positiveInteger("CAPTCHA_MAX_ATTEMPTS", "5"),
    captchaCreateLimit: positiveInteger("CAPTCHA_CREATE_LIMIT", "30"),
    captchaCreateWindowSeconds: positiveInteger(
      "CAPTCHA_CREATE_WINDOW_SECONDS",
      "60"
    ),
    captchaHmacSecret: required("CAPTCHA_HMAC_SECRET"),
    captchaTtlSeconds: positiveInteger("CAPTCHA_TTL_SECONDS", "300"),
    jwtSecret: required("STARGATE_JWT_SECRET"),
    loginAttempts: positiveInteger("LOGIN_MAX_ATTEMPTS", "5"),
    loginLockSeconds: positiveInteger("LOGIN_LOCK_SECONDS", "60"),
    primary,
    redisKeyPrefix: process.env.REDIS_KEY_PREFIX ?? "stargate-next:",
    refreshTtlSeconds: positiveInteger("REFRESH_TTL_SECONDS", "604800"),
    secondary,
    testCaptcha,
    tokenTtlSeconds: positiveInteger("ACCESS_TOKEN_TTL_SECONDS", "3600"),
  };
}
