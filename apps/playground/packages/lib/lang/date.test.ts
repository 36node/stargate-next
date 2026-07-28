import { describe, expect, it } from "vitest";

import {
  getDaysInMonth,
  getRelativeTime,
  isSameDay,
  ymd,
  ymdhms,
} from "./date.js";

describe("date utils", () => {
  describe("formatDate", () => {
    it("should format date correctly", () => {
      const date = new Date(2024, 0, 15); // 2024-01-15
      expect(ymd(date)).toBe("2024-01-15");
    });

    it("should pad single digit month and day", () => {
      const date = new Date(2024, 2, 5); // 2024-03-05
      expect(ymd(date)).toBe("2024-03-05");
    });
  });

  describe("formatDateTime", () => {
    it("should format date time correctly", () => {
      const date = new Date(2024, 0, 15, 9, 30, 45);
      expect(ymdhms(date)).toBe("2024-01-15 09:30:45");
    });
  });

  describe("getRelativeTime", () => {
    it('should return "刚刚" for less than 60 seconds', () => {
      const now = new Date();
      const date = new Date(now.getTime() - 30 * 1000);
      expect(getRelativeTime(date, now)).toBe("刚刚");
    });

    it("should return minutes ago", () => {
      const now = new Date();
      const date = new Date(now.getTime() - 5 * 60 * 1000);
      expect(getRelativeTime(date, now)).toBe("5分钟前");
    });

    it("should return hours ago", () => {
      const now = new Date();
      const date = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      expect(getRelativeTime(date, now)).toBe("3小时前");
    });
  });

  describe("isSameDay", () => {
    it("should return true for same day", () => {
      const date1 = new Date(2024, 0, 15, 10, 0);
      const date2 = new Date(2024, 0, 15, 20, 0);
      expect(isSameDay(date1, date2)).toBe(true);
    });

    it("should return false for different days", () => {
      const date1 = new Date(2024, 0, 15);
      const date2 = new Date(2024, 0, 16);
      expect(isSameDay(date1, date2)).toBe(false);
    });
  });

  describe("getDaysInMonth", () => {
    it("should return 31 for January", () => {
      expect(getDaysInMonth(2024, 1)).toBe(31);
    });

    it("should return 29 for February in leap year", () => {
      expect(getDaysInMonth(2024, 2)).toBe(29);
    });

    it("should return 28 for February in non-leap year", () => {
      expect(getDaysInMonth(2023, 2)).toBe(28);
    });
  });
});
