import { useCallback, useEffect, useState } from "react";

/**
 * Fetches and caches generation log entries from `GET /api/logs`.
 *
 * @param {number} refreshTrigger - Increment to force a re-fetch.
 * @returns {{ entries: Array<object>, loading: boolean, refetch: () => void }}
 */
export function useLogEntries(refreshTrigger = 0) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/logs");
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch when the trigger changes and on initial load
  useEffect(() => {
    fetchLogs();
  }, [refreshTrigger, fetchLogs]);

  return { entries, loading, refetch: fetchLogs };
}

export default useLogEntries;
