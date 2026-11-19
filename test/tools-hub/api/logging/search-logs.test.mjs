import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * Mirrors tools-hub/api/logging/search-logs.mjs.
 *
 * Placement note: the sibling route test for
 * tools-hub/api/logging/find-log.mjs sits one level up
 * (test/tools-hub/api/find-log.test.mjs) by a pre-existing deviation. This
 * file keeps the true mirror path, which is also where the validator's test
 * lives.
 *
 * Isolation: `mongodb` is the shared mock from test/support/mock-mongodb.mjs,
 * so tools-hub/utils/db.mjs runs against a fake client and no test can reach a
 * real database. `searchLogs` and `buildQuery` are NOT stubbed: the mock driver
 * gained a `find()` cursor (additive, see test/support/mock-mongodb.mjs), so
 * body → filters → query → cursor is the real chain and only the driver is
 * fake. The documents a query answers are armed through `mongoMock.documents`,
 * read when the driver is called, exactly like its existing failure switches.
 * The `image-logs` collection is the memoised one the shared client hands out,
 * which is what makes the "uses the server's connection" assertions real.
 *
 * `mockRes()` records the headers `writeHead` was given, so the 405's `Allow`
 * is asserted through `res._state().headers` — no `setHeader` was needed — and
 * one test at the end of the file leaves the stand-ins behind and dispatches
 * the real `tools-hub/server.mjs` handler over a loopback socket, the pattern
 * `test/tools-hub/static/distbrowser.test.mjs` uses. Only the API path is
 * requested there, so no static route reads repository files, and the mocked
 * driver still answers it: no test in this file can reach a database.
 */
import {
  mockMongoDriver,
  mongoClients,
  mongoMock,
  resetMongoMock,
} from "../../../support/mock-mongodb.mjs";
import { mockReq, mockRes } from "../../../support/mock-response.mjs";

vi.mock("mongodb", () => mockMongoDriver());

import {
  SEARCH_FILTER_KEYS,
  buildQuery,
} from "../../../../logging/mongodb/search-logs.mjs";
import apiLoggingSearchLogs, {
  serverSearchLogs,
} from "../../../../tools-hub/api/logging/search-logs.mjs";
import { createServerInstance } from "../../../../tools-hub/server.mjs";
import { closeDb, openDb } from "../../../../tools-hub/utils/index.mjs";

const ROUTE = "/api/logging/search-logs";
const MONGODB_URI = "mongodb://mock-host:27017";
const NOT_CONNECTED_MESSAGE =
  "MongoDB is not connected: the server could not open a connection at startup.";
/** The keys the 400 text must offer, taken from the query layer itself. */
const ALLOWED_FILTERS_TEXT = [...SEARCH_FILTER_KEYS].join(", ");

/** Two documents in the flat shape logging/mongodb/upload-log.mjs writes. */
const DOCUMENTS = [
  {
    _id: "64f1a1b2c3d4e5f60708090a",
    filename: "rover-euler_20261101141233",
    "base-workflow": "unholy",
    "filename-prefix": "rover-euler",
    "output-folder": "sampler3",
    sampler: "euler",
    scheduler: "normal",
    model: "unet.safetensors",
    prompt: "unholy-aesthetic, masterpiece",
    "negative-prompt": "bad quality",
    loras: [{ name: "XL-FRover(WuWa).safetensors", strength: 1.2 }],
    steps: 20,
  },
  {
    _id: "64f1a1b2c3d4e5f60708090b",
    filename: "viking-lcm_20261101150000",
    "base-workflow": "anime",
    "filename-prefix": "viking-lcm",
    "output-folder": "sampler1",
    sampler: "lcm",
    scheduler: "kl_optimal",
    model: "anime-model.safetensors",
    prompt: "anime-style, vibrant colors",
    "negative-prompt": "realistic, photo",
    loras: [{ name: "anime-lora.safetensors", strength: 0.8 }],
    steps: 30,
  },
];

/**
 * A deep copy taken before any request runs, so the oracle cannot move with the
 * response. If `searchLogs` stopped cloning and just deleted `_id` on the
 * driver's own documents, an oracle read from `DOCUMENTS` afterwards would have
 * lost `_id` alongside the response and the "entries are copies" assertions
 * would pass for the wrong reason.
 */
const UNTOUCHED_DOCUMENTS = structuredClone(DOCUMENTS);

/** What the endpoint must answer for the first `count` documents: `_id` gone. */
function expectedEntries(count) {
  return UNTOUCHED_DOCUMENTS.slice(0, count).map((doc) => {
    const entry = { ...doc };
    delete entry._id;
    return entry;
  });
}

/** Opens the shared connection the way the server does at startup. */
async function connectSharedDb() {
  vi.stubEnv("MONGODB_URI", MONGODB_URI);
  return openDb();
}

/** The `image-logs` collection the shared client hands out, memoised per name. */
function collectionNamed(client, database = "gen-ai", name = "image-logs") {
  return client.db(database).collection(name);
}

/** POSTs `payload` (undefined sends no body, a string sends raw text) and reports the response. */
async function post(payload) {
  const res = mockRes();

  await apiLoggingSearchLogs().serve(mockReq(ROUTE, "POST", payload), res);
  return res._state();
}

afterEach(async () => {
  resetMongoMock();
  const silenced = vi.spyOn(console, "log").mockImplementation(() => {});
  await closeDb();
  silenced.mockRestore();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("apiLoggingSearchLogs", () => {
  it("returns a route object with testUrl and serve", () => {
    const route = apiLoggingSearchLogs();

    expect(typeof route.testUrl).toBe("function");
    expect(typeof route.serve).toBe("function");
  });

  describe("testUrl", () => {
    it("matches /api/logging/search-logs exactly", () => {
      expect(apiLoggingSearchLogs().testUrl(ROUTE)).toBe(true);
    });

    it("matches /api/logging/search-logs/ with a trailing slash", () => {
      expect(apiLoggingSearchLogs().testUrl(`${ROUTE}/`)).toBe(true);
    });

    it("matches /api/logging/search-logs/anything as a sub-path", () => {
      expect(apiLoggingSearchLogs().testUrl(`${ROUTE}/limit=5`)).toBe(true);
    });

    it("matches /api/logging/search-logs?limit=5, query string and all", () => {
      expect(apiLoggingSearchLogs().testUrl(`${ROUTE}?limit=5`)).toBe(true);
      expect(apiLoggingSearchLogs().testUrl(`${ROUTE}/?limit=5`)).toBe(true);
    });

    it("does not match a near-miss path or another endpoint", () => {
      const route = apiLoggingSearchLogs();

      for (const url of [
        "/api/logging/search-logsx",
        "/api/logging/search-logs-search",
        "/api/logging/searchlog",
        "/api/logging/search",
        "/api/logging/find-log",
        "/api/logging/",
        "/api/search-logs",
        "/api/dist-browser/fs",
        "",
      ]) {
        expect(route.testUrl(url)).toBe(false);
      }
    });
  });

  describe("method gate", () => {
    it("answers 405 with Allow: POST for every method but POST", async () => {
      const route = apiLoggingSearchLogs();

      for (const method of ["GET", "PUT", "DELETE", "HEAD", "OPTIONS"]) {
        const res = mockRes();
        await route.serve(mockReq(ROUTE, method), res);

        const state = res._state();
        expect(state.status).toBe(405);
        expect(state.headers.Allow).toBe("POST");
        expect(state.body).toEqual({ error: "Method Not Allowed" });
      }
    });

    it("treats a request with no method as GET and answers 405", async () => {
      const res = mockRes();
      const req = { ...mockReq(ROUTE), method: undefined };

      await apiLoggingSearchLogs().serve(req, res);
      expect(res._state().status).toBe(405);
    });

    it("answers 405 before it looks at the body", async () => {
      await connectSharedDb();
      mongoMock.documents = DOCUMENTS;
      const res = mockRes();

      await apiLoggingSearchLogs().serve(
        mockReq(ROUTE, "GET", "{ bad json"),
        res,
      );

      expect(res._state().status).toBe(405);
      expect(res._state().headers.Allow).toBe("POST");
      expect(mongoMock.findQueries).toEqual([]);
    });
  });

  describe("POST /api/logging/search-logs", () => {
    it("answers the matching entries as a bare JSON array with _id removed", async () => {
      const client = await connectSharedDb();
      mongoMock.documents = DOCUMENTS;

      const state = await post({ model: "unet" });

      expect(state.status).toBe(200);
      expect(Array.isArray(state.body)).toBe(true);
      expect(state.body).toEqual(expectedEntries(DOCUMENTS.length));
      expect(state.body[0]).not.toHaveProperty("_id");
      // The entries are copies, so the caller can mutate them safely.
      expect(state.body[0]).not.toBe(DOCUMENTS[0]);

      expect(mongoMock.findQueries).toEqual([buildQuery({ model: "unet" })]);
      expect(client.close).not.toHaveBeenCalled();
    });

    it("counts Content-Length in bytes when the answer has multi-byte characters", async () => {
      await connectSharedDb();
      const multibyteDocument = {
        _id: "64f1a1b2c3d4e5f60708090c",
        prompt: "悪夢, 💖 unholy",
      };
      mongoMock.documents = [multibyteDocument];

      const state = await post({ prompt: "悪夢" });
      const entries = [{ prompt: multibyteDocument.prompt }];
      const json = JSON.stringify(entries);

      // sendJSON has to count bytes, not characters: this prompt has more
      // bytes than characters, so a `"Content-Length": json.length` would
      // under-report and truncate the answer for a client that reads that many
      // bytes. The header object is pinned here because the generic version of
      // this contract lives in test/tools-hub/api/dist-browser.test.mjs, where
      // every payload is ASCII and the two counts are indistinguishable.
      expect(Buffer.byteLength(json)).not.toBe(json.length);
      expect(state.status).toBe(200);
      expect(state.body).toEqual(entries);
      expect(state.headers).toEqual({
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(json),
      });
    });

    it("queries the image-logs collection of gen-ai the server opened, never a new connection", async () => {
      const client = await connectSharedDb();
      mongoMock.documents = DOCUMENTS;

      expect((await post({ prompt: "bad" })).status).toBe(200);

      const collection = collectionNamed(client);
      expect(collection.dbName).toBe("gen-ai");
      expect(collection.collectionName).toBe("image-logs");
      // Exactly the one connection the server opened, still open afterwards.
      expect(mongoClients()).toHaveLength(1);
      expect(client.close).not.toHaveBeenCalled();
    });

    it("searches everything with no limit when no body is sent", async () => {
      await connectSharedDb();
      mongoMock.documents = DOCUMENTS;

      const state = await post(undefined);

      expect(state.status).toBe(200);
      expect(state.body).toEqual(expectedEntries(DOCUMENTS.length));
      expect(mongoMock.findQueries).toEqual([{}]);
      // "No limit" reaches the driver as 0, which the driver reads as unbounded.
      expect(mongoMock.findLimits).toEqual([0]);
    });

    it("treats a null body, an empty object and blank filters like no body", async () => {
      await connectSharedDb();
      mongoMock.documents = DOCUMENTS;

      for (const payload of [null, {}, { workflow: "", prompt: [" "] }]) {
        const state = await post(payload);

        expect(state.status).toBe(200);
        expect(state.body).toEqual(expectedEntries(DOCUMENTS.length));
      }

      expect(mongoMock.findQueries).toEqual([{}, {}, {}]);
      expect(mongoMock.findLimits).toEqual([0, 0, 0]);
    });

    it("hands the driver the query the logging layer builds for the same filters", async () => {
      await connectSharedDb();
      mongoMock.documents = DOCUMENTS;

      const filters = {
        workflow: "unholy",
        prefix: "rove",
        outputFolder: "sampler",
        lora: ["FRover", "XL"],
        prompt: "bad",
        sampler: "eul",
        scheduler: "normal",
        model: "unet",
      };

      expect((await post(filters)).status).toBe(200);
      expect(mongoMock.findQueries).toEqual([buildQuery(filters)]);
    });

    it("trims filter values and drops blank ones before the query is built", async () => {
      await connectSharedDb();
      mongoMock.documents = DOCUMENTS;

      const state = await post({
        prompt: "  bad  ",
        sampler: [" ", "eul"],
        model: null,
        limit: 2,
      });

      expect(state.status).toBe(200);
      expect(mongoMock.findQueries).toEqual([
        buildQuery({ prompt: "bad", sampler: ["eul"] }),
      ]);
      expect(mongoMock.findLimits).toEqual([2]);
    });

    it("caps the answer at the limit it was given", async () => {
      await connectSharedDb();
      mongoMock.documents = DOCUMENTS;

      const state = await post({ limit: 1 });

      expect(state.status).toBe(200);
      expect(state.body).toEqual(expectedEntries(1));
      expect(mongoMock.findLimits).toEqual([1]);
      expect(mongoMock.findQueries).toEqual([{}]);
    });

    it("answers an empty result set as an empty array", async () => {
      await connectSharedDb();
      mongoMock.documents = [];

      const state = await post({ prompt: "nothing here" });

      expect(state.status).toBe(200);
      expect(state.body).toEqual([]);
    });
  });

  describe("400s", () => {
    it("refuses an unknown filter with a message that names it and lists the allowed keys", async () => {
      await connectSharedDb();
      mongoMock.documents = DOCUMENTS;

      const state = await post({ filename: "rover" });

      expect(state.status).toBe(400);
      expect(state.body).toEqual({
        error: `Unknown filter: filename. Allowed filters: ${ALLOWED_FILTERS_TEXT}`,
      });
      expect(mongoMock.findQueries).toEqual([]);
    });

    it("refuses a filter value that is not a string", async () => {
      await connectSharedDb();
      mongoMock.documents = DOCUMENTS;

      const state = await post({ prompt: ["bad", 7] });

      expect(state.status).toBe(400);
      expect(state.body).toEqual({
        error: "Filter 'prompt' must be a string or an array of strings",
      });
      expect(mongoMock.findQueries).toEqual([]);
    });

    it("refuses a limit that is not a positive integer", async () => {
      await connectSharedDb();
      mongoMock.documents = DOCUMENTS;

      for (const limit of [0, "3", -1, 2.5, true]) {
        const state = await post({ limit });

        expect(state.status).toBe(400);
        expect(state.body).toEqual({
          error: "limit must be a positive integer",
        });
      }
      expect(mongoMock.findQueries).toEqual([]);
    });

    it("refuses a body that is not JSON", async () => {
      await connectSharedDb();
      mongoMock.documents = DOCUMENTS;

      const state = await post('{ "workflow": "unholy"');

      expect(state.status).toBe(400);
      expect(state.body).toEqual({ error: "Invalid JSON body" });
      expect(mongoMock.findQueries).toEqual([]);
    });

    it("refuses a JSON scalar or array body", async () => {
      await connectSharedDb();
      mongoMock.documents = DOCUMENTS;

      for (const payload of ['"unholy"', [{ workflow: "unholy" }]]) {
        const state = await post(payload);

        expect(state.status).toBe(400);
        expect(state.body).toEqual({
          error: "Request body must be a JSON object",
        });
      }
      expect(mongoMock.findQueries).toEqual([]);
    });

    it("serve() maps an over-cap body onto a 400 message; the mock cannot show it reaching a client", async () => {
      await connectSharedDb();
      mongoMock.documents = DOCUMENTS;

      // What this harness proves and what it cannot. tools-hub/utils/request.mjs
      // caps bodies at MAX_BODY_SIZE and destroys the request in the same tick
      // it rejects, so the 400 and its text are the route's mapping only:
      // `mockReq`'s destroy() is a no-op, which is the sole reason a response
      // gets written here at all. On a real socket the destroy lands first —
      // .tmp/probe-oversize-delivery-20261119T114335Z.mjs reports ECONNRESET
      // at 1 MB + 1 byte and EPIPE at 3 MB with no response body — so nothing
      // in this suite shows the message arriving at a client, and 400 versus a
      // more fitting 413 is a production decision. Both are escalated as E1/M1
      // in .tmp/20261119T114926Z-deliver-test-review-search-logs.md.
      const req = mockReq(ROUTE, "POST", {
        prompt: "x".repeat(1024 * 1024 + 1),
      });
      const destroyed = vi.spyOn(req, "destroy");
      const res = mockRes();

      await apiLoggingSearchLogs().serve(req, res);
      const state = res._state();

      expect(state.status).toBe(400);
      expect(state.body).toEqual({
        error: "Invalid request body: Request body too large",
      });
      expect(mongoMock.findQueries).toEqual([]);
      // The destroy is the half of the failure this harness can show, and it is
      // what makes delivery unproven, so it is pinned in the test rather than
      // only in the comment above.
      expect(destroyed).toHaveBeenCalledTimes(1);
    });
  });

  describe("database failures", () => {
    it("answers 503 when the server never opened a connection", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const state = await post({ workflow: "unholy" });

      expect(state.status).toBe(503);
      expect(state.body).toEqual({ error: NOT_CONNECTED_MESSAGE });
      expect(errorSpy).toHaveBeenCalledWith(
        `Error searching logs: ${NOT_CONNECTED_MESSAGE}`,
      );
      // No connection was opened to answer the request, and no query ran.
      expect(mongoClients()).toHaveLength(0);
      expect(mongoMock.findQueries).toEqual([]);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      errorSpy.mockRestore();
    });

    it("answers 500 with the driver message when the query fails", async () => {
      const client = await connectSharedDb();
      mongoMock.findFailure = new Error("query failed");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const state = await post({ workflow: "unholy" });

      expect(state.status).toBe(500);
      expect(state.body).toEqual({ error: "query failed" });
      expect(errorSpy).toHaveBeenCalledWith(
        "Error searching logs: query failed",
      );
      // A failing route must not tear down the connection the server owns.
      expect(client.close).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("answers 500 when reading the matched documents fails", async () => {
      const client = await connectSharedDb();
      mongoMock.documents = DOCUMENTS;
      collectionNamed(client).find = vi.fn(() => ({
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn(async () => {
          throw new Error("network unreachable");
        }),
      }));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const state = await post({ workflow: "unholy" });

      expect(state.status).toBe(500);
      expect(state.body).toEqual({ error: "network unreachable" });
      expect(client.close).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe("serverSearchLogs", () => {
    it("searches the collection the server opened, through the shared connection", async () => {
      const client = await connectSharedDb();
      mongoMock.documents = DOCUMENTS;

      const entries = await serverSearchLogs({ sampler: "eul" }, null);

      expect(entries).toEqual(expectedEntries(DOCUMENTS.length));
      expect(mongoMock.findQueries).toEqual([buildQuery({ sampler: "eul" })]);
      expect(collectionNamed(client).dbName).toBe("gen-ai");
      expect(client.close).not.toHaveBeenCalled();
    });

    it("forwards the limit to the cursor", async () => {
      await connectSharedDb();
      mongoMock.documents = DOCUMENTS;

      expect(await serverSearchLogs({}, 1)).toEqual(expectedEntries(1));
      expect(mongoMock.findLimits).toEqual([1]);
    });

    it("throws DbUnavailableError without touching the driver when no connection is open", async () => {
      await expect(serverSearchLogs({}, null)).rejects.toThrow(
        NOT_CONNECTED_MESSAGE,
      );
      expect(mongoClients()).toHaveLength(0);
      expect(mongoMock.findQueries).toEqual([]);
    });

    it("rethrows a query failure unchanged", async () => {
      const client = await connectSharedDb();
      mongoMock.findFailure = new Error("db down");

      await expect(serverSearchLogs({ model: "unet" }, null)).rejects.toThrow(
        "db down",
      );
      expect(client.close).not.toHaveBeenCalled();
    });
  });
});

/*
 * Everything above drives the route through the mockReq/mockRes stand-ins. This
 * last block dispatches the real tools-hub/server.mjs handler over a loopback
 * socket — the pattern test/tools-hub/static/distbrowser.test.mjs uses — so the
 * headers a real client reads come from a real response. Only the API path is
 * requested, so no static route touches the filesystem, and `mongodb` stays
 * mocked: the connection the route answers from is the fake one.
 */
describe("POST /api/logging/search-logs over a real socket", () => {
  /** One real request against the running server, answered as parsed JSON. */
  function request(port, method, payload) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: ROUTE, method },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            resolve({
              status: res.statusCode,
              contentType: res.headers["content-type"],
              allow: res.headers.allow,
              json: JSON.parse(raw),
            });
          });
        },
      );

      req.on("error", reject);
      if (payload !== undefined) req.write(JSON.stringify(payload));
      req.end();
    });
  }

  it("answers 200 application/json with the entries, and 405 with Allow: POST", async () => {
    await connectSharedDb();
    mongoMock.documents = DOCUMENTS;

    const server = createServerInstance();
    await new Promise((resolve) => server.listen(0, resolve));

    try {
      const port = server.address().port;

      const found = await request(port, "POST", { model: "unet" });
      expect(found.status).toBe(200);
      expect(found.contentType).toBe("application/json");
      expect(found.json).toEqual(expectedEntries(DOCUMENTS.length));

      const wrongMethod = await request(port, "GET");
      expect(wrongMethod.status).toBe(405);
      expect(wrongMethod.allow).toBe("POST");
      expect(wrongMethod.json).toEqual({ error: "Method Not Allowed" });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
