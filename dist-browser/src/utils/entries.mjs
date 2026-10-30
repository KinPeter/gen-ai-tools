import { isImageFile } from "./is-image";

/**
 * Shared, side-effect-free helpers for the entries returned by
 * `GET /api/fs/<path>`. The virtual parent row is spelled ".." everywhere, so
 * the tests, the browser list and the layout can share one definition.
 */
const PARENT_ENTRY_NAME = "..";

/**
 * Is this the virtual ".." row that walks up one level?
 * @param {unknown} entry - Listing entry.
 * @returns {boolean}
 */
export function isParentEntry(entry) {
  return Boolean(entry) && entry.name === PARENT_ENTRY_NAME;
}

/**
 * Is this entry a folder? Callers check `isParentEntry` first, so the virtual
 * ".." row is handled as a folder here.
 * @param {unknown} entry - Listing entry.
 * @returns {boolean}
 */
export function isFolderEntry(entry) {
  return Boolean(entry) && entry.type === "folder";
}

/**
 * Join a child name onto a folder path. The dist root is the empty path, so
 * joining onto "" yields the bare name.
 * @param {string} parentPath - Folder path relative to the dist root.
 * @param {string} name - Child name.
 * @returns {string} Path of the child.
 */
export function joinFolderPath(parentPath, name) {
  return parentPath ? `${parentPath}/${name}` : name;
}

/**
 * Path of an entry relative to the served dist root, or null when the entry is
 * not an image (folder, "..", or no selection at all).
 * @param {string} currentPath - Folder the listing is showing.
 * @param {unknown} entry - Listing entry.
 * @returns {string|null}
 */
export function entryImagePath(currentPath, entry) {
  if (!isImageFile(entry)) return null;
  return joinFolderPath(currentPath, entry.name);
}

/**
 * Build the virtual ".." entry, or null at the dist root.
 * @param {string} currentPath - Folder the listing is showing.
 * @returns {object|null}
 */
export function parentEntry(currentPath) {
  return currentPath ? { name: PARENT_ENTRY_NAME, type: "folder" } : null;
}

/**
 * Sort a directory listing: folders first (alphabetical, case-insensitive),
 * then files. Returns a new array so the caller's listing is never reordered.
 * @param {Array<object>|undefined} entries - Raw listing from the server.
 * @returns {Array<object>} Sorted copy of the listing.
 */
export function sortEntries(entries) {
  return [...(entries ?? [])].sort((a, b) => {
    const aIsFolder = a.type === "folder";
    const bIsFolder = b.type === "folder";
    if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}
