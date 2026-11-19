import { parse } from "yaml";
import { validateJobData } from "../../../../comfyui/workflow-builder/validation.mjs";

/*
 * Module-specific fixtures for the two tests beside this file
 * (test/tools-hub/api/comfy/validate-yaml.test.mjs and
 * test/tools-hub/api/comfy/validate-input.test.mjs), plus the test-standards
 * "fixtures sit beside the tests that use them" rule. They also feed
 * test/tools-hub/api/index.test.mjs and test/tools-hub/server.test.mjs, which
 * dispatch the route through the registry and therefore need a body that passes,
 * and test/tools-hub/utils/request.test.mjs, which reads a body through the same
 * route path.
 *
 * These are the shapes comfyui/inputs/input.example.yaml writes, not invented
 * ones, so a verdict in those tests is a verdict a real input file gets. The
 * message constants are the texts the handlers put in the response, written out
 * once here so no test has to retype them; the oracles below read the verdict
 * back out of the `yaml` library and the workflow builder so an expectation
 * cannot pass because a test guessed the wording.
 */

/** The URL the validate-input endpoint answers, as `api/index.mjs` mounts it. */
export const VALIDATE_INPUT_ROUTE = "/api/comfy/validate-input";

/** A two-block batch input file, in the shape comfyui/inputs/input.example.yaml writes. */
export const INPUT_YAML = `- base-workflow: example-base-workflow
  output-folder: rover-city
  filename-prefix: rover
  steps: 2
  cfg: 3.5
  size:
    width: 832
    height: 1216
  prompts:
    - tries: 2
      prompt:
        - glossy, warm colors
        - 1girl, rover, wuthering waves
      negative-prompt:
        - insects, spiders
    - seed: random
      prompt:
        - photo of the Budapest Chain Bridge at night, cyberpunk neon`;

/** Valid, but omits the two fields validateJobData warns about, and uses CJK and emoji. */
export const NO_HINTS_YAML = `- base-workflow: example-base-workflow
  prompts:
    - prompt:
        - 悪夢 💖 masterpiece`;

/** A flow sequence left open, and no `#` — the bytes themselves are the failing syntax. */
export const BAD_SYNTAX_YAML = `- base-workflow: example-base-workflow
  prompts: [unclosed`;

/** What `serve` puts in front of whatever reading the body failed with. */
export const INVALID_BODY_PREFIX = "Invalid request body: ";

/** Reported when the caller sent no body at all. */
export const EMPTY_BODY_ERROR =
  "Empty request body — send the YAML input file as the body";

/** Reported by `parseBody` when the accumulated body passes the size cap. */
export const BODY_TOO_LARGE_ERROR = "Request body too large";

/** The 405 body every POST-only route here sends. */
export const METHOD_NOT_ALLOWED_ERROR = "Method Not Allowed";

/** Answered for a document that parses to null: empty, blank or comments only. */
export const EMPTY_DOCUMENT_ERROR =
  "YAML document is empty, expected a list of input blocks";

/** Answered for a list that parses fine but holds no blocks at all. */
export const EMPTY_LIST_ERROR =
  "YAML document is an empty list, expected at least one input block";

/**
 * What the `yaml` library itself says about `text`: its message, or null when
 * the text parses. The tests read their expectation out of this instead of
 * hard-coding wording, and use the null/non-null result as the premise that a
 * verdict could not have come from anywhere else.
 *
 * @param {string} text - YAML text, exactly as a request body carried it.
 * @returns {string | null} the library's message, or null when it accepted the text.
 */
export function libraryFailure(text) {
  try {
    parse(text);
    return null;
  } catch (err) {
    return err.message;
  }
}

/**
 * What `validateJobData` raises for `data`, or null when it accepts it — the
 * field-rule half of the verdict, taken from the workflow builder rather than
 * quoted from the module under test.
 *
 * @param {unknown} data - parsed document.
 * @returns {string | null} the rule's message, or null when every block passes.
 */
export function fieldFailure(data) {
  try {
    validateJobData(data);
    return null;
  } catch (err) {
    return err.message;
  }
}

/**
 * The verdict validate-yaml gives for a top level the parser did not read as a
 * list: the type in the message is whatever the library produced for `text`, so
 * the expectation is derived instead of typed in.
 *
 * @param {string} text - YAML text.
 * @returns {string} the rejection message for the shape `parse` answers for it.
 */
export function notAListFailure(text) {
  return `"${typeof parse(text)}" data, expected a YAML list`;
}
