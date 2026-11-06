import { NearConnector } from "@hot-labs/near-connect";
import { JsonRpcProvider } from "near-api-js";
import "./style.css";

const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID?.trim() ?? "";
const RPC_URL = import.meta.env.VITE_RPC_URL?.trim() || "https://rpc.testnet.near.org";
const YOCTO_PER_NEAR = 10n ** 24n;
const GAS = "150000000000000";

const provider = new JsonRpcProvider({ url: RPC_URL });
const connector = new NearConnector({
  network: "testnet",
  features: { signAndSendTransaction: true },
  footerBranding: null,
});

let wallet;
let accountId = "";
let toastTimer;

const walletButton = document.querySelector("#wallet-button");
const challengeList = document.querySelector("#challenge-list");
const emptyState = document.querySelector("#empty-state");
const configState = document.querySelector("#config-state");
const createFeedback = document.querySelector("#create-feedback");

function showToast(message, kind = "") {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.className = `toast visible ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 4200);
}

function shortenAccount(value) {
  if (!value) return "—";
  return value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

function formatNear(yocto) {
  const amount = BigInt(yocto ?? "0");
  const whole = amount / YOCTO_PER_NEAR;
  const decimals = (amount % YOCTO_PER_NEAR).toString().padStart(24, "0").slice(0, 4);
  return `${whole}.${decimals}`;
}

function parseNear(value) {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{0,24})?$/.test(text)) throw new Error("Enter a non-negative amount with up to 24 decimal places.");
  const [whole, fraction = ""] = text.split(".");
  const yocto = BigInt(whole) * YOCTO_PER_NEAR + BigInt((fraction + "0".repeat(24)).slice(0, 24));
  if (yocto <= 0n) throw new Error("Bounty must be greater than 0 NEAR.");
  return yocto.toString();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

async function callView(method, args = {}) {
  if (!CONTRACT_ID) throw new Error("Set VITE_CONTRACT_ID to a deployed testnet contract.");
  return provider.callFunction({ contractId: CONTRACT_ID, method, args });
}

function requireWallet() {
  if (!accountId || !wallet) throw new Error("Connect a NEAR testnet wallet first.");
  return wallet;
}

async function sendCall(methodName, args, deposit = "0") {
  const connectedWallet = requireWallet();
  return connectedWallet.signAndSendTransaction({
    receiverId: CONTRACT_ID,
    actions: [{
      type: "FunctionCall",
      params: { methodName, args, gas: GAS, deposit },
    }],
  });
}

function updateWalletButton() {
  if (accountId) {
    walletButton.innerHTML = `<span class="wallet-indicator"></span>${escapeHtml(shortenAccount(accountId))}<span class="wallet-caret">⌄</span>`;
    walletButton.setAttribute("aria-label", `Disconnect ${accountId}`);
    walletButton.title = "Click to disconnect";
  } else {
    walletButton.innerHTML = 'Connect wallet <span>↗</span>';
    walletButton.setAttribute("aria-label", "Connect NEAR wallet");
    walletButton.title = "Connect a NEAR testnet wallet";
  }
}

async function connectWallet() {
  if (accountId && wallet) {
    await connector.disconnect(wallet);
    wallet = undefined;
    accountId = "";
    updateWalletButton();
    showToast("Wallet disconnected.");
    return;
  }
  try {
    wallet = await connector.connect();
    const accounts = await wallet.getAccounts();
    accountId = accounts?.[0]?.accountId ?? "";
    if (!accountId) throw new Error("No account was returned by the wallet.");
    updateWalletButton();
    showToast(`Connected ${shortenAccount(accountId)}.`);
  } catch (error) {
    wallet = undefined;
    accountId = "";
    updateWalletButton();
    showToast(error?.message || "Wallet connection was cancelled.", "error");
  }
}

connector.on("wallet:signIn", async (event) => {
  try {
    wallet = await connector.wallet();
    accountId = event.accounts?.[0]?.accountId ?? (await wallet.getAccounts())?.[0]?.accountId ?? "";
    updateWalletButton();
  } catch (error) {
    console.warn("Could not restore connected wallet", error);
  }
});
connector.on("wallet:signOut", () => {
  wallet = undefined;
  accountId = "";
  updateWalletButton();
});

async function restoreWallet() {
  try {
    const current = await connector.wallet();
    const accounts = await current?.getAccounts?.();
    if (accounts?.[0]?.accountId) {
      wallet = current;
      accountId = accounts[0].accountId;
    }
  } catch {
    // No saved wallet session is a normal first-visit state.
  }
  updateWalletButton();
}

function parsePoints() {
  const rawLines = document.querySelector("#points-input").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (rawLines.length < 3 || rawLines.length > 40) throw new Error("Enter between 3 and 40 coordinate pairs.");
  return rawLines.map((line, index) => {
    const match = line.match(/^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/);
    if (!match) throw new Error(`Line ${index + 1} should look like 12,34.`);
    const x = Number(match[1]);
    const y = Number(match[2]);
    if (Math.abs(x) > 10000 || Math.abs(y) > 10000) throw new Error("Coordinates must be between -10000 and 10000.");
    return { x, y };
  });
}

function dist(a, b) {
  return Math.floor(Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2));
}

function tourScore(points, route) {
  return route.reduce((sum, point, i) => sum + dist(points[point], points[route[(i + 1) % route.length]]), 0);
}

function browserSolve(points) {
  const n = points.length;
  let best;
  for (let start = 0; start < n; start += 1) {
    const route = [start];
    const remaining = new Set(Array.from({ length: n }, (_, i) => i).filter((i) => i !== start));
    while (remaining.size) {
      const current = route.at(-1);
      const next = [...remaining].sort((a, b) => dist(points[current], points[a]) - dist(points[current], points[b]) || a - b)[0];
      route.push(next);
      remaining.delete(next);
    }
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 1; i < n - 1; i += 1) {
        for (let k = i + 1; k < n; k += 1) {
          const [a, b] = [route[i - 1], route[i]];
          const [c, d] = [route[k], route[(k + 1) % n]];
          if (dist(points[a], points[c]) + dist(points[b], points[d]) < dist(points[a], points[b]) + dist(points[c], points[d])) {
            route.splice(i, k - i + 1, ...route.slice(i, k + 1).reverse());
            improved = true;
          }
        }
      }
    }
    const score = tourScore(points, route);
    if (!best || score < best.score) best = { route: [...route], score };
  }
  return best;
}

function deadlineLabel(deadlineNs) {
  const deadlineMs = Number(deadlineNs) / 1_000_000;
  if (!Number.isFinite(deadlineMs)) return "—";
  if (deadlineMs <= Date.now()) return "Deadline passed";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(deadlineMs));
}

function renderChallenge(challenge) {
  const isOpen = challenge.status === "open";
  const points = challenge.points ?? [];
  const best = challenge.best;
  const canFinalize = isOpen && Number(challenge.deadline_ns) <= Date.now() * 1_000_000;
  const canClaim = challenge.status === "finalized" && challenge.payout_status === "unclaimed" && challenge.payout_recipient === accountId;
  const card = document.createElement("article");
  card.className = "challenge-card";
  card.innerHTML = `
    <div class="challenge-top"><span class="challenge-id">BOUNTY <b>#${challenge.id}</b></span><span class="status-chip ${isOpen ? "status-open" : "status-closed"}"><i></i>${isOpen ? "LIVE" : "SETTLED"}</span></div>
    <div class="challenge-main"><div><span class="challenge-label">NET REWARD</span><strong class="reward-amount">${formatNear(challenge.bounty_yocto)} <small>NEAR</small></strong></div><div class="deadline-box"><span class="challenge-label">${isOpen ? "DEADLINE" : "STATE"}</span><strong>${isOpen ? escapeHtml(deadlineLabel(challenge.deadline_ns)) : escapeHtml(challenge.payout_status)}</strong></div></div>
    <div class="challenge-meta"><span>${points.length} points</span><span>${challenge.submission_count} submission${challenge.submission_count === 1 ? "" : "s"}</span><span>storage reserve ${formatNear(challenge.storage_reserve_yocto)} NEAR</span><span>by ${escapeHtml(shortenAccount(challenge.creator))}</span></div>
    <div class="best-panel"><div><span class="challenge-label">CURRENT BEST</span><strong>${best ? `${best.score.toLocaleString()} <small>UNITS</small>` : "No valid route yet"}</strong></div><span class="best-solver">${best ? escapeHtml(shortenAccount(best.solver)) : "Waiting for a solver"}</span></div>
    ${isOpen ? `<div class="solver-tools"><button class="quiet-button solve-button" type="button">Generate candidate <span>↗</span></button><textarea class="route-input" rows="2" aria-label="Candidate route" placeholder="Paste route indices, e.g. 0,1,2,3">${best ? escapeHtml(best.route.join(",")) : ""}</textarea><button class="button button-secondary submit-button" type="button">Submit route <span>↗</span></button><p class="inline-feedback" role="status"></p></div>` : `<div class="settled-note"><span>PAYOUT</span><strong>${escapeHtml(shortenAccount(challenge.payout_recipient ?? "—"))}</strong><span>${escapeHtml(challenge.payout_status)}</span></div>`}
    <div class="challenge-actions">${canFinalize ? `<button class="button button-secondary finalize-button" type="button">Finalize challenge <span>↗</span></button>` : ""}${canClaim ? `<button class="button button-primary claim-button" type="button">Claim payout <span>↗</span></button>` : ""}</div>
  `;
  if (isOpen) {
    card.querySelector(".solve-button").addEventListener("click", () => {
      try {
        const candidate = browserSolve(points);
        card.querySelector(".route-input").value = candidate.route.join(",");
        card.querySelector(".inline-feedback").textContent = `Candidate score: ${candidate.score.toLocaleString()} units. The contract will recompute it.`;
      } catch (error) {
        card.querySelector(".inline-feedback").textContent = error.message;
      }
    });
    card.querySelector(".submit-button").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const feedback = card.querySelector(".inline-feedback");
      try {
        const route = card.querySelector(".route-input").value.split(/[\s,]+/).filter(Boolean).map(Number);
        if (route.some((value) => !Number.isInteger(value))) throw new Error("Route must be comma-separated integer indices.");
        button.disabled = true;
        feedback.textContent = "Confirm the transaction in your wallet…";
        await sendCall("submit_solution", { challenge_id: challenge.id, route });
        showToast("Route submitted. Score is now computed on-chain.");
        await refresh();
      } catch (error) {
        feedback.textContent = error?.message || "Submission failed.";
        showToast(error?.message || "Submission failed.", "error");
      } finally {
        button.disabled = false;
      }
    });
  }
  card.querySelector(".finalize-button")?.addEventListener("click", async (event) => {
    try {
      event.currentTarget.disabled = true;
      await sendCall("finalize", { challenge_id: challenge.id });
      showToast("Challenge finalized. The winner can now claim the bounty.");
      await refresh();
    } catch (error) {
      showToast(error?.message || "Finalization failed.", "error");
      event.currentTarget.disabled = false;
    }
  });
  card.querySelector(".claim-button")?.addEventListener("click", async (event) => {
    try {
      event.currentTarget.disabled = true;
      await sendCall("claim_payout", { challenge_id: challenge.id });
      showToast("Payout requested. Wait for the transfer callback, then refresh.");
      setTimeout(refresh, 5000);
    } catch (error) {
      showToast(error?.message || "Payout failed.", "error");
      event.currentTarget.disabled = false;
    }
  });
  return card;
}

async function refresh() {
  if (!CONTRACT_ID) {
    configState.textContent = "Contract not deployed yet. Set VITE_CONTRACT_ID in web/.env.local after deploying the testnet contract.";
    configState.classList.remove("hidden");
    return;
  }
  configState.classList.add("hidden");
  challengeList.replaceChildren();
  challengeList.innerHTML = '<div class="loading-row"><span></span> Reading the contract…</div>';
  try {
    const count = Number(await callView("get_challenge_count"));
    document.querySelector("#metric-count").textContent = count.toString().padStart(2, "0");
    const fromId = Math.max(1, count - 11);
    const challenges = count ? await callView("get_challenges", { from_id: fromId, limit: Math.min(12, count) }) : [];
    document.querySelector("#metric-open").textContent = challenges.filter((challenge) => challenge.status === "open").length.toString().padStart(2, "0");
    challengeList.replaceChildren(...challenges.map(renderChallenge).reverse());
    emptyState.classList.toggle("hidden", challenges.length > 0);
    if (!challenges.length) challengeList.replaceChildren();
  } catch (error) {
    challengeList.replaceChildren();
    configState.textContent = `Could not read ${CONTRACT_ID} on testnet: ${error?.message || "RPC request failed."}`;
    configState.classList.remove("hidden");
  }
}

walletButton.addEventListener("click", connectWallet);
document.querySelector("#refresh-button").addEventListener("click", refresh);
document.querySelector("#create-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  try {
    if (!CONTRACT_ID) throw new Error("Contract is not deployed yet. Set VITE_CONTRACT_ID first.");
    const points = parsePoints();
    const bounty = parseNear(document.querySelector("#bounty-input").value);
    const hours = Number(document.querySelector("#duration-input").value);
    if (!Number.isFinite(hours) || hours < 1 / 60 || hours > 168) throw new Error("Duration must be between 1 minute and 168 hours.");
    const durationSeconds = Math.round(hours * 3600);
    requireWallet();
    button.disabled = true;
    createFeedback.textContent = "Confirm the bounty transaction in your wallet…";
    await sendCall("create_bounty", { points, duration_seconds: durationSeconds }, bounty);
    createFeedback.textContent = "Bounty created. Refreshing the market…";
    showToast("Bounty created and funds locked in the contract.");
    await refresh();
  } catch (error) {
    createFeedback.textContent = error?.message || "Could not create bounty.";
    showToast(error?.message || "Could not create bounty.", "error");
  } finally {
    button.disabled = false;
  }
});

await restoreWallet();
await refresh();
setInterval(refresh, 30_000);
