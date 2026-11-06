# Testnet verification

## Deployed contract

- Contract: `proof-score-bounty-1105.testnet`
- Network: NEAR testnet only
- Deployment transaction: [Explorer](https://explorer.testnet.near.org/transactions/J7bbN4wQL1knS7KQVrxwseXe169axprNGQb7Edb9y5NL)
- Initialization transaction: [Explorer](https://explorer.testnet.near.org/transactions/21APGbQhsg8Gekg99ymd7WecHMZe2ZBoHNk3Ca7frp1T)

## What passed

- A valid 4-point closed tour was scored on-chain as 40.
- A route with score 48 was replaced by a better route with score 40. A route with a duplicate point was rejected; the final state showed two accepted submissions and the score-40 route as best.
- After the deadline, the best solver was frozen as the recipient and successfully claimed the net bounty.
- With no submissions, the creator was selected as the refund recipient and successfully claimed the net bounty.
- A separate account, `proof-score-solver-1105.testnet`, submitted a route, was selected as the recipient after finalization, and successfully claimed the bounty. Its on-chain challenge state reported `payout_status: paid`. [Submission transaction](https://explorer.testnet.near.org/transactions/6wtr5xpnC7a1itrH4KVcHj5erijYEQMFSyTXQZEEY1tV) · [Claim transaction](https://explorer.testnet.near.org/transactions/ARABnqETCfcUdcWSpzxUTEyZhqKgzEUSoPfqHcVGXQf)
- For each 0.1 NEAR deposit, the contract retained a 0.00444 NEAR storage reserve and exposed 0.09556 NEAR as the net bounty.
- The web app’s production build succeeded with the live contract ID; a headless browser loaded the app and read all three initial on-chain challenges.

## Scope note

The test accounts were faucet-funded testnet accounts; their keys are not part of the project source or archive. No mainnet funds or prize-receiving account were used. These checks are integration smoke tests, not a security audit.
