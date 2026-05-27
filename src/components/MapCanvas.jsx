import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

const ALGO_STYLE = {
  dijkstra:   { color: '#22d3ee', weight: 5, opacity: 0.9, dashArray: null },
  astar:      { color: '#4ade80', weight: 5, opacity: 0.9, dashArray: null },
  bfs:        { color: '#fb923c', weight: 4, opacity: 0.85, dashArray: '8 5' },
  bellmanford:{ color: '#f472b6', weight: 4, opacity: 0.85, dashArray: '3 5' },
};

/**
 * MapCanvas — Leaflet map with:
 *   • OSM tiles (dark-filtered)
 *   • Click-to-snap START / END markers onto nearest road node
 *   • Obstacle node markers (block / flood / fire)
 *   • Polyline drawing for each algorithm's result path
 *
 * Exposes imperative handle so App can call:
 *   mapRef.current.drawPath(algo, nodeIds)
 *   mapRef.current.clearPaths()
 *   mapRef.current.addObstacleMarker(nodeId, lat, lon, tool)
 *   mapRef.current.removeObstacleMarker(nodeId)
 *   mapRef.current.clearObstacleMarkers()
 */
const MapCanvas = forwardRef(function MapCanvas(
  { graphNodes, snapToNearest, onNodeClick, placingMode, nodeCount, edgeCount, loadState,highlightedAlgo },
  ref
) {
  const mapRef          = useRef(null);
  const mapInstanceRef  = useRef(null);
  const startMarkerRef  = useRef(null);
  const endMarkerRef    = useRef(null);
  const polylineRefs    = useRef({});
  const obstacleMarkers = useRef({});
  // Always holds the latest onNodeClick without re-registering the Leaflet listener
  const onNodeClickRef  = useRef(onNodeClick);
  useEffect(() => { onNodeClickRef.current = onNodeClick; }, [onNodeClick]);

  useEffect(() => {
  onNodeClickRef.current = onNodeClick;
}, [onNodeClick]);

useEffect(() => {

  Object.entries(polylineRefs.current)
    .forEach(([algoId, polyline]) => {

      const baseStyle =
        ALGO_STYLE[algoId] || {
          weight: 4,
          opacity: 0.85
        };

      polyline.setStyle({

        weight:
          highlightedAlgo === algoId
            ? 8
            : baseStyle.weight,

        opacity:
          highlightedAlgo === null
            ? baseStyle.opacity
            : highlightedAlgo === algoId
            ? 1
            : 0.12
      });

      if (highlightedAlgo === algoId) {
        polyline.bringToFront();
      }
    });

}, [highlightedAlgo]);
  // ── Init Leaflet ──────────────────────────────────────────
  useEffect(() => {
    if (mapInstanceRef.current) return;

    import('leaflet').then(L => {
      const map = L.map(mapRef.current, {
        center: [22.5726, 88.3639],
        zoom: 14,
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // Use ref so we always invoke the latest handler, never a stale closure
      map.on('click', (e) => {
        onNodeClickRef.current(e.latlng.lat, e.latlng.lng);
      });

      mapInstanceRef.current = map;
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Imperative API for App ────────────────────────────────
  useImperativeHandle(ref, () => ({
    placeStartMarker(lat, lon, label) {
      import('leaflet').then(L => {
        if (startMarkerRef.current) mapInstanceRef.current.removeLayer(startMarkerRef.current);
        startMarkerRef.current = L.circleMarker([lat, lon], {
          radius: 11, color: '#facc15', fillColor: '#facc15',
          fillOpacity: 0.95, weight: 2,
        }).addTo(mapInstanceRef.current).bindTooltip('🚑 ' + label, { permanent: false });
      });
    },
    placeEndMarker(lat, lon, label) {
      import('leaflet').then(L => {
        if (endMarkerRef.current) mapInstanceRef.current.removeLayer(endMarkerRef.current);
        endMarkerRef.current = L.circleMarker([lat, lon], {
          radius: 11, color: '#a855f7', fillColor: '#a855f7',
          fillOpacity: 0.95, weight: 2,
        }).addTo(mapInstanceRef.current).bindTooltip('🏥 ' + label, { permanent: false });
      });
    },
    clearMarkers() {
      if (startMarkerRef.current) {
        mapInstanceRef.current?.removeLayer(startMarkerRef.current);
        startMarkerRef.current = null;
      }
      if (endMarkerRef.current) {
        mapInstanceRef.current?.removeLayer(endMarkerRef.current);
        endMarkerRef.current = null;
      }
    },
    drawPath(algo, nodeIds, nodes) {
  if (!nodeIds || nodeIds.length < 2) return;
  const latlngs = nodeIds
    .map(id => nodes[id])
    .filter(Boolean)
    .map(n => [n.lat, n.lon]);
  if (latlngs.length < 2) return;
  import('leaflet').then(L => {
    const isHighlighted =
      highlightedAlgo === null ||
      highlightedAlgo === algo.id;
    const baseStyle =
      ALGO_STYLE[algo.id] || {
        color: algo.color,
        weight: 4,
        opacity: 0.85
      };
    const style = {
      ...baseStyle,
      weight:
        highlightedAlgo === algo.id
          ? 8
          : baseStyle.weight,
      opacity:
        highlightedAlgo === null
          ? baseStyle.opacity
          : highlightedAlgo === algo.id
          ? 1
          : 0.12
    };
    const pl = L.polyline(latlngs, style)
      .addTo(mapInstanceRef.current);
    if (highlightedAlgo === algo.id) {
      pl.bringToFront();
    }
    polylineRefs.current[algo.id] = pl;
  });
},

    clearPaths() {
      Object.values(polylineRefs.current)
        .forEach(pl =>
          mapInstanceRef.current?.removeLayer(pl)
        );

      polylineRefs.current = {};
    },

    addObstacleMarker(nodeId, lat, lon, tool) {
      const colors = { block: '#ef4444', flood: '#3b82f6', fire: '#f97316' };
      import('leaflet').then(L => {
        if (obstacleMarkers.current[nodeId]) {
          mapInstanceRef.current.removeLayer(obstacleMarkers.current[nodeId]);
        }
        const m = L.circleMarker([lat, lon], {
          radius: 6, color: colors[tool] || '#fff',
          fillColor: colors[tool] || '#fff', fillOpacity: 0.8, weight: 1,
        }).addTo(mapInstanceRef.current);
        obstacleMarkers.current[nodeId] = m;
      });
    },

    removeObstacleMarker(nodeId) {
      if (obstacleMarkers.current[nodeId]) {
        mapInstanceRef.current?.removeLayer(obstacleMarkers.current[nodeId]);
        delete obstacleMarkers.current[nodeId];
      }
    },

    clearObstacleMarkers() {
      Object.values(obstacleMarkers.current).forEach(m => mapInstanceRef.current?.removeLayer(m));
      obstacleMarkers.current = {};
    },
  }));

  const hudText = loadState === 'loading'
    ? '⏳ FETCHING OSM ROAD NETWORK…'
    : loadState === 'error'
    ? '⚠ OVERPASS API ERROR — CHECK CONSOLE'
    : loadState === 'loaded'
    ? `🌐 KOLKATA — ${nodeCount.toLocaleString()} nodes · ${edgeCount.toLocaleString()} edges`
    : '🌐 KOLKATA, WEST BENGAL';

  const modeText = {
    loading: 'Loading road network from Overpass API…',
    error:   'Failed to load — click Retry in toolbar',
    start:   'Click anywhere on a road to set START (🚑 Rescue Team)',
    end:     'Click to set END (🏥 Hospital / Shelter)',
    done:    'Both points set — click FIND ROUTES or click to reposition',
  }[placingMode] || '';

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
      {/* Leaflet map */}
      <div ref={mapRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />

      {/* Scanline overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 500,
        background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.03) 2px,rgba(0,0,0,0.03) 4px)',
      }} />

      {/* HUD top-center */}
      <div style={{
        position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 4, padding: '3px 10px',
        color: '#4ade80', fontSize: 10, fontFamily: 'Share Tech Mono',
        zIndex: 600, pointerEvents: 'none', letterSpacing: '0.1em',
        whiteSpace: 'nowrap',
      }}>
        {hudText}
      </div>

      {/* Mode hint bottom-left */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12,
        background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 6, padding: '6px 12px',
        color: '#94a3b8', fontSize: 11, fontFamily: 'Share Tech Mono',
        zIndex: 600, letterSpacing: '0.08em',
      }}>
        <span style={{ color: '#facc15', fontWeight: 700 }}>Mode: </span>{modeText}
      </div>

      {/* Loading spinner */}
      {loadState === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(6,10,20,0.88)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          zIndex: 700, gap: 14,
        }}>
          <div style={{
            width: 40, height: 40,
            border: '2px solid rgba(239,68,68,0.2)', borderTopColor: '#ef4444',
            borderRadius: '50%', animation: 'spin 1s linear infinite',
          }} />
          <div style={{ color: '#94a3b8', fontSize: 13, fontFamily: 'Share Tech Mono', letterSpacing: '0.1em' }}>
            FETCHING OSM ROAD NETWORK
          </div>
          <div style={{ color: '#475569', fontSize: 10, fontFamily: 'Share Tech Mono' }}>
            Querying Overpass API · Kolkata metro area
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Corner markers */}
      {['tl','tr','bl','br'].map(pos => (
        <div key={pos} style={{
          position: 'absolute', width: 16, height: 16, zIndex: 601, pointerEvents: 'none',
          ...(pos==='tl' ? {top:0,left:0,borderTop:'2px solid #ef4444',borderLeft:'2px solid #ef4444'} :
              pos==='tr' ? {top:0,right:0,borderTop:'2px solid #ef4444',borderRight:'2px solid #ef4444'} :
              pos==='bl' ? {bottom:0,left:0,borderBottom:'2px solid #ef4444',borderLeft:'2px solid #ef4444'} :
                           {bottom:0,right:0,borderBottom:'2px solid #ef4444',borderRight:'2px solid #ef4444'}),
        }} />
      ))}
    </div>
  );
});

export default MapCanvas;
