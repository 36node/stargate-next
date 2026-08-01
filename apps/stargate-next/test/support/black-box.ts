let usernameSequence = 0;

export function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for black-box tests`);
  }
  return value;
}

export async function request(
  path: string,
  method: string,
  options: {
    accessToken?: string;
    apiKey?: string;
    authorization?: string;
    body?: unknown;
    forwardedFor?: string;
    service?: boolean;
  } = {}
) {
  const {
    accessToken,
    apiKey,
    authorization,
    body,
    forwardedFor,
    service = false,
  } = options;
  const serviceApiKey =
    apiKey === undefined && service ? env("STARGATE_API_KEY") : apiKey;
  let authorizationHeader: string | undefined;
  if (authorization !== undefined) {
    authorizationHeader = authorization;
  } else if (accessToken) {
    authorizationHeader = `Bearer ${accessToken}`;
  }
  const response = await fetch(`${env("STARGATE_ENDPOINT")}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(serviceApiKey === undefined ? {} : { "x-api-key": serviceApiKey }),
      ...(authorizationHeader !== undefined
        ? { authorization: authorizationHeader }
        : {}),
      ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
    },
    method,
  });
  return {
    body: response.status === 204 ? undefined : await response.json(),
    status: response.status,
  };
}

export async function login(
  loginValue: string,
  password: string,
  forwardedFor?: string
) {
  const captcha = await request("/v1/captchas", "POST", { forwardedFor });
  if (captcha.status !== 201) {
    throw new Error(`captcha creation failed with status ${captcha.status}`);
  }
  return request("/v1/auth/login", "POST", {
    body: {
      captchaCode: env("CAPTCHA_TEST_CODE").trim().toUpperCase(),
      captchaId: (captcha.body as { id: string }).id,
      login: loginValue,
      password,
    },
    forwardedFor,
  });
}

export function uniqueUsername(): string {
  usernameSequence += 1;
  return `acct${Date.now().toString(36)}${usernameSequence.toString(36)}`;
}
