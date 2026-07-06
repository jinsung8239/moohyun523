import React, { useRef, useState } from 'react';
import { Trash2, Radio, Music, ChevronRight, ChevronDown, Volume2, Circle, Keyboard } from 'lucide-react';
import { AudioEngine, type Track } from '../audio/AudioEngine';
import { ContextMenu, type ContextMenuItem } from '../ui/components';

interface TrackListProps {
  tracks: Track[];
  selectedTrackId: string | null;
  onSelectTrack: (trackId: string) => void;
  onDeleteTrack: (trackId: string) => void;
  onTrackChange: (shouldPushHistory?: boolean) => void;
  onAddTrack: (type: 'synth' | 'drum' | 'audio') => void;
}

const PRESET_COLORS = ['#3bb1d8', '#ff9100', '#ffea00', '#4d9945', '#9c27b0', '#ff007f'];

export const TrackList: React.FC<TrackListProps> = ({
  tracks,
  selectedTrackId,
  onSelectTrack,
  onDeleteTrack,
  onTrackChange,
  onAddTrack,
}) => {
  const engine = AudioEngine.getInstance();
  const fileInputRefs = useRef<{ [trackId: string]: HTMLInputElement | null }>({});
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [showColorPickerId, setShowColorPickerId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; trackId: string } | null>(null);

  const handleCopyTrack = (trackId: string) => {
    const trackToCopy = tracks.find(t => t.id === trackId);
    if (!trackToCopy) return;
    const copy: Track = {
      ...trackToCopy,
      id: `track-${trackToCopy.type}-${Date.now()}`,
      name: `${trackToCopy.name} Copy`,
      steps: JSON.parse(JSON.stringify(trackToCopy.steps)),
      drumSteps: JSON.parse(JSON.stringify(trackToCopy.drumSteps || {})),
    };
    engine.tracks.push(copy);
    engine.setupTrackNodes(copy);
    onTrackChange(true);
  };

  const handleChangeColor = (trackId: string) => {
    const t = tracks.find(t => t.id === trackId);
    if (!t) return;
    const currentIdx = PRESET_COLORS.indexOf(t.color);
    const nextColor = PRESET_COLORS[(currentIdx + 1) % PRESET_COLORS.length];
    t.color = nextColor;
    onTrackChange(true);
  };

  const handleMuteToggle = (track: Track) => {
    track.mute = !track.mute;
    onTrackChange();
  };

  const handleSoloToggle = (track: Track) => {
    track.solo = !track.solo;
    onTrackChange();
  };

  const handleRecordToggle = (track: Track) => {
    // Toggle mock record arm
    track.pedalBypass = !track.pedalBypass; // Borrowing pedalBypass or utilizing custom field
    onTrackChange();
  };

  const handleTrackRename = (track: Track, newName: string) => {
    track.name = newName.trim() || track.name;
    onTrackChange();
  };

  const handleTrackColorChange = (track: Track, color: string) => {
    track.color = color;
    setShowColorPickerId(null);
    onTrackChange();
  };

  const toggleFolderCollapse = (track: Track) => {
    track.collapsed = !track.collapsed;
    onTrackChange();
  };

  const handleAudioUpload = async (track: Track, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    engine.init();
    if (!engine.ctx) return;

    track.audioFileName = file.name;
    onTrackChange();

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        if (!arrayBuffer) return;

        if (engine.ctx) {
          const decoded = await engine.ctx.decodeAudioData(arrayBuffer);
          track.audioBuffer = decoded;
          onTrackChange();
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      console.error('Error decoding audio:', err);
    }
  };

  return (
    <div className="track-headers-column">
      <div className="track-headers-title-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
        <span>Track List and Timeline</span>
        <button 
          onClick={() => setShowAddMenu(!showAddMenu)}
          style={{
            backgroundColor: '#23252a',
            border: '1px solid #3c424f',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '10px',
            fontWeight: 'bold',
            padding: '2px 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            height: '20px'
          }}
          title="Add a new MIDI, Drum or Audio Track"
        >
          + Add
        </button>

        {showAddMenu && (
          <div 
            style={{
              position: 'absolute',
              top: '28px',
              right: '8px',
              backgroundColor: '#1b1c20',
              border: '1px solid #3c424f',
              borderRadius: '4px',
              width: '110px',
              zIndex: 1100,
              boxShadow: '0 4px 10px rgba(0,0,0,0.5)'
            }}
          >
            <button 
              onClick={() => { onAddTrack('synth'); setShowAddMenu(false); }}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                color: '#fff',
                textAlign: 'left',
                padding: '6px 8px',
                fontSize: '10px',
                cursor: 'pointer',
                borderBottom: '1px solid #23252a'
              }}
            >
              + Synth Track
            </button>
            <button 
              onClick={() => { onAddTrack('drum'); setShowAddMenu(false); }}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                color: '#fff',
                textAlign: 'left',
                padding: '6px 8px',
                fontSize: '10px',
                cursor: 'pointer',
                borderBottom: '1px solid #23252a'
              }}
            >
              + Drum Track
            </button>
            <button 
              onClick={() => { onAddTrack('audio'); setShowAddMenu(false); }}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                color: '#fff',
                textAlign: 'left',
                padding: '6px 8px',
                fontSize: '10px',
                cursor: 'pointer'
              }}
            >
              + Audio Track
            </button>
          </div>
        )}
      </div>

      <div className="track-headers-list">
        {tracks.map((track, index) => {
          const isSelected = track.id === selectedTrackId;
          const isGrouped = !!track.groupId;
          const isRecordArmed = !!track.pedalBypass; // Armed indicator

          return (
            <div
              key={track.id}
              className={`track-header-row ${isSelected ? 'selected' : ''}`}
              style={{
                height: '80px',
                borderLeft: `4px solid ${track.color}`,
                paddingLeft: isGrouped ? '24px' : '0px'
              }}
              onClick={() => onSelectTrack(track.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ x: e.clientX, y: e.clientY, trackId: track.id });
              }}
            >
              {/* Left Side: Number, Icon, Name, Folder Arrow */}
              <div className="track-header-left-col">
                <div className="track-number-badge">{index + 1}</div>
                
                {/* Folder Toggle */}
                {track.isFolder && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFolderCollapse(track); }}
                    className="folder-toggle-btn"
                  >
                    {track.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  </button>
                )}

                {/* Track Icon based on type */}
                <div 
                  className="track-icon-wrapper" 
                  style={{ backgroundColor: `${track.color}15`, color: track.color }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowColorPickerId(showColorPickerId === track.id ? null : track.id);
                  }}
                  title="Click to change track color"
                >
                  {track.type === 'synth' ? <Keyboard size={13} /> : track.type === 'drum' ? <Music size={13} /> : <Volume2 size={13} />}
                  
                  {/* Color Palette dropdown */}
                  {showColorPickerId === track.id && (
                    <div className="color-palette-dropdown" onClick={(e) => e.stopPropagation()}>
                      {PRESET_COLORS.map((c) => (
                        <div
                          key={c}
                          className="color-swatch-chip"
                          style={{ backgroundColor: c }}
                          onClick={() => handleTrackColorChange(track, c)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Track Name */}
                <div className="track-name-wrapper" onClick={(e) => e.stopPropagation()}>
                  {editingTrackId === track.id ? (
                    <input
                      type="text"
                      defaultValue={track.name}
                      onBlur={(e) => {
                        handleTrackRename(track, e.target.value);
                        setEditingTrackId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleTrackRename(track, (e.target as HTMLInputElement).value);
                          setEditingTrackId(null);
                        }
                      }}
                      autoFocus
                      className="track-name-inline-input"
                    />
                  ) : (
                    <span
                      className="track-header-name"
                      onDoubleClick={() => setEditingTrackId(track.id)}
                      title="Double-click to rename"
                    >
                      {track.name}
                    </span>
                  )}
                </div>
              </div>

              {/* Middle Section: M/S, Record, Audition, Delete Controls */}
              <div className="track-header-controls-col" onClick={(e) => e.stopPropagation()}>
                <div className="track-transport-buttons">
                  {/* Mute Button */}
                  <button
                    className={`track-ms-btn mute-btn ${track.mute ? 'active' : ''}`}
                    onClick={() => handleMuteToggle(track)}
                    title="Mute (M)"
                  >
                    M
                  </button>

                  {/* Solo Button */}
                  <button
                    className={`track-ms-btn solo-btn ${track.solo ? 'active' : ''}`}
                    onClick={() => handleSoloToggle(track)}
                    title="Solo (S)"
                  >
                    S
                  </button>

                  {/* Record Arm Button */}
                  <button
                    className={`track-ms-btn rec-btn ${isRecordArmed ? 'active' : ''}`}
                    onClick={() => handleRecordToggle(track)}
                    title="Record Arm"
                  >
                    <Circle size={8} fill={isRecordArmed ? 'currentColor' : 'none'} />
                  </button>

                  {/* Input Monitor (Speaker style icon representation) */}
                  <button
                    className="track-ms-btn monitor-btn"
                    onClick={() => engine.triggerTrackAudition(track)}
                    title="Input Monitor / Audition"
                  >
                    <Radio size={10} />
                  </button>
                </div>

                <div className="track-action-buttons">
                  {track.type === 'audio' && (
                    <>
                      <button
                        className="track-util-btn"
                        onClick={() => fileInputRefs.current[track.id]?.click()}
                        title="Upload Audio Sample"
                      >
                        Audio
                      </button>
                      <input
                        type="file"
                        accept="audio/*"
                        ref={(el) => { fileInputRefs.current[track.id] = el; }}
                        onChange={(e) => handleAudioUpload(track, e)}
                        style={{ display: 'none' }}
                      />
                    </>
                  )}
                  <button
                    className="track-util-btn delete"
                    onClick={() => onDeleteTrack(track.id)}
                    title="Delete Track"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>

              {/* Right Section: Volume Slider & Rotary Pan Knob */}
              <div className="track-header-mix-col" onClick={(e) => e.stopPropagation()}>
                {/* Volume Slider */}
                <div className="track-slider-container">
                  <input
                    type="range"
                    min="-60"
                    max="6"
                    step="0.5"
                    value={track.volumeDb}
                    onChange={(e) => {
                      track.volumeDb = parseFloat(e.target.value);
                      onTrackChange(false);
                    }}
                    className="track-mix-volume-slider"
                  />
                </div>

                {/* Rotary Pan Knob */}
                <div className="track-pan-container">
                  <span className="pan-label">C</span>
                  <div className="pan-knob-graphic">
                    <svg width="18" height="18" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="50" cy="50" r="40" stroke="#2c3038" strokeWidth="12" fill="none" />
                      {/* Knob indicator line representing Center position */}
                      <line x1="50" y1="50" x2="90" y2="50" stroke={track.color} strokeWidth="14" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              label: 'Track Copy (Duplicate)',
              onClick: () => handleCopyTrack(contextMenu.trackId)
            },
            {
              label: 'Change Color (Cycle)',
              onClick: () => handleChangeColor(contextMenu.trackId)
            },
            {
              label: 'Add Software Instrument (Synth)',
              onClick: () => onAddTrack('synth')
            },
            {
              label: 'Add Drum Machine',
              onClick: () => onAddTrack('drum')
            },
            {
              label: 'Add Audio Track',
              onClick: () => onAddTrack('audio')
            },
            {
              label: 'Delete Track',
              danger: true,
              divider: true,
              onClick: () => onDeleteTrack(contextMenu.trackId)
            }
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};
