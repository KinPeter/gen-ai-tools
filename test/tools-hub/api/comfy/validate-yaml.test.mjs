import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

/*
 * Mirrors tools-hub/api/comfy/validate-yaml.mjs.
 *
 * Nothing is stubbed: `yaml` is the library the endpoint ships with and
 * `validateJobData` is the real workflow-builder rule set, so a verdict written
 * here is the verdict the route sends. The field rules already have their own
 * suite (test/comfyui/workflow-builder/validation.test.mjs) and are not
 * restated; this file covers the wrapper's own contract — the byte-order mark,
 * the parse failure, the top-level shapes validateJobData answers nothing about
 * (a null document, a non-list, an empty list), the verdict object being frozen,
 * and the rule that one failure is reported alone and verbatim.
 *
 * Isolation: validateYamlText is pure — no disk, no network, no database — so
 * the MSW server test/support/setup.mjs starts stays idle here. console.warn is
 * silenced in beforeEach because validateJobData prints `WARNING:` lines for a
 * block that omits `output-folder` or `filename-prefix`; one test below reads
 * those calls, the rest only need them out of the console. The YAML payloads
 * and the library-message oracle come from fixtures.mjs beside this file.
 */
import {
  BAD_SYNTAX_YAML,
  EMPTY_DOCUMENT_ERROR,
  EMPTY_LIST_ERROR,
  INPUT_YAML,
  NO_HINTS_YAML,
  fieldFailure,
  libraryFailure,
  notAListFailure,
} from "./fixtures.mjs";
import { validateYamlText } from "../../../../tools-hub/api/comfy/validate-yaml.mjs";

const BOM = "\u{FEFF}";

/** A valid list carrying a key the workflow builder has no rule for. */
const UNKNOWN_FIELD_YAML = `- base-workflow: example-base-workflow
  output-folder: rover-city
  filename-prefix: rover
  prompts:
    - prompt:
        - glossy, warm colors
  unknown-field: 7`;

/** The field rule for a block whose mandatory field is empty. */
const EMPTY_FIELD_YAML = `- base-workflow: ""
  output-folder: rover-city
  prompts:
    - prompt:
        - glossy, warm colors`;

/** Two blocks that each fail a different rule. */
const TWO_BAD_BLOCKS_YAML = `- prompts:
    - prompt:
        - glossy, warm colors
- base-workflow: example-base-workflow
  output-folder: rover-city
  steps: many
  prompts:
    - prompt:
        - photo of the Chain Bridge at night`;

/** A list whose only item is itself a list: the shape no field rule describes. */
const NESTED_LIST_YAML = "- - a\n";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("validateYamlText", () => {
  it("accepts a batch input file in the shape comfyui writes", () => {
    // Pinned premises: the payload is well-formed YAML and clears every field
    // rule, so a valid verdict below cannot come from a gate shrugging it off.
    expect(libraryFailure(INPUT_YAML)).toBeNull();
    expect(fieldFailure(parse(INPUT_YAML))).toBeNull();

    expect(validateYamlText(INPUT_YAML)).toEqual({ valid: true });
  });

  it("accepts CRLF line endings and prompts in CJK and emoji", () => {
    expect(validateYamlText(INPUT_YAML.replace(/\n/g, "\r\n"))).toEqual({
      valid: true,
    });
    expect(validateYamlText(`\r\n${NO_HINTS_YAML}`)).toEqual({ valid: true });
    expect(validateYamlText(NO_HINTS_YAML)).toEqual({ valid: true });
  });

  it("reports a syntax failure as `parse error: <the library's own message>`", () => {
    const message = libraryFailure(BAD_SYNTAX_YAML);
    expect(message).toBeTruthy();

    expect(validateYamlText(BAD_SYNTAX_YAML)).toEqual({
      valid: false,
      error: `parse error: ${message}`,
    });
    // The mark goes before the parser runs, so a BOM cannot change this verdict.
    expect(validateYamlText(`${BOM}${BAD_SYNTAX_YAML}`)).toEqual({
      valid: false,
      error: `parse error: ${libraryFailure(BAD_SYNTAX_YAML)}`,
    });
  });

  it("answers the empty-document message for text that parses to null", () => {
    for (const text of [
      "",
      "\n",
      "   \n\t\n",
      "# a comment only\n",
      "# two\n# comments\n",
      "~\n",
      "null\n",
      BOM,
    ]) {
      // Pinned premise: `parse` answers null for these, which is the shape
      // validateJobData says nothing about.
      expect(parse(text)).toBeNull();
      expect(validateYamlText(text)).toEqual({
        valid: false,
        error: EMPTY_DOCUMENT_ERROR,
      });
    }
  });

  it("rejects a list that contains no blocks, even though it parses", () => {
    // Pinned premises: the parser answers an empty array here, so the null
    // branch that reports an empty document does not apply, and the workflow
    // builder has no rule that requires a block — the empty list is rejected by
    // this module's own gate, not by a field rule.
    for (const text of ["[]", "[] # nothing", "[]\n"]) {
      const data = parse(text);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(0);
      expect(fieldFailure(data)).toBeNull();

      expect(validateYamlText(text)).toEqual({
        valid: false,
        error: EMPTY_LIST_ERROR,
      });
    }
  });

  it("returns the same frozen verdict object, so a caller cannot poison it", () => {
    const verdict = validateYamlText(INPUT_YAML);

    // The valid answer is one shared object, so every call hands back the very
    // same one. Freezing is what keeps a caller's write from changing the next
    // response.
    expect(validateYamlText(INPUT_YAML)).toBe(verdict);
    expect(Object.isFrozen(verdict)).toBe(true);
    expect(() => {
      verdict.valid = false;
    }).toThrow(TypeError);
    expect(verdict).toEqual({ valid: true });
  });

  it("rejects a top level that is not a list, naming the type it found", () => {
    expect(validateYamlText("base-workflow: example-base-workflow\n")).toEqual({
      valid: false,
      error: notAListFailure("base-workflow: example-base-workflow\n"),
    });

    // The type in the message is what the parser produced, so the oracle reads
    // it back out of the library instead of from the module under test.
    for (const text of ["glossy, warm colors\n", "3.5\n", "true\n"]) {
      expect(validateYamlText(text)).toEqual({
        valid: false,
        error: notAListFailure(text),
      });
    }
  });

  it("hands any list on to validateJobData instead of judging the blocks itself", () => {
    expect(validateYamlText(UNKNOWN_FIELD_YAML)).toEqual({ valid: true });

    const reason = fieldFailure(parse(NESTED_LIST_YAML));
    expect(reason).not.toBeNull();
    expect(validateYamlText(NESTED_LIST_YAML)).toEqual({
      valid: false,
      error: reason,
    });
  });

  it("passes a field rule through verbatim, with no prefix of its own", () => {
    const reason = fieldFailure(parse(EMPTY_FIELD_YAML));
    expect(reason).toContain("must be a non-empty string");

    expect(validateYamlText(EMPTY_FIELD_YAML)).toEqual({
      valid: false,
      error: reason,
    });
    expect(validateYamlText(`\n\n${EMPTY_FIELD_YAML}`)).toEqual({
      valid: false,
      error: reason,
    });
  });

  it("reports only the first failure when several blocks are bad", () => {
    const [first, second] = parse(TWO_BAD_BLOCKS_YAML);
    const firstReason = fieldFailure([first]);
    const secondReason = fieldFailure([second]);
    // Pinned premise: both blocks fail, for different reasons, so reporting one
    // of them is a real choice and not a document that only had one bad block.
    expect(firstReason).not.toBeNull();
    expect(secondReason).not.toBeNull();
    expect(secondReason).not.toBe(firstReason);

    const verdict = validateYamlText(TWO_BAD_BLOCKS_YAML);
    expect(verdict).toEqual({ valid: false, error: firstReason });
    expect(verdict.error).not.toContain("steps");
  });

  it("strips a leading byte-order mark so an editor-saved file still validates", () => {
    // Pinned premise: without the strip the library rejects this very text, so
    // these assertions cannot pass if the module ever stops dropping the mark.
    // The wording is not part of the premise: what matters is that the parser
    // answers a failure for the BOM glued to the `-`.
    expect(libraryFailure(INPUT_YAML)).toBeNull();
    expect(libraryFailure(`${BOM}- base-workflow: example\n`)).toBeTruthy();

    expect(validateYamlText(`${BOM}${INPUT_YAML}`)).toEqual({ valid: true });
    expect(validateYamlText(`${BOM}\n${INPUT_YAML}`)).toEqual({ valid: true });
    expect(validateYamlText(`${BOM}${INPUT_YAML}\r\n`)).toEqual({
      valid: true,
    });
    expect(validateYamlText(`${BOM}${NO_HINTS_YAML}`)).toEqual({ valid: true });
  });

  it("leaves a byte-order mark that is not the first character as content", () => {
    expect(validateYamlText(`${NO_HINTS_YAML}${BOM}`)).toEqual({ valid: true });
    expect(
      validateYamlText(
        NO_HINTS_YAML.replace("masterpiece", `masterpiece${BOM}`),
      ),
    ).toEqual({ valid: true });

    // Only the mark at position 0 goes, so a doubled one still reaches the
    // parser. The answer must match what the library says about the text with
    // one mark left, which is also proof that exactly one mark was dropped.
    const doubled = `${BOM}${BOM}${INPUT_YAML}`;
    const oneMarkLeft = `${BOM}${INPUT_YAML}`;
    expect(libraryFailure(oneMarkLeft)).toBeTruthy();
    expect(validateYamlText(doubled)).toEqual({
      valid: false,
      error: `parse error: ${libraryFailure(oneMarkLeft)}`,
    });
    // The contrast: the same file with one mark instead of two is accepted.
    expect(validateYamlText(oneMarkLeft)).toEqual({ valid: true });
  });

  it("keeps validateJobData's WARNING lines out of the verdict", () => {
    expect(validateYamlText(NO_HINTS_YAML)).toEqual({ valid: true });
    // The warning really fired — it just lives on the console, not in the body.
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('WARNING: "output-folder"'),
    );
    expect(JSON.stringify(validateYamlText(NO_HINTS_YAML))).toBe(
      '{"valid":true}',
    );
  });

  it("returns a verdict instead of throwing for anything it is handed", () => {
    for (const text of [undefined, null, 42, {}, ["- a"], Symbol("x")]) {
      const verdict = validateYamlText(text);
      expect(verdict.valid).toBe(false);
      expect(typeof verdict.error).toBe("string");
      expect(verdict.error.length).toBeGreaterThan(0);
    }
    expect(validateYamlText(`${BOM}${INPUT_YAML} `)).toEqual({ valid: true });
  });
});
