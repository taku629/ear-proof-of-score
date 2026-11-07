import assert from "node:assert/strict";
import test from "node:test";
import {
  installMeteorExecutorOriginFix,
  isMeteorExecutorUrl,
  isNearConnectManifestUrl,
  patchMeteorExecutorSource,
  patchMeteorManifestSource,
} from "./meteor-origin-fix.js";

const executorUrl = "https://raw.githubusercontent.com/Meteor-Wallet/meteor_wallet_sdk/data-storage/storage/meteor-near-connect-latest.js";
const manifestUrl = "https://raw.githubusercontent.com/hot-dao/near-selector/refs/heads/main/repository/manifest.json";
const executorSource = 'const request = {pageUri:encodeURIComponent(window.location.href)};';

test("the Meteor executor receives the host page URL, not about:srcdoc", () => {
  assert.equal(isMeteorExecutorUrl(executorUrl), true);
  assert.equal(isMeteorExecutorUrl("https://example.com/Meteor-Wallet/meteor_wallet_sdk/main/meteor-near-connect-latest.js"), false);
  assert.equal(
    patchMeteorExecutorSource(executorSource),
    'const request = {pageUri:encodeURIComponent(window.selector.location)};',
  );
});

test("the executor patch fails closed when the upstream source shape changes", () => {
  assert.throws(() => patchMeteorExecutorSource("const request = {};"), /0 matches/);
  assert.throws(
    () => patchMeteorExecutorSource(`${executorSource}${executorSource}`),
    /2 matches/,
  );
});

test("the patched Meteor manifest version avoids stale Near Connect executor cache", () => {
  const manifest = {
    version: "1.1.0",
    wallets: [
      { id: "meteor-wallet", version: "1.1.1", executor: executorUrl },
      { id: "hot-wallet", version: "1.0.4", executor: "https://example.com/hot.js" },
    ],
  };
  assert.equal(isNearConnectManifestUrl(manifestUrl), true);
  assert.equal(isNearConnectManifestUrl("https://example.com/repository/manifest.json"), false);

  const patched = JSON.parse(patchMeteorManifestSource(JSON.stringify(manifest)));
  assert.equal(patched.wallets[0].version, "1.1.1-originfix.1");
  assert.equal(patched.wallets[0].executor, executorUrl);
  assert.equal(patched.wallets[1].version, "1.0.4");
  assert.equal(
    JSON.parse(patchMeteorManifestSource(JSON.stringify(patched))).wallets[0].version,
    "1.1.1-originfix.1",
  );
});

test("fetch interception patches only official manifest and Meteor executor responses", async () => {
  const calls = [];
  const manifest = JSON.stringify({
    version: "1.1.0",
    wallets: [{ id: "meteor-wallet", version: "1.1.1", executor: executorUrl }],
  });
  const target = {
    Response,
    fetch: async (input) => {
      const url = typeof input === "string" ? input : input.url;
      calls.push(url);
      if (url.startsWith(manifestUrl.split("/repository")[0])) {
        return new Response(manifest, { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.startsWith(executorUrl)) {
        return new Response(executorSource, { status: 200, headers: { "content-type": "text/javascript" } });
      }
      return new Response("untouched", { status: 200 });
    },
  };
  const restore = installMeteorExecutorOriginFix(target);

  const manifestResponse = await target.fetch(manifestUrl);
  assert.equal((await manifestResponse.json()).wallets[0].version, "1.1.1-originfix.1");
  const executorResponse = await target.fetch(`${executorUrl}?nonce=cache-bust`);
  assert.match(await executorResponse.text(), /window\.selector\.location/);
  const otherResponse = await target.fetch("https://api.testnet.near.org/");
  assert.equal(await otherResponse.text(), "untouched");
  assert.equal(calls.length, 3);

  restore();
  assert.equal(target.fetch.__meteorOriginFixInstalled, undefined);
});
