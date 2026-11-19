import { vi } from "vitest";

/**
 * Shared mongodb driver mock for the tools-hub tests.
 *
 * Every tools-hub test that touches `tools-hub/utils/db.mjs` uses this mock so
 * the driver is modelled the same way everywhere: a client exposes
 * `connect`/`close`/`db`, `db()` is memoised and exposes `admin().ping()` and
 * `collection()`, and every client created is tracked in creation order.
 *
 * A collection answers `findOne()` with null and `find()` with a cursor that
 * hands back `mongoMock.documents`, truncating at the limit the cursor was
 * given. It is a stub, not a query engine: the query it is called with is
 * recorded so a test can assert what the real query layer sent the driver.
 *
 * The failure switches are read when the mock method is *called* (never when
 * the mock factory runs), so a test can arm a failure after the module has
 * been mocked. Driver side effects are recorded in call order so lifecycle
 * ordering ("connect -> ping -> close") can be asserted.
 */
const state = {
  connectFailure: null,
  pingFailure: null,
  closeFailure: null,
  /** Documents every `find()` answers with; armed inside a test, read on call. */
  documents: null,
  /** Error every `find()` throws instead of answering, read on call. */
  findFailure: null,
  /** Queries `find()` was called with, and the limits its cursors got, in order. */
  findQueries: [],
  findLimits: [],
  events: [],
  clients: [],
};

function recordEvent(event) {
  state.events.push(event);
}

/** A driver-shaped cursor: `limit()` caps what `toArray()` hands back. */
function mockCursor() {
  let limit = 0;
  const cursor = {
    limit: vi.fn((n) => {
      limit = n;
      state.findLimits.push(n);
      return cursor;
    }),
    toArray: vi.fn(async () => {
      const documents = state.documents ?? [];
      return limit > 0 ? documents.slice(0, limit) : [...documents];
    }),
  };

  return cursor;
}

function mockCollection(databaseName, name) {
  return {
    dbName: databaseName,
    collectionName: name,
    findOne: vi.fn(async () => null),
    find: vi.fn((query) => {
      state.findQueries.push(query);
      if (state.findFailure) throw state.findFailure;
      return mockCursor();
    }),
  };
}

function mockDatabase(databaseName) {
  const admin = {
    ping: vi.fn(async () => {
      recordEvent("db-ping");
      if (state.pingFailure) throw state.pingFailure;
      return { ok: 1 };
    }),
  };
  const collections = new Map();

  return {
    databaseName,
    admin: () => admin,
    collection: vi.fn((name) => {
      const key = String(name);
      if (!collections.has(key)) {
        collections.set(key, mockCollection(databaseName, name));
      }
      return collections.get(key);
    }),
  };
}

function mockClient(uri, options) {
  const databases = new Map();

  const client = {
    uri,
    options,
    connect: vi.fn(async () => {
      recordEvent("db-connect");
      if (state.connectFailure) throw state.connectFailure;
    }),
    close: vi.fn(async () => {
      recordEvent("db-close");
      if (state.closeFailure) throw state.closeFailure;
    }),
    db: vi.fn((name = "<default-db>") => {
      if (!databases.has(name)) databases.set(name, mockDatabase(name));
      return databases.get(name);
    }),
  };

  state.clients.push(client);
  return client;
}

/** Mock module factory for `vi.mock("mongodb", ...)`. */
export function mockMongoDriver() {
  return { MongoClient: vi.fn(mockClient) };
}

/** Failure switches and the documents `find()` answers with: arm them inside a
 *  test, they are read at call time. Also holds the recorded find calls. */
export const mongoMock = state;

/** Every mock client the driver created, in creation order. */
export function mongoClients() {
  return state.clients;
}

/** Driver side effects recorded in call order. */
export function mongoEvents() {
  return state.events;
}

/** Route driver events into a test's own sequence array. */
export function recordEventsInto(events) {
  state.events = events;
}

/** Clear the failure switches, the documents, the recorded find calls, the clients and the events. */
export function resetMongoMock() {
  state.connectFailure = null;
  state.pingFailure = null;
  state.closeFailure = null;
  state.findFailure = null;
  state.documents = null;
  state.findQueries.length = 0;
  state.findLimits.length = 0;
  state.clients.length = 0;
  state.events.length = 0;
}
