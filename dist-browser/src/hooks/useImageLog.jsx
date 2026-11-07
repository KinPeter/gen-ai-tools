import { useEffect, useState } from "react";
import { buildLogUrl } from "../utils/log-url.mjs";
import { logEntryFromResponse } from "../utils/log-response.mjs";

/** Status the find-log endpoint answers when there is no entry for a file. */
const NOT_FOUND_STATUS = 404;

/** Log state when no image is selected. */
const EMPTY_LOG = Object.freeze({
  selected: false,
  entry: null,
  loading: false,
  error: null,
});

/** Log state while a lookup for the selected image is in flight. */
const PENDING_LOG = Object.freeze({
  selected: true,
  entry: null,
  loading: true,
  error: null,
});

/**
 * Fetch one generation log entry from
 * `GET /api/logging/find-log?filename=<filename>`.
 *
 * @param {string} imagePath - Path or filename of the selected image.
 * @param {AbortSignal} signal - Aborts the request when the selection changes.
 * @returns {Promise<object|null>} The log entry, or null when none exists.
 */
async function fetchLogEntry(imagePath, signal) {
  const response = await fetch(buildLogUrl(imagePath), {
    headers: { Accept: "application/json" },
    // Log entries can be re-uploaded for the same image, so never serve a
    // cached body for a lookup.
    cache: "no-store",
    signal,
  });

  // A missing entry is a normal "no log" outcome, not a parse failure.
  if (response.status === NOT_FOUND_STATUS) return null;

  const data = await response.json().catch(() => null);

  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);

  return logEntryFromResponse(data);
}

/**
 * Log state for the currently selected image. The lookup is fired at the same
 * moment the image file request starts, so both requests run in parallel.
 *
 * `refreshKey` re-runs the lookup for an unchanged selection, so a refreshed
 * folder picks up a log written after the image was first selected. Under
 * StrictMode in development the effect runs twice and the first request is
 * aborted; the aborted request resolves to an AbortError and is ignored.
 *
 * @param {string|null} selectedPath - Path of the selected image.
 * @param {number} refreshKey - Increment to re-look-up the same selection.
 * @returns {{ selected: boolean, entry: object|null, loading: boolean,
 *   error: string|null }}
 */
export function useImageLog(selectedPath, refreshKey = 0) {
  const [log, setLog] = useState(() =>
    selectedPath ? PENDING_LOG : EMPTY_LOG,
  );

  useEffect(() => {
    if (!selectedPath) {
      setLog(EMPTY_LOG);
      return;
    }

    const controller = new AbortController();
    setLog(PENDING_LOG);

    fetchLogEntry(selectedPath, controller.signal)
      .then((entry) =>
        setLog({ selected: true, entry, loading: false, error: null }),
      )
      .catch((err) => {
        if (err.name === "AbortError") return;
        setLog({
          selected: true,
          entry: null,
          loading: false,
          error: err.message || "Failed to load log",
        });
      });

    return () => controller.abort();
  }, [selectedPath, refreshKey]);

  return log;
}

export default useImageLog;
