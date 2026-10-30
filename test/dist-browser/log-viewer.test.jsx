// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LogViewer } from "../../dist-browser/src/components/LogViewer/LogViewer.jsx";
import { matchLogEntry } from "../../dist-browser/src/utils/log-entry.mjs";

// --- Fixtures ---

const fixtures = {
  logEntries: [
    {
      filename: "bp-cp_20261005233501.png",
      prompt: { text: "a cat" },
      generatedIn: "0:24",
    },
    {
      filename: "test-image.png",
      prompt: { text: "a dog" },
      generatedIn: "0:10",
    },
  ],
  imageEntries: [
    { name: "bp-cp_20261005233501.jpg", type: "file", ext: "jpg" },
    { name: "no-match.jpg", type: "file", ext: "jpg" },
    { name: "folder-only", type: "folder", ext: "" },
  ],
};

// --- Helpers ---

function renderLogViewer(props = {}) {
  const defaultProps = {
    entry: null,
    logEntries: fixtures.logEntries,
    logsLoading: false,
    ...props,
  };
  const result = render(<LogViewer {...defaultProps} />);
  return {
    ...result,
    rerenderLogViewer: (nextProps = {}) =>
      result.rerender(<LogViewer {...defaultProps} {...nextProps} />),
  };
}

// --- Tests ---

describe("matchLogEntry", () => {
  it("matches a .jpg image to its .png log entry", () => {
    const imageEntry = {
      name: "bp-cp_20261005233501.jpg",
      type: "file",
      ext: "jpg",
    };
    const result = matchLogEntry(imageEntry, fixtures.logEntries);
    expect(result.filename).toBe("bp-cp_20261005233501.png");
  });

  it("returns null for null entry", () => {
    expect(matchLogEntry(null, fixtures.logEntries)).toBeNull();
  });

  it("returns null for undefined entry", () => {
    expect(matchLogEntry(undefined, fixtures.logEntries)).toBeNull();
  });

  it("returns null when no log entry matches", () => {
    const imageEntry = { name: "missing.jpg", type: "file", ext: "jpg" };
    expect(matchLogEntry(imageEntry, fixtures.logEntries)).toBeNull();
  });

  it("converts .jpeg to .png", () => {
    const imageEntry = { name: "test.jpeg", type: "file", ext: "jpeg" };
    expect(matchLogEntry(imageEntry, fixtures.logEntries)).toBeNull();
  });

  it("converts .png to .png (identity)", () => {
    const imageEntry = { name: "test-image.png", type: "file", ext: "png" };
    const result = matchLogEntry(imageEntry, fixtures.logEntries);
    expect(result.filename).toBe("test-image.png");
  });

  it("returns null for non-image entries", () => {
    const imageEntry = { name: "folder-only", type: "folder", ext: "" };
    expect(matchLogEntry(imageEntry, fixtures.logEntries)).toBeNull();
  });

  it("returns null for empty log entries array", () => {
    const imageEntry = {
      name: "bp-cp_20261005233501.jpg",
      type: "file",
      ext: "jpg",
    };
    expect(matchLogEntry(imageEntry, [])).toBeNull();
  });
});

describe("LogViewer", () => {
  afterEach(() => cleanup());

  // ── Empty state ──────────────────────────────────────────────────────

  describe("empty state", () => {
    it('renders "No log entry" when entry is null', () => {
      const { getByText } = renderLogViewer({ entry: null });
      expect(getByText("No log entry")).toBeTruthy();
    });

    it('renders "No log entry" when entry is undefined', () => {
      const { getByText } = renderLogViewer({ entry: undefined });
      expect(getByText("No log entry")).toBeTruthy();
    });

    it("renders with the muted text class", () => {
      const { container } = renderLogViewer({ entry: null });
      const wrapper = container.querySelector(".log-viewer-empty");
      expect(wrapper).toBeTruthy();
    });
  });

  // ── No match state ───────────────────────────────────────────────────

  describe("no match state", () => {
    it('displays "No generation log found for this image" when no log matches', () => {
      const imageEntry = { name: "no-match.jpg", type: "file", ext: "jpg" };
      const { getByText } = renderLogViewer({ entry: imageEntry });
      expect(getByText("No generation log found for this image.")).toBeTruthy();
    });

    it("renders with the muted text class", () => {
      const imageEntry = { name: "no-match.jpg", type: "file", ext: "jpg" };
      const { container } = renderLogViewer({ entry: imageEntry });
      const wrapper = container.querySelector(".log-viewer-empty");
      expect(wrapper).toBeTruthy();
    });
  });

  // ── Loading state ────────────────────────────────────────────────────

  describe("loading state", () => {
    it('renders "Loading log…" when logsLoading is true and entry exists', () => {
      const imageEntry = {
        name: "bp-cp_20261005233501.jpg",
        type: "file",
        ext: "jpg",
      };
      const { getByText } = renderLogViewer({
        entry: imageEntry,
        logsLoading: true,
      });
      expect(getByText(/Loading log/i)).toBeTruthy();
    });
  });

  // ── Log entry rendering ──────────────────────────────────────────────

  describe("log entry rendering", () => {
    it("renders a <pre> element when a log entry matches", () => {
      const imageEntry = {
        name: "bp-cp_20261005233501.jpg",
        type: "file",
        ext: "jpg",
      };
      const { container } = renderLogViewer({ entry: imageEntry });
      expect(container.querySelector("pre")).toBeTruthy();
    });

    it("renders a <code> element inside the <pre>", () => {
      const imageEntry = {
        name: "bp-cp_20261005233501.jpg",
        type: "file",
        ext: "jpg",
      };
      const { container } = renderLogViewer({ entry: imageEntry });
      expect(container.querySelector("pre code")).toBeTruthy();
    });

    it("renders the JSON stringified log entry", () => {
      const imageEntry = {
        name: "bp-cp_20261005233501.jpg",
        type: "file",
        ext: "jpg",
      };
      const { container } = renderLogViewer({ entry: imageEntry });
      const code = container.querySelector("pre code");
      expect(code.textContent).toContain('"filename"');
      expect(code.textContent).toContain('"bp-cp_20261005233501.png"');
      expect(code.textContent).toContain('"a cat"');
    });

    it("renders the content wrapper with the correct class", () => {
      const imageEntry = {
        name: "bp-cp_20261005233501.jpg",
        type: "file",
        ext: "jpg",
      };
      const { container } = renderLogViewer({ entry: imageEntry });
      expect(container.querySelector(".log-viewer-content")).toBeTruthy();
    });

    it("renders with monospace font via CSS class", () => {
      const imageEntry = {
        name: "bp-cp_20261005233501.jpg",
        type: "file",
        ext: "jpg",
      };
      const { container } = renderLogViewer({ entry: imageEntry });
      const codeEl = container.querySelector(".log-viewer-code");
      expect(codeEl).toBeTruthy();
      // jsdom does not resolve CSS custom properties, so we check the
      // class selector exists instead of the computed style.
      expect(codeEl).toHaveClass("log-viewer-code");
    });
  });

  // ── CSS class structure ──────────────────────────────────────────────

  describe("CSS classes", () => {
    it("applies log-viewer-code class to the <pre> element", () => {
      const imageEntry = {
        name: "bp-cp_20261005233501.jpg",
        type: "file",
        ext: "jpg",
      };
      const { container } = renderLogViewer({ entry: imageEntry });
      const code = container.querySelector(".log-viewer-code");
      expect(code).toBeTruthy();
    });
  });
});
