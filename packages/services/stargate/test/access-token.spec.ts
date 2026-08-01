/** Access Token 的签发、严格结构校验与统一失败语义回归。 */
import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  ACCESS_TOKEN_INVALID_MESSAGE,
  signAccessToken,
  verifyAccessToken,
  verifyAuthorizationHeader,
} from "../src/access-token";
import { StargateServiceError } from "../src/errors";

const SECRET = "access-token-test-secret";
const NOW_SECONDS = 1_900_000_000;
const NOW = NOW_SECONDS * 1000;
const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signSegments(
  header: string,
  payload: string,
  secret = SECRET
): string {
  const encoded = `${header}.${payload}`;
  return `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}

function mintToken(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "HS256", typ: "JWT" },
  secret = SECRET
): string {
  return signSegments(encodeJson(header), encodeJson(payload), secret);
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    exp: NOW_SECONDS + 3600,
    iat: NOW_SECONDS,
    sid: "session-1",
    sub: "account-1",
    type: "access",
    ...overrides,
  };
}

function expectInvalid(token: string): StargateServiceError {
  try {
    verifyAccessToken(token, {
      clockToleranceSeconds: 30,
      now: NOW,
      secret: SECRET,
    });
  } catch (error) {
    // biome-ignore lint/suspicious/noMisplacedAssertion: 此 helper 只在测试用例中调用。
    expect(error).toBeInstanceOf(StargateServiceError);
    const serviceError = error as StargateServiceError;
    // biome-ignore lint/suspicious/noMisplacedAssertion: 此 helper 只在测试用例中调用。
    expect(serviceError.code).toBe("ACCESS_TOKEN_INVALID");
    // biome-ignore lint/suspicious/noMisplacedAssertion: 此 helper 只在测试用例中调用。
    expect(serviceError.message).toBe(ACCESS_TOKEN_INVALID_MESSAGE);
    return serviceError;
  }
  throw new Error("expected access token verification to fail");
}

function nonCanonicalEquivalent(segment: string): string {
  const decoded = Buffer.from(segment, "base64url");
  const prefix = segment.slice(0, -1);
  const current = segment.at(-1);
  for (const candidate of BASE64URL_ALPHABET) {
    if (candidate === current) {
      continue;
    }
    const alternative = `${prefix}${candidate}`;
    if (Buffer.from(alternative, "base64url").equals(decoded)) {
      return alternative;
    }
  }
  throw new Error("unable to construct a non-canonical segment");
}

describe("access token", () => {
  it("signs and verifies a token with exact header and payload contracts", () => {
    const signed = signAccessToken({
      accountId: "account-1",
      now: NOW,
      secret: SECRET,
      sessionId: "session-1",
      ttlSeconds: 3600,
    });
    const [header, payload] = signed.token.split(".");
    const decodedHeader = JSON.parse(
      Buffer.from(header ?? "", "base64url").toString("utf8")
    ) as Record<string, unknown>;
    const decodedPayload = JSON.parse(
      Buffer.from(payload ?? "", "base64url").toString("utf8")
    ) as Record<string, unknown>;

    expect(decodedHeader).toEqual({ alg: "HS256", typ: "JWT" });
    expect(Object.keys(decodedHeader).sort()).toEqual(["alg", "typ"]);
    expect(Object.keys(decodedPayload).sort()).toEqual([
      "exp",
      "iat",
      "sid",
      "sub",
      "type",
    ]);
    expect(decodedPayload.type).toBe("access");
    expect(Number.isSafeInteger(decodedPayload.iat)).toBe(true);
    expect(Number.isSafeInteger(decodedPayload.exp)).toBe(true);
    expect(decodedPayload.exp as number).toBeGreaterThan(
      decodedPayload.iat as number
    );
    expect(signed.expiresAt.getTime() / 1000).toBe(decodedPayload.exp);
    expect(
      verifyAccessToken(signed.token, {
        clockToleranceSeconds: 30,
        now: NOW,
        secret: SECRET,
      })
    ).toEqual({ accountId: "account-1", sessionId: "session-1" });
  });

  it("rejects malformed compact serializations", () => {
    const header = encodeJson({ alg: "HS256", typ: "JWT" });
    const payload = encodeJson(validPayload());
    const malformed = [
      "",
      `${header}.${payload}`,
      `${header}.${payload}.signature.extra`,
      `.${payload}.signature`,
      `${header}..signature`,
      `${header}.${payload}.`,
      signSegments(encodeJson("not-an-object"), payload),
      signSegments(Buffer.from("not-json").toString("base64url"), payload),
      signSegments(header, Buffer.from("not-json").toString("base64url")),
      signSegments(header, encodeJson([])),
      signSegments(header, encodeJson(null)),
    ];
    for (const token of malformed) {
      expectInvalid(token);
    }
  });

  it("rejects non-canonical Base64URL even when decoded bytes and HMAC match", () => {
    const canonical = mintToken(validPayload());
    const [header, payload, signature] = canonical.split(".") as [
      string,
      string,
      string,
    ];
    expectInvalid(`${header}.${payload}.${signature}=`);
    expectInvalid(`${header}.${payload}.${signature} `);
    expectInvalid(`${header}.${payload}.${nonCanonicalEquivalent(signature)}`);

    let standardBase64Token: string | undefined;
    for (let sequence = 0; sequence < 1000; sequence += 1) {
      const secret = `${SECRET}-${sequence}`;
      const candidate = signSegments(header, payload, secret);
      const candidateSignature = candidate.split(".")[2] ?? "";
      if (
        candidateSignature.includes("-") ||
        candidateSignature.includes("_")
      ) {
        standardBase64Token = candidate
          .replaceAll("-", "+")
          .replaceAll("_", "/");
        expect(() =>
          verifyAccessToken(standardBase64Token as string, {
            clockToleranceSeconds: 30,
            now: NOW,
            secret,
          })
        ).toThrow(ACCESS_TOKEN_INVALID_MESSAGE);
        break;
      }
    }
    expect(standardBase64Token).toBeDefined();
  });

  it("rejects untrusted or extended headers", () => {
    const headers = [
      { alg: "none", typ: "JWT" },
      { alg: "HS512", typ: "JWT" },
      { alg: "RS256", typ: "JWT" },
      { alg: "HS256", typ: "JWS" },
      { alg: "HS256", kid: "key-1", typ: "JWT" },
    ];
    for (const header of headers) {
      expectInvalid(mintToken(validPayload(), header));
    }
  });

  it("rejects invalid signatures", () => {
    const token = mintToken(validPayload());
    const [header, payload, signature] = token.split(".") as [
      string,
      string,
      string,
    ];
    expectInvalid(mintToken(validPayload(), undefined, "other-secret"));
    expectInvalid(`${header}.${payload}.${signature.slice(1)}`);
    expectInvalid(
      `${header}.${payload}.${signature}${signature.at(-1) === "A" ? "B" : "A"}`
    );
  });

  it("does not disguise unexpected verifier failures as invalid tokens", () => {
    const unexpected = new Error("unexpected verifier failure");
    const options = {
      clockToleranceSeconds: 30,
      now: NOW,
      get secret(): string {
        throw unexpected;
      },
    };

    expect(() => verifyAccessToken(mintToken(validPayload()), options)).toThrow(
      unexpected
    );
  });

  it("rejects missing, extended, or invalid claims", () => {
    const invalidPayloads: Record<string, unknown>[] = [];
    for (const key of ["sub", "sid", "type", "iat", "exp"] as const) {
      const payload = validPayload();
      delete payload[key];
      invalidPayloads.push(payload);
    }
    invalidPayloads.push(
      validPayload({ roles: ["admin"] }),
      validPayload({ ns: "namespace-1" }),
      validPayload({ permissions: ["read"] }),
      validPayload({ groups: ["group-1"] }),
      validPayload({ sub: "" }),
      validPayload({ sid: 1 }),
      validPayload({ iat: 1.5 }),
      validPayload({ iat: String(NOW_SECONDS) }),
      validPayload({ exp: 1.5 }),
      validPayload({ exp: String(NOW_SECONDS + 3600) }),
      validPayload({ exp: NOW_SECONDS }),
      validPayload({ exp: NOW_SECONDS - 1 })
    );
    for (const payload of invalidPayloads) {
      expectInvalid(mintToken(payload));
    }
  });

  it("enforces exact future and expiry tolerance boundaries", () => {
    const verify = (
      payload: Record<string, unknown>,
      clockToleranceSeconds: number
    ) =>
      verifyAccessToken(mintToken(payload), {
        clockToleranceSeconds,
        now: NOW,
        secret: SECRET,
      });

    expect(verify(validPayload({ iat: NOW_SECONDS + 30 }), 30)).toEqual({
      accountId: "account-1",
      sessionId: "session-1",
    });
    expect(() => verify(validPayload({ iat: NOW_SECONDS + 31 }), 30)).toThrow(
      ACCESS_TOKEN_INVALID_MESSAGE
    );
    expect(
      verify(
        validPayload({ exp: NOW_SECONDS - 29, iat: NOW_SECONDS - 100 }),
        30
      )
    ).toEqual({ accountId: "account-1", sessionId: "session-1" });
    expect(() =>
      verify(
        validPayload({ exp: NOW_SECONDS - 30, iat: NOW_SECONDS - 100 }),
        30
      )
    ).toThrow(ACCESS_TOKEN_INVALID_MESSAGE);

    expect(verify(validPayload({ iat: NOW_SECONDS }), 0)).toEqual({
      accountId: "account-1",
      sessionId: "session-1",
    });
    expect(() => verify(validPayload({ iat: NOW_SECONDS + 1 }), 0)).toThrow(
      ACCESS_TOKEN_INVALID_MESSAGE
    );
    expect(
      verify(validPayload({ exp: NOW_SECONDS + 1, iat: NOW_SECONDS - 100 }), 0)
    ).toEqual({ accountId: "account-1", sessionId: "session-1" });
    expect(() =>
      verify(validPayload({ exp: NOW_SECONDS, iat: NOW_SECONDS - 100 }), 0)
    ).toThrow(ACCESS_TOKEN_INVALID_MESSAGE);
  });

  it("uses one failure code and message for token and bearer errors", () => {
    const valid = mintToken(validPayload());
    const authorizations = [
      undefined,
      "token abc",
      "Bearer",
      `bearer ${valid}`,
      "Bearer invalid",
    ];
    const messages = new Set<string>();
    for (const authorization of authorizations) {
      try {
        verifyAuthorizationHeader(authorization, {
          clockToleranceSeconds: 30,
          now: NOW,
          secret: SECRET,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(StargateServiceError);
        const serviceError = error as StargateServiceError;
        expect(serviceError.code).toBe("ACCESS_TOKEN_INVALID");
        messages.add(serviceError.message);
      }
    }
    expect(messages).toEqual(new Set([ACCESS_TOKEN_INVALID_MESSAGE]));
  });
});
