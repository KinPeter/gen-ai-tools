import { describe, expect, it } from "vitest";
import { buildLogUrl } from "../../dist-browser/src/utils/log-url.mjs";

describe("buildLogUrl", () => {
  it("points at the find-log endpoint with the filename query", () => {
    expect(buildLogUrl("run/a.png")).toBe(
      "/api/logging/find-log?filename=run%2Fa.png",
    );
  });

  it("leaves a bare filename unencoded", () => {
    expect(buildLogUrl("a.png")).toBe("/api/logging/find-log?filename=a.png");
  });

  it("encodes spaces in the filename", () => {
    expect(buildLogUrl("shots/my shot.png")).toBe(
      "/api/logging/find-log?filename=shots%2Fmy%20shot.png",
    );
  });

  it("encodes characters that would break the query string", () => {
    expect(buildLogUrl("a+b&c=café.png")).toBe(
      "/api/logging/find-log?filename=a%2Bb%26c%3Dcaf%C3%A9.png",
    );
  });

  it("trims surrounding whitespace so the lookup matches the basename", () => {
    expect(buildLogUrl("  a.png  ")).toBe(
      "/api/logging/find-log?filename=a.png",
    );
  });

  it("produces an empty filename for missing input", () => {
    expect(buildLogUrl(null)).toBe("/api/logging/find-log?filename=");
    expect(buildLogUrl(undefined)).toBe("/api/logging/find-log?filename=");
    expect(buildLogUrl("")).toBe("/api/logging/find-log?filename=");
  });

  it("coerces a non-string value instead of throwing", () => {
    expect(buildLogUrl(42)).toBe("/api/logging/find-log?filename=42");
  });
});
