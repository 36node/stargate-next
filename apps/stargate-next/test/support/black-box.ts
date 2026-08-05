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
    adminKey?: boolean;
    apiKey?: string;
    authorization?: string;
    body?: unknown;
    forwardedFor?: string;
    service?: boolean;
    tenantId?: string;
    tenantIdHeader?: string | null;
  } = {}
) {
  const {
    accessToken,
    adminKey = false,
    apiKey,
    authorization,
    body,
    forwardedFor,
    service = false,
    tenantId,
    tenantIdHeader,
  } = options;
  let resolvedApiKey = apiKey;
  if (resolvedApiKey === undefined && adminKey) {
    resolvedApiKey = env("STARGATE_ADMIN_API_KEY");
  } else if (resolvedApiKey === undefined && service) {
    resolvedApiKey = env("STARGATE_API_KEY");
  }
  const resolvedTenantHeader =
    tenantIdHeader === undefined ? tenantId : (tenantIdHeader ?? "");
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
      ...(resolvedApiKey === undefined ? {} : { "x-api-key": resolvedApiKey }),
      ...(authorizationHeader !== undefined
        ? { authorization: authorizationHeader }
        : {}),
      ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
      ...(resolvedTenantHeader === undefined
        ? {}
        : { "x-tenant-id": resolvedTenantHeader }),
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
  forwardedFor?: string,
  tenantId?: string
) {
  const captcha = await request("/v1/captchas", "POST", {
    forwardedFor,
    tenantId,
  });
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
    tenantId,
  });
}

export function uniqueUsername(): string {
  usernameSequence += 1;
  return `acct${Date.now().toString(36)}${usernameSequence.toString(36)}`;
}
