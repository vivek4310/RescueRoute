/**
 * useAlgorithm.js  —  Web-Worker edition
 * ────────────────────────────────────────
 * All four algorithms now run in algorithmWorker.js (a background thread).
 * The main thread only handles UI updates, so "Find Routes" never freezes.
 *
 * Drop-in replacement: same API as the original hook.
 *   { results, isRunning, animationProgress, runAll, reset, ALGORITHMS }
 */
import { useState, useCallback, useRef } from 'react';
import { haversine, injectVirtualNode }  from './useOverpassGraph';

// ─── Algorithm metadata (display only — logic lives in the worker) ────────────
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

export function useAlgorithm(graphNodes, graphAdj, getEffectiveWeight, obstacles) {
  const [results, setResults]                     = useState({});
  const [isRunning, setIsRunning]                 = useState(false);
  const [animationProgress, setAnimationProgress] = useState({});

  // Keep a ref to the worker so it persists across re-renders and can be
  // terminated if the user triggers a new run before the previous one finishes.
  const workerRef = useRef(null);

  // ── runAll ────────────────────────────────────────────────────────────────
  // startNode / endNode: objects from snapToNearest — real or virtual nodes.
  // onPathReady(algo, path): callback MapCanvas uses to draw each path.
  const runAll = useCallback(async (startNode, endNode, onPathReady) => {
    if (!startNode || !endNode) {
      alert('Place both START (🚑) and END (🏥) on the map first.');
      return;
    }

    // Kill any in-flight worker from a previous run.
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    setResults({});
    setAnimationProgress({});
    setIsRunning(true);

    // Inject virtual nodes into temporary copies of adj + nodes.
    // The base graph is never mutated.
    let { adj: patchedAdj, nodes: patchedNodes } =
      injectVirtualNode(graphAdj, graphNodes, startNode);
    ({ adj: patchedAdj, nodes: patchedNodes } =
      injectVirtualNode(patchedAdj, patchedNodes, endNode));

    const startId = String(startNode.id);
    const endId   = String(endNode.id);

    // Extract obstacle sets from the hook-provided obstacles object.
    // (obstacles prop: { blockedNodes: Set, floodNodes: Set, fireNodes: Set })
    const blocked = obstacles?.blockedNodes ? [...obstacles.blockedNodes] : [];
    const flood   = obstacles?.floodNodes   ? [...obstacles.floodNodes]   : [];
    const fire    = obstacles?.fireNodes    ? [...obstacles.fireNodes]    : [];

    // Spin up the worker.
    // Vite exposes Web Workers via the `?worker` suffix import, but since this
    // hook is a plain .js file we use the URL constructor which works with Vite,
    // CRA (with react-app-rewired), and plain webpack alike.
    const worker = new Worker(
      new URL('../workers/algorithmWorker.js', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    // Collect results as they arrive, then animate sequentially.
    const received = {};

    worker.onmessage = async ({ data }) => {
      if (data.type === 'RESULT') {
        received[data.algoId] = data.result;

        // Animate the progress bar for this algo.
        const res = data.result;
        await new Promise(resolve => {
          let p = 0;
          const step = () => {
            p = Math.min(100, p + 5);
            setResults(prev       => ({ ...prev, [data.algoId]: { ...res, _progress: p } }));
            setAnimationProgress(prev => ({ ...prev, [data.algoId]: p }));
            if (p < 100) setTimeout(step, 12);
            else resolve();
          };
          step();
        });

        // Draw the path on the map.
        const algoMeta = ALGORITHMS.find(a => a.id === data.algoId);
        if (algoMeta) onPathReady(algoMeta, res.path);
      }

      if (data.type === 'DONE') {
        setIsRunning(false);
        worker.terminate();
        workerRef.current = null;
      }

      if (data.type === 'ERROR') {
        console.error('Algorithm worker error:', data.message);
        setIsRunning(false);
        worker.terminate();
        workerRef.current = null;
      }
    };

    worker.onerror = (err) => {
      console.error('Worker crashed:', err);
      setIsRunning(false);
      workerRef.current = null;
    };

    // Send the graph to the worker.
    // NOTE: patchedAdj and patchedNodes are plain objects → transferable via
    //       structured clone. For very large graphs this clone is ~50-150 ms
    //       (done once) vs blocking the main thread for 2-10 s previously.
    worker.postMessage({
      type: 'RUN',
      payload: {
        adj:     patchedAdj,
        nodes:   patchedNodes,
        startId,
        endId,
        obstacles: { blocked, flood, fire },
      },
    });
  }, [graphAdj, graphNodes, obstacles]);

  // ── reset ─────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setResults({});
    setAnimationProgress({});
    setIsRunning(false);
  }, []);

  return { results, isRunning, animationProgress, runAll, reset, ALGORITHMS };
}
