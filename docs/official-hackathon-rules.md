# NEAR HACKATHON — official submission checklist

Checked against the organizer's official site and its `HACKATHON.md` on 2026-11-06. Re-check the live rules immediately before submission because the organizer may update dates or instructions.

## Deadline and order

The development window ends **2026-11-14 23:59 UTC = 2026-11-15 08:59 JST**. There is no advance registration. Before submitting, publish the repository and the public X demo post. The organizer allows **one submission per project and it cannot be edited directly**. If a saved submission contains an error, the human requests a correction through the organizer's request-changes page; do not submit the project a second time.

## Required project links and post

The submission requires a public repository URL and a public X demo-post URL. The human publishes the post themselves. It must say the project was built at NEAR HACKATHON, tag `@NEARProtocol` and include `#NEARHackathon`, with a demo video or screenshots attached. The official agent guide warns that screenshots alone are not enough when judges cannot open the demo; a hosted demo is a plus. The current app is being hosted on GitHub Pages and uses NEAR testnet only.

## Values the human must decide or confirm

Before building the final payload, get the human's exact choices for:

- Project name (2–80 characters).
- Team lead name (2–80 characters), contact email (valid, at most 160 characters), and team size (`1`, `2 - 4`, `4 - 6`, `6 - 8`, or `8+`).
- One or more accurate track IDs: `agents` (Agent Economy), `swarms` (AI Swarms), `open` (Open Innovation), or another relevant official ID. Every selected track must fit the actual build. The current prototype most directly fits `agents` and `open`; independent solvers compete rather than coordinate as a swarm.
- A **mainnet** NEAR payout address, created by the human in a NEAR wallet. Never create or invent this address on the human's behalf; never use it in the testnet demo.
- Public repository URL, public X demo-post URL, and project description (20–2,000 characters).
- Explicit consent to the exact notice below.

> I agree that the organizers may use these details to review our submission and contact us about this hackathon.

## Submission API safety

The official endpoint is `POST https://nearhackathon.com/api/applications`, with exactly `requestId`, `projectName`, `leadName`, `email`, `size`, `tracks`, `nearAddress`, `projectUrl`, `demoUrl`, `idea`, and `consent`. Do not add `website` (it is a spam trap), extra keys, or a payload file to the repository. Generate one UUID request ID only after the final payload is approved; if an approved request returns a retryable `503` or has an ambiguous network result, reuse that same request ID. A `201` means saved. Do not retry after a `403`; do not work around a `409` by changing the repository or email. Only send after the human has seen the complete exact JSON and explicitly said yes.

## Relevant official sources

- [NEAR HACKATHON submission form and tracks](https://nearhackathon.com/)
- [Organizer's HACKATHON.md: fields, rules, API, and agent workflow](https://nearhackathon.com/HACKATHON.md)
- [NEAR Protocol announcement](https://x.com/NEARProtocol/status/2112257967818997891?lang=en)
- [Correction-request page](https://nearhackathon.com/request-changes)
