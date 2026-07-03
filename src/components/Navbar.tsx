import React, { useRef, useState } from 'react';
import { Play, Square, Circle, Download, Loader, Wifi, WifiOff, Repeat, Maximize2, Minimize2 } from 'lucide-react';

interface NavbarProps {
  isPlaying: boolean;
  bpm: number;
  currentStep: number;
  onPlayToggle: () => void;
  onStop: () => void;
  onBpmChange: (bpm: number) => void;
  onAddTrack: (type: 'synth' | 'drum' | 'audio') => void;
  onExportWav: () => void;
  onExportMidi: () => void;
  loopStart: number;
  loopEnd: number;
  onLoopChange: (start: number, end: number) => void;
  isExportingWav: boolean;
  totalSteps: number;
  onTotalStepsChange: (steps: number) => void;
  loopEnabled: boolean;
  onLoopEnabledToggle: () => void;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
  activeTab: 'arranger' | 'liveLoops' | 'scratchPad';
  onTabChange: (tab: 'arranger' | 'liveLoops' | 'scratchPad') => void;
  onOpenActionManager: () => void;
  onOpenRoutingMatrix: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  isPlaying,
  bpm,
  currentStep,
  onPlayToggle,
  onStop,
  onBpmChange,
  onAddTrack,
  onExportWav,
  onExportMidi,
  loopStart: loopStart,
  loopEnd: loopEnd,
  onLoopChange: onLoopChange,
  isExportingWav: isExportingWav,
  totalSteps: totalSteps,
  onTotalStepsChange: onTotalStepsChange,
  loopEnabled,
  onLoopEnabledToggle,
  isFullscreen,
  onFullscreenToggle,
  activeTab,
  onTabChange,
  onOpenActionManager,
  onOpenRoutingMatrix,
  onExportJson,
  onImportJson,
}) => {
  const [websocketOk, setWebsocketOk] = useState(true);
  const [isEditingBpm, setIsEditingBpm] = useState(false);
  const [tempBpmStr, setTempBpmStr] = useState(bpm.toFixed(2));
  const dragStartY = useRef<number | null>(null);
  const startBpm = useRef<number>(bpm);

  const formatTime = (step: number) => {
    // 16 steps per bar
    const bar = Math.floor(step / 16) + 1;
    const beat = Math.floor((step % 16) / 4) + 1;
    const tick = ((step % 4) * 240) + 1; // 240 ticks per 16th note, e.g. 001 to 960 ticks
    
    const pad = (num: number, size: number) => {
      let s = num + '';
      while (s.length < size) s = '0' + s;
      return s;
    };
    
    return `${pad(bar, 3)}:${pad(beat, 2)}:${pad(tick, 3)}`;
  };

  // BPM mouse drag handler
  const handleBpmMouseDown = (e: React.MouseEvent) => {
    dragStartY.current = e.clientY;
    startBpm.current = bpm;
    window.addEventListener('mousemove', handleBpmMouseMove);
    window.addEventListener('mouseup', handleBpmMouseUp);
    // Set cursor style globally
    document.body.style.cursor = 'ns-resize';
  };

  const handleBpmMouseMove = (e: MouseEvent) => {
    if (dragStartY.current === null) return;
    const deltaY = dragStartY.current - e.clientY;
    // 0.15 BPM units per pixel dragged
    const nextBpm = parseFloat(Math.max(60, Math.min(180, startBpm.current + deltaY * 0.15)).toFixed(2));
    onBpmChange(nextBpm);
  };

  const handleBpmMouseUp = () => {
    dragStartY.current = null;
    window.removeEventListener('mousemove', handleBpmMouseMove);
    window.removeEventListener('mouseup', handleBpmMouseUp);
    document.body.style.cursor = 'default';
  };

  const handleLoopStartChange = (val: number) => {
    const nextStart = Math.max(0, Math.min(val, loopEnd - 1));
    onLoopChange(nextStart, loopEnd);
  };

  const handleLoopEndChange = (val: number) => {
    const nextEnd = Math.min(totalSteps, Math.max(val, loopStart + 1));
    onLoopChange(loopStart, nextEnd);
  };

  const handleBpmDoubleClick = () => {
    setTempBpmStr(bpm.toFixed(2));
    setIsEditingBpm(true);
  };

  const handleBpmSubmit = () => {
    let parsed = parseFloat(tempBpmStr);
    if (!isNaN(parsed)) {
      parsed = Math.max(60, Math.min(180, parsed));
      onBpmChange(parsed);
    }
    setIsEditingBpm(false);
  };

  return (
    <header className="navbar">
      {/* 1. Logo & Collaborative Status (Left) */}
      <div className="navbar-logo-collab">
        <div className="navbar-logo">
          <span className="logo-neon">Logic Pro</span>
          <span className="logo-sub">Web</span>
        </div>
        
        {/* Collaborative Indicator */}
        <div
          className={`collab-sync-indicator ${websocketOk ? 'healthy' : 'failed'}`}
          onClick={() => setWebsocketOk(!websocketOk)}
          title={websocketOk ? "Collaborators Sync active (WebSocket Connected)" : "Connection lost. Click to reconnect"}
        >
          {websocketOk ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span className="collab-pulse-dot" />
        </div>
      </div>

      {/* 2. Audio Control Transport (Center Left) */}
      <div className="navbar-transport-set">
        <button
          className="transport-btn stop"
          onClick={onStop}
          title="Stop (Esc / Spacebar sync)"
        >
          <Square size={13} fill="currentColor" />
        </button>

        <button
          className={`transport-btn play ${isPlaying ? 'active' : ''}`}
          onClick={onPlayToggle}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          <Play size={13} fill="currentColor" />
        </button>

        <button
          className={`transport-btn record ${isPlaying ? 'recording' : ''}`}
          onClick={onPlayToggle}
          title="Record"
        >
          <Circle size={11} fill="currentColor" className={isPlaying ? 'pulse-rec' : ''} />
        </button>

        <button
          className={`transport-btn cycle ${loopEnabled ? 'active' : ''}`}
          onClick={onLoopEnabledToggle}
          title={loopEnabled ? "Disable Loop (Cycle)" : "Enable Loop (Cycle)"}
        >
          <Repeat size={12} />
        </button>
      </div>

      {/* 3. Logic Retro LCD Display (Center) */}
      <div className="navbar-lcd-display">
        {/* Playhead Position */}
        <div className="lcd-section position-section">
          <span className="lcd-sec-label">BEAT POSITION</span>
          <span className="lcd-sec-value">{formatTime(currentStep)}</span>
        </div>

        <div className="lcd-divider" />

        {/* BPM drag controller */}
        {isEditingBpm ? (
          <div className="lcd-section bpm-drag-section editing">
            <span className="lcd-sec-label">TEMPO</span>
            <input
              type="number"
              min="60"
              max="180"
              step="0.01"
              value={tempBpmStr}
              onChange={(e) => setTempBpmStr(e.target.value)}
              onBlur={handleBpmSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleBpmSubmit();
                if (e.key === 'Escape') setIsEditingBpm(false);
              }}
              autoFocus
              className="lcd-bpm-input"
            />
          </div>
        ) : (
          <div
            className="lcd-section bpm-drag-section"
            onMouseDown={handleBpmMouseDown}
            onDoubleClick={handleBpmDoubleClick}
            title="Double-click to type BPM, or Click & Drag UP/DOWN to adjust"
          >
            <span className="lcd-sec-label">TEMPO</span>
            <span className="lcd-sec-value tempo-val">
              {bpm.toFixed(2)} <span className="lcd-sec-unit">BPM</span>
            </span>
          </div>
        )}

        <div className="lcd-divider" />

        {/* Loop range */}
        <div className="lcd-section loop-region-section">
          <span className="lcd-sec-label">LOOP BOUNDS</span>
          <div className="lcd-loop-controls">
            <input
              type="number"
              min="0"
              max={totalSteps - 1}
              value={loopStart}
              onChange={(e) => handleLoopStartChange(Number(e.target.value))}
              className="lcd-loop-num"
            />
            <span className="lcd-loop-dash">-</span>
            <input
              type="number"
              min="1"
              max={totalSteps}
              value={loopEnd}
              onChange={(e) => handleLoopEndChange(Number(e.target.value))}
              className="lcd-loop-num"
            />
          </div>
        </div>

        <div className="lcd-divider" />

        {/* Project Length in Bars */}
        <div className="lcd-section project-length-section">
          <span className="lcd-sec-label">TOTAL BARS</span>
          <input
            type="number"
            min="1"
            max="1024"
            value={totalSteps / 16}
            onChange={(e) => {
              const bars = Math.max(1, Math.min(1024, Number(e.target.value)));
              onTotalStepsChange(bars * 16);
            }}
            className="lcd-loop-num"
            title="Total project length in bars (1 bar = 16 steps)"
          />
        </div>
      </div>

      {/* 4. Workspace View Tabs & Action Tools (Right) */}
      <div className="navbar-actions-set">
        {/* Workspace Mode Tabs */}
        <div style={{ display: 'flex', gap: '4px', backgroundColor: '#0c0f1d', padding: '2px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            className={`preset-select ${activeTab === 'arranger' ? 'active' : ''}`}
            style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '4px', border: 'none', backgroundColor: activeTab === 'arranger' ? '#3BB1D8' : 'transparent', color: activeTab === 'arranger' ? '#000' : '#8b9bb4', fontWeight: 'bold', cursor: 'pointer' }}
            onClick={() => onTabChange('arranger')}
          >
            Timeline
          </button>
          <button
            className={`preset-select ${activeTab === 'liveLoops' ? 'active' : ''}`}
            style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '4px', border: 'none', backgroundColor: activeTab === 'liveLoops' ? '#9c27b0' : 'transparent', color: activeTab === 'liveLoops' ? '#fff' : '#8b9bb4', fontWeight: 'bold', cursor: 'pointer' }}
            onClick={() => onTabChange('liveLoops')}
          >
            Live Loops
          </button>
          <button
            className={`preset-select ${activeTab === 'scratchPad' ? 'active' : ''}`}
            style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '4px', border: 'none', backgroundColor: activeTab === 'scratchPad' ? '#00f2fe' : 'transparent', color: activeTab === 'scratchPad' ? '#000' : '#8b9bb4', fontWeight: 'bold', cursor: 'pointer' }}
            onClick={() => onTabChange('scratchPad')}
          >
            Scratch Pad
          </button>
        </div>

        <div className="divider-y" />

        <button className="navbar-track-btn synth" onClick={() => onAddTrack('synth')}>
          + Synth
        </button>
        <button className="navbar-track-btn drum" onClick={() => onAddTrack('drum')}>
          + Drum
        </button>
        <button className="navbar-track-btn audio" onClick={() => onAddTrack('audio')}>
          + Audio
        </button>
        
        <div className="divider-y" />

        <button
          className="navbar-export-btn"
          onClick={onOpenActionManager}
          title="Reaper Action Shortcuts Manager (?)"
          style={{ backgroundColor: '#1f293d', color: '#00f2fe', border: '1px solid rgba(0,242,254,0.3)' }}
        >
          <span>Actions (?)</span>
        </button>

        <button
          className="navbar-export-btn"
          onClick={onOpenRoutingMatrix}
          title="Bus & FX Signal Routing Matrix"
          style={{ backgroundColor: '#2d1b36', color: '#9c27b0', border: '1px solid rgba(156,39,176,0.3)' }}
        >
          <span>Routing</span>
        </button>

        <button
          className="navbar-export-btn"
          onClick={onExportJson}
          title="Export Project Backup JSON"
          style={{ backgroundColor: '#13281e', color: '#4D9945' }}
        >
          <span>Save JSON</span>
        </button>

        <button
          className="navbar-export-btn"
          onClick={onImportJson}
          title="Import Project Backup JSON"
          style={{ backgroundColor: '#13281e', color: '#4D9945' }}
        >
          <span>Load JSON</span>
        </button>

        <div className="divider-y" />

        <button
          className="navbar-export-btn wav"
          onClick={onExportWav}
          disabled={isExportingWav}
          title="Export mix to CD Quality WAV file"
        >
          {isExportingWav ? <Loader size={12} className="animate-spin" /> : <Download size={12} />}
          <span>{isExportingWav ? 'Exporting...' : 'WAV Export'}</span>
        </button>

        <button
          className="navbar-export-btn midi"
          onClick={onExportMidi}
          title="Export sequence notes to Standard MIDI file (.mid)"
        >
          <Download size={12} />
          <span>MIDI</span>
        </button>

        <button
          className="navbar-export-btn fullscreen"
          onClick={onFullscreenToggle}
          title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          style={{ color: 'var(--accent-active)' }}
        >
          {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          <span>{isFullscreen ? 'Exit Full' : 'Fullscreen'}</span>
        </button>
      </div>
    </header>
  );
};
