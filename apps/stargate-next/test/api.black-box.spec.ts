import { describe, expect, it } from "vitest";

const CAPTCHA_CODE_PATTERN = /^[ABCDHJKLMNPQRSTUVWXYZ123456789]{4}$/;
const CAPTCHA_IMAGE_PATTERN = /^data:image\/svg\+xml;base64,/;

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for black-box tests`);
  }
  return value;
}

const baseUrl = env("STARGATE_BASE_URL");
const apiKey = env("STARGATE_API_KEY");

async function request(
  path: string,
  method: string,
  options: {
    accessToken?: string;
    body?: unknown;
    service?: boolean;
  } = {}
) {
  const { accessToken, body, service = false } = options;
  const response = await fetch(`${baseUrl}${path}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(service ? { "x-api-key": apiKey } : {}),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    method,
  });
  return {
    body: response.status === 204 ? undefined : await response.json(),
    status: response.status,
  };
}

describe("Given a running Stargate Next service", () => {
  it.each([
    ["stargate", "stargate@36node"],
    ["bus-admin", "Bus123456"],
  ])("logs in seeded legacy-md5 account %s", async (username, password) => {
    const captcha = await request("/v1/captchas", "POST");
    const login = await request("/v1/auth/login", "POST", {
      body: {
        captchaCode: (captcha.body as { testCode: string }).testCode,
        captchaId: (captcha.body as { id: string }).id,
        login: username,
        password,
      },
    });
    expect(login.status).toBe(200);
    expect(
      (
        await request("/v1/auth/refresh", "POST", {
          body: {
            refreshKey: (login.body as { refreshKey: string }).refreshKey,
          },
        })
      ).status
    ).toBe(200);
  });

  it("creates an account and observes it through HTTP", async () => {
    const suffix = Date.now().toString(36);
    const created = await request("/v1/accounts", "POST", {
      body: {
        idempotencyKey: `black-box-${suffix}`,
        password: "correct horse battery staple",
        username: `user${suffix}`,
      },
      service: true,
    });
    expect(created.status).toBe(201);

    const observed = await request(
      `/v1/accounts/${(created.body as { id: string }).id}`,
      "GET",
      { service: true }
    );
    expect(observed.status).toBe(200);
    expect((observed.body as { username: string }).username).toBe(
      `user${suffix}`
    );
  });

  it("returns JSON:API account resources with page metadata", async () => {
    const suffix = `${Date.now().toString(36)}list`;
    await request("/v1/accounts", "POST", {
      body: {
        idempotencyKey: `list-${suffix}`,
        password: "correct horse battery staple",
        username: `list${suffix}`,
      },
      service: true,
    });
    const listed = await request(
      "/v1/accounts?page[offset]=0&page[limit]=10",
      "GET",
      { service: true }
    );
    expect(listed.status).toBe(200);
    expect(
      (listed.body as { data: unknown[]; meta: { page: { limit: number } } })
        .data.length
    ).toBeGreaterThan(0);
    expect(
      (listed.body as { meta: { page: { limit: number } } }).meta.page.limit
    ).toBe(10);
  });

  it("consumes a captcha and establishes a refreshable session", async () => {
    const suffix = `${Date.now().toString(36)}a`;
    await request("/v1/accounts", "POST", {
      body: {
        idempotencyKey: `auth-${suffix}`,
        password: "password-123",
        username: `login${suffix}`,
      },
      service: true,
    });
    const captcha = await request("/v1/captchas", "POST");
    expect(captcha.status).toBe(201);
    expect((captcha.body as { imageDataUri: string }).imageDataUri).toMatch(
      CAPTCHA_IMAGE_PATTERN
    );
    expect((captcha.body as { testCode: string }).testCode).toMatch(
      CAPTCHA_CODE_PATTERN
    );
    const login = await request("/v1/auth/login", "POST", {
      body: {
        captchaCode: (captcha.body as { testCode: string }).testCode,
        captchaId: (captcha.body as { id: string }).id,
        login: `login${suffix}`,
        password: "password-123",
      },
    });
    expect(login.status).toBe(200);
    const claims = JSON.parse(
      Buffer.from(
        (login.body as { accessToken: string }).accessToken.split(".")[1],
        "base64url"
      ).toString("utf8")
    ) as Record<string, unknown>;
    expect(Object.keys(claims).sort()).toEqual(
      ["exp", "iat", "sid", "sub", "type"].sort()
    );

    const reusedCaptcha = await request("/v1/auth/login", "POST", {
      body: {
        captchaCode: (captcha.body as { testCode: string }).testCode,
        captchaId: (captcha.body as { id: string }).id,
        login: `login${suffix}`,
        password: "password-123",
      },
    });
    expect(reusedCaptcha.status).toBe(401);
    expect((reusedCaptcha.body as { code: string }).code).toBe(
      "CAPTCHA_INVALID"
    );

    const refresh = await request("/v1/auth/refresh", "POST", {
      body: { refreshKey: (login.body as { refreshKey: string }).refreshKey },
    });
    expect(refresh.status).toBe(200);
    expect((refresh.body as { sessionId: string }).sessionId).toBe(
      (login.body as { sessionId: string }).sessionId
    );

    await request("/v1/auth/logout", "POST", {
      accessToken: (login.body as { accessToken: string }).accessToken,
    });
    const rejected = await request("/v1/auth/refresh", "POST", {
      body: { refreshKey: (login.body as { refreshKey: string }).refreshKey },
    });
    expect(rejected.status).toBe(401);
  });

  it("releases identifiers after soft deletion", async () => {
    const suffix = `${Date.now().toString(36)}reuse`;
    const create = (idempotencyKey: string) =>
      request("/v1/accounts", "POST", {
        body: {
          idempotencyKey,
          password: "password-123",
          username: `reuse${suffix}`,
        },
        service: true,
      });
    const first = await create(`first-${suffix}`);
    expect(first.status).toBe(201);
    const removed = await request(
      `/v1/accounts/${(first.body as { id: string }).id}`,
      "DELETE",
      { service: true }
    );
    expect(removed.status).toBe(204);
    const second = await create(`second-${suffix}`);
    expect(second.status).toBe(201);
  });

  it("invalidates refresh keys after a password change", async () => {
    const suffix = `${Date.now().toString(36)}password`;
    const created = await request("/v1/accounts", "POST", {
      body: {
        idempotencyKey: `password-${suffix}`,
        password: "old-password",
        username: `password${suffix}`,
      },
      service: true,
    });
    const captcha = await request("/v1/captchas", "POST");
    const login = await request("/v1/auth/login", "POST", {
      body: {
        captchaCode: (captcha.body as { testCode: string }).testCode,
        captchaId: (captcha.body as { id: string }).id,
        login: `password${suffix}`,
        password: "old-password",
      },
    });
    const changed = await request(
      `/v1/accounts/${(created.body as { id: string }).id}/password`,
      "POST",
      { body: { password: "new-password" }, service: true }
    );
    expect(changed.status).toBe(204);
    const refreshed = await request("/v1/auth/refresh", "POST", {
      body: { refreshKey: (login.body as { refreshKey: string }).refreshKey },
    });
    expect(refreshed.status).toBe(401);
  });

  it("rejects invalid batch input with a stable error", async () => {
    const response = await request("/v1/accounts/@batchGet", "POST", {
      body: { accountIds: "not-an-array" },
      service: true,
    });
    expect(response.status).toBe(400);
    expect((response.body as { code: string }).code).toBe("BATCH_INVALID");
  });

  it("rate limits repeated captcha creation", async () => {
    let response: Awaited<ReturnType<typeof request>> | undefined;
    for (let index = 0; index < 35; index += 1) {
      response = await request("/v1/captchas", "POST");
      if (response.status === 429) {
        break;
      }
    }
    expect(response?.status).toBe(429);
    expect((response?.body as { code: string }).code).toBe(
      "CAPTCHA_RATE_LIMITED"
    );
  });
});
