# 🚨 RescueRoute — Disaster Pathfinding System

A real-time pathfinding visualizer built on live OpenStreetMap data. Place a rescue team and a hospital anywhere on the Kolkata road network, paint disaster zones, and watch four algorithms race to find the best evacuation route — simultaneously, on real streets.

![RescueRoute](https://img.shields.io/badge/status-active-brightgreen) ![React](https://img.shields.io/badge/React-18-61dafb) ![Leaflet](https://img.shields.io/badge/Leaflet-1.9-199900) ![OSM](https://img.shields.io/badge/data-OpenStreetMap-7ebc6f)

---

## What It Does

RescueRoute fetches the live road network for Kolkata from the **Overpass API** (~160k nodes, ~330k edges), builds a weighted graph, and lets you interactively run four classic pathfinding algorithms on it. Each algorithm's explored nodes, path cost, and execution time are shown side-by-side in real time so you can compare their behaviour on identical inputs.

---

## Features

- **Live OSM road graph** — fetched fresh from Overpass API on load, not a static file
- **Edge-projection snapping** — clicks snap to the nearest road node via geometric edge projection, not just nearest-node distance, so markers always land on the correct street
- **4 algorithms running in parallel** on the same graph:
  - Dijkstra — optimal cost, explores by cheapest path
  - A\* — heuristic-guided, faster than Dijkstra on real maps
  - BFS — fewest hops, ignores weights
  - Bellman-Ford — handles negative weights, slowest
- **Obstacle painting** — mark road nodes as blocked (∞ cost), flooded (8× cost), or fire hazard (12× cost) before running
- **Algo Race panel** — live progress bars, nodes explored, path cost, execution time, and a verdict on which algorithm won each category
- **Tactical UI** — dark OSM tiles, scanline overlay, monospace readouts, red emergency aesthetic

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI | React 18 + Vite |
| Map | Leaflet + react-leaflet |
| Road data | OpenStreetMap via Overpass API |
| Styling | Inline styles + Google Fonts (Rajdhani, Share Tech Mono, Exo 2) |
| Graph | Custom adjacency list built from OSM ways |
| Algorithms | Hand-written JS (no pathfinding library) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install and run

```bash
git clone https://github.com/Anchoraze/RescueRoute
cd RescueRoute
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

> The app fetches road data from Overpass API on first load. This takes about 5–10 seconds depending on your connection. If Overpass is rate-limiting, wait a moment and click **Retry Load**.

---

## How to Use

1. **Wait for the road network to load** — the HUD shows node/edge count when ready
2. **Click anywhere on the map** to place the 🚑 Rescue Team (START)
3. **Click again** to place the 🏥 Hospital (END)
4. Optionally **paint obstacles** using the toolbar:
   - 🧱 Block Road — makes a node impassable
   - 🌊 Flood (8×) — multiplies traversal cost by 8
   - 🔥 Fire (12×) — multiplies traversal cost by 12
5. Click **🚨 FIND ROUTES** — all four algorithms run and draw their paths
6. Check the **Algo Race** panel on the right for the comparison

To reposition start/end, just click the map again. To clear paths without resetting the map, use **Clear Paths**.

---

## Project Structure

```
src/
├── algorithms/
│   ├── dijkstra.js       # O((V+E) log V) — optimal cost
│   ├── aStar.js          # O(E log V) — heuristic-guided
│   ├── bfs.js            # O(V+E) — fewest hops
│   └── bellmanFord.js    # O(V×E) — handles negative weights
│
├── components/
│   ├── MapCanvas.jsx     # Leaflet map, marker placement, polyline drawing
│   ├── AlgoRacePanel.jsx # Right panel — live stats per algorithm
│   ├── ComplexityPanel.jsx # Bottom legend and path colour key
│   └── ScenarioToolbar.jsx # Obstacle tools + action buttons
│
├── hooks/
│   ├── useOverpassGraph.js # Fetch, build, and manage the OSM road graph
│   └── useAlgorithm.js     # Run all algorithms, manage results + animation
│
└── App.jsx               # Root — wires everything together
```

---

## Algorithm Comparison

| Algorithm | Time Complexity | Finds Optimal Path | Handles Weights | Notes |
|---|---|---|---|---|
| Dijkstra | O((V+E) log V) | ✅ Yes | ✅ Yes | Baseline optimal |
| A\* | O(E log V) | ✅ Yes | ✅ Yes | Faster with good heuristic |
| BFS | O(V+E) | ❌ No (fewest hops) | ❌ No | May route through flood/fire |
| Bellman-Ford | O(V×E) | ✅ Yes | ✅ Yes | Slowest — capped at 200 iterations |

---

## Data Source

Road data is fetched live from the [Overpass API](https://overpass-api.de) using the following highway types: `primary`, `secondary`, `tertiary`, `residential`, `trunk`, `motorway`, `unclassified`, `service`.

Map tiles © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).

---

## License

MIT
