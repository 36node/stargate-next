/** 运行中 Stargate Next 的认证 HTTP 契约黑盒回归。 */
import { createHmac, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { env, request, uniqueUsername } from "./support/black-box.js";

type ErrorBody = { code: string; message: string };
type Tokens = {
  accessToken: string;
  accessTokenExpiresAt: string;
  accountId: string;
  refreshKey: string;
  sessionId: string;
  tenantId: string;
};

const captchaCode = env("CAPTCHA_TEST_CODE").trim().toUpperCase();
const passwordChangeAttempts = positiveIntegerEnv(
  "PASSWORD_CHANGE_MAX_ATTEMPTS"
);
const passwordChangeLockSeconds = positiveIntegerEnv(
  "PASSWORD_CHANGE_LOCK_SECONDS"
);
const passwordChangePollBudgetMs = passwordChangeLockSeconds * 1000 + 5000;
const passwordChangeThresholdCodes = Array.from(
  { length: passwordChangeAttempts },
  (_, index) =>
    index === passwordChangeAttempts - 1
      ? "PASSWORD_CHANGE_LOCKED"
      : "CURRENT_PASSWORD_INVALID"
);
const SENSITIVE_SESSION_PATTERN = /refreshKey|hash/i;
const SELF_CHANGE_MISMATCH_TENANT_ID = "self-change-mismatch";
const serviceApiKey = env("STARGATE_API_KEY");
const wrongApiKey = `${serviceApiKey[0] === "x" ? "y" : "x"}${serviceApiKey.slice(1)}`;
const selfChangeIpNamespace = randomBytes(2).toString("hex");
let selfChangeIpSequence = 0;

function positiveIntegerEnv(name: string): number {
  const value = Number(env(name));
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer for black-box tests`);
  }
  return value;
}

function nextSelfChangeIp(): string {
  selfChangeIpSequence += 1;
  return `2001:db8:${selfChangeIpNamespace}::${selfChangeIpSequence}`;
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function mintToken(
  tokenClaims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "HS256", typ: "JWT" },
  secret = env("STARGATE_JWT_SECRET")
) {
  const encoded = `${encodeJson(header)}.${encodeJson(tokenClaims)}`;
  return `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}

function claims(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    exp: now + 3600,
    iat: now,
    sid: `session-${now}`,
    sub: `account-${now}`,
    type: "access",
    ...overrides,
  };
}

function authorizationFor(token: string | undefined): string | undefined {
  if (token === undefined) {
    return;
  }
  if (token === "") {
    return "Bearer";
  }
  return `Bearer ${token}`;
}

async function createAccount(password: string) {
  const username = uniqueUsername();
  const response = await request("/v1/accounts", "POST", {
    body: {
      idempotencyKey: `auth-api-${username}`,
      password,
      username,
    },
    service: true,
  });
  // biome-ignore lint/suspicious/noMisplacedAssertion: 此 helper 只在测试用例中调用。
  expect(response.status).toBe(201);
  return response.body as { id: string; username: string };
}

async function loginAccount(
  username: string,
  password: string,
  forwardedFor: string
) {
  const captcha = await request("/v1/captchas", "POST", { forwardedFor });
  return request("/v1/auth/login", "POST", {
    body: {
      captchaCode,
      captchaId: (captcha.body as { id: string }).id,
      login: username,
      password,
    },
    forwardedFor,
  });
}

function expectError(
  response: { body: unknown; status: number },
  status: number,
  code: string
) {
  // biome-ignore lint/suspicious/noMisplacedAssertion: 此 helper 只在测试用例中调用。
  expect(response.status).toBe(status);
  // biome-ignore lint/suspicious/noMisplacedAssertion: 此 helper 只在测试用例中调用。
  expect(response.body).toMatchObject({ code });
}

describe("authentication API", () => {
  it("changes a password while preserving only the current session", async () => {
    const account = await createAccount("api-self-change-password");
    const currentLogin = await loginAccount(
      account.username,
      "api-self-change-password",
      nextSelfChangeIp()
    );
    const otherLogin = await loginAccount(
      account.username,
      "api-self-change-password",
      nextSelfChangeIp()
    );
    const current = currentLogin.body as Tokens;
    const other = otherLogin.body as Tokens;

    expect(
      (
        await request("/v1/auth/password", "POST", {
          accessToken: current.accessToken,
          body: {
            currentPassword: "api-self-change-password",
            newPassword: "api-self-change-new-password",
          },
        })
      ).status
    ).toBe(204);
    expect(
      (
        await request("/v1/auth/refresh", "POST", {
          body: { refreshKey: current.refreshKey },
          forwardedFor: nextSelfChangeIp(),
        })
      ).status
    ).toBe(200);
    expectError(
      await request("/v1/auth/refresh", "POST", {
        body: { refreshKey: other.refreshKey },
        forwardedFor: nextSelfChangeIp(),
      }),
      401,
      "REFRESH_INVALID"
    );
    expectError(
      await loginAccount(
        account.username,
        "api-self-change-password",
        nextSelfChangeIp()
      ),
      401,
      "LOGIN_INVALID"
    );
    expect(
      (
        await loginAccount(
          account.username,
          "api-self-change-new-password",
          nextSelfChangeIp()
        )
      ).status
    ).toBe(200);
  });

  it("requires Bearer auth and rejects Tenant mismatch without side effects", async () => {
    const password = "api-self-change-auth-password";
    const account = await createAccount(password);
    const loggedIn = await loginAccount(
      account.username,
      password,
      nextSelfChangeIp()
    );
    const tokens = loggedIn.body as Tokens;
    const body = {
      currentPassword: password,
      newPassword: "api-self-change-auth-new-password",
    };

    expectError(
      await request("/v1/auth/password", "POST", { body }),
      401,
      "ACCESS_TOKEN_INVALID"
    );
    expectError(
      await request("/v1/auth/password", "POST", {
        body,
        service: true,
      }),
      401,
      "ACCESS_TOKEN_INVALID"
    );
    const forged = `${tokens.accessToken.slice(0, -1)}${tokens.accessToken.endsWith("a") ? "b" : "a"}`;
    expectError(
      await request("/v1/auth/password", "POST", {
        accessToken: forged,
        body,
      }),
      401,
      "ACCESS_TOKEN_INVALID"
    );

    const tenantCreation = await request("/v1/tenants", "POST", {
      adminKey: true,
      body: {
        id: SELF_CHANGE_MISMATCH_TENANT_ID,
        name: "Self-change mismatch tenant",
      },
    });
    if (tenantCreation.status !== 201) {
      expectError(tenantCreation, 409, "TENANT_ALREADY_EXISTS");
    }
    expect(
      (
        await request(
          `/v1/tenants/${SELF_CHANGE_MISMATCH_TENANT_ID}`,
          "PATCH",
          {
            adminKey: true,
            body: { status: "active" },
          }
        )
      ).status
    ).toBe(200);
    expectError(
      await request("/v1/auth/password", "POST", {
        accessToken: tokens.accessToken,
        body,
        tenantIdHeader: SELF_CHANGE_MISMATCH_TENANT_ID,
      }),
      401,
      "ACCESS_TOKEN_INVALID"
    );
    expect(
      (await loginAccount(account.username, password, nextSelfChangeIp()))
        .status
    ).toBe(200);
    expect(
      (
        await request("/v1/auth/refresh", "POST", {
          body: { refreshKey: tokens.refreshKey },
          forwardedFor: nextSelfChangeIp(),
        })
      ).status
    ).toBe(200);

    const thresholdCodes: string[] = [];
    for (let attempt = 0; attempt < passwordChangeAttempts; attempt += 1) {
      const response = await request("/v1/auth/password", "POST", {
        accessToken: tokens.accessToken,
        body: {
          currentPassword: "wrong-password",
          newPassword: "unused-password",
        },
      });
      thresholdCodes.push((response.body as ErrorBody).code);
    }
    expect(thresholdCodes).toEqual(passwordChangeThresholdCodes);
  });

  it("checks lock state before every body shape", async () => {
    const bodies: unknown[] = [
      undefined,
      null,
      [],
      {},
      {
        currentPassword: "locked-body-password",
        newPassword: "locked-body-new-password",
      },
    ];

    for (const targetBody of bodies) {
      const account = await createAccount("locked-body-password");
      const loggedIn = await loginAccount(
        account.username,
        "locked-body-password",
        nextSelfChangeIp()
      );
      const tokens = loggedIn.body as Tokens;
      for (const [
        attempt,
        expectedCode,
      ] of passwordChangeThresholdCodes.entries()) {
        const response = await request("/v1/auth/password", "POST", {
          accessToken: tokens.accessToken,
          body: {
            currentPassword: `wrong-password-${attempt}`,
            newPassword: "unused-password",
          },
        });
        expectError(
          response,
          expectedCode === "PASSWORD_CHANGE_LOCKED" ? 429 : 401,
          expectedCode
        );
      }
      const options =
        targetBody === undefined
          ? { accessToken: tokens.accessToken }
          : { accessToken: tokens.accessToken, body: targetBody };
      expectError(
        await request("/v1/auth/password", "POST", options),
        429,
        "PASSWORD_CHANGE_LOCKED"
      );
    }
  });

  it("rejects unlocked invalid bodies and target-field injection without counting", async () => {
    const invalidBodies: unknown[] = [undefined, null, [], {}];
    for (const targetBody of invalidBodies) {
      const account = await createAccount("unlocked-body-password");
      const loggedIn = await loginAccount(
        account.username,
        "unlocked-body-password",
        nextSelfChangeIp()
      );
      const tokens = loggedIn.body as Tokens;
      const options =
        targetBody === undefined
          ? { accessToken: tokens.accessToken }
          : { accessToken: tokens.accessToken, body: targetBody };
      expectError(
        await request("/v1/auth/password", "POST", options),
        400,
        "PASSWORD_INVALID"
      );
      expect(
        (
          await request("/v1/auth/password", "POST", {
            accessToken: tokens.accessToken,
            body: {
              currentPassword: "unlocked-body-password",
              newPassword: "unlocked-body-new-password",
            },
          })
        ).status
      ).toBe(204);
    }

    const victim = await createAccount("injection-victim-password");
    const victimLogin = await loginAccount(
      victim.username,
      "injection-victim-password",
      nextSelfChangeIp()
    );
    const victimTokens = victimLogin.body as Tokens;
    const attacker = await createAccount("injection-attacker-password");
    const attackerLogin = await loginAccount(
      attacker.username,
      "injection-attacker-password",
      nextSelfChangeIp()
    );
    const attackerTokens = attackerLogin.body as Tokens;
    for (const [field, value] of [
      ["accountId", victim.id],
      ["tenantId", "default"],
      ["sessionId", victimTokens.sessionId],
    ] as const) {
      expectError(
        await request("/v1/auth/password", "POST", {
          accessToken: attackerTokens.accessToken,
          body: {
            currentPassword: "injection-attacker-password",
            newPassword: "injection-attacker-new-password",
            [field]: value,
          },
        }),
        400,
        "PASSWORD_INVALID"
      );
    }
    expect(
      (
        await loginAccount(
          victim.username,
          "injection-victim-password",
          nextSelfChangeIp()
        )
      ).status
    ).toBe(200);
    expect(
      (
        await request("/v1/auth/refresh", "POST", {
          body: { refreshKey: victimTokens.refreshKey },
          forwardedFor: nextSelfChangeIp(),
        })
      ).status
    ).toBe(200);
    expect(
      (
        await loginAccount(
          attacker.username,
          "injection-attacker-password",
          nextSelfChangeIp()
        )
      ).status
    ).toBe(200);
  });

  it(
    "recovers from password-change lock expiry using polling",
    async () => {
      const account = await createAccount("threshold-ttl-password");
      const loggedIn = await loginAccount(
        account.username,
        "threshold-ttl-password",
        nextSelfChangeIp()
      );
      const tokens = loggedIn.body as Tokens;
      for (const [
        attempt,
        expectedCode,
      ] of passwordChangeThresholdCodes.entries()) {
        const response = await request("/v1/auth/password", "POST", {
          accessToken: tokens.accessToken,
          body: {
            currentPassword: `wrong-password-${attempt}`,
            newPassword: "threshold-ttl-new-password",
          },
        });
        expectError(
          response,
          expectedCode === "PASSWORD_CHANGE_LOCKED" ? 429 : 401,
          expectedCode
        );
      }
      expectError(
        await request("/v1/auth/password", "POST", {
          accessToken: tokens.accessToken,
          body: {
            currentPassword: "threshold-ttl-password",
            newPassword: "threshold-ttl-new-password",
          },
        }),
        429,
        "PASSWORD_CHANGE_LOCKED"
      );
      expect(
        (
          await loginAccount(
            account.username,
            "threshold-ttl-password",
            nextSelfChangeIp()
          )
        ).status
      ).toBe(200);

      const startedAt = Date.now();
      let changed = false;
      while (Date.now() - startedAt < passwordChangePollBudgetMs) {
        const response = await request("/v1/auth/password", "POST", {
          accessToken: tokens.accessToken,
          body: {
            currentPassword: "threshold-ttl-password",
            newPassword: "threshold-ttl-new-password",
          },
        });
        if (response.status === 204) {
          changed = true;
          break;
        }
        expectError(response, 429, "PASSWORD_CHANGE_LOCKED");
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      expect(changed).toBe(true);
      expectError(
        await loginAccount(
          account.username,
          "threshold-ttl-password",
          nextSelfChangeIp()
        ),
        401,
        "LOGIN_INVALID"
      );
      expect(
        (
          await loginAccount(
            account.username,
            "threshold-ttl-new-password",
            nextSelfChangeIp()
          )
        ).status
      ).toBe(200);
    },
    passwordChangePollBudgetMs + 5000
  );

  it("rejects disabled and deleted accounts before body validation", async () => {
    for (const mode of ["disabled", "deleted"] as const) {
      const account = await createAccount(`${mode}-self-change-password`);
      const loggedIn = await loginAccount(
        account.username,
        `${mode}-self-change-password`,
        nextSelfChangeIp()
      );
      const tokens = loggedIn.body as Tokens;
      const response =
        mode === "disabled"
          ? await request(`/v1/accounts/${account.id}`, "PATCH", {
              body: { active: false },
              service: true,
            })
          : await request(`/v1/accounts/${account.id}`, "DELETE", {
              service: true,
            });
      expect([200, 204]).toContain(response.status);
      expectError(
        await request("/v1/auth/password", "POST", {
          accessToken: tokens.accessToken,
          body: null,
        }),
        401,
        "ACCESS_TOKEN_INVALID"
      );
    }
  });

  it("completes login, refresh, and logout with exact JWT contracts", async () => {
    const account = await createAccount("auth-loop-password");
    const login = await loginAccount(
      account.username,
      "auth-loop-password",
      "203.0.113.1"
    );
    expect(login.status).toBe(200);
    const tokens = login.body as Tokens;
    const [headerSegment, payloadSegment] = tokens.accessToken.split(".");
    const header = JSON.parse(
      Buffer.from(headerSegment ?? "", "base64url").toString("utf8")
    ) as Record<string, unknown>;
    const payload = JSON.parse(
      Buffer.from(payloadSegment ?? "", "base64url").toString("utf8")
    ) as Record<string, unknown>;
    expect(header).toEqual({ alg: "HS256", typ: "JWT" });
    expect(Object.keys(payload).sort()).toEqual([
      "exp",
      "iat",
      "sid",
      "sub",
      "tid",
      "type",
    ]);
    expect(payload.tid).toBe("default");
    expect(tokens.tenantId).toBe("default");
    expect(new Date(tokens.accessTokenExpiresAt).getTime() / 1000).toBe(
      payload.exp
    );

    const refresh = await request("/v1/auth/refresh", "POST", {
      body: { refreshKey: tokens.refreshKey },
      forwardedFor: "203.0.113.1",
    });
    expect(refresh.status).toBe(200);
    expect(refresh.body).toMatchObject({
      refreshKey: tokens.refreshKey,
      sessionId: tokens.sessionId,
    });
    expect(
      (
        await request("/v1/auth/logout", "POST", {
          accessToken: tokens.accessToken,
          forwardedFor: "203.0.113.1",
        })
      ).status
    ).toBe(204);
    expectError(
      await request("/v1/auth/refresh", "POST", {
        body: { refreshKey: tokens.refreshKey },
        forwardedFor: "203.0.113.1",
      }),
      401,
      "REFRESH_INVALID"
    );
  });

  it("returns one external error for malformed and invalid access tokens", async () => {
    const valid = mintToken(claims());
    const [header, payload, signature] = valid.split(".") as [
      string,
      string,
      string,
    ];
    const now = Math.floor(Date.now() / 1000);
    const tokens = [
      undefined,
      "",
      `${header}.${payload}`,
      `${header}.${payload}.${signature}.extra`,
      `${valid}=`,
      mintToken(claims(), { alg: "none", typ: "JWT" }),
      mintToken(claims(), undefined, "wrong-secret"),
      mintToken(claims({ roles: ["admin"] })),
      mintToken(claims({ exp: now - 3600, iat: now - 7200 })),
      mintToken(claims({ iat: now + 3600 })),
      mintToken(claims({ exp: now, iat: now })),
    ];
    const messages = new Set<string>();
    for (const token of tokens) {
      const response = await request("/v1/auth/logout", "POST", {
        authorization: authorizationFor(token),
        forwardedFor: "203.0.113.2",
      });
      expectError(response, 401, "ACCESS_TOKEN_INVALID");
      messages.add((response.body as ErrorBody).message);
    }
    expect(messages).toEqual(new Set(["access token is invalid"]));
  });

  it("honors tolerance without sleep and keeps logout idempotent", async () => {
    const now = Math.floor(Date.now() / 1000);
    const within = mintToken(
      claims({ exp: now - 20, iat: now - 100, sid: "within-session" })
    );
    const outside = mintToken(
      claims({ exp: now - 40, iat: now - 100, sid: "outside-session" })
    );
    expect(
      (
        await request("/v1/auth/logout", "POST", {
          accessToken: within,
          forwardedFor: "203.0.113.3",
        })
      ).status
    ).toBe(204);
    expect(
      (
        await request("/v1/auth/logout", "POST", {
          accessToken: within,
          forwardedFor: "203.0.113.3",
        })
      ).status
    ).toBe(204);
    expectError(
      await request("/v1/auth/logout", "POST", {
        accessToken: outside,
        forwardedFor: "203.0.113.3",
      }),
      401,
      "ACCESS_TOKEN_INVALID"
    );
  });

  it("returns explicit input codes and locks repeated credential failures", async () => {
    const missingFields = [
      [
        { password: "x", captchaId: "x", captchaCode: "ABCD" },
        "LOGIN_IDENTIFIER_INVALID",
      ],
      [{ login: "x", captchaId: "x", captchaCode: "ABCD" }, "PASSWORD_INVALID"],
      [
        { login: "x", password: "x", captchaCode: "ABCD" },
        "CAPTCHA_ID_INVALID",
      ],
      [{ login: "x", password: "x", captchaId: "x" }, "CAPTCHA_CODE_INVALID"],
    ] as const;
    for (const [body, code] of missingFields) {
      expectError(
        await request("/v1/auth/login", "POST", {
          body,
          forwardedFor: "203.0.113.4",
        }),
        400,
        code
      );
    }
    expectError(
      await request("/v1/auth/refresh", "POST", {
        body: {},
        forwardedFor: "203.0.113.4",
      }),
      400,
      "REFRESH_KEY_INVALID"
    );
    expectError(
      await request("/v1/captchas/verify", "POST", {
        body: { code: "ABCD" },
        forwardedFor: "203.0.113.4",
      }),
      400,
      "CAPTCHA_ID_INVALID"
    );
    expectError(
      await request("/v1/captchas/verify", "POST", {
        body: { id: "missing" },
        forwardedFor: "203.0.113.4",
      }),
      400,
      "CAPTCHA_CODE_INVALID"
    );
    expectError(
      await request("/v1/auth/login", "POST", {
        body: {
          captchaCode,
          captchaId: "missing",
          login: "captcha-only-missing",
          password: "wrong",
        },
        forwardedFor: "203.0.113.4",
      }),
      401,
      "CAPTCHA_INVALID"
    );

    const account = await createAccount("lock-password");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expectError(
        await loginAccount(account.username, "wrong", "203.0.113.4"),
        401,
        "LOGIN_INVALID"
      );
    }
    expectError(
      await loginAccount(account.username, "wrong", "203.0.113.4"),
      401,
      "LOGIN_LOCKED"
    );
  });

  it("keeps captcha rate limits isolated and fixed after overflow", async () => {
    for (let count = 0; count < 30; count += 1) {
      expect(
        (
          await request("/v1/captchas", "POST", {
            forwardedFor: "198.51.100.11",
          })
        ).status
      ).toBe(201);
    }
    expectError(
      await request("/v1/captchas", "POST", {
        forwardedFor: "198.51.100.11",
      }),
      429,
      "CAPTCHA_RATE_LIMITED"
    );
    expect(
      (
        await request("/v1/captchas", "POST", {
          forwardedFor: "203.0.113.6",
        })
      ).status
    ).toBe(201);
    for (let count = 0; count < 2; count += 1) {
      expectError(
        await request("/v1/captchas", "POST", {
          forwardedFor: "198.51.100.11",
        }),
        429,
        "CAPTCHA_RATE_LIMITED"
      );
    }
  });

  it("authorizes, scopes, and redacts public Session operations", async () => {
    const first = await createAccount("session-a-password");
    const second = await createAccount("session-b-password");
    const login = await loginAccount(
      first.username,
      "session-a-password",
      "203.0.113.5"
    );
    const tokens = login.body as Tokens;
    const listPath = `/v1/accounts/${first.id}/sessions`;
    const singleRevokePath = `${listPath}?sessionId=${encodeURIComponent(tokens.sessionId)}`;
    expect(Buffer.byteLength(wrongApiKey)).toBe(
      Buffer.byteLength(serviceApiKey)
    );
    for (const [method, path] of [
      ["GET", listPath],
      ["DELETE", listPath],
      ["DELETE", singleRevokePath],
    ] as const) {
      expectError(await request(path, method), 401, "API_KEY_INVALID");
      expectError(
        await request(path, method, { apiKey: wrongApiKey }),
        401,
        "API_KEY_INVALID"
      );
    }
    expectError(
      await request("/v1/accounts/missing-account/sessions", "GET", {
        service: true,
      }),
      404,
      "ACCOUNT_NOT_FOUND"
    );

    const listed = await request(listPath, "GET", { service: true });
    expect(listed.status).toBe(200);
    const sessions = listed.body as Record<string, unknown>[];
    expect(Object.keys(sessions[0] ?? {}).sort()).toEqual([
      "createdAt",
      "expiresAt",
      "id",
      "updatedAt",
    ]);
    expect(JSON.stringify(listed.body)).not.toMatch(SENSITIVE_SESSION_PATTERN);

    expect(
      (
        await request(
          `/v1/accounts/${second.id}/sessions?sessionId=${encodeURIComponent(tokens.sessionId)}`,
          "DELETE",
          { service: true }
        )
      ).status
    ).toBe(204);
    expect(
      (
        await request("/v1/auth/refresh", "POST", {
          body: { refreshKey: tokens.refreshKey },
          forwardedFor: "203.0.113.5",
        })
      ).status
    ).toBe(200);

    expect((await request(listPath, "DELETE", { service: true })).status).toBe(
      204
    );
    expect(await request(listPath, "GET", { service: true })).toMatchObject({
      body: [],
      status: 200,
    });
    expectError(
      await request("/v1/auth/refresh", "POST", {
        body: { refreshKey: tokens.refreshKey },
        forwardedFor: "203.0.113.5",
      }),
      401,
      "REFRESH_INVALID"
    );
    expect(
      (
        await request(
          `${listPath}?sessionId=${encodeURIComponent("missing-session")}`,
          "DELETE",
          { service: true }
        )
      ).status
    ).toBe(204);
    expect(
      (
        await request("/v1/auth/logout", "POST", {
          accessToken: tokens.accessToken,
          forwardedFor: "203.0.113.5",
        })
      ).status
    ).toBe(204);
  });
});
