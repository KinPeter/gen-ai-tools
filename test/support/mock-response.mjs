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

/**
 * Minimal IncomingMessage. When `body` is given it is sent as JSON chunks,
 * which is what the POST handlers read through `parseBody`. `host` is the
 * Host header, used by routes that rebuild the request URL with `new URL()`.
 */
export function mockReq(url, method = "GET", body, host = "localhost:4218") {
  const raw = body === undefined ? undefined : JSON.stringify(body);

  return {
    url,
    method,
    headers: { host },
    on(event, cb) {
      if (event === "data" && raw !== undefined) cb(Buffer.from(raw));
      if (event === "end") cb();
    },
  };
}
