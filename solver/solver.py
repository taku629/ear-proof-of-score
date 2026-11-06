#!/usr/bin/env python3
"""Build deterministic TSP candidates for Proof-of-Score Bounty.

The live NEAR contract accepts 3–40 points. Local practice input may use up to
2,000 points; those larger routes are explicitly off-chain only. This solver
never holds a wallet key or sends a transaction.
"""
from __future__ import annotations

import argparse
import array
import base64
import heapq
import json
import math
import sys
import time
import urllib.request
from typing import Any

DEFAULT_RPC = "https://rpc.testnet.near.org"
MIN_POINTS = 3
MAX_ONCHAIN_POINTS = 40
MAX_PRACTICE_POINTS = 2_000
MAX_COORD = 10_000
PRACTICE_STARTS = 8
PRACTICE_NEIGHBORS = 16
PRACTICE_TWO_OPT_PASSES = 20
PRACTICE_MOVES_PER_PASS = 64


def distance(a: dict[str, int], b: dict[str, int]) -> int:
    """Match the contract's integer-floor Euclidean distance exactly."""
    return math.isqrt((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2)


def route_score(points: list[dict[str, int]], route: list[int]) -> int:
    return sum(distance(points[route[i]], points[route[(i + 1) % len(route)]]) for i in range(len(route)))


def _validate_points(points: list[dict[str, int]]) -> None:
    if not MIN_POINTS <= len(points) <= MAX_PRACTICE_POINTS:
        raise ValueError(f"Local solver accepts {MIN_POINTS} to {MAX_PRACTICE_POINTS:,} points; the deployed contract accepts at most {MAX_ONCHAIN_POINTS}.")
    for index, point in enumerate(points):
        x, y = point.get("x"), point.get("y")
        if (not isinstance(x, int) or isinstance(x, bool) or not isinstance(y, int) or isinstance(y, bool)
                or abs(x) > MAX_COORD or abs(y) > MAX_COORD):
            raise ValueError(f"Point {index} must have integer coordinates between -{MAX_COORD} and {MAX_COORD}.")


def two_opt(points: list[dict[str, int]], route: list[int]) -> list[int]:
    """Improve a small, on-chain-compatible closed tour to a 2-opt local optimum."""
    route = route[:]
    improved = True
    while improved:
        improved = False
        n = len(route)
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


def _distance_matrix(points: list[dict[str, int]]) -> array.array:
    """Store exact integer edge lengths compactly (all fit in an unsigned short)."""
    n = len(points)
    typecode = "H" if array.array("H").itemsize == 2 else "I"
    matrix = array.array(typecode, [0]) * (n * n)
    for i in range(n):
        row_i = i * n
        for j in range(i + 1, n):
            value = distance(points[i], points[j])
            matrix[row_i + j] = value
            matrix[j * n + i] = value
    return matrix


def _matrix_score(matrix: array.array, n: int, route: list[int]) -> int:
    return sum(matrix[route[i] * n + route[(i + 1) % n]] for i in range(n))


def _nearest_neighbor_route(matrix: array.array, n: int, start: int) -> list[int]:
    visited = bytearray(n)
    route = [start]
    visited[start] = 1
    for _ in range(1, n):
        current = route[-1]
        row = current * n
        best = -1
        best_distance = math.inf
        for candidate in range(n):
            if visited[candidate]:
                continue
            candidate_distance = matrix[row + candidate]
            if candidate_distance < best_distance or (candidate_distance == best_distance and (best < 0 or candidate < best)):
                best = candidate
                best_distance = candidate_distance
        route.append(best)
        visited[best] = 1
    return route


def _nearest_neighbor_lists(matrix: array.array, n: int, limit: int) -> list[list[int]]:
    width = min(limit, n - 1)
    result = []
    for city in range(n):
        row = city * n
        result.append(heapq.nsmallest(width, (other for other in range(n) if other != city),
                                      key=lambda other: (matrix[row + other], other)))
    return result


def _bounded_two_opt(matrix: array.array, n: int, initial: list[int], neighbors: list[list[int]]) -> tuple[list[int], int, int]:
    route = initial[:]
    positions = [0] * n
    for index, city in enumerate(route):
        positions[city] = index
    total_moves = 0
    passes = 0
    for _ in range(PRACTICE_TWO_OPT_PASSES):
        passes += 1
        moves = 0
        changed = False
        for i in range(n - 2):
            a, b = route[i], route[i + 1]
            row_a = a * n
            row_b = b * n
            for c in neighbors[a]:
                k = positions[c]
                if k <= i + 1:
                    continue
                d = route[(k + 1) % n]
                old = matrix[row_a + b] + matrix[c * n + d]
                new = matrix[row_a + c] + matrix[row_b + d]
                if new >= old:
                    continue
                route[i + 1 : k + 1] = reversed(route[i + 1 : k + 1])
                for position in range(i + 1, k + 1):
                    positions[route[position]] = position
                changed = True
                moves += 1
                total_moves += 1
                break
            if moves >= PRACTICE_MOVES_PER_PASS:
                break
        if not changed:
            break
    return route, passes, total_moves


def solve(points: list[dict[str, int]]) -> dict[str, Any]:
    """Solve a candidate route; instances over 40 cities are offline-only."""
    _validate_points(points)
    started = time.perf_counter()
    n = len(points)
    if n <= MAX_ONCHAIN_POINTS:
        best_route: list[int] | None = None
        best_score: int | None = None
        all_indices = set(range(n))
        for start in range(n):
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
        return {
            "route": best_route,
            "score": best_score,
            "algorithm": "all-start nearest-neighbour + exhaustive 2-opt",
            "mode": "contract-compatible size (3–40); an open testnet bounty and wallet signature are still required to submit",
            "starts_tested": n,
            "elapsed_ms": round((time.perf_counter() - started) * 1_000),
        }

    matrix = _distance_matrix(points)
    neighbors = _nearest_neighbor_lists(matrix, n, PRACTICE_NEIGHBORS)
    best_route = None
    best_score = math.inf
    baseline_score = math.inf
    total_moves = 0
    total_passes = 0
    for attempt in range(PRACTICE_STARTS):
        start = (attempt * n) // PRACTICE_STARTS
        initial = _nearest_neighbor_route(matrix, n, start)
        baseline_score = min(baseline_score, _matrix_score(matrix, n, initial))
        candidate, passes, moves = _bounded_two_opt(matrix, n, initial, neighbors)
        total_passes += passes
        total_moves += moves
        candidate_score = _matrix_score(matrix, n, candidate)
        if candidate_score < best_score:
            best_route, best_score = candidate, candidate_score
    assert best_route is not None
    return {
        "route": best_route,
        "score": int(best_score),
        "baseline_score": int(baseline_score),
        "improvement_percent": round((baseline_score - best_score) / baseline_score * 100, 2) if baseline_score else 0,
        "algorithm": f"{PRACTICE_STARTS}-start nearest-neighbour + candidate 2-opt ({PRACTICE_NEIGHBORS} neighbours, {PRACTICE_TWO_OPT_PASSES} passes × {PRACTICE_MOVES_PER_PASS} moves max)",
        "mode": "OFFLINE PRACTICE ONLY (>40 cities; cannot be submitted to the deployed contract)",
        "starts_tested": PRACTICE_STARTS,
        "two_opt_moves": total_moves,
        "two_opt_passes_total": total_passes,
        "elapsed_ms": round((time.perf_counter() - started) * 1_000),
    }


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
    parser.add_argument("--points-json", help="Solve a local challenge by passing its points as JSON (up to 2,000 for offline practice)")
    parser.add_argument("--challenge-file", help="Solve a saved ChallengeView JSON file locally")
    args = parser.parse_args()

    if args.points_json:
        result = solve(json.loads(args.points_json))
    elif args.challenge_file:
        with open(args.challenge_file, encoding="utf-8") as file:
            challenge = json.load(file)
        result = solve(challenge["points"])
        result["challenge_id"] = challenge.get("id")
    elif args.contract_id and args.challenge_id:
        challenge = rpc_call(args.rpc, args.contract_id, "get_challenge", {"challenge_id": args.challenge_id})
        if challenge is None:
            raise SystemExit(f"Challenge {args.challenge_id} was not found.")
        if len(challenge["points"]) > MAX_ONCHAIN_POINTS:
            raise SystemExit(f"The deployed contract accepts at most {MAX_ONCHAIN_POINTS} points.")
        result = solve(challenge["points"])
        result["challenge_id"] = challenge["id"]
        result["contract_id"] = args.contract_id
    else:
        parser.error("Use --points-json, --challenge-file, or both --contract-id and --challenge-id.")

    print(json.dumps(result, indent=2))
    if len(result["route"]) > MAX_ONCHAIN_POINTS:
        print("OFFLINE PRACTICE ONLY: routes above 40 cities cannot be submitted to the deployed contract.", file=sys.stderr)
    else:
        print("Paste the `route` indices into a matching open challenge and submit with your NEAR testnet wallet.", file=sys.stderr)


if __name__ == "__main__":
    main()
