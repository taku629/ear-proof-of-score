#!/usr/bin/env python3
"""Build a strong deterministic TSP candidate for Proof-of-Score Bounty.

The solver only proposes a route. The NEAR contract validates the permutation and
recomputes the score on-chain; this script never holds a wallet key or sends funds.
"""
from __future__ import annotations

import argparse
import base64
import json
import math
import sys
import urllib.request
from typing import Any

DEFAULT_RPC = "https://rpc.testnet.near.org"


def distance(a: dict[str, int], b: dict[str, int]) -> int:
    """Match the contract's integer-floor Euclidean distance exactly."""
    return math.isqrt((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2)


def route_score(points: list[dict[str, int]], route: list[int]) -> int:
    return sum(distance(points[route[i]], points[route[(i + 1) % len(route)]]) for i in range(len(route)))


def two_opt(points: list[dict[str, int]], route: list[int]) -> list[int]:
    """Improve a closed tour with deterministic 2-opt edge swaps."""
    route = route[:]
    improved = True
    while improved:
        improved = False
        n = len(route)
        # Keep index zero fixed; a tour is rotationally equivalent.
        for i in range(1, n - 1):
            for k in range(i + 1, n):
                a, b = route[i - 1], route[i]
                c, d = route[k], route[(k + 1) % n]
                old = distance(points[a], points[b]) + distance(points[c], points[d])
                new = distance(points[a], points[c]) + distance(points[b], points[d])
                if new < old:
                    route[i : k + 1] = reversed(route[i : k + 1])
                    improved = True
    return route


def solve(points: list[dict[str, int]]) -> dict[str, Any]:
    if not 3 <= len(points) <= 40:
        raise ValueError("This contract supports 3 to 40 points.")
    # Run nearest-neighbour from every start and retain the best 2-opt local optimum.
    best_route: list[int] | None = None
    best_score: int | None = None
    all_indices = set(range(len(points)))
    for start in range(len(points)):
        route = [start]
        unvisited = all_indices - {start}
        while unvisited:
            current = route[-1]
            nxt = min(unvisited, key=lambda index: (distance(points[current], points[index]), index))
            route.append(nxt)
            unvisited.remove(nxt)
        route = two_opt(points, route)
        score = route_score(points, route)
        if best_score is None or score < best_score:
            best_route, best_score = route, score
    assert best_route is not None and best_score is not None
    return {"route": best_route, "score": best_score, "algorithm": "multi-start nearest-neighbour + 2-opt"}


def rpc_call(rpc: str, contract_id: str, method: str, args: dict[str, Any]) -> Any:
    payload = {
        "jsonrpc": "2.0",
        "id": "proof-of-score-solver",
        "method": "query",
        "params": {
            "request_type": "call_function",
            "finality": "final",
            "account_id": contract_id,
            "method_name": method,
            "args_base64": base64.b64encode(json.dumps(args, separators=(",", ":")).encode()).decode(),
        },
    }
    request = urllib.request.Request(
        rpc,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.loads(response.read())
    if "error" in result:
        raise RuntimeError(result["error"].get("message", str(result["error"])))
    return json.loads(bytes(result["result"]["result"]).decode())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract-id", help="Deployed testnet contract, e.g. bounty.testnet")
    parser.add_argument("--challenge-id", type=int, help="Challenge ID to fetch from the contract")
    parser.add_argument("--rpc", default=DEFAULT_RPC, help=f"NEAR JSON-RPC URL (default: {DEFAULT_RPC})")
    parser.add_argument("--points-json", help="Solve a local challenge by passing its points as JSON")
    parser.add_argument("--challenge-file", help="Solve a saved ChallengeView JSON file")
    args = parser.parse_args()

    if args.points_json:
        points = json.loads(args.points_json)
        result = solve(points)
    elif args.challenge_file:
        with open(args.challenge_file, encoding="utf-8") as file:
            challenge = json.load(file)
        points = challenge["points"]
        result = solve(points)
        result["challenge_id"] = challenge.get("id")
    elif args.contract_id and args.challenge_id:
        challenge = rpc_call(args.rpc, args.contract_id, "get_challenge", {"challenge_id": args.challenge_id})
        if challenge is None:
            raise SystemExit(f"Challenge {args.challenge_id} was not found.")
        result = solve(challenge["points"])
        result["challenge_id"] = challenge["id"]
        result["contract_id"] = args.contract_id
    else:
        parser.error("Use --points-json, --challenge-file, or both --contract-id and --challenge-id.")

    print(json.dumps(result, indent=2))
    print("\nPaste the `route` indices into the dApp and submit with your NEAR wallet.", file=sys.stderr)


if __name__ == "__main__":
    main()
