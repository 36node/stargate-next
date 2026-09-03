import { StargateApiError, StargateNextClient } from "@repo/stargate-next-sdk";
import { describe, expect, it } from "vitest";

import { env, uniqueUsername } from "./support/black-box.js";

async function expectApiError(
  promise: Promise<unknown>,
  status: number,
  code: string
) {
  try {
    await promise;
    throw new Error(`expected StargateApiError ${code}`);
  } catch (error) {
    // biome-ignore lint/suspicious/noMisplacedAssertion: this helper is only invoked from test cases.
    expect(error).toBeInstanceOf(StargateApiError);
    // biome-ignore lint/suspicious/noMisplacedAssertion: this helper is only invoked from test cases.
    expect(error).toMatchObject({ code, status });
  }
}

describe("Account management SDK", () => {
  it("covers the Account lifecycle and stable SDK errors", async () => {
    const client = new StargateNextClient(env("STARGATE_ENDPOINT"), {
      apiKey: env("STARGATE_API_KEY"),
    });
    const username = uniqueUsername();
    const email = `${username}@example.com`;
    const account = await client.createAccount({
      email,
      idempotencyKey: `sdk-account-${username}`,
      password: "sdk-account-password",
      username,
    });
    expect(account).toMatchObject({ email, username });
    expect(account.phone).toBeNull();

    const listed = await client.listAccounts(0, 100);
    expect(listed.data.some(({ id }) => id === account.id)).toBe(true);
    expect(listed.meta.page.total).toBeGreaterThan(0);
    expect((await client.getAccount(account.id)).id).toBe(account.id);
    expect(
      (await client.batchGetAccounts([account.id, "missing-account"])).map(
        ({ id }) => id
      )
    ).toEqual([account.id]);

    const nextUsername = uniqueUsername();
    const patched = await client.patchAccount(account.id, {
      email: `${nextUsername}@example.com`,
      username: nextUsername,
    });
    expect(patched).toMatchObject({
      email: `${nextUsername}@example.com`,
      username: nextUsername,
    });
    await client.changePassword(account.id, "sdk-next-password");

    await expectApiError(
      client.createAccount({
        idempotencyKey: `sdk-conflict-${nextUsername}`,
        password: "sdk-conflict-password",
        username: nextUsername,
      }),
      409,
      "ACCOUNT_IDENTIFIER_CONFLICT"
    );
    await expectApiError(client.batchGetAccounts([]), 400, "BATCH_INVALID");

    await client.deleteAccount(account.id);
    await expectApiError(
      client.getAccount(account.id),
      404,
      "ACCOUNT_NOT_FOUND"
    );
  });
});
