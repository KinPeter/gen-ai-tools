// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { colorizeJsonText } from "../../dist-browser/src/utils/colorize-json-text.mjs";

// ── Basic key and string value ─────────────────────────────────────────

describe("keys and string values", () => {
  it("wraps JSON keys with the key token class", () => {
    const { container } = render(colorizeJsonText('{"filename": "test.png"}'));
    const spans = container.querySelectorAll(".log-viewer-token-key");
    expect(spans.length).toBe(1);
    expect(spans[0].textContent).toBe('"filename"');
  });

  it("wraps string values with the string token class", () => {
    const { container } = render(colorizeJsonText('{"filename": "test.png"}'));
    const spans = container.querySelectorAll(".log-viewer-token-string");
    expect(spans.length).toBe(1);
    expect(spans[0].textContent).toBe('"test.png"');
  });
});

// ── Number values ──────────────────────────────────────────────────────

describe("numbers", () => {
  it("wraps number values with the value token class", () => {
    const { container } = render(colorizeJsonText('{"count": 42}'));
    const spans = container.querySelectorAll(".log-viewer-token-value");
    expect(spans.length).toBe(1);
    expect(spans[0].textContent).toBe("42");
  });

  it("wraps negative number values with the value token class", () => {
    const { container } = render(
      colorizeJsonText('{"temp": -42, "offset": -3.14, "scale": -1e3}'),
    );
    const spans = container.querySelectorAll(".log-viewer-token-value");
    const texts = Array.from(spans).map((s) => s.textContent);
    expect(texts).toContain("-42");
    expect(texts).toContain("-3.14");
    expect(texts).toContain("-1e3");
  });
});

// ── Boolean values ─────────────────────────────────────────────────────

describe("booleans", () => {
  it("wraps true with a boolean token class", () => {
    const { container } = render(colorizeJsonText('{"active": true}'));
    const spans = container.querySelectorAll(".log-viewer-token-boolean");
    expect(spans.length).toBe(1);
    expect(spans[0].textContent).toBe("true");
  });

  it("wraps false with a boolean token class", () => {
    const { container } = render(colorizeJsonText('{"active": false}'));
    const spans = container.querySelectorAll(".log-viewer-token-boolean");
    expect(spans.length).toBe(1);
    expect(spans[0].textContent).toBe("false");
  });

  it("wraps true/false with the boolean token class", () => {
    const { container } = render(
      colorizeJsonText('{"active": true, "flag": false}'),
    );
    const spans = container.querySelectorAll(".log-viewer-token-boolean");
    expect(spans.length).toBe(2);
  });
});

// ── Null values ────────────────────────────────────────────────────────

describe("null values", () => {
  it("wraps null with a null token class", () => {
    const { container } = render(colorizeJsonText('{"data": null}'));
    const spans = container.querySelectorAll(".log-viewer-token-null");
    expect(spans.length).toBe(1);
    expect(spans[0].textContent).toBe("null");
  });

  it("does not wrap null with the value token class", () => {
    const { container } = render(colorizeJsonText('{"data": null}'));
    const spans = container.querySelectorAll(".log-viewer-token-value");
    expect(spans.length).toBe(0);
  });
});

// ── Nested objects and arrays ──────────────────────────────────────────

describe("nested structures", () => {
  it("colorizes nested objects and arrays", () => {
    const json = JSON.stringify(
      {
        prompt: { text: "a cat" },
        steps: [1, 2, 3],
      },
      null,
      2,
    );

    const { container } = render(colorizeJsonText(json));
    const keys = container.querySelectorAll(".log-viewer-token-key");
    expect(keys.length).toBeGreaterThanOrEqual(2);

    const structs = container.querySelectorAll(".log-viewer-token-structural");
    expect(structs.length).toBeGreaterThan(0);
  });
});

// ── Escaped characters in strings ──────────────────────────────────────

describe("escaped characters", () => {
  it("handles escaped quotes inside strings", () => {
    const { container } = render(
      colorizeJsonText('{"msg": "hello \\"world\\""}'),
    );
    const strings = container.querySelectorAll(".log-viewer-token-string");
    expect(strings.length).toBe(1);
    expect(strings[0].textContent).toBe('"hello \\"world\\""');
  });
});

// ── Whitespace preservation ────────────────────────────────────────────

describe("whitespace preservation", () => {
  it("preserves indentation whitespace as plain text nodes", () => {
    const { container } = render(colorizeJsonText('{\n  "a": 1\n}'));
    const allSpans = container.querySelectorAll("span");
    // All spans should either be a typed token or a plain whitespace span
    const tokenSpans = container.querySelectorAll(
      "[class^='log-viewer-token-']",
    );
    const whitespaceSpans = Array.from(allSpans).filter(
      (s) => !s.className || !s.className.startsWith("log-viewer-token-"),
    );
    // Should have whitespace text nodes between tokens
    expect(whitespaceSpans.length).toBeGreaterThan(0);
    // Should also have token spans
    expect(tokenSpans.length).toBeGreaterThan(0);
  });

  it("preserves spaces between structural tokens and values", () => {
    const { container } = render(colorizeJsonText('{ "a": [1] }'));
    const allSpans = container.querySelectorAll("span");
    const tokenSpans = container.querySelectorAll(
      "[class^='log-viewer-token-']",
    );
    const whitespaceSpans = Array.from(allSpans).filter(
      (s) => !s.className || !s.className.startsWith("log-viewer-token-"),
    );
    // JSON like '{ "a": [1] }' has spaces: after {, after key, after :
    expect(whitespaceSpans.length).toBeGreaterThan(0);
    expect(tokenSpans.length).toBeGreaterThan(0);
  });

  it("preserves newlines between tokens", () => {
    const { container } = render(colorizeJsonText('{\n  "key": "value"\n}'));
    // The combined textContent of all spans should include the original newlines
    expect(container.textContent).toContain("\n");
  });
});

// ── Structural tokens ──────────────────────────────────────────────────

describe("structural tokens", () => {
  it("wraps braces, brackets, colons, commas with the structural class", () => {
    const { container } = render(colorizeJsonText('{ "a": [1] }'));
    const structs = container.querySelectorAll(".log-viewer-token-structural");
    expect(structs.length).toBe(5); // {, :, [, ], }
  });
});

// ── Edge cases ─────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("returns null for empty strings", () => {
    expect(colorizeJsonText("")).toBeNull();
  });

  it("returns null for whitespace-only strings", () => {
    expect(colorizeJsonText("   ")).toBeNull();
  });

  it("returns null for null/undefined input", () => {
    expect(colorizeJsonText(null)).toBeNull();
    expect(colorizeJsonText(undefined)).toBeNull();
  });

  it("renders nothing in DOM for empty input", () => {
    const { container } = render(colorizeJsonText(""));
    expect(container.children.length).toBe(0);
  });

  it("renders nothing in DOM for whitespace-only input", () => {
    const { container } = render(colorizeJsonText("   "));
    expect(container.children.length).toBe(0);
  });

  it("renders nothing in DOM for null/undefined input", () => {
    const { container } = render(colorizeJsonText(null));
    expect(container.children.length).toBe(0);

    const { container: container2 } = render(colorizeJsonText(undefined));
    expect(container2.children.length).toBe(0);
  });
});
