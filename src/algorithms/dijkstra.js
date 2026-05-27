/**
 * Dijkstra's Algorithm — OSM graph version
 * Time:  O((V + E) log V)
 * Space: O(V)
 *
 * adj: { nodeId: [{ id, weight, dist }, ...] }
 * getEffectiveWeight(nodeId, baseWeight) → actual cost (accounts for flood/fire/block)
 */
export function dijkstra(adj, startId, endId, getEffectiveWeight) {
  startId = String(startId);
  endId = String(endId);
  const dist     = {};
  const parent   = {};
  const visited  = [];
  const processed = new Set();

  for (const id in adj) { dist[id] = Infinity; parent[id] = null; }
  dist[startId] = 0;

  // Simple min-heap via sorted array  (good enough for ~5k nodes)
  const pq = [[0, startId]];

  while (pq.length > 0) {
    pq.sort((a, b) => a[0] - b[0]);
    const [cost, u] = pq.shift();

    if (processed.has(u)) continue;
    processed.add(u);
    visited.push(u);

    if (u === endId) break;

    for (const nb of (adj[u] || [])) {
      const w = getEffectiveWeight(nb.id, nb.weight);
      if (w === Infinity) continue;
      const newCost = cost + w;
      if (newCost < dist[nb.id]) {
        dist[nb.id] = newCost;
        parent[nb.id] = u;
        pq.push([newCost, nb.id]);
      }
    }
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
