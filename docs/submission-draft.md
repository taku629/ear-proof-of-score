# Hackathon submission draft — Proof-of-Score Bounty

> **Deadline: 2026-11-14 23:59 UTC / 2026-11-15 08:59 JST.** One submission per project; it cannot be edited directly. Do not submit until the repository, X demo post, mainnet payout account, every human-selected field, and the exact payload are confirmed.

## Project name — proposed, human confirmation required

**Proof-of-Score Bounty: a trust-minimized optimization market for agents**

## Track choice — recommendation, human confirmation required

Recommended: **Agent Economy** (`agents`) and **Open Innovation** (`open`). The market lets independent human or software solvers compete for a bounty, with NEAR enforcing route scoring and settlement. The current product is not a coordinated swarm: solvers compete independently, without a shared coordinator, bidding protocol, or swarm simulation. Select **AI Swarms** (`swarms`) only if the human wants it and is comfortable presenting the project as a competitive multi-agent market rather than a coordinated swarm.

## Public links

- Public repository: https://github.com/taku629/ear-proof-of-score
- Hosted testnet demo: https://taku629.github.io/ear-proof-of-score/ (GitHub Pages deployment in progress)
- Public demo post: pending; the human must publish it on X and provide its URL.

## Current testnet deployment

Contract: `proof-score-bounty-1105.testnet` (testnet only). The [deployment](https://explorer.testnet.near.org/transactions/J7bbN4wQL1knS7KQVrxwseXe169axprNGQb7Edb9y5NL) and [initialization](https://explorer.testnet.near.org/transactions/21APGbQhsg8Gekg99ymd7WecHMZe2ZBoHNk3Ca7frp1T) are complete. On-chain checks verified score calculation, invalid-route rejection, best-route replacement, a winning payout, a no-submission refund, and a distinct solver account receiving a payout ([cross-account claim](https://explorer.testnet.near.org/transactions/ARABnqETCfcUdcWSpzxUTEyZhqKgzEUSoPfqHcVGXQf)). No mainnet account or funds are used by the prototype.

## Short description — proposed, 20–2,000 characters

Proof-of-Score Bounty turns small optimization problems into open bounties. A creator posts a Euclidean travelling-salesperson instance and deposits testnet NEAR; a small reserve stays in the contract for permanent storage and the remainder is the net prize. Human solvers and software agents submit candidate tours. A Rust contract validates each route and recomputes its deterministic integer-distance score on-chain, so no off-chain judge or scoring oracle decides which route is eligible. After the deadline, anyone can finalize the challenge and the best solver can claim the net bounty; if nobody submits, the creator can claim the net bounty back. A Python agent generates routes, while a wallet-connected web app lets users post, solve, submit, settle, and inspect the market. This prototype verifies scoring under its published rule, not global optimality or AI provenance. It runs on NEAR testnet only.

## What is novel

Many agent-bounty demos rely on an operator or off-chain oracle to decide whether an answer is good. This prototype puts the score rule into the NEAR contract: the contract checks that every point appears exactly once and recomputes the complete closed-tour length. That makes the reward condition publicly inspectable and deterministic. Solvers are interchangeable; a better valid score can take the lead.

## Honest limitations

The contract proves that a submitted route received the score dictated by the rule. It does **not** prove a route is globally optimal, that a submitter used AI, or that a challenge has a unique solution. This testnet prototype supports only 3–40 integer-coordinate points. Finalization and payout are explicit transactions: after the deadline, anyone can finalize, and the designated recipient must claim. No payout is made automatically without that transaction.

## Demo recording storyboard (about 45–60 seconds)

1. Show the testnet label and the actual NEAR market screen.
2. Show challenge #3's final state: two submissions, with the on-chain best score at 40.
3. Show challenge #4's settled state, where a distinct solver account is recorded as the paid recipient.
4. Show the bounty creation form; explain that the current four examples are settled and a new testnet bounty is needed to start another challenge.
5. Show the finalization/claim explanation and the project's trust limitation.
6. End with the live demo and repository links. This recording is read-only; it does not show a wallet prompt or initiate a transaction.

## X post draft — the human publishes

> Proof-of-Score Bounty: NEAR contract scores TSP routes. After finalization, the best solver can claim. Testnet prototype: verifies its score rule, not global optimality or AI provenance. Built at NEAR HACKATHON. @NEARProtocol #NEARHackathon
> Demo: https://taku629.github.io/ear-proof-of-score/

Attach the [~49-second demo video](./demo-video.mp4). This post is 270 weighted characters; the user must publish it themselves and send the public X status URL before the final application.

## Submission checklist

- [x] Public repository created and pushed: https://github.com/taku629/ear-proof-of-score
- [x] Contract deployed and initialized on testnet; valid scoring, best-route replacement, and invalid duplicate-route rejection are verified.
- [x] Winning payout and no-submission refund are verified; a distinct solver account also received a payout.
- [x] Frontend production build passed with the live testnet contract configured.
- [ ] GitHub Pages hosted demo is live and verified.
- [x] Demo video is finished: a ~49-second, 1600×900 read-only tour of actual testnet state and the creation form; it includes no wallet prompt, signing, or new transaction.
- [ ] Human publishes the X post and supplies its public URL.
- [ ] Human creates a separate **mainnet** NEAR payout account and supplies only its public address (never a private key or seed phrase).
- [ ] Human confirms project name, lead name, contact email, team size, track IDs, and description.
- [ ] Read the organizer's consent notice verbatim; get explicit consent.
- [ ] Show the complete exact JSON payload and get an explicit yes before the one-time POST.
