import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncedBatcher } from "@/lib/batch";

describe("createDebouncedBatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces a burst of pushes into a single flush after the delay", () => {
    const flush = vi.fn();
    const batcher = createDebouncedBatcher(flush, 3000);
    batcher.push("a");
    batcher.push("b");
    batcher.push("a");
    vi.advanceTimersByTime(2999);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(["a", "b"]);
  });

  it("flushes a fresh batch after the previous one completed", () => {
    const flush = vi.fn();
    const batcher = createDebouncedBatcher(flush, 3000);
    batcher.push("a");
    vi.advanceTimersByTime(3000);
    batcher.push("b");
    vi.advanceTimersByTime(3000);
    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush.mock.calls[0][0]).toEqual(["a"]);
    expect(flush.mock.calls[1][0]).toEqual(["b"]);
  });

  it("does not flush when nothing was pushed", () => {
    const flush = vi.fn();
    createDebouncedBatcher(flush, 3000);
    vi.advanceTimersByTime(3000);
    expect(flush).not.toHaveBeenCalled();
  });

  it("dispose cancels a pending flush", () => {
    const flush = vi.fn();
    const batcher = createDebouncedBatcher(flush, 3000);
    batcher.push("a");
    batcher.dispose();
    vi.advanceTimersByTime(3000);
    expect(flush).not.toHaveBeenCalled();
  });
});
