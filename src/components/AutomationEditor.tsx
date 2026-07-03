import React, { useState } from 'react';
import { type Track } from '../audio/AudioEngine';
import { Power, Trash2 } from 'lucide-react';

interface AutomationEditorProps {
  tracks: Track[];
  selectedTrackId: string | null;
  onSelectTrack: (id: string) => void;
  onUpdateSteps: () => void;
  totalSteps: number;
}

export const AutomationEditor: React.FC<AutomationEditorProps> = ({
  tracks,
  selectedTrackId,
  onSelectTrack,
  onUpdateSteps,
  totalSteps,
}) => {
  const [activeParam, setActiveParam] = useState<'volume' | 'pan'>('volume');
  const [isDrawing, setIsDrawing] = useState(false);
  const BUFFER_STEPS = 128;

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId);

  // Initialize automation safely if missing
  const ensureAutomation = (track: Track) => {
    if (!track.automation) {
      track.automation = {
        volume: {},
        pan: {},
        enabled: false,
        activeParam: 'volume'
      };
    }
  };

  const handleTrackChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSelectTrack(e.target.value);
  };

  const toggleEnabled = () => {
    if (!selectedTrack) return;
    ensureAutomation(selectedTrack);
    selectedTrack.automation!.enabled = !selectedTrack.automation!.enabled;
    onUpdateSteps();
  };

  const handleParamChange = (param: 'volume' | 'pan') => {
    if (!selectedTrack) return;
    ensureAutomation(selectedTrack);
    selectedTrack.automation!.activeParam = param;
    setActiveParam(param);
    onUpdateSteps();
  };

  const handleStepValueChange = (stepIdx: number, rawVal: number) => {
    if (!selectedTrack) return;
    ensureAutomation(selectedTrack);
    
    if (activeParam === 'volume') {
      // Map rawVal (0 to 1) to volumeDb (-60 to 6)
      const dbVal = parseFloat((rawVal * 66 - 60).toFixed(1));
      selectedTrack.automation!.volume[stepIdx] = dbVal;
    } else {
      // Map rawVal (0 to 1) to pan (-1 to 1)
      const panVal = parseFloat((rawVal * 2 - 1).toFixed(2));
      selectedTrack.automation!.pan[stepIdx] = panVal;
    }
    onUpdateSteps();
  };

  const handleMouseDown = (stepIdx: number, e: React.MouseEvent) => {
    setIsDrawing(true);
    updateValueFromCoords(stepIdx, e);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (stepIdx: number, e: React.MouseEvent) => {
    if (!isDrawing) return;
    updateValueFromCoords(stepIdx, e);
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    window.removeEventListener('mouseup', handleMouseUp);
  };

  const updateValueFromCoords = (stepIdx: number, e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const height = rect.height;
    // Map vertical coordinate (0 is top, height is bottom) to value (0 to 1)
    const rawVal = Math.max(0, Math.min(1, 1 - relativeY / height));
    handleStepValueChange(stepIdx, rawVal);
  };

  const clearAutomation = () => {
    if (!selectedTrack) return;
    ensureAutomation(selectedTrack);
    if (activeParam === 'volume') {
      selectedTrack.automation!.volume = {};
    } else {
      selectedTrack.automation!.pan = {};
    }
    onUpdateSteps();
  };

  if (tracks.length === 0) {
    return (
      <div className="tab-fallback-alert">
        <span>No tracks available. Please add a track to configure automation.</span>
      </div>
    );
  }

  // Fallback to first track if none selected
  const track = selectedTrack || tracks[0];
  ensureAutomation(track);
  const autoConfig = track.automation!;
  const isAutoEnabled = autoConfig.enabled;
  const currentParam = autoConfig.activeParam || activeParam;

  return (
    <div className="automation-editor-panel">
      {/* Ribbon Controller */}
      <div className="panel-header">
        <div className="seq-title-group">
          <h3>AUTOMATION</h3>

          {/* Track Selector */}
          <select
            value={track.id}
            onChange={handleTrackChange}
            className="preset-select"
            style={{ minWidth: '140px' }}
          >
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {/* Parameter Picker */}
          <div className="param-tabs">
            <button
              className={`param-tab-btn ${currentParam === 'volume' ? 'active' : ''}`}
              onClick={() => handleParamChange('volume')}
            >
              Volume (dB)
            </button>
            <button
              className={`param-tab-btn ${currentParam === 'pan' ? 'active' : ''}`}
              onClick={() => handleParamChange('pan')}
            >
              Pan
            </button>
          </div>

          {/* Enable Toggle Button */}
          <button
            className={`power-toggle-btn ${isAutoEnabled ? 'on' : 'off'}`}
            onClick={toggleEnabled}
            title={isAutoEnabled ? "Bypass Automation" : "Enable Automation"}
            style={{ marginLeft: '12px' }}
          >
            <Power size={12} />
          </button>
          <span className="auto-status-lbl" style={{ color: isAutoEnabled ? 'var(--neon-green)' : 'var(--text-secondary)' }}>
            {isAutoEnabled ? 'AUTOMATION ACTIVE' : 'BYPASSED'}
          </span>
        </div>

        <button className="clear-pattern-btn" onClick={clearAutomation} title="Clear drawn points">
          <Trash2 size={13} style={{ marginRight: '4px' }} /> Clear Lane
        </button>
      </div>

      {/* Visual Step Board */}
      <div className="automation-grid-container">
        <div className="automation-grid">
          {Array.from({ length: totalSteps + BUFFER_STEPS }).map((_, stepIdx) => {
            // Find current value
            let displayVal = '---';
            let barHeightPercent = 0; // 0 to 100%
            let barColor = 'var(--neon-green)';

            if (currentParam === 'volume') {
              const db = autoConfig.volume[stepIdx];
              if (db !== undefined) {
                displayVal = `${db.toFixed(1)} dB`;
                // Map -60 to +6 to 0% to 100%
                barHeightPercent = ((db + 60) / 66) * 100;
              }
              barColor = 'var(--neon-green)';
            } else {
              const pan = autoConfig.pan[stepIdx];
              if (pan !== undefined) {
                displayVal = pan === 0 ? 'C' : pan > 0 ? `R${Math.round(pan * 10)}` : `L${Math.round(Math.abs(pan) * 10)}`;
                // Map -1 to 1 to 0% to 100%
                barHeightPercent = ((pan + 1) / 2) * 100;
              }
              barColor = 'var(--neon-cyan)';
            }

            const isBeat = stepIdx % 4 === 0;

            return (
              <div
                key={stepIdx}
                className={`automation-col ${isBeat ? 'beat-boundary' : ''}`}
                onMouseDown={(e) => handleMouseDown(stepIdx, e)}
                onMouseMove={(e) => handleMouseMove(stepIdx, e)}
              >
                {/* Visual Bar Container */}
                <div className="auto-bar-well">
                  {barHeightPercent > 0 && (
                    <div
                      className="auto-bar-fill"
                      style={{
                        height: `${barHeightPercent}%`,
                        backgroundColor: barColor,
                        boxShadow: `0 0 8px ${barColor}`
                      }}
                    />
                  )}
                  {/* Hover step label */}
                  <div className="auto-step-lbl">{stepIdx + 1}</div>
                </div>
                {/* Numeric readout */}
                <div className="auto-val-lbl">{displayVal}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
