// ---- helpers ----

export function validateNumber(
  value,
  fieldName,
  isOptional = true,
  warn = false,
) {
  if (isOptional && value == null) {
    if (warn) {
      console.warn(
        `WARNING: "${fieldName}" is not specified, going with defaults, but should be specified.`,
      );
    }
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `"${fieldName}" must be a finite number: ${JSON.stringify(value)}`,
    );
  }
}

export function validateString(
  value,
  fieldName,
  isOptional = true,
  warn = false,
) {
  if (isOptional && value == null) {
    if (warn) {
      console.warn(
        `WARNING: "${fieldName}" is not specified, going with defaults, but should be specified.`,
      );
    }
    return;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `"${fieldName}" must be a non-empty string: ${JSON.stringify(value)}`,
    );
  }
}

export function validateSeed(value, isOptional = true) {
  if (isOptional && value == null) return;
  if (
    (typeof value === "number" && !Number.isFinite(value)) ||
    (typeof value !== "number" && value !== "random")
  ) {
    throw new Error(
      `"seed" must be a finite number or "random": ${JSON.stringify(value)}`,
    );
  }
}

export function validateTries(value, isOptional = true) {
  if (isOptional && value == null) return;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `"tries" must be an integer >= 1: ${JSON.stringify(value)}`,
    );
  }
}

// ---- public API ----

export function validateJobData(data) {
  if (data == null) return;
  if (!Array.isArray(data)) return;

  for (const item of data) {
    // Mandatory fields.
    validateString(item["base-workflow"], "base-workflow", false);
    if (!Array.isArray(item?.prompts) || item.prompts.length === 0) {
      throw new Error(
        `"prompts" must be a non-empty list: ${JSON.stringify(item)}`,
      );
    }

    // Optional fields — use validateString for string fields.
    validateString(item["output-folder"], "output-folder", undefined, true);
    validateString(item["filename-prefix"], "filename-prefix", undefined, true);

    validateNumber(item.steps, "steps");
    validateNumber(item.cfg, "cfg");

    validateString(item.sampler, "sampler");
    validateString(item.scheduler, "scheduler");
    validateSeed(item.seed);
    validateTries(item.tries);

    // Optional complex fields.
    validateLoras(item);
    validateClipSkip(item);
    validatePromptArray(item, "prompt");
    validatePromptArray(item, "negative-prompt");

    // size validation (object type, validate if present).
    if (item?.size != null) {
      if (
        typeof item.size !== "object" ||
        item.size == null ||
        Array.isArray(item.size)
      ) {
        throw new Error(
          `"size" must be an object with "width" and "height": ${JSON.stringify(
            item,
          )}`,
        );
      }
      if (item.size.width != null)
        validateNumber(item.size.width, "size.width");
      if (item.size.height != null)
        validateNumber(item.size.height, "size.height");
    }
  }
}

export function validatePromptArray(effective, fieldName, isOptional = true) {
  if (isOptional && effective[fieldName] == null) return;
  if (!Array.isArray(effective[fieldName])) {
    throw new Error(
      `"${fieldName}" must be a list of strings: ${JSON.stringify(effective)}`,
    );
  }
}

export function validateClipSkip(effective, isOptional = true) {
  if (isOptional && effective["clip-skip"] == null) return;
  if (
    typeof effective["clip-skip"] !== "number" ||
    !Number.isFinite(effective["clip-skip"])
  ) {
    throw new Error(
      `"clip-skip" must be a finite number: ${JSON.stringify(effective)}`,
    );
  }
}

export function validateLoras(effective, isOptional = true) {
  if (isOptional && effective.loras == null) return;
  if (!Array.isArray(effective.loras)) {
    throw new Error(
      `"loras" must be a list of {name, strength} objects: ${JSON.stringify(effective)}`,
    );
  }
  if (effective.loras.length === 0) {
    throw new Error(
      `"loras" must contain at least one entry: ${JSON.stringify(effective)}`,
    );
  }
  for (const lora of effective.loras) {
    if (typeof lora !== "object" || lora == null || Array.isArray(lora)) {
      throw new Error(
        `Each "loras" entry must be a {name, strength} object: ${JSON.stringify(lora)}`,
      );
    }
    if (typeof lora.name !== "string" || lora.name.length === 0) {
      throw new Error(
        `"loras[].name" must be a non-empty string: ${JSON.stringify(lora)}`,
      );
    }
    if (typeof lora.strength !== "number" || !Number.isFinite(lora.strength)) {
      throw new Error(
        `"loras[].strength" must be a finite number: ${JSON.stringify(lora)}`,
      );
    }
  }
}
