import { parse } from "yaml";
import { validateJobData } from "../../../comfyui/workflow-builder/validation.mjs";

/**
 * Verdict for text that cleared every check; the response body as-is. It is one
 * shared object, so it is frozen: a caller that wrote to it would poison every
 * later verdict.
 */
const VALID = Object.freeze({ valid: true });

/** Answered for a document that parses to null: empty, blank or comments only. */
const EMPTY_DOCUMENT_ERROR =
  "YAML document is empty, expected a list of input blocks";

/** Answered for a list that parses fine but holds no blocks to validate. */
const EMPTY_LIST_ERROR =
  "YAML document is an empty list, expected at least one input block";

/** Tail of the message for a document whose top level is not a list. */
const NOT_A_LIST = "data, expected a YAML list";

/**
 * A byte-order mark is not part of the document. Editors write one, and `yaml`
 * only recognises it as a lexer token, so a BOM glued to the first `-` fails
 * with a message that blames the YAML.
 */
const BOM = /^\u{FEFF}/u;

/**
 * Message carried by a thrown error, so a throw that is not an Error object
 * still answers something readable.
 *
 * @param {unknown} err - what the try block caught.
 * @returns {string} its message, or the value itself when it has none.
 */
function errorMessage(err) {
  return err?.message ?? String(err);
}

/**
 * Verdict naming the first reason the document was rejected.
 *
 * @param {string} error - the reason, already human-readable.
 * @returns {{ valid: false, error: string }}
 */
function invalid(error) {
  return { valid: false, error };
}

/**
 * Parse the text as YAML, after dropping a leading byte-order mark.
 *
 * @param {string} text - request body text.
 * @returns {unknown} the document it describes.
 * @throws {Error} `parse error: <yaml message>` on a syntax failure.
 */
function parseInputDocument(text) {
  try {
    return parse(text.replace(BOM, ""));
  } catch (err) {
    throw new Error(`parse error: ${errorMessage(err)}`, { cause: err });
  }
}

/**
 * Reject the top-level shapes `validateJobData` answers nothing about: a null
 * document, anything that is not a list, and a list with no blocks in it.
 *
 * @param {unknown} data - parsed document.
 * @throws {Error} with the message the caller should report.
 */
function assertIsBlockList(data) {
  if (data == null) throw new Error(EMPTY_DOCUMENT_ERROR);
  if (!Array.isArray(data)) {
    throw new Error(`"${typeof data}" ${NOT_A_LIST}`);
  }
  if (data.length === 0) throw new Error(EMPTY_LIST_ERROR);
}

/**
 * Check a batch input YAML sent as request text: it must parse, must not be
 * null, must be a non-empty list, and `validateJobData` must accept every block
 * in it. Field rules belong to the workflow builder and are reported verbatim;
 * the first failure is the only one reported, because `validateJobData` throws on
 * the first bad field it reaches.
 *
 * @param {string} text - full YAML text of an input file.
 * @returns {{ valid: true } | { valid: false, error: string }} the verdict,
 *   ready to send as the response body. It never throws and reads nothing, but
 *   `validateJobData` warns on the console when a block omits `output-folder`
 *   or `filename-prefix`, so `WARNING:` lines can appear in the server log
 *   beside a `{"valid":true}` answer; they are not part of the verdict.
 */
export function validateYamlText(text) {
  try {
    const data = parseInputDocument(text);

    assertIsBlockList(data);
    validateJobData(data);
  } catch (err) {
    return invalid(errorMessage(err));
  }

  return VALID;
}
