import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import {
  type Account,
  checkDbHealth,
  db,
  type Prisma,
  type Tenant,
  type TenantApiKey,
} from "@repo/db";
import {
  checkRedisHealth,
  getRedisClient,
  withRedisTimeout,
} from "@repo/redis";
import svgCaptcha from "svg-captcha";

import {
  ACCESS_TOKEN_INVALID_MESSAGE,
  signAccessToken,
  verifyAuthorizationHeader,
} from "./access-token";
import { loadStargateConfig, type StargateConfig } from "./config";
import type {
  AccessTokenClaims,
  AccountCollection,
  AccountInput,
  AccountPatchInput,
  ActorType,
  AdminScope,
  AuthTokens,
  Captcha,
  CreatedTenantApiKey,
  HealthCheck,
  LoginInput,
  PublicAccount,
  PublicTenant,
  PublicTenantApiKey,
  RequestContext,
  Session,
  StargateErrorCode,
  StargateHealth,
  StargateServiceContract,
  TenantApiKeyCollection,
  TenantApiKeyInput,
  TenantApiKeyPatchInput,
  TenantCollection,
  TenantInput,
  TenantPatchInput,
  TenantScope,
  TenantSettings,
  TenantStatus,
} from "./contracts";
import { serviceError } from "./errors";

const DEFAULT_TENANT_ID = "default";
const TENANT_ID_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const TENANT_ID_MAX_LENGTH = 63;
const TENANT_API_KEY_PREFIX = "stk_";
const CAPTCHA_PREFIX = "captcha:";
const CAPTCHA_RATE_LIMIT_PREFIX = "captcha-rate-limit:";
const LOGIN_FAILURE_PREFIX = "login-failure:";
const PASSWORD_CHANGE_FAILURE_PREFIX = "password-change-failure:";
const SALT_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CAPTCHA_CHAR_PRESET = "abcd1234abcd1234HJKLMNPQRSTUVWXYZ23456789";
const USERNAME_PATTERN = /^[a-z][a-z0-9._-]*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?\d+$/;
const PASSWORD_HASH_PATTERN = /^[a-zA-Z0-9]{13}[a-f0-9]{32}$/;
const LETTER_PATTERN = /^[a-zA-Z]/;
const LOGIN_FAILURE_SCRIPT = `local count = redis.call("INCR", KEYS[1])
if count == 1 or count >= tonumber(ARGV[1]) then
  redis.call("EXPIRE", KEYS[1], tonumber(ARGV[2]))
end
return count`;
// 自改锁与登录锁刻意保留独立脚本、配置和 key：登录锁是第 N 次仍返回
// LOGIN_INVALID、第 N+1 次才返回 LOGIN_LOCKED；自改锁在第 N 次错误时即返回
// PASSWORD_CHANGE_LOCKED。二者的阈值语义必须独立演进。
const PASSWORD_CHANGE_FAILURE_SCRIPT = `local count = redis.call("INCR", KEYS[1])
if count == 1 or count >= tonumber(ARGV[1]) then
  redis.call("EXPIRE", KEYS[1], tonumber(ARGV[2]))
end
return count`;
const CAPTCHA_RATE_LIMIT_SCRIPT = `local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], tonumber(ARGV[1]))
end
return count`;

type IdempotencyFingerprintV3 = {
  active: boolean;
  email: string | null;
  passwordDigest: string;
  phone: string | null;
  tenantId: string;
  username: string;
  version: 3;
};

type CredentialScopeInput = {
  actorId?: string;
  actorType: ActorType;
  tenantId: string;
};

type LegacyIdempotencyFingerprint = {
  active: boolean;
  email: string | null;
  passwordDigest: string;
  phone: string | null;
  username: string;
  version: 2;
};

type IdempotencyRecord = Prisma.AccountCreateIdempotencyGetPayload<{
  include: { account: true };
}>;

type IdempotencyResolution = {
  account: Account;
  upgradeLegacyHash: boolean;
};

type AuditInput = {
  accountId?: string;
  actorId?: string;
  actorType: ActorType;
  context: RequestContext;
  eventType: string;
  metadata?: Record<string, string>;
  sessionId?: string;
  success: boolean;
  tenantId: string;
};

type DatabaseClient = Prisma.TransactionClient | typeof db;

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function requiredString(
  value: unknown,
  code: StargateErrorCode,
  message: string
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw serviceError(code, message, "invalid_argument");
  }
  return value;
}

function allowedKeysOnly(body: Record<string, unknown>, keys: string[]): void {
  const allowed = new Set(keys);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw serviceError(
      "PASSWORD_INVALID",
      "request body contains unsupported fields",
      "invalid_argument"
    );
  }
}

function plainObject(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw serviceError(
      "PASSWORD_INVALID",
      "request body must be a JSON object",
      "invalid_argument"
    );
  }
  return value as Record<string, unknown>;
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
  createdAt: Date;
  email: string | null;
  id: string;
  phone: string | null;
  status: string;
  tenantId: string;
  updatedAt: Date;
  username: string;
}): PublicAccount {
  return {
    active: account.status === "active",
    createdAt: toIso(account.createdAt),
    email: account.email,
    id: account.id,
    phone: account.phone,
    tenantId: account.tenantId,
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

function readTenantSettings(value: unknown): TenantSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const settings = value as Record<string, unknown>;
  return typeof settings.loginCaptchaRequired === "boolean"
    ? { loginCaptchaRequired: settings.loginCaptchaRequired }
    : {};
}

function normalizeTenantSettings(
  value: unknown,
  code: StargateErrorCode
): TenantSettings {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw serviceError(
      code,
      "settings must be a JSON object",
      "invalid_argument"
    );
  }
  const settings = value as Record<string, unknown>;
  if (
    Object.keys(settings).some((key) => key !== "loginCaptchaRequired") ||
    (settings.loginCaptchaRequired !== undefined &&
      typeof settings.loginCaptchaRequired !== "boolean")
  ) {
    throw serviceError(
      code,
      "settings.loginCaptchaRequired must be a boolean",
      "invalid_argument"
    );
  }
  return readTenantSettings(settings);
}

function tenantSettingsRequiresCaptcha(value: unknown): boolean {
  return readTenantSettings(value).loginCaptchaRequired !== false;
}

function publicTenant(tenant: Tenant): PublicTenant {
  return {
    createdAt: toIso(tenant.createdAt),
    id: tenant.id,
    name: tenant.name,
    status: tenant.status as TenantStatus,
    settings: readTenantSettings(tenant.settings),
    updatedAt: toIso(tenant.updatedAt),
  };
}

function publicTenantApiKey(key: {
  createdAt: Date;
  firstFour: string;
  id: string;
  name: string | null;
  tenantId: string;
  updatedAt: Date;
}): PublicTenantApiKey {
  return {
    createdAt: toIso(key.createdAt),
    firstFour: key.firstFour,
    id: key.id,
    name: key.name,
    tenantId: key.tenantId,
    updatedAt: toIso(key.updatedAt),
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

  private tenantScope(input: {
    actorId?: string;
    actorType: ActorType;
    tenantId: string;
  }): TenantScope {
    return input as unknown as TenantScope;
  }

  private adminScope(): AdminScope {
    return { actorType: "admin" } as unknown as AdminScope;
  }

  private constantTimeEquals(
    supplied: string | undefined,
    expected: string
  ): boolean {
    const suppliedDigest = createHash("sha256")
      .update(supplied ?? "")
      .digest();
    const expectedDigest = createHash("sha256").update(expected).digest();
    return timingSafeEqual(suppliedDigest, expectedDigest);
  }

  private parseTenantHeader(raw: string | undefined): string | undefined {
    if (raw === undefined) {
      return;
    }
    if (
      raw.length < 1 ||
      raw.length > TENANT_ID_MAX_LENGTH ||
      !TENANT_ID_PATTERN.test(raw)
    ) {
      throw serviceError(
        "TENANT_INVALID",
        "tenant is invalid",
        "unauthenticated"
      );
    }
    return raw;
  }

  private assertTenantId(value: string): string {
    if (
      value === DEFAULT_TENANT_ID ||
      value.length < 1 ||
      value.length > TENANT_ID_MAX_LENGTH ||
      !TENANT_ID_PATTERN.test(value)
    ) {
      throw serviceError(
        "TENANT_ID_INVALID",
        "tenant id is invalid",
        "invalid_argument"
      );
    }
    return value;
  }

  private assertTenantIdFormat(value: string): void {
    if (
      value.length < 1 ||
      value.length > TENANT_ID_MAX_LENGTH ||
      !TENANT_ID_PATTERN.test(value)
    ) {
      throw serviceError("TENANT_NOT_FOUND", "tenant not found", "not_found");
    }
  }

  private async requireActiveTenant(id: string): Promise<Tenant> {
    const tenant = await db.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw serviceError(
        "TENANT_INVALID",
        "tenant is invalid",
        "unauthenticated"
      );
    }
    if (tenant.status !== "active") {
      throw serviceError(
        "TENANT_DISABLED",
        "tenant is disabled",
        "unauthenticated"
      );
    }
    return tenant;
  }

  private async findTenantApiKey(apiKey: string): Promise<TenantApiKey | null> {
    const candidates = [
      this.settings.tenantApiKeyPrimary,
      this.settings.tenantApiKeySecondary,
    ]
      .filter((key): key is { id: string; secret: string } => key !== undefined)
      .map((key) => ({
        hash: hmac(key.secret, apiKey),
        hmacKeyId: key.id,
      }));

    const record = await db.tenantApiKey.findFirst({
      where: { OR: candidates },
    });
    if (!record) {
      return null;
    }

    const candidate = candidates.find(
      (value) => value.hmacKeyId === record.hmacKeyId
    );
    if (!candidate) {
      return null;
    }
    const left = Buffer.from(record.hash, "hex");
    const right = Buffer.from(candidate.hash, "hex");
    if (
      left.length !== 32 ||
      right.length !== 32 ||
      !timingSafeEqual(left, right)
    ) {
      return null;
    }
    return record;
  }

  private parseCredentialTenantHeader(
    tenantHeader: string | undefined
  ): string | undefined {
    try {
      return this.parseTenantHeader(tenantHeader);
    } catch {
      throw serviceError(
        "TENANT_INVALID",
        "tenant is invalid",
        "unauthenticated"
      );
    }
  }

  private credentialScopeInput(
    isAdmin: boolean,
    isService: boolean,
    tenantKey: TenantApiKey | null,
    requested: string | undefined
  ): CredentialScopeInput {
    if (isAdmin) {
      return {
        actorType: "admin",
        tenantId: requested ?? DEFAULT_TENANT_ID,
      };
    }
    if (isService) {
      if (requested && requested !== DEFAULT_TENANT_ID) {
        throw serviceError(
          "API_KEY_INVALID",
          "invalid API key",
          "unauthenticated"
        );
      }
      return { actorType: "service", tenantId: DEFAULT_TENANT_ID };
    }
    if (!tenantKey || (requested && requested !== tenantKey.tenantId)) {
      throw serviceError(
        "API_KEY_INVALID",
        "invalid API key",
        "unauthenticated"
      );
    }
    return {
      actorId: tenantKey.id,
      actorType: "tenant_key",
      tenantId: tenantKey.tenantId,
    };
  }

  async resolveApiCredential(
    apiKey: string | undefined,
    tenantHeader: string | undefined
  ): Promise<TenantScope> {
    const isAdmin = this.constantTimeEquals(apiKey, this.settings.adminApiKey);
    const isService = this.constantTimeEquals(apiKey, this.settings.apiKey);
    const tenantKey =
      isAdmin || isService ? null : await this.findTenantApiKey(apiKey ?? "");
    if (!(isAdmin || isService || tenantKey)) {
      throw serviceError(
        "API_KEY_INVALID",
        "invalid API key",
        "unauthenticated"
      );
    }
    const requested = this.parseCredentialTenantHeader(tenantHeader);
    const scopeInput = this.credentialScopeInput(
      isAdmin,
      isService,
      tenantKey,
      requested
    );
    await this.requireActiveTenant(scopeInput.tenantId);
    return this.tenantScope(scopeInput);
  }

  resolveAdminCredential(apiKey: string | undefined): AdminScope {
    if (!this.constantTimeEquals(apiKey, this.settings.adminApiKey)) {
      throw serviceError(
        "API_KEY_INVALID",
        "invalid admin API key",
        "unauthenticated"
      );
    }
    return this.adminScope();
  }

  accessTokenClaims(authorization: string | undefined): AccessTokenClaims {
    return verifyAuthorizationHeader(authorization, {
      clockToleranceSeconds: this.settings.clockToleranceSeconds,
      secret: this.settings.jwtSecret,
    });
  }

  private redisKey(prefix: string, tenantId: string, suffix: string): string {
    return `${this.settings.redisKeyPrefix}${prefix}${encodeURIComponent(tenantId)}:${suffix}`;
  }

  private idempotencyFingerprint(
    tenantId: string,
    data: {
      active: boolean;
      email: string | null;
      phone: string | null;
      username: string;
    },
    password: string
  ): string {
    const fingerprint: IdempotencyFingerprintV3 = {
      active: data.active,
      email: data.email,
      passwordDigest: createHmac("sha256", this.settings.jwtSecret)
        .update(password)
        .digest("hex"),
      phone: data.phone,
      tenantId,
      username: data.username,
      version: 3,
    };
    return createHash("sha256")
      .update(JSON.stringify(fingerprint))
      .digest("hex");
  }

  private legacyIdempotencyFingerprint(
    data: {
      active: boolean;
      email: string | null;
      phone: string | null;
      username: string;
    },
    password: string
  ): string {
    // TODO(cleanup-ticket: Ticket #232 follow-up): 生产升级后的存量 v2 幂等记录全部超过
    // ACCOUNT_CREATE_IDEMPOTENCY_TTL_SECONDS 后删除该兼容分支。
    const fingerprint: LegacyIdempotencyFingerprint = {
      active: data.active,
      email: data.email,
      passwordDigest: createHmac("sha256", this.settings.jwtSecret)
        .update(password)
        .digest("hex"),
      phone: data.phone,
      username: data.username,
      version: 2,
    };
    return createHash("sha256")
      .update(JSON.stringify(fingerprint))
      .digest("hex");
  }

  private resolveIdempotentAccount(
    existing: IdempotencyRecord | null,
    hashes: {
      legacyHash?: string;
      requestHash: string;
      tenantId: string;
    },
    now: Date
  ): IdempotencyResolution | undefined {
    if (!existing || existing.expiresAt <= now) {
      return;
    }
    const currentMatch = existing.requestHash === hashes.requestHash;
    const legacyMatch =
      hashes.tenantId === DEFAULT_TENANT_ID &&
      hashes.legacyHash !== undefined &&
      existing.requestHash === hashes.legacyHash;
    if (!(currentMatch || legacyMatch)) {
      throw serviceError(
        "IDEMPOTENCY_CONFLICT",
        "idempotencyKey was used with a different request",
        "invalid_argument"
      );
    }
    if (existing.account && !existing.account.deletedAt) {
      return {
        account: existing.account,
        upgradeLegacyHash: legacyMatch,
      };
    }
    throw serviceError(
      "IDEMPOTENCY_IN_PROGRESS",
      "idempotencyKey request is still being processed",
      "invalid_argument"
    );
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

  private async writeAudit(
    client: DatabaseClient,
    input: AuditInput
  ): Promise<void> {
    await client.authAuditEvent.create({
      data: {
        accountId: input.accountId,
        actorId: input.actorId,
        actorType: input.actorType,
        eventType: input.eventType,
        ip: input.context.ip,
        metadata: input.metadata,
        requestId: input.context.requestId,
        sessionId: input.sessionId,
        success: input.success,
        tenantId: input.tenantId,
        userAgent: input.context.userAgent,
      },
    });
  }

  private audit(input: AuditInput): Promise<void> {
    return this.writeAudit(db, input);
  }

  private selfChangePasswordAudit(
    claims: AccessTokenClaims,
    tenantId: string,
    context: RequestContext,
    reason: string
  ): Promise<void> {
    return this.audit({
      accountId: claims.accountId,
      actorId: claims.accountId,
      actorType: "account",
      context,
      eventType: "password.self_change",
      metadata: { reason },
      sessionId: claims.sessionId,
      success: false,
      tenantId,
    });
  }

  private async resolvePublicTenant(
    raw: string | undefined,
    failureCode: "LOGIN_INVALID" | "REFRESH_INVALID" | "TENANT_INVALID"
  ): Promise<Tenant> {
    let tenantId: string;
    try {
      tenantId = this.parseTenantHeader(raw) ?? DEFAULT_TENANT_ID;
    } catch {
      throw serviceError(failureCode, "tenant is invalid", "unauthenticated");
    }
    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || tenant.status !== "active") {
      throw serviceError(failureCode, "tenant is invalid", "unauthenticated");
    }
    return tenant;
  }

  async createCaptcha(
    tenantHeader: string | undefined,
    context: RequestContext
  ): Promise<Captcha> {
    const tenant = await this.resolvePublicTenant(
      tenantHeader,
      "TENANT_INVALID"
    );
    const tenantId = tenant.id;
    const client = context.ip ?? "unknown";
    const rateLimitKey = this.redisKey(
      CAPTCHA_RATE_LIMIT_PREFIX,
      tenantId,
      client
    );
    const attempts = Number(
      await withRedisTimeout(
        getRedisClient().eval(
          CAPTCHA_RATE_LIMIT_SCRIPT,
          1,
          rateLimitKey,
          String(this.settings.captchaCreateWindowSeconds)
        )
      )
    );
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
        this.redisKey(CAPTCHA_PREFIX, tenantId, id),
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

  async verifyCaptcha(
    tenantHeader: string | undefined,
    id: string,
    code: string
  ): Promise<boolean> {
    const tenant = await this.resolvePublicTenant(
      tenantHeader,
      "TENANT_INVALID"
    );
    return this.verifyCaptchaForTenant(tenant.id, id, code);
  }

  private async verifyCaptchaForTenant(
    tenantId: string,
    id: string | undefined,
    code: string | undefined
  ): Promise<boolean> {
    if (!(id && code)) {
      return false;
    }
    const result = await withRedisTimeout(
      getRedisClient().eval(
        `local raw = redis.call("GET", KEYS[1])
         if not raw then return 0 end
         local captcha = cjson.decode(raw)
         if captcha.codeHash == ARGV[1] then redis.call("DEL", KEYS[1]); return 1 end
         captcha.attempts = captcha.attempts + 1
         if captcha.attempts >= tonumber(ARGV[2]) then redis.call("DEL", KEYS[1])
         else
           local ttl = redis.call("PTTL", KEYS[1])
           if ttl > 0 then redis.call("PSETEX", KEYS[1], ttl, cjson.encode(captcha)) end
         end
         return -1`,
        1,
        this.redisKey(CAPTCHA_PREFIX, tenantId, id),
        hmac(this.settings.captchaHmacSecret, code.trim().toUpperCase()),
        String(this.settings.captchaAttempts)
      )
    );
    return result === 1;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 幂等创建包含存量兼容与竞争兜底。
  async createAccount(
    scope: TenantScope,
    input: AccountInput,
    context: RequestContext
  ): Promise<PublicAccount> {
    const idempotencyKey = input.idempotencyKey?.trim() || undefined;
    requiredString(input.password, "PASSWORD_INVALID", "password is required");
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
      tenantId: scope.tenantId,
      username: data.username,
    };

    let account: Awaited<ReturnType<typeof db.account.create>>;
    if (idempotencyKey) {
      const requestHash = this.idempotencyFingerprint(
        scope.tenantId,
        data,
        input.password
      );
      const legacyHash =
        scope.tenantId === DEFAULT_TENANT_ID
          ? this.legacyIdempotencyFingerprint(data, input.password)
          : undefined;
      const hashes = { legacyHash, requestHash, tenantId: scope.tenantId };
      const expiresAt = new Date(
        Date.now() + this.settings.accountCreateIdempotencyTtlSeconds * 1000
      );
      const compoundKey = {
        key: idempotencyKey,
        tenantId: scope.tenantId,
      };
      const create = () =>
        db.$transaction(async (transaction) => {
          const existing =
            await transaction.accountCreateIdempotency.findUnique({
              include: { account: true },
              where: { tenantId_key: compoundKey },
            });
          const resolved = this.resolveIdempotentAccount(
            existing,
            hashes,
            new Date()
          );
          if (resolved) {
            if (resolved.upgradeLegacyHash) {
              await transaction.accountCreateIdempotency.update({
                data: { requestHash },
                where: { tenantId_key: compoundKey },
              });
            }
            return resolved.account;
          }
          if (existing) {
            await transaction.accountCreateIdempotency.delete({
              where: { tenantId_key: compoundKey },
            });
          }
          await transaction.accountCreateIdempotency.create({
            data: {
              expiresAt,
              key: idempotencyKey,
              requestHash,
              tenantId: scope.tenantId,
            },
          });
          const created = await transaction.account.create({
            data: accountData,
          });
          await transaction.accountCreateIdempotency.update({
            data: { accountId: created.id },
            where: { tenantId_key: compoundKey },
          });
          return created;
        });
      try {
        account = await create();
      } catch (error) {
        if (!isPrismaCode(error, "P2002")) {
          throw error;
        }
        const resolved = await db.$transaction(async (transaction) => {
          const existing =
            await transaction.accountCreateIdempotency.findUnique({
              include: { account: true },
              where: { tenantId_key: compoundKey },
            });
          const result = this.resolveIdempotentAccount(
            existing,
            hashes,
            new Date()
          );
          if (result?.upgradeLegacyHash) {
            await transaction.accountCreateIdempotency.update({
              data: { requestHash },
              where: { tenantId_key: compoundKey },
            });
          }
          return result?.account;
        });
        if (!resolved) {
          throw serviceError(
            "ACCOUNT_IDENTIFIER_CONFLICT",
            "username, email, or phone is already in use",
            "conflict"
          );
        }
        account = resolved;
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
      actorId: scope.actorId,
      actorType: scope.actorType,
      context,
      eventType: "account.create",
      success: true,
      tenantId: scope.tenantId,
    });
    return publicAccount(account);
  }

  async getAccount(scope: TenantScope, id: string): Promise<PublicAccount> {
    const account = await db.account.findFirst({
      where: { id, tenantId: scope.tenantId },
    });
    if (!account || account.deletedAt) {
      throw serviceError("ACCOUNT_NOT_FOUND", "account not found", "not_found");
    }
    return publicAccount(account);
  }

  async batchGet(scope: TenantScope, ids: string[]): Promise<PublicAccount[]> {
    const accounts = await db.account.findMany({
      where: {
        deletedAt: null,
        id: { in: ids },
        tenantId: scope.tenantId,
      },
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
    scope: TenantScope,
    limit: number,
    offset: number,
    basePath: string
  ): Promise<AccountCollection> {
    const where = { deletedAt: null, tenantId: scope.tenantId };
    const [accounts, total] = await db.$transaction([
      db.account.findMany({
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        where,
      }),
      db.account.count({ where }),
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
    scope: TenantScope,
    id: string,
    input: AccountPatchInput,
    context: RequestContext
  ): Promise<PublicAccount> {
    await this.getAccount(scope, id);
    const data = {
      ...(input.email !== undefined
        ? { email: input.email === null ? null : normalizeEmail(input.email) }
        : {}),
      ...(input.phone !== undefined
        ? { phone: input.phone === null ? null : normalizePhone(input.phone) }
        : {}),
      ...(input.username !== undefined
        ? { username: normalizeUsername(input.username) }
        : {}),
      ...(input.active !== undefined
        ? { status: input.active ? "active" : "disabled" }
        : {}),
    };
    try {
      if (input.active === false) {
        await db.$transaction([
          db.session.deleteMany({
            where: { accountId: id, tenantId: scope.tenantId },
          }),
          db.account.updateMany({
            data,
            where: { id, tenantId: scope.tenantId },
          }),
        ]);
        await this.audit({
          accountId: id,
          actorId: scope.actorId,
          actorType: scope.actorType,
          context,
          eventType: "session.revoke",
          metadata: { reason: "account_disable" },
          success: true,
          tenantId: scope.tenantId,
        });
      } else {
        await db.account.updateMany({
          data,
          where: { id, tenantId: scope.tenantId },
        });
      }
      await this.audit({
        accountId: id,
        actorId: scope.actorId,
        actorType: scope.actorType,
        context,
        eventType: "account.update",
        success: true,
        tenantId: scope.tenantId,
      });
      return this.getAccount(scope, id);
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
    scope: TenantScope,
    id: string,
    password: string,
    context: RequestContext
  ): Promise<void> {
    await this.getAccount(scope, id);
    requiredString(password, "PASSWORD_INVALID", "password is required");
    await db.$transaction([
      db.session.deleteMany({
        where: { accountId: id, tenantId: scope.tenantId },
      }),
      db.account.updateMany({
        data: {
          passwordAlgorithm: "legacy-md5",
          passwordChangedAt: new Date(),
          passwordHash: passwordHash(password),
        },
        where: { id, tenantId: scope.tenantId },
      }),
    ]);
    await this.audit({
      accountId: id,
      actorId: scope.actorId,
      actorType: scope.actorType,
      context,
      eventType: "password.change",
      success: true,
      tenantId: scope.tenantId,
    });
  }

  async deleteAccount(
    scope: TenantScope,
    id: string,
    context: RequestContext
  ): Promise<void> {
    const account = await db.account.findFirst({
      where: { id, tenantId: scope.tenantId },
    });
    if (!account) {
      throw serviceError("ACCOUNT_NOT_FOUND", "account not found", "not_found");
    }
    if (account.deletedAt) {
      return;
    }
    const [, deleted] = await db.$transaction([
      db.session.deleteMany({
        where: { accountId: id, tenantId: scope.tenantId },
      }),
      db.account.updateMany({
        data: {
          deletedAt: new Date(),
          email: null,
          phone: null,
          username: `deleted:${account.id}`,
        },
        where: { deletedAt: null, id, tenantId: scope.tenantId },
      }),
    ]);
    if (deleted.count === 0) {
      return;
    }
    await this.audit({
      accountId: id,
      actorId: scope.actorId,
      actorType: scope.actorType,
      context,
      eventType: "account.delete",
      metadata: { reason: "account_delete" },
      success: true,
      tenantId: scope.tenantId,
    });
  }

  async login(
    tenantHeader: string | undefined,
    input: LoginInput,
    context: RequestContext
  ): Promise<AuthTokens> {
    const tenant = await this.resolvePublicTenant(
      tenantHeader,
      "LOGIN_INVALID"
    );
    const tenantId = tenant.id;
    const rawLogin = requiredString(
      input.login,
      "LOGIN_IDENTIFIER_INVALID",
      "login is required"
    ).trim();
    const normalizedLogin = this.normalizeLoginForLookup(rawLogin);
    requiredString(input.password, "PASSWORD_INVALID", "password is required");
    const failureKey = this.redisKey(
      LOGIN_FAILURE_PREFIX,
      tenantId,
      normalizedLogin
    );
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
    if (tenantSettingsRequiresCaptcha(tenant.settings)) {
      if (input.captchaCode === undefined) {
        throw serviceError(
          "CAPTCHA_CODE_INVALID",
          "captcha code is required",
          "invalid_argument"
        );
      }
      if (input.captchaId === undefined) {
        throw serviceError(
          "CAPTCHA_ID_INVALID",
          "captcha id is required",
          "invalid_argument"
        );
      }
      if (
        !(await this.verifyCaptchaForTenant(
          tenantId,
          input.captchaId,
          input.captchaCode
        ))
      ) {
        await this.loginFailure(failureKey, tenantId, context);
        throw serviceError(
          "CAPTCHA_INVALID",
          "captcha is invalid or expired",
          "unauthenticated"
        );
      }
    }
    const account = await db.account.findFirst({
      where: {
        OR: [
          { username: normalizedLogin },
          { email: normalizedLogin },
          { phone: normalizedLogin },
        ],
        tenantId,
      },
    });
    if (
      !account ||
      account.passwordAlgorithm !== "legacy-md5" ||
      account.status !== "active" ||
      account.deletedAt ||
      !verifyPassword(account.passwordHash, input.password)
    ) {
      await this.loginFailure(failureKey, tenantId, context, account?.id);
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
        tenantId,
      },
    });
    const token = signAccessToken({
      accountId: account.id,
      secret: this.settings.jwtSecret,
      sessionId: session.id,
      tenantId,
      ttlSeconds: this.settings.tokenTtlSeconds,
    });
    await this.audit({
      accountId: account.id,
      actorId: account.id,
      actorType: "account",
      context,
      eventType: "login",
      sessionId: session.id,
      success: true,
      tenantId,
    });
    return {
      accessToken: token.token,
      accessTokenExpiresAt: toIso(token.expiresAt),
      accountId: account.id,
      refreshExpiresAt: toIso(expiresAt),
      refreshKey,
      sessionId: session.id,
      tenantId,
    };
  }

  private async loginFailure(
    key: string,
    tenantId: string,
    context: RequestContext,
    accountId?: string
  ): Promise<void> {
    await withRedisTimeout(
      getRedisClient().eval(
        LOGIN_FAILURE_SCRIPT,
        1,
        key,
        String(this.settings.loginAttempts),
        String(this.settings.loginLockSeconds)
      )
    );
    await this.audit({
      accountId,
      actorId: accountId,
      actorType: accountId ? "account" : "anonymous",
      context,
      eventType: "login",
      success: false,
      tenantId,
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

  private normalizeLoginForLookup(rawLogin: string): string {
    try {
      return this.normalizeLogin(rawLogin);
    } catch {
      return rawLogin.toLowerCase();
    }
  }

  async refresh(
    tenantHeader: string | undefined,
    refreshKey: string,
    context: RequestContext
  ): Promise<AuthTokens> {
    const tenant = await this.resolvePublicTenant(
      tenantHeader,
      "REFRESH_INVALID"
    );
    const tenantId = tenant.id;
    const candidates = [this.settings.primary, this.settings.secondary]
      .filter((key): key is { id: string; secret: string } => key !== undefined)
      .map((key) => ({
        refreshKeyHash: hmac(key.secret, refreshKey),
        refreshKeyHmacKeyId: key.id,
      }));
    const sessions = await db.session.findMany({
      where: {
        expiresAt: { gt: new Date() },
        OR: candidates,
        tenantId,
      },
    });
    if (sessions.length !== 1) {
      await this.audit({
        actorType: "anonymous",
        context,
        eventType: "refresh",
        success: false,
        tenantId,
      });
      throw serviceError(
        "REFRESH_INVALID",
        "refresh key is invalid",
        "unauthenticated"
      );
    }
    const session = sessions[0] as (typeof sessions)[number];
    const account = await db.account.findFirst({
      where: { id: session.accountId, tenantId },
    });
    if (
      !account ||
      account.deletedAt ||
      account.status !== "active" ||
      session.tenantId !== account.tenantId
    ) {
      await this.audit({
        accountId: session.accountId,
        actorId: session.accountId,
        actorType: "account",
        context,
        eventType: "refresh",
        sessionId: session.id,
        success: false,
        tenantId,
      });
      throw serviceError(
        "REFRESH_INVALID",
        "refresh key is invalid",
        "unauthenticated"
      );
    }
    const token = signAccessToken({
      accountId: account.id,
      secret: this.settings.jwtSecret,
      sessionId: session.id,
      tenantId,
      ttlSeconds: this.settings.tokenTtlSeconds,
    });
    await this.audit({
      accountId: account.id,
      actorId: account.id,
      actorType: "account",
      context,
      eventType: "refresh",
      sessionId: session.id,
      success: true,
      tenantId,
    });
    return {
      accessToken: token.token,
      accessTokenExpiresAt: toIso(token.expiresAt),
      accountId: account.id,
      refreshExpiresAt: toIso(session.expiresAt),
      refreshKey,
      sessionId: session.id,
      tenantId,
    };
  }

  async logout(
    tenantHeader: string | undefined,
    authorization: string | undefined,
    context: RequestContext
  ): Promise<void> {
    let tenantId: string;
    try {
      tenantId = this.parseTenantHeader(tenantHeader) ?? DEFAULT_TENANT_ID;
    } catch {
      throw serviceError(
        "ACCESS_TOKEN_INVALID",
        "access token is invalid",
        "unauthenticated"
      );
    }
    const claims = this.accessTokenClaims(authorization);
    if (claims.tenantId !== tenantId) {
      throw serviceError(
        "ACCESS_TOKEN_INVALID",
        "access token is invalid",
        "unauthenticated"
      );
    }
    await db.session.deleteMany({
      where: {
        accountId: claims.accountId,
        id: claims.sessionId,
        tenantId,
      },
    });
    await this.audit({
      accountId: claims.accountId,
      actorId: claims.accountId,
      actorType: "account",
      context,
      eventType: "logout",
      metadata: { reason: "logout" },
      sessionId: claims.sessionId,
      success: true,
      tenantId,
    });
  }

  async selfChangePassword(
    tenantHeader: string | undefined,
    authorization: string | undefined,
    rawBody: unknown,
    context: RequestContext
  ): Promise<void> {
    let tenantId: string;
    try {
      tenantId = this.parseTenantHeader(tenantHeader) ?? DEFAULT_TENANT_ID;
    } catch {
      throw serviceError(
        "ACCESS_TOKEN_INVALID",
        ACCESS_TOKEN_INVALID_MESSAGE,
        "unauthenticated"
      );
    }

    const claims = this.accessTokenClaims(authorization);
    if (claims.tenantId !== tenantId) {
      throw serviceError(
        "ACCESS_TOKEN_INVALID",
        ACCESS_TOKEN_INVALID_MESSAGE,
        "unauthenticated"
      );
    }

    const account = await db.account.findFirst({
      where: { id: claims.accountId, tenantId },
    });
    if (
      !account ||
      account.deletedAt ||
      account.status !== "active" ||
      account.passwordAlgorithm !== "legacy-md5"
    ) {
      await this.selfChangePasswordAudit(
        claims,
        tenantId,
        context,
        "account_unavailable"
      );
      throw serviceError(
        "ACCESS_TOKEN_INVALID",
        ACCESS_TOKEN_INVALID_MESSAGE,
        "unauthenticated"
      );
    }

    const failureKey = this.redisKey(
      PASSWORD_CHANGE_FAILURE_PREFIX,
      tenantId,
      claims.accountId
    );
    const failures = Number(
      (await withRedisTimeout(getRedisClient().get(failureKey))) ?? "0"
    );
    if (failures >= this.settings.passwordChangeAttempts) {
      await this.selfChangePasswordAudit(
        claims,
        tenantId,
        context,
        "password_change_locked"
      );
      throw serviceError(
        "PASSWORD_CHANGE_LOCKED",
        "password change temporarily locked",
        "rate_limited"
      );
    }

    const body = plainObject(rawBody);
    allowedKeysOnly(body, ["currentPassword", "newPassword"]);
    const currentPassword = requiredString(
      body.currentPassword,
      "PASSWORD_INVALID",
      "currentPassword is required"
    );
    const newPassword = requiredString(
      body.newPassword,
      "PASSWORD_INVALID",
      "newPassword is required"
    );
    if (newPassword === currentPassword) {
      throw serviceError(
        "PASSWORD_INVALID",
        "newPassword must differ from currentPassword",
        "invalid_argument"
      );
    }

    if (!verifyPassword(account.passwordHash, currentPassword)) {
      const count = Number(
        await withRedisTimeout(
          getRedisClient().eval(
            PASSWORD_CHANGE_FAILURE_SCRIPT,
            1,
            failureKey,
            String(this.settings.passwordChangeAttempts),
            String(this.settings.passwordChangeLockSeconds)
          )
        )
      );
      if (count >= this.settings.passwordChangeAttempts) {
        await this.selfChangePasswordAudit(
          claims,
          tenantId,
          context,
          "password_change_locked"
        );
        throw serviceError(
          "PASSWORD_CHANGE_LOCKED",
          "password change temporarily locked",
          "rate_limited"
        );
      }
      await this.selfChangePasswordAudit(
        claims,
        tenantId,
        context,
        "current_password_invalid"
      );
      throw serviceError(
        "CURRENT_PASSWORD_INVALID",
        "current password is invalid",
        "unauthenticated"
      );
    }

    await db.$transaction(async (transaction) => {
      const updated = await transaction.account.updateMany({
        data: {
          passwordAlgorithm: "legacy-md5",
          passwordChangedAt: new Date(),
          passwordHash: passwordHash(newPassword),
        },
        where: {
          deletedAt: null,
          id: claims.accountId,
          passwordAlgorithm: "legacy-md5",
          passwordHash: account.passwordHash,
          status: "active",
          tenantId,
        },
      });
      if (updated.count !== 1) {
        throw serviceError(
          "ACCESS_TOKEN_INVALID",
          ACCESS_TOKEN_INVALID_MESSAGE,
          "unauthenticated"
        );
      }
      await transaction.session.deleteMany({
        where: {
          accountId: claims.accountId,
          id: { not: claims.sessionId },
          tenantId,
        },
      });
    });

    let failureCounterCleared = true;
    try {
      await withRedisTimeout(getRedisClient().del(failureKey));
    } catch {
      // 密码事务已经提交；残留计数依赖既有 TTL 自愈，并通过审计暴露清理结果。
      failureCounterCleared = false;
    }
    await this.audit({
      accountId: claims.accountId,
      actorId: claims.accountId,
      actorType: "account",
      context,
      eventType: "password.self_change",
      metadata: { failureCounterCleared: String(failureCounterCleared) },
      sessionId: claims.sessionId,
      success: true,
      tenantId,
    });
  }

  async listSessions(
    scope: TenantScope,
    accountId: string
  ): Promise<Session[]> {
    await this.getAccount(scope, accountId);
    const sessions = await db.session.findMany({
      orderBy: { createdAt: "asc" },
      where: {
        accountId,
        expiresAt: { gt: new Date() },
        tenantId: scope.tenantId,
      },
    });
    return sessions.map(publicSession);
  }

  // biome-ignore lint/nursery/useMaxParams: Ticket #232 freezes this public contract with TenantScope first.
  async revokeSessions(
    scope: TenantScope,
    accountId: string,
    context: RequestContext,
    reason: string,
    sessionId?: string
  ): Promise<void> {
    await this.getAccount(scope, accountId);
    await db.session.deleteMany({
      where: {
        accountId,
        ...(sessionId ? { id: sessionId } : {}),
        tenantId: scope.tenantId,
      },
    });
    await this.audit({
      accountId,
      actorId: scope.actorId,
      actorType: scope.actorType,
      context,
      eventType: reason === "logout" ? "logout" : "session.revoke",
      metadata: { reason },
      sessionId,
      success: true,
      tenantId: scope.tenantId,
    });
  }

  private generateTenantId(): string {
    return `t${randomBytes(12).toString("hex")}`;
  }

  private async createTenantAttempt(
    id: string,
    name: string | null,
    settings: TenantSettings,
    context: RequestContext
  ): Promise<PublicTenant> {
    const tenant = await db.$transaction(async (transaction) => {
      const created = await transaction.tenant.create({
        data: { id, name, settings, status: "active" },
      });
      await this.writeAudit(transaction, {
        actorType: "admin",
        context,
        eventType: "tenant.created",
        success: true,
        tenantId: id,
      });
      return created;
    });
    return publicTenant(tenant);
  }

  async createTenant(
    _scope: AdminScope,
    input: TenantInput,
    context: RequestContext
  ): Promise<PublicTenant> {
    const name = input.name?.trim() || null;
    const settings = normalizeTenantSettings(input.settings, "BODY_INVALID");
    if (input.id !== undefined) {
      const id = this.assertTenantId(input.id);
      try {
        return await this.createTenantAttempt(id, name, settings, context);
      } catch (error) {
        if (isPrismaCode(error, "P2002")) {
          throw serviceError(
            "TENANT_ALREADY_EXISTS",
            "tenant already exists",
            "conflict"
          );
        }
        throw error;
      }
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.createTenantAttempt(
          this.generateTenantId(),
          name,
          settings,
          context
        );
      } catch (error) {
        if (!isPrismaCode(error, "P2002")) {
          throw error;
        }
      }
    }
    throw serviceError(
      "TENANT_ALREADY_EXISTS",
      "could not allocate a unique tenant id",
      "conflict"
    );
  }

  async getTenant(_scope: AdminScope, tenantId: string): Promise<PublicTenant> {
    this.assertTenantIdFormat(tenantId);
    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw serviceError("TENANT_NOT_FOUND", "tenant not found", "not_found");
    }
    return publicTenant(tenant);
  }

  // biome-ignore lint/nursery/useMaxParams: Ticket #232 freezes this public contract with TenantScope first.
  async listTenants(
    _scope: AdminScope,
    limit: number,
    offset: number,
    basePath: string,
    name?: string
  ): Promise<TenantCollection> {
    const where = name === undefined ? {} : { name };
    const [tenants, total] = await db.$transaction([
      db.tenant.findMany({
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        where,
      }),
      db.tenant.count({ where }),
    ]);
    const nextOffset = offset + tenants.length;
    const query = (next: number) => {
      const page = `page[offset]=${next}&page[limit]=${limit}`;
      return name === undefined
        ? `${basePath}?${page}`
        : `${basePath}?${page}&filter[name]=${encodeURIComponent(name)}`;
    };
    return {
      data: tenants.map((tenant) => ({
        attributes: publicTenant(tenant),
        id: tenant.id,
        type: "tenants" as const,
      })),
      links: {
        self: query(offset),
        ...(nextOffset < total ? { next: query(nextOffset) } : {}),
      },
      meta: { page: { limit, offset, total } },
    };
  }

  private async tenantRecord(
    transaction: Prisma.TransactionClient,
    tenantId: string
  ): Promise<Tenant> {
    const tenant = await transaction.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw serviceError("TENANT_NOT_FOUND", "tenant not found", "not_found");
    }
    return tenant;
  }

  private async applyTenantStatus(
    transaction: Prisma.TransactionClient,
    current: Tenant,
    status: TenantStatus | undefined,
    context: RequestContext
  ): Promise<void> {
    if (status === undefined || status === current.status) {
      return;
    }
    const updated = await transaction.tenant.updateMany({
      data: { status },
      where: { id: current.id, status: current.status },
    });
    if (updated.count === 1) {
      await this.writeAudit(transaction, {
        actorType: "admin",
        context,
        eventType: status === "active" ? "tenant.enabled" : "tenant.disabled",
        success: true,
        tenantId: current.id,
      });
    }
  }

  private async patchTenantTransaction(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    input: TenantPatchInput,
    context: RequestContext
  ): Promise<Tenant> {
    const current = await this.tenantRecord(transaction, tenantId);
    if (input.name !== undefined) {
      await transaction.tenant.update({
        data: { name: input.name?.trim() || null },
        where: { id: tenantId },
      });
    }
    if (input.settings !== undefined) {
      const settings = normalizeTenantSettings(input.settings, "PATCH_INVALID");
      await transaction.tenant.update({
        data: { settings },
        where: { id: tenantId },
      });
      await this.writeAudit(transaction, {
        actorType: "admin",
        context,
        eventType: "tenant.settings.updated",
        metadata: { keys: Object.keys(settings).join(",") },
        success: true,
        tenantId,
      });
    }
    await this.applyTenantStatus(transaction, current, input.status, context);
    return this.tenantRecord(transaction, tenantId);
  }

  async patchTenant(
    _scope: AdminScope,
    tenantId: string,
    input: TenantPatchInput,
    context: RequestContext
  ): Promise<PublicTenant> {
    this.assertTenantIdFormat(tenantId);
    if (tenantId === DEFAULT_TENANT_ID && input.name !== undefined) {
      throw serviceError(
        "PATCH_INVALID",
        "default tenant cannot be renamed",
        "invalid_argument"
      );
    }
    const tenant = await db.$transaction((transaction) =>
      this.patchTenantTransaction(transaction, tenantId, input, context)
    );
    return publicTenant(tenant);
  }

  async createTenantApiKey(
    scope: TenantScope,
    input: TenantApiKeyInput,
    context: RequestContext
  ): Promise<CreatedTenantApiKey> {
    const body = randomBytes(24).toString("base64url");
    const plaintext = `${TENANT_API_KEY_PREFIX}${body}`;
    const digest = hmac(this.settings.tenantApiKeyPrimary.secret, plaintext);
    const key = await db.$transaction(async (transaction) => {
      const created = await transaction.tenantApiKey.create({
        data: {
          firstFour: body.slice(0, 4),
          hash: digest,
          hmacKeyId: this.settings.tenantApiKeyPrimary.id,
          name: input.name?.trim() || null,
          tenantId: scope.tenantId,
        },
      });
      await this.writeAudit(transaction, {
        actorId: scope.actorId,
        actorType: scope.actorType,
        context,
        eventType: "tenant_api_key.created",
        metadata: {
          apiKeyId: created.id,
          firstFour: created.firstFour,
        },
        success: true,
        tenantId: scope.tenantId,
      });
      return created;
    });
    return { ...publicTenantApiKey(key), key: plaintext };
  }

  async listTenantApiKeys(
    scope: TenantScope,
    limit: number,
    offset: number,
    basePath: string
  ): Promise<TenantApiKeyCollection> {
    const select = {
      createdAt: true,
      firstFour: true,
      id: true,
      name: true,
      tenantId: true,
      updatedAt: true,
    } as const;
    const [keys, total] = await db.$transaction([
      db.tenantApiKey.findMany({
        orderBy: { createdAt: "desc" },
        select,
        skip: offset,
        take: limit,
        where: { tenantId: scope.tenantId },
      }),
      db.tenantApiKey.count({ where: { tenantId: scope.tenantId } }),
    ]);
    const nextOffset = offset + keys.length;
    const query = (next: number) =>
      `${basePath}?page[offset]=${next}&page[limit]=${limit}`;
    return {
      data: keys.map((key) => ({
        attributes: publicTenantApiKey(key),
        id: key.id,
        type: "tenant-api-keys" as const,
      })),
      links: {
        self: query(offset),
        ...(nextOffset < total ? { next: query(nextOffset) } : {}),
      },
      meta: { page: { limit, offset, total } },
    };
  }

  async patchTenantApiKey(
    scope: TenantScope,
    keyId: string,
    input: TenantApiKeyPatchInput
  ): Promise<PublicTenantApiKey> {
    return await db.$transaction(async (transaction) => {
      const updated = await transaction.tenantApiKey.updateMany({
        data: { name: input.name?.trim() || null },
        where: { id: keyId, tenantId: scope.tenantId },
      });
      if (updated.count === 0) {
        throw serviceError(
          "TENANT_API_KEY_NOT_FOUND",
          "tenant API key not found",
          "not_found"
        );
      }
      const key = await transaction.tenantApiKey.findFirst({
        select: {
          createdAt: true,
          firstFour: true,
          id: true,
          name: true,
          tenantId: true,
          updatedAt: true,
        },
        where: { id: keyId, tenantId: scope.tenantId },
      });
      if (!key) {
        throw serviceError(
          "TENANT_API_KEY_NOT_FOUND",
          "tenant API key not found",
          "not_found"
        );
      }
      return publicTenantApiKey(key);
    });
  }

  async deleteTenantApiKey(
    scope: TenantScope,
    keyId: string,
    context: RequestContext
  ): Promise<void> {
    if (scope.actorType === "tenant_key" && scope.actorId === keyId) {
      throw serviceError(
        "TENANT_API_KEY_SELF_DELETE",
        "tenant API key cannot delete itself",
        "invalid_argument"
      );
    }
    await db.$transaction(async (transaction) => {
      const deleted = await transaction.tenantApiKey.deleteMany({
        where: { id: keyId, tenantId: scope.tenantId },
      });
      if (deleted.count === 0) {
        throw serviceError(
          "TENANT_API_KEY_NOT_FOUND",
          "tenant API key not found",
          "not_found"
        );
      }
      await this.writeAudit(transaction, {
        actorId: scope.actorId,
        actorType: scope.actorType,
        context,
        eventType: "tenant_api_key.deleted",
        metadata: { apiKeyId: keyId },
        success: true,
        tenantId: scope.tenantId,
      });
    });
  }
}

export function createStargateService(
  config: StargateConfig = loadStargateConfig()
): StargateService {
  return new StargateService(config);
}
