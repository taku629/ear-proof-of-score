import { generatePracticePoints, solvePracticeInstance } from "./practice-core.js";

self.addEventListener("message", (event) => {
  const { count, seed } = event.data ?? {};
  const startedAt = performance.now();
  try {
    const points = generatePracticePoints(count, seed);
    const solution = solvePracticeInstance(points);
    self.postMessage({
      ok: true,
      points,
      ...solution,
      elapsedMs: Math.round(performance.now() - startedAt),
    });
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message || "Could not solve this practice instance." });
  }
});
