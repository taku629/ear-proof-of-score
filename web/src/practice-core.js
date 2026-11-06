const MAX_PRACTICE_POINTS = 2_000;
const DEFAULT_STARTS = 8;
const DEFAULT_NEIGHBORS = 16;
const DEFAULT_TWO_OPT_PASSES = 20;
const COORD_LIMIT = 10_000;

function floorSqrt(value) {
  let root = Math.floor(Math.sqrt(value));
  while ((root + 1) * (root + 1) <= value) root += 1;
  while (root * root > value) root -= 1;
  return root;
}

export function integerDistance(a, b) {
  return floorSqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function tourScore(points, route) {
  if (route.length !== points.length) throw new Error("Route must visit every city exactly once.");
  let total = 0;
  for (let i = 0; i < route.length; i += 1) {
    total += integerDistance(points[route[i]], points[route[(i + 1) % route.length]]);
  }
  return total;
}

export function generatePracticePoints(count, seed = 0x5eed1234) {
  if (!Number.isInteger(count) || count < 3 || count > MAX_PRACTICE_POINTS) {
    throw new Error(`Practice instances must contain 3 to ${MAX_PRACTICE_POINTS} cities.`);
  }
  let state = Number(seed) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  const random = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
  return Array.from({ length: count }, () => ({
    x: Math.floor(random() * (COORD_LIMIT * 2 + 1)) - COORD_LIMIT,
    y: Math.floor(random() * (COORD_LIMIT * 2 + 1)) - COORD_LIMIT,
  }));
}

function buildDistanceMatrix(points) {
  const n = points.length;
  if (n < 3 || n > MAX_PRACTICE_POINTS) {
    throw new Error(`Practice instances must contain 3 to ${MAX_PRACTICE_POINTS} cities.`);
  }
  for (const [index, point] of points.entries()) {
    if (!Number.isInteger(point?.x) || !Number.isInteger(point?.y)
      || Math.abs(point.x) > COORD_LIMIT || Math.abs(point.y) > COORD_LIMIT) {
      throw new Error(`City ${index + 1} must have integer coordinates between -${COORD_LIMIT} and ${COORD_LIMIT}.`);
    }
  }
  const matrix = new Uint16Array(n * n);
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const distance = integerDistance(points[i], points[j]);
      matrix[i * n + j] = distance;
      matrix[j * n + i] = distance;
    }
  }
  return matrix;
}

function nearestNeighborRoute(matrix, n, start) {
  const visited = new Uint8Array(n);
  const route = new Array(n);
  route[0] = start;
  visited[start] = 1;
  for (let position = 1; position < n; position += 1) {
    const current = route[position - 1];
    let next = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    const row = current * n;
    for (let candidate = 0; candidate < n; candidate += 1) {
      if (visited[candidate]) continue;
      const distance = matrix[row + candidate];
      if (distance < bestDistance || (distance === bestDistance && candidate < next)) {
        bestDistance = distance;
        next = candidate;
      }
    }
    route[position] = next;
    visited[next] = 1;
  }
  return route;
}

function nearestNeighborLists(matrix, n, neighborLimit) {
  const width = Math.min(neighborLimit, n - 1);
  const lists = new Uint16Array(n * width);
  for (let city = 0; city < n; city += 1) {
    const candidates = new Uint16Array(n - 1);
    let cursor = 0;
    for (let candidate = 0; candidate < n; candidate += 1) {
      if (candidate !== city) candidates[cursor++] = candidate;
    }
    const row = city * n;
    candidates.sort((a, b) => matrix[row + a] - matrix[row + b] || a - b);
    for (let rank = 0; rank < width; rank += 1) lists[city * width + rank] = candidates[rank];
  }
  return { lists, width };
}

function improveTwoOpt(matrix, n, initialRoute, nearest, maxPasses, maxMovesPerPass) {
  const route = initialRoute.slice();
  const positions = new Uint16Array(n);
  for (let index = 0; index < n; index += 1) positions[route[index]] = index;
  let passes = 0;
  let totalMoves = 0;
  const width = nearest.width;

  for (; passes < maxPasses; passes += 1) {
    let changed = false;
    let moves = 0;
    for (let i = 0; i < n - 2; i += 1) {
      const a = route[i];
      const b = route[i + 1];
      const rowA = a * n;
      const rowB = b * n;
      for (let rank = 0; rank < width; rank += 1) {
        const c = nearest.lists[a * width + rank];
        const k = positions[c];
        if (k <= i + 1) continue;
        const d = route[(k + 1) % n];
        const oldDistance = matrix[rowA + b] + matrix[c * n + d];
        const newDistance = matrix[rowA + c] + matrix[rowB + d];
        if (newDistance >= oldDistance) continue;
        for (let left = i + 1, right = k; left < right; left += 1, right -= 1) {
          const leftCity = route[left];
          const rightCity = route[right];
          route[left] = rightCity;
          route[right] = leftCity;
          positions[leftCity] = right;
          positions[rightCity] = left;
        }
        changed = true;
        moves += 1;
        break;
      }
      if (moves >= maxMovesPerPass) break;
    }
    totalMoves += moves;
    if (!changed) {
      passes += 1;
      break;
    }
  }
  return { route, passes, moves: totalMoves };
}

function scoreWithMatrix(matrix, n, route) {
  let total = 0;
  for (let i = 0; i < n; i += 1) total += matrix[route[i] * n + route[(i + 1) % n]];
  return total;
}

export function solvePracticeInstance(points, options = {}) {
  const n = points.length;
  const matrix = buildDistanceMatrix(points);
  const startCount = Math.min(options.starts ?? DEFAULT_STARTS, n);
  const maxPasses = options.maxPasses ?? DEFAULT_TWO_OPT_PASSES;
  const maxMovesPerPass = options.maxMovesPerPass ?? 64;
  const nearest = nearestNeighborLists(matrix, n, options.neighbors ?? DEFAULT_NEIGHBORS);
  let route;
  let score = Number.POSITIVE_INFINITY;
  let baselineScore = Number.POSITIVE_INFINITY;
  let totalPasses = 0;
  let totalMoves = 0;

  for (let attempt = 0; attempt < startCount; attempt += 1) {
    const start = Math.floor((attempt * n) / startCount);
    const initial = nearestNeighborRoute(matrix, n, start);
    baselineScore = Math.min(baselineScore, scoreWithMatrix(matrix, n, initial));
    const improved = improveTwoOpt(matrix, n, initial, nearest, maxPasses, maxMovesPerPass);
    totalPasses += improved.passes;
    totalMoves += improved.moves;
    const candidateScore = scoreWithMatrix(matrix, n, improved.route);
    if (candidateScore < score) {
      route = improved.route;
      score = candidateScore;
    }
  }

  return {
    route,
    score,
    baselineScore,
    improvementPercent: baselineScore === 0 ? 0 : ((baselineScore - score) / baselineScore) * 100,
    startsTested: startCount,
    candidateNeighbors: nearest.width,
    twoOptPassLimit: maxPasses,
    twoOptMoveLimitPerPass: maxMovesPerPass,
    averagePasses: totalPasses / startCount,
    improvements: totalMoves,
  };
}
