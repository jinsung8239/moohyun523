import React from 'react';
import { AudioEngine, type Track } from '../audio/AudioEngine';
import { Settings, Music, Radio, Sliders } from 'lucide-react';

interface ArrangementEditorProps {
  tracks: Track[];
  bpm: number;
  onBpmChange: (bpm: number) => void;
  loopStart: number;
  loopEnd: number;
  onLoopChange: (start: number, end: number) => void;
  onExportWav: () => void;
  onExportMidi: () => void;
  isExportingWav: boolean;
  totalSteps: number;
}

export const ArrangementEditor: React.FC<ArrangementEditorProps> = ({
  tracks,
  bpm,
  onBpmChange,
  loopStart,
  loopEnd,
  onLoopChange,
  onExportWav,
  onExportMidi,
  isExportingWav,
  totalSteps,
}) => {
  const engine = AudioEngine.getInstance();
  const sampleRate = engine.ctx?.sampleRate || 44100;
  const audioState = engine.ctx?.state || 'stopped';

  // Count tracks by type
  const synthCount = tracks.filter((t) => t.type === 'synth').length;
  const drumCount = tracks.filter((t) => t.type === 'drum').length;
  const audioCount = tracks.filter((t) => t.type === 'audio').length;

  return (
    <div className="arrangement-editor-panel">
      <div className="panel-header">
        <div className="seq-title-group">
          <Settings size={14} className="title-icon" style={{ marginRight: '6px' }} />
          <h3>PROJECT ARRANGEMENT & MASTERING</h3>
        </div>
      </div>

      <div className="arranger-details-grid">
        {/* Card 1: Project Metadata & BPM */}
        <div className="arrange-card">
          <h4 className="card-title">Project Tempo</h4>
          <div className="card-content">
            <div className="bpm-slider-group">
              <span className="lbl">BPM Slider</span>
              <input
                type="range"
                min="60"
                max="180"
                step="1"
                value={bpm}
                onChange={(e) => onBpmChange(Number(e.target.value))}
                className="horizontal-bpm-slider"
              />
              <div className="bpm-readout" style={{ color: 'var(--accent-active)', fontWeight: 'bold' }}>
                {bpm.toFixed(1)} BPM
              </div>
            </div>

            <div className="loop-selection-info" style={{ marginTop: '14px' }}>
              <span className="lbl">Active Loop Bounds</span>
              <div className="lcd-loop-controls" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                <input
                  type="number"
                  min="0"
                  max={totalSteps - 1}
                  value={loopStart}
                  onChange={(e) => {
                    const startVal = Math.max(0, Math.min(Number(e.target.value), loopEnd - 1));
                    onLoopChange(startVal, loopEnd);
                  }}
                  className="lcd-loop-num"
                  style={{
                    background: '#141414',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    width: '44px',
                    textAlign: 'center',
                    fontFamily: 'Share Tech Mono, monospace',
                    fontSize: '11px',
                    outline: 'none'
                  }}
                />
                <span style={{ color: 'var(--text-secondary)' }}>-</span>
                <input
                  type="number"
                  min="1"
                  max={totalSteps}
                  value={loopEnd}
                  onChange={(e) => {
                    const endVal = Math.min(totalSteps, Math.max(Number(e.target.value), loopStart + 1));
                    onLoopChange(loopStart, endVal);
                  }}
                  className="lcd-loop-num"
                  style={{
                    background: '#141414',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    width: '44px',
                    textAlign: 'center',
                    fontFamily: 'Share Tech Mono, monospace',
                    fontSize: '11px',
                    outline: 'none'
                  }}
                />
              </div>
              <div className="bounds-display" style={{ marginTop: '6px', fontSize: '9px', color: 'var(--text-secondary)' }}>
                Width: {loopEnd - loopStart} steps
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Track Statistics */}
        <div className="arrange-card">
          <h4 className="card-title">Project Stem Statistics</h4>
          <div className="card-content stats-list">
            <div className="stat-row">
              <span className="stat-label"><Music size={12} className="inline-icon synth" style={{ color: 'var(--accent-midi)', marginRight: '6px' }} /> Synthesizer Tracks</span>
              <span className="stat-val">{synthCount}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label"><Radio size={12} className="inline-icon drum" style={{ color: 'var(--accent-active)', marginRight: '6px' }} /> Drum Machine Tracks</span>
              <span className="stat-val">{drumCount}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label"><Sliders size={12} className="inline-icon audio" style={{ color: 'var(--audio-pulse)', marginRight: '6px' }} /> Audio Sample Channels</span>
              <span className="stat-val">{audioCount}</span>
            </div>
            <div className="divider-h" style={{ margin: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }} />
            <div className="stat-row total" style={{ fontWeight: 'bold', color: '#fff' }}>
              <span className="stat-label">Total Audio Stems</span>
              <span className="stat-val">{tracks.length}</span>
            </div>
          </div>
        </div>

        {/* Card 3: Web Audio Pipeline Diagnostic */}
        <div className="arrange-card">
          <h4 className="card-title">Audio Pipeline Diagnostics</h4>
          <div className="card-content diagnostics">
            <div className="diag-row">
              <span className="lbl">DSP Sample Rate:</span>
              <span className="val" style={{ color: 'var(--accent-midi)' }}>{sampleRate} Hz</span>
            </div>
            <div className="diag-row">
              <span className="lbl">WebAudio State:</span>
              <span className={`val status-tag ${audioState}`} style={{ color: audioState === 'running' ? 'var(--neon-green)' : 'var(--neon-amber)' }}>
                {audioState.toUpperCase()}
              </span>
            </div>
            <div className="diag-row">
              <span className="lbl">Brickwall Limiter:</span>
              <span className="val" style={{ color: 'var(--neon-green)' }}>ACTIVE (-1.0dB Knee)</span>
            </div>
            <div className="diag-row">
              <span className="lbl">Delay Division:</span>
              <span className="val">DOTTED EIGHTH (0.375s)</span>
            </div>
          </div>
        </div>

        {/* Card 4: Audio Mixdown Rendering */}
        <div className="arrange-card rendering-card">
          <h4 className="card-title">Bounce / Export Actions</h4>
          <div className="card-content rendering-actions">
            <button
              className="render-action-btn wav"
              onClick={onExportWav}
              disabled={isExportingWav || tracks.length === 0}
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(59, 177, 216, 0.1)',
                border: '1px solid var(--accent-active)',
                borderRadius: '4px',
                color: 'var(--accent-active)',
                fontWeight: 'bold',
                cursor: 'pointer',
                marginBottom: '8px'
              }}
            >
              {isExportingWav ? 'Exporting Mixdown...' : 'Render Master Mix (WAV)'}
            </button>
            <button
              className="render-action-btn midi"
              onClick={onExportMidi}
              disabled={tracks.length === 0}
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '4px',
                color: '#fff',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Export Project Sequence (MIDI)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
