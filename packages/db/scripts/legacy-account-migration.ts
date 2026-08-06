import { createHash } from "node:crypto";

const UsernamePattern = /^[a-z][a-z0-9._-]*$/;
const EmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PhonePattern = /^\+?\d+$/;
const PasswordHashPattern = /^[a-zA-Z0-9]{13}[a-f0-9]{32}$/;

export type AccountIdStrategy = "derived" | "legacy";

export type LegacyUser = {
  _id?: unknown;
  active?: unknown;
  email?: unknown;
  password?: unknown;
  passwordChangedAt?: unknown;
  phone?: unknown;
  username?: unknown;
};

export type MigratedAccount = {
  email: string | null;
  id: string;
  passwordAlgorithm: "legacy-md5";
  passwordChangedAt: Date;
  passwordHash: string;
  phone: string | null;
  status: "active" | "disabled";
  tenantId: string;
  username: string;
};

type LegacyObjectId = {
  toHexString: () => string;
};

export function assertAccountMigrationComplete(pending: number): void {
  if (pending > 0) {
    throw new Error(`account migration incomplete: accounts=${pending}`);
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value;
}

function legacyId(value: unknown): string {
  if (typeof value === "string") {
    return requiredString(value, "_id").trim();
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toHexString" in value &&
    typeof (value as LegacyObjectId).toHexString === "function"
  ) {
    return requiredString(
      (value as LegacyObjectId).toHexString(),
      "_id"
    ).trim();
  }
  throw new Error("_id must be a string or ObjectId");
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  return value;
}

function normalizeUsername(value: unknown): string {
  const normalized = requiredString(value, "username").trim().toLowerCase();
  if (!UsernamePattern.test(normalized)) {
    throw new Error("username is invalid");
  }
  return normalized;
}

function normalizeEmail(value: unknown): string | null {
  const candidate = optionalString(value, "email");
  if (candidate === null) {
    return null;
  }
  const normalized = candidate.trim().toLowerCase();
  if (!EmailPattern.test(normalized)) {
    throw new Error("email is invalid");
  }
  return normalized;
}

function normalizePhone(value: unknown): string | null {
  const candidate = optionalString(value, "phone");
  if (candidate === null) {
    return null;
  }
  const normalized = candidate.trim();
  if (!PhonePattern.test(normalized)) {
    throw new Error("phone is invalid");
  }
  return normalized;
}

function parsePasswordChangedAt(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) {
    throw new Error("passwordChangedAt is required and must be valid");
  }
  return date;
}

function accountStatus(value: unknown): "active" | "disabled" {
  if (value !== undefined && typeof value !== "boolean") {
    throw new Error("active must be a boolean");
  }
  return value === false ? "disabled" : "active";
}

function assertUnique(
  accounts: MigratedAccount[],
  field: "email" | "id" | "phone" | "username"
): void {
  const owners = new Map<string, string>();
  for (const account of accounts) {
    const value = account[field];
    if (value === null) {
      continue;
    }
    const previous = owners.get(value);
    if (previous) {
      throw new Error(`${field} conflicts after normalization`);
    }
    owners.set(value, account.id);
  }
}

export function accountId(
  legacyUserId: string,
  tenantId: string,
  strategy: AccountIdStrategy
): string {
  if (strategy === "legacy") {
    return legacyUserId;
  }
  const digest = createHash("sha256")
    .update(`mekong-account-migration\0${tenantId}\0${legacyUserId}`)
    .digest("hex");
  return `mig_${digest.slice(0, 32)}`;
}

export function transformLegacyUser(
  source: LegacyUser,
  tenantId: string,
  strategy: AccountIdStrategy
): MigratedAccount {
  const legacyUserId = legacyId(source._id);
  const passwordHash = requiredString(source.password, "password");
  if (!PasswordHashPattern.test(passwordHash)) {
    throw new Error("password hash is invalid");
  }

  return {
    email: normalizeEmail(source.email),
    id: accountId(legacyUserId, tenantId, strategy),
    passwordAlgorithm: "legacy-md5",
    passwordChangedAt: parsePasswordChangedAt(source.passwordChangedAt),
    passwordHash,
    phone: normalizePhone(source.phone),
    status: accountStatus(source.active),
    tenantId,
    username: normalizeUsername(source.username),
  };
}

export function transformLegacyUsers(
  source: LegacyUser[],
  tenantId: string,
  strategy: AccountIdStrategy
): MigratedAccount[] {
  if (source.length === 0) {
    throw new Error("users collection is empty");
  }
  const accounts = source.map((user, index) => {
    try {
      return transformLegacyUser(user, tenantId, strategy);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`users[${index}] failed preflight: ${message}`);
    }
  });
  assertUnique(accounts, "id");
  assertUnique(accounts, "username");
  assertUnique(accounts, "phone");
  assertUnique(accounts, "email");
  return accounts;
}
