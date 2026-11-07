import { vi } from "vitest";

/**
 * Shared mongodb driver mock for the tools-hub tests.
 *
 * Every tools-hub test that touches `tools-hub/utils/db.mjs` uses this mock so
 * the driver is modelled the same way everywhere: a client exposes
 * `connect`/`close`/`db`, `db()` is memoised and exposes `admin().ping()` and
 * `collection()`, and every client created is tracked in creation order.
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
  events: [],
  clients: [],
};

function recordEvent(event) {
  state.events.push(event);
}

function mockCollection(databaseName, name) {
  return {
    dbName: databaseName,
    collectionName: name,
    findOne: vi.fn(async () => null),
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

/** Failure switches: arm them inside a test, they are read at call time. */
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

/** Clear the failure switches, the clients and the recorded events. */
export function resetMongoMock() {
  state.connectFailure = null;
  state.pingFailure = null;
  state.closeFailure = null;
  state.clients.length = 0;
  state.events.length = 0;
}
