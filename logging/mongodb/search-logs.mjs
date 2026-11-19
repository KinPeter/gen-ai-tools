import "dotenv/config";
import { getImageLogConnection } from "./client.mjs";

/**
 * Regex-escape special characters in a string for safe use in $regex.
 *
 * @param {string} str - The string to escape.
 * @returns {string} The escaped string.
 */
export function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Field mapping: filter key → MongoDB flat field name. */
const FIELD_MAP = new Map([
  ["workflow", "base-workflow"],
  ["prefix", "filename-prefix"],
  ["outputFolder", "output-folder"],
]);

/**
 * The filter keys `buildQuery`'s switch below implements — the contract its
 * callers build against, kept here so the list and its implementation cannot
 * drift. A key outside this set makes the switch throw instead of ignoring it.
 */
export const SEARCH_FILTER_KEYS = new Set([
  ...FIELD_MAP.keys(),
  "lora",
  "prompt",
  "sampler",
  "scheduler",
  "model",
]);

/**
 * Build a condition object for a simple regex field.
 * @param {string} field - MongoDB field name.
 * @param {string} value - Value to match.
 * @returns {object} MongoDB condition object.
 */
function regexCondition(field, value) {
  return { [field]: { $regex: escapeRegex(value), $options: "i" } };
}

/**
 * Build a MongoDB query object from the filters object.
 *
 * Each filter key maps to a flat field name in the MongoDB document.
 * Array-valued filters add multiple conditions to the same $and (AND logic).
 *
 * @param {object} filters - Filter object; keys must come from
 *   SEARCH_FILTER_KEYS — the switch below answers any other key with an error.
 * @returns {object} MongoDB query object.
 */
export function buildQuery(filters) {
  const allConditions = [];

  if (!filters || Object.keys(filters).length === 0) {
    return {};
  }

  for (const [key, value] of Object.entries(filters)) {
    if (value == null) continue;

    const values = Array.isArray(value) ? value : [value];

    switch (key) {
      case "workflow":
      case "prefix":
      case "outputFolder": {
        const field = FIELD_MAP.get(key);
        allConditions.push(...values.map((v) => regexCondition(field, v)));
        break;
      }
      case "lora": {
        allConditions.push(
          ...values.map((v) => ({
            loras: {
              $elemMatch: { name: { $regex: escapeRegex(v), $options: "i" } },
            },
          })),
        );
        break;
      }
      case "prompt": {
        allConditions.push(
          ...values.map((v) => ({
            $or: [
              { ...regexCondition("prompt", v) },
              { ...regexCondition("negative-prompt", v) },
            ],
          })),
        );
        break;
      }
      case "sampler":
      case "scheduler":
      case "model": {
        allConditions.push(...values.map((v) => regexCondition(key, v)));
        break;
      }
      default: {
        throw new Error(`Unsupported filter: ${key}`);
      }
    }
  }

  return allConditions.length > 0 ? { $and: allConditions } : {};
}

/**
 * Search MongoDB for log entries matching the given filters.
 *
 * Returns cloned objects with _id removed, using the flat document
 * structure (fields at top level, NOT nested under a `prompt` key).
 *
 * Note: when `limit` is applied, the internal `results` array from
 * `toArray()` is truncated **in-place** (`results.length = limit`).
 * Callers that need an unmodified result array should clone it themselves.
 *
 * @param {object} filters - Filter object (same shape as parseArgs output).
 * @param {object} connection - { client, collection } pair from getImageLogConnection.
 * @param {number|null} limit - Maximum number of results (null = no limit).
 * @returns {Promise<object[]>} Array of log entry objects (with _id removed).
 */
export async function searchLogs(filters, connection, limit) {
  const { collection } = connection;

  const query = buildQuery(filters);
  const cursor = collection.find(query);
  const results = await cursor.limit(limit || 0).toArray();

  // Remove _id and return cloned objects
  return results.map((entry) => {
    const cloned = { ...entry };
    delete cloned._id;
    return cloned;
  });
}

/**
 * Search log entries using a freshly-created MongoDB connection.
 *
 * This is a convenience wrapper around `searchLogs` that handles
 * connection lifecycle internally (create, use, close).
 *
 * @param {object} filters - Filter object.
 * @param {number|null} limit - Maximum number of results.
 * @returns {Promise<object[]>} Array of log entry objects (with _id removed).
 */
export async function searchLogsWithConnection(filters, limit) {
  const connection = await getImageLogConnection();
  try {
    return await searchLogs(filters, connection, limit);
  } catch (err) {
    console.error(`Error searching for logs: ${err.message}`);
    throw err;
  } finally {
    await connection.client?.close();
  }
}
