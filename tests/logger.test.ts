import { describe, expect, it, vi } from "vitest";
import { createLogger } from "@/lib/logger";

describe("structured logger", () => {
  it("emits info messages to console.log", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const log = createLogger("test-scope");
    log.info("hello");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("[INFO]");
    expect(spy.mock.calls[0][0]).toContain("[test-scope]");
    expect(spy.mock.calls[0][0]).toContain("hello");
    spy.mockRestore();
  });

  it("emits warn messages to console.warn", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = createLogger("warn-scope");
    log.warn("caution");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("[WARN]");
    spy.mockRestore();
  });

  it("emits error messages to console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = createLogger("err-scope");
    log.error("failure", { code: 500 });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("[ERROR]");
    expect(spy.mock.calls[0][0]).toContain('"code":500');
    spy.mockRestore();
  });
});
