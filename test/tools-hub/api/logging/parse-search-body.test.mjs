import { describe, expect, it, vi } from "vitest";

/*
 * Mirrors tools-hub/api/logging/parse-search-body.mjs.
 *
 * Isolation: the validator imports SEARCH_FILTER_KEYS from
 * logging/mongodb/search-logs.mjs, whose client helper loads the mongodb
 * driver. Only the driver is mocked (test/support/mock-mongodb.mjs), so the
 * whole module chain runs for real and can never reach a database. The logging
 * module is deliberately NOT stubbed: the accepted keys and the 400 text that
 * lists them must come from the same source the query layer enforces, so a
 * stub — or a mock that dropped `...actual` — would hide drift instead of
 * proving it.
 *
 * parseSearchBody is pure, so no request or response stand-in is needed.
 */
import { mockMongoDriver } from "../../../support/mock-mongodb.mjs";

vi.mock("mongodb", () => mockMongoDriver());

import { SEARCH_FILTER_KEYS } from "../../../../logging/mongodb/search-logs.mjs";
import {
  SearchRequestError,
  parseSearchBody,
} from "../../../../tools-hub/api/logging/parse-search-body.mjs";

/** Wire text for `payload`; a string is sent verbatim, so malformed JSON can be probed. */
function bodyText(payload) {
  return typeof payload === "string" ? payload : JSON.stringify(payload);
}

/** parseSearchBody's answer for the body `payload` describes. */
function parse(payload) {
  return parseSearchBody(bodyText(payload));
}

/** The error parseSearchBody throws for `payload`, or null when it accepts it. */
function rejection(payload) {
  try {
    parseSearchBody(bodyText(payload));
  } catch (err) {
    return err;
  }

  return null;
}

/** The 400 message `payload` earns, or null when the body is accepted. */
function rejectedMessage(payload) {
  const err = rejection(payload);
  return err === null ? null : err.message;
}

describe("parseSearchBody", () => {
  describe("a body that is not there", () => {
    it("empty text means no filters and no limit", () => {
      expect(parse("")).toEqual({ filters: {}, limit: null });
    });

    it("whitespace-only text is the same as no body", () => {
      expect(parse("  \n\t  ")).toEqual({ filters: {}, limit: null });
    });

    it("a JSON null body is the same as no body", () => {
      expect(parse(null)).toEqual({ filters: {}, limit: null });
      expect(parse("null")).toEqual({ filters: {}, limit: null });
    });

    it("an empty object is the same as no body", () => {
      expect(parse({})).toEqual({ filters: {}, limit: null });
    });
  });

  describe("the filters the query layer handles", () => {
    it("accepts every key SEARCH_FILTER_KEYS names, dropping none and adding none", () => {
      const filters = Object.fromEntries(
        [...SEARCH_FILTER_KEYS].map((key) => [key, `needle-${key}`]),
      );

      // What toStrictEqual does pin here: every key the contract lists comes
      // back with its value, nothing beside `filters` and `limit` comes back,
      // and `limit` is exactly null. It does not compare key insertion order
      // for plain objects, so key order is left unasserted on purpose — the
      // order is cosmetic: what reaches the driver is the `$and` array
      // buildQuery returns, and its condition shapes are pinned per key in
      // test/logging/mongodb/search-logs.test.mjs.
      expect(parse(filters)).toStrictEqual({ filters, limit: null });
    });

    it("keeps a string value verbatim", () => {
      expect(parse({ workflow: "unholy" })).toEqual({
        filters: { workflow: "unholy" },
        limit: null,
      });
    });

    it("trims whitespace around a filter value", () => {
      expect(parse({ prompt: "  bad  " })).toEqual({
        filters: { prompt: "bad" },
        limit: null,
      });
    });

    it("keeps an array of strings as an array so the values AND together", () => {
      const { filters } = parse({ lora: ["FRover", "XL"] });

      expect(filters.lora).toEqual(["FRover", "XL"]);
      expect(Array.isArray(filters.lora)).toBe(true);
    });

    it("trims every entry of an array", () => {
      expect(parse({ model: [" unet ", "sd_xl "] })).toEqual({
        filters: { model: ["unet", "sd_xl"] },
        limit: null,
      });
    });

    it("a one-element array is still an array, not a bare string", () => {
      expect(parse({ sampler: ["euler"] }).filters.sampler).toEqual(["euler"]);
    });

    it("drops a blank value as if the filter had not been sent", () => {
      expect(parse({ workflow: "", prompt: "   ", model: null })).toEqual({
        filters: {},
        limit: null,
      });
    });

    it("drops an array whose entries are all blank", () => {
      expect(parse({ lora: ["", "  ", ""] })).toEqual({
        filters: {},
        limit: null,
      });
    });

    it("drops the blank entries of an array and keeps the rest", () => {
      expect(parse({ lora: [" FRover ", ""] }).filters).toEqual({
        lora: ["FRover"],
      });
    });
  });

  describe("bodies it refuses", () => {
    it("refuses a filter the query layer does not handle and names the key", () => {
      const err = rejection({ filename: "rover" });

      expect(err).toBeInstanceOf(SearchRequestError);
      expect(err.message).toContain("Unknown filter: filename");
    });

    it("lists in the message exactly the keys the query layer handles", () => {
      const message = rejectedMessage({ filename: "rover" });
      const allowed = message.split("Allowed filters: ")[1];

      expect(message.startsWith("Allowed filters: ")).toBe(false);
      expect(allowed.split(", ")).toEqual([...SEARCH_FILTER_KEYS]);
    });

    it("refuses a filter value that is not a string, naming the filter", () => {
      for (const value of [5, true, {}, ["euler", 1.2]]) {
        const err = rejection({ sampler: value });

        expect(err).toBeInstanceOf(SearchRequestError);
        expect(err.message).toBe(
          "Filter 'sampler' must be a string or an array of strings",
        );
      }
    });

    it("refuses a body that is not JSON", () => {
      expect(rejectedMessage('{ "workflow": "unholy"')).toBe(
        "Invalid JSON body",
      );
    });

    it("refuses a JSON scalar body", () => {
      expect(rejectedMessage('"unholy"')).toBe(
        "Request body must be a JSON object",
      );
      expect(rejectedMessage("25")).toBe("Request body must be a JSON object");
    });

    it("refuses an array body", () => {
      expect(rejectedMessage([{ workflow: "unholy" }])).toBe(
        "Request body must be a JSON object",
      );
    });
  });

  describe("limit", () => {
    it("passes a positive integer through", () => {
      expect(parse({ limit: 25 })).toEqual({ filters: {}, limit: 25 });
    });

    it("an absent or null limit means no limit", () => {
      expect(parse({})).toEqual({ filters: {}, limit: null });
      expect(parse({ limit: null })).toEqual({ filters: {}, limit: null });
    });

    it("refuses a limit that is not a positive integer", () => {
      for (const bad of [0, "3", -1, 2.5, true, {}]) {
        const err = rejection({ limit: bad });

        expect(err).toBeInstanceOf(SearchRequestError);
        expect(err.message).toBe("limit must be a positive integer");
      }
    });

    it("carries filters and a limit together", () => {
      expect(parse({ workflow: "unholy", limit: 5 })).toEqual({
        filters: { workflow: "unholy" },
        limit: 5,
      });
    });
  });

  it("every refusal is a SearchRequestError so the route can answer 400", () => {
    for (const payload of [
      "{ unclosed",
      '"unholy"',
      [{ workflow: "unholy" }],
      { filename: "rover" },
      { prompt: 5 },
      { limit: 0 },
    ]) {
      expect(rejection(payload)).toBeInstanceOf(SearchRequestError);
    }
  });
});
