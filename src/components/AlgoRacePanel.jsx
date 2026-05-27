export default function AlgoRacePanel({ ALGORITHMS, results, animationProgress, isRunning,highlightedAlgo,setHighlightedAlgo }) {
  return (
    <div style={{
      width: '260px',
      minWidth: '260px',
      background: 'rgba(8,12,22,0.98)',
      borderLeft: '1px solid rgba(255,255,255,0.07)',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      overflowY: 'auto',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        paddingBottom: '8px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444', animation: isRunning ? 'pulse 1s infinite' : 'none' }} />
        <span style={{ color: '#e2e8f0', fontSize: '11px', fontFamily: 'Share Tech Mono', letterSpacing: '0.12em' }}>
          ALGO RACE
        </span>
      </div>

      {ALGORITHMS.map(algo => {
        const result = results[algo.id];
        const progress = animationProgress[algo.id] || 0;
        const hasResult = !!result;
        const found = result?.found;

        return (
          <div
            key={algo.id}
            onClick={() =>
              setHighlightedAlgo(prev =>
                prev === algo.id ? null : algo.id
              )
            }
            style={{
              cursor: 'pointer',
              background:
                highlightedAlgo === algo.id
                  ? algo.color + '15'
                  : 'rgba(255,255,255,0.03)',
              border:
                highlightedAlgo === algo.id
                  ? `1px solid ${algo.color}`
                  : `1px solid ${
                      hasResult
                        ? algo.color + '40'
                        : 'rgba(255,255,255,0.06)'
                    }`,
              borderRadius: '8px',
              padding: '10px',
              transition: 'all 0.25s ease',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: algo.color,
                  boxShadow: hasResult ? `0 0 8px ${algo.color}` : 'none',
                }} />
                <span style={{
                  color: algo.color,
                  fontSize: '13px',
                  fontFamily: 'Rajdhani',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                }}>
                  {algo.name}
                </span>
              </div>
              {hasResult && (
                <span style={{
                  fontSize: '10px',
                  color: found ? '#4ade80' : '#ef4444',
                  fontFamily: 'Share Tech Mono',
                }}>
                  {found ? '✓ FOUND' : '✗ NO PATH'}
                </span>
              )}
            </div>

            {/* Progress bar */}
            {(isRunning || hasResult) && (
              <div style={{
                height: '3px',
                background: 'rgba(255,255,255,0.08)',
                borderRadius: '2px',
                marginBottom: '8px',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: algo.color,
                  borderRadius: '2px',
                  transition: 'width 0.1s',
                  boxShadow: `0 0 6px ${algo.color}`,
                }} />
              </div>
            )}

            {/* Stats */}
            {hasResult ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <StatRow label="Nodes explored" value={result.nodesExplored} color={algo.color} />
                <StatRow label="Path length" value={found ? result.pathLength : '—'} color={algo.color} />
                <StatRow label="Path cost" value={found ? (result.cost === Infinity ? '∞' : result.cost.toFixed(1)) : '—'} color={algo.color} />
                <StatRow label="Time" value={`${result.timeMs}ms`} color={algo.color} />
              </div>
            ) : (
              <div style={{ color: '#334155', fontSize: '11px', fontFamily: 'Share Tech Mono' }}>
                {isRunning && progress > 0 ? `${progress}% scanned...` : 'Awaiting start...'}
              </div>
            )}

            {/* Complexity */}
            <div style={{
              marginTop: '8px',
              paddingTop: '6px',
              borderTop: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div style={{ fontSize: '9px', color: '#475569', fontFamily: 'Share Tech Mono' }}>
                TIME: {algo.timeComplexity}
              </div>
              <div style={{ fontSize: '9px', color: '#475569', fontFamily: 'Share Tech Mono' }}>
                SPACE: {algo.spaceComplexity}
              </div>
            </div>
          </div>
        );
      })}

      {/* Winner badge */}
      {Object.keys(results).length === 4 && (
        <WinnerSummary results={results} ALGORITHMS={ALGORITHMS} />
      )}
    </div>
  );
}

function StatRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: '#64748b', fontSize: '10px', fontFamily: 'Share Tech Mono' }}>{label}</span>
      <span style={{ color: '#e2e8f0', fontSize: '11px', fontFamily: 'Share Tech Mono', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function WinnerSummary({ results, ALGORITHMS }) {
  const found = ALGORITHMS.filter(a => results[a.id]?.found);
  if (found.length === 0) return null;

  const fastest = found.reduce((a, b) =>
    results[a.id].timeMs < results[b.id].timeMs ? a : b
  );
  const fewest = found.reduce((a, b) =>
    results[a.id].nodesExplored < results[b.id].nodesExplored ? a : b
  );
  const optimal = found.reduce((a, b) =>
    results[a.id].cost < results[b.id].cost ? a : b
  );

  return (
    <div style={{
      background: 'rgba(250,204,21,0.06)',
      border: '1px solid rgba(250,204,21,0.2)',
      borderRadius: '8px',
      padding: '10px',
    }}>
      <div style={{ color: '#facc15', fontSize: '10px', fontFamily: 'Share Tech Mono', marginBottom: '6px', letterSpacing: '0.1em' }}>
        ⚡ VERDICT
      </div>
      <VerdictRow label="Fastest exec" algo={fastest} color={fastest.color} />
      <VerdictRow label="Fewest nodes" algo={fewest} color={fewest.color} />
      <VerdictRow label="Lowest cost" algo={optimal} color={optimal.color} />
    </div>
  );
}

function VerdictRow({ label, algo, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
      <span style={{ color: '#475569', fontSize: '10px', fontFamily: 'Share Tech Mono' }}>{label}</span>
      <span style={{ color, fontSize: '10px', fontFamily: 'Rajdhani', fontWeight: 700 }}>{algo.name}</span>
    </div>
  );
}
