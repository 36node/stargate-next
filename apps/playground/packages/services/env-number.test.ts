/** JWT 容差环境变量的严格十进制解析回归。 */
import { describe, expect, it } from "vitest";

import { nonNegativeIntegerEnv } from "./env-number";

describe("nonNegativeIntegerEnv", () => {
  it("uses the fallback only when the variable is missing", () => {
    expect(
      nonNegativeIntegerEnv("JWT_CLOCK_TOLERANCE_SECONDS", undefined, 30)
    ).toBe(30);
  });

  it("accepts canonical non-negative decimal integers", () => {
    expect(nonNegativeIntegerEnv("JWT_CLOCK_TOLERANCE_SECONDS", "0", 30)).toBe(
      0
    );
    expect(nonNegativeIntegerEnv("JWT_CLOCK_TOLERANCE_SECONDS", "30", 30)).toBe(
      30
    );
  });

  it("rejects empty, non-decimal, and unsafe values", () => {
    for (const value of [
      "",
      "-1",
      "1.5",
      "abc",
      "  ",
      "+1",
      "01",
      "1e3",
      "0x10",
      "9007199254740993",
    ]) {
      expect(() =>
        nonNegativeIntegerEnv("JWT_CLOCK_TOLERANCE_SECONDS", value, 30)
      ).toThrow("JWT_CLOCK_TOLERANCE_SECONDS");
    }
  });
});
