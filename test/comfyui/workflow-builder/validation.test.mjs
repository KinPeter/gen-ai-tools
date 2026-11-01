import { describe, expect, it } from "vitest";
import {
  validateJobData,
  validateString,
  validateNumber,
  validatePromptArray,
  validateClipSkip,
  validateLoras,
  validateSeed,
  validateTries,
} from "../../../comfyui/workflow-builder/validation.mjs";

describe("validation.mjs", () => {
  describe("validateJobData", () => {
    it("allows null and non-array data", () => {
      expect(validateJobData(null)).toBeUndefined();
      expect(validateJobData({})).toBeUndefined();
      expect(validateJobData("string")).toBeUndefined();
    });

    it("allows valid array of items with prompts", () => {
      expect(
        validateJobData([
          {
            "base-workflow": "a",
            "output-folder": "b",
            "filename-prefix": "c",
            prompts: [{ prompt: ["hello"] }],
          },
        ]),
      ).toBeUndefined();
      expect(validateJobData([])).toBeUndefined();
    });

    it("throws when item is missing prompts list", () => {
      expect(() =>
        validateJobData([
          {
            "base-workflow": "a",
            "output-folder": "b",
            "filename-prefix": "c",
          },
        ]),
      ).toThrow('"prompts"');
    });

    it("throws when item prompts is not an array", () => {
      expect(() =>
        validateJobData([
          {
            "base-workflow": "a",
            "output-folder": "b",
            "filename-prefix": "c",
            prompts: "not-an-array",
          },
        ]),
      ).toThrow('"prompts" must be a non-empty list');
    });

    it("throws when base-workflow is missing", () => {
      expect(() =>
        validateJobData([
          {
            "base-workflow": 123,
            "output-folder": "out",
            "filename-prefix": "pfx",
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toThrow('"base-workflow" must be a non-empty string');
    });

    it("throws when output-folder is missing", () => {
      expect(() =>
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": 123,
            "filename-prefix": "pfx",
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toThrow('"output-folder"');
    });

    it("throws when filename-prefix is missing", () => {
      expect(() =>
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": "out",
            "filename-prefix": 123,
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toThrow('"filename-prefix"');
    });

    it("allows valid base-workflow, output-folder, filename-prefix", () => {
      expect(
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": "out",
            "filename-prefix": "pfx",
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toBeUndefined();
    });

    it("throws when steps is not a number", () => {
      expect(() =>
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": "out",
            "filename-prefix": "pfx",
            steps: "abc",
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toThrow('"steps" must be a finite number');
    });

    it("allows valid steps", () => {
      expect(
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": "out",
            "filename-prefix": "pfx",
            steps: 30,
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toBeUndefined();
    });

    it("throws when cfg is not a number", () => {
      expect(() =>
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": "out",
            "filename-prefix": "pfx",
            cfg: "abc",
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toThrow('"cfg" must be a finite number');
    });

    it("allows valid cfg", () => {
      expect(
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": "out",
            "filename-prefix": "pfx",
            cfg: 8,
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toBeUndefined();
    });

    it("throws when sampler is present but not a string", () => {
      expect(() =>
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": "out",
            "filename-prefix": "pfx",
            sampler: 123,
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toThrow('"sampler" must be a non-empty string');
    });

    it("throws when sampler is empty string", () => {
      expect(() =>
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": "out",
            "filename-prefix": "pfx",
            sampler: "",
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toThrow('"sampler" must be a non-empty string');
    });

    it("throws when scheduler is present but not a string", () => {
      expect(() =>
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": "out",
            "filename-prefix": "pfx",
            scheduler: 123,
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toThrow('"scheduler" must be a non-empty string');
    });

    it("allows valid sampler string", () => {
      expect(
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": "out",
            "filename-prefix": "pfx",
            sampler: "euler",
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toBeUndefined();
    });

    it("allows valid scheduler string", () => {
      expect(
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": "out",
            "filename-prefix": "pfx",
            scheduler: "normal",
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toBeUndefined();
    });

    it("throws when size width is not a number", () => {
      expect(() =>
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": "out",
            "filename-prefix": "pfx",
            size: { width: "abc", height: 512 },
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toThrow('"size.width" must be a finite number');
    });

    it("throws when size height is not a number", () => {
      expect(() =>
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": "out",
            "filename-prefix": "pfx",
            size: { width: 512, height: "abc" },
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toThrow('"size.height" must be a finite number');
    });

    it("throws when size is not an object", () => {
      expect(() =>
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": "out",
            "filename-prefix": "pfx",
            size: [512, 512],
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toThrow('"size" must be an object');
    });

    it("allows valid size", () => {
      expect(
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": "out",
            "filename-prefix": "pfx",
            size: { width: 512, height: 512 },
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toBeUndefined();
    });

    it("throws when seed is present but not number or random", () => {
      expect(() =>
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": "out",
            "filename-prefix": "pfx",
            seed: "abc",
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toThrow('"seed" must be a finite number or "random"');
    });

    it("allows valid seed as number", () => {
      expect(
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": "out",
            "filename-prefix": "pfx",
            seed: 123,
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toBeUndefined();
    });

    it("allows valid seed as random", () => {
      expect(
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": "out",
            "filename-prefix": "pfx",
            seed: "random",
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toBeUndefined();
    });

    it("throws when loras is present but invalid (not array)", () => {
      expect(() =>
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": "out",
            "filename-prefix": "pfx",
            loras: "text",
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toThrow('"loras" must be a list');
    });

    it("throws when clip-skip is present but not a number", () => {
      expect(() =>
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": "out",
            "filename-prefix": "pfx",
            "clip-skip": "abc",
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toThrow('"clip-skip" must be a finite number');
    });

    it("throws when prompts array is empty", () => {
      expect(() =>
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": "out",
            "filename-prefix": "pfx",
            prompts: [],
          },
        ]),
      ).toThrow('"prompts" must be a non-empty list');
    });

    it("throws when negative-prompt is not an array", () => {
      expect(() =>
        validateJobData([
          {
            "base-workflow": "test",
            "output-folder": "out",
            "filename-prefix": "pfx",
            "negative-prompt": "not-an-array",
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toThrow('"negative-prompt" must be a list');
    });

    it("throws when base-workflow is not a string", () => {
      expect(() =>
        validateJobData([
          {
            "base-workflow": 123,
            "output-folder": "out",
            "filename-prefix": "pfx",
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toThrow('"base-workflow" must be a non-empty string');
    });

    it("throws when base-workflow is empty string", () => {
      expect(() =>
        validateJobData([
          {
            "base-workflow": "",
            "output-folder": "out",
            "filename-prefix": "pfx",
            prompts: [{ prompt: ["a"] }],
          },
        ]),
      ).toThrow('"base-workflow" must be a non-empty string');
    });
  });

  describe("validatePromptArray", () => {
    it("allows missing field", () => {
      expect(validatePromptArray({}, "prompt", true)).toBeUndefined();
    });

    it("allows valid array of strings", () => {
      expect(
        validatePromptArray({ prompt: ["hello", "world"] }, "prompt"),
      ).toBeUndefined();
    });

    it("throws when field is not an array", () => {
      expect(() =>
        validatePromptArray({ prompt: "not-an-array" }, "prompt"),
      ).toThrow('"prompt" must be a list');
    });

    it("returns when isOptional=true and field is null", () => {
      expect(
        validatePromptArray({ prompt: null }, "prompt", true),
      ).toBeUndefined();
    });

    it("throws when isOptional=false and field is null", () => {
      expect(() =>
        validatePromptArray({ prompt: null }, "prompt", false),
      ).toThrow('"prompt" must be a list');
    });
  });

  describe("validateClipSkip", () => {
    it("allows missing field", () => {
      expect(validateClipSkip({ "clip-skip": null }, true)).toBeUndefined();
    });

    it("allows valid finite numbers", () => {
      expect(validateClipSkip({ "clip-skip": -1 })).toBeUndefined();
      expect(validateClipSkip({ "clip-skip": 0 })).toBeUndefined();
      expect(validateClipSkip({ "clip-skip": 2 })).toBeUndefined();
    });

    it("throws when clip-skip is not a number", () => {
      expect(() => validateClipSkip({ "clip-skip": "abc" })).toThrow(
        '"clip-skip" must be a finite number',
      );
    });

    it("throws when clip-skip is NaN or Infinity", () => {
      expect(() => validateClipSkip({ "clip-skip": NaN })).toThrow(
        '"clip-skip" must be a finite number',
      );
      expect(() => validateClipSkip({ "clip-skip": Infinity })).toThrow(
        '"clip-skip" must be a finite number',
      );
      expect(() => validateClipSkip({ "clip-skip": -Infinity })).toThrow(
        '"clip-skip" must be a finite number',
      );
    });

    it("returns when isOptional=true and value is null", () => {
      expect(validateClipSkip({ "clip-skip": null }, true)).toBeUndefined();
    });

    it("throws when isOptional=false and value is null", () => {
      expect(() => validateClipSkip({ "clip-skip": null }, false)).toThrow(
        '"clip-skip" must be a finite number',
      );
    });
  });

  describe("validateLoras", () => {
    it("allows missing field", () => {
      expect(validateLoras({ loras: null }, true)).toBeUndefined();
    });

    it("throws when loras is not an array", () => {
      expect(() => validateLoras({ loras: "text" })).toThrow(
        '"loras" must be a list',
      );
    });

    it("throws when loras is empty", () => {
      expect(() => validateLoras({ loras: [] })).toThrow(
        '"loras" must contain at least one entry',
      );
    });

    it("throws when loras entries are not objects", () => {
      expect(() => validateLoras({ loras: [42] })).toThrow(
        'Each "loras" entry must be a {name, strength} object',
      );
    });

    it("throws when lora name is not a non-empty string", () => {
      expect(() => validateLoras({ loras: [{ strength: 1 }] })).toThrow(
        '"loras[].name" must be a non-empty string',
      );
      expect(() =>
        validateLoras({ loras: [{ name: 123, strength: 1 }] }),
      ).toThrow('"loras[].name" must be a non-empty string');
    });

    it("throws when lora strength is not a finite number", () => {
      expect(() =>
        validateLoras({ loras: [{ name: "a.safetensors", strength: "0.5" }] }),
      ).toThrow('"loras[].strength" must be a finite number');
      expect(() =>
        validateLoras({
          loras: [{ name: "a.safetensors", strength: Infinity }],
        }),
      ).toThrow('"loras[].strength" must be a finite number');
    });

    it("allows valid lora entries", () => {
      expect(
        validateLoras({ loras: [{ name: "a.safetensors", strength: 0.5 }] }),
      ).toBeUndefined();
      expect(
        validateLoras({
          loras: [
            { name: "a.safetensors", strength: 0.5 },
            { name: "b.safetensors", strength: 1 },
          ],
        }),
      ).toBeUndefined();
    });

    it("returns when isOptional=true and loras is null", () => {
      expect(validateLoras({ loras: null }, true)).toBeUndefined();
    });

    it("throws when isOptional=false and loras is null", () => {
      expect(() => validateLoras({ loras: null }, false)).toThrow(
        '"loras" must be a list',
      );
    });
  });

  describe("validateString isOptional", () => {
    it("returns when value is undefined and isOptional=true", () => {
      expect(validateString(undefined, "output-folder", true)).toBeUndefined();
      expect(
        validateString(undefined, "filename-prefix", true),
      ).toBeUndefined();
      expect(validateString(undefined, "sampler", true)).toBeUndefined();
      expect(validateString(undefined, "scheduler", true)).toBeUndefined();
    });

    it("throws when value is undefined and isOptional=false", () => {
      expect(() => validateString(undefined, "base-workflow", false)).toThrow(
        '"base-workflow" must be a non-empty string',
      );
    });

    it("throws when value is non-null but invalid string", () => {
      expect(() => validateString(123, "output-folder", true)).toThrow(
        '"output-folder" must be a non-empty string',
      );
      expect(() => validateString("", "filename-prefix", true)).toThrow(
        '"filename-prefix" must be a non-empty string',
      );
    });

    it("returns when value is null and isOptional=true", () => {
      expect(validateString(null, "output-folder", true)).toBeUndefined();
      expect(validateString(null, "filename-prefix", true)).toBeUndefined();
    });

    it("throws when value is null and isOptional=false", () => {
      expect(() => validateString(null, "base-workflow", false)).toThrow(
        '"base-workflow" must be a non-empty string',
      );
    });
  });

  describe("validateNumber isOptional", () => {
    it("returns when value is undefined and isOptional=true", () => {
      expect(validateNumber(undefined, "steps", true)).toBeUndefined();
      expect(validateNumber(undefined, "cfg", true)).toBeUndefined();
    });

    it("throws when value is undefined and isOptional=false", () => {
      expect(() => validateNumber(undefined, "steps", false)).toThrow(
        '"steps" must be a finite number',
      );
    });

    it("throws when value is non-null but not a finite number", () => {
      expect(() => validateNumber("abc", "steps", true)).toThrow(
        '"steps" must be a finite number',
      );
      expect(() => validateNumber(NaN, "steps", true)).toThrow(
        '"steps" must be a finite number',
      );
      expect(() => validateNumber(Infinity, "steps", true)).toThrow(
        '"steps" must be a finite number',
      );
    });

    it("returns when value is null and isOptional=true", () => {
      expect(validateNumber(null, "steps", true)).toBeUndefined();
    });
  });

  describe("validateSeed", () => {
    it("allows finite numbers", () => {
      expect(validateSeed(0)).toBeUndefined();
      expect(validateSeed(-1)).toBeUndefined();
      expect(validateSeed(1e10)).toBeUndefined();
    });

    it("allows random string", () => {
      expect(validateSeed("random")).toBeUndefined();
    });

    it("throws when not a number and not random", () => {
      expect(() => validateSeed("abc")).toThrow(
        '"seed" must be a finite number or "random"',
      );
      expect(() => validateSeed(true)).toThrow(
        '"seed" must be a finite number or "random"',
      );
      expect(() => validateSeed(null)).toThrow(
        '"seed" must be a finite number or "random"',
      );
    });

    it("throws when seed is NaN", () => {
      expect(() => validateSeed(NaN)).toThrow(
        '"seed" must be a finite number or "random"',
      );
    });

    it("throws when seed is Infinity", () => {
      expect(() => validateSeed(Infinity)).toThrow(
        '"seed" must be a finite number or "random"',
      );
    });

    it("returns when isOptional=true and value is undefined", () => {
      expect(validateSeed(undefined, true)).toBeUndefined();
    });

    it("returns when isOptional=true and value is null", () => {
      expect(validateSeed(null, true)).toBeUndefined();
    });

    it("throws when isOptional=false and value is undefined", () => {
      expect(() => validateSeed(undefined, false)).toThrow(
        '"seed" must be a finite number or "random"',
      );
    });
  });

  describe("validateTries", () => {
    it("allows integer >= 1", () => {
      expect(validateTries(1)).toBeUndefined();
      expect(validateTries(2)).toBeUndefined();
      expect(validateTries(100)).toBeUndefined();
    });

    it("throws when tries is not an integer", () => {
      expect(() => validateTries(1.5)).toThrow(
        '"tries" must be an integer >= 1',
      );
    });

    it("throws when tries is less than 1", () => {
      expect(() => validateTries(0)).toThrow('"tries" must be an integer >= 1');
      expect(() => validateTries(-1)).toThrow(
        '"tries" must be an integer >= 1',
      );
    });

    it("returns when isOptional=true and value is undefined", () => {
      expect(validateTries(undefined, true)).toBeUndefined();
    });

    it("returns when isOptional=true and value is null", () => {
      expect(validateTries(null, true)).toBeUndefined();
    });

    it("throws when isOptional=false and value is undefined", () => {
      expect(() => validateTries(undefined, false)).toThrow(
        '"tries" must be an integer >= 1',
      );
    });
  });
});
