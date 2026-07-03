import React, { useEffect, useRef, useState } from 'react';
import type { Track } from '../audio/AudioEngine';
import { AudioEngine } from '../audio/AudioEngine';

interface MixerProps {
  tracks: Track[];
  onTrackChange: (shouldPushHistory?: boolean) => void;
  isPlaying: boolean;
}

export const Mixer: React.FC<MixerProps> = ({ tracks, onTrackChange, isPlaying }) => {
  const engine = AudioEngine.getInstance();
  const animationRef = useRef<number | null>(null);

  // Peak hold state
  const clipHoldTimers = useRef<{ [key: string]: number }>({});
  const [clippedStates, setClippedStates] = useState<{ [key: string]: boolean }>({});

  const handleMuteToggle = (track: Track) => {
    track.mute = !track.mute;
    onTrackChange(true); // discrete event, push immediately
  };

  const handleSoloToggle = (track: Track) => {
    track.solo = !track.solo;
    onTrackChange(true); // discrete event, push immediately
  };

  const handlePanChange = (track: Track, e: React.ChangeEvent<HTMLInputElement>) => {
    track.pan = Number(e.target.value);
    engine.updateTrackNodeLevels(track);
    onTrackChange(false); // live updates, no history push
  };

  const handleVolumeChange = (track: Track, e: React.ChangeEvent<HTMLInputElement>) => {
    track.volumeDb = Number(e.target.value);
    engine.updateTrackNodeLevels(track);
    onTrackChange(false); // live updates, no history push
  };

  const handleTrackChangeEnd = () => {
    onTrackChange(true); // push to history on drag finish
  };

  const handlePanDoubleClick = (track: Track) => {
    track.pan = 0.0;
    engine.updateTrackNodeLevels(track);
    onTrackChange(true); // discrete event, push immediately
  };

  const handleVolumeDoubleClick = (track: Track) => {
    track.volumeDb = 0.0;
    engine.updateTrackNodeLevels(track);
    onTrackChange(true); // discrete event, push immediately
  };

  // 60FPS level updates loop
  useEffect(() => {
    const updateMeters = () => {
      if (isPlaying) {
        animationRef.current = requestAnimationFrame(updateMeters);
      }

      // Track meters
      tracks.forEach((track) => {
        const lvl = engine.getTrackLevel(track.id);
        const fillEl = document.getElementById(`meter-fill-${track.id}`);
        
        if (fillEl) {
          // Convert dB to meter percentage (e.g. -60dB -> 0%, +6dB -> 100%)
          // Map -48dB to 0dB as main range
          const percent = Math.max(0, Math.min(100, ((lvl + 48) / 54) * 100));
          fillEl.style.height = `${percent}%`;

          // Apply color based on levels
          if (lvl > 0) {
            fillEl.style.background = 'var(--neon-red)';
            triggerClipHold(track.id);
          } else if (lvl > -2) {
            fillEl.style.background = 'var(--neon-amber)';
          } else if (lvl > -12) {
            fillEl.style.background = 'var(--neon-cyan)';
          } else {
            fillEl.style.background = 'var(--neon-green)';
          }
        }
      });

      // Master meter
      const masterLvl = engine.getMasterLevel();
      const masterFill = document.getElementById('meter-fill-master');
      if (masterFill) {
        const percent = Math.max(0, Math.min(100, ((masterLvl + 48) / 54) * 100));
        masterFill.style.height = `${percent}%`;
        
        if (masterLvl > 0) {
          masterFill.style.background = 'var(--neon-red)';
          triggerClipHold('master');
        } else if (masterLvl > -2) {
          masterFill.style.background = 'var(--neon-amber)';
        } else if (masterLvl > -12) {
          masterFill.style.background = 'var(--neon-cyan)';
        } else {
          masterFill.style.background = 'var(--neon-green)';
        }
      }
    };

    const triggerClipHold = (id: string) => {
      setClippedStates((prev) => ({ ...prev, [id]: true }));
      
      // Clear previous timeout if any
      if (clipHoldTimers.current[id]) {
        clearTimeout(clipHoldTimers.current[id]);
      }

      clipHoldTimers.current[id] = window.setTimeout(() => {
        setClippedStates((prev) => ({ ...prev, [id]: false }));
      }, 2000); // Hold alarm for 2 seconds
    };

    updateMeters();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      Object.values(clipHoldTimers.current).forEach(clearTimeout);
    };
  }, [tracks, isPlaying]);

  return (
    <div className="mixer-console-workspace">
      <div className="mixer-strips-scroll">
        
        {/* Track Mixer Strips */}
        {tracks.map((track) => (
          <div key={track.id} className="mixer-channel-strip">
            <div className="mixer-strip-name" style={{ color: track.color }}>
              {track.name}
            </div>

            {/* Panning knob row */}
            <div className="mixer-pan-row">
              <span className="mixer-lbl">PAN</span>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.1"
                value={track.pan}
                onChange={(e) => handlePanChange(track, e)}
                onMouseUp={handleTrackChangeEnd}
                onTouchEnd={handleTrackChangeEnd}
                onDoubleClick={() => handlePanDoubleClick(track)}
                className="mixer-pan-dial"
              />
              <span className="mixer-pan-val">
                {track.pan === 0 ? 'C' : track.pan > 0 ? `R${Math.round(track.pan * 10)}` : `L${Math.round(Math.abs(track.pan) * 10)}`}
              </span>
            </div>

            {/* Mute/Solo button assembly */}
            <div className="mixer-ms-row">
              <button
                className={`mixer-ms-btn mute ${track.mute ? 'active' : ''}`}
                onClick={() => handleMuteToggle(track)}
              >
                M
              </button>
              <button
                className={`mixer-ms-btn solo ${track.solo ? 'active' : ''}`}
                onClick={() => handleSoloToggle(track)}
              >
                S
              </button>
            </div>

            {/* Fader & LED Meter Column */}
            <div className="mixer-fader-meter-column">
              
              {/* LED Gain Meter */}
              <div className="mixer-led-meter-well">
                {/* Peak hold Clip Alarm */}
                <div
                  id={`meter-clip-${track.id}`}
                  className={`meter-clip-led ${clippedStates[track.id] ? 'clipped' : ''}`}
                />
                <div className="meter-scale-fill-bg">
                  <div
                    id={`meter-fill-${track.id}`}
                    className="meter-scale-fill-bar"
                  />
                </div>
              </div>

              {/* Vertical Fader */}
              <div className="mixer-vertical-slider-well">
                <input
                  type="range"
                  min="-60"
                  max="6"
                  step="0.5"
                  value={track.volumeDb}
                  onChange={(e) => handleVolumeChange(track, e)}
                  onMouseUp={handleTrackChangeEnd}
                  onTouchEnd={handleTrackChangeEnd}
                  onDoubleClick={() => handleVolumeDoubleClick(track)}
                  className="mixer-fader-slider"
                />
              </div>

            </div>

            <div className="mixer-db-label">
              {track.volumeDb <= -60 ? '-∞' : `${track.volumeDb.toFixed(0)} dB`}
            </div>
            
            <div className="mixer-track-type-badge">
              {track.type.toUpperCase()}
            </div>
          </div>
        ))}

        {/* Master Output Channel Strip */}
        <div className="mixer-channel-strip master-channel-strip">
          <div className="mixer-strip-name master-name">
            MASTER OUT
          </div>

          <div className="mixer-pan-row">
            <span className="mixer-lbl" style={{ color: 'var(--neon-cyan)' }}>STEREO</span>
            <div className="stereo-pan-spacer" />
          </div>

          <div className="mixer-ms-row">
            <div className="ms-btn-spacer" />
          </div>

          {/* Master Fader and Level Meter */}
          <div className="mixer-fader-meter-column">
            
            <div className="mixer-led-meter-well">
              <div
                id="meter-clip-master"
                className={`meter-clip-led ${clippedStates['master'] ? 'clipped' : ''}`}
              />
              <div className="meter-scale-fill-bg">
                <div
                  id="meter-fill-master"
                  className="meter-scale-fill-bar"
                />
              </div>
            </div>

            <div className="mixer-vertical-slider-well">
              {/* Master volume slider */}
              <input
                type="range"
                min="-60"
                max="6"
                step="0.5"
                defaultValue="0"
                disabled
                className="mixer-fader-slider master-fader-disabled"
              />
            </div>

          </div>

          <div className="mixer-db-label">
            0 dB
          </div>

          <div className="mixer-track-type-badge master-badge">
            OUT
          </div>
        </div>

      </div>
    </div>
  );
};
