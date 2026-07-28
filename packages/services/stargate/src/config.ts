export type StargateConfig = {
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
  if (
    (secondary && secondary.id === primary.id) ||
    (secondary && secondary.secret === primary.secret)
  ) {
    throw new Error("refresh HMAC key ids and secrets must be distinct");
  }
  const testCaptcha = environment.CAPTCHA_TEST_MODE === "true";
  if (testCaptcha && environment.NODE_ENV === "production") {
    throw new Error("CAPTCHA_TEST_MODE cannot be enabled in production");
  }
  return {
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
    captchaHmacSecret: required(environment, "CAPTCHA_HMAC_SECRET"),
    captchaTtlSeconds: positiveInteger(
      environment,
      "CAPTCHA_TTL_SECONDS",
      "300"
    ),
    jwtSecret: required(environment, "STARGATE_JWT_SECRET"),
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
    tokenTtlSeconds: positiveInteger(
      environment,
      "ACCESS_TOKEN_TTL_SECONDS",
      "3600"
    ),
  };
}
