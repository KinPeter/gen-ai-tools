export function parseInputName(argv = process.argv) {
  return argv[2] ?? null;
}

export function requireInputName(argv = process.argv) {
  const name = parseInputName(argv);
  if (!name) {
    console.error("Usage: comfy-batch <input-name>");
    console.error(
      "  Finds <input-name>.yaml by name under COMFY_ASSETS_PATH/inputs",
    );
    process.exit(1);
  }
  return name;
}
