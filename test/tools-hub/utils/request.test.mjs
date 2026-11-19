import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

/*
 * Mirrors tools-hub/utils/request.mjs.
 *
 * The change under test is the decode step: chunks are collected as Buffers and
 * decoded once at `end` with `Buffer.concat(chunks).toString("utf8")`, where the
 * old code did `body += chunk.toString()` for every chunk. A socket cuts a body
 * wherever it likes, so the old code answered U+FFFD for any character the cut
 * landed inside — which is what tools-hub/api/comfy/validate-input.mjs's header
 * says is visible to any caller that reads the body back. Every test that
 * depends on a boundary also says what the per-chunk decode would have answered
 * for the very chunks it is given (`naiveDecode`), so a regression cannot slip
 * through because this file happened to send ASCII.
 *
 * `mockReq` delivers one whole body the moment a listener registers, so it
 * cannot place a chunk boundary, fire an `error` event, or install a destroy spy
 * before the bytes arrive; the driven `mockChunkedReq` from
 * test/support/mock-response.mjs carries those, and one test uses a real
 * `node:stream` Readable so the driven stand-in is checked against a genuine
 * stream. Nothing here touches a socket, a database or the filesystem.
 */
import {
  mockChunkedReq,
  mockReq,
  oneByteChunks,
} from "../../support/mock-response.mjs";
import { VALIDATE_INPUT_ROUTE } from "../api/comfy/fixtures.mjs";
import { MAX_BODY_SIZE } from "../../../tools-hub/utils/constants.mjs";
import { parseBody } from "../../../tools-hub/utils/request.mjs";

const REPLACEMENT = "\u{FFFD}";

/** The decode the old code ran: one `chunk.toString()` per chunk, glued back on. */
function naiveDecode(chunks) {
  return chunks.map((chunk) => chunk.toString("utf8")).join("");
}

/**
 * Starts `parseBody(req)` and then drives the request through the chunks it was
 * given, so the promise is settled by the caller's own events. `destroy` is
 * spied before the first byte arrives, which `mockReq` cannot do.
 */
function readBody(chunks) {
  const req = mockChunkedReq(VALIDATE_INPUT_ROUTE, "POST", chunks);
  const destroyed = vi.spyOn(req, "destroy");
  const promise = parseBody(req);

  req.send();
  req.finish();
  return { promise, req, destroyed };
}

const GLYPHS = ["é", "悪", "夢", "💖"];
const MULTIBYTE_YAML = `- prompts:
    - prompt:
        - 悪夢 💖 masterpiece`;

describe("parseBody", () => {
  it("resolves the whole body from a single chunk", async () => {
    expect(
      await parseBody(
        mockReq(VALIDATE_INPUT_ROUTE, "POST", "glossy, warm colors"),
      ),
    ).toBe("glossy, warm colors");
    expect(await parseBody(mockReq(VALIDATE_INPUT_ROUTE, "POST", "é"))).toBe(
      "é",
    );
  });

  it("resolves an empty string when the request sends no bytes at all", async () => {
    expect(await parseBody(mockReq(VALIDATE_INPUT_ROUTE, "POST"))).toBe("");
    expect(await readBody([]).promise).toBe("");
  });

  it("decodes a multi-byte character split across a chunk boundary instead of replacing it", async () => {
    for (const glyph of GLYPHS) {
      const bytes = Buffer.from(glyph, "utf8");
      expect(bytes.length).toBeGreaterThan(1);

      for (let cut = 1; cut < bytes.length; cut += 1) {
        const chunks = [bytes.subarray(0, cut), bytes.subarray(cut)];
        // Pinned premise: this cut really is inside the character, so the
        // per-chunk decode the old code used answers replacement characters
        // here. Without that, the assertion below would prove nothing.
        expect(naiveDecode(chunks)).toContain(REPLACEMENT);
        expect(await readBody(chunks).promise).toBe(glyph);
      }
    }
  });

  it("reassembles a YAML body a socket cut into one-byte chunks", async () => {
    const chunks = oneByteChunks(MULTIBYTE_YAML);
    const bytes = Buffer.from(MULTIBYTE_YAML, "utf8");

    // The premise that makes this bite: the byte count is larger than the
    // character count, so a cut between every byte lands inside `悪`, `夢` and
    // `💖` rather than between two characters.
    expect(bytes.length).toBeGreaterThan(Array.from(MULTIBYTE_YAML).length);
    expect(chunks.length).toBe(bytes.length);
    expect(naiveDecode(chunks)).toContain(REPLACEMENT);

    const body = await readBody(chunks).promise;
    expect(body).toBe(MULTIBYTE_YAML);
    expect(body).not.toContain(REPLACEMENT);
  });

  it("counts bytes against the cap, not characters", async () => {
    // CJK prompts encode as three bytes each, so this body is well under the cap
    // by character count and over it by byte count: a `.length` check would have
    // let it through.
    const text = "悪".repeat(Math.ceil(MAX_BODY_SIZE / 3));
    expect(text.length).toBeLessThan(MAX_BODY_SIZE);
    expect(Buffer.byteLength(text)).toBeGreaterThan(MAX_BODY_SIZE);

    await expect(readBody([Buffer.from(text, "utf8")]).promise).rejects.toThrow(
      "Request body too large",
    );
  });

  it("accepts a body of exactly MAX_BODY_SIZE bytes and rejects one more", async () => {
    const atTheCap = Buffer.alloc(MAX_BODY_SIZE, 0x61);
    const over = Buffer.alloc(MAX_BODY_SIZE + 1, 0x61);

    expect((await readBody([atTheCap]).promise).length).toBe(MAX_BODY_SIZE);

    const { promise, destroyed } = readBody([over]);
    await expect(promise).rejects.toThrow("Request body too large");
    expect(destroyed).toHaveBeenCalledTimes(1);
  });

  it("rejects once the chunks together pass the cap, and destroys the request", async () => {
    const half = MAX_BODY_SIZE / 2;
    const { promise, destroyed } = readBody([
      Buffer.alloc(half, 0x61),
      Buffer.alloc(half, 0x62),
      Buffer.from("a"),
    ]);

    // The first two chunks together are exactly the cap, which is allowed; the
    // third is what tips it over, so the cap is measured across chunks.
    await expect(promise).rejects.toThrow("Request body too large");
    expect(destroyed).toHaveBeenCalledTimes(1);
  });

  it("forwards an error event straight to the caller", async () => {
    const req = mockChunkedReq(VALIDATE_INPUT_ROUTE, "POST");
    const failure = new Error("socket reset");
    const promise = parseBody(req);

    req.fail(failure);
    await expect(promise).rejects.toBe(failure);
  });

  it("rejects when the request fails after data arrived, instead of resolving what it collected", async () => {
    const req = mockChunkedReq(VALIDATE_INPUT_ROUTE, "POST");
    const promise = parseBody(req);

    req.send([Buffer.from(MULTIBYTE_YAML, "utf8").subarray(0, 20)]);
    req.fail(new Error("aborted"));
    await expect(promise).rejects.toThrow("aborted");
  });

  it("reads the split glyph correctly from a real stream too", async () => {
    const emoji = Buffer.from("💖", "utf8");
    const stream = Readable.from([emoji.subarray(0, 1), emoji.subarray(1)]);

    // The driven mock is the workhorse here, so one test has to prove it is
    // faithful: the same boundary delivered by node:stream answers the glyph.
    expect(naiveDecode([emoji.subarray(0, 1), emoji.subarray(1)])).toContain(
      REPLACEMENT,
    );
    expect(await parseBody(stream)).toBe("💖");
  });

  it("destroys the stream it is reading when the body is over the cap", async () => {
    const stream = Readable.from([Buffer.alloc(MAX_BODY_SIZE + 1, 0x61)]);

    await expect(parseBody(stream)).rejects.toThrow("Request body too large");
    expect(stream.destroyed).toBe(true);
  });
});
