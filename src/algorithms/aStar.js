/**
 * A* Algorithm — OSM graph version
 * Time:  O(E log V)
 * Space: O(V)
 *
 * FIX: replaced linear scan of openSet (O(n) per step) with a MinHeap (O(log n)).
 * gScore is now a plain Map for O(1) lookup instead of iterating the openSet.
 */
import { MinHeap } from './minHeap';

export function aStar(adj, startId, endId, getEffectiveWeight, heuristic) {
  const gScore  = new Map();
  const parent  = {};
  const visited = [];
  const closed  = new Set();

  for (const id in adj) { gScore.set(id, Infinity); parent[id] = null; }
  gScore.set(startId, 0);

  const pq = new MinHeap();
  pq.push(heuristic(startId, endId), startId);

  while (pq.size > 0) {
    const { value: cur } = pq.pop();

    if (closed.has(cur)) continue;
    closed.add(cur);
    visited.push(cur);

    if (cur === endId) break;

    const g = gScore.get(cur) ?? Infinity;

    for (const nb of (adj[cur] || [])) {
      if (closed.has(nb.id)) continue;
      const w = getEffectiveWeight(nb.id, nb.weight);
      if (w === Infinity) continue;
      const ng = g + w;
      if (ng < (gScore.get(nb.id) ?? Infinity)) {
        parent[nb.id] = cur;
        gScore.set(nb.id, ng);
        pq.push(ng + heuristic(nb.id, endId), nb.id);
      }
    }
  }

  return {
    visited,
    path: reconstructPath(parent, startId, endId),
    cost: gScore.get(endId) ?? Infinity,
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
