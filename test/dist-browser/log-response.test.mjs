import { describe, expect, it } from "vitest";
import { logEntryFromResponse } from "../../dist-browser/src/utils/log-response.mjs";

describe("logEntryFromResponse", () => {
  it("returns a single log document unchanged", () => {
    const entry = {
      filename: "a",
      prompt: { text: "a cat", negative: "blurry" },
      generatedIn: "0:24",
    };
    expect(logEntryFromResponse(entry)).toBe(entry);
  });

  it("returns null when nothing was found", () => {
    expect(logEntryFromResponse(null)).toBeNull();
    expect(logEntryFromResponse(undefined)).toBeNull();
  });

  it("returns null for a non-object body", () => {
    expect(logEntryFromResponse("No log entry found for: a.png")).toBeNull();
    expect(logEntryFromResponse(0)).toBeNull();
    expect(logEntryFromResponse(false)).toBeNull();
  });

  it("keeps an empty object as a valid entry rather than treating it as missing", () => {
    // A document with no fields is still a document: the endpoint would have
    // answered 404 when there is no entry at all.
    expect(logEntryFromResponse({})).toEqual({});
  });

  it("returns an array body unchanged", () => {
    // Documents the current contract: `typeof data === "object"` is true for
    // arrays, so a bulk-shaped body is passed through as one entry. The find-log
    // endpoint never answers with an array, so this branch is defensive only.
    const bodies = [{ filename: "a" }, { filename: "b" }];
    expect(logEntryFromResponse(bodies)).toBe(bodies);
  });
});
