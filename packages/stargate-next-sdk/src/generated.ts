import createClient from "openapi-fetch";

import type { components, paths } from "./openapi";

export type Account = components["schemas"]["Account"];
export type AccountCollection = components["schemas"]["AccountCollection"];
export type AuthTokens = components["schemas"]["AuthTokens"];
export type Captcha =
  components["responses"]["Captcha"]["content"]["application/json"];
export type CreateAccountInput = components["schemas"]["CreateAccountInput"];
export type CreatedTenantApiKey =
  components["schemas"]["CreatedTenantApiKey"];
export type CreateTenantInput = components["schemas"]["CreateTenantInput"];
export type ErrorCode = components["schemas"]["ErrorCode"];
export type PatchAccountInput = components["schemas"]["PatchAccountInput"];
export type PatchTenantInput = components["schemas"]["PatchTenantInput"];
export type SelfChangePasswordInput =
  components["schemas"]["SelfChangePasswordInput"];
export type Session = components["schemas"]["Session"];
export type Tenant = components["schemas"]["Tenant"];
export type TenantApiKey = components["schemas"]["TenantApiKey"];
export type TenantApiKeyCollection =
  components["schemas"]["TenantApiKeyCollection"];
export type TenantCollection = components["schemas"]["TenantCollection"];

export function createStargateNextClient(
  baseUrl: string,
  apiKey?: string,
  fetchImpl?: typeof fetch
) {
  return createClient<paths>({
    baseUrl: baseUrl.replace(/\/$/, ""),
    fetch: fetchImpl,
    headers: apiKey ? { "x-api-key": apiKey } : undefined,
  });
}

export class StargateApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

type RequestOptions = {
  accessToken?: string;
  apiKey?: boolean;
  body?: unknown;
  tenantId?: string;
  tenantScoped: boolean;
};

export class StargateNextClient {
  constructor(
    private readonly baseUrl: string,
    private readonly options: {
      apiKey?: string;
      fetch?: typeof fetch;
      tenantId?: string;
    } = {}
  ) {}

  private async request<T>(
    path: string,
    method: string,
    options: RequestOptions
  ): Promise<T> {
    const tenantId = options.tenantScoped
      ? (options.tenantId ?? this.options.tenantId)
      : undefined;
    const response = await (this.options.fetch ?? fetch)(
      `${this.baseUrl.replace(/\/$/, "")}${path}`,
      {
        body:
          options.body === undefined
            ? undefined
            : JSON.stringify(options.body),
        headers: {
          ...(options.body === undefined
            ? {}
            : { "content-type": "application/json" }),
          ...(options.apiKey && this.options.apiKey
            ? { "x-api-key": this.options.apiKey }
            : {}),
          ...(options.accessToken
            ? { authorization: `Bearer ${options.accessToken}` }
            : {}),
          ...(tenantId ? { "x-tenant-id": tenantId } : {}),
        },
        method,
      }
    );
    if (response.status === 204) {
      return undefined as T;
    }
    const data = (await response.json()) as {
      code?: string;
      message?: string;
    };
    if (!response.ok) {
      throw new StargateApiError(
        data.code ?? "REQUEST_FAILED",
        response.status,
        data.message ?? response.statusText
      );
    }
    return data as T;
  }

  createCaptcha(tenantId?: string) {
    return this.request<Captcha>("/v1/captchas", "POST", {
      tenantId,
      tenantScoped: true,
    });
  }

  verifyCaptcha(id: string, code: string, tenantId?: string) {
    return this.request<{ verified: boolean }>(
      "/v1/captchas/verify",
      "POST",
      { body: { code, id }, tenantId, tenantScoped: true }
    );
  }

  login(
    login: string,
    password: string,
    captchaId: string,
    captchaCode: string,
    tenantId?: string
  ) {
    return this.request<AuthTokens>("/v1/auth/login", "POST", {
      body: { captchaCode, captchaId, login, password },
      tenantId,
      tenantScoped: true,
    });
  }

  refresh(refreshKey: string, tenantId?: string) {
    return this.request<AuthTokens>("/v1/auth/refresh", "POST", {
      body: { refreshKey },
      tenantId,
      tenantScoped: true,
    });
  }

  logout(accessToken: string, tenantId?: string) {
    return this.request<void>("/v1/auth/logout", "POST", {
      accessToken,
      tenantId,
      tenantScoped: true,
    });
  }

  selfChangePassword(
    accessToken: string,
    currentPassword: string,
    newPassword: string,
    tenantId?: string
  ) {
    return this.request<void>("/v1/auth/password", "POST", {
      accessToken,
      body: { currentPassword, newPassword },
      tenantId,
      tenantScoped: true,
    });
  }

  live() {
    return this.request<{ status: string }>("/health/live", "GET", {
      tenantScoped: false,
    });
  }

  ready() {
    return this.request<{ status: string }>("/health/ready", "GET", {
      tenantScoped: false,
    });
  }

  createAccount(input: CreateAccountInput, tenantId?: string) {
    return this.request<Account>("/v1/accounts", "POST", {
      apiKey: true,
      body: input,
      tenantId,
      tenantScoped: true,
    });
  }

  listAccounts(offset = 0, limit = 10, tenantId?: string) {
    return this.request<AccountCollection>(
      `/v1/accounts?page[offset]=${offset}&page[limit]=${limit}`,
      "GET",
      { apiKey: true, tenantId, tenantScoped: true }
    );
  }

  getAccount(accountId: string, tenantId?: string) {
    return this.request<Account>(
      `/v1/accounts/${encodeURIComponent(accountId)}`,
      "GET",
      { apiKey: true, tenantId, tenantScoped: true }
    );
  }

  batchGetAccounts(accountIds: string[], tenantId?: string) {
    return this.request<Account[]>("/v1/accounts/@batchGet", "POST", {
      apiKey: true,
      body: { accountIds },
      tenantId,
      tenantScoped: true,
    });
  }

  patchAccount(
    accountId: string,
    input: PatchAccountInput,
    tenantId?: string
  ) {
    return this.request<Account>(
      `/v1/accounts/${encodeURIComponent(accountId)}`,
      "PATCH",
      { apiKey: true, body: input, tenantId, tenantScoped: true }
    );
  }

  deleteAccount(accountId: string, tenantId?: string) {
    return this.request<void>(
      `/v1/accounts/${encodeURIComponent(accountId)}`,
      "DELETE",
      { apiKey: true, tenantId, tenantScoped: true }
    );
  }

  changePassword(accountId: string, password: string, tenantId?: string) {
    return this.request<void>(
      `/v1/accounts/${encodeURIComponent(accountId)}/password`,
      "POST",
      {
        apiKey: true,
        body: { password },
        tenantId,
        tenantScoped: true,
      }
    );
  }

  listSessions(accountId: string, tenantId?: string) {
    return this.request<Session[]>(
      `/v1/accounts/${encodeURIComponent(accountId)}/sessions`,
      "GET",
      { apiKey: true, tenantId, tenantScoped: true }
    );
  }

  revokeSessions(accountId: string, sessionId?: string, tenantId?: string) {
    const query = sessionId
      ? `?sessionId=${encodeURIComponent(sessionId)}`
      : "";
    return this.request<void>(
      `/v1/accounts/${encodeURIComponent(accountId)}/sessions${query}`,
      "DELETE",
      { apiKey: true, tenantId, tenantScoped: true }
    );
  }

  createTenant(input: CreateTenantInput) {
    return this.request<Tenant>("/v1/tenants", "POST", {
      apiKey: true,
      body: input,
      tenantScoped: false,
    });
  }

  listTenants(offset = 0, limit = 10, name?: string) {
    const filter =
      name === undefined ? "" : `&filter[name]=${encodeURIComponent(name)}`;
    return this.request<TenantCollection>(
      `/v1/tenants?page[offset]=${offset}&page[limit]=${limit}${filter}`,
      "GET",
      { apiKey: true, tenantScoped: false }
    );
  }

  getTenant(tenantId: string) {
    return this.request<Tenant>(
      `/v1/tenants/${encodeURIComponent(tenantId)}`,
      "GET",
      { apiKey: true, tenantScoped: false }
    );
  }

  patchTenant(tenantId: string, input: PatchTenantInput) {
    return this.request<Tenant>(
      `/v1/tenants/${encodeURIComponent(tenantId)}`,
      "PATCH",
      { apiKey: true, body: input, tenantScoped: false }
    );
  }

  createTenantApiKey(input: { name?: string | null } = {}, tenantId?: string) {
    return this.request<CreatedTenantApiKey>(
      "/v1/tenant-api-keys",
      "POST",
      { apiKey: true, body: input, tenantId, tenantScoped: true }
    );
  }

  listTenantApiKeys(offset = 0, limit = 10, tenantId?: string) {
    return this.request<TenantApiKeyCollection>(
      `/v1/tenant-api-keys?page[offset]=${offset}&page[limit]=${limit}`,
      "GET",
      { apiKey: true, tenantId, tenantScoped: true }
    );
  }

  patchTenantApiKey(keyId: string, name: string | null, tenantId?: string) {
    return this.request<TenantApiKey>(
      `/v1/tenant-api-keys/${encodeURIComponent(keyId)}`,
      "PATCH",
      {
        apiKey: true,
        body: { name },
        tenantId,
        tenantScoped: true,
      }
    );
  }

  deleteTenantApiKey(keyId: string, tenantId?: string) {
    return this.request<void>(
      `/v1/tenant-api-keys/${encodeURIComponent(keyId)}`,
      "DELETE",
      { apiKey: true, tenantId, tenantScoped: true }
    );
  }
}
