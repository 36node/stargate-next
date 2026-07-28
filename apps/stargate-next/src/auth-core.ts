import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { db } from "@repo/db";
import { getRedisClient, withRedisTimeout } from "@repo/redis";
import svgCaptcha from "svg-captcha";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { loadAuthConfig } from "./auth/config";

type AccountInput = {
  username: string;
  phone?: string | null;
  email?: string | null;
  password: string;
  active?: boolean;
  idempotencyKey?: string;
};

type RequestContext = { requestId?: string; ip?: string; userAgent?: string };

const CAPTCHA_PREFIX = "captcha:";
const CAPTCHA_RATE_LIMIT_PREFIX = "captcha-rate-limit:";
const LOGIN_FAILURE_PREFIX = "login-failure:";
const SALT_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CAPTCHA_CHAR_PRESET = "abcd1234abcd1234HJKLMNPQRSTUVWXYZ23456789";

const settings = loadAuthConfig();

function redisKey(prefix: string, suffix: string): string {
  return `${settings.redisKeyPrefix}${prefix}${suffix}`;
}

function createCaptchaImage(): { code: string; imageDataUri: string } {
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

function normalizeUsername(value: string): string {
  if (typeof value !== "string") {
    throw new BadRequestException({
      code: "USERNAME_INVALID",
      message: "username must be a string",
    });
  }
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9._-]*$/.test(normalized)) {
    throw new BadRequestException({
      code: "USERNAME_INVALID",
      message:
        "username must start with a letter and use only letters, digits, dot, underscore, or hyphen",
    });
  }
  return normalized;
}

function normalizeEmail(value: string): string {
  if (typeof value !== "string") {
    throw new BadRequestException({
      code: "EMAIL_INVALID",
      message: "email must be a string",
    });
  }
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new BadRequestException({
      code: "EMAIL_INVALID",
      message: "email must be valid",
    });
  }
  return normalized;
}

function normalizePhone(value: string): string {
  if (typeof value !== "string") {
    throw new BadRequestException({
      code: "PHONE_INVALID",
      message: "phone must be a string",
    });
  }
  const normalized = value.trim();
  if (!/^\+?\d+$/.test(normalized)) {
    throw new BadRequestException({
      code: "PHONE_INVALID",
      message: "phone must contain digits with an optional leading +",
    });
  }
  return normalized;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.length) {
    throw new BadRequestException({
      code: `${field.toUpperCase()}_INVALID`,
      message: `${field} is required`,
    });
  }
  return value;
}

function passwordHash(password: string): string {
  const salt = Array.from(randomBytes(13), (byte) =>
    SALT_ALPHABET[byte % SALT_ALPHABET.length]
  ).join("");
  return `${salt}${createHash("md5").update(`${password}${salt}`).digest("hex")}`;
}

function verifyPassword(hash: string, password: string): boolean {
  if (!/^[a-zA-Z0-9]{13}[a-f0-9]{32}$/.test(hash)) {
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

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function accessToken(accountId: string, sessionId: string): { expiresAt: Date; token: string } {
  const now = Math.floor(Date.now() / 1000);
  const payload = { exp: now + settings.tokenTtlSeconds, iat: now, sid: sessionId, sub: accountId, type: "access" };
  const encoded = `${base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${base64Url(JSON.stringify(payload))}`;
  return {
    expiresAt: new Date(payload.exp * 1000),
    token: `${encoded}.${base64Url(createHmac("sha256", settings.jwtSecret).update(encoded).digest())}`,
  };
}

function accessTokenClaims(authorization: string | undefined): {
  accountId: string;
  sessionId: string;
} {
  if (!authorization?.startsWith("Bearer ")) {
    throw new UnauthorizedException({
      code: "ACCESS_TOKEN_INVALID",
      message: "bearer access token is required",
    });
  }
  const [header, payload, signature, ...extra] = authorization.slice(7).split(".");
  if (!header || !payload || !signature || extra.length) {
    throw new UnauthorizedException({
      code: "ACCESS_TOKEN_INVALID",
      message: "access token is malformed",
    });
  }
  const expected = createHmac("sha256", settings.jwtSecret)
    .update(`${header}.${payload}`)
    .digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new UnauthorizedException({
      code: "ACCESS_TOKEN_INVALID",
      message: "access token signature is invalid",
    });
  }
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { exp?: number; sid?: string; sub?: string; type?: string };
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
    throw new UnauthorizedException({
      code: "ACCESS_TOKEN_INVALID",
      message: "access token claims are invalid",
    });
  }
}

function publicAccount(account: {
  id: string;
  status: string;
  username: string;
  phone: string | null;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    active: account.status === "active",
    createdAt: account.createdAt,
    email: account.email,
    id: account.id,
    phone: account.phone,
    updatedAt: account.updatedAt,
    username: account.username,
  };
}

@Injectable()
export class AuthCoreService {
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
  }) {
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

  assertApiKey(apiKey: string | undefined) {
    const supplied = apiKey ? Buffer.from(apiKey) : undefined;
    const expected = Buffer.from(settings.apiKey);
    if (
      !supplied ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      throw new UnauthorizedException({ code: "API_KEY_INVALID", message: "invalid service API key" });
    }
  }

  accessTokenClaims(authorization: string | undefined) {
    return accessTokenClaims(authorization);
  }

  async createCaptcha(context: RequestContext) {
    const client = context.ip ?? "unknown";
    const rateLimitKey = redisKey(CAPTCHA_RATE_LIMIT_PREFIX, client);
    const attempts = await withRedisTimeout(getRedisClient().incr(rateLimitKey));
    if (attempts === 1) {
      await withRedisTimeout(
        getRedisClient().expire(
          rateLimitKey,
          settings.captchaCreateWindowSeconds
        )
      );
    }
    if (attempts > settings.captchaCreateLimit) {
      throw new HttpException(
        {
          code: "CAPTCHA_RATE_LIMITED",
          message: "captcha creation is temporarily rate limited",
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    const id = randomBytes(18).toString("base64url");
    const { code, imageDataUri } = createCaptchaImage();
    await withRedisTimeout(
      getRedisClient().set(
        redisKey(CAPTCHA_PREFIX, id),
        JSON.stringify({
          attempts: 0,
          codeHash: hmac(settings.captchaHmacSecret, code),
        }),
        "EX",
        settings.captchaTtlSeconds
      )
    );
    return settings.testCaptcha
      ? { id, imageDataUri, testCode: code }
      : { id, imageDataUri };
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
        redisKey(CAPTCHA_PREFIX, id),
        hmac(settings.captchaHmacSecret, code.trim().toUpperCase()),
        String(settings.captchaAttempts)
      )
    );
    return result === 1;
  }

  async createAccount(input: AccountInput, context: RequestContext) {
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new BadRequestException({
        code: "IDEMPOTENCY_KEY_INVALID",
        message: "idempotencyKey is required",
      });
    }
    requiredString(input.password, "password");
    const data = {
      active: input.active === false ? false : true,
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
    const requestHash = createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");
    const expiresAt = new Date(Date.now() + 86_400_000);
    const create = () =>
      db.$transaction(async (transaction) => {
        const existing = await transaction.accountCreateIdempotency.findUnique({
          include: { account: true },
          where: { key: idempotencyKey },
        });
        if (existing && existing.expiresAt > new Date()) {
          if (existing.requestHash !== requestHash) {
            throw new BadRequestException({
              code: "IDEMPOTENCY_CONFLICT",
              message: "idempotencyKey was used with a different request",
            });
          }
          if (existing.account && !existing.account.deletedAt) return existing.account;
          throw new BadRequestException({
            code: "IDEMPOTENCY_IN_PROGRESS",
            message: "idempotencyKey request is still being processed",
          });
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
        data: {
          email: data.email,
          passwordAlgorithm: "legacy-md5",
          passwordChangedAt: new Date(),
          passwordHash: passwordHash(input.password),
          phone: data.phone,
          status: data.active ? "active" : "disabled",
          username: data.username,
        },
        });
        await transaction.accountCreateIdempotency.update({
          data: { accountId: created.id },
          where: { key: idempotencyKey },
        });
        return created;
      });
    let account;
    try {
      account = await create();
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
          ? error.code
          : undefined;
      if (code !== "P2002") throw error;
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
        throw error;
      }
    }
    await this.audit({ accountId: account.id, context, eventType: "account.create", success: true });
    return publicAccount(account);
  }

  async getAccount(id: string) {
    const account = await db.account.findUnique({ where: { id } });
    if (!account || account.deletedAt) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND", message: "account not found" });
    return publicAccount(account);
  }

  async batchGet(ids: string[]) {
    const accounts = await db.account.findMany({ where: { deletedAt: null, id: { in: ids } } });
    const byId = new Map(accounts.map((account) => [account.id, publicAccount(account)]));
    return ids.flatMap((id) => {
      const account = byId.get(id);
      return account ? [account] : [];
    });
  }

  async listAccounts(limit: number, offset: number, basePath: string) {
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
        type: "accounts",
      })),
      links: {
        self: query(offset),
        ...(nextOffset < total ? { next: query(nextOffset) } : {}),
      },
      meta: { page: { limit, offset, total } },
    };
  }

  async patchAccount(id: string, input: Omit<AccountInput, "password" | "idempotencyKey">, context: RequestContext) {
    await this.getAccount(id);
    const account = await db.account.update({
      data: {
        ...(input.email !== undefined ? { email: input.email === null ? null : normalizeEmail(input.email) } : {}),
        ...(input.phone !== undefined ? { phone: input.phone === null ? null : normalizePhone(input.phone) } : {}),
        ...(input.username !== undefined ? { username: normalizeUsername(input.username) } : {}),
        ...(input.active !== undefined ? { status: input.active ? "active" : "disabled" } : {}),
      },
      where: { id },
    });
    await this.audit({ accountId: id, context, eventType: "account.update", success: true });
    return publicAccount(account);
  }

  async changePassword(id: string, password: string, context: RequestContext) {
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
    await this.audit({ accountId: id, context, eventType: "password.change", success: true });
  }

  async deleteAccount(id: string, context: RequestContext) {
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

  async login(input: { captchaCode: string; captchaId: string; login: string; password: string }, context: RequestContext) {
    const rawLogin = requiredString(input.login, "login").trim();
    const normalizedLogin = rawLogin.includes("@")
      ? normalizeEmail(rawLogin)
      : /^[a-zA-Z]/.test(rawLogin)
        ? normalizeUsername(rawLogin)
        : normalizePhone(rawLogin);
    requiredString(input.password, "password");
    const failureKey = redisKey(LOGIN_FAILURE_PREFIX, normalizedLogin);
    const failures = Number((await withRedisTimeout(getRedisClient().get(failureKey))) ?? "0");
    if (failures >= settings.loginAttempts) throw new UnauthorizedException({ code: "LOGIN_LOCKED", message: "login temporarily locked" });
    if (!(await this.verifyCaptcha(input.captchaId, input.captchaCode))) {
      await this.loginFailure(failureKey, context);
      throw new UnauthorizedException({ code: "CAPTCHA_INVALID", message: "captcha is invalid or expired" });
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
    if (account && account.passwordAlgorithm !== "legacy-md5") {
      await this.loginFailure(failureKey, context, account.id);
      throw new UnauthorizedException({
        code: "LOGIN_INVALID",
        message: "invalid login or password",
      });
    }
    if (!account || account.status !== "active" || account.deletedAt || !verifyPassword(account.passwordHash, input.password)) {
      await this.loginFailure(failureKey, context, account?.id);
      throw new UnauthorizedException({ code: "LOGIN_INVALID", message: "invalid login or password" });
    }
    await withRedisTimeout(getRedisClient().del(failureKey));
    const refreshKey = randomBytes(32).toString("base64url");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + settings.refreshTtlSeconds * 1000);
    const session = await db.session.create({
      data: {
        accountId: account.id,
        expiresAt,
        refreshKeyHash: hmac(settings.primary.secret, refreshKey),
        refreshKeyHmacKeyId: settings.primary.id,
      },
    });
    const token = accessToken(account.id, session.id);
    await this.audit({
      accountId: account.id,
      context,
      eventType: "login",
      sessionId: session.id,
      success: true,
    });
    return { accessToken: token.token, accessTokenExpiresAt: token.expiresAt, accountId: account.id, refreshExpiresAt: expiresAt, refreshKey, sessionId: session.id };
  }

  private async loginFailure(key: string, context: RequestContext, accountId?: string) {
    await withRedisTimeout(getRedisClient().incr(key));
    await withRedisTimeout(getRedisClient().expire(key, settings.loginLockSeconds));
    await this.audit({ accountId, context, eventType: "login", success: false });
  }

  async refresh(refreshKey: string, context: RequestContext) {
    const candidates = [settings.primary, settings.secondary].filter((key): key is { id: string; secret: string } => Boolean(key));
    const sessions = (await Promise.all(candidates.map((key) => db.session.findMany({
      where: { expiresAt: { gt: new Date() }, refreshKeyHash: hmac(key.secret, refreshKey), refreshKeyHmacKeyId: key.id },
    })))).flat();
    if (sessions.length !== 1) {
      await this.audit({ context, eventType: "refresh", success: false });
      throw new UnauthorizedException({ code: "REFRESH_INVALID", message: "refresh key is invalid" });
    }
    const session = sessions[0];
    const account = await db.account.findUnique({ where: { id: session.accountId } });
    if (!account || account.deletedAt || account.status !== "active") {
      await this.audit({
        accountId: session.accountId,
        context,
        eventType: "refresh",
        sessionId: session.id,
        success: false,
      });
      throw new UnauthorizedException({ code: "REFRESH_INVALID", message: "refresh key is invalid" });
    }
    const token = accessToken(account.id, session.id);
    await this.audit({
      accountId: account.id,
      context,
      eventType: "refresh",
      sessionId: session.id,
      success: true,
    });
    return { accessToken: token.token, accessTokenExpiresAt: token.expiresAt, accountId: account.id, refreshExpiresAt: session.expiresAt, refreshKey, sessionId: session.id };
  }

  async listSessions(accountId: string) {
    await this.getAccount(accountId);
    const sessions = await db.session.findMany({
      orderBy: { createdAt: "asc" },
      where: { accountId, expiresAt: { gt: new Date() } },
    });
    return sessions.map(({ accountId: _accountId, refreshKeyHash: _hash, refreshKeyHmacKeyId: _keyId, ...session }) => session);
  }

  async revokeSessions(
    accountId: string,
    context: RequestContext,
    reason: string,
    sessionId?: string
  ) {
    await db.session.deleteMany({ where: sessionId ? { accountId, id: sessionId } : { accountId } });
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

