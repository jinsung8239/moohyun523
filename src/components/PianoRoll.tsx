import React, { useRef, useState } from 'react';
import { AudioEngine, type Track, NOTE_NAMES, SCALE_DEFINITIONS, isNoteInScale } from '../audio/AudioEngine';
import { ZoomIn, ZoomOut, Sliders, Music, Sparkles } from 'lucide-react';
import { ContextMenu, type ContextMenuItem } from '../ui/components';

interface PianoRollProps {
  track: Track | null;
  tracks: Track[];
  onSelectTrack: (id: string) => void;
  currentStep: number;
  onUpdateSteps: () => void;
  onPlayheadMove: (step: number) => void;
  totalSteps: number;
}

const CHROMATIC_SCALE = [
  'C7', 'B6', 'A#6', 'A6', 'G#6', 'G6', 'F#6', 'F6', 'E6', 'D#6', 'D6', 'C#6', 'C6',
  'B5', 'A#5', 'A5', 'G#5', 'G5', 'F#5', 'F5', 'E5', 'D#5', 'D5', 'C#5', 'C5',
  'B4', 'A#4', 'A4', 'G#4', 'G4', 'F#4', 'F4', 'E4', 'D#4', 'D4', 'C#4', 'C4',
  'B3', 'A#3', 'A3', 'G#3', 'G3', 'F#3', 'F3', 'E3', 'D#3', 'D3', 'C#3', 'C3',
  'B2', 'A#2', 'A2', 'G#2', 'G2', 'F#2', 'F2', 'E2', 'D#2', 'D2', 'C#2', 'C2'
];

export const PianoRoll: React.FC<PianoRollProps> = ({
  track,
  tracks,
  onSelectTrack,
  currentStep,
  onUpdateSteps,
  onPlayheadMove,
  totalSteps,
}) => {
  const [zoom, setZoom] = useState<number>(36); // cell width in pixels (24 to 72)
  const [snap, setSnap] = useState<string>('1/16'); // '1/4', '1/8', '1/16'
  const [scaleRoot, setScaleRoot] = useState<string>('C');
  const [scaleName, setScaleName] = useState<string>('Major');
  const [swingAmount, setSwingAmount] = useState<number>(50); // 50% = straight, 75% = heavy swing
  const [showVelocityLane, setShowVelocityLane] = useState<boolean>(true);
  const isDraggingPlayhead = useRef(false);
  const BUFFER_STEPS = 128;


  const synthTracks = tracks.filter(t => t.type === 'synth');

  if (!track || track.type !== 'synth') {
    return (
      <div className="piano-roll-panel empty-editor-fallback">
        <div className="fallback-card">
          <h3>PIANO ROLL</h3>
          <p>Please select a Synthesizer track to edit its notes:</p>
          {synthTracks.length > 0 ? (
            <select
              onChange={(e) => onSelectTrack(e.target.value)}
              defaultValue=""
              className="preset-select fallback-select"
            >
              <option value="" disabled>Select Synth Track...</option>
              {synthTracks.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          ) : (
            <div className="no-tracks-msg">
              No Synthesizer tracks found. Add one from the Top Bar (+ Synth) to begin.
            </div>
          )}
        </div>
      </div>
    );
  }



  interface DragNote {
    originalStartStep: number;
    originalPitch: string;
    noteObj: any;
    currentStartStep: number;
    currentPitch: string;
    duration: number;
  }

  interface DragState {
    isChord: boolean;
    notes: DragNote[];
  }

  interface ResizeNote {
    startStep: number;
    originalDuration: number;
    currentDuration: number;
    noteObj: any;
    pitch: string;
  }

  interface ResizeState {
    isChord: boolean;
    notes: ResizeNote[];
  }

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; startStep: number; pitch: string } | null>(null);

  const notesList = React.useMemo(() => {
    const list: { startStep: number; duration: number; pitch: string; noteObj: any }[] = [];
    if (!track || !track.steps) return list;
    Object.entries(track.steps).forEach(([stepStr, notes]) => {
      const startStep = Number(stepStr);
      if (!notes) return;
      notes.forEach(n => {
        const pitch = typeof n === 'string' ? n : n.pitch;
        
        // If this note is currently being dragged, skip rendering its static version
        if (dragState) {
          const isDragged = dragState.notes.some(dn => dn.originalStartStep === startStep && dn.originalPitch === pitch);
          if (isDragged) return;
        }

        let duration = typeof n === 'string' ? 1 : (n.duration || 1);
        // If this note is currently being resized, dynamically apply its active duration
        if (resizeState) {
          const rn = resizeState.notes.find(rn => rn.startStep === startStep && rn.pitch === pitch);
          if (rn) {
            duration = rn.currentDuration;
          }
        }

        list.push({
          startStep,
          duration,
          pitch,
          noteObj: n
        });
      });
    });
    return list;
  }, [track.steps, track.id, dragState, resizeState]);

  const handleResizeStart = (e: React.MouseEvent, startStep: number, noteObj: any) => {
    e.stopPropagation();
    e.preventDefault();
    
    const isChordResize = (e.buttons & 2) === 2;
    const startX = e.clientX;

    let notesToResize: ResizeNote[] = [];
    if (isChordResize) {
      const stepNotes = track.steps[startStep] || [];
      notesToResize = stepNotes.map(n => {
        const p = typeof n === 'string' ? n : n.pitch;
        const dur = typeof n === 'string' ? 1 : (n.duration || 1);
        return {
          startStep,
          originalDuration: dur,
          currentDuration: dur,
          noteObj: n,
          pitch: p
        };
      });
    } else {
      const pitch = typeof noteObj === 'string' ? noteObj : noteObj.pitch;
      const dur = typeof noteObj === 'string' ? 1 : (noteObj.duration || 1);
      notesToResize = [{
        startStep,
        originalDuration: dur,
        currentDuration: dur,
        noteObj,
        pitch
      }];
    }

    setResizeState({
      isChord: isChordResize,
      notes: notesToResize
    });
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaSteps = deltaX / zoom;
      
      setResizeState(prev => {
        if (!prev) return null;
        const updatedNotes = prev.notes.map(rn => {
          let nextDuration = rn.originalDuration + deltaSteps;
          if (snap === '1/4') {
            nextDuration = Math.max(4, Math.round(nextDuration / 4) * 4);
          } else if (snap === '1/8') {
            nextDuration = Math.max(2, Math.round(nextDuration / 2) * 2);
          } else if (snap === '1/16') {
            nextDuration = Math.max(1, Math.round(nextDuration));
          } else {
            // snap === 'none'
            nextDuration = Math.max(0.1, Math.round(nextDuration * 1000) / 1000);
          }
          nextDuration = Math.min(totalSteps + BUFFER_STEPS - rn.startStep, nextDuration);
          return {
            ...rn,
            currentDuration: nextDuration
          };
        });
        return {
          ...prev,
          notes: updatedNotes
        };
      });
    };
    
    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      setResizeState(currentResizeState => {
        if (currentResizeState) {
          currentResizeState.notes.forEach(rn => {
            const stepNotes = track.steps[rn.startStep] || [];
            if (typeof rn.noteObj === 'string') {
              const newNoteObj = { pitch: rn.noteObj, duration: rn.currentDuration };
              track.steps[rn.startStep] = stepNotes.map(n => n === rn.noteObj ? newNoteObj : n);
            } else {
              rn.noteObj.duration = rn.currentDuration;
              track.steps[rn.startStep] = [...stepNotes];
            }
          });
        }
        onUpdateSteps();
        return null;
      });
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleGridCellMouseDown = (e: React.MouseEvent<HTMLDivElement>, note: string) => {
    if (e.button !== 0) return; // Only trigger for left-clicks
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickStep = clickX / zoom;
    
    let targetStep = clickStep;
    if (snap === '1/4') {
      targetStep = Math.round(targetStep / 4) * 4;
    } else if (snap === '1/8') {
      targetStep = Math.round(targetStep / 2) * 2;
    } else if (snap === '1/16') {
      targetStep = Math.round(targetStep);
    } else {
      // snap === 'none'
      targetStep = Math.round(targetStep * 1000) / 1000;
    }
    
    targetStep = Math.max(0, Math.min(totalSteps + BUFFER_STEPS - 1, targetStep));
    
    let defaultDuration = 1;
    if (snap === '1/4') {
      defaultDuration = 4;
    } else if (snap === '1/8') {
      defaultDuration = 2;
    }
    
    const newNote = { pitch: note, duration: defaultDuration };
    const stepNotes = track.steps[targetStep] || [];
    const filtered = stepNotes.filter(n => {
      const notePitch = typeof n === 'string' ? n : n.pitch;
      return notePitch !== note;
    });
    track.steps[targetStep] = [...filtered, newNote];
    AudioEngine.getInstance().triggerTrackAudition(track, note, defaultDuration);
    onUpdateSteps();
  };

  const handleNoteMouseDown = (e: React.MouseEvent, startStep: number, pitch: string, noteObj: any) => {
    if (e.button !== 0) return; // Only trigger for left-clicks
    e.stopPropagation();
    e.preventDefault();

    const isChordDrag = (e.buttons & 2) === 2;
    const startX = e.clientX;
    const startY = e.clientY;
    const clickNoteDuration = typeof noteObj === 'string' ? 1 : (noteObj.duration || 1);

    let notesToDrag: DragNote[] = [];
    if (isChordDrag) {
      const stepNotes = track.steps[startStep] || [];
      notesToDrag = stepNotes.map(n => {
        const p = typeof n === 'string' ? n : n.pitch;
        const dur = typeof n === 'string' ? 1 : (n.duration || 1);
        return {
          originalStartStep: startStep,
          originalPitch: p,
          noteObj: n,
          currentStartStep: startStep,
          currentPitch: p,
          duration: dur
        };
      });
    } else {
      notesToDrag = [{
        originalStartStep: startStep,
        originalPitch: pitch,
        noteObj,
        currentStartStep: startStep,
        currentPitch: pitch,
        duration: clickNoteDuration
      }];
    }

    let hasDragged = false;

    setDragState({
      isChord: isChordDrag,
      notes: notesToDrag
    });

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      if (!hasDragged && (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4)) {
        hasDragged = true;
        AudioEngine.getInstance().triggerTrackAudition(track, pitch, clickNoteDuration);
      }

      if (!hasDragged) return;

      const deltaSteps = deltaX / zoom;
      const deltaRows = Math.round(deltaY / 26);

      setDragState(prev => {
        if (!prev) return null;
        const updatedNotes = prev.notes.map(note => {
          let nextStartStep = note.originalStartStep + deltaSteps;
          if (snap === '1/4') {
            nextStartStep = Math.round(nextStartStep / 4) * 4;
          } else if (snap === '1/8') {
            nextStartStep = Math.round(nextStartStep / 2) * 2;
          } else if (snap === '1/16') {
            nextStartStep = Math.round(nextStartStep);
          } else {
            // snap === 'none'
            nextStartStep = Math.round(nextStartStep * 1000) / 1000;
          }
          nextStartStep = Math.max(0, Math.min(totalSteps + BUFFER_STEPS - note.duration, nextStartStep));

          const noteInitialPitchIdx = CHROMATIC_SCALE.indexOf(note.originalPitch);
          const nextPitchIndex = Math.max(0, Math.min(CHROMATIC_SCALE.length - 1, noteInitialPitchIdx + deltaRows));
          const nextPitch = CHROMATIC_SCALE[nextPitchIndex];

          return {
            ...note,
            currentStartStep: nextStartStep,
            currentPitch: nextPitch
          };
        });
        
        // Play audition of the target note (the one being hovered)
        const primaryNote = updatedNotes.find(un => un.originalPitch === pitch);
        if (primaryNote && prev.notes.find(un => un.originalPitch === pitch)?.currentPitch !== primaryNote.currentPitch) {
          AudioEngine.getInstance().triggerTrackAudition(track, primaryNote.currentPitch, primaryNote.duration);
        }
        
        return {
          ...prev,
          notes: updatedNotes
        };
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      if (!hasDragged) {
        // Simple click = Delete note
        const stepNotes = track.steps[startStep] || [];
        track.steps[startStep] = stepNotes.filter(n => {
          const notePitch = typeof n === 'string' ? n : n.pitch;
          return notePitch !== pitch;
        });
        if (track.steps[startStep].length === 0) {
          delete track.steps[startStep];
        }
        setDragState(null);
        onUpdateSteps();
      } else {
        // Drag end: commit local dragState changes to global track.steps state
        setDragState(currentDragState => {
          if (currentDragState) {
            // 1. Remove all original notes in the drag list
            currentDragState.notes.forEach(note => {
              const origStep = note.originalStartStep;
              const origPitch = note.originalPitch;
              const origStepsList = track.steps[origStep] || [];
              track.steps[origStep] = origStepsList.filter(n => {
                const p = typeof n === 'string' ? n : n.pitch;
                return p !== origPitch;
              });
              if (track.steps[origStep] && track.steps[origStep].length === 0) {
                delete track.steps[origStep];
              }
            });

            // 2. Add all notes to their new positions
            currentDragState.notes.forEach(note => {
              const targetStep = note.currentStartStep;
              const targetPitch = note.currentPitch;
              if (!track.steps[targetStep]) {
                track.steps[targetStep] = [];
              }
              const nextStepsList = track.steps[targetStep];
              const filtered = nextStepsList.filter(n => {
                const p = typeof n === 'string' ? n : n.pitch;
                return p !== targetPitch;
              });

              const updatedNote = typeof note.noteObj === 'string' 
                ? { pitch: targetPitch, duration: note.duration } 
                : { ...note.noteObj, pitch: targetPitch };

              track.steps[targetStep] = [...filtered, updatedNote];
            });
          }
          onUpdateSteps();
          return null;
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleDeleteNote = (startStep: number, pitch: string) => {
    if (!track) return;
    const stepNotes = track.steps[startStep] || [];
    track.steps[startStep] = stepNotes.filter(n => {
      const notePitch = typeof n === 'string' ? n : n.pitch;
      return notePitch !== pitch;
    });
    if (track.steps[startStep].length === 0) {
      delete track.steps[startStep];
    }
    onUpdateSteps();
  };

  const handleShiftOctave = (startStep: number, pitch: string, dir: 'up' | 'down') => {
    if (!track) return;
    const stepNotes = track.steps[startStep] || [];
    const index = CHROMATIC_SCALE.indexOf(pitch);
    if (index === -1) return;
    const nextIdx = index + (dir === 'up' ? -12 : 12);
    const nextPitch = CHROMATIC_SCALE[nextIdx];
    if (!nextPitch) return;
    track.steps[startStep] = stepNotes.map(n => {
      if (typeof n === 'string') {
        return n === pitch ? nextPitch : n;
      } else {
        return n.pitch === pitch ? { ...n, pitch: nextPitch } : n;
      }
    });
    onUpdateSteps();
  };

  const clearPattern = () => {
    track.steps = {};
    onUpdateSteps();
  };

  const isBlackKey = (note: string) => {
    return note.includes('#');
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
    const timeline = document.querySelector('.timeline-steps-header');
    if (!timeline) return;

    const rect = timeline.getBoundingClientRect();
    // Calculate relative X coordinate inside scrolling container
    const x = e.clientX - rect.left;
    
    // Width of key label is 68px
    const gridX = x - 68;
    if (gridX < 0) return;

    const stepIdx = Math.floor(gridX / zoom);
    if (stepIdx >= 0 && stepIdx < totalSteps + BUFFER_STEPS) {
      onPlayheadMove(stepIdx);
    }
  };

  const handlePresetChange = (preset: 'lead' | 'bass' | 'pluck' | 'pad' | 'piano' | 'sustain_piano') => {
    track.preset = preset;
    onUpdateSteps();
  };

  // Helper for adding chords at current step or click step
  const addChordAtStep = (targetStep: number, rootPitch: string, chordType: 'major' | 'minor' | '7th' | 'sus4') => {
    if (!track) return;
    const cleanNote = rootPitch.replace(/[0-9\-]/g, '');
    const octave = parseInt(rootPitch.replace(/[^0-9]/g, '')) || 4;
    const rootIdx = NOTE_NAMES.indexOf(cleanNote);
    if (rootIdx === -1) return;

    let offsets = [0, 4, 7]; // Major triad
    if (chordType === 'minor') offsets = [0, 3, 7];
    else if (chordType === '7th') offsets = [0, 4, 7, 10];
    else if (chordType === 'sus4') offsets = [0, 5, 7];

    if (!track.steps[targetStep]) {
      track.steps[targetStep] = [];
    }

    offsets.forEach(offset => {
      const semitone = (rootIdx + offset) % 12;
      const octaveShift = Math.floor((rootIdx + offset) / 12);
      const notePitch = `${NOTE_NAMES[semitone]}${octave + octaveShift}`;
      const exists = track.steps[targetStep].some(n => (typeof n === 'string' ? n : n.pitch) === notePitch);
      if (!exists) {
        track.steps[targetStep].push({ pitch: notePitch, duration: 2 });
      }
    });

    onUpdateSteps();
    AudioEngine.getInstance().triggerTrackAudition(track, rootPitch);
  };

  const handleVelocityChange = (step: number, pitch: string, val: number) => {
    if (!track) return;
    if (!track.noteVelocities) track.noteVelocities = {};
    if (!track.noteVelocities[step]) track.noteVelocities[step] = {};
    track.noteVelocities[step][pitch] = Math.max(1, Math.min(127, val));
    onUpdateSteps();
  };

  const getNoteVelocity = (step: number, pitch: string): number => {
    if (track && track.noteVelocities && track.noteVelocities[step] && track.noteVelocities[step][pitch] !== undefined) {
      return track.noteVelocities[step][pitch];
    }
    return 100; // default velocity
  };

  return (
    <div className="piano-roll-panel">
      <div className="piano-roll-header">
        <div className="header-title-rack">
          <div className="inspector-title">PIANO ROLL EDITOR - {track.name}</div>
          
          <div className="preset-selector-group">
            <span className="preset-lbl">SOUND PRESET</span>
            <select
              value={track.preset || 'piano'}
              onChange={(e) => handlePresetChange(e.target.value as any)}
              className="preset-select"
            >
              <option value="piano">Grand Piano (Sampled)</option>
              <option value="sustain_piano">Sustain Piano (Pedal)</option>
              <option value="lead">Synthesizer Lead</option>
              <option value="bass">Sub Synth Bass</option>
              <option value="pluck">Pluck Synth</option>
              <option value="pad">Dreamy Pad</option>
            </select>
          </div>

          {/* Snap Selector */}
          <div className="snap-selector-group">
            <span className="preset-lbl">SNAP</span>
            <select
              value={snap}
              onChange={(e) => setSnap(e.target.value)}
              className="snap-select"
            >
              <option value="1/4">1/4 Beat</option>
              <option value="1/8">1/8 Note</option>
              <option value="1/16">1/16 Note</option>
              <option value="none">None (Free)</option>
            </select>
          </div>

          {/* Scale Assistant (Studio One / Logic Style) */}
          <div className="snap-selector-group" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="preset-lbl" style={{ color: '#00f2fe', display: 'flex', alignItems: 'center', gap: '2px' }}>
              <Music size={11} /> SCALE
            </span>
            <select
              value={scaleRoot}
              onChange={(e) => setScaleRoot(e.target.value)}
              className="snap-select"
              style={{ width: '45px' }}
            >
              {NOTE_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <select
              value={scaleName}
              onChange={(e) => setScaleName(e.target.value)}
              className="snap-select"
            >
              <option value="Off">Off</option>
              {Object.keys(SCALE_DEFINITIONS).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Chord Generator Dropdown */}
          <div className="snap-selector-group">
            <span className="preset-lbl" style={{ color: '#ffea00', display: 'flex', alignItems: 'center', gap: '2px' }}>
              <Sparkles size={11} /> CHORD
            </span>
            <button
              className="clear-pattern-btn"
              style={{ padding: '2px 8px', fontSize: '11px' }}
              onClick={() => addChordAtStep(currentStep, `${scaleRoot}4`, 'major')}
              title="Add Major Triad at Playhead"
            >
              +Maj
            </button>
            <button
              className="clear-pattern-btn"
              style={{ padding: '2px 8px', fontSize: '11px' }}
              onClick={() => addChordAtStep(currentStep, `${scaleRoot}4`, 'minor')}
              title="Add Minor Triad at Playhead"
            >
              +Min
            </button>
          </div>
        </div>

        <div className="panel-actions">
          {/* Swing Selector */}
          <div className="snap-selector-group" style={{ display: 'flex', alignItems: 'center', marginRight: '8px' }}>
            <span className="preset-lbl" style={{ marginRight: '4px' }}>SWING</span>
            <input
              type="range"
              min="50"
              max="75"
              value={swingAmount}
              onChange={(e) => setSwingAmount(Number(e.target.value))}
              style={{ width: '60px', height: '4px', accentColor: '#00f2fe' }}
              title={`Swing: ${swingAmount}%`}
            />
            <span style={{ fontSize: '10px', color: '#8b9bb4', marginLeft: '4px' }}>{swingAmount}%</span>
          </div>

          <button
            className={`clear-pattern-btn ${showVelocityLane ? 'active' : ''}`}
            style={{ fontSize: '11px', padding: '2px 8px' }}
            onClick={() => setShowVelocityLane(!showVelocityLane)}
          >
            <Sliders size={12} style={{ marginRight: '4px' }} /> Velocity
          </button>
          {/* Zoom controls */}
          <div className="zoom-rack">
            <ZoomOut size={14} className="zoom-icon" />
            <input
              type="range"
              min="24"
              max="72"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="zoom-slider-bar"
            />
            <ZoomIn size={14} className="zoom-icon" />
          </div>
          <button className="clear-pattern-btn" onClick={clearPattern}>
            Clear Grid
          </button>
        </div>
      </div>

      <div className="piano-roll-scroller" onContextMenu={(e) => e.preventDefault()}>
        <div className="piano-roll-grid" style={{ minWidth: `${(totalSteps + BUFFER_STEPS) * zoom + 68}px` }}>
          
          {/* Playhead Timeline Header */}
          <div
            className="timeline-steps-header"
            onMouseDown={handleTimelineMouseDown}
          >
            <div className="piano-key-header-spacer" />
            <div className="timeline-ticks">
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
                    style={{ width: `${zoom}px` }}
                  >
                    {isBeat ? `${Math.floor(stepIdx / 4) + 1}` : ''}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Note Rows */}
          {CHROMATIC_SCALE.map(note => {
            const isBlack = isBlackKey(note);
            const isInScale = isNoteInScale(note, scaleRoot, scaleName);
            const rowNotes = notesList.filter(n => n.pitch === note);
            if (dragState) {
              dragState.notes.forEach(dn => {
                if (dn.currentPitch === note) {
                  rowNotes.push({
                    startStep: dn.currentStartStep,
                    duration: dn.duration,
                    pitch: note,
                    noteObj: dn.noteObj
                  });
                }
              });
            }
            return (
              <div key={note} className="piano-row" style={{ height: '26px' }}>
                {/* Piano Key */}
                <div 
                  className={`piano-key ${isBlack ? 'black-key' : 'white-key'}`}
                  style={{
                    ...(isInScale && scaleName !== 'Off' ? {
                      borderLeft: '4px solid #00f2fe',
                      boxShadow: 'inset 0 0 8px rgba(0, 242, 254, 0.25)',
                      color: '#00f2fe',
                      fontWeight: 'bold'
                    } : {})
                  }}
                  onClick={() => AudioEngine.getInstance().triggerTrackAudition(track, note)}
                >
                  <span>{note}</span>
                </div>

                {/* Step Cells */}
                <div className="step-cells" style={{ position: 'relative' }} onMouseDown={(e) => handleGridCellMouseDown(e, note)}>
                  {Array.from({ length: totalSteps + BUFFER_STEPS }).map((_, stepIdx) => {
                    const isCurrent = stepIdx === currentStep;
                    let cellClass = 'grid-cell';
                    if (isCurrent) cellClass += ' current-step-cell';
                    if (stepIdx % 4 === 0) cellClass += ' beat-boundary';
                    if (isInScale && scaleName !== 'Off') cellClass += ' in-scale-cell';

                    return (
                      <div
                        key={stepIdx}
                        className={cellClass}
                        style={{
                          width: `${zoom}px`,
                          ...(isInScale && scaleName !== 'Off' ? { backgroundColor: 'rgba(0, 242, 254, 0.04)' } : {})
                        }}
                      />
                    );
                  })}

                  {/* Absolute Note Overlays */}
                  {rowNotes.map((noteItem, noteIdx) => {
                    const left = noteItem.startStep * zoom;
                    const width = noteItem.duration * zoom;
                    const vel = getNoteVelocity(noteItem.startStep, noteItem.pitch);
                    const opacity = 0.4 + (vel / 127) * 0.6;
                    
                    return (
                      <div
                        key={`${noteItem.startStep}-${noteIdx}`}
                        className="grid-cell active-cell"
                        style={{
                          position: 'absolute',
                          left: `${left}px`,
                          width: `${width}px`,
                          height: '22px',
                          top: '2px',
                          backgroundColor: track.color,
                          boxShadow: `0 0 10px ${track.color}`,
                          opacity,
                          borderRadius: '4px',
                          zIndex: 5,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          border: 'none',
                        }}
                        onMouseDown={(e) => handleNoteMouseDown(e, noteItem.startStep, note, noteItem.noteObj)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            startStep: noteItem.startStep,
                            pitch: noteItem.pitch
                          });
                        }}
                      >
                        <div
                          className="note-resize-handle"
                          onMouseDown={(e) => handleResizeStart(e, noteItem.startStep, noteItem.noteObj)}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: '8px',
                            height: '100%',
                            cursor: 'e-resize',
                            backgroundColor: 'rgba(255, 255, 255, 0.3)',
                            borderTopRightRadius: '4px',
                            borderBottomRightRadius: '4px',
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Velocity Lane Editor */}
      {showVelocityLane && (
        <div className="velocity-editor-lane" style={{ height: '90px', borderTop: '1px solid rgba(255,255,255,0.1)', backgroundColor: '#0c0f1d', padding: '6px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '10px', color: '#8b9bb4', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
            <span>VELOCITY LANE (1 - 127)</span>
            <span>Click & Drag to adjust note velocities</span>
          </div>
          <div style={{ display: 'flex', height: '65px', overflowX: 'auto', minWidth: `${(totalSteps + BUFFER_STEPS) * zoom}px` }}>
            {Array.from({ length: totalSteps }).map((_, stepIdx) => {
              const stepNotes = notesList.filter(n => Math.floor(n.startStep) === stepIdx);
              const hasNotes = stepNotes.length > 0;
              const mainNote = stepNotes[0];
              const vel = mainNote ? getNoteVelocity(stepIdx, mainNote.pitch) : 0;
              const heightPct = (vel / 127) * 100;

              return (
                <div
                  key={stepIdx}
                  style={{
                    width: `${zoom}px`,
                    height: '100%',
                    borderRight: '1px solid rgba(255,255,255,0.04)',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    cursor: hasNotes ? 'ns-resize' : 'default',
                    position: 'relative'
                  }}
                  onMouseDown={(e) => {
                    if (!hasNotes) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const updateVel = (mouseY: number) => {
                      const relY = rect.bottom - mouseY;
                      const newVel = Math.round((relY / rect.height) * 127);
                      stepNotes.forEach(n => handleVelocityChange(stepIdx, n.pitch, newVel));
                    };
                    updateVel(e.clientY);
                    const onMove = (mEvt: MouseEvent) => updateVel(mEvt.clientY);
                    const onUp = () => {
                      window.removeEventListener('mousemove', onMove);
                      window.removeEventListener('mouseup', onUp);
                    };
                    window.addEventListener('mousemove', onMove);
                    window.addEventListener('mouseup', onUp);
                  }}
                >
                  {hasNotes && (
                    <div
                      style={{
                        width: '60%',
                        height: `${heightPct}%`,
                        backgroundColor: track.color,
                        boxShadow: `0 0 8px ${track.color}`,
                        borderRadius: '2px 2px 0 0',
                        transition: 'height 0.05s ease-out'
                      }}
                      title={`Step ${stepIdx + 1}: Velocity ${vel}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="piano-roll-footer">
        <div className="legend">
          <span className="legend-item"><span className="legend-color" style={{ backgroundColor: track.color }} /> Active note</span>
          <span className="legend-item"><span className="legend-color playhead" /> Playhead (Click/Drag timeline to scrub)</span>
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              label: 'Shift Octave Up (+12)',
              onClick: () => handleShiftOctave(contextMenu.startStep, contextMenu.pitch, 'up')
            },
            {
              label: 'Shift Octave Down (-12)',
              onClick: () => handleShiftOctave(contextMenu.startStep, contextMenu.pitch, 'down')
            },
            {
              label: 'Audition Note Sound',
              onClick: () => AudioEngine.getInstance().triggerTrackAudition(track, contextMenu.pitch, 1)
            },
            {
              label: 'Delete Note',
              danger: true,
              divider: true,
              onClick: () => handleDeleteNote(contextMenu.startStep, contextMenu.pitch)
            }
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};
