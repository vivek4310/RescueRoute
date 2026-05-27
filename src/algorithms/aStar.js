/**
 * A* Algorithm — OSM graph version
 * Time:  O(E log V)
 * Space: O(V)
 *
 * Uses real haversine distance as the admissible heuristic.
 * heuristic(aId, bId) is injected from useAlgorithm so it has
 * access to graphNodes coordinates without importing them here.
 */
export function aStar(adj, startId, endId, getEffectiveWeight, heuristic) {
  startId = String(startId);
  endId = String(endId);
  const gScore  = {};
  const parent  = {};
  const visited = [];
  const openSet = new Map();
  const closed  = new Set();

  for (const id in adj) { gScore[id] = Infinity; parent[id] = null; }
  gScore[startId] = 0;
  openSet.set(startId, { g: 0, f: heuristic(startId, endId) });

  while (openSet.size > 0) {
    // Pick node with lowest f score
    let cur = null, best = Infinity;
    for (const [id, v] of openSet) {
      if (v.f < best) { best = v.f; cur = id; }
    }
    if (!cur) break;

    const { g } = openSet.get(cur);
    openSet.delete(cur);
    closed.add(cur);
    visited.push(cur);

    if (cur === endId) break;

    for (const nb of (adj[cur] || [])) {
      if (closed.has(nb.id)) continue;
      const w = getEffectiveWeight(nb.id, nb.weight);
      if (w === Infinity) continue;
      const ng = g + w;
      if (!openSet.has(nb.id) || ng < openSet.get(nb.id).g) {
        parent[nb.id] = cur;
        gScore[nb.id] = ng;
        openSet.set(nb.id, { g: ng, f: ng + heuristic(nb.id, endId) });
      }
    }
  }

  return {
    visited,
    path: reconstructPath(parent, startId, endId),
    cost: gScore[endId] ?? Infinity,
  };
}

function reconstructPath(parent, startId, endId) {
  const path = [];
  let cur = endId;
  while (cur !== null) {
    path.unshift(cur);
    if (cur === startId) {
      return path;
    }
    cur = parent[cur];
  }
  return [];
}
