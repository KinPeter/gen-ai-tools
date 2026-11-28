import os from "node:os";
import path from "node:path";
import { describe, afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  mongoClients,
  mockMongoDriver,
  resetMongoMock,
} from "../../support/mock-mongodb.mjs";

const mocks = vi.hoisted(() => ({
  config: {
    server: "http://comfy.test",
    serverSource: "env",
    pollIntervalMs: 1,
    assetsPath: "/assets",
    inputsDir: "/assets/inputs",
    workflowsDir: "/assets/workflows",
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

vi.mock("mongodb", () => mockMongoDriver());

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
// Reading the mocked workflow module back gives the spy batch.mjs calls, so a
// test can check the asset folders the config handed it.
const { requireWorkflows } =
  await import("../../../comfyui/workflow-builder/workflow.mjs");

beforeEach(() => vi.stubEnv("MONGODB_URI", "mongodb://mock-host.test"));
afterEach(() => {
  vi.unstubAllEnvs();
  resetMongoMock();
});

// Every pipeline step answers with its success value, so a run reaches the
// stages a test is checking instead of inheriting the previous test's answers.
function primePipeline() {
  mocks.queuePrompt.mockResolvedValue("prompt-1");
  mocks.waitForCompletion.mockResolvedValue({ status: {} });
  mocks.saveOutputs.mockResolvedValue([
    { filename: "x.png", destDir: "output" },
  ]);
  mocks.addToLog.mockResolvedValue([]);
  mocks.convertOutputs.mockResolvedValue(undefined);
  mocks.requestMemoryCleanup.mockResolvedValue(undefined);
}

describe("batch orchestrator", () => {
  it("runs every job through the pipeline", async () => {
    primePipeline();
    await expect(main()).resolves.toBe(true);
    // Local json logging is disabled
    expect(mocks.writeLog).not.toHaveBeenCalled();
    expect(mocks.addToLog).toHaveBeenCalled();
    expect(mocks.convertOutputs).toHaveBeenCalled();
    expect(mocks.requestMemoryCleanup).toHaveBeenCalledWith(
      "http://comfy.test",
    );
    // One image-log connection per run, opened and closed by main().
    expect(mongoClients()).toHaveLength(1);
    expect(mongoClients()[0].connect).toHaveBeenCalled();
    expect(mongoClients()[0].close).toHaveBeenCalledTimes(1);
  });

  it("skips cleanupOriginals when KEEP_ORIGINALS is true", async () => {
    // COMFY_KEEP_ORIGINALS is "true" (set at module level)
    // KEEP_ORIGINALS in batch.mjs was evaluated as true → cleanup not called
    expect(process.env.COMFY_KEEP_ORIGINALS).toBe("true");
    primePipeline();
    await expect(main()).resolves.toBe(true);
    expect(mocks.saveOutputs).toHaveBeenCalled();
    expect(mocks.cleanupOriginals).not.toHaveBeenCalled();
  });

  it("calls cleanupOriginals when KEEP_ORIGINALS is false", async () => {
    process.env.COMFY_KEEP_ORIGINALS = "false";
    vi.resetModules();

    const { main: main2 } = await import("../../../comfyui/batch.mjs");

    primePipeline();
    await expect(main2()).resolves.toBe(true);
    expect(mocks.saveOutputs).toHaveBeenCalled();
    expect(mocks.cleanupOriginals).toHaveBeenCalled();
  });

  it("returns false when a job fails", async () => {
    primePipeline();
    mocks.queuePrompt.mockRejectedValueOnce(new Error("queue failed"));
    await expect(main()).resolves.toBe(false);
    expect(mocks.requestMemoryCleanup).toHaveBeenCalled();
  });

  it("passes the resolved dist folder to convertOutputs", async () => {
    primePipeline();
    const tmpDist = path.join(os.tmpdir(), "batch-test-dist");
    vi.stubEnv("COMFY_DIST_PATH", tmpDist);
    await expect(main()).resolves.toBe(true);
    const [saved, options] = mocks.convertOutputs.mock.calls.at(-1);
    expect(saved).toEqual([{ filename: "x.png", destDir: "output" }]);
    expect(options.distBaseDir).toBe(tmpDist);
  });

  it("reports the asset base and looks for the input inside it", async () => {
    primePipeline();
    // Only calls recorded from here on count, so this test binds to its own run.
    requireWorkflows.mockClear();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(main()).resolves.toBe(true);
    expect(log).toHaveBeenCalledWith("Assets: /assets");
    // The input name is only a name: the folders come from the configuration.
    expect(requireWorkflows).toHaveBeenCalledWith(
      "test",
      "/assets/inputs",
      "/assets/workflows",
    );
  });
});
