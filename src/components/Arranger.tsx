import React, { useState, useEffect, useRef } from 'react';
import { AudioEngine, type Track } from '../audio/AudioEngine';
import { ContextMenu, type ContextMenuItem } from '../ui/components';

interface ArrangerProps {
  tracks: Track[];
  selectedTrackId: string | null;
  currentStep: number;
  onSelectTrack: (trackId: string) => void;
  onDoubleClickRegion: (track: Track) => void;
  onPlayheadMove: (step: number) => void;
  bpm: number;
  onTrackChange: (shouldPushHistory?: boolean) => void;
  totalSteps: number;
  loopStart: number;
  loopEnd: number;
  onLoopChange: (start: number, end: number) => void;
  onTotalStepsChange?: (steps: number) => void;
}

const CHROMATIC_SCALE = [
  'C7', 'B6', 'A#6', 'A6', 'G#6', 'G6', 'F#6', 'F6', 'E6', 'D#6', 'D6', 'C#6', 'C6',
  'B5', 'A#5', 'A5', 'G#5', 'G5', 'F#5', 'F5', 'E5', 'D#5', 'D5', 'C#5', 'C5',
  'B4', 'A#4', 'A4', 'G#4', 'G4', 'F#4', 'F4', 'E4', 'D#4', 'D4', 'C#4', 'C4',
  'B3', 'A#3', 'A3', 'G#3', 'G3', 'F#3', 'F3', 'E3', 'D#3', 'D3', 'C#3', 'C3',
  'B2', 'A#2', 'A2', 'G#2', 'G2', 'F#2', 'F2', 'E2', 'D#2', 'D2', 'C#2', 'C2'
];

export const Arranger: React.FC<ArrangerProps> = ({
  tracks,
  selectedTrackId,
  currentStep,
  onSelectTrack,
  onDoubleClickRegion,
  onPlayheadMove,
  bpm,
  onTrackChange,
  totalSteps,
  loopStart,
  loopEnd,
  onLoopChange,
  onTotalStepsChange,
}) => {
  const [zoom, setZoom] = useState<number>(36); // cell width in pixels (24 to 72)
  const [snap, setSnap] = useState<string>('1/16'); // 'Off', '1/8', '1/16'
  const [previewTotalSteps, setPreviewTotalSteps] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; trackId: string } | null>(null);
  
  const handleDeleteClip = (trackId: string) => {
    const t = tracks.find(track => track.id === trackId);
    if (!t) return;
    t.steps = {};
    if (t.drumSteps) {
      Object.keys(t.drumSteps).forEach(k => {
        t.drumSteps[k] = Array(totalSteps).fill(false);
      });
    }
    t.audioBuffer = undefined;
    t.audioFileName = undefined;
    onTrackChange(true);
  };

  const handleSplitClip = (trackId: string) => {
    const t = tracks.find(track => track.id === trackId);
    if (!t) return;
    const splitPoint = Math.floor(totalSteps / 2);
    const newTrack: Track = {
      ...t,
      id: `track-${t.type}-${Date.now()}`,
      name: `${t.name} (Split)`,
      steps: {},
      drumSteps: t.drumSteps ? JSON.parse(JSON.stringify(t.drumSteps)) : {},
    };
    Object.keys(t.steps).forEach(k => {
      const step = Number(k);
      if (step >= splitPoint) {
        newTrack.steps[step] = t.steps[step];
        delete t.steps[step];
      }
    });
    // Remove drum machine steps after split point
    if (t.drumSteps && newTrack.drumSteps) {
      Object.keys(t.drumSteps).forEach(k => {
        for (let i = splitPoint; i < totalSteps; i++) {
          t.drumSteps[k][i] = false;
        }
        for (let i = 0; i < splitPoint; i++) {
          newTrack.drumSteps[k][i] = false;
        }
      });
    }
    tracks.push(newTrack);
    AudioEngine.getInstance().setupTrackNodes(newTrack);
    onTrackChange(true);
  };

  const handleReverseAudio = (trackId: string) => {
    const t = tracks.find(track => track.id === trackId);
    if (!t || !t.audioBuffer) return;
    const ctx = AudioEngine.getInstance().ctx;
    if (!ctx) return;
    const buffer = t.audioBuffer;
    const reversed = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      const revData = reversed.getChannelData(channel);
      for (let i = 0; i < buffer.length; i++) {
        revData[i] = data[buffer.length - 1 - i];
      }
    }
    t.audioBuffer = reversed;
    onTrackChange(true);
  };

  const handleGainAudio = (trackId: string, gainDb: number) => {
    const t = tracks.find(track => track.id === trackId);
    if (!t || !t.audioBuffer) return;
    const ctx = AudioEngine.getInstance().ctx;
    if (!ctx) return;
    const multiplier = Math.pow(10, gainDb / 20);
    const buffer = t.audioBuffer;
    const gained = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      const gainedData = gained.getChannelData(channel);
      for (let i = 0; i < buffer.length; i++) {
        gainedData[i] = Math.max(-1.0, Math.min(1.0, data[i] * multiplier));
      }
    }
    t.audioBuffer = gained;
    onTrackChange(true);
  };

  const handleNormalizeAudio = (trackId: string) => {
    const t = tracks.find(track => track.id === trackId);
    if (!t || !t.audioBuffer) return;
    const ctx = AudioEngine.getInstance().ctx;
    if (!ctx) return;
    const buffer = t.audioBuffer;
    let peak = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < buffer.length; i++) {
        const val = Math.abs(data[i]);
        if (val > peak) peak = val;
      }
    }
    if (peak === 0) return;
    const scale = 0.95 / peak;
    const normalized = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      const normData = normalized.getChannelData(channel);
      for (let i = 0; i < buffer.length; i++) {
        normData[i] = data[i] * scale;
      }
    }
    t.audioBuffer = normalized;
    onTrackChange(true);
  };

  const handleSplitAudioAtPlayhead = (trackId: string) => {
    const t = tracks.find(track => track.id === trackId);
    if (!t || !t.audioBuffer) return;
    const ctx = AudioEngine.getInstance().ctx;
    if (!ctx) return;
    const audioStart = t.audioStartStep || 0;
    const splitStep = currentStep;
    const relativeSplitStep = splitStep - audioStart;
    const stepDuration = 60.0 / bpm / 4.0;
    const durationSteps = Math.ceil(t.audioBuffer.duration / stepDuration);
    if (relativeSplitStep <= 0 || relativeSplitStep >= durationSteps) {
      alert("Playhead must be inside the audio region to split!");
      return;
    }
    const splitTime = relativeSplitStep * stepDuration;
    const buffer = t.audioBuffer;
    const splitSample = Math.floor(splitTime * buffer.sampleRate);
    const buf1 = ctx.createBuffer(buffer.numberOfChannels, splitSample, buffer.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      buf1.getChannelData(channel).set(buffer.getChannelData(channel).subarray(0, splitSample));
    }
    const buf2Length = buffer.length - splitSample;
    const buf2 = ctx.createBuffer(buffer.numberOfChannels, buf2Length, buffer.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      buf2.getChannelData(channel).set(buffer.getChannelData(channel).subarray(splitSample));
    }
    const originalFileName = t.audioFileName || 'Audio';
    t.audioBuffer = buf1;
    t.audioFileName = `${originalFileName} (Part 1)`;
    const nextTrack: Track = {
      ...t,
      id: `track-audio-${Date.now()}`,
      name: `${t.name} (Split Part 2)`,
      audioBuffer: buf2,
      audioFileName: `${originalFileName} (Part 2)`,
      audioStartStep: splitStep,
      steps: {},
      drumSteps: {},
    };
    tracks.push(nextTrack);
    AudioEngine.getInstance().setupTrackNodes(nextTrack);
    onTrackChange(true);
  };
  
  const activeTotalSteps = previewTotalSteps !== null ? previewTotalSteps : totalSteps;
  const BUFFER_STEPS = 128; // Add 8 bars of empty space on the right


  const arrangerRef = useRef<HTMLDivElement>(null);
  const isDraggingPlayhead = useRef(false);
  const isDraggingLoopStart = useRef(false);
  const isDraggingLoopEnd = useRef(false);
  const isDraggingLoopMove = useRef(false);
  const dragStartStep = useRef(0);
  const initialLoopStart = useRef(0);
  const initialLoopEnd = useRef(0);

  const loopStartRef = useRef(loopStart);
  const loopEndRef = useRef(loopEnd);
  const totalStepsRef = useRef(activeTotalSteps);
  const zoomRef = useRef(zoom);

  useEffect(() => {
    loopStartRef.current = loopStart;
    loopEndRef.current = loopEnd;
    totalStepsRef.current = activeTotalSteps;
    zoomRef.current = zoom;
  }, [loopStart, loopEnd, activeTotalSteps, zoom]);

  // Handle Alt+Wheel horizontal zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (e.altKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 2 : -2;
      setZoom((prev) => Math.max(16, Math.min(64, prev + delta)));
    }
  };

  const handleLoopStartDrag = (e: MouseEvent) => {
    const ruler = document.querySelector('.timeline-ruler-track');
    if (!ruler) return;
    const rect = ruler.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let step = Math.floor(x / zoomRef.current);
    step = Math.max(0, Math.min(step, loopEndRef.current - 1));
    onLoopChange(step, loopEndRef.current);
  };

  const handleLoopEndDrag = (e: MouseEvent) => {
    const ruler = document.querySelector('.timeline-ruler-track');
    if (!ruler) return;
    const rect = ruler.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let step = Math.round(x / zoomRef.current);
    step = Math.max(loopStartRef.current + 1, Math.min(step, totalStepsRef.current));
    onLoopChange(loopStartRef.current, step);
  };

  const handleLoopMoveDrag = (e: MouseEvent) => {
    const ruler = document.querySelector('.timeline-ruler-track');
    if (!ruler) return;
    const rect = ruler.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const currentStepPos = Math.floor(x / zoomRef.current);
    const delta = currentStepPos - dragStartStep.current;
    
    let nextStart = initialLoopStart.current + delta;
    let nextEnd = initialLoopEnd.current + delta;
    
    const length = initialLoopEnd.current - initialLoopStart.current;
    
    if (nextStart < 0) {
      nextStart = 0;
      nextEnd = length;
    }
    if (nextEnd > totalStepsRef.current + BUFFER_STEPS) {
      nextEnd = totalStepsRef.current + BUFFER_STEPS;
      nextStart = nextEnd - length;
    }
    onLoopChange(nextStart, nextEnd);
  };

  const handleLoopDragEnd = () => {
    isDraggingLoopStart.current = false;
    isDraggingLoopEnd.current = false;
    isDraggingLoopMove.current = false;
    window.removeEventListener('mousemove', handleLoopStartDrag);
    window.removeEventListener('mousemove', handleLoopEndDrag);
    window.removeEventListener('mousemove', handleLoopMoveDrag);
    window.removeEventListener('mouseup', handleLoopDragEnd);
  };

  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickStep = clickX / zoom;
    
    const startX = loopStart * zoom;
    const endX = loopEnd * zoom;
    const tolerance = 12; // pixels tolerance for grab handles
    
    if (Math.abs(clickX - startX) <= tolerance) {
      isDraggingLoopStart.current = true;
      window.addEventListener('mousemove', handleLoopStartDrag);
      window.addEventListener('mouseup', handleLoopDragEnd);
    } else if (Math.abs(clickX - endX) <= tolerance) {
      isDraggingLoopEnd.current = true;
      window.addEventListener('mousemove', handleLoopEndDrag);
      window.addEventListener('mouseup', handleLoopDragEnd);
    } else if (clickStep >= loopStart && clickStep <= loopEnd) {
      isDraggingLoopMove.current = true;
      dragStartStep.current = Math.floor(clickStep);
      initialLoopStart.current = loopStart;
      initialLoopEnd.current = loopEnd;
      window.addEventListener('mousemove', handleLoopMoveDrag);
      window.addEventListener('mouseup', handleLoopDragEnd);
    } else {
      isDraggingPlayhead.current = true;
      movePlayheadToEventPosition(e);
      window.addEventListener('mouseup', handleTimelineMouseUp);
      window.addEventListener('mousemove', handleTimelineMouseMove as any);
    }
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
    const ruler = document.querySelector('.timeline-ruler-track');
    if (!ruler) return;

    const rect = ruler.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < 0) return;

    let stepIdx = Math.floor(x / zoomRef.current);
    
    // Snapping application
    if (snap === '1/8') {
      stepIdx = Math.round(stepIdx / 2) * 2;
    }

    stepIdx = Math.max(0, Math.min(totalStepsRef.current + BUFFER_STEPS - 1, stepIdx));
    onPlayheadMove(stepIdx);
  };

  const handleRegionMouseDown = (track: Track, e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectTrack(track.id);
    if (track.type !== 'audio' || !track.audioBuffer) return;

    const startX = e.clientX;
    const initialStartStep = track.audioStartStep || 0;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaSteps = Math.round(deltaX / zoom);
      let nextStartStep = initialStartStep + deltaSteps;
      nextStartStep = Math.max(0, Math.min(totalSteps - 1, nextStartStep));

      if (track.audioStartStep !== nextStartStep) {
        track.audioStartStep = nextStartStep;
        onTrackChange(false); // live updates, no history push
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      onTrackChange(true); // push to history on drag finish
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleProjectResizerMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    const scroller = document.querySelector('.arranger-timeline-scroller');
    if (!scroller) return;

    const startVirtualX = e.clientX + scroller.scrollLeft;
    const initialSteps = totalStepsRef.current;
    
    let currentClientX = e.clientX;
    let scrollInterval: number | null = null;

    const updateSteps = () => {
      const virtualX = currentClientX + scroller.scrollLeft;
      const deltaX = virtualX - startVirtualX;
      const deltaSteps = Math.round(deltaX / zoomRef.current);
      
      const rawSteps = initialSteps + deltaSteps;
      // Snap to 1 bar (16 steps)
      const snappedSteps = Math.max(16, Math.round(rawSteps / 16) * 16);
      
      setPreviewTotalSteps(snappedSteps);
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      currentClientX = moveEvent.clientX;
      updateSteps();
    };

    const handleMouseUp = (moveEvent: MouseEvent) => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (scrollInterval) window.clearInterval(scrollInterval);
      
      currentClientX = moveEvent.clientX;
      const virtualX = currentClientX + scroller.scrollLeft;
      const deltaX = virtualX - startVirtualX;
      const deltaSteps = Math.round(deltaX / zoomRef.current);
      const rawSteps = initialSteps + deltaSteps;
      const snappedSteps = Math.max(16, Math.round(rawSteps / 16) * 16);

      setPreviewTotalSteps(null);
      if (snappedSteps !== initialSteps && onTotalStepsChange) {
        onTotalStepsChange(snappedSteps);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    scrollInterval = window.setInterval(() => {
      const rect = scroller.getBoundingClientRect();
      const edgeThreshold = 60;
      const scrollSpeed = 30;
      
      if (currentClientX > rect.right - edgeThreshold) {
        scroller.scrollLeft += scrollSpeed;
        updateSteps();
      } else if (currentClientX < rect.left + edgeThreshold) {
        scroller.scrollLeft -= scrollSpeed;
        updateSteps();
      }
    }, 30);
  };


  // Helper to draw mini wave representation inside audio tracks
  const renderWaveform = (canvas: HTMLCanvasElement, buffer: AudioBuffer, color: string) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const data = buffer.getChannelData(0);
    const stepSize = Math.floor(data.length / width);
    const amp = height / 2;

    ctx.moveTo(0, amp);
    for (let i = 0; i < width; i++) {
      const minMax = { min: 1.0, max: -1.0 };
      for (let j = 0; j < stepSize; j++) {
        const val = data[i * stepSize + j] || 0;
        if (val < minMax.min) minMax.min = val;
        if (val > minMax.max) minMax.max = val;
      }
      ctx.lineTo(i, (1 + minMax.min) * amp);
      ctx.lineTo(i, (1 + minMax.max) * amp);
    }
    ctx.stroke();
  };

  const AudioWaveCanvas: React.FC<{ buffer: AudioBuffer; color: string }> = ({ buffer, color }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = canvas.parentElement?.clientWidth || 200;
        canvas.height = 76;
        renderWaveform(canvas, buffer, color);
      }
    }, [buffer, color]);
    return <canvas ref={canvasRef} className="track-inner-wave-canvas" />;
  };

  return (
    <div className="arranger-workspace" onWheel={handleWheel} ref={arrangerRef}>
      {/* Arranger Ribbon Bar */}
      <div className="arranger-ribbon">
        <div className="ruler-actions-left">
          <span className="ribbon-lbl">GRID SNAP</span>
          <select
            value={snap}
            onChange={(e) => setSnap(e.target.value)}
            className="arranger-snap-select"
          >
            <option value="Off">Smart (Off)</option>
            <option value="1/8">8th Note</option>
            <option value="1/16">16th Note</option>
          </select>
          <span className="arranger-zoom-tip">Alt+Wheel to Zoom</span>
        </div>
      </div>

      {/* Grid Timeline Scrollable Container */}
      <div className="arranger-timeline-scroller">
        <div className="arranger-grid-canvas" style={{ width: `${(activeTotalSteps + BUFFER_STEPS) * zoom}px` }}>
          
          {/* 1. Timeline Ruler */}
          <div className="timeline-ruler-track" onMouseDown={handleTimelineMouseDown}>
            {/* Highlighted cycle bar overlay */}
            <div
              className="ruler-cycle-bar"
              style={{
                left: `${loopStart * zoom}px`,
                width: `${(loopEnd - loopStart) * zoom}px`,
              }}
            />
            {Array.from({ length: activeTotalSteps + BUFFER_STEPS }).map((_, stepIdx) => {
              const isBeat = stepIdx % 4 === 0;
              const isBar = stepIdx % 16 === 0;
              let tickText = '';
              if (isBar) {
                tickText = `00${Math.floor(stepIdx / 16) + 1}`;
              } else if (isBeat) {
                tickText = `${Math.floor(stepIdx / 16) + 1}.${Math.floor((stepIdx % 16) / 4) + 1}`;
              }
              
              const isInLoop = stepIdx >= loopStart && stepIdx < loopEnd;
              
              return (
                <div
                  key={stepIdx}
                  className={`ruler-tick-cell ${isBar ? 'bar-tick' : isBeat ? 'beat-tick' : ''} ${isInLoop ? 'in-loop' : ''}`}
                  style={{ width: `${zoom}px` }}
                >
                  <span>{tickText}</span>
                </div>
              );
            })}
          </div>

          {/* 2. Playhead Layer */}
          <div
            className="arranger-playhead-line"
            style={{
              left: `${currentStep * zoom}px`,
            }}
          >
            <div className="playhead-triangle" />
          </div>

          {/* 4. Horizontal Track Blocks */}
          <div className="timeline-rows-container">
            {tracks.map((track) => {
              const isSelected = track.id === selectedTrackId;
              
              // Calculate start position and width of region
              let regionLeft = 0;
              let regionWidth = activeTotalSteps * zoom; // default full grid width
              
              if (track.type === 'audio' && track.audioBuffer) {
                const stepDuration = 60.0 / bpm / 4.0;
                const durationSteps = track.audioBuffer.duration / stepDuration;
                regionLeft = (track.audioStartStep || 0) * zoom;
                regionWidth = Math.min((activeTotalSteps - (track.audioStartStep || 0)) * zoom, durationSteps * zoom);
              }
              
              return (
                <div
                  key={track.id}
                  className={`timeline-track-row ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelectTrack(track.id)}
                  onDoubleClick={() => onDoubleClickRegion(track)}
                  style={{
                    height: '80px',
                    borderColor: isSelected ? track.color : undefined,
                  }}
                >
                  {/* Block Region inside Track */}
                  <div
                    className="track-block-region"
                    onMouseDown={(e) => {
                      if (e.button === 0) handleRegionMouseDown(track, e);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({ x: e.clientX, y: e.clientY, trackId: track.id });
                    }}
                    style={{
                      left: `${regionLeft}px`,
                      width: `${regionWidth}px`,
                      right: 'auto',
                      borderLeft: `3px solid ${track.color}`,
                      cursor: track.type === 'audio' && track.audioBuffer ? 'grab' : 'pointer',
                    }}
                  >
                    {track.type !== 'audio' && (
                      <div
                        className="track-region-resizer"
                        onMouseDown={handleProjectResizerMouseDown}
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: 0,
                          bottom: 0,
                          width: '12px',
                          cursor: 'e-resize',
                          zIndex: 10,
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          borderLeft: '1px solid rgba(255,255,255,0.2)'
                        }}
                        title="Drag to extend total project length"
                      />
                    )}

                    {track.type === 'synth' && (
                      <div className="track-block-midi-notes">
                        {/* Draw mini MIDI notes representations */}
                        {Object.entries(track.steps).map(([stepStr, notes]) => {
                          const step = Number(stepStr);
                          if (!notes || notes.length === 0) return null;
                          return notes.map((noteObj, idx) => {
                            const noteName = typeof noteObj === 'string' ? noteObj : noteObj.pitch;
                            const noteDuration = typeof noteObj === 'string' ? 1 : (noteObj.duration || 1);
                            
                            const pitchIdx = CHROMATIC_SCALE.indexOf(noteName);
                            const topPercent = pitchIdx >= 0 ? 10 + (pitchIdx / CHROMATIC_SCALE.length) * 56 : 36;
                            return (
                              <div
                                key={`${step}-${noteName}-${idx}`}
                                className="mini-midi-note"
                                style={{
                                  left: `${step * zoom}px`,
                                  width: `${zoom * noteDuration}px`,
                                  top: `${topPercent}px`,
                                  backgroundColor: track.color,
                                  height: '2px',
                                }}
                              />
                            );
                          });
                        })}
                      </div>
                    )}

                    {track.type === 'drum' && (
                      <div className="track-block-drum-notes">
                        {/* Draw kick beats as red ticks, sn as cyan, hihat yellow, clap purple */}
                        {Array.from({ length: activeTotalSteps }).map((_, step) => {
                          const insts = [
                            { active: track.drumSteps.kick?.[step], color: '#ff1744', top: 52 },
                            { active: track.drumSteps.snare?.[step], color: '#00e5ff', top: 38 },
                            { active: track.drumSteps.hihat?.[step], color: '#ffea00', top: 24 },
                            { active: track.drumSteps.clap?.[step], color: '#d500f9', top: 10 }
                          ];
                          
                          return insts.map((inst, i) => {
                            if (!inst.active) return null;
                            return (
                              <div
                                key={`${step}-${i}`}
                                className="mini-drum-tick"
                                style={{
                                  left: `${step * zoom}px`,
                                  width: '3px',
                                  height: '8px',
                                  top: `${inst.top}px`,
                                  bottom: 'auto',
                                  backgroundColor: inst.color,
                                }}
                              />
                            );
                          });
                        })}
                      </div>
                    )}

                    {track.type === 'audio' && track.audioBuffer ? (
                      <AudioWaveCanvas buffer={track.audioBuffer} color={track.color} />
                    ) : track.type === 'audio' ? (
                      <div className="empty-audio-block-msg">
                        Drag/Import Audio File on Left panel to display waveform
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={(() => {
            const track = tracks.find(t => t.id === contextMenu.trackId);
            if (!track) return [];
            
            if (track.type === 'audio') {
              return [
                {
                  label: 'Split at Playhead (재생선에서 자르기)',
                  onClick: () => handleSplitAudioAtPlayhead(contextMenu.trackId)
                },
                {
                  label: 'Reverse Audio (역재생)',
                  onClick: () => handleReverseAudio(contextMenu.trackId)
                },
                {
                  label: 'Gain +3dB (음량 키우기)',
                  onClick: () => handleGainAudio(contextMenu.trackId, 3)
                },
                {
                  label: 'Gain -3dB (음량 줄이기)',
                  onClick: () => handleGainAudio(contextMenu.trackId, -3)
                },
                {
                  label: 'Normalize Audio (음량 최적화)',
                  onClick: () => handleNormalizeAudio(contextMenu.trackId)
                },
                {
                  label: 'Clear/Delete Region (삭제)',
                  danger: true,
                  divider: true,
                  onClick: () => handleDeleteClip(contextMenu.trackId)
                }
              ];
            } else {
              return [
                {
                  label: 'Copy Region Content (클립 복제)',
                  onClick: () => {
                    const copy: Track = {
                      ...track,
                      id: `track-${track.type}-${Date.now()}`,
                      name: `${track.name} Copy`,
                      steps: JSON.parse(JSON.stringify(track.steps)),
                      drumSteps: track.drumSteps ? JSON.parse(JSON.stringify(track.drumSteps)) : {},
                    };
                    tracks.push(copy);
                    AudioEngine.getInstance().setupTrackNodes(copy);
                    onTrackChange(true);
                  }
                },
                {
                  label: 'Split Region at Center (Bar 1/2)',
                  onClick: () => handleSplitClip(contextMenu.trackId)
                },
                {
                  label: 'Clear/Delete Region Content (삭제)',
                  danger: true,
                  divider: true,
                  onClick: () => handleDeleteClip(contextMenu.trackId)
                }
              ];
            }
          })()}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};
