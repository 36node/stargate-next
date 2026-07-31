import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { checkDbHealth, db } from "@repo/db";
import {
  checkRedisHealth,
  getRedisClient,
  withRedisTimeout,
} from "@repo/redis";
import svgCaptcha from "svg-captcha";

import { loadStargateConfig, type StargateConfig } from "./config";
import type {
  AccessTokenClaims,
  AccountCollection,
  AccountInput,
  AccountPatchInput,
  AuthTokens,
  Captcha,
  HealthCheck,
  LoginInput,
  PublicAccount,
  RequestContext,
  Session,
  StargateHealth,
  StargateServiceContract,
} from "./contracts";
import { serviceError } from "./errors";

const CAPTCHA_PREFIX = "captcha:";
const CAPTCHA_RATE_LIMIT_PREFIX = "captcha-rate-limit:";
const LOGIN_FAILURE_PREFIX = "login-failure:";
const SALT_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CAPTCHA_CHAR_PRESET = "abcd1234abcd1234HJKLMNPQRSTUVWXYZ23456789";
const USERNAME_PATTERN = /^[a-z][a-z0-9._-]*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?\d+$/;
const PASSWORD_HASH_PATTERN = /^[a-zA-Z0-9]{13}[a-f0-9]{32}$/;
const LETTER_PATTERN = /^[a-zA-Z]/;

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.length) {
    throw serviceError(
      `${field.toUpperCase()}_INVALID` as "PASSWORD_INVALID",
      `${field} is required`,
      "invalid_argument"
    );
  }
  return value;
}

function normalizeUsername(value: string): string {
  if (typeof value !== "string") {
    throw serviceError(
      "USERNAME_INVALID",
      "username must be a string",
      "invalid_argument"
    );
  }
  const normalized = value.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(normalized)) {
    throw serviceError(
      "USERNAME_INVALID",
      "username must start with a letter and use only letters, digits, dot, underscore, or hyphen",
      "invalid_argument"
    );
  }
  return normalized;
}

function normalizeEmail(value: string): string {
  if (typeof value !== "string") {
    throw serviceError(
      "EMAIL_INVALID",
      "email must be a string",
      "invalid_argument"
    );
  }
  const normalized = value.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) {
    throw serviceError(
      "EMAIL_INVALID",
      "email must be valid",
      "invalid_argument"
    );
  }
  return normalized;
}

function normalizePhone(value: string): string {
  if (typeof value !== "string") {
    throw serviceError(
      "PHONE_INVALID",
      "phone must be a string",
      "invalid_argument"
    );
  }
  const normalized = value.trim();
  if (!PHONE_PATTERN.test(normalized)) {
    throw serviceError(
      "PHONE_INVALID",
      "phone must contain digits with an optional leading +",
      "invalid_argument"
    );
  }
  return normalized;
}

function passwordHash(password: string): string {
  const salt = Array.from(
    randomBytes(13),
    (byte) => SALT_ALPHABET[byte % SALT_ALPHABET.length]
  ).join("");
  return `${salt}${createHash("md5").update(`${password}${salt}`).digest("hex")}`;
}

function verifyPassword(hash: string, password: string): boolean {
  if (!PASSWORD_HASH_PATTERN.test(hash)) {
    return false;
  }
  const salt = hash.slice(0, 13);
  const expected = Buffer.from(
    `${salt}${createHash("md5").update(`${password}${salt}`).digest("hex")}`
  );
  const actual = Buffer.from(hash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function toIso(value: Date): string {
  return value.toISOString();
}

function publicAccount(account: {
  id: string;
  status: string;
  username: string;
  phone: string | null;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PublicAccount {
  return {
    active: account.status === "active",
    createdAt: toIso(account.createdAt),
    email: account.email,
    id: account.id,
    phone: account.phone,
    updatedAt: toIso(account.updatedAt),
    username: account.username,
  };
}

function publicSession(session: {
  createdAt: Date;
  expiresAt: Date;
  id: string;
  updatedAt: Date;
}): Session {
  return {
    createdAt: toIso(session.createdAt),
    expiresAt: toIso(session.expiresAt),
    id: session.id,
    updatedAt: toIso(session.updatedAt),
  };
}

export async function checkStargateHealth(): Promise<StargateHealth> {
  const [database, redis] = await Promise.all([
    checkDbHealth(),
    checkRedisHealth(),
  ]);
  return {
    database: database as HealthCheck,
    redis: redis as HealthCheck,
  };
}

export class StargateService implements StargateServiceContract {
  private readonly settings: StargateConfig;

  constructor(settings: StargateConfig = loadStargateConfig()) {
    this.settings = settings;
  }

  private redisKey(prefix: string, suffix: string): string {
    return `${this.settings.redisKeyPrefix}${prefix}${suffix}`;
  }

  private createCaptchaImage(fixedCode?: string): {
    code: string;
    imageDataUri: string;
  } {
    if (fixedCode) {
      const fixedSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="130" height="40" viewBox="0 0 130 40"><rect width="130" height="40" fill="white"/><text x="65" y="28" text-anchor="middle" font-family="monospace" font-size="24" letter-spacing="4">${fixedCode}</text></svg>`;
      return {
        code: fixedCode,
        imageDataUri: `data:image/svg+xml;base64,${Buffer.from(fixedSvg).toString("base64")}`,
      };
    }
    const { data, text } = svgCaptcha.create({
      charPreset: CAPTCHA_CHAR_PRESET,
      height: 40,
      ignoreChars: "",
      noise: 1,
      size: 4,
      width: 130,
    });
    return {
      code: text.toUpperCase(),
      imageDataUri: `data:image/svg+xml;base64,${Buffer.from(data).toString("base64")}`,
    };
  }

  private accessToken(
    accountId: string,
    sessionId: string
  ): {
    expiresAt: Date;
    token: string;
  } {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      exp: now + this.settings.tokenTtlSeconds,
      iat: now,
      sid: sessionId,
      sub: accountId,
      type: "access",
    };
    const base64Url = (value: string | Buffer) =>
      Buffer.from(value).toString("base64url");
    const encoded = `${base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${base64Url(JSON.stringify(payload))}`;
    return {
      expiresAt: new Date(payload.exp * 1000),
      token: `${encoded}.${base64Url(createHmac("sha256", this.settings.jwtSecret).update(encoded).digest())}`,
    };
  }

  private async audit({
    accountId,
    context,
    eventType,
    metadata,
    sessionId,
    success,
  }: {
    accountId?: string;
    context: RequestContext;
    eventType: string;
    metadata?: Record<string, string>;
    sessionId?: string;
    success: boolean;
  }): Promise<void> {
    await db.authAuditEvent.create({
      data: {
        accountId,
        actorId: accountId,
        actorType: accountId ? "account" : "service",
        eventType,
        ip: context.ip,
        metadata,
        requestId: context.requestId,
        sessionId,
        success,
        userAgent: context.userAgent,
      },
    });
  }

  assertApiKey(apiKey: string | undefined): void {
    const supplied = apiKey ? Buffer.from(apiKey) : undefined;
    const expected = Buffer.from(this.settings.apiKey);
    if (
      !supplied ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      throw serviceError(
        "API_KEY_INVALID",
        "invalid service API key",
        "unauthenticated"
      );
    }
  }

  accessTokenClaims(authorization: string | undefined): AccessTokenClaims {
    if (!authorization?.startsWith("Bearer ")) {
      throw serviceError(
        "ACCESS_TOKEN_INVALID",
        "bearer access token is required",
        "unauthenticated"
      );
    }
    const [header, payload, signature, ...extra] = authorization
      .slice(7)
      .split(".");
    if (!(header && payload && signature) || extra.length) {
      throw serviceError(
        "ACCESS_TOKEN_INVALID",
        "access token is malformed",
        "unauthenticated"
      );
    }
    const expected = createHmac("sha256", this.settings.jwtSecret)
      .update(`${header}.${payload}`)
      .digest();
    const actual = Buffer.from(signature, "base64url");
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw serviceError(
        "ACCESS_TOKEN_INVALID",
        "access token signature is invalid",
        "unauthenticated"
      );
    }
    try {
      const claims = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8")
      ) as {
        exp?: number;
        sid?: string;
        sub?: string;
        type?: string;
      };
      if (
        claims.type !== "access" ||
        typeof claims.exp !== "number" ||
        claims.exp <= Math.floor(Date.now() / 1000) ||
        !claims.sid ||
        !claims.sub
      ) {
        throw new Error("invalid claims");
      }
      return { accountId: claims.sub, sessionId: claims.sid };
    } catch {
      throw serviceError(
        "ACCESS_TOKEN_INVALID",
        "access token claims are invalid",
        "unauthenticated"
      );
    }
  }

  async createCaptcha(context: RequestContext): Promise<Captcha> {
    const client = context.ip ?? "unknown";
    const rateLimitKey = this.redisKey(CAPTCHA_RATE_LIMIT_PREFIX, client);
    const attempts = await withRedisTimeout(
      getRedisClient().incr(rateLimitKey)
    );
    if (attempts === 1) {
      await withRedisTimeout(
        getRedisClient().expire(
          rateLimitKey,
          this.settings.captchaCreateWindowSeconds
        )
      );
    }
    if (attempts > this.settings.captchaCreateLimit) {
      throw serviceError(
        "CAPTCHA_RATE_LIMITED",
        "captcha creation is temporarily rate limited",
        "rate_limited"
      );
    }
    const id = randomBytes(18).toString("base64url");
    const { code, imageDataUri } = this.createCaptchaImage(
      this.settings.captchaTestCode
    );
    await withRedisTimeout(
      getRedisClient().set(
        this.redisKey(CAPTCHA_PREFIX, id),
        JSON.stringify({
          attempts: 0,
          codeHash: hmac(this.settings.captchaHmacSecret, code),
        }),
        "EX",
        this.settings.captchaTtlSeconds
      )
    );
    return { id, imageDataUri };
  }

  async verifyCaptcha(id: string, code: string): Promise<boolean> {
    const result = await withRedisTimeout(
      getRedisClient().eval(
        `local raw = redis.call("GET", KEYS[1])
         if not raw then return 0 end
         local captcha = cjson.decode(raw)
         if captcha.codeHash == ARGV[1] then redis.call("DEL", KEYS[1]); return 1 end
         captcha.attempts = captcha.attempts + 1
         if captcha.attempts >= tonumber(ARGV[2]) then redis.call("DEL", KEYS[1])
         else
           local ttl = redis.call("TTL", KEYS[1])
           if ttl > 0 then redis.call("SET", KEYS[1], cjson.encode(captcha), "EX", ttl) end
         end
         return -1`,
        1,
        this.redisKey(CAPTCHA_PREFIX, id),
        hmac(this.settings.captchaHmacSecret, code.trim().toUpperCase()),
        String(this.settings.captchaAttempts)
      )
    );
    return result === 1;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: bootstrap code not fine tuned for complexity.
  async createAccount(
    input: AccountInput,
    context: RequestContext
  ): Promise<PublicAccount> {
    const idempotencyKey = input.idempotencyKey?.trim() || undefined;
    requiredString(input.password, "password");
    const data = {
      active: input.active !== false,
      email:
        input.email === undefined || input.email === null
          ? null
          : normalizeEmail(input.email),
      phone:
        input.phone === undefined || input.phone === null
          ? null
          : normalizePhone(input.phone),
      username: normalizeUsername(input.username),
    };
    const accountData = {
      email: data.email,
      passwordAlgorithm: "legacy-md5" as const,
      passwordChangedAt: new Date(),
      passwordHash: passwordHash(input.password),
      phone: data.phone,
      status: data.active ? ("active" as const) : ("disabled" as const),
      username: data.username,
    };

    let account: Awaited<ReturnType<typeof db.account.create>>;
    if (idempotencyKey) {
      const requestHash = createHash("sha256")
        .update(JSON.stringify(data))
        .digest("hex");
      const expiresAt = new Date(
        Date.now() + this.settings.accountCreateIdempotencyTtlSeconds * 1000
      );
      const create = () =>
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: idempotency transaction must remain atomic.
        db.$transaction(async (transaction) => {
          const existing =
            await transaction.accountCreateIdempotency.findUnique({
              include: { account: true },
              where: { key: idempotencyKey },
            });
          if (existing && existing.expiresAt > new Date()) {
            if (existing.requestHash !== requestHash) {
              throw serviceError(
                "IDEMPOTENCY_CONFLICT",
                "idempotencyKey was used with a different request",
                "invalid_argument"
              );
            }
            if (existing.account && !existing.account.deletedAt) {
              return existing.account;
            }
            throw serviceError(
              "IDEMPOTENCY_IN_PROGRESS",
              "idempotencyKey request is still being processed",
              "invalid_argument"
            );
          }
          if (existing) {
            await transaction.accountCreateIdempotency.delete({
              where: { key: idempotencyKey },
            });
          }
          await transaction.accountCreateIdempotency.create({
            data: { expiresAt, key: idempotencyKey, requestHash },
          });
          const created = await transaction.account.create({
            data: accountData,
          });
          await transaction.accountCreateIdempotency.update({
            data: { accountId: created.id },
            where: { key: idempotencyKey },
          });
          return created;
        });
      try {
        account = await create();
      } catch (error) {
        if (!isPrismaCode(error, "P2002")) {
          throw error;
        }
        const existing = await db.accountCreateIdempotency.findUnique({
          include: { account: true },
          where: { key: idempotencyKey },
        });
        if (
          existing?.requestHash === requestHash &&
          existing.expiresAt > new Date() &&
          existing.account &&
          !existing.account.deletedAt
        ) {
          account = existing.account;
        } else {
          throw serviceError(
            "ACCOUNT_IDENTIFIER_CONFLICT",
            "username, email, or phone is already in use",
            "conflict"
          );
        }
      }
    } else {
      try {
        account = await db.account.create({ data: accountData });
      } catch (error) {
        if (isPrismaCode(error, "P2002")) {
          throw serviceError(
            "ACCOUNT_IDENTIFIER_CONFLICT",
            "username, email, or phone is already in use",
            "conflict"
          );
        }
        throw error;
      }
    }
    await this.audit({
      accountId: account.id,
      context,
      eventType: "account.create",
      success: true,
    });
    return publicAccount(account);
  }

  async getAccount(id: string): Promise<PublicAccount> {
    const account = await db.account.findUnique({ where: { id } });
    if (!account || account.deletedAt) {
      throw serviceError("ACCOUNT_NOT_FOUND", "account not found", "not_found");
    }
    return publicAccount(account);
  }

  async batchGet(ids: string[]): Promise<PublicAccount[]> {
    const accounts = await db.account.findMany({
      where: { deletedAt: null, id: { in: ids } },
    });
    const byId = new Map(
      accounts.map((account) => [account.id, publicAccount(account)])
    );
    return ids.flatMap((id) => {
      const account = byId.get(id);
      return account ? [account] : [];
    });
  }

  async listAccounts(
    limit: number,
    offset: number,
    basePath: string
  ): Promise<AccountCollection> {
    const [accounts, total] = await db.$transaction([
      db.account.findMany({
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        where: { deletedAt: null },
      }),
      db.account.count({ where: { deletedAt: null } }),
    ]);
    const nextOffset = offset + accounts.length;
    const query = (next: number) =>
      `${basePath}?page[offset]=${next}&page[limit]=${limit}`;
    return {
      data: accounts.map((account) => ({
        attributes: publicAccount(account),
        id: account.id,
        type: "accounts" as const,
      })),
      links: {
        self: query(offset),
        ...(nextOffset < total ? { next: query(nextOffset) } : {}),
      },
      meta: { page: { limit, offset, total } },
    };
  }

  async patchAccount(
    id: string,
    input: AccountPatchInput,
    context: RequestContext
  ): Promise<PublicAccount> {
    await this.getAccount(id);
    try {
      const account = await db.account.update({
        data: {
          ...(input.email !== undefined
            ? {
                email:
                  input.email === null ? null : normalizeEmail(input.email),
              }
            : {}),
          ...(input.phone !== undefined
            ? {
                phone:
                  input.phone === null ? null : normalizePhone(input.phone),
              }
            : {}),
          ...(input.username !== undefined
            ? { username: normalizeUsername(input.username) }
            : {}),
          ...(input.active !== undefined
            ? { status: input.active ? "active" : "disabled" }
            : {}),
        },
        where: { id },
      });
      await this.audit({
        accountId: id,
        context,
        eventType: "account.update",
        success: true,
      });
      return publicAccount(account);
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        throw serviceError(
          "ACCOUNT_IDENTIFIER_CONFLICT",
          "username, email, or phone is already in use",
          "conflict"
        );
      }
      throw error;
    }
  }

  async changePassword(
    id: string,
    password: string,
    context: RequestContext
  ): Promise<void> {
    await this.getAccount(id);
    requiredString(password, "password");
    await db.$transaction([
      db.session.deleteMany({ where: { accountId: id } }),
      db.account.update({
        data: {
          passwordAlgorithm: "legacy-md5",
          passwordChangedAt: new Date(),
          passwordHash: passwordHash(password),
        },
        where: { id },
      }),
    ]);
    await this.audit({
      accountId: id,
      context,
      eventType: "password.change",
      success: true,
    });
  }

  async deleteAccount(id: string, context: RequestContext): Promise<void> {
    const account = await db.account.findUnique({ where: { id } });
    if (account && !account.deletedAt) {
      await db.$transaction([
        db.session.deleteMany({ where: { accountId: id } }),
        db.account.update({
          data: {
            deletedAt: new Date(),
            email: null,
            phone: null,
            username: `deleted-${account.id}`,
          },
          where: { id },
        }),
      ]);
    }
    await this.audit({
      accountId: id,
      context,
      eventType: "account.delete",
      metadata: { reason: "account_delete" },
      success: true,
    });
  }

  async login(input: LoginInput, context: RequestContext): Promise<AuthTokens> {
    const rawLogin = requiredString(input.login, "login").trim();
    const normalizedLogin = this.normalizeLogin(rawLogin);
    requiredString(input.password, "password");
    const failureKey = this.redisKey(LOGIN_FAILURE_PREFIX, normalizedLogin);
    const failures = Number(
      (await withRedisTimeout(getRedisClient().get(failureKey))) ?? "0"
    );
    if (failures >= this.settings.loginAttempts) {
      throw serviceError(
        "LOGIN_LOCKED",
        "login temporarily locked",
        "unauthenticated"
      );
    }
    if (!(await this.verifyCaptcha(input.captchaId, input.captchaCode))) {
      await this.loginFailure(failureKey, context);
      throw serviceError(
        "CAPTCHA_INVALID",
        "captcha is invalid or expired",
        "unauthenticated"
      );
    }
    const account = await db.account.findFirst({
      where: {
        OR: [
          { username: normalizedLogin },
          { email: normalizedLogin },
          { phone: normalizedLogin },
        ],
      },
    });
    if (
      !account ||
      account.passwordAlgorithm !== "legacy-md5" ||
      account.status !== "active" ||
      account.deletedAt ||
      !verifyPassword(account.passwordHash, input.password)
    ) {
      await this.loginFailure(failureKey, context, account?.id);
      throw serviceError(
        "LOGIN_INVALID",
        "invalid login or password",
        "unauthenticated"
      );
    }
    await withRedisTimeout(getRedisClient().del(failureKey));
    const refreshKey = randomBytes(32).toString("base64url");
    const expiresAt = new Date(
      Date.now() + this.settings.refreshTtlSeconds * 1000
    );
    const session = await db.session.create({
      data: {
        accountId: account.id,
        expiresAt,
        refreshKeyHash: hmac(this.settings.primary.secret, refreshKey),
        refreshKeyHmacKeyId: this.settings.primary.id,
      },
    });
    const token = this.accessToken(account.id, session.id);
    await this.audit({
      accountId: account.id,
      context,
      eventType: "login",
      sessionId: session.id,
      success: true,
    });
    return {
      accessToken: token.token,
      accessTokenExpiresAt: toIso(token.expiresAt),
      accountId: account.id,
      refreshExpiresAt: toIso(expiresAt),
      refreshKey,
      sessionId: session.id,
    };
  }

  private async loginFailure(
    key: string,
    context: RequestContext,
    accountId?: string
  ): Promise<void> {
    await withRedisTimeout(getRedisClient().incr(key));
    await withRedisTimeout(
      getRedisClient().expire(key, this.settings.loginLockSeconds)
    );
    await this.audit({
      accountId,
      context,
      eventType: "login",
      success: false,
    });
  }

  private normalizeLogin(rawLogin: string): string {
    if (rawLogin.includes("@")) {
      return normalizeEmail(rawLogin);
    }
    if (LETTER_PATTERN.test(rawLogin)) {
      return normalizeUsername(rawLogin);
    }
    return normalizePhone(rawLogin);
  }

  async refresh(
    refreshKey: string,
    context: RequestContext
  ): Promise<AuthTokens> {
    const candidates = [this.settings.primary, this.settings.secondary].filter(
      (key): key is { id: string; secret: string } => Boolean(key)
    );
    const sessions = (
      await Promise.all(
        candidates.map((key) =>
          db.session.findMany({
            where: {
              expiresAt: { gt: new Date() },
              refreshKeyHash: hmac(key.secret, refreshKey),
              refreshKeyHmacKeyId: key.id,
            },
          })
        )
      )
    ).flat();
    if (sessions.length !== 1) {
      await this.audit({ context, eventType: "refresh", success: false });
      throw serviceError(
        "REFRESH_INVALID",
        "refresh key is invalid",
        "unauthenticated"
      );
    }
    const session = sessions[0];
    const account = await db.account.findUnique({
      where: { id: session.accountId },
    });
    if (!account || account.deletedAt || account.status !== "active") {
      await this.audit({
        accountId: session.accountId,
        context,
        eventType: "refresh",
        sessionId: session.id,
        success: false,
      });
      throw serviceError(
        "REFRESH_INVALID",
        "refresh key is invalid",
        "unauthenticated"
      );
    }
    const token = this.accessToken(account.id, session.id);
    await this.audit({
      accountId: account.id,
      context,
      eventType: "refresh",
      sessionId: session.id,
      success: true,
    });
    return {
      accessToken: token.token,
      accessTokenExpiresAt: toIso(token.expiresAt),
      accountId: account.id,
      refreshExpiresAt: toIso(session.expiresAt),
      refreshKey,
      sessionId: session.id,
    };
  }

  async listSessions(accountId: string): Promise<Session[]> {
    await this.getAccount(accountId);
    const sessions = await db.session.findMany({
      orderBy: { createdAt: "asc" },
      where: { accountId, expiresAt: { gt: new Date() } },
    });
    return sessions.map(publicSession);
  }

  async revokeSessions(
    accountId: string,
    context: RequestContext,
    reason: string,
    sessionId?: string
  ): Promise<void> {
    await db.session.deleteMany({
      where: sessionId ? { accountId, id: sessionId } : { accountId },
    });
    await this.audit({
      accountId,
      context,
      eventType: reason === "logout" ? "logout" : "session.revoke",
      metadata: { reason },
      sessionId,
      success: true,
    });
  }
}

export function createStargateService(
  config: StargateConfig = loadStargateConfig()
): StargateService {
  return new StargateService(config);
}
