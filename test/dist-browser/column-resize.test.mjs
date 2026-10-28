import { describe, expect, it } from "vitest";
import {
  enforceMinWidth,
  parseStoredWidth,
} from "../../dist-browser/src/hooks/resize-utils.mjs";

describe("enforceMinWidth", () => {
  it("returns current when above minimum", () => {
    expect(enforceMinWidth(200, 300)).toBe(300);
  });

  it("returns minimum when current is below it", () => {
    expect(enforceMinWidth(200, 150)).toBe(200);
  });

  it("returns current when equal to minimum", () => {
    expect(enforceMinWidth(200, 200)).toBe(200);
  });

  it("handles zero minimum", () => {
    expect(enforceMinWidth(0, 50)).toBe(50);
    expect(enforceMinWidth(0, -10)).toBe(0);
  });

  it("handles negative current", () => {
    expect(enforceMinWidth(200, -50)).toBe(200);
  });
});

describe("parseStoredWidth", () => {
  it("parses valid numeric string", () => {
    expect(parseStoredWidth("300", 400)).toBe(300);
  });

  it("returns fallback for null", () => {
    expect(parseStoredWidth(null, 400)).toBe(400);
  });

  it("returns fallback for undefined", () => {
    expect(parseStoredWidth(undefined, 400)).toBe(400);
  });

  it("returns fallback for non-numeric string", () => {
    expect(parseStoredWidth("abc", 400)).toBe(400);
  });

  it("returns fallback for empty string", () => {
    expect(parseStoredWidth("", 400)).toBe(400);
  });

  it("handles zero value", () => {
    expect(parseStoredWidth("0", 400)).toBe(0);
  });

  it("clamps negative numeric string to zero", () => {
    expect(parseStoredWidth("-50", 400)).toBe(0);
  });

  it("handles floating point (truncates to int)", () => {
    expect(parseStoredWidth("300.7", 400)).toBe(300);
  });
});
