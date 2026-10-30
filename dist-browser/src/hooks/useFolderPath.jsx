import { useCallback, useEffect, useState } from "react";
import {
  normalizeFolderPath,
  readLastFolder,
  writeLastFolder,
} from "../utils/last-folder";

/**
 * The folder the layout is viewing, persisted so a reload returns to it.
 *
 * Layout owns currentPath, so it is the only writer of the "last visited folder"
 * entry: the dist root removes the entry, any other path stores the normalized
 * path. FileBrowser never touches storage.
 */
export function useFolderPath() {
  const [currentPath, setCurrentPath] = useState(() => readLastFolder());

  useEffect(() => {
    writeLastFolder(currentPath);
  }, [currentPath]);

  const navigateTo = useCallback(
    (path) => setCurrentPath(normalizeFolderPath(path)),
    [],
  );

  return { currentPath, navigateTo };
}

export default useFolderPath;
