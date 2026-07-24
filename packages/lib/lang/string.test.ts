import { describe, expect, it } from "vitest";

import {
  capitalize,
  isValidEmail,
  randomString,
  slugify,
  toCamelCase,
  toPascalCase,
  toSnakeCase,
  truncate,
} from "./string.js";

// 顶层正则表达式常量（性能优化）
const ABC_CHARSET_REGEX = /^[abc]+$/;

describe("string utils", () => {
  describe("truncate", () => {
    it("should not truncate short strings", () => {
      expect(truncate("hello", 10)).toBe("hello");
    });

    it("should truncate long strings", () => {
      expect(truncate("hello world", 8)).toBe("hello...");
    });

    it("should use custom suffix", () => {
      expect(truncate("hello world", 9, "…")).toBe("hello wo…");
    });
  });

  describe("slugify", () => {
    it("should convert to lowercase slug", () => {
      expect(slugify("Hello World")).toBe("hello-world");
    });

    it("should handle special characters", () => {
      expect(slugify("Hello! World?")).toBe("hello-world");
    });

    it("should handle Chinese characters", () => {
      expect(slugify("你好 世界")).toBe("你好-世界");
    });
  });

  describe("capitalize", () => {
    it("should capitalize first letter", () => {
      expect(capitalize("hello")).toBe("Hello");
    });

    it("should handle empty string", () => {
      expect(capitalize("")).toBe("");
    });
  });

  describe("toCamelCase", () => {
    it("should convert hyphenated string", () => {
      expect(toCamelCase("hello-world")).toBe("helloWorld");
    });

    it("should convert underscored string", () => {
      expect(toCamelCase("hello_world")).toBe("helloWorld");
    });

    it("should convert spaced string", () => {
      expect(toCamelCase("hello world")).toBe("helloWorld");
    });
  });

  describe("toPascalCase", () => {
    it("should convert to PascalCase", () => {
      expect(toPascalCase("hello-world")).toBe("HelloWorld");
    });
  });

  describe("toSnakeCase", () => {
    it("should convert camelCase to snake_case", () => {
      expect(toSnakeCase("helloWorld")).toBe("hello_world");
    });

    it("should convert spaced string", () => {
      expect(toSnakeCase("hello world")).toBe("hello_world");
    });
  });

  describe("randomString", () => {
    it("should generate string of specified length", () => {
      expect(randomString(10)).toHaveLength(10);
    });

    it("should use custom charset", () => {
      const result = randomString(5, "abc");
      expect(result).toMatch(ABC_CHARSET_REGEX);
    });
  });

  describe("isValidEmail", () => {
    it("should return true for valid email", () => {
      expect(isValidEmail("test@example.com")).toBe(true);
    });

    it("should return false for invalid email", () => {
      expect(isValidEmail("invalid-email")).toBe(false);
      expect(isValidEmail("test@")).toBe(false);
      expect(isValidEmail("@example.com")).toBe(false);
    });
  });
});
