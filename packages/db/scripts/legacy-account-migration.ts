import { createHash } from "node:crypto";

const UsernamePattern = /^[a-z][a-z0-9._-]*$/;
const EmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PhonePattern = /^\+?\d+$/;
const PasswordHashPattern = /^[a-zA-Z0-9]{13}[a-f0-9]{32}$/;

export type AccountIdStrategy = "derived" | "legacy";

export type LegacyUser = {
  _id?: unknown;
  active?: unknown;
  createdAt?: unknown;
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

export type SkippedLegacyAccount = {
  legacyUserId: string | null;
  reason: string;
  sourceIndex: number;
  username: string | null;
};

export type LegacyAccountMigrationPlan = {
  accounts: MigratedAccount[];
  skippedUsers: SkippedLegacyAccount[];
};

type AccountCandidate = {
  account: MigratedAccount;
  legacyUserId: string;
  source: LegacyUser;
  sourceIndex: number;
};

type UniqueAccountField = "email" | "id" | "phone" | "username";

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

function validDate(value: unknown): Date | null {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parsePasswordChangedAt(value: unknown, createdAt: unknown): Date {
  const passwordChangedAt = validDate(value);
  if (passwordChangedAt) {
    return passwordChangedAt;
  }
  const fallback = validDate(createdAt);
  if (!fallback) {
    throw new Error(
      "passwordChangedAt is missing or invalid and createdAt must be valid"
    );
  }
  return fallback;
}

function accountStatus(value: unknown): "active" | "disabled" {
  if (value !== undefined && typeof value !== "boolean") {
    throw new Error("active must be a boolean");
  }
  return value === false ? "disabled" : "active";
}

function reportLegacyId(value: unknown): string | null {
  try {
    return legacyId(value);
  } catch {
    return null;
  }
}

function reportUsername(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function identifierIsCanonical(
  candidate: AccountCandidate,
  field: "email" | "phone" | "username"
): boolean {
  const { account, source } = candidate;
  const sourceValue = source[field];
  const accountValue = account[field];
  return (
    accountValue !== null &&
    typeof sourceValue === "string" &&
    sourceValue.trim() === accountValue
  );
}

function candidateOrder(
  left: AccountCandidate,
  right: AccountCandidate
): number {
  for (const field of ["username", "email", "phone"] as const) {
    const canonicalDifference =
      Number(identifierIsCanonical(right, field)) -
      Number(identifierIsCanonical(left, field));
    if (canonicalDifference !== 0) {
      return canonicalDifference;
    }
  }
  const leftCreatedAt =
    validDate(left.source.createdAt)?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightCreatedAt =
    validDate(right.source.createdAt)?.getTime() ?? Number.POSITIVE_INFINITY;
  return (
    leftCreatedAt - rightCreatedAt ||
    left.legacyUserId.localeCompare(right.legacyUserId) ||
    left.sourceIndex - right.sourceIndex
  );
}

function selectUniqueAccounts(candidates: AccountCandidate[]): {
  accounts: MigratedAccount[];
  skippedUsers: SkippedLegacyAccount[];
} {
  const fields: UniqueAccountField[] = ["id", "username", "phone", "email"];
  const owners = new Map<UniqueAccountField, Set<string>>(
    fields.map((field) => [field, new Set<string>()])
  );
  const selected: AccountCandidate[] = [];
  const skippedUsers: SkippedLegacyAccount[] = [];

  for (const candidate of [...candidates].sort(candidateOrder)) {
    const conflictingFields = fields.filter((field) => {
      const value = candidate.account[field];
      return value !== null && owners.get(field)?.has(value);
    });
    if (conflictingFields.length > 0) {
      skippedUsers.push({
        legacyUserId: candidate.legacyUserId,
        reason: conflictingFields
          .map((field) =>
            field === "id"
              ? "id is duplicated"
              : `${field} conflicts after normalization`
          )
          .join("; "),
        sourceIndex: candidate.sourceIndex,
        username: reportUsername(candidate.source.username),
      });
      continue;
    }
    selected.push(candidate);
    for (const field of fields) {
      const value = candidate.account[field];
      if (value !== null) {
        owners.get(field)?.add(value);
      }
    }
  }

  return {
    accounts: selected
      .sort((left, right) => left.sourceIndex - right.sourceIndex)
      .map(({ account }) => account),
    skippedUsers,
  };
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
    passwordChangedAt: parsePasswordChangedAt(
      source.passwordChangedAt,
      source.createdAt
    ),
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
): LegacyAccountMigrationPlan {
  if (source.length === 0) {
    throw new Error("users collection is empty");
  }
  const candidates: AccountCandidate[] = [];
  const skippedUsers: SkippedLegacyAccount[] = [];
  source.forEach((user, sourceIndex) => {
    try {
      const legacyUserId = legacyId(user._id);
      candidates.push({
        account: transformLegacyUser(user, tenantId, strategy),
        legacyUserId,
        source: user,
        sourceIndex,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      skippedUsers.push({
        legacyUserId: reportLegacyId(user._id),
        reason: message,
        sourceIndex,
        username: reportUsername(user.username),
      });
    }
  });
  const unique = selectUniqueAccounts(candidates);
  return {
    accounts: unique.accounts,
    skippedUsers: [...skippedUsers, ...unique.skippedUsers].sort(
      (left, right) => left.sourceIndex - right.sourceIndex
    ),
  };
}
