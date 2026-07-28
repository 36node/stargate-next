import { describe, expect, it } from "vitest";

import { isEmpty } from "./empty.js";

describe("empty utils", () => {
  describe("isEmpty", () => {
    it("should return true for null", () => {
      expect(isEmpty(null)).toBe(true);
    });

    it("should return true for undefined", () => {
      expect(isEmpty(undefined)).toBe(true);
    });

    it("should return true for empty string", () => {
      expect(isEmpty("")).toBe(true);
    });

    it("should return false for non-empty string", () => {
      expect(isEmpty("hello")).toBe(false);
      expect(isEmpty(" ")).toBe(false);
    });

    it("should return true for empty array", () => {
      expect(isEmpty([])).toBe(true);
    });

    it("should return false for non-empty array", () => {
      expect(isEmpty([1, 2, 3])).toBe(false);
      expect(isEmpty([null])).toBe(false);
    });

    it("should return true for empty object", () => {
      expect(isEmpty({})).toBe(true);
    });

    it("should return false for non-empty object", () => {
      expect(isEmpty({ a: 1 })).toBe(false);
      expect(isEmpty({ key: undefined })).toBe(false);
    });

    it("should return true for empty Map", () => {
      expect(isEmpty(new Map())).toBe(true);
    });

    it("should return false for non-empty Map", () => {
      const map = new Map();
      map.set("key", "value");
      expect(isEmpty(map)).toBe(false);
    });

    it("should return true for empty Set", () => {
      expect(isEmpty(new Set())).toBe(true);
    });

    it("should return false for non-empty Set", () => {
      const set = new Set([1, 2, 3]);
      expect(isEmpty(set)).toBe(false);
    });

    it("should return false for numbers (including 0)", () => {
      expect(isEmpty(0)).toBe(false);
      expect(isEmpty(1)).toBe(false);
      expect(isEmpty(-1)).toBe(false);
      expect(isEmpty(Number.NaN)).toBe(false);
    });

    it("should return false for booleans", () => {
      expect(isEmpty(false)).toBe(false);
      expect(isEmpty(true)).toBe(false);
    });

    it("should return false for functions", () => {
      expect(
        isEmpty(() => {
          /* noop */
        })
      ).toBe(false);
    });
  });
});
