import React, { useRef, useState } from 'react';
import { Trash2, Radio, Music, ChevronRight, ChevronDown } from 'lucide-react';
import { AudioEngine, type Track } from '../audio/AudioEngine';

interface TrackListProps {
  tracks: Track[];
  selectedTrackId: string | null;
  onSelectTrack: (trackId: string) => void;
  onDeleteTrack: (trackId: string) => void;
  onTrackChange: (shouldPushHistory?: boolean) => void;
}

const PRESET_COLORS = ['#3BB1D8', '#4D9945', '#ff9100', '#ffea00', '#9c27b0', '#ff007f'];

export const TrackList: React.FC<TrackListProps> = ({
  tracks,
  selectedTrackId,
  onSelectTrack,
  onDeleteTrack,
  onTrackChange,
}) => {
  const engine = AudioEngine.getInstance();
  const fileInputRefs = useRef<{ [trackId: string]: HTMLInputElement | null }>({});
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [showColorPickerId, setShowColorPickerId] = useState<string | null>(null);

  const handleMuteToggle = (track: Track) => {
    track.mute = !track.mute;
    onTrackChange();
  };

  const handleSoloToggle = (track: Track) => {
    track.solo = !track.solo;
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
      <div className="track-headers-title-bar">
        <span>TRACK HEADERS</span>
      </div>

      <div className="track-headers-list">
        {tracks.map((track) => {
          const isSelected = track.id === selectedTrackId;
          const isGrouped = !!track.groupId;

          return (
            <div
              key={track.id}
              className={`track-header-row ${isSelected ? 'selected' : ''}`}
              style={{
                height: '80px',
                borderLeft: `4px solid ${track.color}`,
                paddingLeft: isGrouped ? '24px' : '10px'
              }}
              onClick={() => onSelectTrack(track.id)}
            >
              {/* First Line: Color Dot + Name / Input */}
              <div className="header-row-line-1" onClick={(e) => e.stopPropagation()}>
                {track.isFolder && (
                  <button
                    onClick={() => toggleFolderCollapse(track)}
                    style={{ background: 'none', border: 'none', color: '#00f2fe', cursor: 'pointer', padding: 0, marginRight: '4px' }}
                  >
                    {track.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </button>
                )}
                <div className="color-dot-picker-container">
                  <button
                    className="track-color-indicator"
                    style={{ backgroundColor: track.color }}
                    onClick={() => setShowColorPickerId(showColorPickerId === track.id ? null : track.id)}
                  />
                  {showColorPickerId === track.id && (
                    <div className="color-palette-dropdown">
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

                <span className={`track-badge-mini ${track.type}`}>
                  {track.type.substring(0, 3).toUpperCase()}
                </span>
              </div>

              {/* Second Line: Mute, Solo, Volume summary, import & delete */}
              <div className="header-row-line-2" onClick={(e) => e.stopPropagation()}>
                <div className="mini-ms-group">
                  <button
                    className={`mini-ms-btn mute ${track.mute ? 'active' : ''}`}
                    onClick={() => handleMuteToggle(track)}
                    title="Mute"
                  >
                    M
                  </button>
                  <button
                    className={`mini-ms-btn solo ${track.solo ? 'active' : ''}`}
                    onClick={() => handleSoloToggle(track)}
                    title="Solo"
                  >
                    S
                  </button>
                </div>

                {/* Import trigger for audio */}
                {track.type === 'audio' && (
                  <div className="mini-audio-uploader">
                    <button
                      className="mini-upload-btn"
                      onClick={() => fileInputRefs.current[track.id]?.click()}
                      title="Import Audio File"
                    >
                      <Music size={11} />
                    </button>
                    <input
                      type="file"
                      accept="audio/*"
                      ref={(el) => { fileInputRefs.current[track.id] = el; }}
                      onChange={(e) => handleAudioUpload(track, e)}
                      className="hidden-file-input"
                    />
                  </div>
                )}

                <div className="mini-action-group-right">
                  <button
                    className="mini-track-action-btn"
                    onClick={() => engine.triggerTrackAudition(track)}
                    title="Audition"
                  >
                    <Radio size={11} />
                  </button>
                  <button
                    className="mini-track-action-btn del"
                    onClick={() => onDeleteTrack(track.id)}
                    title="Delete Track"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
