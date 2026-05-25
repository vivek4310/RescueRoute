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
const CANDIDATE_RADIUS_M = 80;

function toXY(lat, lon, originLat, originLon) {
  const DEG = Math.PI / 180;
  const x = (lon - originLon) * DEG * 6371000 * Math.cos(originLat * DEG);
  const y = (lat - originLat) * DEG * 6371000;
  return { x, y };
}

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

export function snapToNearestEdge(nodeList, edges, lat, lon, virtualId = '__virtual__') {
  const seed = nearestNode(nodeList, lat, lon);
  if (!seed) return null;

  const candidateIds = new Set();
  for (const n of nodeList) {
    if (haversine(lat, lon, n.lat, n.lon) <= CANDIDATE_RADIUS_M) {
      candidateIds.add(n.id);
    }
  }
  candidateIds.add(seed.id);

  const candidateMap = {};
  for (const n of nodeList) {
    if (candidateIds.has(n.id)) candidateMap[n.id] = n;
  }

  let bestDistSq = Infinity, bestT = 0, bestEdge = null;
  for (const e of edges) {
    const na = candidateMap[e.from], nb = candidateMap[e.to];
    if (!na || !nb) continue;
    const { x: ax, y: ay } = toXY(na.lat, na.lon, lat, lon);
    const { x: bx, y: by } = toXY(nb.lat, nb.lon, lat, lon);
    const { t, distSq } = pointToSegmentDistSq(0, 0, ax, ay, bx, by);
    if (distSq < bestDistSq) { bestDistSq = distSq; bestT = t; bestEdge = { e, na, nb }; }
  }

  if (!bestEdge) return { ...seed, isVirtual: false };

  const projLat = bestEdge.na.lat + bestT * (bestEdge.nb.lat - bestEdge.na.lat);
  const projLon = bestEdge.na.lon + bestT * (bestEdge.nb.lon - bestEdge.na.lon);

  if (bestT < 0.01) return { ...bestEdge.na, isVirtual: false };
  if (bestT > 0.99) return { ...bestEdge.nb, isVirtual: false };

  return {
    id: virtualId, lat: projLat, lon: projLon, isVirtual: true,
    hostEdge: { na: bestEdge.na, nb: bestEdge.nb, weight: bestEdge.e.weight, dist: bestEdge.e.dist },
  };
}

// ─── Virtual node injection ───────────────────────────────────────────────────
export function injectVirtualNode(graphAdj, graphNodes, virtualNode) {
  if (!virtualNode || !virtualNode.isVirtual) return { adj: graphAdj, nodes: graphNodes };

  const { id, lat, lon, hostEdge } = virtualNode;
  const { na, nb } = hostEdge;

  const distToA   = haversine(lat, lon, na.lat, na.lon);
  const distToB   = haversine(lat, lon, nb.lat, nb.lon);
  const totalDist = distToA + distToB || 1;
  const wTotal    = hostEdge.weight;
  const wToA      = wTotal * (distToA / totalDist);
  const wToB      = wTotal * (distToB / totalDist);

  const adj   = { ...graphAdj };
  const nodes = { ...graphNodes };
  nodes[id] = { id, lat, lon };

  adj[id] = [
    { id: String(na.id), weight: wToA, dist: distToA },
    { id: String(nb.id), weight: wToB, dist: distToB },
  ];
  adj[String(na.id)] = [...(graphAdj[String(na.id)] || []), { id, weight: wToA, dist: distToA }];
  adj[String(nb.id)] = [...(graphAdj[String(nb.id)] || []), { id, weight: wToB, dist: distToB }];

  return { adj, nodes };
}

// ─── Road weights ─────────────────────────────────────────────────────────────
function roadWeight(highway) {
  return {
    motorway: 0.7, trunk: 0.7, primary: 0.8,
    secondary: 1.0, tertiary: 1.2, residential: 1.5,
    unclassified: 1.8, service: 2.0,
  }[highway] || 1.5;
}

// ─── Overpass fetch — mirrors + retry ─────────────────────────────────────────
// Three public mirrors tried in order. Each gets two attempts with
// exponential back-off (1 s, 2 s) before moving to the next mirror.
// Total worst-case wait: ~18 s instead of an instant hard fail.

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// Reduced bbox: central Kolkata only (~40% less data → much faster on slow nets)
// Old: 22.50,88.30,22.65,88.43  →  ~160k nodes
// New: 22.53,88.33,22.60,88.40  →  ~60-80k nodes, still covers the demo area
const BBOX = '22.53,88.33,22.60,88.40';

// Cache key in sessionStorage so a page refresh doesn't re-fetch
const CACHE_KEY = 'rescueroute_osm_v2';

function buildQuery(bbox) {
  return `[out:json][timeout:60];
(
  way["highway"~"^(primary|secondary|tertiary|residential|trunk|motorway|unclassified|service)$"](${bbox});
);
out body;
>;
out skel qt;`;
}

async function fetchFromMirror(url, query, signal) {
  const resp = await fetch(url, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal,
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
  return resp.json();
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchRoadNetwork(onStatus) {
  // 1. Check sessionStorage cache first
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      onStatus('Using cached map data…');
      return JSON.parse(cached);
    }
  } catch (_) { /* sessionStorage unavailable — fine */ }

  const query = buildQuery(BBOX);
  const errors = [];

  for (const mirror of MIRRORS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        onStatus(
          attempt === 1
            ? `Connecting to OSM (${new URL(mirror).hostname})…`
            : `Retrying ${new URL(mirror).hostname}…`
        );

        // Per-attempt timeout: 45 s
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 45_000);

        const data = await fetchFromMirror(mirror, query, controller.signal);
        clearTimeout(timer);

        if (!data?.elements?.length) throw new Error('Empty response');

        // Cache on success
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (_) {}

        return data;
      } catch (err) {
        errors.push(`${mirror} attempt ${attempt}: ${err.message}`);
        if (attempt < 2) await sleep(1000 * attempt); // 1 s, then 2 s back-off
      }
    }

    // All attempts on this mirror exhausted — try next
    if (MIRRORS.indexOf(mirror) < MIRRORS.length - 1) {
      onStatus('Trying alternate server…');
      await sleep(500);
    }
  }

  // All mirrors failed
  throw new Error(
    `All Overpass mirrors failed.\n\nDetails:\n${errors.join('\n')}\n\n` +
    'Possible causes: rate-limited (try again in 60 s), ad blocker, or no internet.'
  );
}

// ─── Graph builder ────────────────────────────────────────────────────────────
export function buildGraph(data) {
  const nodes = {};
  const ways  = [];

  for (const el of data.elements) {
    if (el.type === 'node') nodes[el.id] = { id: el.id, lat: el.lat, lon: el.lon };
    if (el.type === 'way' && el.nodes) ways.push(el);
  }

  const edges = [];
  for (const way of ways) {
    const hw     = (way.tags && way.tags.highway) || 'unclassified';
    const wMul   = roadWeight(hw);
    const oneWay = way.tags && (way.tags.oneway === 'yes' || way.tags.oneway === '1');

    for (let i = 0; i < way.nodes.length - 1; i++) {
      const aId = way.nodes[i], bId = way.nodes[i + 1];
      const na = nodes[aId], nb = nodes[bId];
      if (!na || !nb) continue;
      const dist = haversine(na.lat, na.lon, nb.lat, nb.lon);
      const w    = wMul * dist;
      edges.push({ from: aId, to: bId, weight: w, dist });
      if (!oneWay) edges.push({ from: bId, to: aId, weight: w, dist });
    }
  }

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
  const [loadState, setLoadState]    = useState('idle');
  const [errorMsg, setErrorMsg]      = useState('');
  const [statusMsg, setStatusMsg]    = useState('');   // ← live progress text
  const [nodeCount, setNodeCount]    = useState(0);
  const [edgeCount, setEdgeCount]    = useState(0);
  const edgesRef = useRef([]);

  const [blockedNodes, setBlockedNodes] = useState(new Set());
  const [floodNodes, setFloodNodes]     = useState(new Set());
  const [fireNodes, setFireNodes]       = useState(new Set());

  const load = useCallback(async () => {
    setLoadState('loading');
    setErrorMsg('');
    setStatusMsg('Initialising…');
    try {
      const data  = await fetchRoadNetwork(setStatusMsg);
      setStatusMsg('Building graph…');
      // Yield to the browser for one frame so "Building graph…" renders
      await new Promise(r => setTimeout(r, 0));
      const graph = buildGraph(data);
      setGraphNodes(graph.nodes);
      setGraphAdj(graph.adj);
      setNodeList(graph.nodeList);
      setNodeCount(graph.nodeList.length);
      setEdgeCount(graph.edges.length);
      edgesRef.current = graph.edges;
      setStatusMsg('');
      setLoadState('loaded');
    } catch (err) {
      setErrorMsg(err.message);
      setStatusMsg('');
      setLoadState('error');
    }
  }, []);

  // Clears the session cache and re-fetches (useful after a rate-limit window)
  const forceReload = useCallback(() => {
    try { sessionStorage.removeItem(CACHE_KEY); } catch (_) {}
    load();
  }, [load]);

  const getEffectiveWeight = useCallback((nodeId, baseWeight) => {
    if (blockedNodes.has(String(nodeId))) return Infinity;
    if (floodNodes.has(String(nodeId)))   return baseWeight * 8;
    if (fireNodes.has(String(nodeId)))    return baseWeight * 12;
    return baseWeight;
  }, [blockedNodes, floodNodes, fireNodes]);

  const toggleObstacle = useCallback((nodeId, tool) => {
    const id = String(nodeId);
    const updater = prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    };
    if (tool === 'block') setBlockedNodes(updater);
    else if (tool === 'flood') setFloodNodes(updater);
    else if (tool === 'fire')  setFireNodes(updater);
  }, []);

  const resetObstacles = useCallback(() => {
    setBlockedNodes(new Set());
    setFloodNodes(new Set());
    setFireNodes(new Set());
  }, []);

  const snapToNearest = useCallback((lat, lon, role = 'start') => {
    const virtualId = role === 'end' ? '__end_virtual__' : '__start_virtual__';
    return snapToNearestEdge(nodeList, edgesRef.current, lat, lon, virtualId);
  }, [nodeList]);

  // For obstacle placement: snap only to real nodes, with a tight 30m radius.
  // Returns the nearest node if within 30 m, otherwise null (so accidental
  // clicks in empty space don't teleport a marker to a far-away node).
  const snapToNearestNode = useCallback((lat, lon) => {
    const MAX_DIST_M = 30;
    let best = null, bestD = Infinity;
    for (const n of nodeList) {
      const d = haversine(lat, lon, n.lat, n.lon);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best && bestD <= MAX_DIST_M ? best : null;
  }, [nodeList]);

  return {
    graphNodes, graphAdj, nodeList,
    loadState, errorMsg, statusMsg, nodeCount, edgeCount,
    blockedNodes, floodNodes, fireNodes,
    load, forceReload, snapToNearest, snapToNearestNode, toggleObstacle, resetObstacles, getEffectiveWeight,
  };
}