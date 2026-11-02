import path from "node:path";

// Strips only the last extension ("a.b.c" -> "a.b"). Trims surrounding
// whitespace (to match the log-find Lambda normalizer), then applies
// path.basename (after normalizing backslashes so a stray Windows path like
// "C:\dir\file.png" still yields the base stem). Extensionless names and
// leading-dot dotfiles (".hidden") pass through unchanged.
export function stripExtension(filename) {
  const base = path.basename(
    String(filename ?? "")
      .trim()
      .replace(/\\/g, "/"),
  );
  const dotIndex = base.lastIndexOf(".");
  if (dotIndex <= 0) {
    return base;
  }
  return base.slice(0, dotIndex);
}
