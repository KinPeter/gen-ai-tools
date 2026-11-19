import { SEARCH_FILTER_KEYS } from "../../../logging/mongodb/search-logs.mjs";

/** Body key that caps the number of results instead of filtering on a field. */
const LIMIT_KEY = "limit";

/** Accepted filters, taken from the query layer so the two cannot disagree. */
const ALLOWED_FILTERS_TEXT = [...SEARCH_FILTER_KEYS].join(", ");

/** Raised for a request body the endpoint cannot accept; the route answers 400. */
export class SearchRequestError extends Error {}

/**
 * Normalise one filter value: a string or an array of strings. Blank values
 * behave as if the filter had not been sent and answer null.
 *
 * @param {string} key - filter name.
 * @param {unknown} value - value the body carries for it.
 * @returns {string|string[]|null} normalised value, null when there is none.
 */
function normalizeFilterValue(key, value) {
  if (value == null) return null;

  const values = Array.isArray(value) ? value : [value];
  const kept = [];

  for (const item of values) {
    if (typeof item !== "string") {
      throw new SearchRequestError(
        `Filter '${key}' must be a string or an array of strings`,
      );
    }

    const trimmed = item.trim();
    if (trimmed !== "") kept.push(trimmed);
  }

  if (kept.length === 0) return null;

  return Array.isArray(value) ? kept : kept[0];
}

/**
 * Validate the optional limit.
 *
 * @param {unknown} value - value carried by the `limit` key.
 * @returns {number|null} positive integer, null for no limit.
 */
function parseLimit(value) {
  if (value == null) return null;

  if (!Number.isInteger(value) || value <= 0) {
    throw new SearchRequestError("limit must be a positive integer");
  }

  return value;
}

/** Maps the decoded body onto the filters and limit searchLogs takes. */
function searchArguments(body) {
  const filters = {};
  let limit = null;

  for (const [key, value] of Object.entries(body)) {
    if (key === LIMIT_KEY) {
      limit = parseLimit(value);
      continue;
    }

    if (!SEARCH_FILTER_KEYS.has(key)) {
      throw new SearchRequestError(
        `Unknown filter: ${key}. Allowed filters: ${ALLOWED_FILTERS_TEXT}`,
      );
    }

    const normalized = normalizeFilterValue(key, value);
    if (normalized !== null) filters[key] = normalized;
  }

  return { filters, limit };
}

/**
 * Turn the raw request body text into the arguments for searchLogs. The body
 * is optional: empty text and `null` both mean "no filters, no limit".
 *
 * @param {string} raw - request body text.
 * @returns {{ filters: object, limit: number|null }}
 */
export function parseSearchBody(raw) {
  if (raw.trim() === "") return { filters: {}, limit: null };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SearchRequestError("Invalid JSON body");
  }

  if (parsed === null) return { filters: {}, limit: null };

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SearchRequestError("Request body must be a JSON object");
  }

  return searchArguments(parsed);
}
