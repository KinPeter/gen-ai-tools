import { describe, expect, it } from "vitest";

/*
 * Mirrors tools-hub/utils/index.mjs.
 *
 * tools-hub/AGENTS.md states the barrel is "the single export surface: every
 * consumer inside tools-hub imports from that file". This test pins the db
 * lifecycle that the barrel must keep exporting, and proves the barrel forwards
 * the real implementations rather than copies.
 */
import * as utils from "../../../tools-hub/utils/index.mjs";
import * as db from "../../../tools-hub/utils/db.mjs";

const DB_LIFECYCLE = [
  "DbUnavailableError",
  "closeDb",
  "getCollection",
  "getImageLogCollection",
  "openDb",
];

describe("tools-hub/utils barrel", () => {
  it("exports every db lifecycle function documented in tools-hub/AGENTS.md", () => {
    for (const name of DB_LIFECYCLE) {
      expect(utils[name]).toBe(db[name]);
    }
  });

  it("exports DbUnavailableError as a constructible error class", () => {
    expect(typeof utils.DbUnavailableError).toBe("function");
    expect(new utils.DbUnavailableError("no connection")).toBeInstanceOf(Error);
  });
});
