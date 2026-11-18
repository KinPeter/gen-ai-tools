/**
 * The deterministic seed sequence shared by the two harnesses that must agree:
 * `test/comfyui/workflows/workflow-e2e.test.mjs` (runs the suite) and
 * `test/comfyui/workflows/generate-goldens.mjs` (writes the goldens). They
 * drive the same pipeline, so drifting apart here makes regenerated goldens
 * stop matching the suite — the generator already once fell behind a seed.
 *
 * Indexed per test, not cumulatively: `isolate: true` gives each test file its
 * own module context and the generator restarts per input, so every consumer
 * keeps its own counter and starts at index 0.
 *
 * Largest per-test consumption:
 *   tests 19 and 40 — 4 brace variants       → indices 0..3
 *   tests 12, 20, 29 — 3 builds              → indices 0..2
 *   tests 15, 18, 25, 28, 38, 39 — 2 builds  → indices 0..1
 *   every other test — 1 build               → index 0
 * The array is sized for that largest consumer; the tail is headroom for new
 * scenarios. If workflow.mjs changes the order of getRandomSeed() calls,
 * regenerate the goldens (AGENTS.md → "ComfyUI workflow building tests").
 */
export const DETERMINISTIC_SEEDS = [
  // indices 0..2: consumed by any test that builds 2-3 random-seeded workflows
  1000000001, 1000000002, 1000000003,
  // index 3: the 4th workflow of tests 19 and 40 (4 brace variants)
  2000000001,
  // indices 4..16: headroom, no current test reaches them
  2000000002, 3000000001, 3000000002, 3000000003, 3000000004, 4000000001,
  4000000002, 4000000003, 5000000001, 6000000001, 6000000002, 6000000003,
  7000000001,
];

/**
 * A `Math.random` replacement that replays `DETERMINISTIC_SEEDS` starting at
 * `state.count` and falls back to `original` once the array is exhausted, so a
 * build that draws more seeds than planned still gets real randomness. Each
 * harness patches `Math.random` with this and resets `state.count` before every
 * test (or every input), which is what keeps seeds allocated per test.
 */
export function deterministicRandom(state, original = Math.random) {
  return () => {
    const index = state.count++;
    if (index < DETERMINISTIC_SEEDS.length) {
      return DETERMINISTIC_SEEDS[index] / Number.MAX_SAFE_INTEGER;
    }
    return original();
  };
}
