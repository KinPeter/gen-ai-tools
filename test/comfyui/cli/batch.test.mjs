import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: {
    server: "http://comfy.test",
    serverSource: "env",
    pollIntervalMs: 1,
  },
  jobs: [{ workflow: {}, input: {} }],
  queuePrompt: vi.fn(),
  waitForCompletion: vi.fn(),
  saveOutputs: vi.fn(),
  addToLog: vi.fn(),
  writeLog: vi.fn(),
  convertOutputs: vi.fn(),
  freeMemory: vi.fn(),
  requestMemoryCleanup: vi.fn(),
  cleanupOriginals: vi.fn(),
}));

vi.mock("../../../comfyui/jobs/config.mjs", () => ({
  requireConfig: vi.fn(async () => mocks.config),
}));
vi.mock("../../../comfyui/utils/args.mjs", () => ({
  requireInputName: vi.fn(() => "test"),
}));
vi.mock("../../../comfyui/workflow-builder/workflow.mjs", () => ({
  requireWorkflows: vi.fn(async () => mocks.jobs),
}));
vi.mock("../../../comfyui/jobs/comfy.mjs", () => ({
  queuePrompt: mocks.queuePrompt,
  waitForCompletion: mocks.waitForCompletion,
  freeMemory: mocks.freeMemory,
  requestMemoryCleanup: mocks.requestMemoryCleanup,
}));
vi.mock("../../../comfyui/jobs/save.mjs", () => ({
  saveOutputs: mocks.saveOutputs,
  cleanupOriginals: mocks.cleanupOriginals,
}));
vi.mock("../../../comfyui/jobs/convert.mjs", () => ({
  convertOutputs: mocks.convertOutputs,
}));
vi.mock("../../../comfyui/jobs/log.mjs", () => ({
  addToLog: mocks.addToLog,
  writeLog: mocks.writeLog,
}));
vi.mock("../../../comfyui/utils/naming.mjs", () => ({
  timestamp: () => "20260101000000",
}));

// Set before batch.mjs loads so KEEP_ORIGINALS is evaluated correctly
process.env.COMFY_KEEP_ORIGINALS = "true";

const { main } = await import("../../../comfyui/batch.mjs");

describe("batch orchestrator", () => {
  it("runs every job through the pipeline", async () => {
    mocks.queuePrompt.mockResolvedValue("prompt-1");
    mocks.waitForCompletion.mockResolvedValue({ status: {} });
    mocks.saveOutputs.mockResolvedValue([
      { filename: "x.png", destDir: "output" },
    ]);
    mocks.addToLog.mockResolvedValue([]);
    mocks.convertOutputs.mockResolvedValue(undefined);
    mocks.requestMemoryCleanup.mockResolvedValue(undefined);

    await expect(main()).resolves.toBe(true);
    expect(mocks.writeLog).toHaveBeenCalled();
    expect(mocks.addToLog).toHaveBeenCalled();
    expect(mocks.convertOutputs).toHaveBeenCalled();
    expect(mocks.requestMemoryCleanup).toHaveBeenCalledWith(
      "http://comfy.test",
    );
  });

  it("skips cleanupOriginals when KEEP_ORIGINALS is true", async () => {
    // COMFY_KEEP_ORIGINALS is "true" (set at module level)
    // KEEP_ORIGINALS in batch.mjs was evaluated as true → cleanup not called
    expect(process.env.COMFY_KEEP_ORIGINALS).toBe("true");
    await expect(main()).resolves.toBe(true);
    expect(mocks.saveOutputs).toHaveBeenCalled();
    expect(mocks.cleanupOriginals).not.toHaveBeenCalled();
  });

  it("calls cleanupOriginals when KEEP_ORIGINALS is false", async () => {
    process.env.COMFY_KEEP_ORIGINALS = "false";
    vi.resetModules();

    const { main: main2 } = await import("../../../comfyui/batch.mjs");

    mocks.queuePrompt.mockResolvedValue("prompt-1");
    mocks.waitForCompletion.mockResolvedValue({ status: {} });
    mocks.saveOutputs.mockResolvedValue([
      { filename: "x.png", destDir: "output" },
    ]);
    mocks.addToLog.mockResolvedValue([]);
    mocks.convertOutputs.mockResolvedValue(undefined);
    mocks.requestMemoryCleanup.mockResolvedValue(undefined);

    await expect(main2()).resolves.toBe(true);
    expect(mocks.saveOutputs).toHaveBeenCalled();
    expect(mocks.cleanupOriginals).toHaveBeenCalled();
  });

  it("returns false when a job fails", async () => {
    mocks.queuePrompt.mockRejectedValueOnce(new Error("queue failed"));
    mocks.requestMemoryCleanup.mockResolvedValue(undefined);
    await expect(main()).resolves.toBe(false);
    expect(mocks.requestMemoryCleanup).toHaveBeenCalled();
  });
});
