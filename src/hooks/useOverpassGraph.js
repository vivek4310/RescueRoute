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
    if (el.type === 'node') {
      const id = String(el.id);
      nodes[id] = {
        id,
        lat: el.lat,
        lon: el.lon
      };
  }
    if (el.type === 'way' && el.nodes) ways.push(el);
  }

  const edges = [];
  for (const way of ways) {
    const hw = (way.tags && way.tags.highway) || 'unclassified';
    const wMul = roadWeight(hw);
    const oneWay = way.tags && (way.tags.oneway === 'yes' || way.tags.oneway === '1');

    for (let i = 0; i < way.nodes.length - 1; i++) {
      const aId = String(way.nodes[i]);
      const bId = String(way.nodes[i + 1]);
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

  const snapToNearest = useCallback((lat, lon) => {
    return nearestNode(nodeList, lat, lon);
  }, [nodeList]);

  return {
    graphNodes, graphAdj, nodeList,
    loadState, errorMsg, nodeCount, edgeCount,
    blockedNodes, floodNodes, fireNodes,
    load, snapToNearest, toggleObstacle, resetObstacles, getEffectiveWeight,
  };
}
