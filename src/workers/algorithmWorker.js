/**
 * algorithmWorker.js
 * ------------------
 * Runs all four pathfinding algorithms on a background thread so the
 * main thread (and therefore the UI) never freezes.
 *
 * PLACE THIS FILE AT:  src/workers/algorithmWorker.js
 *
 * Communication protocol
 * ──────────────────────
 * Main → Worker  postMessage({ type: 'RUN', payload: { adj, nodes, startId, endId, obstacles } })
 * Worker → Main  postMessage({ type: 'RESULT', algoId, result })   (one per algorithm)
 *                postMessage({ type: 'DONE' })                      (after all four)
 *                postMessage({ type: 'ERROR', message })            (on exception)
 *
 * obstacles: { blocked: string[], flood: string[], fire: string[] }
 */

// ─── MinHeap ──────────────────────────────────────────────────────────────────
class MinHeap {
  constructor() { this._h = []; }
  get size() { return this._h.length; }
  push(priority, value) {
    this._h.push({ priority, value });
    this._bubbleUp(this._h.length - 1);
  }
  pop() {
    const top = this._h[0];
    const last = this._h.pop();
    if (this._h.length > 0) { this._h[0] = last; this._siftDown(0); }
    return top;
  }
  _bubbleUp(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._h[p].priority <= this._h[i].priority) break;
      [this._h[p], this._h[i]] = [this._h[i], this._h[p]];
      i = p;
    }
  }
  _siftDown(i) {
    const n = this._h.length;
    while (true) {
      let min = i, l = 2*i+1, r = 2*i+2;
      if (l < n && this._h[l].priority < this._h[min].priority) min = l;
      if (r < n && this._h[r].priority < this._h[min].priority) min = r;
      if (min === i) break;
      [this._h[min], this._h[i]] = [this._h[i], this._h[min]];
      i = min;
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

// ─── Algorithms ───────────────────────────────────────────────────────────────
function dijkstra(adj, startId, endId, getW) {
  const dist      = {};
  const parent    = {};
  const visited   = [];
  const processed = new Set();

  for (const id in adj) { dist[id] = Infinity; parent[id] = null; }
  dist[startId] = 0;

  const pq = new MinHeap();
  pq.push(0, startId);

  while (pq.size > 0) {
    const { priority: cost, value: u } = pq.pop();
    if (processed.has(u)) continue;
    processed.add(u);
    visited.push(u);
    if (u === endId) break;
    for (const nb of (adj[u] || [])) {
      const w = getW(nb.id, nb.weight);
      if (w === Infinity) continue;
      const nc = cost + w;
      if (nc < dist[nb.id]) {
        dist[nb.id] = nc;
        parent[nb.id] = u;
        pq.push(nc, nb.id);
      }
    }
  }
  return { visited, path: reconstructPath(parent, startId, endId), cost: dist[endId] ?? Infinity };
}

function aStar(adj, startId, endId, getW, heuristic) {
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
      const w = getW(nb.id, nb.weight);
      if (w === Infinity) continue;
      const ng = g + w;
      if (ng < (gScore.get(nb.id) ?? Infinity)) {
        parent[nb.id] = cur;
        gScore.set(nb.id, ng);
        pq.push(ng + heuristic(nb.id, endId), nb.id);
      }
    }
  }
  return { visited, path: reconstructPath(parent, startId, endId), cost: gScore.get(endId) ?? Infinity };
}

function bfs(adj, startId, endId, getW) {
  const parent  = { [startId]: null };
  const visited = [];
  const queue   = [startId];
  const seen    = new Set([startId]);

  while (queue.length > 0) {
    const u = queue.shift();
    visited.push(u);
    if (u === endId) break;
    for (const nb of (adj[u] || [])) {
      const w = getW(nb.id, nb.weight);
      if (w === Infinity) continue;
      if (!seen.has(nb.id)) {
        seen.add(nb.id);
        parent[nb.id] = u;
        queue.push(nb.id);
      }
    }
  }
  const path = reconstructPath(parent, startId, endId);
  let cost = 0;
  for (let i = 1; i < path.length; i++) {
    const edge = (adj[path[i-1]] || []).find(e => e.id === path[i]);
    if (edge) cost += getW(edge.id, edge.weight);
  }
  return { visited, path, cost };
}

function bellmanFord(adj, startId, endId, getW) {
  const dist    = {};
  const parent  = {};
  const visited = [];
  const visitedSet = new Set();

  for (const id in adj) { dist[id] = Infinity; parent[id] = null; }
  dist[startId] = 0;

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
      const w = getW(v, baseWeight);
      if (w === Infinity) continue;
      const nd = dist[u] + w;
      if (nd < dist[v]) {
        dist[v] = nd;
        parent[v] = u;
        updated = true;
        if (!visitedSet.has(v)) { visitedSet.add(v); visited.push(v); }
      }
    }
    if (!updated) break;
  }
  return { visited, path: reconstructPath(parent, startId, endId), cost: dist[endId] ?? Infinity };
}

// ─── Message handler ──────────────────────────────────────────────────────────
const ALGOS = [
  { id: 'dijkstra',    fn: dijkstra,    needsHeuristic: false },
  { id: 'astar',       fn: aStar,       needsHeuristic: true  },
  { id: 'bfs',         fn: bfs,         needsHeuristic: false },
  { id: 'bellmanford', fn: bellmanFord, needsHeuristic: false },
];

self.onmessage = function ({ data }) {
  if (data.type !== 'RUN') return;

  try {
    const { adj, nodes, startId, endId, obstacles } = data.payload;
    const { blocked = [], flood = [], fire = [] } = obstacles ?? {};

    const blockedSet = new Set(blocked);
    const floodSet   = new Set(flood);
    const fireSet    = new Set(fire);

    function getW(nodeId, baseWeight) {
      const id = String(nodeId);
      if (blockedSet.has(id)) return Infinity;
      if (floodSet.has(id))   return baseWeight * 8;
      if (fireSet.has(id))    return baseWeight * 12;
      return baseWeight;
    }

    function heuristic(aId, bId) {
      const na = nodes[aId], nb = nodes[bId];
      if (!na || !nb) return 0;
      return haversine(na.lat, na.lon, nb.lat, nb.lon);
    }

    for (const { id, fn, needsHeuristic } of ALGOS) {
      const t0     = performance.now();
      const result = needsHeuristic
        ? fn(adj, startId, endId, getW, heuristic)
        : fn(adj, startId, endId, getW);
      const t1 = performance.now();

      self.postMessage({
        type: 'RESULT',
        algoId: id,
        result: {
          ...result,
          timeMs:        +(t1 - t0).toFixed(2),
          nodesExplored: result.visited.length,
          pathLength:    result.path.length,
          found:         result.path.length > 0,
        },
      });
    }

    self.postMessage({ type: 'DONE' });
  } catch (err) {
    self.postMessage({ type: 'ERROR', message: err.message });
  }
};
