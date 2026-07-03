import React, { useRef, useState } from 'react';
import { Play, Square, Circle, Download, Loader, Repeat, Maximize2, Minimize2, SkipBack, ChevronDown, Folder } from 'lucide-react';

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
  libraryOpen: boolean;
  onToggleLibrary: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  isPlaying,
  bpm,
  onPlayToggle,
  onStop,
  onBpmChange,
  onExportWav,
  isExportingWav,
  loopEnabled,
  onLoopEnabledToggle,
  isFullscreen,
  onFullscreenToggle,
  activeTab,
  onTabChange,
  onOpenActionManager,
  libraryOpen,
  onToggleLibrary,
}) => {
  const [isEditingBpm, setIsEditingBpm] = useState(false);
  const [tempBpmStr, setTempBpmStr] = useState(bpm.toFixed(2));
  const dragStartY = useRef<number | null>(null);
  const startBpm = useRef<number>(bpm);

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
      {/* 1. Brand Logo (Left) */}
      <div className="navbar-brand-container">
        <span className="navbar-brand-title">Logic Pro</span>
        <span className="navbar-brand-subtitle">Web</span>
      </div>

      {/* 2. Audio Control Transport (Center Left) */}
      <div className="navbar-transport-set">
        <button
          className="transport-btn skip-back"
          onClick={onStop}
          title="Skip to start"
        >
          <SkipBack size={13} fill="currentColor" />
        </button>

        <button
          className={`transport-btn play ${isPlaying ? 'active' : ''}`}
          onClick={onPlayToggle}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          <Play size={13} fill="currentColor" />
        </button>

        <button
          className="transport-btn stop"
          onClick={onStop}
          title="Stop"
        >
          <Square size={13} fill="currentColor" />
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
          title={loopEnabled ? "Disable Loop" : "Enable Loop"}
        >
          <Repeat size={12} />
        </button>
      </div>

      {/* 3. Logic Web LCD Panel (Center) */}
      <div className="navbar-lcd-display">
        {/* BPM drag/type controller */}
        {isEditingBpm ? (
          <div className="lcd-section bpm-drag-section editing">
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
            <span className="lcd-sec-label">BPM</span>
          </div>
        ) : (
          <div
            className="lcd-section bpm-drag-section"
            onMouseDown={handleBpmMouseDown}
            onDoubleClick={handleBpmDoubleClick}
            title="Double-click to type BPM, or drag up/down to adjust"
          >
            <span className="lcd-sec-value tempo-val">{Math.round(bpm)}</span>
            <span className="lcd-sec-label">BPM</span>
          </div>
        )}

        <div className="lcd-divider" />

        {/* Time Signature */}
        <div className="lcd-section time-sig-section">
          <span className="lcd-sec-value">4/4</span>
          <span className="lcd-sec-label">Time</span>
        </div>

        <div className="lcd-divider" />

        {/* Song Title / Dropdown */}
        <div className="lcd-section song-title-section">
          <span className="lcd-sec-value truncate">New Song</span>
          <ChevronDown size={10} className="lcd-chevron-icon" />
        </div>
      </div>

      {/* 4. Action Buttons & Export & Toggles (Right) */}
      <div className="navbar-actions-set">
        {/* Workspace Mode Tabs */}
        <div className="mode-tabs-wrapper">
          <button
            className={`preset-select ${activeTab === 'arranger' ? 'active' : ''}`}
            onClick={() => onTabChange('arranger')}
          >
            Timeline
          </button>
          <button
            className={`preset-select ${activeTab === 'liveLoops' ? 'active' : ''}`}
            onClick={() => onTabChange('liveLoops')}
          >
            Live Loops
          </button>
          <button
            className={`preset-select ${activeTab === 'scratchPad' ? 'active' : ''}`}
            onClick={() => onTabChange('scratchPad')}
          >
            Scratch Pad
          </button>
        </div>

        <div className="divider-y" />

        {/* Export Button */}
        <button
          className="navbar-export-btn main-export-btn"
          onClick={onExportWav}
          disabled={isExportingWav}
          title="Export project to WAV file"
        >
          {isExportingWav ? <Loader size={12} className="animate-spin" /> : <Download size={12} />}
          <span>{isExportingWav ? 'Exporting...' : 'Export'}</span>
        </button>

        <div className="divider-y" />

        {/* Action modal shortcuts & routing Matrix */}
        <button 
          className="icon-only-action-btn"
          onClick={onOpenActionManager}
          title="Shortcuts Manager (?)"
        >
          ?
        </button>

        {/* Library Folder Toggle */}
        <button
          className={`icon-only-action-btn ${libraryOpen ? 'active' : ''}`}
          onClick={onToggleLibrary}
          title="Toggle Project Explorer/Library"
        >
          <Folder size={13} />
        </button>

        {/* Fullscreen Button */}
        <button
          className="icon-only-action-btn"
          onClick={onFullscreenToggle}
          title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
        >
          {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </div>
    </header>
  );
};
