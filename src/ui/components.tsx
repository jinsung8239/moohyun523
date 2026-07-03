/**
 * AntiGravity DAW - UI Components
 * Professional React components for DAW interface
 * 
 * Features:
 * - Custom knobs and faders
 * - Piano roll editor
 * - Mixer console
 * - Transport controls
 */

import React, { useState, useRef, useEffect } from 'react';

// ============ Knob Component ============
interface KnobProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label?: string;
  size?: number;
  color?: string;
}

export const Knob: React.FC<KnobProps> = ({
  value,
  min,
  max,
  onChange,
  label,
  size = 50,
  color = '#3BB1D8'
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startValue = useRef(0);

  const normalizedValue = (value - min) / (max - min);
  const rotation = -135 + normalizedValue * 270;

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startY.current = e.clientY;
    startValue.current = value;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const deltaY = startY.current - e.clientY;
      const range = max - min;
      const sensitivity = range / 200;
      const newValue = Math.min(max, Math.max(min, startValue.current + deltaY * sensitivity));
      
      onChange(newValue);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, min, max, onChange]);

  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size * 0.4;

  const indicatorX = centerX + radius * Math.sin((rotation * Math.PI) / 180);
  const indicatorY = centerY - radius * Math.cos((rotation * Math.PI) / 180);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        onMouseDown={handleMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        {/* Background circle */}
        <circle
          cx={centerX}
          cy={centerY}
          r={radius}
          fill="none"
          stroke="#333"
          strokeWidth="4"
        />
        
        {/* Value arc */}
        <circle
          cx={centerX}
          cy={centerY}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={`${(normalizedValue * 270 / 360) * 2 * Math.PI * radius} ${2 * Math.PI * radius}`}
          transform={`rotate(-135 ${centerX} ${centerY})`}
          strokeLinecap="round"
        />
        
        {/* Indicator line */}
        <line
          x1={centerX}
          y1={centerY}
          x2={indicatorX}
          y2={indicatorY}
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
        />
        
        {/* Center dot */}
        <circle cx={centerX} cy={centerY} r="4" fill={color} />
      </svg>
      
      {label && (
        <span style={{ fontSize: '10px', color: '#aaa', textAlign: 'center' }}>
          {label}
        </span>
      )}
    </div>
  );
};

// ============ Fader Component ============
interface FaderProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label?: string;
  height?: number;
  color?: string;
}

export const Fader: React.FC<FaderProps> = ({
  value,
  min,
  max,
  onChange,
  label,
  height = 150,
  color = '#3BB1D8'
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const normalizedValue = (value - min) / (max - min);
  const handleY = height - normalizedValue * (height - 30) - 15;

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    e.stopPropagation();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      const normalized = 1 - (relativeY - 15) / (height - 30);
      const newValue = Math.min(max, Math.max(min, normalized * (max - min) + min));
      
      onChange(newValue);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, min, max, onChange, height]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      <div
        ref={containerRef}
        style={{
          width: '30px',
          height: `${height}px`,
          background: '#222',
          borderRadius: '4px',
          position: 'relative',
          cursor: 'pointer'
        }}
        onClick={(e) => {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            const relativeY = e.clientY - rect.top;
            const normalized = 1 - (relativeY - 15) / (height - 30);
            onChange(Math.min(max, Math.max(min, normalized * (max - min) + min)));
          }
        }}
      >
        {/* Track line */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '15px',
            bottom: '15px',
            width: '2px',
            background: '#444',
            transform: 'translateX(-50%)'
          }}
        />
        
        {/* Handle */}
        <div
          onMouseDown={handleMouseDown}
          style={{
            position: 'absolute',
            left: '50%',
            top: `${handleY}px`,
            width: '24px',
            height: '30px',
            background: `linear-gradient(180deg, ${color} 0%, #1a1a2e 100%)`,
            borderRadius: '4px',
            transform: 'translateX(-50%)',
            cursor: isDragging ? 'grabbing' : 'grab',
            boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
            border: '1px solid #444'
          }}
        >
          {/* Handle indicator */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: '12px',
              height: '2px',
              background: '#fff',
              transform: 'translate(-50%, -50%)'
            }}
          />
        </div>
      </div>
      
      {label && (
        <span style={{ fontSize: '10px', color: '#aaa' }}>{label}</span>
      )}
    </div>
  );
};

// ============ Piano Roll Component ============
interface PianoRollNote {
  id: string;
  pitch: number;
  startStep: number;
  duration: number;
  velocity: number;
}

interface PianoRollProps {
  notes: PianoRollNote[];
  totalSteps: number;
  _selectedPitch?: number;
  onAddNote: (pitch: number, step: number) => void;
  onRemoveNote: (noteId: string) => void;
  _onUpdateNote?: (noteId: string, updates: Partial<PianoRollNote>) => void;
}

export const PianoRoll: React.FC<PianoRollProps> = ({
  notes,
  totalSteps,
  onAddNote,
  onRemoveNote,
  _onUpdateNote
}) => {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  
  const getNoteName = (midi: number) => {
    const octave = Math.floor(midi / 12) - 1;
    const noteName = noteNames[midi % 12];
    return `${noteName}${octave}`;
  };

  // Generate piano keys from C2 to C6
  const pitches = Array.from({ length: 49 }, (_, i) => 36 + i); // C2 to C6

  const handleCellClick = (pitch: number, step: number) => {
    const existingNote = notes.find(
      n => n.pitch === pitch && n.startStep <= step && n.startStep + n.duration > step
    );

    if (existingNote) {
      onRemoveNote(existingNote.id);
    } else {
      onAddNote(pitch, step);
    }
  };

  const handleGridMouseDown = () => {
    setIsDrawing(true);
  };

  useEffect(() => {
    const handleMouseUp = () => {
      setIsDrawing(false);
    };

    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  return (
    <div style={{ display: 'flex', height: '400px', background: '#1a1a2e', overflow: 'hidden' }}>
      {/* Piano Keys */}
      <div style={{ width: '60px', flexShrink: 0, background: '#111' }}>
        {pitches.slice().reverse().map(pitch => {
          const isBlack = [1, 3, 6, 8, 10].includes(pitch % 12);
          return (
            <div
              key={pitch}
              style={{
                height: '20px',
                background: isBlack ? '#333' : '#eee',
                color: isBlack ? '#fff' : '#000',
                fontSize: '9px',
                display: 'flex',
                alignItems: 'center',
                padding: '0 4px',
                borderBottom: '1px solid #222',
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              {getNoteName(pitch)}
            </div>
          );
        })}
      </div>

      {/* Grid */}
      <div
        ref={gridRef}
        onMouseDown={handleGridMouseDown}
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: `repeat(${totalSteps}, 1fr)`,
          gridTemplateRows: 'repeat(49, 20px)',
          overflow: 'auto',
          position: 'relative'
        }}
      >
        {/* Grid lines */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: `
              linear-gradient(to right, #333 1px, transparent 1px),
              linear-gradient(to bottom, #222 1px, transparent 1px)
            `,
            backgroundSize: `${100 / totalSteps}% 20px`,
            pointerEvents: 'none'
          }}
        />

        {/* Notes */}
        {notes.map(note => {
          const rowIndex = pitches.length - 1 - (note.pitch - pitches[0]);
          return (
            <div
              key={note.id}
              onClick={() => setSelectedNoteId(note.id)}
              onDoubleClick={() => onRemoveNote(note.id)}
              style={{
                gridColumn: `${note.startStep + 1} / span ${note.duration}`,
                gridRow: rowIndex + 1,
                background: selectedNoteId === note.id ? '#ff6b6b' : '#4ecdc4',
                borderRadius: '2px',
                margin: '1px',
                cursor: 'pointer',
                position: 'relative'
              }}
            />
          );
        })}

        {/* Clickable cells */}
        {pitches.slice().reverse().map((pitch, rowIdx) =>
          Array.from({ length: totalSteps }).map((_, colIdx) => (
            <div
              key={`${pitch}-${colIdx}`}
              style={{
                gridColumn: colIdx + 1,
                gridRow: rowIdx + 1,
                cursor: 'pointer',
                zIndex: 1
              }}
              onClick={() => handleCellClick(pitch, colIdx)}
            />
          ))
        )}
      </div>
    </div>
  );
};

// ============ Transport Controls ============
interface TransportProps {
  isPlaying: boolean;
  bpm: number;
  currentStep: number;
  onPlayToggle: () => void;
  onStop: () => void;
  onBpmChange: (bpm: number) => void;
}

export const Transport: React.FC<TransportProps> = ({
  isPlaying,
  bpm,
  currentStep,
  onPlayToggle,
  onStop,
  onBpmChange
}) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      padding: '8px 16px',
      background: '#1a1a2e',
      borderBottom: '1px solid #333'
    }}>
      {/* Play/Stop Buttons */}
      <button
        onClick={onPlayToggle}
        style={{
          padding: '8px 24px',
          background: isPlaying ? '#4ecdc4' : '#3BB1D8',
          border: 'none',
          borderRadius: '4px',
          color: '#fff',
          fontWeight: 'bold',
          cursor: 'pointer',
          fontSize: '14px'
        }}
      >
        {isPlaying ? '⏸ Pause' : '▶ Play'}
      </button>

      <button
        onClick={onStop}
        style={{
          padding: '8px 16px',
          background: '#ff6b6b',
          border: 'none',
          borderRadius: '4px',
          color: '#fff',
          fontWeight: 'bold',
          cursor: 'pointer',
          fontSize: '14px'
        }}
      >
        ⏹ Stop
      </button>

      {/* BPM Control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: '#aaa', fontSize: '12px' }}>BPM:</span>
        <input
          type="number"
          value={bpm}
          onChange={(e) => onBpmChange(Number(e.target.value))}
          min={40}
          max={300}
          style={{
            width: '60px',
            padding: '4px 8px',
            background: '#222',
            border: '1px solid #444',
            borderRadius: '4px',
            color: '#fff',
            textAlign: 'center'
          }}
        />
      </div>

      {/* Step Counter */}
      <div style={{
        padding: '4px 12px',
        background: '#222',
        borderRadius: '4px',
        color: '#3BB1D8',
        fontFamily: 'monospace',
        fontSize: '14px'
      }}>
        Step: {currentStep}
      </div>
    </div>
  );
};

// ============ Button Component ============
interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  variant = 'primary',
  size = 'medium',
  disabled = false
}) => {
  const colors = {
    primary: '#3BB1D8',
    secondary: '#4D9945',
    danger: '#ff6b6b'
  };

  const sizes = {
    small: { padding: '4px 8px', fontSize: '12px' },
    medium: { padding: '8px 16px', fontSize: '14px' },
    large: { padding: '12px 24px', fontSize: '16px' }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...sizes[size],
        background: disabled ? '#444' : colors[variant],
        border: 'none',
        borderRadius: '4px',
        color: '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s'
      }}
      onMouseEnter={(e) => {
        if (!disabled && e.currentTarget) {
          e.currentTarget.style.filter = 'brightness(1.1)';
        }
      }}
      onMouseLeave={(e) => {
        if (e.currentTarget) {
          e.currentTarget.style.filter = 'none';
        }
      }}
    >
      {children}
    </button>
  );
};

// ============ Meter Component ============
interface MeterProps {
  level: number;
  height?: number;
  color?: string;
}

export const Meter: React.FC<MeterProps> = ({
  level,
  height = 200,
  color = '#3BB1D8'
}) => {
  const normalizedLevel = Math.max(0, Math.min(1, level));
  const fillHeight = normalizedLevel * height;

  return (
    <div style={{
      width: '20px',
      height: `${height}px`,
      background: '#222',
      borderRadius: '2px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: `${fillHeight}px`,
          background: `linear-gradient(to top, ${color}, ${color}88)`,
          transition: 'height 0.05s'
        }}
      />
      
      {/* Grid lines */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 19px, #444 20px)',
        pointerEvents: 'none'
      }} />
    </div>
  );
};
