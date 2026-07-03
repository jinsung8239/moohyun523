import React, { useState } from 'react';
import { type Track } from '../audio/AudioEngine';
import { X, GitFork, Check } from 'lucide-react';

interface RoutingMatrixProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: Track[];
}

export const RoutingMatrix: React.FC<RoutingMatrixProps> = ({ isOpen, onClose, tracks }) => {
  const [matrixState, setMatrixState] = useState<{ [key: string]: boolean }>({});

  if (!isOpen) return null;

  const destinations = [
    { id: 'master', name: 'Master Out' },
    { id: 'delay_bus', name: 'Space Delay Send' },
    { id: 'reverb_bus', name: 'Reverb Send' },
    { id: 'submix_1', name: 'Submix Bus 1' }
  ];

  const toggleConnection = (trackId: string, destId: string) => {
    const key = `${trackId}:${destId}`;
    setMatrixState(prev => ({
      ...prev,
      [key]: !(prev[key] ?? true) // default connected
    }));
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        width: '640px',
        maxHeight: '80vh',
        backgroundColor: '#0d111a',
        border: '1px solid rgba(156, 39, 176, 0.3)',
        borderRadius: '12px',
        padding: '20px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GitFork size={20} style={{ color: '#9c27b0' }} />
            <span style={{ fontWeight: 'bold', fontSize: '15px', color: '#fff', letterSpacing: '0.5px' }}>
              REAPER BUS & SIGNAL ROUTING MATRIX
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8b9bb4', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <p style={{ fontSize: '11px', color: '#8b9bb4', marginBottom: '16px' }}>
          Configure audio signal flow and send routing for each track independently.
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th style={{ textAlign: 'left', padding: '10px', fontSize: '12px', color: '#8b9bb4' }}>SOURCE TRACK</th>
                {destinations.map(d => (
                  <th key={d.id} style={{ textAlign: 'center', padding: '10px', fontSize: '11px', color: '#9c27b0' }}>
                    {d.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tracks.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '10px', fontSize: '12px', fontWeight: 'bold', color: t.color }}>
                    {t.name}
                  </td>
                  {destinations.map(d => {
                    const key = `${t.id}:${d.id}`;
                    const isConnected = matrixState[key] ?? true;

                    return (
                      <td key={d.id} style={{ textAlign: 'center', padding: '10px' }}>
                        <button
                          onClick={() => toggleConnection(t.id, d.id)}
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '4px',
                            border: isConnected ? `1px solid ${t.color}` : '1px solid rgba(255,255,255,0.1)',
                            backgroundColor: isConnected ? `${t.color}33` : '#131826',
                            color: isConnected ? t.color : 'transparent',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {isConnected && <Check size={14} />}
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
    </div>
  );
};
