import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { MAX_BODY_SIZE } from "../../../../tools-hub/utils/index.mjs";

/*
 * Mirrors tools-hub/api/comfy/validate-input.mjs.
 *
 * Nothing is stubbed: the YAML checks live in validate-yaml.mjs, whose own
 * verdicts are tested beside this file, so the answers written here are the
 * ones a client gets. The request and response are the mockReq/mockRes stand-ins
 * from test/support/mock-response.mjs; its driven mockChunkedReq and
 * oneByteChunks carry the cases where the answer must not depend on how the
 * socket cut the body into chunks, and
 * the payloads, the response-message constants and the library/field-rule
 * oracles come from fixtures.mjs beside this file. This route reads no database,
 * no file and no socket beyond the request it was handed, so the MSW server
 * test/support/setup.mjs starts stays idle here.
 *
 * The oversize case keeps the caveat tools-hub/AGENTS.md records: utils/
 * request.mjs destroys the request in the same tick it rejects, so this mock
 * harness is the only place that 400 can be seen at all — `mockReq`'s destroy()
 * is a no-op, which is what lets an answer be written here. See
 * test/tools-hub/api/logging/search-logs.test.mjs for the same caveat.
 */
import {
  BAD_SYNTAX_YAML,
  BODY_TOO_LARGE_ERROR,
  EMPTY_BODY_ERROR,
  EMPTY_DOCUMENT_ERROR,
  EMPTY_LIST_ERROR,
  INPUT_YAML,
  INVALID_BODY_PREFIX,
  METHOD_NOT_ALLOWED_ERROR,
  NO_HINTS_YAML,
  VALIDATE_INPUT_ROUTE,
  fieldFailure,
  libraryFailure,
  notAListFailure,
} from "./fixtures.mjs";
import apiComfyValidateInput from "../../../../tools-hub/api/comfy/validate-input.mjs";
import {
  mockChunkedReq,
  mockReq,
  mockRes,
  oneByteChunks,
} from "../../../support/mock-response.mjs";

/** Fails the `prompts` rule, whose message quotes the whole block, CJK included. */
const CJK_MESSAGE_YAML = `- base-workflow: example-base-workflow
  filename-prefix: 悪夢 💖
  prompts: []`;

/** POSTs `body` through the route: string verbatim, object as JSON, undefined sends no bytes. */
async function post(body, contentType) {
  const req = mockReq(VALIDATE_INPUT_ROUTE, "POST", body);
  if (contentType !== undefined) req.headers["content-type"] = contentType;
  const res = mockRes();

  await apiComfyValidateInput().serve(req, res);
  return res._state();
}

/**
 * POSTs `text` delivered as `chunks`, so the body arrives the way a socket chose
 * to cut it rather than as one whole buffer. `parseBody` registers its listeners
 * synchronously, so the read is started before the chunks are sent.
 */
async function postChunks(text, chunks) {
  const req = mockChunkedReq(VALIDATE_INPUT_ROUTE, "POST", chunks);
  const res = mockRes();

  const done = apiComfyValidateInput().serve(req, res);
  req.send();
  req.finish();
  await done;
  return res._state();
}

describe("apiComfyValidateInput", () => {
  it("returns a route object with testUrl and serve", () => {
    const route = apiComfyValidateInput();

    expect(typeof route.testUrl).toBe("function");
    expect(typeof route.serve).toBe("function");
  });

  describe("testUrl", () => {
    it("matches /api/comfy/validate-input exactly, with a sub-path, a trailing slash and a query string", () => {
      const route = apiComfyValidateInput();

      for (const url of [
        VALIDATE_INPUT_ROUTE,
        `${VALIDATE_INPUT_ROUTE}/`,
        `${VALIDATE_INPUT_ROUTE}/filename.yaml`,
        `${VALIDATE_INPUT_ROUTE}//`,
        `${VALIDATE_INPUT_ROUTE}?name=example`,
        `${VALIDATE_INPUT_ROUTE}/?name=example`,
        `${VALIDATE_INPUT_ROUTE}/filename.yaml?name=example`,
      ]) {
        expect(route.testUrl(url)).toBe(true);
      }
    });

    it("does not match a look-alike prefix, a parent path or another endpoint", () => {
      const route = apiComfyValidateInput();

      for (const url of [
        "/api/comfy/validate-input-x",
        "/api/comfy/validate-inputs",
        "/api/comfy/validate-input.x",
        "/api/comfy/validate-inputx/filename.yaml",
        "/api/comfy/validate",
        "/api/comfy/",
        "/api/comfy",
        "/api/logging/find-log",
        "/api/dist-browser/fs",
        "/validate-input",
        "",
        undefined,
        null,
      ]) {
        expect(route.testUrl(url)).toBe(false);
      }
      // A sub-path with a query string is still this route's.
      expect(
        route.testUrl(`${VALIDATE_INPUT_ROUTE}/filename.yaml?name=a`),
      ).toBe(true);
    });
  });

  describe("POST /api/comfy/validate-input", () => {
    it('answers {"valid":true} for a batch input file that passes every check', async () => {
      const state = await post(INPUT_YAML);

      expect(state.status).toBe(200);
      expect(state.body).toEqual({ valid: true });
      expect(state.headers).toEqual({
        "Content-Type": "application/json",
        // http.mjs measures the payload in bytes, not characters.
        "Content-Length": Buffer.byteLength(JSON.stringify({ valid: true })),
      });
    });

    it('answers {"valid":false,"error":…} as 200, because an invalid file is the verdict', async () => {
      const message = libraryFailure(BAD_SYNTAX_YAML);
      expect(message).toBeTruthy();

      const state = await post(BAD_SYNTAX_YAML);

      expect(state.status).toBe(200);
      // Exactly the two keys, and the error is the message the validate-yaml
      // suite pinned, not one this route invented.
      expect(state.body).toEqual({
        valid: false,
        error: `parse error: ${message}`,
      });
      expect(JSON.stringify(state.body)).toMatch(
        /^\{"valid":false,"error":"parse error: /,
      );
      expect(JSON.stringify(state.body)).not.toContain("WARNING");
    });

    it("keeps validateJobData's WARNING lines on the console, out of the body", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const state = await post(NO_HINTS_YAML);

      expect(state.status).toBe(200);
      expect(state.body).toEqual({ valid: true });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('WARNING: "output-folder"'),
      );
      warn.mockRestore();
    });

    it("accepts every Content-Type, including the one curl --data-binary sends", async () => {
      for (const contentType of [
        "application/x-www-form-urlencoded",
        "application/yaml",
        "text/yaml",
        "text/plain; charset=utf-8",
        "multipart/form-data; boundary=----x",
        "application/json",
        "",
      ]) {
        const state = await post(INPUT_YAML, contentType);

        expect(state.status).toBe(200);
        expect(state.body).toEqual({ valid: true });
        // The answer's own type, never the type the caller sent.
        expect(state.headers["Content-Type"]).toBe("application/json");
      }

      const noHeader = await post(INPUT_YAML);
      expect(noHeader.status).toBe(200);
      expect(noHeader.body).toEqual({ valid: true });
    });

    it("answers the same verdict however the body was cut into chunks", async () => {
      const bytes = Buffer.from(CJK_MESSAGE_YAML, "utf8");
      // The premise that makes this bite: UTF-8 bytes outnumber the characters,
      // so cutting at every byte lands inside `悪`, `夢` and `💖`. This payload
      // fails the `prompts` rule, whose message quotes the whole block, so the
      // CJK prefix has to come back through the message intact.
      expect(bytes.length).toBeGreaterThan(Array.from(CJK_MESSAGE_YAML).length);
      const chunks = oneByteChunks(CJK_MESSAGE_YAML);
      expect(chunks.length).toBe(bytes.length);

      const whole = await post(CJK_MESSAGE_YAML);
      const split = await postChunks(CJK_MESSAGE_YAML, chunks);

      expect(whole.status).toBe(200);
      expect(split.status).toBe(200);
      expect(split.body).toEqual(whole.body);
      expect(split.body.error).toContain("悪夢 💖");
      expect(split.body.error).not.toContain("\u{FFFD}");

      // A parse failure does too: cut at every byte, the answer is still the
      // message the library gives for this text, not one about a replacement.
      const badChunks = oneByteChunks(BAD_SYNTAX_YAML);
      expect(badChunks.length).toBe(Buffer.byteLength(BAD_SYNTAX_YAML));
      expect((await postChunks(BAD_SYNTAX_YAML, badChunks)).body).toEqual(
        (await post(BAD_SYNTAX_YAML)).body,
      );
    });

    it("refuses a body that was never sent and an empty one with 400", async () => {
      for (const body of [undefined, ""]) {
        const state = await post(body);
        const expected = { error: `${INVALID_BODY_PREFIX}${EMPTY_BODY_ERROR}` };

        expect(state.status).toBe(400);
        expect(state.body).toEqual(expected);
        expect(state.headers).toEqual({
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(JSON.stringify(expected)),
        });
      }
    });

    it("still answers a verdict for a body that is only whitespace", async () => {
      const state = await post("   \n\n");

      // No bytes is a rejected request; blank bytes is a document that parsed to
      // nothing, which is the verdict validate-yaml reports, not a 400.
      expect(state.status).toBe(200);
      expect(state.body).toEqual({ valid: false, error: EMPTY_DOCUMENT_ERROR });
    });

    it("answers 400 when the body read fails for a reason other than size or emptiness", async () => {
      // `serve` turns any `parseBody` rejection into a 400, and request.mjs
      // forwards the request's `error` event to the caller (see
      // test/tools-hub/utils/request.test.mjs). Nothing else sends this
      // particular text, so a transport failure mid-read is pinned here rather
      // than left unreported.
      const req = mockChunkedReq(VALIDATE_INPUT_ROUTE, "POST", [
        Buffer.from(INPUT_YAML, "utf8").subarray(0, 20),
      ]);
      const res = mockRes();

      const done = apiComfyValidateInput().serve(req, res);
      req.send();
      req.fail(new Error("socket reset"));
      await done;

      const state = res._state();
      const expected = { error: `${INVALID_BODY_PREFIX}socket reset` };

      expect(state.status).toBe(400);
      expect(state.body).toEqual(expected);
      expect(state.headers).toEqual({
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(JSON.stringify(expected)),
      });
    });

    it("rejects a file that is a list with no blocks in it", async () => {
      // Pinned premises: the parser really answers an empty array for these
      // bodies and the workflow builder has no rule about having no blocks, so
      // the rejection comes from validate-yaml's own empty-list gate rather than
      // a field rule.
      for (const body of ["[]", "[] # nothing", "[]\n"]) {
        expect(Array.isArray(parse(body))).toBe(true);
        expect(parse(body)).toHaveLength(0);
        expect(fieldFailure(parse(body))).toBeNull();

        const state = await post(body);

        expect(state.status).toBe(200);
        expect(state.body).toEqual({ valid: false, error: EMPTY_LIST_ERROR });
      }

      // A list of one empty block is a different shape: it reaches the field
      // rules, which report the missing `base-workflow` verbatim.
      const emptyBlock = await post("- {}");
      expect(emptyBlock.status).toBe(200);
      expect(emptyBlock.body).toEqual({
        valid: false,
        error: fieldFailure(parse("- {}")),
      });
      expect(emptyBlock.body.error).toContain("base-workflow");
    });

    it("accepts a body of exactly MAX_BODY_SIZE bytes and rejects one more", async () => {
      const atTheCap = "a".repeat(MAX_BODY_SIZE);
      expect(Buffer.byteLength(atTheCap)).toBe(MAX_BODY_SIZE);
      expect(Buffer.byteLength(`${atTheCap}a`)).toBe(MAX_BODY_SIZE + 1);

      // 1048576 ASCII bytes is not over the cap, so it reaches the YAML checks,
      // which answer for the shape alone: a 1 MB scalar is not a list of blocks.
      const accepted = await post(atTheCap);
      expect(accepted.status).toBe(200);
      expect(accepted.body).toEqual({
        valid: false,
        error: notAListFailure(atTheCap),
      });

      const req = mockReq(VALIDATE_INPUT_ROUTE, "POST", `${atTheCap}a`);
      const destroyed = vi.spyOn(req, "destroy");
      const res = mockRes();
      await apiComfyValidateInput().serve(req, res);

      const expected = {
        error: `${INVALID_BODY_PREFIX}${BODY_TOO_LARGE_ERROR}`,
      };
      expect(res._state().status).toBe(400);
      expect(res._state().body).toEqual(expected);
      expect(res._state().headers).toEqual({
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(JSON.stringify(expected)),
      });
      // The destroy is the half of the failure that lands on a real socket, and
      // the reason the 400 above is all this harness can show.
      expect(destroyed).toHaveBeenCalledTimes(1);
    });
  });

  describe("method gate", () => {
    it("answers 405 with Allow: POST for every method but POST", async () => {
      const route = apiComfyValidateInput();

      for (const method of [
        "GET",
        "PUT",
        "DELETE",
        "HEAD",
        "OPTIONS",
        "PATCH",
      ]) {
        const req = mockReq(VALIDATE_INPUT_ROUTE, method, INPUT_YAML);
        const read = vi.spyOn(req, "on");
        const res = mockRes();

        await route.serve(req, res);
        const state = res._state();

        expect(state.status).toBe(405);
        expect(state.headers).toEqual({
          Allow: "POST",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(
            JSON.stringify({ error: METHOD_NOT_ALLOWED_ERROR }),
          ),
        });
        expect(state.body).toEqual({ error: METHOD_NOT_ALLOWED_ERROR });
        // Nothing was attached to the request: a 405 must not read a byte.
        expect(read).not.toHaveBeenCalled();
      }
    });

    it("answers 405 before looking at the body, so broken YAML is not a 400", async () => {
      const req = mockReq(VALIDATE_INPUT_ROUTE, "GET", BAD_SYNTAX_YAML);
      const res = mockRes();
      await apiComfyValidateInput().serve(req, res);

      expect(res._state().status).toBe(405);
      expect(res._state().headers.Allow).toBe("POST");
    });

    it("treats a request with no method as GET and answers 405", async () => {
      const req = { ...mockReq(VALIDATE_INPUT_ROUTE), method: undefined };
      const res = mockRes();

      await apiComfyValidateInput().serve(req, res);

      expect(res._state().status).toBe(405);
      expect(res._state().headers.Allow).toBe("POST");
    });
  });
});
