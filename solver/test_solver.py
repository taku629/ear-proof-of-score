import random
import unittest

from solver.solver import MAX_ONCHAIN_POINTS, MAX_PRACTICE_POINTS, route_score, solve


def points(count: int, seed: int = 2026) -> list[dict[str, int]]:
    rng = random.Random(seed)
    return [{"x": rng.randint(-10_000, 10_000), "y": rng.randint(-10_000, 10_000)} for _ in range(count)]


class SolverTests(unittest.TestCase):
    def test_score_matches_contract_integer_floor_closed_tour(self) -> None:
        example = [{"x": 0, "y": 0}, {"x": 3, "y": 4}, {"x": 6, "y": 0}]
        self.assertEqual(route_score(example, [0, 1, 2]), 16)

    def test_40_points_remain_contract_size_and_return_a_permutation(self) -> None:
        result = solve(points(MAX_ONCHAIN_POINTS))
        self.assertEqual(len(result["route"]), MAX_ONCHAIN_POINTS)
        self.assertEqual(len(set(result["route"])), MAX_ONCHAIN_POINTS)
        self.assertEqual(result["score"], route_score(points(MAX_ONCHAIN_POINTS), result["route"]))
        self.assertIn("contract-compatible", result["mode"])

    def test_41_points_are_explicitly_offline_only_and_deterministic(self) -> None:
        sample = points(41)
        first = solve(sample)
        second = solve(sample)
        self.assertEqual(first["route"], second["route"])
        self.assertEqual(first["score"], second["score"])
        self.assertEqual(first["score"], route_score(sample, first["route"]))
        self.assertLessEqual(first["score"], first["baseline_score"])
        self.assertEqual(len(set(first["route"])), 41)
        self.assertIn("OFFLINE PRACTICE ONLY", first["mode"])

    def test_local_solver_rejects_more_than_2000_points_and_bad_coordinates(self) -> None:
        large_result = solve(points(MAX_PRACTICE_POINTS, seed=9))
        self.assertEqual(len(large_result["route"]), MAX_PRACTICE_POINTS)
        self.assertEqual(len(set(large_result["route"])), MAX_PRACTICE_POINTS)
        self.assertLessEqual(large_result["score"], large_result["baseline_score"])
        self.assertIn("OFFLINE PRACTICE ONLY", large_result["mode"])
        with self.assertRaisesRegex(ValueError, "2,000"):
            solve(points(MAX_PRACTICE_POINTS + 1))
        with self.assertRaisesRegex(ValueError, "integer coordinates"):
            solve([{"x": 0, "y": 0}, {"x": 1.5, "y": 1}, {"x": 2, "y": 3}])
        with self.assertRaisesRegex(ValueError, "integer coordinates"):
            solve([{"x": 0, "y": 0}, {"x": 1, "y": 1}, {"x": 10_001, "y": 2}])


if __name__ == "__main__":
    unittest.main()
