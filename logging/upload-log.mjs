import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { stripExtension } from "./utils.mjs";

function tableName() {
  return process.env.TABLE_NAME ?? process.env.AWS_LOGS_TABLE_NAME;
}

// Built lazily per call (not at import time) so `AWS_REGION`/credentials
// set after import (e.g. via `dotenv/config` load order or test stubs)
// are honored. Pass `{ docClient }` to inject a fake in tests.
function defaultDocClient() {
  const region = process.env.AWS_REGION;
  const client = new DynamoDBClient(region ? { region } : {});
  return DynamoDBDocumentClient.from(client);
}

// Matches the log-find Lambda schema: the String partition key `filename`
// holds the image base filename WITHOUT extension and `data` holds the
// log entry.
export function buildPutItem({ table, filename, logEntry }) {
  return {
    TableName: table,
    Item: {
      filename,
      data: logEntry,
    },
  };
}

export async function uploadLog(logEntries, { docClient } = {}) {
  if (!Array.isArray(logEntries)) {
    throw new TypeError("uploadLog expects an array of log entries.");
  }
  const configuredTable = tableName();
  if (configuredTable == null || String(configuredTable).trim() === "") {
    throw new Error(
      "Missing DynamoDB table: set the TABLE_NAME environment variable (or AWS_LOGS_TABLE_NAME) to the logs table name.",
    );
  }
  const table = String(configuredTable).trim();
  const client = docClient ?? defaultDocClient();
  const entries = logEntries;
  let uploaded = 0;
  // Fail-fast (parity with the pre-existing sequential style, unlike the
  // one-off temp-script which collects per-item failures): the first
  // DynamoDB error aborts the remaining entries and propagates to the
  // caller (`addToLog` logs `Log upload failed` and keeps local entries).
  // Re-uploading the same basename overwrites via bare `PutCommand`
  // upsert, same as the temp-script helper.
  for (const logEntry of entries) {
    const filename = logEntry?.filename;
    if (typeof filename !== "string" || filename === "") {
      continue;
    }
    const key = stripExtension(filename);
    if (key === "") {
      continue;
    }
    await client.send(
      new PutCommand(buildPutItem({ table, filename: key, logEntry })),
    );
    uploaded += 1;
  }
  return { uploaded };
}
