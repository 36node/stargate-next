import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { debounce } from "./debounce.js";

describe("debounce utils", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("debounce", () => {
    it("should delay function execution", () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 300);

      debouncedFn();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(300);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should only execute once for multiple rapid calls", () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 300);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      vi.advanceTimersByTime(300);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should reset timer on each call", () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 300);

      debouncedFn();
      vi.advanceTimersByTime(200);
      expect(fn).not.toHaveBeenCalled();

      debouncedFn();
      vi.advanceTimersByTime(200);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should pass arguments to the original function", () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 300);

      debouncedFn("arg1", "arg2");
      vi.advanceTimersByTime(300);

      expect(fn).toHaveBeenCalledWith("arg1", "arg2");
    });

    it("should use last arguments when called multiple times", () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 300);

      debouncedFn("first");
      debouncedFn("second");
      debouncedFn("third");
      vi.advanceTimersByTime(300);

      expect(fn).toHaveBeenCalledWith("third");
    });

    it("should use default wait time of 300ms", () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn);

      debouncedFn();
      vi.advanceTimersByTime(299);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    describe("cancel", () => {
      it("should cancel pending execution", () => {
        const fn = vi.fn();
        const debouncedFn = debounce(fn, 300);

        debouncedFn();
        debouncedFn.cancel();
        vi.advanceTimersByTime(300);

        expect(fn).not.toHaveBeenCalled();
      });
    });

    describe("flush", () => {
      it("should execute immediately when flushed", () => {
        const fn = vi.fn();
        const debouncedFn = debounce(fn, 300);

        debouncedFn("flushed");
        debouncedFn.flush();

        expect(fn).toHaveBeenCalledWith("flushed");
      });

      it("should not execute if no pending call", () => {
        const fn = vi.fn();
        const debouncedFn = debounce(fn, 300);

        debouncedFn.flush();
        expect(fn).not.toHaveBeenCalled();
      });
    });

    describe("leading option", () => {
      it("should execute immediately with leading: true", () => {
        const fn = vi.fn();
        const debouncedFn = debounce(fn, 300, { leading: true });

        debouncedFn();
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it("should execute on trailing edge with leading: true", () => {
        const fn = vi.fn();
        const debouncedFn = debounce(fn, 300, { leading: true });

        debouncedFn("first");
        expect(fn).toHaveBeenCalledTimes(1);

        debouncedFn("second");
        vi.advanceTimersByTime(300);
        expect(fn).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenLastCalledWith("second");
      });
    });

    describe("trailing option", () => {
      it("should not execute on trailing edge with trailing: false", () => {
        const fn = vi.fn();
        const debouncedFn = debounce(fn, 300, {
          leading: true,
          trailing: false,
        });

        debouncedFn();
        expect(fn).toHaveBeenCalledTimes(1);

        debouncedFn();
        vi.advanceTimersByTime(300);
        expect(fn).toHaveBeenCalledTimes(1);
      });
    });
  });
});
