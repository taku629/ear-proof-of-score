import assert from "node:assert/strict";
import test from "node:test";
import {
  generatePracticePoints,
  integerDistance,
  solvePracticeInstance,
  tourScore,
} from "./practice-core.js";

test("integer distance and closed-tour score match the contract rule", () => {
  const points = [{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 6, y: 0 }];
  assert.equal(integerDistance(points[0], points[1]), 5);
  assert.equal(tourScore(points, [0, 1, 2]), 16);
});

test("practice point generation is deterministic and respects contract coordinates", () => {
  const first = generatePracticePoints(100, 42);
  assert.deepEqual(generatePracticePoints(100, 42), first);
  assert.equal(first.length, 100);
  for (const point of first) {
    assert.ok(Number.isInteger(point.x) && point.x >= -10_000 && point.x <= 10_000);
    assert.ok(Number.isInteger(point.y) && point.y >= -10_000 && point.y <= 10_000);
  }
});

test("practice solver returns a deterministic full permutation without worsening baseline", () => {
  const points = generatePracticePoints(120, 2026);
  const first = solvePracticeInstance(points);
  const second = solvePracticeInstance(points);
  assert.deepEqual(first, second);
  assert.equal(first.route.length, points.length);
  assert.equal(new Set(first.route).size, points.length);
  assert.equal(first.score, tourScore(points, first.route));
  assert.ok(first.score <= first.baselineScore);
  assert.equal(first.startsTested, 8);
});

test("practice solver accepts 2,000 cities and rejects an oversized instance", () => {
  const largePoints = generatePracticePoints(2_000, 9);
  assert.equal(largePoints.length, 2_000);
  const largeResult = solvePracticeInstance(largePoints);
  assert.equal(new Set(largeResult.route).size, 2_000);
  assert.ok(largeResult.score <= largeResult.baselineScore);
  assert.throws(() => generatePracticePoints(2_001, 9), /3 to 2000/);
  assert.throws(() => solvePracticeInstance(generatePracticePoints(2_001, 9)), /3 to 2000/);
});

test("practice solver rejects non-integer or out-of-range coordinates", () => {
  assert.throws(() => solvePracticeInstance([{ x: 0, y: 0 }, { x: 1.5, y: 1 }, { x: 2, y: 3 }]), /integer coordinates/);
  assert.throws(() => solvePracticeInstance([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 10_001, y: 2 }]), /integer coordinates/);
});
