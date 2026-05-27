/**
 * Breadth-First Search — OSM graph version
 * Time:  O(V + E)
 * Space: O(V)
 *
 * Ignores edge weights — finds fewest hops.
 * Will happily route through flood/fire zones since it doesn't
 * consider cost, demonstrating the trade-off vs Dijkstra/A*.
 */
export function bfs(adj, startId, endId, getEffectiveWeight) {
  startId = String(startId);
  endId = String(endId);
  const parent  = { [startId]: null };
  const visited = [];
  const queue   = [startId];
  const seen    = new Set([startId]);

  while (queue.length > 0) {
    const u = queue.shift();
    visited.push(u);
    if (u === endId) break;

    for (const nb of (adj[u] || [])) {
      const w = getEffectiveWeight(nb.id, nb.weight);
      if (w === Infinity) continue; // still respects hard blocks
      if (!seen.has(nb.id)) {
        seen.add(nb.id);
        parent[nb.id] = u;
        queue.push(nb.id);
      }
    }
  }

  const path = reconstructPath(parent, startId, endId);

  // Calculate actual weighted cost along the BFS path
  let cost = 0;
  for (let i = 1; i < path.length; i++) {
    const edge = (adj[path[i - 1]] || []).find(e => e.id === path[i]);
    if (edge) cost += getEffectiveWeight(edge.id, edge.weight);
  }

  return { visited, path, cost };
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
