// ---- helpers ----

export function validateNumber(value, fieldName, isOptional = false) {
  if (isOptional && value == null) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `"${fieldName}" must be a finite number: ${JSON.stringify(value)}`,
    );
  }
}

export function validateString(value, fieldName, isOptional = false) {
  if (isOptional && value == null) return;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `"${fieldName}" must be a non-empty string: ${JSON.stringify(value)}`,
    );
  }
}

export function validateSeed(value, isOptional = false) {
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

export function validateTries(value, isOptional = false) {
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
    // Mandatory fields (isOptional = false, defaults).
    validateString(item["base-workflow"], "base-workflow");
    if (!Array.isArray(item?.prompts) || item.prompts.length === 0) {
      throw new Error(
        `"prompts" must be a non-empty list: ${JSON.stringify(item)}`,
      );
    }

    // Optional fields (isOptional = true) — use validateString for string fields.
    validateString(item["output-folder"], "output-folder", true);
    validateString(item["filename-prefix"], "filename-prefix", true);
    validateNumber(item.steps, "steps", true);
    validateNumber(item.cfg, "cfg", true);
    validateString(item.sampler, "sampler", true);
    validateString(item.scheduler, "scheduler", true);
    validateSeed(item.seed, true);
    validateTries(item.tries, true);

    // Optional complex fields — pass isOptional: true.
    validateLoras(item, true);
    validateClipSkip(item, true);
    validatePromptArray(item, "prompt", true);
    validatePromptArray(item, "negative-prompt", true);

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

export function validatePromptArray(effective, fieldName, isOptional = false) {
  if (isOptional && effective[fieldName] == null) return;
  if (!Array.isArray(effective[fieldName])) {
    throw new Error(
      `"${fieldName}" must be a list of strings: ${JSON.stringify(effective)}`,
    );
  }
}

export function validateClipSkip(effective, isOptional = false) {
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

export function validateLoras(effective, isOptional = false) {
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
