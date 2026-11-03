import { MongoClient } from "mongodb";
import "dotenv/config";

const MONGO_DB = "gen-ai";
const MONGO_COLLECTION = "image-logs";
const MONGO_API_VERSION = "1";

/**
 * Returns a connected { client, collection } pair for the image-logs
 * collection in the 'gen-ai' database.
 *
 * Ensures dotenv is initialized (even if the caller hasn't loaded it),
 * reads `MONGODB_URI`, and connects with recommended API options.
 * A fresh client is created each call; the caller is responsible for
 * calling `client.close()` when done.
 *
 * @returns {Promise<{ client: MongoClient, collection: import("mongodb").Collection }>}
 */
export async function getImageLogConnection() {
  const uri = process.env.MONGODB_URI;
  if (typeof uri !== "string" || uri === "") {
    throw new Error(
      "Missing MONGODB_URI environment variable. Set it to connect to MongoDB.",
    );
  }

  const client = new MongoClient(uri, {
    serverApi: {
      version: MONGO_API_VERSION,
      strict: true,
      deprecated: false,
    },
    maxPoolSize: 10,
    minPoolSize: 2,
  });

  try {
    await client.connect();
    // Ping the server to verify the connection is actually usable.
    await client.db().admin().ping();
    const collection = client.db(MONGO_DB).collection(MONGO_COLLECTION);
    return { client, collection };
  } catch (err) {
    await client.close();
    throw err;
  }
}
