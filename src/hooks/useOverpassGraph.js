import { useState, useCallback, useRef } from 'react';

// ─── Geo helpers ──────────────────────────────────────────────────────────────
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearestNode(nodeList, lat, lon) {
  let best = null, bestD = Infinity;
  for (const n of nodeList) {
    const d = haversine(lat, lon, n.lat, n.lon);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

// ─── Edge-projection snap ─────────────────────────────────────────────────────
// Projects the click point onto every edge whose endpoints are within
// CANDIDATE_RADIUS metres, then snaps to whichever endpoint of the closest
// edge projection is nearer to the click. This beats pure nearest-node when
// the graph is dense: the geometrically closest node may sit on a parallel
// street, but the projected edge finds the correct one on the clicked street.

const CANDIDATE_RADIUS_M = 80; // only consider edges whose nodes are this close

// Flat-earth projection of (lat,lon) relative to an origin — good enough for
// distances <1 km and avoids full haversine in the tight inner loop.
function toXY(lat, lon, originLat, originLon) {
  const DEG = Math.PI / 180;
  const x = (lon - originLon) * DEG * 6371000 * Math.cos(originLat * DEG);
  const y = (lat - originLat) * DEG * 6371000;
  return { x, y };
}

// Squared distance from point P to line-segment AB, returns { t, distSq }
// where t ∈ [0,1] is the parameter of the closest point on the segment.
function pointToSegmentDistSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { t: 0, distSq: (px - ax) ** 2 + (py - ay) ** 2 };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return {
    t,
    distSq: (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2,
  };
}

// ─── Virtual node ─────────────────────────────────────────────────────────────
// A virtual node is a synthetic graph node at the exact projected position on
// an edge. It is NOT stored in the graph permanently — callers must inject it
// into a shallow-copied adjacency list before running pathfinding, then discard.
//
// Shape: { id, lat, lon, isVirtual, hostEdge: { na, nb, weight } }
// id is always '__start_virtual__' or '__end_virtual__' so callers can tell.

export function snapToNearestEdge(nodeList, edges, lat, lon, virtualId = '__virtual__') {
  // Step 1: seed with nearest node — guarantees a fallback for isolated nodes.
  const seed = nearestNode(nodeList, lat, lon);
  if (!seed) return null;

  // Step 2: candidate nodes within CANDIDATE_RADIUS_M of the click.
  const candidateIds = new Set();
  for (const n of nodeList) {
    if (haversine(lat, lon, n.lat, n.lon) <= CANDIDATE_RADIUS_M) {
      candidateIds.add(n.id);
    }
  }
  candidateIds.add(seed.id); // always include seed

  // Build id→node map for candidates only (tiny subset of 159k).
  const candidateMap = {};
  for (const n of nodeList) {
    if (candidateIds.has(n.id)) candidateMap[n.id] = n;
  }

  // Step 3: project the click onto every candidate edge, find closest.
  let bestDistSq = Infinity;
  let bestT = 0;
  let bestEdge = null;

  for (const e of edges) {
    const na = candidateMap[e.from], nb = candidateMap[e.to];
    if (!na || !nb) continue;

    const { x: ax, y: ay } = toXY(na.lat, na.lon, lat, lon);
    const { x: bx, y: by } = toXY(nb.lat, nb.lon, lat, lon);
    const { t, distSq } = pointToSegmentDistSq(0, 0, ax, ay, bx, by);

    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestT      = t;
      bestEdge   = { e, na, nb };
    }
  }

  // Step 4: no edge found — fall back to seed node (isolated node case).
  if (!bestEdge) return { ...seed, isVirtual: false };

  // Step 5: interpolate the exact projected lat/lon at parameter t.
  const projLat = bestEdge.na.lat + bestT * (bestEdge.nb.lat - bestEdge.na.lat);
  const projLon = bestEdge.na.lon + bestT * (bestEdge.nb.lon - bestEdge.na.lon);

  // If t is essentially 0 or 1 we're right on an endpoint — just return it.
  if (bestT < 0.01) return { ...bestEdge.na, isVirtual: false };
  if (bestT > 0.99) return { ...bestEdge.nb, isVirtual: false };

  return {
    id:        virtualId,
    lat:       projLat,
    lon:       projLon,
    isVirtual: true,
    hostEdge:  {
      na:     bestEdge.na,
      nb:     bestEdge.nb,
      weight: bestEdge.e.weight,   // total edge weight (used to split proportionally)
      dist:   bestEdge.e.dist,
    },
  };
}

// ─── Virtual node injection ───────────────────────────────────────────────────
// Call this before running any algorithm when start or end is a virtual node.
// Returns a NEW shallow-copied adj that includes the virtual node spliced into
// its host edge. The original graphAdj is never mutated.
//
// The host edge  na ↔ nb  is split into  na ↔ V  and  V ↔ nb  with weights
// proportional to the haversine distances of each sub-segment.
//
// Pass the patched adj + graphNodes copy to the algorithm. Discard afterwards.

export function injectVirtualNode(graphAdj, graphNodes, virtualNode) {
  if (!virtualNode || !virtualNode.isVirtual) return { adj: graphAdj, nodes: graphNodes };

  const { id, lat, lon, hostEdge } = virtualNode;
  const { na, nb } = hostEdge;

  const distToA  = haversine(lat, lon, na.lat, na.lon);
  const distToB  = haversine(lat, lon, nb.lat, nb.lon);
  const totalDist = distToA + distToB || 1;

  // Proportional weight split (preserves road-type multiplier already baked in)
  const wTotal   = hostEdge.weight;
  const wToA     = wTotal * (distToA / totalDist);
  const wToB     = wTotal * (distToB / totalDist);

  // Shallow-copy only the rows we touch — everything else is shared.
  const adj   = { ...graphAdj };
  const nodes = { ...graphNodes };

  // Add virtual node to nodes map so heuristic can look up its coords.
  nodes[id] = { id, lat, lon };

  // Virtual node connects to both endpoints (bidirectional).
  adj[id] = [
    { id: String(na.id), weight: wToA, dist: distToA },
    { id: String(nb.id), weight: wToB, dist: distToB },
  ];

  // Patch na: add edge to virtual node (keep existing neighbours).
  adj[String(na.id)] = [
    ...(graphAdj[String(na.id)] || []),
    { id, weight: wToA, dist: distToA },
  ];

  // Patch nb: add edge to virtual node (keep existing neighbours).
  adj[String(nb.id)] = [
    ...(graphAdj[String(nb.id)] || []),
    { id, weight: wToB, dist: distToB },
  ];

  return { adj, nodes };
}

// Road type → base cost multiplier (lower = faster road)
function roadWeight(highway) {
  return {
    motorway: 0.7, trunk: 0.7, primary: 0.8,
    secondary: 1.0, tertiary: 1.2, residential: 1.5,
    unclassified: 1.8, service: 2.0,
  }[highway] || 1.5;
}

// ─── Overpass fetch ───────────────────────────────────────────────────────────
async function fetchRoadNetwork() {
  const bbox = '22.50,88.30,22.65,88.43'; // Kolkata metro
  const query = `[out:json][timeout:30];
(
  way["highway"~"^(primary|secondary|tertiary|residential|trunk|motorway|unclassified|service)$"](${bbox});
);
out body;
>;
out skel qt;`;

  const resp = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!resp.ok) throw new Error(`Overpass API returned HTTP ${resp.status}`);
  return resp.json();
}

// ─── Graph builder ────────────────────────────────────────────────────────────
export function buildGraph(data) {
  const nodes = {};
  const ways = [];

  for (const el of data.elements) {
    if (el.type === 'node') nodes[el.id] = { id: el.id, lat: el.lat, lon: el.lon };
    if (el.type === 'way' && el.nodes) ways.push(el);
  }

  const edges = [];
  for (const way of ways) {
    const hw = (way.tags && way.tags.highway) || 'unclassified';
    const wMul = roadWeight(hw);
    const oneWay = way.tags && (way.tags.oneway === 'yes' || way.tags.oneway === '1');

    for (let i = 0; i < way.nodes.length - 1; i++) {
      const aId = way.nodes[i], bId = way.nodes[i + 1];
      const na = nodes[aId], nb = nodes[bId];
      if (!na || !nb) continue;
      const dist = haversine(na.lat, na.lon, nb.lat, nb.lon);
      const w = wMul * dist;
      edges.push({ from: aId, to: bId, weight: w, dist });
      if (!oneWay) edges.push({ from: bId, to: aId, weight: w, dist });
    }
  }

  // Adjacency list
  const adj = {};
  for (const id in nodes) adj[id] = [];
  for (const e of edges) {
    if (adj[e.from]) adj[e.from].push({ id: e.to, weight: e.weight, dist: e.dist });
  }

  return { nodes, adj, edges, nodeList: Object.values(nodes) };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useOverpassGraph() {
  const [graphNodes, setGraphNodes] = useState({});
  const [graphAdj, setGraphAdj]     = useState({});
  const [nodeList, setNodeList]      = useState([]);
  const [loadState, setLoadState]    = useState('idle'); // idle | loading | loaded | error
  const [errorMsg, setErrorMsg]      = useState('');
  const [nodeCount, setNodeCount]    = useState(0);
  const [edgeCount, setEdgeCount]    = useState(0);
  // Keep edges in a ref — they're large and never need to trigger re-renders.
  const edgesRef = useRef([]);

  // Obstacle state
  const [blockedNodes, setBlockedNodes] = useState(new Set());
  const [floodNodes, setFloodNodes]     = useState(new Set());
  const [fireNodes, setFireNodes]       = useState(new Set());

  const load = useCallback(async () => {
    setLoadState('loading');
    setErrorMsg('');
    try {
      const data = await fetchRoadNetwork();
      const graph = buildGraph(data);
      setGraphNodes(graph.nodes);
      setGraphAdj(graph.adj);
      setNodeList(graph.nodeList);
      setNodeCount(graph.nodeList.length);
      setEdgeCount(graph.edges.length);
      edgesRef.current = graph.edges;
      setLoadState('loaded');
    } catch (err) {
      setErrorMsg(err.message);
      setLoadState('error');
    }
  }, []);

  // Get effective weight for a node, factoring in obstacles
  const getEffectiveWeight = useCallback((nodeId, baseWeight) => {
    if (blockedNodes.has(String(nodeId))) return Infinity;
    if (floodNodes.has(String(nodeId)))   return baseWeight * 8;
    if (fireNodes.has(String(nodeId)))    return baseWeight * 12;
    return baseWeight;
  }, [blockedNodes, floodNodes, fireNodes]);

  const toggleObstacle = useCallback((nodeId, tool) => {
    const id = String(nodeId);
    if (tool === 'block') {
      setBlockedNodes(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    } else if (tool === 'flood') {
      setFloodNodes(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    } else if (tool === 'fire') {
      setFireNodes(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    }
  }, []);

  const resetObstacles = useCallback(() => {
    setBlockedNodes(new Set());
    setFloodNodes(new Set());
    setFireNodes(new Set());
  }, []);

  // role: 'start' | 'end' — determines the virtual node id injected into the graph
  const snapToNearest = useCallback((lat, lon, role = 'start') => {
    const virtualId = role === 'end' ? '__end_virtual__' : '__start_virtual__';
    return snapToNearestEdge(nodeList, edgesRef.current, lat, lon, virtualId);
  }, [nodeList]);

  return {
    graphNodes, graphAdj, nodeList,
    loadState, errorMsg, nodeCount, edgeCount,
    blockedNodes, floodNodes, fireNodes,
    load, snapToNearest, toggleObstacle, resetObstacles, getEffectiveWeight,
  };
}
