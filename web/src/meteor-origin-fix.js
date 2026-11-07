const METEOR_MANIFEST_ID = "meteor-wallet";
const ORIGIN_FIX_VERSION = "originfix.1";
const METEOR_EXECUTOR_SOURCE = /pageUri:encodeURIComponent\(window\.location\.href\)/g;
const METEOR_EXECUTOR_REPLACEMENT = "pageUri:encodeURIComponent(window.selector.location)";
const METEOR_EXECUTOR_PATH = /^\/meteor-wallet\/meteor_wallet_sdk\/.+\/meteor-near-connect-latest\.js$/i;
const MANIFEST_PATH = /\/repository\/manifest\.json$/i;
const ALLOWED_MANIFEST_HOSTS = new Set(["raw.githubusercontent.com", "cdn.jsdelivr.net"]);

function urlOf(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return typeof input?.url === "string" ? input.url : "";
}

export function isMeteorExecutorUrl(input) {
  try {
    const url = new URL(urlOf(input));
    return url.protocol === "https:" && url.hostname === "raw.githubusercontent.com" && METEOR_EXECUTOR_PATH.test(url.pathname);
  } catch {
    return false;
  }
}

export function isNearConnectManifestUrl(input) {
  try {
    const url = new URL(urlOf(input));
    return url.protocol === "https:" && ALLOWED_MANIFEST_HOSTS.has(url.hostname) && MANIFEST_PATH.test(url.pathname);
  } catch {
    return false;
  }
}

export function patchMeteorExecutorSource(source) {
  const matches = [...source.matchAll(METEOR_EXECUTOR_SOURCE)];
  if (matches.length !== 1) {
    throw new Error(`Unexpected Meteor executor origin code (${matches.length} matches); refusing to load an unpatched executor.`);
  }
  return source.replace(METEOR_EXECUTOR_SOURCE, METEOR_EXECUTOR_REPLACEMENT);
}

export function patchMeteorManifestSource(source) {
  const manifest = JSON.parse(source);
  if (!Array.isArray(manifest.wallets)) return source;

  const meteor = manifest.wallets.find((wallet) => wallet?.id === METEOR_MANIFEST_ID);
  if (!meteor || !isMeteorExecutorUrl(meteor.executor) || typeof meteor.version !== "string") return source;
  if (meteor.version.endsWith(`-${ORIGIN_FIX_VERSION}`)) return source;

  meteor.version = `${meteor.version}-${ORIGIN_FIX_VERSION}`;
  return JSON.stringify(manifest);
}

function responseWithBody(response, body, ResponseConstructor) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");
  return new ResponseConstructor(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function installMeteorExecutorOriginFix(target = globalThis) {
  const originalFetch = target.fetch;
  if (typeof originalFetch !== "function") throw new Error("Fetch is unavailable; the Meteor origin fix cannot be installed.");
  if (originalFetch.__meteorOriginFixInstalled) return () => {};

  const ResponseConstructor = target.Response ?? globalThis.Response;
  if (typeof ResponseConstructor !== "function") throw new Error("Response is unavailable; the Meteor origin fix cannot be installed.");

  const patchedFetch = async function (input, init) {
    const response = await originalFetch.call(target, input, init);
    const requestUrl = urlOf(input);
    if (!response.ok || (!isMeteorExecutorUrl(requestUrl) && !isNearConnectManifestUrl(requestUrl))) return response;

    const body = await response.text();
    const patchedBody = isMeteorExecutorUrl(requestUrl)
      ? patchMeteorExecutorSource(body)
      : patchMeteorManifestSource(body);
    return responseWithBody(response, patchedBody, ResponseConstructor);
  };
  Object.defineProperty(patchedFetch, "__meteorOriginFixInstalled", { value: true });
  target.fetch = patchedFetch;

  return () => {
    if (target.fetch === patchedFetch) target.fetch = originalFetch;
  };
}
