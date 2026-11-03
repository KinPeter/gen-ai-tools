import { stripExtension } from "../utils.mjs";

export async function uploadLog(logEntries, connection) {
  if (!Array.isArray(logEntries)) {
    throw new TypeError("uploadLog expects an array of log entries.");
  }

  const { client, collection } = connection;

  let uploaded;

  try {
    const documents = [];

    for (const logEntry of logEntries) {
      const filename = logEntry?.filename;
      if (typeof filename !== "string" || filename === "") {
        continue;
      }

      const stripped = stripExtension(filename);
      if (stripped === "") {
        continue;
      }

      documents.push({ ...logEntry, filename: stripped });
    }

    const result = await collection.insertMany(documents, { ordered: true });
    uploaded = result.insertedCount;
    // console.log(`${uploaded} log uploaded.`);
  } catch (e) {
    console.error("Failed to upload log entries to MongoDB:", e.message);
    await client.close();
    throw e;
  }

  return { uploaded };
}
