/** Access Token 的集中签发与严格验签实现。 */
import { createHmac, timingSafeEqual } from "node:crypto";

import type { AccessTokenClaims } from "./contracts";
import { serviceError } from "./errors";

export const ACCESS_TOKEN_INVALID_MESSAGE = "access token is invalid";

const BASE64URL_SEGMENT = /^[A-Za-z0-9_-]+$/;
const HEADER_KEYS = ["alg", "typ"];
const PAYLOAD_KEYS = ["exp", "iat", "sid", "sub", "type"];

export type AccessTokenSignOptions = {
  accountId: string;
  now?: number;
  secret: string;
  sessionId: string;
  ttlSeconds: number;
};

export type SignedAccessToken = {
  expiresAt: Date;
  token: string;
};

export type AccessTokenVerifyOptions = {
  clockToleranceSeconds: number;
  now?: number;
  secret: string;
};

type JsonObject = Record<string, unknown>;

function invalidAccessToken(): never {
  throw serviceError(
    "ACCESS_TOKEN_INVALID",
    ACCESS_TOKEN_INVALID_MESSAGE,
    "unauthenticated"
  );
}

function isCanonicalBase64Url(segment: string): boolean {
  return (
    BASE64URL_SEGMENT.test(segment) &&
    Buffer.from(segment, "base64url").toString("base64url") === segment
  );
}

function parseObject(segment: string): JsonObject {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    invalidAccessToken();
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalidAccessToken();
  }
  return value as JsonObject;
}

function hasExactKeys(value: JsonObject, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length &&
    actual.every((key, index) => key === keys[index])
  );
}

export function signAccessToken(
  options: AccessTokenSignOptions
): SignedAccessToken {
  const issuedAt = Math.floor((options.now ?? Date.now()) / 1000);
  const expiresAt = issuedAt + options.ttlSeconds;
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" })
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      exp: expiresAt,
      iat: issuedAt,
      sid: options.sessionId,
      sub: options.accountId,
      type: "access",
    })
  ).toString("base64url");
  const encoded = `${header}.${payload}`;
  const signature = createHmac("sha256", options.secret)
    .update(encoded)
    .digest("base64url");
  return {
    expiresAt: new Date(expiresAt * 1000),
    token: `${encoded}.${signature}`,
  };
}

export function verifyAccessToken(
  token: string,
  options: AccessTokenVerifyOptions
): AccessTokenClaims {
  if (!token) {
    invalidAccessToken();
  }
  const segments = token.split(".");
  if (segments.length !== 3 || !segments.every(isCanonicalBase64Url)) {
    invalidAccessToken();
  }
  const [headerSegment, payloadSegment, signatureSegment] = segments as [
    string,
    string,
    string,
  ];
  const header = parseObject(headerSegment);
  if (
    !hasExactKeys(header, HEADER_KEYS) ||
    header.alg !== "HS256" ||
    header.typ !== "JWT"
  ) {
    invalidAccessToken();
  }

  const expected = createHmac("sha256", options.secret)
    .update(`${headerSegment}.${payloadSegment}`)
    .digest();
  const actual = Buffer.from(signatureSegment, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    invalidAccessToken();
  }

  const payload = parseObject(payloadSegment);
  if (
    !hasExactKeys(payload, PAYLOAD_KEYS) ||
    typeof payload.sub !== "string" ||
    payload.sub.length === 0 ||
    typeof payload.sid !== "string" ||
    payload.sid.length === 0 ||
    payload.type !== "access" ||
    !Number.isSafeInteger(payload.iat) ||
    !Number.isSafeInteger(payload.exp) ||
    (payload.exp as number) <= (payload.iat as number)
  ) {
    invalidAccessToken();
  }

  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  if (nowSeconds >= (payload.exp as number) + options.clockToleranceSeconds) {
    invalidAccessToken();
  }
  return {
    accountId: payload.sub,
    sessionId: payload.sid,
  };
}

export function verifyAuthorizationHeader(
  authorization: string | undefined,
  options: AccessTokenVerifyOptions
): AccessTokenClaims {
  if (!authorization?.startsWith("Bearer ")) {
    invalidAccessToken();
  }
  return verifyAccessToken(authorization.slice(7), options);
}
