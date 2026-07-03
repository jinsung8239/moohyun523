import React, { useState } from 'react';
import { type Track, AudioEngine } from '../audio/AudioEngine';
import { Play, Square, Layers, Radio } from 'lucide-react';

interface LiveLoopsProps {
  tracks: Track[];
  onSelectTrack: (id: string) => void;
}

export const LiveLoops: React.FC<LiveLoopsProps> = ({ tracks, onSelectTrack }) => {
  const [activeCells, setActiveCells] = useState<{ [trackId: string]: number | null }>({});
  const engine = AudioEngine.getInstance();

  const handleCellClick = (track: Track, sceneIdx: number) => {
    const isCurrentlyActive = activeCells[track.id] === sceneIdx;
    const nextActive = isCurrentlyActive ? null : sceneIdx;

    setActiveCells(prev => ({
      ...prev,
      [track.id]: nextActive
    }));

    if (nextActive !== null) {
      engine.triggerTrackAudition(track, 'C4');
    }
  };

  const triggerScene = (sceneIdx: number) => {
    const updated: { [trackId: string]: number } = {};
    tracks.forEach(t => {
      updated[t.id] = sceneIdx;
      engine.triggerTrackAudition(t, 'C4');
    });
    setActiveCells(updated);
  };

  const stopAllLoops = () => {
    setActiveCells({});
  };

  return (
    <div className="live-loops-matrix-panel" style={{
      backgroundColor: '#0a0d17',
      borderRadius: '8px',
      border: '1px solid rgba(156, 39, 176, 0.3)',
      padding: '16px',
      margin: '12px 0',
      boxShadow: '0 4px 24px rgba(0, 0, 0, 0.5)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={18} style={{ color: '#9c27b0' }} />
          <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#9c27b0', letterSpacing: '1px' }}>
            LOGIC PRO LIVE LOOPS (CLIP MATRIX SESSION)
          </span>
        </div>

        <button
          onClick={stopAllLoops}
          className="clear-pattern-btn"
          style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '4px 10px', backgroundColor: '#e53e3e', color: '#fff' }}
        >
          <Square size={12} /> Stop All Cell Loops
        </button>
      </div>

      {/* Grid Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '6px' }}>
          <thead>
            <tr>
              <th style={{ width: '140px', fontSize: '11px', color: '#8b9bb4', textAlign: 'left' }}>TRACK</th>
              {Array.from({ length: 6 }).map((_, sceneIdx) => (
                <th key={sceneIdx} style={{ fontSize: '11px', color: '#9c27b0', textAlign: 'center' }}>
                  <button
                    onClick={() => triggerScene(sceneIdx)}
                    style={{
                      background: 'rgba(156, 39, 176, 0.15)',
                      border: '1px solid rgba(156, 39, 176, 0.4)',
                      borderRadius: '4px',
                      color: '#e91e63',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      padding: '2px 8px',
                      cursor: 'pointer'
                    }}
                  >
                    Scene {sceneIdx + 1} ▶
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tracks.map(t => (
              <tr key={t.id}>
                <td
                  onClick={() => onSelectTrack(t.id)}
                  style={{
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: t.color,
                    cursor: 'pointer',
                    padding: '8px',
                    backgroundColor: '#131826',
                    borderRadius: '6px'
                  }}
                >
                  {t.name}
                </td>
                {Array.from({ length: 6 }).map((_, sceneIdx) => {
                  const isActive = activeCells[t.id] === sceneIdx;

                  return (
                    <td key={sceneIdx} style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => handleCellClick(t, sceneIdx)}
                        style={{
                          width: '100%',
                          height: '36px',
                          borderRadius: '6px',
                          border: isActive ? `2px solid ${t.color}` : '1px solid rgba(255,255,255,0.06)',
                          backgroundColor: isActive ? `${t.color}33` : '#111524',
                          boxShadow: isActive ? `0 0 12px ${t.color}` : 'none',
                          color: isActive ? t.color : '#4a5568',
                          fontWeight: 'bold',
                          fontSize: '11px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {isActive ? <Radio size={14} className="pulse-icon" /> : <Play size={10} />}
                        {isActive ? 'LOOPING' : `Loop ${sceneIdx + 1}`}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
