import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  accountId,
  assertAccountMigrationComplete,
  transformLegacyUser,
  transformLegacyUsers,
} from "./legacy-account-migration";

const ActiveTypeError = /active must be a boolean/;
const DuplicateUsernameError = /username conflicts after normalization/;
const EmptyUsersError = /users collection is empty/;
const IncompleteMigrationError = /account migration incomplete: accounts=1/;

const validUser = {
  _id: "legacy-1",
  active: false,
  email: " User@Example.COM ",
  password: "abcdefghijklm0123456789abcdef0123456789abcdef",
  passwordChangedAt: new Date("2026-08-01T00:00:00.000Z"),
  phone: " +8613800000000 ",
  username: " Admin.User ",
};

describe("legacy account migration", () => {
  it("keeps legacy ids for UAT and derives tenant-scoped ids for PR environments", () => {
    assert.equal(
      accountId("legacy-1", "mekong-next-uat", "legacy"),
      "legacy-1"
    );
    assert.equal(
      accountId("legacy-1", "mekong-next-pr-123", "derived"),
      "mig_1043bbd6ce01635de09d4c8af4cf489b"
    );
    assert.notEqual(
      accountId("legacy-1", "mekong-next-pr-123", "derived"),
      accountId("legacy-1", "mekong-next-pr-124", "derived")
    );
  });

  it("normalizes login identifiers and preserves the legacy password hash", () => {
    const migrated = transformLegacyUser(
      validUser,
      "mekong-next-uat",
      "legacy"
    );

    assert.equal(migrated.username, "admin.user");
    assert.equal(migrated.email, "user@example.com");
    assert.equal(migrated.phone, "+8613800000000");
    assert.equal(migrated.status, "disabled");
    assert.equal(migrated.passwordAlgorithm, "legacy-md5");
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

    assert.equal(migrated.id, "64b000000000000000000001");
  });

  it("normalizes surrounding whitespace in legacy ids", () => {
    const migrated = transformLegacyUser(
      { ...validUser, _id: " legacy-1 " },
      "mekong-next-pr-123",
      "derived"
    );

    assert.equal(migrated.id, "mig_1043bbd6ce01635de09d4c8af4cf489b");
  });

  it("fails fast for empty sources and duplicate normalized identifiers", () => {
    assert.throws(
      () => transformLegacyUsers([], "mekong-next-uat", "legacy"),
      EmptyUsersError
    );
    assert.throws(
      () =>
        transformLegacyUsers(
          [validUser, { ...validUser, _id: "legacy-2" }],
          "mekong-next-uat",
          "legacy"
        ),
      DuplicateUsernameError
    );
  });

  it("rejects malformed source status values", () => {
    assert.throws(
      () =>
        transformLegacyUser(
          { ...validUser, active: "false" },
          "mekong-next-uat",
          "legacy"
        ),
      ActiveTypeError
    );
  });

  it("requires every account to be present in verify mode", () => {
    assert.doesNotThrow(() => assertAccountMigrationComplete(0));
    assert.throws(
      () => assertAccountMigrationComplete(1),
      IncompleteMigrationError
    );
  });
});
