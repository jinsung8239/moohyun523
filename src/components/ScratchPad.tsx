import React, { useState } from 'react';
import { type Track } from '../audio/AudioEngine';
import { Copy, ArrowDown, Sparkles } from 'lucide-react';

interface ScratchPadProps {
  tracks: Track[];
  onUpdateTracks: () => void;
}

export const ScratchPad: React.FC<ScratchPadProps> = ({ tracks, onUpdateTracks }) => {
  const [scratchData, setScratchData] = useState<{ [trackId: string]: any }>({});

  const handleCopyFromMain = () => {
    const copy: { [trackId: string]: any } = {};
    tracks.forEach(t => {
      copy[t.id] = {
        steps: JSON.parse(JSON.stringify(t.steps || {})),
        drumSteps: JSON.parse(JSON.stringify(t.drumSteps || {}))
      };
    });
    setScratchData(copy);
  };

  const handleApplyToMain = () => {
    tracks.forEach(t => {
      if (scratchData[t.id]) {
        t.steps = JSON.parse(JSON.stringify(scratchData[t.id].steps || {}));
        t.drumSteps = JSON.parse(JSON.stringify(scratchData[t.id].drumSteps || {}));
      }
    });
    onUpdateTracks();
  };

  return (
    <div className="scratch-pad-container" style={{
      backgroundColor: '#0d111a',
      borderRadius: '8px',
      border: '1px solid rgba(0, 242, 254, 0.2)',
      padding: '16px',
      margin: '12px 0',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={18} style={{ color: '#00f2fe' }} />
          <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#00f2fe', letterSpacing: '1px' }}>
            STUDIO ONE SCRATCH PAD (TRIAL WORKBENCH)
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleCopyFromMain}
            className="clear-pattern-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '4px 10px' }}
          >
            <Copy size={12} /> Copy Main Timeline
          </button>

          <button
            onClick={handleApplyToMain}
            className="clear-pattern-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '4px 10px', backgroundColor: '#00f2fe', color: '#000', fontWeight: 'bold' }}
          >
            <ArrowDown size={12} /> Apply to Main Timeline
          </button>
        </div>
      </div>

      <p style={{ fontSize: '11px', color: '#8b9bb4', marginBottom: '12px' }}>
        Experiment with alternative song arrangements non-destructively. Copy your current timeline, tweak patterns here, and apply when ready!
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
        {tracks.map(t => {
          const tScratch = scratchData[t.id];
          const hasData = tScratch && ((tScratch.steps && Object.keys(tScratch.steps).length > 0) || (tScratch.drumSteps && Object.keys(tScratch.drumSteps).length > 0));

          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#131826', padding: '8px 12px', borderRadius: '6px', borderLeft: `4px solid ${t.color}` }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', width: '120px', color: t.color }}>{t.name}</span>
              <div style={{ flex: 1, height: '24px', backgroundColor: '#090b12', borderRadius: '4px', display: 'flex', alignItems: 'center', padding: '0 8px' }}>
                {hasData ? (
                  <span style={{ fontSize: '10px', color: '#00f2fe' }}>✓ Trial Sequence Prepared ({Object.keys(tScratch.steps || {}).length} active steps)</span>
                ) : (
                  <span style={{ fontSize: '10px', color: '#4a5568' }}>Empty (Copy main timeline to populate)</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
