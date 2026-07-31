import createClient from "openapi-fetch";

import type { components, paths } from "./openapi";

export type Account = components["schemas"]["Account"];
export type AuthTokens = components["schemas"]["AuthTokens"];
export type CreateAccountInput = components["schemas"]["CreateAccountInput"];
export type ErrorCode = components["schemas"]["ErrorCode"];
export type PatchAccountInput = components["schemas"]["PatchAccountInput"];
export type AccountCollection = components["schemas"]["AccountCollection"];
export type Captcha =
  components["responses"]["Captcha"]["content"]["application/json"];
export type Session = components["schemas"]["Session"];

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

export class StargateNextClient {
  constructor(
    private readonly baseUrl: string,
    private readonly options: { apiKey?: string; fetch?: typeof fetch } = {}
  ) {}

  private async request<T>(
    path: string,
    method: string,
    body?: unknown,
    apiKey = false,
    accessToken?: string
  ): Promise<T> {
    const response = await (this.options.fetch ?? fetch)(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(apiKey && this.options.apiKey ? { "x-api-key": this.options.apiKey } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      method,
    });
    if (response.status === 204) return undefined as T;
    const data = (await response.json()) as { code?: string; message?: string };
    if (!response.ok) throw new StargateApiError(data.code ?? "REQUEST_FAILED", response.status, data.message ?? response.statusText);
    return data as T;
  }

  createCaptcha() { return this.request<Captcha>("/v1/captchas", "POST"); }
  verifyCaptcha(id: string, code: string) { return this.request<{ verified: boolean }>("/v1/captchas/verify", "POST", { code, id }); }
  login(login: string, password: string, captchaId: string, captchaCode: string) { return this.request<AuthTokens>("/v1/auth/login", "POST", { captchaCode, captchaId, login, password }); }
  refresh(refreshKey: string) { return this.request<AuthTokens>("/v1/auth/refresh", "POST", { refreshKey }); }
  logout(accessToken: string) { return this.request<void>("/v1/auth/logout", "POST", undefined, false, accessToken); }
  live() { return this.request<{ status: string }>("/health/live", "GET"); }
  ready() { return this.request<{ status: string }>("/health/ready", "GET"); }
  createAccount(input: CreateAccountInput) { return this.request<Account>("/v1/accounts", "POST", input, true); }
  listAccounts(offset = 0, limit = 10) {
    return this.request<AccountCollection>(
      `/v1/accounts?page[offset]=${offset}&page[limit]=${limit}`,
      "GET",
      undefined,
      true
    );
  }
  getAccount(accountId: string) { return this.request<Account>(`/v1/accounts/${encodeURIComponent(accountId)}`, "GET", undefined, true); }
  batchGetAccounts(accountIds: string[]) { return this.request<Account[]>("/v1/accounts/@batchGet", "POST", { accountIds }, true); }
  patchAccount(accountId: string, input: PatchAccountInput) { return this.request<Account>(`/v1/accounts/${encodeURIComponent(accountId)}`, "PATCH", input, true); }
  deleteAccount(accountId: string) { return this.request<void>(`/v1/accounts/${encodeURIComponent(accountId)}`, "DELETE", undefined, true); }
  changePassword(accountId: string, password: string) { return this.request<void>(`/v1/accounts/${encodeURIComponent(accountId)}/password`, "POST", { password }, true); }
  listSessions(accountId: string) {
    return this.request<Session[]>(
      `/v1/accounts/${encodeURIComponent(accountId)}/sessions`,
      "GET",
      undefined,
      true
    );
  }
  revokeSessions(accountId: string, sessionId?: string) {
    const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
    return this.request<void>(`/v1/accounts/${encodeURIComponent(accountId)}/sessions${query}`, "DELETE", undefined, true);
  }
}
