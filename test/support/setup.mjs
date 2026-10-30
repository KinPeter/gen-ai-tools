import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./server.mjs";

// ── ResizeObserver polyfill (jsdom has no built-in) ───────────────────────
// The observer records observed elements and fires the callback with a
// synthetic contentRect.  This lets components that depend on it (ImageViewer)
// run without "ResizeObserver is not defined" errors in jsdom.
//
// Tests can trigger ResizeObserver callbacks via ResizeObserver._fireAll(entries)
// to simulate resize events for every active observer instance.
if (typeof window !== "undefined") {
  const registeredObservers = [];

  function MockResizeObserver(callback) {
    this._callback = callback;
    this._entries = [];
    this._observedElements = new Set();
    registeredObservers.push(this);
  }

  MockResizeObserver.prototype.observe = function (el) {
    this._observedElements.add(el);
    // Fire with stored entries so components react on observe()
    if (this._entries.length > 0) {
      this._fire(this._entries);
    }
  };

  MockResizeObserver.prototype.disconnect = function () {
    this._observedElements.clear();
    const idx = registeredObservers.indexOf(this);
    if (idx >= 0) registeredObservers.splice(idx, 1);
  };

  MockResizeObserver.prototype.unobserve = function () {};

  MockResizeObserver.prototype._fire = function (entries) {
    this._entries = entries;
    this._callback(entries, this);
  };

  // Global helper: fire all registered observers with the same entries
  MockResizeObserver._fireAll = function (entries = []) {
    registeredObservers.forEach((observer) => observer._fire(entries));
  };

  Object.defineProperty(window, "ResizeObserver", {
    value: MockResizeObserver,
    writable: true,
    configurable: true,
  });
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());
