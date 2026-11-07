import assert from "node:assert/strict";
import test from "node:test";
import { createSingleFlight } from "./connection-lock.js";

test("concurrent requests share one wallet connection attempt", async () => {
  const run = createSingleFlight();
  let calls = 0;
  let resolveOperation;

  const first = run(() => {
    calls += 1;
    return new Promise((resolve) => {
      resolveOperation = resolve;
    });
  });
  const second = run(() => {
    calls += 1;
    return "unexpected second attempt";
  });

  assert.strictEqual(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);

  resolveOperation("connected");
  assert.equal(await first, "connected");
  assert.equal(await second, "connected");
});

test("a rejected connection attempt releases the lock for retry", async () => {
  const run = createSingleFlight();
  let calls = 0;

  await assert.rejects(
    run(() => {
      calls += 1;
      throw new Error("wallet closed");
    }),
    /wallet closed/,
  );

  assert.equal(await run(() => {
    calls += 1;
    return "retry succeeded";
  }), "retry succeeded");
  assert.equal(calls, 2);
});
