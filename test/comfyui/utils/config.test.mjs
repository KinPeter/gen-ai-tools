import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withEnv } from "../../support/env.mjs";

// The asset base the batch falls back to when COMFY_ASSETS_PATH is unset,
// spelled out from this checkout so moving comfyui/ is a caught change rather
// than a comparison against the production constant.
const REPO_BASE = path.join(import.meta.dirname, "..", "..", "..", "comfyui");
// A base that never has to exist: loadConfig only derives the folder names,
// and the folders that really hold the assets are proved in workflow.test.mjs.
const VAULT_BASE = "/vault/comfyui";

const state = { active: null, error: null };
vi.mock("../../../runpod/state.mjs", () => ({
  readActivePod: vi.fn(async () => {
    if (state.error) throw state.error;
    return state.active;
  }),
}));
const { loadConfig, requireConfig } =
  await import("../../../comfyui/jobs/config.mjs");

describe("configuration", () => {
  afterEach(() => {
    state.active = null;
    state.error = null;
  });

  it("requires a server and validates polling", async () => {
    await withEnv(
      { COMFY_SERVER: "", COMFY_POLL_INTERVAL_MS: "" },
      async () => {
        await expect(loadConfig()).rejects.toThrow("Missing COMFY_SERVER");
        await expect(
          loadConfig({
            COMFY_SERVER: "http://env",
            COMFY_POLL_INTERVAL_MS: "0",
          }),
        ).rejects.toThrow("integer");
        await expect(
          loadConfig({ COMFY_SERVER: "http://env" }),
        ).resolves.toMatchObject({ pollIntervalMs: 5000 });
      },
    );
  });

  it("prefers the active pod URL", async () => {
    state.active = { comfyUrl: " http://pod " };
    await expect(
      loadConfig({ COMFY_SERVER: "http://env", COMFY_POLL_INTERVAL_MS: "10" }),
    ).resolves.toMatchObject({ server: "http://pod", serverSource: "pod" });
    state.active = null;
  });

  it("falls back after unreadable state and reports requireConfig failures", async () => {
    state.error = new Error("bad state");
    await expect(
      loadConfig({ COMFY_SERVER: "http://env" }),
    ).resolves.toMatchObject({ serverSource: "env" });
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    await expect(requireConfig({ COMFY_SERVER: "" })).rejects.toThrow("exit");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("reports the asset folders the batch reads from", async () => {
    // No COMFY_ASSETS_PATH: the example input and base workflows that ship in
    // comfyui/ must stay resolvable, so the repo base is the answer.
    await expect(
      loadConfig({ COMFY_SERVER: "http://env" }),
    ).resolves.toMatchObject({
      assetsPath: REPO_BASE,
      inputsDir: path.join(REPO_BASE, "inputs"),
      workflowsDir: path.join(REPO_BASE, "workflows"),
    });
    await expect(
      loadConfig({ COMFY_SERVER: "http://env", COMFY_ASSETS_PATH: "   " }),
    ).resolves.toMatchObject({ assetsPath: REPO_BASE });
    // An absolute base is taken as written, so the lookup does not depend on
    // the folder the batch was started in; its two asset folders are derived.
    await expect(
      loadConfig({
        COMFY_SERVER: "http://env",
        COMFY_ASSETS_PATH: ` ${VAULT_BASE} `,
      }),
    ).resolves.toMatchObject({
      server: "http://env",
      pollIntervalMs: 5000,
      assetsPath: VAULT_BASE,
      inputsDir: path.join(VAULT_BASE, "inputs"),
      workflowsDir: path.join(VAULT_BASE, "workflows"),
    });
  });

  it("refuses a relative asset base, and says so through requireConfig", async () => {
    await expect(
      loadConfig({
        COMFY_SERVER: "http://env",
        COMFY_ASSETS_PATH: "vault/comfyui",
      }),
    ).rejects.toThrow("COMFY_ASSETS_PATH must be an absolute path");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    await expect(
      requireConfig({
        COMFY_SERVER: "http://env",
        COMFY_ASSETS_PATH: "~/vault/comfyui",
      }),
    ).rejects.toThrow("exit");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("COMFY_ASSETS_PATH must be an absolute path"),
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});
