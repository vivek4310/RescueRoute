import { useState, useEffect, useRef, useCallback } from 'react';
import MapCanvas       from './components/MapCanvas';
import ScenarioToolbar from './components/ScenarioToolbar';
import AlgoRacePanel   from './components/AlgoRacePanel';
import ComplexityPanel from './components/ComplexityPanel';
import { useOverpassGraph } from './hooks/useOverpassGraph';
import { useAlgorithm, ALGORITHMS } from './hooks/useAlgorithm';
import 'leaflet/dist/leaflet.css';

export default function App() {
  const mapRef = useRef(null);

  // ── Graph (Overpass) ──────────────────────────────────────
  const {
    graphNodes, graphAdj, nodeCount, edgeCount,
    loadState, errorMsg,
    blockedNodes, floodNodes, fireNodes,
    load, snapToNearest, toggleObstacle, resetObstacles, getEffectiveWeight,
  } = useOverpassGraph();

  // ── Algorithms ────────────────────────────────────────────
  const { results, isRunning, animationProgress, runAll, reset: resetAlgo } =
    useAlgorithm(graphNodes, graphAdj, getEffectiveWeight);

  // ── Map interaction state ─────────────────────────────────
  const [activeTool, setActiveTool]   = useState('none');
  const [startNode, setStartNode] = useState(null);
  const [endNode, setEndNode]     = useState(null);
  const [placingMode, setPlacingMode] = useState('loading'); // loading|error|start|end|done

  // ── Clock ─────────────────────────────────────────────────
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Boot: load road network ───────────────────────────────
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (loadState === 'loaded') setPlacingMode('start');
    if (loadState === 'error')  setPlacingMode('error');
    if (loadState === 'loading') setPlacingMode('loading');
  }, [loadState]);

  // ── Map click handler ─────────────────────────────────────
  const handleNodeClick = useCallback((lat, lon) => {
    if (loadState !== 'loaded') return;

    const isObstacleTool = activeTool === 'block' || activeTool === 'flood' || activeTool === 'fire';

    if (isObstacleTool) {
      // Obstacles always snap to the nearest REAL graph node — no virtual node
      // needed since obstacles are stored by node id, not injected into the graph.
      const nearest = snapToNearest(lat, lon, 'start'); // role doesn't matter; real node resolved below
      if (!nearest) return;

      // If snap returned a virtual node (mid-edge), resolve to the closer endpoint.
      const realNode = nearest.isVirtual
        ? (() => {
            const { na, nb } = nearest.hostEdge;
            const dA = (lat - na.lat) ** 2 + (lon - na.lon) ** 2;
            const dB = (lat - nb.lat) ** 2 + (lon - nb.lon) ** 2;
            return dA <= dB ? na : nb;
          })()
        : nearest;

      const id = String(realNode.id);
      const isSet =
        (activeTool === 'block' && blockedNodes.has(id)) ||
        (activeTool === 'flood' && floodNodes.has(id)) ||
        (activeTool === 'fire'  && fireNodes.has(id));

      toggleObstacle(realNode.id, activeTool);
      if (isSet) {
        mapRef.current?.removeObstacleMarker(id);
      } else {
        mapRef.current?.addObstacleMarker(id, realNode.lat, realNode.lon, activeTool);
      }
      return;
    }

    // Place START — snap to exact projected position (virtual node ok)
    if (placingMode === 'start' || (placingMode === 'done' && activeTool === 'none')) {
      const nearest = snapToNearest(lat, lon, 'start');
      if (!nearest) return;
      setStartNode(nearest);
      mapRef.current?.placeStartMarker(nearest.lat, nearest.lon, 'Rescue Team');
      setPlacingMode('end');
      return;
    }

    // Place END
    if (placingMode === 'end') {
      const nearest = snapToNearest(lat, lon, 'end');
      if (!nearest) return;
      setEndNode(nearest);
      mapRef.current?.placeEndMarker(nearest.lat, nearest.lon, 'Hospital');
      setPlacingMode('done');
    }
  }, [loadState, activeTool, placingMode, snapToNearest, toggleObstacle, blockedNodes, floodNodes, fireNodes]);

  // ── Run all algorithms ────────────────────────────────────
  const handleRun = useCallback(() => {
    mapRef.current?.clearPaths();
    runAll(startNode, endNode, (algo, path) => {
      mapRef.current?.drawPath(algo, path, graphNodes);
    });
  }, [runAll, startNode, endNode, graphNodes]);

  // ── Clear paths ───────────────────────────────────────────
  const handleClear = useCallback(() => {
    mapRef.current?.clearPaths();
    resetAlgo();
  }, [resetAlgo]);

  // ── Full reset ────────────────────────────────────────────
  const handleReset = useCallback(() => {
    mapRef.current?.clearPaths();
    mapRef.current?.clearMarkers();
    mapRef.current?.clearObstacleMarkers();
    resetAlgo();
    resetObstacles();
    setStartNode(null);
    setEndNode(null);
    setPlacingMode('start');
  }, [resetAlgo, resetObstacles]);

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: '#060a14',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', fontFamily: 'Rajdhani, sans-serif',
    }}>
      {/* ── Header ── */}
      <header style={{
        background: 'rgba(6,10,20,0.98)',
        borderBottom: '1px solid rgba(239,68,68,0.3)',
        padding: '0 16px', height: 44,
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        boxShadow: '0 1px 20px rgba(239,68,68,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28,
            background: 'linear-gradient(135deg,#dc2626,#7f1d1d)',
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, boxShadow: '0 0 12px rgba(220,38,38,0.5)',
          }}>🚨</div>
          <div>
            <div style={{ color: '#f1f5f9', fontSize: 16, fontFamily: 'Exo 2', fontWeight: 800, letterSpacing: '0.05em', lineHeight: 1 }}>
              RESCUE<span style={{ color: '#ef4444' }}>ROUTE</span>
            </div>
            <div style={{ color: '#475569', fontSize: 8, fontFamily: 'Share Tech Mono', letterSpacing: '0.2em' }}>
              DISASTER PATHFINDING SYSTEM
            </div>
          </div>
        </div>

        <StatusBadge color="#ef4444" label="EMERGENCY ACTIVE" pulse />
        <StatusBadge color="#f59e0b" label="4 ALGORITHMS READY" />
        <StatusBadge color="#22d3ee" label={loadState === 'loaded' ? 'OSM LIVE' : loadState === 'loading' ? 'LOADING…' : 'OSM ERROR'} />

        <div style={{ flex: 1 }} />
        <div style={{ color: '#22d3ee', fontSize: 13, fontFamily: 'Share Tech Mono', letterSpacing: '0.1em' }}>
          {time.toLocaleTimeString('en-IN', { hour12: false })}
        </div>
        <div style={{ color: '#475569', fontSize: 10, fontFamily: 'Share Tech Mono' }}>
          DIJKSTRA · A* · BFS · BELLMAN-FORD
        </div>
      </header>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <MapCanvas
            ref={mapRef}
            graphNodes={graphNodes}
            snapToNearest={snapToNearest}
            onNodeClick={handleNodeClick}
            placingMode={placingMode}
            nodeCount={nodeCount}
            edgeCount={edgeCount}
            loadState={loadState}
          />
          <ComplexityPanel results={results} ALGORITHMS={ALGORITHMS} />
          <ScenarioToolbar
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            onReset={handleReset}
            onRun={handleRun}
            onClear={handleClear}
            onRetry={load}
            isRunning={isRunning}
            loadState={loadState}
          />
        </div>

        <AlgoRacePanel
          ALGORITHMS={ALGORITHMS}
          results={results}
          animationProgress={animationProgress}
          isRunning={isRunning}
        />
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        * { box-sizing: border-box; }
        body { margin: 0; overflow: hidden; }
        .leaflet-container { background: #0f172a; }
        .leaflet-tile { filter: brightness(0.38) saturate(0.25) hue-rotate(200deg); }
        .leaflet-control-attribution { background: rgba(0,0,0,0.6)!important; color:#475569!important }
        .leaflet-control-attribution a { color:#64748b!important }
        .leaflet-control-zoom a {
          background:rgba(15,23,42,0.9)!important;
          color:#94a3b8!important;
          border-color:rgba(255,255,255,0.1)!important;
        }
      `}</style>
    </div>
  );
}

function StatusBadge({ color, label, pulse }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      background: `${color}15`, border: `1px solid ${color}30`,
      borderRadius: 4, padding: '2px 8px',
    }}>
      <div style={{
        width: 5, height: 5, borderRadius: '50%',
        background: color, boxShadow: `0 0 6px ${color}`,
        animation: pulse ? 'pulse 1.5s infinite' : 'none',
      }} />
      <span style={{ color, fontSize: 9, fontFamily: 'Share Tech Mono', letterSpacing: '0.1em' }}>
        {label}
      </span>
    </div>
  );
}
