import { describe, expect, it } from "vitest";

import { booleanish } from "./index";

describe("booleanish", () => {
  it("accepts boolean values", () => {
    expect(booleanish.parse(true)).toBe(true);
    expect(booleanish.parse(false)).toBe(false);
  });

  it("coerces string literals to booleans", () => {
    expect(booleanish.parse("true")).toBe(true);
    expect(booleanish.parse("false")).toBe(false);
  });

  it("allows undefined when optional", () => {
    expect(booleanish.parse(undefined)).toBeUndefined();
  });

  it("rejects invalid string values", () => {
    const result = booleanish.safeParse("yes");

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.error.issues.length).toBeGreaterThan(0);
  });
});
