// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LogViewer } from "../../dist-browser/src/components/LogViewer/LogViewer.jsx";

// --- Fixtures ---

const logEntry = {
  filename: "bp-cp_20261005233501",
  prompt: { text: "a cat", negative: "blurry" },
  generatedIn: "0:24",
  seed: 1234,
};

// --- Helpers ---

/** Renders LogViewer with the state shape `useImageLog` returns. */
function renderLogViewer(log) {
  return render(<LogViewer log={log} />);
}

// --- Tests ---

describe("LogViewer", () => {
  afterEach(() => cleanup());

  // ── Empty state ──────────────────────────────────────────────────────

  describe("empty state", () => {
    it('renders "No log entry" when nothing is selected', () => {
      const { getByText } = renderLogViewer({
        selected: false,
        entry: null,
        loading: false,
        error: null,
      });
      expect(getByText("No log entry")).toBeInTheDocument();
    });

    it('renders "No log entry" when the log prop is missing entirely', () => {
      const { getByText } = render(<LogViewer />);
      expect(getByText("No log entry")).toBeInTheDocument();
    });

    it("keeps the empty state even when a stale entry or error is present", () => {
      const { getByText, container } = renderLogViewer({
        selected: false,
        entry: logEntry,
        loading: true,
        error: "HTTP 500",
      });
      expect(getByText("No log entry")).toBeInTheDocument();
      expect(container.querySelector(".log-viewer-loading-text")).toBeNull();
      expect(container.querySelector(".log-viewer-error")).toBeNull();
    });

    it("uses the muted wrapper class for the empty state", () => {
      const { container } = renderLogViewer({ selected: false });
      expect(container.querySelector(".log-viewer-empty")).toBeInTheDocument();
    });
  });

  // ── Loading state ────────────────────────────────────────────────────

  describe("loading state", () => {
    it('renders "Loading log…" while the lookup is in flight', () => {
      const { getByText } = renderLogViewer({
        selected: true,
        entry: null,
        loading: true,
        error: null,
      });
      expect(getByText(/Loading log/i)).toBeInTheDocument();
    });

    it("marks the loading state as a busy status region", () => {
      const { container } = renderLogViewer({ selected: true, loading: true });
      const wrapper = container.querySelector(".log-viewer-empty");
      expect(wrapper).toHaveAttribute("role", "status");
      expect(wrapper).toHaveAttribute("aria-busy", "true");
    });

    it("shows loading ahead of an error or a missing entry", () => {
      const { getByText, container } = renderLogViewer({
        selected: true,
        entry: null,
        loading: true,
        error: "HTTP 500",
      });
      expect(getByText(/Loading log/i)).toBeInTheDocument();
      expect(container.querySelector(".log-viewer-error")).toBeNull();
      expect(container.querySelector(".log-viewer-no-match")).toBeNull();
    });

    it("shows loading instead of an entry that is already present", () => {
      const { getByText, container } = renderLogViewer({
        selected: true,
        entry: logEntry,
        loading: true,
        error: null,
      });
      expect(getByText(/Loading log/i)).toBeInTheDocument();
      expect(container.querySelector(".log-viewer-content")).toBeNull();
    });
  });

  // ── Lookup failed state ──────────────────────────────────────────────

  describe("lookup failed state", () => {
    it("renders the error message returned by the lookup", () => {
      const { getByText } = renderLogViewer({
        selected: true,
        entry: null,
        loading: false,
        error: "Database unavailable",
      });
      expect(
        getByText("Log lookup failed: Database unavailable"),
      ).toBeInTheDocument();
    });

    it("announces the failure as an alert", () => {
      const { container } = renderLogViewer({
        selected: true,
        error: "HTTP 502",
      });
      const wrapper = container.querySelector(".log-viewer-empty");
      expect(wrapper).toHaveAttribute("role", "alert");
      expect(wrapper.querySelector(".log-viewer-error")).toBeInTheDocument();
    });

    it("shows the error instead of the no-log message", () => {
      const { getByText, container } = renderLogViewer({
        selected: true,
        entry: null,
        loading: false,
        error: "network down",
      });
      expect(getByText("Log lookup failed: network down")).toBeInTheDocument();
      expect(container.querySelector(".log-viewer-no-match")).toBeNull();
    });

    it("shows the error instead of a stale entry left from a previous lookup", () => {
      const { getByText, container } = renderLogViewer({
        selected: true,
        entry: logEntry,
        loading: false,
        error: "HTTP 503",
      });
      expect(getByText("Log lookup failed: HTTP 503")).toBeInTheDocument();
      expect(container.querySelector(".log-viewer-content")).toBeNull();
    });

    it("renders the no-log message when the error is empty", () => {
      const { getByText } = renderLogViewer({
        selected: true,
        entry: null,
        loading: false,
        error: "",
      });
      expect(
        getByText("No generation log found for this image."),
      ).toBeInTheDocument();
    });
  });

  // ── No log found state ───────────────────────────────────────────────

  describe("no log found state", () => {
    it('displays "No generation log found for this image" when there is no entry', () => {
      const { getByText } = renderLogViewer({
        selected: true,
        entry: null,
        loading: false,
        error: null,
      });
      expect(
        getByText("No generation log found for this image."),
      ).toBeInTheDocument();
    });

    it("treats an undefined entry as no log found", () => {
      const { getByText } = renderLogViewer({ selected: true });
      expect(
        getByText("No generation log found for this image."),
      ).toBeInTheDocument();
    });

    it("uses the muted wrapper class for the no-log state", () => {
      const { container } = renderLogViewer({ selected: true, entry: null });
      expect(container.querySelector(".log-viewer-empty")).toBeInTheDocument();
    });
  });

  // ── Log entry rendering ──────────────────────────────────────────────

  describe("log entry rendering", () => {
    it("renders a <pre> element containing the entry", () => {
      const { container } = renderLogViewer({
        selected: true,
        entry: logEntry,
      });
      expect(container.querySelector("pre")).toBeInTheDocument();
      expect(container.querySelector("pre code")).toBeInTheDocument();
    });

    it("renders the JSON stringified entry", () => {
      const { container } = renderLogViewer({
        selected: true,
        entry: logEntry,
      });
      const code = container.querySelector("pre code");
      expect(code.textContent).toContain('"filename"');
      expect(code.textContent).toContain('"bp-cp_20261005233501"');
      expect(code.textContent).toContain('"a cat"');
    });

    it("renders colorized spans inside the <code> element", () => {
      const { container } = renderLogViewer({
        selected: true,
        entry: logEntry,
      });
      const spans = container.querySelectorAll(".log-viewer-token-key");
      expect(spans.length).toBeGreaterThan(0);
    });

    it("applies the log-viewer-content and log-viewer-code classes", () => {
      const { container } = renderLogViewer({
        selected: true,
        entry: logEntry,
      });
      expect(
        container.querySelector(".log-viewer-content"),
      ).toBeInTheDocument();
      const code = container.querySelector(".log-viewer-code");
      expect(code).toBeInTheDocument();
      expect(code.tagName).toBe("PRE");
    });

    it("renders a log entry that is not a plain object", () => {
      const { container, getByText } = renderLogViewer({
        selected: true,
        entry: [{ filename: "a", prompt: "batch" }],
      });
      expect(container.querySelector("pre code")).toBeInTheDocument();
      expect(getByText(/"filename"/)).toBeInTheDocument();
    });
  });
});
