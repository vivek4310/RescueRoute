import { useState, useCallback } from 'react';
import { dijkstra }    from '../algorithms/dijkstra';
import { aStar }       from '../algorithms/aStar';
import { bfs }         from '../algorithms/bfs';
import { bellmanFord } from '../algorithms/bellmanFord';
import { haversine, injectVirtualNode } from './useOverpassGraph';

export const ALGORITHMS = [
  {
    id: 'dijkstra',
    name: 'Dijkstra',
    color: '#22d3ee',
    timeComplexity: 'O((V+E) log V)',
    spaceComplexity: 'O(V)',
    description: 'Explores cheapest cost first. Guarantees optimal path.',
  },
  {
    id: 'astar',
    name: 'A*',
    color: '#4ade80',
    timeComplexity: 'O(E log V)',
    spaceComplexity: 'O(V)',
    description: 'Heuristic-guided. Faster than Dijkstra on real maps.',
  },
  {
    id: 'bfs',
    name: 'BFS',
    color: '#fb923c',
    timeComplexity: 'O(V + E)',
    spaceComplexity: 'O(V)',
    description: 'Ignores weights. Finds fewest hops, not lowest cost.',
  },
  {
    id: 'bellmanford',
    name: 'Bellman-Ford',
    color: '#f472b6',
    timeComplexity: 'O(V × E)',
    spaceComplexity: 'O(V)',
    description: 'Relaxes all edges repeatedly. Handles negative weights.',
  },
];

const algoFns = { dijkstra, astar: aStar, bfs, bellmanford: bellmanFord };

export function useAlgorithm(graphNodes, graphAdj, getEffectiveWeight) {
  const [results, setResults]               = useState({});
  const [isRunning, setIsRunning]           = useState(false);
  const [animationProgress, setAnimationProgress] = useState({});

  // Heuristic for A*: real-world distance between two node IDs
  const heuristic = useCallback((aId, bId) => {
    const na = graphNodes[aId], nb = graphNodes[bId];
    if (!na || !nb) return 0;
    return haversine(na.lat, na.lon, nb.lat, nb.lon);
  }, [graphNodes]);

  // startNode / endNode are the objects returned by snapToNearest —
  // either a real graph node { id, lat, lon } or a virtual node
  // { id, lat, lon, isVirtual, hostEdge }. We inject virtual nodes
  // into temporary adj/nodes copies before running each algorithm,
  // so the base graph is never mutated.
  const runAll = useCallback(async (startNode, endNode, onPathReady) => {
    if (!startNode || !endNode) {
      alert('Place both START (🚑) and END (🏥) on the map first.');
      return;
    }

    setResults({});
    setAnimationProgress({});
    setIsRunning(true);

    // Build the patched adj and nodes once — shared across all four algorithms.
    let { adj: patchedAdj, nodes: patchedNodes } = injectVirtualNode(graphAdj, graphNodes, startNode);
    ({ adj: patchedAdj, nodes: patchedNodes }    = injectVirtualNode(patchedAdj, patchedNodes, endNode));

    const startId = String(startNode.id);
    const endId   = String(endNode.id);

    // Rebuild heuristic using patched nodes (includes virtual coords).
    const patchedHeuristic = (aId, bId) => {
      const na = patchedNodes[aId], nb = patchedNodes[bId];
      if (!na || !nb) return 0;
      return haversine(na.lat, na.lon, nb.lat, nb.lon);
    };

    const rawResults = {};

    for (const algo of ALGORITHMS) {
      const fn = algoFns[algo.id];
      const t0 = performance.now();
      const result = fn(patchedAdj, startId, endId, getEffectiveWeight, patchedHeuristic);
      const t1 = performance.now();
      rawResults[algo.id] = {
        ...result,
        timeMs: +(t1 - t0).toFixed(2),
        nodesExplored: result.visited.length,
        pathLength: result.path.length,
        found: result.path.length > 0,
      };
    }

    // Animate progress bars then reveal paths one by one
    for (const algo of ALGORITHMS) {
      const res = rawResults[algo.id];

      await new Promise(resolve => {
        let p = 0;
        const step = () => {
          p = Math.min(100, p + 5);
          setResults(prev => ({ ...prev, [algo.id]: { ...res, _progress: p } }));
          setAnimationProgress(prev => ({ ...prev, [algo.id]: p }));
          if (p < 100) setTimeout(step, 12);
          else resolve();
        };
        step();
      });

      // Tell MapCanvas to draw this algo's path
      onPathReady(algo, res.path);
      await new Promise(r => setTimeout(r, 180));
    }

    setIsRunning(false);
  }, [graphAdj, getEffectiveWeight, heuristic]);

  const reset = useCallback(() => {
    setResults({});
    setAnimationProgress({});
    setIsRunning(false);
  }, []);

  return { results, isRunning, animationProgress, runAll, reset, ALGORITHMS };
}
