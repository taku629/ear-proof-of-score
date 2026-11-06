# Proof-of-Score Bounty

**An optimization bounty market where the NEAR contract, not a trusted judge, recomputes each submitted score.**

Post a small Euclidean TSP instance, lock testnet NEAR as a bounty, and invite humans or agents to compete. After the deadline, the best valid route is paid by the contract; an unsolved net bounty is refundable to its creator. A small reserve for permanent contract storage stays in the contract and is not part of the winner payout.

> **Prototype / testnet only.** Never use mainnet funds. The contract proves that a route was scored by this published rule; it does not prove global optimality, honest solver execution, or that a submission came from an AI agent.

## What is implemented

- **Rust smart contract:** bounty creation, deadline enforcement, on-chain route validation and integer score calculation, best-score tracking, permissionless finalization, and winner payout / creator refund. The attached total deposit is split into a net bounty and a storage reserve (measured state size plus a 256-byte buffer); the reserve remains in the contract.
- **Python solver agent:** fetches a challenge from NEAR JSON-RPC or reads local points, then runs multi-start nearest-neighbour + 2-opt. It returns a route for a wallet user to submit; it never stores keys or sends transactions.
- **Web dApp:** testnet wallet connection, challenge market, bounty creation, route generation/submission, finalization and payout claim.
- **Deterministic scoring:** for each edge, `floor(sqrt((x1-x2)^2 + (y1-y2)^2))`; the route includes the return edge to its first point. Lowest total wins. Exact ties keep the first submitted route.

## Run contract tests

Requires Rust 1.95+ (the repository pins 1.97.1) and the `wasm32-unknown-unknown` target for a WASM build.

```bash
cd contract
cargo test
```

The unit tests cover closed-tour scoring, the deterministic tie-break, finalization, empty-challenge refund recipient, and integer square root. They do not replace a testnet integration test for transfers and runtime gas.

## Deploy to NEAR testnet

Use a funded **testnet contract account**; the hackathon's mainnet prize account is separate and must never be used by this prototype. Install Rust if needed, then install [NEAR CLI-RS](https://github.com/near/near-cli-rs) and `cargo-near` using the [official NEAR quickstart](https://docs.near.org/smart-contracts/quickstart). To create a new free testnet account, use `near create-account YOUR_CONTRACT.testnet --use-faucet --network-id testnet`.

```bash
rustup target add wasm32-unknown-unknown

# Build an optimized WASM contract
cd contract
cargo near build non-reproducible-wasm

# Deploy and initialize on testnet
near deploy YOUR_CONTRACT.testnet ./target/near/proof_of_score_bounty.wasm --network-id testnet
near call --use-account YOUR_CONTRACT.testnet --network-id testnet YOUR_CONTRACT.testnet new '{}'
```

You can also run `scripts/deploy-testnet.sh YOUR_CONTRACT.testnet` from the repository root once Rust, `cargo-near`, and `near` CLI-RS are installed. Check your CLI's selected network and account before any transaction. The contract is intended for testnet only.

## Live testnet deployment and verification

- **Contract ID:** `proof-score-bounty-1105.testnet` (NEAR testnet only; faucet-funded demo account, separate from any mainnet prize account).
- **Deploy:** [transaction](https://explorer.testnet.near.org/transactions/J7bbN4wQL1knS7KQVrxwseXe169axprNGQb7Edb9y5NL). **Initialize:** [transaction](https://explorer.testnet.near.org/transactions/21APGbQhsg8Gekg99ymd7WecHMZe2ZBoHNk3Ca7frp1T).
- **Scoring and validation:** a valid route scored 40; a second challenge accepted two submissions and retained the score-40 route over the earlier score-48 route; a duplicate-point route was rejected.
- **Settlement:** both the winning payout and a no-submission creator refund completed. A separate solver, `proof-score-solver-1105.testnet`, was selected and received the challenge-4 payout; its final on-chain status was `paid` ([submit](https://explorer.testnet.near.org/transactions/6wtr5xpnC7a1itrH4KVcHj5erijYEQMFSyTXQZEEY1tV), [claim](https://explorer.testnet.near.org/transactions/ARABnqETCfcUdcWSpzxUTEyZhqKgzEUSoPfqHcVGXQf)). The no-submission refund claim is [here](https://explorer.testnet.near.org/transactions/7upMQvgJvYdkXYH3QdxgQeNzmbRn1Qvp3EvuTDUk6Zes).
- **Deposit accounting:** each 0.1 NEAR test bounty reserved 0.00444 NEAR for permanent storage and exposed 0.09556 NEAR as the net prize. All transactions used testnet.

## Run the web dApp

```bash
cd web
cp .env.example .env.local
# .env.example points to the live testnet demo; edit only when switching contracts.
npm install
npm run dev
```

The app uses [NEAR Connect](https://docs.near.org/web3-apps/tutorials/wallet-login) for testnet wallet signing and `near-api-js` for read-only JSON-RPC calls. Connect a testnet wallet and obtain testnet NEAR from the faucet before creating a bounty.

## Deploy a hosted demo (Render)

The root `render.yaml` configures the `web/` app as a static site and sets the current testnet demo contract ID. After the repository is connected to Render, create the Blueprint; edit that value only when switching to another testnet contract. The RPC URL defaults to NEAR testnet.

Render says static sites are free to deploy, but bandwidth and build minutes count toward your workspace's included usage. Check the [Static Sites guide](https://render.com/docs/static-sites) and [free usage details](https://render.com/docs/free) before publishing.

## Run the Python solver

Solve a local points array:

```bash
python3 solver/solver.py --points-json '[{"x":0,"y":0},{"x":3,"y":4},{"x":6,"y":0}]'
```

Solve a deployed challenge:

```bash
python3 solver/solver.py --contract-id YOUR_CONTRACT.testnet --challenge-id 1
```

Paste the output `route` indices into the open challenge card in the dApp and submit it with the connected testnet wallet. The contract is the source of truth for the official score; the solver's local score is only a convenience.

## Contract rules and limits

| Rule | Value |
|---|---|
| Points per challenge | 3–40 |
| Coordinates | integer `x`, `y` in `[-10000, 10000]` |
| Duration | 60 seconds–7 days |
| Score | Sum of integer-floor Euclidean edge lengths, including return edge |
| Tie-break | First submitted route retains the lead |
| Deadline | Submissions must land before the deadline; finalization is allowed at or after it |
| Storage reserve | Measured challenge state plus 256 bytes; retained in the contract |
| No submissions | Creator becomes the refund recipient for the net bounty |
| Payout | Recipient claims after finalization; failed transfer callback reopens the claim |

## Trust model and known limitations

- The contract checks that a route is a complete permutation and computes its score; a caller cannot submit a lower score than the route actually has. The displayed prize is the attached total deposit minus the storage reserve, which is retained to cover the permanent challenge state and a maximum-size winning route.
- Lowest submitted score is **not necessarily the global optimum**. The first submission wins an exact tie, so there is no tie-claim window or solver reveal phase.
- The contract cannot tell whether a route was produced by AI, a person, or copied from elsewhere. The market rewards the result, not provenance.
- This MVP supports only small closed TSP instances and one current best per challenge. It is not a general-purpose optimization VM.
- Finalization is permissionless, but the authorized recipient must call `claim_payout`; the UI does not pay automatically without an on-chain transaction.
- The linked testnet smoke tests exercised route scoring, invalid-route rejection, best-route replacement, winner payout, no-submission refund, and a distinct solver account receiving a payout. This is not a full security audit and does not cover every edge case.
- A challenge creator cannot cancel or edit a funded bounty. The net bounty remains locked until deadline and settlement; the storage reserve is retained permanently. Treat every testnet deposit as committed.

## 日本語で

NEAR testnet上に最適化問題を登録し、総入金のうち永続ストレージ準備金を除いた額を懸賞金として解答者が巡回路を競うプロトタイプです。Rustコントラクトがルートの妥当性とスコアを再計算し、締切後に最良解へ支払います。提出がなければ作成者へ返金します。Pythonソルバーは複数開始点の最近傍法と2-optで候補を作り、Webアプリからウォレット署名で提出します。

採点ルールは各辺の `floor(√(dx² + dy²))` を足し、最後の点から最初の点へ戻る閉路です。低いほど良く、同点は先着優先です。コントラクトが証明するのは「公開ルールでそのルートを採点した」ことまでで、全体最適性やAIが解いたことまでは証明しません。現在の実装は3〜40点、整数座標、1分〜7日、testnet専用です。mainnet資金は絶対に使わないでください。

稼働中のtestnetデモ契約は `proof-score-bounty-1105.testnet` です。別アカウントからの提出・受取、勝者払出し、未提出時返金まで確認済みです。トランザクションは上の「Live testnet deployment and verification」に記載しています。

## License

MIT. See [LICENSE](./LICENSE).
