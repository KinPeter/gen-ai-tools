/**
 * Shared stand-ins for Node's ServerResponse / IncomingMessage used by the
 * tools-hub route tests.
 *
 * The response records every byte written to it, including bytes delivered
 * through `stream.pipe(res)`, so handlers that stream a file can be asserted
 * on the body they actually delivered rather than only on the status line.
 */

function toBuffer(chunk) {
  return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
}

export function mockRes() {
  const chunks = [];
  const state = { status: null, headers: null, body: null };
  let resolveEnd;
  const endPromise = new Promise((resolve) => {
    resolveEnd = resolve;
  });

  function flush() {
    const raw = Buffer.concat(chunks.map(toBuffer));
    if (raw.length === 0) {
      state.body = null;
      return;
    }

    try {
      state.body = JSON.parse(raw.toString("utf8"));
    } catch {
      state.body = raw;
    }
  }

  return {
    get headersSent() {
      return state.status !== null;
    },
    writeHead(status, headers) {
      state.status = status;
      state.headers = headers;
    },
    write(chunk) {
      chunks.push(chunk);
      return true;
    },
    end(chunk) {
      if (chunk !== undefined && chunk !== null) chunks.push(chunk);
      flush();
      resolveEnd();
    },
    /**
     * Resolves once the response has been ended. Streamed responses (files
     * piped into the response) finish asynchronously, so body assertions must
     * wait for this.
     */
    waitForEnd: () => endPromise,
    on() {
      return this;
    },
    once() {
      return this;
    },
    emit() {
      return this;
    },
    removeListener() {
      return this;
    },
    destroy() {},
    /** Raw bytes the handler wrote or streamed, in order. */
    bodyBytes: () => Buffer.concat(chunks.map(toBuffer)),
    _state: () => state,
  };
}

/** The bytes `mockReq` sends for a body: objects are JSON, strings are verbatim. */
function requestBody(body) {
  if (body === undefined) return undefined;
  return typeof body === "string" ? body : JSON.stringify(body);
}

/**
 * `text` as UTF-8 bytes cut into chunks of one byte each, the harshest set of
 * boundaries `mockChunkedReq` can deliver and the one `parseBody` is tested
 * against: a socket cuts a body wherever it likes, so a multi-byte character
 * can be split across chunks. The byte count is larger than the character
 * count whenever the text has a non-ASCII character in it, which is what makes
 * the cut land inside a character rather than between two.
 */
export function oneByteChunks(text) {
  return Array.from(Buffer.from(text, "utf8")).map((byte) =>
    Buffer.from([byte]),
  );
}

/**
 * A stand-in IncomingMessage whose `data`, `end` and `error` events the test
 * drives by hand. `mockReq` delivers one whole body the moment a listener
 * registers, so it cannot put a chunk boundary in the middle of a multi-byte
 * character, fire an `error` event, or let a spy on `destroy()` be installed
 * before the bytes arrive — all three are things `parseBody` is tested against.
 * `send` emits one `data` event per chunk, `finish` emits `end` (where
 * `parseBody` decodes) and `fail` emits `error`. `parseBody` registers its
 * listeners synchronously, so a caller starts the read with
 * `const promise = parseBody(req)` and drives the events afterwards.
 */
export function mockChunkedReq(
  url,
  method = "POST",
  chunks = [],
  host = "localhost:4218",
) {
  const listeners = {};

  return {
    url,
    method,
    headers: { host },
    destroy() {},
    on(event, cb) {
      listeners[event] = cb;
    },
    /** One `data` event per chunk, in order. Strings become UTF-8 bytes. */
    send(toSend = chunks) {
      for (const chunk of toSend) listeners.data(Buffer.from(chunk));
    },
    finish() {
      listeners.end();
    },
    fail(err) {
      listeners.error(err);
    },
  };
}

/**
 * Minimal IncomingMessage. An object `body` is sent as JSON, which is what the
 * POST handlers read through `parseBody`; a string body is sent verbatim, so a
 * handler can be fed malformed JSON or text a JSON round trip cannot express.
 * `host` is the Host header, used by routes that rebuild the request URL with
 * `new URL()`.
 */
export function mockReq(url, method = "GET", body, host = "localhost:4218") {
  const raw = requestBody(body);

  return {
    url,
    method,
    headers: { host },
    /** A real IncomingMessage can be destroyed mid-read; parseBody does. */
    destroy() {},
    on(event, cb) {
      if (event === "data" && raw !== undefined) cb(Buffer.from(raw));
      if (event === "end") cb();
    },
  };
}
