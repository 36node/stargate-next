import { describe, expect, it } from "vitest";

import { StargateNextClient } from "../../../packages/stargate-next-sdk/src";

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for SDK black-box tests`);
  }
  return value;
}

const baseUrl = env("STARGATE_ENDPOINT");
const apiKey = env("STARGATE_API_KEY");
const captchaTestCode = env("CAPTCHA_TEST_CODE").trim().toUpperCase();

describe("Given the generated SDK and a running service", () => {
  it("creates, reads, logs in and refreshes through the public contract", async () => {
    const client = new StargateNextClient(baseUrl, { apiKey });
    const suffix = Date.now().toString(36);
    const account = await client.createAccount({
      idempotencyKey: `sdk-${suffix}`,
      password: "sdk-password",
      username: `sdk${suffix}`,
    });
    expect((await client.getAccount(account.id)).id).toBe(account.id);

    const captcha = await client.createCaptcha();
    const session = await client.login(
      account.username,
      "sdk-password",
      captcha.id,
      captchaTestCode
    );
    expect((await client.refresh(session.refreshKey)).sessionId).toBe(
      session.sessionId
    );
    expect((await client.listSessions(account.id)).length).toBe(1);
    await client.revokeSessions(account.id, session.sessionId);
    expect((await client.listSessions(account.id)).length).toBe(0);
    await expect(client.refresh(session.refreshKey)).rejects.toMatchObject({
      code: "REFRESH_INVALID",
      status: 401,
    });
  });
});
