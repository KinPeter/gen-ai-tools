// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { useImageLog } from "../../dist-browser/src/hooks/useImageLog";

// --- Helpers ---

/** Stand-in for a fetch reply: the hook only reads `ok`, `status` and `json()`. */
function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

/** Stand-in for a reply whose body is not JSON: calling `json()` throws. */
function brokenJsonResponse(status) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON at position 0");
    },
  };
}

/** A reply that only settles when the request's abort signal fires. */
function replyUntilAbort(signal) {
  return new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => {
      reject(
        Object.assign(new Error("The operation was aborted"), {
          name: "AbortError",
        }),
      );
    });
  });
}

/** Mocks fetch and records `{ url, options }` for every call the hook makes. */
function mockFetch(handler) {
  const calls = [];
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return handler(calls.length);
    });
  return { calls, spy };
}

/** Waits for the lookup to settle and returns the hook state. */
async function settled(result) {
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result.current;
}

/**
 * Every way a lookup can go wrong, and the message the hook must show for it.
 * `reply` is what the mocked fetch returns (or throws).
 */
const failureCases = [
  {
    label: "the error field of the response body",
    reply: () => jsonResponse({ error: "Database unavailable" }, 503),
    error: "Database unavailable",
  },
  {
    label: "the status code when the body has no error field",
    reply: () => jsonResponse({}, 500),
    error: "HTTP 500",
  },
  {
    label: "the status code when the body is not JSON",
    reply: () => brokenJsonResponse(502),
    error: "HTTP 502",
  },
  {
    label: "the thrown message when the request itself fails",
    reply: () => {
      throw new Error("network down");
    },
    error: "network down",
  },
  {
    label: "a generic message when the thrown value has no message",
    reply: () => {
      throw { name: "WeirdFailure" };
    },
    error: "Failed to load log",
  },
];

// --- Lifecycle ---

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// --- Tests ---

describe("useImageLog", () => {
  it("reports no log state while nothing is selected", () => {
    const { calls } = mockFetch(() => jsonResponse({ filename: "a" }));
    const { result } = renderHook(() => useImageLog(null));

    expect(result.current).toEqual({
      selected: false,
      entry: null,
      loading: false,
      error: null,
    });
    expect(calls).toHaveLength(0);
  });

  it("reports a pending lookup before the request resolves", () => {
    const { calls } = mockFetch(() => jsonResponse({ filename: "a" }));
    const { result } = renderHook(() => useImageLog("random/a.png"));

    expect(calls).toHaveLength(1);
    expect(result.current).toEqual({
      selected: true,
      entry: null,
      loading: true,
      error: null,
    });
  });

  it("looks up the selected image at the find-log endpoint", async () => {
    const entry = {
      filename: "a",
      prompt: { text: "a cat" },
      generatedIn: "0:24",
    };
    const { calls } = mockFetch(() => jsonResponse(entry));
    const { result } = renderHook(() => useImageLog("random/a.png"));

    expect(await settled(result)).toEqual({
      selected: true,
      entry,
      loading: false,
      error: null,
    });

    expect(calls[0].url).toBe("/api/logging/find-log?filename=random%2Fa.png");
    // Log entries can be re-uploaded for the same image, so the request must
    // never be served from a cache.
    expect(calls[0].options.cache).toBe("no-store");
    expect(calls[0].options.headers.Accept).toBe("application/json");
    expect(calls[0].options.signal).toBeInstanceOf(AbortSignal);
  });

  it("treats a 404 as 'no log for this image' rather than an error", async () => {
    mockFetch(() =>
      jsonResponse({ error: "No log entry found for: a.png" }, 404),
    );
    const { result } = renderHook(() => useImageLog("a.png"));

    expect(await settled(result)).toEqual({
      selected: true,
      entry: null,
      loading: false,
      error: null,
    });
  });

  it("returns no entry when an ok response has an empty body", async () => {
    mockFetch(() => jsonResponse(null, 200));
    const { result } = renderHook(() => useImageLog("a.png"));

    expect(await settled(result)).toEqual({
      selected: true,
      entry: null,
      loading: false,
      error: null,
    });
  });

  it("returns no entry when an ok response body is not JSON", async () => {
    // A 200 that cannot be parsed is a missing log, not a lookup failure: the
    // hook only reports errors for non-ok responses.
    mockFetch(() => brokenJsonResponse(200));
    const { result } = renderHook(() => useImageLog("a.png"));

    expect(await settled(result)).toEqual({
      selected: true,
      entry: null,
      loading: false,
      error: null,
    });
  });

  it("reports the endpoint error when the selection has no filename", async () => {
    // `buildLogUrl` trims, so a whitespace-only selection sends an empty
    // `filename` and find-log answers 400 (find-log.mjs:46-52).
    const { calls } = mockFetch(() =>
      jsonResponse({ error: "Missing filename parameter" }, 400),
    );
    const { result } = renderHook(() => useImageLog("   "));

    expect(calls[0].url).toBe("/api/logging/find-log?filename=");
    expect(await settled(result)).toEqual({
      selected: true,
      entry: null,
      loading: false,
      error: "Missing filename parameter",
    });
  });

  for (const { label, reply, error } of failureCases) {
    it(`reports a failed lookup as ${label}`, async () => {
      mockFetch(reply);
      const { result } = renderHook(() => useImageLog("a.png"));

      expect(await settled(result)).toEqual({
        selected: true,
        entry: null,
        loading: false,
        error,
      });
    });
  }

  it("re-looks up the same image when the refresh key changes", async () => {
    let body = { filename: "a", prompt: { text: "first" } };
    const { calls } = mockFetch(() => jsonResponse(body));
    const { result, rerender } = renderHook(
      ({ path, key }) => useImageLog(path, key),
      { initialProps: { path: "a.png", key: 0 } },
    );

    await settled(result);
    expect(result.current.entry.prompt.text).toBe("first");

    body = { filename: "a", prompt: { text: "second" } };
    rerender({ path: "a.png", key: 1 });
    await settled(result);

    expect(calls).toHaveLength(2);
    expect(result.current.entry.prompt.text).toBe("second");
  });

  it("aborts the in-flight lookup when the selection changes", async () => {
    const signals = [];
    const { calls } = mockFetch((callCount) => {
      const signal = calls[callCount - 1].options.signal;
      signals.push(signal);

      // The first request is only settled by the abort the hook fires when the
      // selection changes, so it rejects the way a real aborted fetch does.
      if (callCount === 1) return replyUntilAbort(signal);

      return jsonResponse({ filename: "b", prompt: { text: "b" } });
    });

    const { result, rerender } = renderHook((path) => useImageLog(path), {
      initialProps: "a.png",
    });

    rerender("b.png");

    expect(signals[0].aborted).toBe(true);
    // The aborted request is ignored, so no error is shown for it.
    expect(await settled(result)).toEqual({
      selected: true,
      entry: { filename: "b", prompt: { text: "b" } },
      loading: false,
      error: null,
    });
  });

  it("aborts every superseded lookup when the selection changes twice", async () => {
    const signals = [];
    const { calls } = mockFetch((callCount) => {
      const signal = calls[callCount - 1].options.signal;
      signals.push(signal);

      // Only the final selection is allowed to settle; the two requests it
      // replaces are settled by the effect cleanup aborts.
      if (callCount < 3) return replyUntilAbort(signal);

      return jsonResponse({ filename: "c", prompt: { text: "c" } });
    });

    const { result, rerender } = renderHook((path) => useImageLog(path), {
      initialProps: "a.png",
    });

    rerender("b.png");
    rerender("c.png");

    expect(calls).toHaveLength(3);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(true);
    expect(signals[2].aborted).toBe(false);

    expect(await settled(result)).toEqual({
      selected: true,
      entry: { filename: "c", prompt: { text: "c" } },
      loading: false,
      error: null,
    });
  });

  it("clears the log state when the selection is dropped mid-lookup", async () => {
    const signals = [];
    const { calls } = mockFetch((callCount) => {
      const signal = calls[callCount - 1].options.signal;
      signals.push(signal);
      return replyUntilAbort(signal);
    });

    const { result, rerender } = renderHook((path) => useImageLog(path), {
      initialProps: "a.png",
    });

    // The lookup is still in flight when the selection is dropped.
    rerender(null);

    await waitFor(() => expect(signals[0].aborted).toBe(true));

    // The aborted request must not leave an error or a pending state behind.
    expect(calls).toHaveLength(1);
    expect(result.current).toEqual({
      selected: false,
      entry: null,
      loading: false,
      error: null,
    });
  });

  it("clears the log state when the selection is dropped", async () => {
    mockFetch(() => jsonResponse({ filename: "a" }));
    const { result, rerender } = renderHook((path) => useImageLog(path), {
      initialProps: "a.png",
    });

    await settled(result);
    rerender(null);

    expect(result.current).toEqual({
      selected: false,
      entry: null,
      loading: false,
      error: null,
    });
  });
});
