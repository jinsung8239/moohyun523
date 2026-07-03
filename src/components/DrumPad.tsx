import React, { useRef, useState } from 'react';
import { AudioEngine, type Track } from '../audio/AudioEngine';
import { ZoomIn, ZoomOut } from 'lucide-react';

interface DrumPadProps {
  track: Track | null;
  tracks: Track[];
  onSelectTrack: (id: string) => void;
  currentStep: number;
  onUpdateSteps: () => void;
  onPlayheadMove: (step: number) => void;
  totalSteps: number;
}

const DRUM_INSTRUMENTS = [
  { id: 'kick', name: 'Kick Drum', color: '#ff1744' },
  { id: 'snare', name: 'Snare Drum', color: '#00e5ff' },
  { id: 'hihat', name: 'Closed Hat', color: '#ffea00' },
  { id: 'clap', name: 'Hand Clap', color: '#d500f9' }
];

export const DrumPad: React.FC<DrumPadProps> = ({
  track,
  tracks,
  onSelectTrack,
  currentStep,
  onUpdateSteps,
  onPlayheadMove,
  totalSteps,
}) => {
  const [zoom, setZoom] = useState<number>(26); // step width in pixels (16 to 48)
  const isDraggingPlayhead = useRef(false);
  const BUFFER_STEPS = 128;

  const drumTracks = tracks.filter(t => t.type === 'drum');

  if (!track || track.type !== 'drum') {
    return (
      <div className="drum-pad-panel empty-editor-fallback">
        <div className="fallback-card">
          <h3>DRUM MACHINE</h3>
          <p>Please select a Drum Machine track to edit its patterns:</p>
          {drumTracks.length > 0 ? (
            <select
              onChange={(e) => onSelectTrack(e.target.value)}
              defaultValue=""
              className="preset-select fallback-select"
            >
              <option value="" disabled>Select Drum Track...</option>
              {drumTracks.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          ) : (
            <div className="no-tracks-msg">
              No Drum tracks found. Add one from the Top Bar (+ Drum) to begin.
            </div>
          )}
        </div>
      </div>
    );
  }

  const toggleStep = (instId: string, stepIdx: number) => {
    if (!track.drumSteps[instId]) {
      track.drumSteps[instId] = Array(totalSteps).fill(false);
    } else if (track.drumSteps[instId].length < totalSteps) {
      const padLength = totalSteps - track.drumSteps[instId].length;
      track.drumSteps[instId] = [...track.drumSteps[instId], ...Array(padLength).fill(false)];
    }
    track.drumSteps[instId][stepIdx] = !track.drumSteps[instId][stepIdx];
    if (track.drumSteps[instId][stepIdx]) {
      AudioEngine.getInstance().triggerTrackAudition(track, instId);
    }
    onUpdateSteps();
  };

  const clearPattern = () => {
    DRUM_INSTRUMENTS.forEach(inst => {
      track.drumSteps[inst.id] = Array(totalSteps).fill(false);
    });
    onUpdateSteps();
  };

  // Playhead dragging handlers
  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingPlayhead.current = true;
    movePlayheadToEventPosition(e);
    window.addEventListener('mouseup', handleTimelineMouseUp);
    window.addEventListener('mousemove', handleTimelineMouseMove as any);
  };

  const handleTimelineMouseUp = () => {
    isDraggingPlayhead.current = false;
    window.removeEventListener('mouseup', handleTimelineMouseUp);
    window.removeEventListener('mousemove', handleTimelineMouseMove as any);
  };

  const handleTimelineMouseMove = (e: MouseEvent) => {
    if (!isDraggingPlayhead.current) return;
    movePlayheadToEventPosition(e);
  };

  const movePlayheadToEventPosition = (e: React.MouseEvent | MouseEvent) => {
    const timeline = document.querySelector('.drum-timeline-header');
    if (!timeline) return;

    const rect = timeline.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    // Label column offset is 120px
    const gridX = x - 120;
    if (gridX < 0) return;

    // gap is 6px, but for calculation we can approximate with zoom + gap spacing
    const stepIdx = Math.floor(gridX / (zoom + 6));
    if (stepIdx >= 0 && stepIdx < totalSteps + BUFFER_STEPS) {
      onPlayheadMove(stepIdx);
    }
  };

  return (
    <div className="drum-pad-panel">
      <div className="panel-header">
        <h3>DRUM MACHINE - {track.name}</h3>
        
        <div className="panel-actions">
          {/* Zoom controls */}
          <div className="zoom-rack">
            <ZoomOut size={14} className="zoom-icon" />
            <input
              type="range"
              min="16"
              max="48"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="zoom-slider-bar"
            />
            <ZoomIn size={14} className="zoom-icon" />
          </div>
          <button className="clear-pattern-btn" onClick={clearPattern}>
            Clear Pattern
          </button>
        </div>
      </div>

      <div className="drum-rows-container">
        {/* Playhead Timeline Header */}
        <div
          className="drum-timeline-header"
          onMouseDown={handleTimelineMouseDown}
          style={{ minWidth: `${(totalSteps + BUFFER_STEPS) * (zoom + 6) + 120}px` }}
        >
          <div className="drum-label-header-spacer" />
          <div className="drum-timeline-ticks">
            {Array.from({ length: totalSteps + BUFFER_STEPS }).map((_, stepIdx) => {
              const isCurrent = stepIdx === currentStep;
              const isBeat = stepIdx % 4 === 0;
              let tickClass = 'timeline-tick';
              if (isCurrent) tickClass += ' active-tick';
              if (isBeat) tickClass += ' beat-tick';
              
              return (
                <div
                  key={stepIdx}
                  className={tickClass}
                  style={{ width: `${zoom}px`, marginRight: '6px' }}
                >
                  {isBeat ? `${Math.floor(stepIdx / 4) + 1}` : ''}
                </div>
              );
            })}
          </div>
        </div>

        {/* Drum instrument grids */}
        {DRUM_INSTRUMENTS.map(inst => {
          const steps = track.drumSteps[inst.id] || Array(totalSteps).fill(false);

          return (
            <div
              key={inst.id}
              className="drum-row"
              style={{ minWidth: `${(totalSteps + BUFFER_STEPS) * (zoom + 6) + 120}px` }}
            >
              <div 
                className="drum-label-column" 
                style={{ borderLeftColor: inst.color }}
                onClick={() => AudioEngine.getInstance().triggerTrackAudition(track, inst.id)}
              >
                <span className="drum-name">{inst.name}</span>
              </div>

              <div className="drum-step-grid">
                {Array.from({ length: totalSteps + BUFFER_STEPS }).map((_, stepIdx) => {
                  const isActive = steps[stepIdx];
                  const isCurrent = stepIdx === currentStep;

                  let cellClass = 'drum-cell';
                  if (isActive) cellClass += ' active-cell';
                  if (isCurrent) cellClass += ' current-step-cell';
                  if (stepIdx % 4 === 0) cellClass += ' beat-boundary';

                  return (
                    <div
                      key={stepIdx}
                      className={cellClass}
                      style={{
                        width: `${zoom}px`,
                        height: `${zoom * 1.5}px`,
                        backgroundColor: isActive ? inst.color : undefined,
                        boxShadow: isActive ? `0 0 10px ${inst.color}` : undefined
                      }}
                      onClick={() => toggleStep(inst.id, stepIdx)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
