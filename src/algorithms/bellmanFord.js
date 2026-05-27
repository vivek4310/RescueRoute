/**
 * Bellman-Ford Algorithm — OSM graph version
 * Time:  O(V × E)
 * Space: O(V)
 *
 * Relaxes all edges up to V-1 times.
 * Much slower than Dijkstra/A* on large graphs — demonstrates the trade-off.
 * Capped at 200 iterations for UI performance on the Kolkata graph.
 */
export function bellmanFord(adj, startId, endId, getEffectiveWeight) {
  startId = String(startId);
  endId = String(endId);
  const dist    = {};
  const parent  = {};
  const visited = [];
  const visitedSet = new Set();

  for (const id in adj) { dist[id] = Infinity; parent[id] = null; }
  dist[startId] = 0;

  // Flatten adjacency list into edge array once
  const allEdges = [];
  for (const u in adj) {
    for (const nb of (adj[u] || [])) {
      allEdges.push({ u, v: nb.id, baseWeight: nb.weight });
    }
  }

  const maxIter = Math.min(Object.keys(adj).length - 1, 200);

  for (let i = 0; i < maxIter; i++) {
    let updated = false;
    for (const { u, v, baseWeight } of allEdges) {
      if (dist[u] === Infinity) continue;
      const w = getEffectiveWeight(v, baseWeight);
      if (w === Infinity) continue;
      const nd = dist[u] + w;
      if (nd < dist[v]) {
        dist[v] = nd;
        parent[v] = u;
        updated = true;
        if (!visitedSet.has(v)) {
          visitedSet.add(v);
          visited.push(v);
        }
      }
    }
    if (!updated) break; // early exit if converged
  }

  return {
    visited,
    path: reconstructPath(parent, startId, endId),
    cost: dist[endId] ?? Infinity,
  };
}

function reconstructPath(parent, startId, endId) {
  if (parent[endId] === undefined && endId !== startId) return [];
  const path = [];
  let cur = endId;
  const seen = new Set();
  while (cur !== null && cur !== undefined) {
    if (seen.has(cur)) break;
    seen.add(cur);
    path.unshift(cur);
    cur = parent[cur];
  }
  return path[0] === startId ? path : [];
}
