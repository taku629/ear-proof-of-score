# Hackathon submission draft — Proof-of-Score Bounty

> **Deadline: November 15, 2026 at 08:59 JST.** The submission is one-time and cannot be edited; do not submit until all fields, links, the demo, and the prize-receiving account are confirmed.

## Project title

**Proof-of-Score Bounty: a trust-minimized optimization market for agents**

## Track fit

Primary: **Agent Economy**. Secondary: **AI Swarms / Open Innovation**.

## Current testnet deployment

Contract: `proof-score-bounty-1105.testnet` (testnet only). The [deployment](https://explorer.testnet.near.org/transactions/J7bbN4wQL1knS7KQVrxwseXe169axprNGQb7Edb9y5NL) and [initialization](https://explorer.testnet.near.org/transactions/21APGbQhsg8Gekg99ymd7WecHMZe2ZBoHNk3Ca7frp1T) are complete. On-chain tests verified score calculation, invalid-route rejection, best-route replacement, winning payout, no-submission refund, and payout to a distinct solver account ([cross-account claim](https://explorer.testnet.near.org/transactions/ARABnqETCfcUdcWSpzxUTEyZhqKgzEUSoPfqHcVGXQf)). No mainnet account or funds are involved.

## Short description

Proof-of-Score Bounty turns small optimization problems into open bounties. A creator posts a Euclidean travelling-salesperson instance and deposits testnet NEAR; a small reserve stays in the contract for permanent storage and the remaining amount is the advertised prize. Human solvers and AI agents submit candidate tours; a Rust contract validates each permutation and recomputes its deterministic integer-distance score on-chain. After the deadline, the best submitted tour can claim the bounty. If nobody submits, the creator can recover the net bounty (the storage reserve remains in the contract). A Python agent uses multi-start nearest-neighbour search and 2-opt, while a wallet-connected web app lets anyone post, solve, submit, settle, and inspect the market.

## What is novel

Most agent-bounty demos rely on an operator or off-chain oracle to decide whether an answer is good. This prototype moves the score rule into the contract: the contract itself checks every city is visited once and computes the complete closed-tour length. That makes the reward condition publicly inspectable and deterministic. The solver is interchangeable; only a better valid score can take the lead.

## Honest limitation

The contract proves that a submitted route received the score dictated by the rule. It does **not** prove a route is globally optimal, that a submitter used AI, or that the challenge has a unique solution. The prototype is testnet-only and limited to 3–40 integer-coordinate points.

## Demo flow (about 90 seconds)

1. Open the dApp and point it at the deployed `.testnet` contract.
2. Connect a NEAR testnet wallet; create a 10-point challenge with a small testnet bounty.
3. Show the challenge's fixed coordinates, deadline, escrow amount, and current best.
4. Run `python3 solver/solver.py --contract-id <contract.testnet> --challenge-id <id>`; paste the candidate route into the card and approve the transaction.
5. Refresh: show that the chain records the submitter and on-chain-computed score.
6. If a second solver is available, submit a better route; point out that a worse route cannot replace the best and a tie keeps the first.
7. For a settled demo instance, finalize after its deadline and show the designated recipient claiming the bounty. Also show the no-submission path returning the bounty to its creator if time permits.

## Suggested video narration

"On most agent markets, somebody trusted has to judge the answer. Proof-of-Score makes the score rule part of the NEAR contract. The creator locks a testnet bounty around a small route-optimization problem. Solvers can be anything — this Python agent is just one baseline. When a route is submitted, the contract checks it is a valid permutation and recomputes the full tour length. After the deadline, the best submitted route can claim the bounty; if nobody solved it, the creator gets the net bounty back (minus the retained storage reserve). This is a prototype: it verifies scoring, not global optimality or AI provenance."

## Submission checklist

- [ ] Public GitHub repository is available and the deployed contract ID is written in the README.
- [ ] The owner creates a separate mainnet NEAR account to receive any prize (the testnet demo must never use this account).
- [x] Contract is initialized on testnet; valid scoring, best-route replacement, and invalid duplicate-route rejection are verified.
- [x] Winning payout and no-submission refund are verified; a distinct solver account also received a payout.
- [x] Frontend production build passes with the live testnet contract configured.
- [ ] Demo recording shows only testnet, includes wallet approval and actual contract state, and avoids exposing secret keys.
- [ ] Final project title, track, repo, demo/video, and X post are reviewed before the one-time submission.
