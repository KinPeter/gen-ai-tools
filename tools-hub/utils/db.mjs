import { MongoClient } from "mongodb";

/**
 * Shared MongoDB connection for the tools-hub server.
 *
 * `openDb()` is called once at server start and `closeDb()` once at shutdown.
 * API handlers import a collection getter directly, so no connection is passed
 * through the routing layer and handlers never close the shared client.
 */

const MONGO_DB_NAME = "gen-ai";
const IMAGE_LOGS_COLLECTION = "image-logs";
const MONGO_API_VERSION = "1";
const MAX_POOL_SIZE = 10;
const MIN_POOL_SIZE = 2;
const SERVER_SELECTION_TIMEOUT_MS = 5000;

/** Raised when a handler asks for a collection while no connection is open. */
export class DbUnavailableError extends Error {}

let client = null;

function createClient() {
  const uri = process.env.MONGODB_URI;
  if (typeof uri !== "string" || uri === "") {
    throw new Error(
      "Missing MONGODB_URI environment variable. Set it to connect to MongoDB.",
    );
  }

  return new MongoClient(uri, {
    serverApi: {
      version: MONGO_API_VERSION,
      strict: true,
      deprecated: false,
    },
    maxPoolSize: MAX_POOL_SIZE,
    minPoolSize: MIN_POOL_SIZE,
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
  });
}

/**
 * Connects to MongoDB and keeps the client for the life of the process.
 * Idempotent: a second call returns the already-connected client.
 *
 * @returns {Promise<MongoClient>}
 */
export async function openDb() {
  if (client !== null) {
    return client;
  }

  const candidate = createClient();
  try {
    await candidate.connect();
    await candidate.db().admin().ping();
    console.log("tools-hub: MongoDB connected");
  } catch (err) {
    await candidate.close();
    throw err;
  }

  client = candidate;
  return client;
}

/**
 * Closes the shared connection. Safe to call when the server never connected.
 *
 * @returns {Promise<void>}
 */
export async function closeDb() {
  if (client === null) {
    return;
  }

  const closing = client;
  client = null;
  await closing.close();

  console.log("tools-hub: MongoDB connection closed");
}

function requireClient() {
  if (client === null) {
    throw new DbUnavailableError(
      "MongoDB is not connected: the server could not open a connection at startup.",
    );
  }
  return client;
}

/**
 * Returns a collection from the database the server connects to.
 * Add one named getter per collection rather than calling this from handlers.
 *
 * @param {string} name - collection name.
 * @returns {import("mongodb").Collection}
 */
export function getCollection(name) {
  return requireClient().db(MONGO_DB_NAME).collection(name);
}

/**
 * The `image-logs` collection used by the logging API routes.
 *
 * @returns {import("mongodb").Collection}
 */
export function getImageLogCollection() {
  return getCollection(IMAGE_LOGS_COLLECTION);
}
