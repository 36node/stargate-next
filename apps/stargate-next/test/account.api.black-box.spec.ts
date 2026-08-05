import { describe, expect, it } from "vitest";

import { login, request, uniqueUsername } from "./support/black-box";

type Account = {
  active: boolean;
  createdAt: string;
  email: string | null;
  id: string;
  phone: string | null;
  tenantId: string;
  updatedAt: string;
  username: string;
};

type AuthTokens = {
  accessToken: string;
  refreshKey: string;
  sessionId: string;
};

type ErrorBody = { code: string; message: string };

const accountKeys = [
  "active",
  "createdAt",
  "email",
  "id",
  "phone",
  "tenantId",
  "updatedAt",
  "username",
];
const MAX_PAGINATION_REQUESTS = 100;

function expectError(
  response: { body: unknown; status: number },
  status: number,
  code: string
) {
  // biome-ignore lint/suspicious/noMisplacedAssertion: this helper is only invoked from test cases.
  expect(response.status).toBe(status);
  // biome-ignore lint/suspicious/noMisplacedAssertion: this helper is only invoked from test cases.
  expect(response.body).toMatchObject({ code });
}

function uniquePhone(sequence: number): string {
  return `+861${Date.now()}${sequence}`;
}

function createAccount(input: unknown, service = true) {
  return request("/v1/accounts", "POST", { body: input, service });
}

describe("Account management API", () => {
  it("creates, normalizes, reads, authorizes, and rejects invalid identifiers", async () => {
    const rawUsername = uniqueUsername();
    const normalizedUsername = rawUsername.toLowerCase();
    const phone = uniquePhone(1);
    const email = `${normalizedUsername}@example.com`;
    const password = "a-create-password";
    const input = {
      email: `  ${email.toUpperCase()}  `,
      idempotencyKey: `create-${rawUsername}`,
      password,
      phone: `  ${phone}  `,
      username: `  ${rawUsername.toUpperCase()}  `,
    };

    expectError(await createAccount(input, false), 401, "API_KEY_INVALID");

    const created = await createAccount(input);
    expect(created.status).toBe(201);
    const account = created.body as Account;
    expect(Object.keys(account).sort()).toEqual(accountKeys);
    expect(account).toMatchObject({
      active: true,
      email,
      phone,
      tenantId: "default",
      username: normalizedUsername,
    });
    expect(JSON.stringify(account)).not.toContain(password);

    const observed = await request(`/v1/accounts/${account.id}`, "GET", {
      service: true,
    });
    expect(observed.status).toBe(200);
    expect(observed.body).toEqual(account);

    const invalidCases = [
      [{ password, username: "1invalid" }, "USERNAME_INVALID"],
      [
        { email: "not-an-email", password, username: uniqueUsername() },
        "EMAIL_INVALID",
      ],
      [
        { password, phone: "not-a-phone", username: uniqueUsername() },
        "PHONE_INVALID",
      ],
      [{ username: uniqueUsername() }, "PASSWORD_INVALID"],
    ] as const;
    for (const [body, code] of invalidCases) {
      expectError(await createAccount(body), 400, code);
    }
    for (const body of [null, [], "invalid"]) {
      expectError(await createAccount(body), 400, "BODY_INVALID");
    }

    const conflictCases = [
      { password, username: normalizedUsername },
      { password, phone, username: uniqueUsername() },
      { email, password, username: uniqueUsername() },
    ];
    for (const body of conflictCases) {
      expectError(
        await createAccount({
          ...body,
          idempotencyKey: `conflict-${uniqueUsername()}`,
        }),
        409,
        "ACCOUNT_IDENTIFIER_CONFLICT"
      );
    }
  });

  it("enforces idempotency across every behavior field and concurrent retries", async () => {
    const username = uniqueUsername();
    const phone = uniquePhone(2);
    const email = `${username}@example.com`;
    const key = `idempotency-${username}`;
    const body = {
      active: true,
      email,
      idempotencyKey: key,
      password: "idempotency-password",
      phone,
      username,
    };
    const first = await createAccount(body);
    const replay = await createAccount(body);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect((replay.body as Account).id).toBe((first.body as Account).id);

    const changedBodies = [
      { ...body, username: uniqueUsername() },
      { ...body, phone: uniquePhone(3) },
      { ...body, email: `${uniqueUsername()}@example.com` },
      { ...body, active: false },
      { ...body, password: "different-password" },
    ];
    for (const changed of changedBodies) {
      expectError(await createAccount(changed), 400, "IDEMPOTENCY_CONFLICT");
    }

    const concurrentUsername = uniqueUsername();
    const concurrentBody = {
      idempotencyKey: `concurrent-${concurrentUsername}`,
      password: "concurrent-password",
      username: concurrentUsername,
    };
    const concurrent = await Promise.all(
      Array.from({ length: 5 }, () => createAccount(concurrentBody))
    );
    expect(concurrent.every(({ status }) => status < 500)).toBe(true);
    const successes = concurrent.filter(({ status }) => status === 201);
    expect(successes.length).toBeGreaterThan(0);
    expect(
      new Set(successes.map(({ body: result }) => (result as Account).id)).size
    ).toBe(1);
  });

  it("paginates and batch-gets only visible accounts with stable validation", async () => {
    const before = await request(
      "/v1/accounts?page[offset]=0&page[limit]=1",
      "GET",
      { service: true }
    );
    const beforeTotal = (before.body as { meta: { page: { total: number } } })
      .meta.page.total;

    const first = await createAccount({
      password: "list-password",
      username: uniqueUsername(),
    });
    const firstAccount = first.body as Account;
    const after = await request(
      "/v1/accounts?page[offset]=0&page[limit]=1",
      "GET",
      { service: true }
    );
    const collection = after.body as {
      data: Array<{ attributes: Account; id: string; type: string }>;
      links: { next?: string; self: string };
      meta: { page: { limit: number; offset: number; total: number } };
    };
    expect(after.status).toBe(200);
    expect(collection.data[0]?.type).toBe("accounts");
    expect(collection.links.self).toContain("page[offset]=0");
    expect(collection.links.next).toBeDefined();
    expect(collection.meta.page).toMatchObject({ limit: 1, offset: 0 });
    expect(collection.meta.page.total - beforeTotal).toBe(1);

    const invalidPages = [
      "page[offset]=-1&page[limit]=10",
      "page[offset]=0&page[limit]=0",
      "page[offset]=0&page[limit]=101",
      "page[offset]=0&page[limit]=abc",
    ];
    for (const query of invalidPages) {
      expectError(
        await request(`/v1/accounts?${query}`, "GET", { service: true }),
        400,
        "PAGE_INVALID"
      );
    }

    const invalidBatches = [
      null,
      [],
      "invalid",
      { accountIds: "not-an-array" },
      { accountIds: [] },
      { accountIds: Array.from({ length: 101 }, (_, index) => `id-${index}`) },
      { accountIds: [""] },
    ];
    for (const body of invalidBatches) {
      expectError(
        await request("/v1/accounts/@batchGet", "POST", {
          body,
          service: true,
        }),
        400,
        "BATCH_INVALID"
      );
    }

    const second = await createAccount({
      password: "list-password",
      username: uniqueUsername(),
    });
    const secondAccount = second.body as Account;
    const ordered = await request("/v1/accounts/@batchGet", "POST", {
      body: {
        accountIds: [secondAccount.id, "missing-account", firstAccount.id],
      },
      service: true,
    });
    expect(ordered.status).toBe(200);
    expect((ordered.body as Account[]).map(({ id }) => id)).toEqual([
      secondAccount.id,
      firstAccount.id,
    ]);

    expect(
      (
        await request(`/v1/accounts/${firstAccount.id}`, "DELETE", {
          service: true,
        })
      ).status
    ).toBe(204);
    const withoutDeleted = await request("/v1/accounts/@batchGet", "POST", {
      body: { accountIds: [secondAccount.id, firstAccount.id] },
      service: true,
    });
    expect((withoutDeleted.body as Account[]).map(({ id }) => id)).toEqual([
      secondAccount.id,
    ]);

    const visibleIds: string[] = [];
    let offset = 0;
    let reachedLastPage = false;
    for (
      let requestCount = 0;
      requestCount < MAX_PAGINATION_REQUESTS;
      requestCount += 1
    ) {
      const page = await request(
        `/v1/accounts?page[offset]=${offset}&page[limit]=100`,
        "GET",
        { service: true }
      );
      const pageBody = page.body as {
        data: Array<{ id: string }>;
        links: { next?: string };
      };
      visibleIds.push(...pageBody.data.map(({ id }) => id));
      if (!pageBody.links.next) {
        reachedLastPage = true;
        break;
      }
      offset += pageBody.data.length;
    }
    expect(reachedLastPage).toBe(true);
    expect(visibleIds).not.toContain(firstAccount.id);
  });

  it("patches identifiers and enforces disabled-account authentication effects", async () => {
    const account = (
      await createAccount({
        email: `${uniqueUsername()}@example.com`,
        password: "patch-password",
        phone: uniquePhone(4),
        username: uniqueUsername(),
      })
    ).body as Account;
    const nextUsername = uniqueUsername();
    const nextPhone = uniquePhone(5);
    const nextEmail = `${nextUsername}@example.com`;
    const patches = [
      {
        expected: { username: nextUsername },
        input: { username: nextUsername },
      },
      { expected: { phone: nextPhone }, input: { phone: ` ${nextPhone} ` } },
      {
        expected: { email: nextEmail },
        input: { email: ` ${nextEmail.toUpperCase()} ` },
      },
      { expected: { active: false }, input: { active: false } },
      { expected: { active: true }, input: { active: true } },
    ];
    for (const { expected, input } of patches) {
      const patched = await request(`/v1/accounts/${account.id}`, "PATCH", {
        body: input,
        service: true,
      });
      expect(patched.status).toBe(200);
      expect(patched.body).toMatchObject(expected);
    }

    const blocker = (
      await createAccount({
        password: "blocker-password",
        username: uniqueUsername(),
      })
    ).body as Account;
    expectError(
      await request(`/v1/accounts/${account.id}`, "PATCH", {
        body: { username: blocker.username },
        service: true,
      }),
      409,
      "ACCOUNT_IDENTIFIER_CONFLICT"
    );
    for (const forbidden of [
      { password: "ignored-password" },
      { idempotencyKey: "ignored-key" },
    ]) {
      expectError(
        await request(`/v1/accounts/${account.id}`, "PATCH", {
          body: forbidden,
          service: true,
        }),
        400,
        "PATCH_INVALID"
      );
    }
    expectError(
      await request(`/v1/accounts/${account.id}`, "PATCH", { service: true }),
      400,
      "PATCH_INVALID"
    );
    expectError(
      await request(`/v1/accounts/${account.id}`, "PATCH", {
        body: [],
        service: true,
      }),
      400,
      "PATCH_INVALID"
    );
    for (const body of [null, "invalid"]) {
      expectError(
        await request(`/v1/accounts/${account.id}`, "PATCH", {
          body,
          service: true,
        }),
        400,
        "PATCH_INVALID"
      );
    }
    expectError(
      await request(`/v1/accounts/${account.id}`, "PATCH", {
        body: { password: "unauthorized-password" },
      }),
      401,
      "API_KEY_INVALID"
    );

    const deleted = (
      await createAccount({
        password: "deleted-password",
        username: uniqueUsername(),
      })
    ).body as Account;
    await request(`/v1/accounts/${deleted.id}`, "DELETE", { service: true });
    expectError(
      await request(`/v1/accounts/${deleted.id}`, "PATCH", {
        body: { active: true },
        service: true,
      }),
      404,
      "ACCOUNT_NOT_FOUND"
    );

    const lifecycleUsername = uniqueUsername();
    const lifecycle = (
      await createAccount({
        password: "lifecycle-password",
        username: lifecycleUsername,
      })
    ).body as Account;
    const signedIn = await login(lifecycleUsername, "lifecycle-password");
    expect(signedIn.status).toBe(200);
    const tokens = signedIn.body as AuthTokens;
    expect(
      (
        await request(`/v1/accounts/${lifecycle.id}`, "PATCH", {
          body: { active: false },
          service: true,
        })
      ).status
    ).toBe(200);
    expectError(
      await request("/v1/auth/refresh", "POST", {
        body: { refreshKey: tokens.refreshKey },
      }),
      401,
      "REFRESH_INVALID"
    );
    expectError(
      await login(lifecycleUsername, "lifecycle-password"),
      401,
      "LOGIN_INVALID"
    );
    expect(
      (
        await request("/v1/auth/logout", "POST", {
          accessToken: tokens.accessToken,
        })
      ).status
    ).toBe(204);
    await request(`/v1/accounts/${lifecycle.id}`, "PATCH", {
      body: { active: true },
      service: true,
    });
    expect((await login(lifecycleUsername, "lifecycle-password")).status).toBe(
      200
    );
  });

  it("changes credentials without exposing them and rejects unknown algorithms", async () => {
    const username = uniqueUsername();
    const oldPassword = "old-account-password";
    const newPassword = "new-account-password";
    const created = await createAccount({
      password: oldPassword,
      username,
    });
    const account = created.body as Account;
    const signedIn = await login(username, oldPassword);
    expect(signedIn.status).toBe(200);
    const oldTokens = signedIn.body as AuthTokens;

    const changed = await request(
      `/v1/accounts/${account.id}/password`,
      "POST",
      { body: { password: newPassword }, service: true }
    );
    expect(changed.status).toBe(204);
    expectError(
      await request("/v1/auth/refresh", "POST", {
        body: { refreshKey: oldTokens.refreshKey },
      }),
      401,
      "REFRESH_INVALID"
    );
    expect(
      (
        await request("/v1/auth/logout", "POST", {
          accessToken: oldTokens.accessToken,
        })
      ).status
    ).toBe(204);
    const oldLogin = await login(username, oldPassword);
    const newLogin = await login(username, newPassword);
    expectError(oldLogin, 401, "LOGIN_INVALID");
    expect(newLogin.status).toBe(200);

    expectError(
      await request(`/v1/accounts/${account.id}/password`, "POST", {
        body: {},
        service: true,
      }),
      400,
      "PASSWORD_INVALID"
    );
    for (const body of [null, [], "invalid"]) {
      expectError(
        await request(`/v1/accounts/${account.id}/password`, "POST", {
          body,
          service: true,
        }),
        400,
        "PASSWORD_INVALID"
      );
    }
    expectError(
      await request(`/v1/accounts/${account.id}/password`, "POST", {
        body: {},
      }),
      401,
      "API_KEY_INVALID"
    );

    expectError(
      await login("legacy-unknown-algo", "unsupported-password"),
      401,
      "LOGIN_INVALID"
    );
    expect((await login("stargate", "stargate@36node")).status).toBe(200);
    expectError(
      await login("stargate", "wrong-stargate-password"),
      401,
      "LOGIN_INVALID"
    );

    const serialized = JSON.stringify([
      created.body,
      signedIn.body,
      oldLogin.body,
      newLogin.body,
    ]);
    expect(serialized).not.toContain("passwordHash");
    expect(serialized).not.toContain("passwordAlgorithm");
    expect(serialized).not.toContain(oldPassword);
    expect(serialized).not.toContain(newPassword);
  });

  it("soft-deletes idempotently, revokes refresh, and releases identifiers", async () => {
    const username = uniqueUsername();
    const phone = uniquePhone(6);
    const email = `${username}@example.com`;
    const password = "delete-password";
    const account = (await createAccount({ email, password, phone, username }))
      .body as Account;
    const signedIn = await login(username, password);
    expect(signedIn.status).toBe(200);
    const tokens = signedIn.body as AuthTokens;

    expect(
      (
        await request(`/v1/accounts/${account.id}`, "DELETE", {
          service: true,
        })
      ).status
    ).toBe(204);
    expectError(
      await request(`/v1/accounts/${account.id}`, "GET", { service: true }),
      404,
      "ACCOUNT_NOT_FOUND"
    );
    const deletedLogin = await login(username, password);
    const missingLogin = await login(uniqueUsername(), password);
    expectError(deletedLogin, 401, "LOGIN_INVALID");
    expectError(missingLogin, 401, "LOGIN_INVALID");
    expect(deletedLogin.body as ErrorBody).toEqual(missingLogin.body);

    const replacement = await createAccount({
      email,
      password: "replacement-password",
      phone,
      username,
    });
    expect(replacement.status).toBe(201);
    expect((replacement.body as Account).id).not.toBe(account.id);
    expect(
      (
        await request(`/v1/accounts/${account.id}`, "DELETE", {
          service: true,
        })
      ).status
    ).toBe(204);
    expectError(
      await request("/v1/auth/refresh", "POST", {
        body: { refreshKey: tokens.refreshKey },
      }),
      401,
      "REFRESH_INVALID"
    );

    const missingAccountId = `missing-${uniqueUsername()}`;
    expectError(
      await request(`/v1/accounts/${missingAccountId}`, "DELETE", {
        service: true,
      }),
      404,
      "ACCOUNT_NOT_FOUND"
    );
    expectError(
      await request(`/v1/accounts/${missingAccountId}/sessions`, "DELETE", {
        service: true,
      }),
      404,
      "ACCOUNT_NOT_FOUND"
    );
  });
});
