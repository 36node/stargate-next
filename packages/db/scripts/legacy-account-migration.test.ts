import { describe, expect, it } from "vitest";

import {
  accountId,
  assertAccountMigrationComplete,
  transformLegacyUser,
  transformLegacyUsers,
} from "./legacy-account-migration";

const ActiveTypeError = /active must be a boolean/;
const EmptyUsersError = /users collection is empty/;
const IncompleteMigrationError = /account migration incomplete: accounts=1/;
const PasswordChangedAtError =
  /passwordChangedAt is missing or invalid and createdAt must be valid/;

const validUser = {
  _id: "legacy-1",
  active: false,
  createdAt: new Date("2025-08-01T00:00:00.000Z"),
  email: " User@Example.COM ",
  password: "abcdefghijklm0123456789abcdef0123456789abcdef",
  passwordChangedAt: new Date("2026-08-01T00:00:00.000Z"),
  phone: " +8613800000000 ",
  username: " Admin.User ",
};

describe("legacy account migration", () => {
  it("keeps legacy ids for UAT and derives tenant-scoped ids for PR environments", () => {
    expect(accountId("legacy-1", "mekong-next-uat", "legacy")).toBe("legacy-1");
    expect(accountId("legacy-1", "mekong-next-pr-123", "derived")).toBe(
      "mig_1043bbd6ce01635de09d4c8af4cf489b"
    );
    expect(accountId("legacy-1", "mekong-next-pr-123", "derived")).not.toBe(
      accountId("legacy-1", "mekong-next-pr-124", "derived")
    );
  });

  it("normalizes login identifiers and preserves the legacy password hash", () => {
    const migrated = transformLegacyUser(
      validUser,
      "mekong-next-uat",
      "legacy"
    );

    expect(migrated.username).toBe("admin.user");
    expect(migrated.email).toBe("user@example.com");
    expect(migrated.phone).toBe("+8613800000000");
    expect(migrated.status).toBe("disabled");
    expect(migrated.passwordAlgorithm).toBe("legacy-md5");
  });

  it("keeps the canonical older account and reports normalized username conflicts", () => {
    const source = [
      {
        ...validUser,
        _id: "legacy-2",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        email: null,
        phone: null,
        username: "Test1",
      },
      { ...validUser, email: null, phone: null, username: "test1" },
    ];
    const migrated = transformLegacyUsers(source, "mekong-next-uat", "legacy");

    expect(
      migrated.accounts.map(({ id, username }) => ({ id, username }))
    ).toEqual([{ id: "legacy-1", username: "test1" }]);
    expect(migrated.skippedUsers).toEqual([
      {
        legacyUserId: "legacy-2",
        reason: "username conflicts after normalization",
        sourceIndex: 0,
        username: "Test1",
      },
    ]);
  });

  it("converts legacy ObjectId values to strings", () => {
    const migrated = transformLegacyUser(
      {
        ...validUser,
        _id: { toHexString: () => "64b000000000000000000001" },
      },
      "mekong-next-uat",
      "legacy"
    );

    expect(migrated.id).toBe("64b000000000000000000001");
  });

  it("preserves passwordChangedAt when it is valid", () => {
    const migrated = transformLegacyUser(
      validUser,
      "mekong-next-uat",
      "legacy"
    );

    expect(migrated.passwordChangedAt.getTime()).toBe(
      validUser.passwordChangedAt.getTime()
    );
  });

  it("falls back to createdAt when passwordChangedAt is missing or invalid", () => {
    for (const passwordChangedAt of [undefined, "not-a-date"]) {
      const migrated = transformLegacyUser(
        { ...validUser, passwordChangedAt },
        "mekong-next-uat",
        "legacy"
      );

      expect(migrated.passwordChangedAt.getTime()).toBe(
        validUser.createdAt.getTime()
      );
    }
  });

  it("rejects an account when both password timestamps are invalid", () => {
    expect(() =>
      transformLegacyUser(
        {
          ...validUser,
          createdAt: undefined,
          passwordChangedAt: undefined,
        },
        "mekong-next-uat",
        "legacy"
      )
    ).toThrow(PasswordChangedAtError);
  });

  it("normalizes surrounding whitespace in legacy ids", () => {
    const migrated = transformLegacyUser(
      { ...validUser, _id: " legacy-1 " },
      "mekong-next-pr-123",
      "derived"
    );

    expect(migrated.id).toBe("mig_1043bbd6ce01635de09d4c8af4cf489b");
  });

  it("fails fast for empty sources and reports malformed users", () => {
    expect(() => transformLegacyUsers([], "mekong-next-uat", "legacy")).toThrow(
      EmptyUsersError
    );
    const migrated = transformLegacyUsers(
      [{ ...validUser, active: "false" }],
      "mekong-next-uat",
      "legacy"
    );

    expect(migrated.accounts.length).toBe(0);
    expect(migrated.skippedUsers[0]?.reason ?? "").toMatch(ActiveTypeError);
  });

  it("rejects malformed source status values", () => {
    expect(() =>
      transformLegacyUser(
        { ...validUser, active: "false" },
        "mekong-next-uat",
        "legacy"
      )
    ).toThrow(ActiveTypeError);
  });

  it("requires every account to be present in verify mode", () => {
    expect(() => assertAccountMigrationComplete(0)).not.toThrow();
    expect(() => assertAccountMigrationComplete(1)).toThrow(
      IncompleteMigrationError
    );
  });
});
