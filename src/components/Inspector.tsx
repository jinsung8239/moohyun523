import React, { useEffect, useState } from 'react';
import type { Track } from '../audio/AudioEngine';
import { AudioEngine } from '../audio/AudioEngine';
import { Power, GripVertical, ChevronDown, Sliders } from 'lucide-react';

interface InspectorProps {
  track: Track | null;
  onTrackChange: (shouldPushHistory?: boolean) => void;
}

export const Inspector: React.FC<InspectorProps> = ({ track, onTrackChange }) => {
  const engine = AudioEngine.getInstance();
  const [dbVal, setDbVal] = useState<number>(0.0);
  const [effects, setEffects] = useState<string[]>(['EQ', 'Compressor', 'Space Delay', 'Autotune', 'Saturator', 'Pedal']);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [activeEffect, setActiveEffect] = useState<string | null>('EQ');

  // Local states for sliders to guarantee lag-free 60fps movement
  const [eqLowVal, setEqLowVal] = useState<number>(0.0);
  const [eqLowMidVal, setEqLowMidVal] = useState<number>(0.0);
  const [eqMidVal, setEqMidVal] = useState<number>(0.0);
  const [eqHighVal, setEqHighVal] = useState<number>(0.0);
  
  const [eqLowFreqVal, setEqLowFreqVal] = useState<number>(80);
  const [eqLowQVal, setEqLowQVal] = useState<number>(0.707);
  const [eqLowMidFreqVal, setEqLowMidFreqVal] = useState<number>(400);
  const [eqLowMidQVal, setEqLowMidQVal] = useState<number>(1.0);
  const [eqHighMidFreqVal, setEqHighMidFreqVal] = useState<number>(2000);
  const [eqHighMidQVal, setEqHighMidQVal] = useState<number>(1.0);
  const [eqHighFreqVal, setEqHighFreqVal] = useState<number>(8000);
  const [eqHighQVal, setEqHighQVal] = useState<number>(0.707);

  const [compThresholdVal, setCompThresholdVal] = useState<number>(-12);
  const [compRatioVal, setCompRatioVal] = useState<number>(4);
  const [compAttackVal, setCompAttackVal] = useState<number>(10);
  const [compReleaseVal, setCompReleaseVal] = useState<number>(150);

  const [delaySendVal, setDelaySendVal] = useState<number>(0.0);
  const [delayTimeMsLVal, setDelayTimeMsLVal] = useState<number>(375);
  const [delayTimeMsRVal, setDelayTimeMsRVal] = useState<number>(500);
  const [delayFeedbackVal, setDelayFeedbackVal] = useState<number>(45);

  const [reverbSendVal, setReverbSendVal] = useState<number>(0.0);
  const [reverbRoomSizeVal, setReverbRoomSizeVal] = useState<number>(0.75);
  const [reverbDecayVal, setReverbDecayVal] = useState<number>(0.5);
  const [reverbDampVal, setReverbDampVal] = useState<number>(0.25);

  const [satDriveVal, setSatDriveVal] = useState<number>(6);
  const [satKneeVal, setSatKneeVal] = useState<number>(0.5);
  const [satOutputGainVal, setSatOutputGainVal] = useState<number>(0);

  const [autotuneSpeedVal, setAutotuneSpeedVal] = useState<number>(0.12);
  const [autotuneAmountVal, setAutotuneAmountVal] = useState<number>(0.70);

  const [pedalReleaseVal, setPedalReleaseVal] = useState<number>(3.8);
  const [pedalDampingVal, setPedalDampingVal] = useState<number>(0.96);
  const [pedalResonanceVal, setPedalResonanceVal] = useState<number>(0.5);

  // Sync state variables on track change
  useEffect(() => {
    if (track) {
      setDbVal(track.volumeDb);
      setEqLowVal(track.eqLow);
      setEqLowMidVal(track.eqLowMid ?? 0.0);
      setEqMidVal(track.eqMid);
      setEqHighVal(track.eqHigh);
      
      setEqLowFreqVal(track.eqLowFreq ?? 80);
      setEqLowQVal(track.eqLowQ ?? 0.707);
      setEqLowMidFreqVal(track.eqLowMidFreq ?? 400);
      setEqLowMidQVal(track.eqLowMidQ ?? 1.0);
      setEqHighMidFreqVal(track.eqHighMidFreq ?? 2000);
      setEqHighMidQVal(track.eqHighMidQ ?? 1.0);
      setEqHighFreqVal(track.eqHighFreq ?? 8000);
      setEqHighQVal(track.eqHighQ ?? 0.707);

      setCompThresholdVal(track.compThresholdDb ?? -12);
      setCompRatioVal(track.compRatio ?? 4);
      setCompAttackVal(track.compAttackMs ?? 10);
      setCompReleaseVal(track.compReleaseMs ?? 150);

      setDelaySendVal(track.sendDelay);
      setDelayTimeMsLVal(track.delayTimeMsL ?? 375);
      setDelayTimeMsRVal(track.delayTimeMsR ?? 500);
      setDelayFeedbackVal(track.delayFeedback ?? 45);

      setReverbSendVal(track.sendReverb);
      setReverbRoomSizeVal(track.reverbRoomSize ?? 0.75);
      setReverbDecayVal(track.reverbDecay ?? 0.5);
      setReverbDampVal(track.reverbDamp ?? 0.25);

      setSatDriveVal(track.satDriveDb ?? 6);
      setSatKneeVal(track.satKnee ?? 0.5);
      setSatOutputGainVal(track.satOutputGainDb ?? 0);

      setAutotuneSpeedVal(track.autotuneSpeed === undefined ? 0.12 : track.autotuneSpeed);
      setAutotuneAmountVal(track.autotuneAmount === undefined ? 0.0 : track.autotuneAmount);
      setPedalReleaseVal(track.pedalRelease === undefined ? 3.8 : track.pedalRelease);
      setPedalDampingVal(track.pedalDamping === undefined ? 0.96 : track.pedalDamping);
      setPedalResonanceVal(track.pedalResonance === undefined ? 0.5 : track.pedalResonance);
    }
  }, [track]);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!track) return;
    const val = Number(e.target.value);
    setDbVal(val);
    track.volumeDb = val;
    engine.updateTrackNodeLevels(track);
    onTrackChange(false); // live updates, no history push
  };

  const handleVolumeChangeEnd = () => {
    onTrackChange(true); // push to history on drag finish
  };

  const handleVolumeDoubleClick = () => {
    if (!track) return;
    setDbVal(0.0);
    track.volumeDb = 0.0;
    engine.updateTrackNodeLevels(track);
    onTrackChange(true); // discrete event, push immediately
  };

  const toggleBypass = (effect: string) => {
    if (!track) return;
    if (effect === 'EQ') {
      track.eqBypass = !track.eqBypass;
    } else if (effect === 'Compressor') {
      track.compBypass = !track.compBypass;
      track.compressor = !track.compBypass;
    } else if (effect === 'Space Delay') {
      track.delayBypass = !track.delayBypass;
      track.reverbBypass = !track.reverbBypass;
    } else if (effect === 'Autotune') {
      track.autotuneBypass = track.autotuneBypass === undefined ? false : !track.autotuneBypass;
    } else if (effect === 'Saturator') {
      track.satBypass = track.satBypass === undefined ? false : !track.satBypass;
    } else if (effect === 'Pedal') {
      track.pedalBypass = track.pedalBypass === undefined ? false : !track.pedalBypass;
    }

    engine.updateTrackNodeLevels(track);
    onTrackChange(true); // discrete event, push immediately
  };

  const getBypassState = (effect: string) => {
    if (!track) return true;
    if (effect === 'EQ') return track.eqBypass;
    if (effect === 'Compressor') return track.compBypass;
    if (effect === 'Space Delay') return track.delayBypass;
    if (effect === 'Autotune') return track.autotuneBypass === undefined ? true : track.autotuneBypass;
    if (effect === 'Saturator') return track.satBypass === undefined ? true : track.satBypass;
    if (effect === 'Pedal') return track.pedalBypass === undefined ? true : track.pedalBypass;
    return true;
  };

  // Drag and Drop reordering handlers
  const handleDragStart = (idx: number) => {
    setDraggedIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx) return;

    const list = [...effects];
    const item = list[draggedIdx];
    list.splice(draggedIdx, 1);
    list.splice(idx, 0, item);
    
    setDraggedIdx(idx);
    setEffects(list);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
  };

  if (!track) {
    return (
      <div className="inspector-panel empty-inspector">
        <Sliders size={24} className="inspector-placeholder-icon" />
        <p>No track selected</p>
      </div>
    );
  }

  return (
    <div className="inspector-panel">
      <div className="inspector-title">TRACK INSPECTOR</div>
      
      {/* Track Metadata Card */}
      <div className="inspector-section metadata-section">
        <div className="meta-label">Selected Track</div>
        <div className="meta-track-name" style={{ color: track.color }}>
          {track.name}
        </div>
        
        <div className="meta-input-picker">
          <span className="picker-lbl">Input:</span>
          <div className="picker-dropdown-wrapper">
            <span className="picker-val">Audio Input 1</span>
            <ChevronDown size={12} className="picker-arrow" />
          </div>
        </div>
      </div>

      {/* Plugin Insert Rack */}
      <div className="inspector-section effect-rack-section">
        <div className="meta-label">EFFECT INSERT RACK</div>
        <div className="inserts-rack">
          {effects.map((effect, idx) => {
            const isBypassed = getBypassState(effect);
            const isDragging = draggedIdx === idx;
            
            return (
              <div
                key={effect}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                className={`effect-block-item ${isBypassed ? 'bypassed' : ''} ${isDragging ? 'dragging' : ''} ${activeEffect === effect ? 'selected' : ''}`}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest('.power-toggle-btn') || target.closest('.drag-handle-grip')) {
                    return;
                  }
                  setActiveEffect(effect);
                }}
              >
                <div className="drag-handle-grip">
                  <GripVertical size={12} />
                </div>
                
                <button
                  className={`power-toggle-btn ${isBypassed ? 'off' : 'on'}`}
                  onClick={() => toggleBypass(effect)}
                  title={`Toggle ${effect} power`}
                >
                  <Power size={11} />
                </button>
                
                <span className="effect-name-txt">{effect}</span>
              </div>
            );
          })}
          
          <div className="add-effect-slot-btn">
            + Add Effect
          </div>
        </div>

        {/* Selected Effect Parameters */}
        {activeEffect && (
          <div className="effect-params-panel">
            <div className="effect-params-header">
              <span className="effect-params-title">{activeEffect.toUpperCase()} PARAMETERS</span>
              {getBypassState(activeEffect) ? (
                <button 
                  className="bypass-warning-badge bypassed-btn" 
                  onClick={() => toggleBypass(activeEffect)}
                  title="Click to turn effect ON"
                  style={{ cursor: 'pointer', background: '#EF4444', color: '#fff', border: 'none', borderRadius: '3px', padding: '2px 6px', fontSize: '9px', fontWeight: 'bold' }}
                >
                  BYPASSED (CLICK TO ACTIVATE)
                </button>
              ) : (
                <button 
                  className="bypass-warning-badge active-btn" 
                  onClick={() => toggleBypass(activeEffect)}
                  title="Click to bypass/turn off"
                  style={{ cursor: 'pointer', background: '#10B981', color: '#fff', border: 'none', borderRadius: '3px', padding: '2px 6px', fontSize: '9px', fontWeight: 'bold' }}
                >
                  ACTIVE
                </button>
              )}
            </div>
            
            {activeEffect === 'EQ' && (
              <div className="params-sliders-grid" style={{ maxHeight: '350px', overflowY: 'auto', paddingRight: '6px' }}>
                {/* BAND 1: LOW SHELF */}
                <div className="eq-band-section" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px', marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#3BB1D8', marginBottom: '8px' }}>BAND 1: LOW SHELF</div>
                  <div className="param-slider-row">
                    <div className="param-slider-meta">
                      <span className="param-lbl">Low Shelf Gain</span>
                      <span className="param-val-bubble">{eqLowVal >= 0 ? `+${eqLowVal.toFixed(1)}` : eqLowVal.toFixed(1)} dB</span>
                    </div>
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="0.5"
                      value={eqLowVal}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setEqLowVal(val);
                        track.eqLow = val;
                        engine.updateTrackNodeLevels(track);
                        onTrackChange(false);
                      }}
                      onMouseUp={handleVolumeChangeEnd}
                      className="param-slider-input"
                    />
                  </div>
                  <div className="param-slider-row">
                    <div className="param-slider-meta">
                      <span className="param-lbl">Low Shelf Freq</span>
                      <span className="param-val-bubble">{eqLowFreqVal} Hz</span>
                    </div>
                    <input
                      type="range"
                      min="30"
                      max="300"
                      step="5"
                      value={eqLowFreqVal}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setEqLowFreqVal(val);
                        track.eqLowFreq = val;
                        engine.updateTrackNodeLevels(track);
                        onTrackChange(false);
                      }}
                      onMouseUp={handleVolumeChangeEnd}
                      className="param-slider-input"
                    />
                  </div>
                  <div className="param-slider-row">
                    <div className="param-slider-meta">
                      <span className="param-lbl">Low Shelf Q</span>
                      <span className="param-val-bubble">{eqLowQVal.toFixed(3)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="2.0"
                      step="0.05"
                      value={eqLowQVal}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setEqLowQVal(val);
                        track.eqLowQ = val;
                        engine.updateTrackNodeLevels(track);
                        onTrackChange(false);
                      }}
                      onMouseUp={handleVolumeChangeEnd}
                      className="param-slider-input"
                    />
                  </div>
                </div>

                {/* BAND 2: LOW-MID PEAK */}
                <div className="eq-band-section" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px', marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#4D9945', marginBottom: '8px' }}>BAND 2: LOW-MID PEAK</div>
                  <div className="param-slider-row">
                    <div className="param-slider-meta">
                      <span className="param-lbl">Low-Mid Gain</span>
                      <span className="param-val-bubble">{eqLowMidVal >= 0 ? `+${eqLowMidVal.toFixed(1)}` : eqLowMidVal.toFixed(1)} dB</span>
                    </div>
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="0.5"
                      value={eqLowMidVal}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setEqLowMidVal(val);
                        track.eqLowMid = val;
                        engine.updateTrackNodeLevels(track);
                        onTrackChange(false);
                      }}
                      onMouseUp={handleVolumeChangeEnd}
                      className="param-slider-input"
                    />
                  </div>
                  <div className="param-slider-row">
                    <div className="param-slider-meta">
                      <span className="param-lbl">Low-Mid Freq</span>
                      <span className="param-val-bubble">{eqLowMidFreqVal} Hz</span>
                    </div>
                    <input
                      type="range"
                      min="150"
                      max="1000"
                      step="10"
                      value={eqLowMidFreqVal}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setEqLowMidFreqVal(val);
                        track.eqLowMidFreq = val;
                        engine.updateTrackNodeLevels(track);
                        onTrackChange(false);
                      }}
                      onMouseUp={handleVolumeChangeEnd}
                      className="param-slider-input"
                    />
                  </div>
                  <div className="param-slider-row">
                    <div className="param-slider-meta">
                      <span className="param-lbl">Low-Mid Q</span>
                      <span className="param-val-bubble">{eqLowMidQVal.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="5.0"
                      step="0.05"
                      value={eqLowMidQVal}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setEqLowMidQVal(val);
                        track.eqLowMidQ = val;
                        engine.updateTrackNodeLevels(track);
                        onTrackChange(false);
                      }}
                      onMouseUp={handleVolumeChangeEnd}
                      className="param-slider-input"
                    />
                  </div>
                </div>

                {/* BAND 3: HIGH-MID PEAK */}
                <div className="eq-band-section" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px', marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#ff9100', marginBottom: '8px' }}>BAND 3: HIGH-MID PEAK</div>
                  <div className="param-slider-row">
                    <div className="param-slider-meta">
                      <span className="param-lbl">High-Mid Gain</span>
                      <span className="param-val-bubble">{eqMidVal >= 0 ? `+${eqMidVal.toFixed(1)}` : eqMidVal.toFixed(1)} dB</span>
                    </div>
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="0.5"
                      value={eqMidVal}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setEqMidVal(val);
                        track.eqMid = val;
                        engine.updateTrackNodeLevels(track);
                        onTrackChange(false);
                      }}
                      onMouseUp={handleVolumeChangeEnd}
                      className="param-slider-input"
                    />
                  </div>
                  <div className="param-slider-row">
                    <div className="param-slider-meta">
                      <span className="param-lbl">High-Mid Freq</span>
                      <span className="param-val-bubble">{eqHighMidFreqVal} Hz</span>
                    </div>
                    <input
                      type="range"
                      min="500"
                      max="5000"
                      step="50"
                      value={eqHighMidFreqVal}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setEqHighMidFreqVal(val);
                        track.eqHighMidFreq = val;
                        engine.updateTrackNodeLevels(track);
                        onTrackChange(false);
                      }}
                      onMouseUp={handleVolumeChangeEnd}
                      className="param-slider-input"
                    />
                  </div>
                  <div className="param-slider-row">
                    <div className="param-slider-meta">
                      <span className="param-lbl">High-Mid Q</span>
                      <span className="param-val-bubble">{eqHighMidQVal.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="5.0"
                      step="0.05"
                      value={eqHighMidQVal}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setEqHighMidQVal(val);
                        track.eqHighMidQ = val;
                        engine.updateTrackNodeLevels(track);
                        onTrackChange(false);
                      }}
                      onMouseUp={handleVolumeChangeEnd}
                      className="param-slider-input"
                    />
                  </div>
                </div>

                {/* BAND 4: HIGH SHELF */}
                <div className="eq-band-section" style={{ paddingBottom: '5px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#9c27b0', marginBottom: '8px' }}>BAND 4: HIGH SHELF</div>
                  <div className="param-slider-row">
                    <div className="param-slider-meta">
                      <span className="param-lbl">High Shelf Gain</span>
                      <span className="param-val-bubble">{eqHighVal >= 0 ? `+${eqHighVal.toFixed(1)}` : eqHighVal.toFixed(1)} dB</span>
                    </div>
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="0.5"
                      value={eqHighVal}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setEqHighVal(val);
                        track.eqHigh = val;
                        engine.updateTrackNodeLevels(track);
                        onTrackChange(false);
                      }}
                      onMouseUp={handleVolumeChangeEnd}
                      className="param-slider-input"
                    />
                  </div>
                  <div className="param-slider-row">
                    <div className="param-slider-meta">
                      <span className="param-lbl">High Shelf Freq</span>
                      <span className="param-val-bubble">{eqHighFreqVal} Hz</span>
                    </div>
                    <input
                      type="range"
                      min="2000"
                      max="16000"
                      step="100"
                      value={eqHighFreqVal}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setEqHighFreqVal(val);
                        track.eqHighFreq = val;
                        engine.updateTrackNodeLevels(track);
                        onTrackChange(false);
                      }}
                      onMouseUp={handleVolumeChangeEnd}
                      className="param-slider-input"
                    />
                  </div>
                  <div className="param-slider-row">
                    <div className="param-slider-meta">
                      <span className="param-lbl">High Shelf Q</span>
                      <span className="param-val-bubble">{eqHighQVal.toFixed(3)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="2.0"
                      step="0.05"
                      value={eqHighQVal}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setEqHighQVal(val);
                        track.eqHighQ = val;
                        engine.updateTrackNodeLevels(track);
                        onTrackChange(false);
                      }}
                      onMouseUp={handleVolumeChangeEnd}
                      className="param-slider-input"
                    />
                  </div>
                </div>
              </div>
            )}
            
            {activeEffect === 'Compressor' && (
              <div className="params-sliders-grid">
                <div className="param-slider-row">
                  <div className="param-slider-meta">
                    <span className="param-lbl">Threshold</span>
                    <span className="param-val-bubble">{compThresholdVal.toFixed(1)} dB</span>
                  </div>
                  <input
                    type="range"
                    min="-40"
                    max="0"
                    step="0.5"
                    value={compThresholdVal}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setCompThresholdVal(val);
                      track.compThresholdDb = val;
                      engine.updateTrackNodeLevels(track);
                      onTrackChange(false);
                    }}
                    onMouseUp={handleVolumeChangeEnd}
                    className="param-slider-input"
                  />
                </div>
                <div className="param-slider-row">
                  <div className="param-slider-meta">
                    <span className="param-lbl">Ratio</span>
                    <span className="param-val-bubble">{compRatioVal.toFixed(1)} : 1</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    step="0.5"
                    value={compRatioVal}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setCompRatioVal(val);
                      track.compRatio = val;
                      engine.updateTrackNodeLevels(track);
                      onTrackChange(false);
                    }}
                    onMouseUp={handleVolumeChangeEnd}
                    className="param-slider-input"
                  />
                </div>
                <div className="param-slider-row">
                  <div className="param-slider-meta">
                    <span className="param-lbl">Attack Time</span>
                    <span className="param-val-bubble">{compAttackVal} ms</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    step="1"
                    value={compAttackVal}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setCompAttackVal(val);
                      track.compAttackMs = val;
                      engine.updateTrackNodeLevels(track);
                      onTrackChange(false);
                    }}
                    onMouseUp={handleVolumeChangeEnd}
                    className="param-slider-input"
                  />
                </div>
                <div className="param-slider-row">
                  <div className="param-slider-meta">
                    <span className="param-lbl">Release Time</span>
                    <span className="param-val-bubble">{compReleaseVal} ms</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="1000"
                    step="10"
                    value={compReleaseVal}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setCompReleaseVal(val);
                      track.compReleaseMs = val;
                      engine.updateTrackNodeLevels(track);
                      onTrackChange(false);
                    }}
                    onMouseUp={handleVolumeChangeEnd}
                    className="param-slider-input"
                  />
                </div>
                <div className="param-slider-row">
                  <div className="param-slider-meta">
                    <span className="param-lbl">Sidechain Ducking</span>
                  </div>
                  <button
                    className={`sidechain-toggle-btn ${track.sidechain ? 'active' : ''}`}
                    onClick={() => {
                      track.sidechain = !track.sidechain;
                      engine.updateTrackNodeLevels(track);
                      onTrackChange(true);
                    }}
                  >
                    {track.sidechain ? 'ENABLED (Ducks on Kick)' : 'DISABLED'}
                  </button>
                </div>
              </div>
            )}
            
            {activeEffect === 'Space Delay' && (
              <div className="params-sliders-grid" style={{ maxHeight: '350px', overflowY: 'auto', paddingRight: '6px' }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#3BB1D8', marginBottom: '8px' }}>DELAY MODULE</div>
                <div className="param-slider-row">
                  <div className="param-slider-meta">
                    <span className="param-lbl">Delay Send Mix</span>
                    <span className="param-val-bubble">{Math.round(delaySendVal * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={delaySendVal}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setDelaySendVal(val);
                      track.sendDelay = val;
                      engine.updateTrackNodeLevels(track);
                      onTrackChange(false);
                    }}
                    onMouseUp={handleVolumeChangeEnd}
                    className="param-slider-input"
                  />
                </div>
                <div className="param-slider-row">
                  <div className="param-slider-meta">
                    <span className="param-lbl">Delay Time L</span>
                    <span className="param-val-bubble">{delayTimeMsLVal} ms</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="1000"
                    step="5"
                    value={delayTimeMsLVal}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setDelayTimeMsLVal(val);
                      track.delayTimeMsL = val;
                      engine.updateTrackNodeLevels(track);
                      onTrackChange(false);
                    }}
                    onMouseUp={handleVolumeChangeEnd}
                    className="param-slider-input"
                  />
                </div>
                <div className="param-slider-row">
                  <div className="param-slider-meta">
                    <span className="param-lbl">Delay Time R</span>
                    <span className="param-val-bubble">{delayTimeMsRVal} ms</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="1000"
                    step="5"
                    value={delayTimeMsRVal}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setDelayTimeMsRVal(val);
                      track.delayTimeMsR = val;
                      engine.updateTrackNodeLevels(track);
                      onTrackChange(false);
                    }}
                    onMouseUp={handleVolumeChangeEnd}
                    className="param-slider-input"
                  />
                </div>
                <div className="param-slider-row">
                  <div className="param-slider-meta">
                    <span className="param-lbl">Delay Feedback</span>
                    <span className="param-val-bubble">{delayFeedbackVal}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="95"
                    step="1"
                    value={delayFeedbackVal}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setDelayFeedbackVal(val);
                      track.delayFeedback = val;
                      engine.updateTrackNodeLevels(track);
                      onTrackChange(false);
                    }}
                    onMouseUp={handleVolumeChangeEnd}
                    className="param-slider-input"
                  />
                </div>

                <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#ffea00', marginTop: '15px', marginBottom: '8px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px' }}>REVERB MODULE</div>
                <div className="param-slider-row">
                  <div className="param-slider-meta">
                    <span className="param-lbl">Reverb Send Mix</span>
                    <span className="param-val-bubble">{Math.round(reverbSendVal * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={reverbSendVal}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setReverbSendVal(val);
                      track.sendReverb = val;
                      engine.updateTrackNodeLevels(track);
                      onTrackChange(false);
                    }}
                    onMouseUp={handleVolumeChangeEnd}
                    className="param-slider-input"
                  />
                </div>
                <div className="param-slider-row">
                  <div className="param-slider-meta">
                    <span className="param-lbl">Reverb Room Size</span>
                    <span className="param-val-bubble">{Math.round(reverbRoomSizeVal * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="0.98"
                    step="0.02"
                    value={reverbRoomSizeVal}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setReverbRoomSizeVal(val);
                      track.reverbRoomSize = val;
                      engine.updateTrackNodeLevels(track);
                      onTrackChange(false);
                    }}
                    onMouseUp={handleVolumeChangeEnd}
                    className="param-slider-input"
                  />
                </div>
                <div className="param-slider-row">
                  <div className="param-slider-meta">
                    <span className="param-lbl">Reverb Decay Time</span>
                    <span className="param-val-bubble">{reverbDecayVal.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={reverbDecayVal}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setReverbDecayVal(val);
                      track.reverbDecay = val;
                      engine.updateTrackNodeLevels(track);
                      onTrackChange(false);
                    }}
                    onMouseUp={handleVolumeChangeEnd}
                    className="param-slider-input"
                  />
                </div>
                <div className="param-slider-row">
                  <div className="param-slider-meta">
                    <span className="param-lbl">Reverb Dampening</span>
                    <span className="param-val-bubble">{Math.round(reverbDampVal * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="0.8"
                    step="0.05"
                    value={reverbDampVal}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setReverbDampVal(val);
                      track.reverbDamp = val;
                      engine.updateTrackNodeLevels(track);
                      onTrackChange(false);
                    }}
                    onMouseUp={handleVolumeChangeEnd}
                    className="param-slider-input"
                  />
                </div>
              </div>
            )}

            {activeEffect === 'Autotune' && (
              <div className="params-sliders-grid">
                <div className="param-slider-row">
                  <div className="param-slider-meta">
                    <span className="param-lbl">Correction Speed (Glide)</span>
                    <span className="param-val-bubble">{Math.round(autotuneSpeedVal * 1000)} ms</span>
                  </div>
                  <input
                    type="range"
                    min="0.01"
                    max="0.5"
                    step="0.01"
                    value={autotuneSpeedVal}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setAutotuneSpeedVal(val);
                      track.autotuneSpeed = val;
                      engine.updateTrackNodeLevels(track);
                      onTrackChange(false);
                    }}
                    onMouseUp={handleVolumeChangeEnd}
                    className="param-slider-input"
                  />
                </div>
                <div className="param-slider-row">
                  <div className="param-slider-meta">
                    <span className="param-lbl">Correction Pitch Amount</span>
                    <span className="param-val-bubble">{Math.round(autotuneAmountVal * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={autotuneAmountVal}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setAutotuneAmountVal(val);
                      track.autotuneAmount = val;
                      engine.updateTrackNodeLevels(track);
                      onTrackChange(false);
                    }}
                    onMouseUp={handleVolumeChangeEnd}
                    className="param-slider-input"
                  />
                </div>
              </div>
            )}

            {activeEffect === 'Saturator' && (
              <div className="params-sliders-grid">
                <div className="param-slider-row">
                  <div className="param-slider-meta">
                    <span className="param-lbl">Input Drive</span>
                    <span className="param-val-bubble">{satDriveVal >= 0 ? `+${satDriveVal.toFixed(1)}` : satDriveVal.toFixed(1)} dB</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="24"
                    step="0.5"
                    value={satDriveVal}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setSatDriveVal(val);
                      track.satDriveDb = val;
                      engine.updateTrackNodeLevels(track);
                      onTrackChange(false);
                    }}
                    onMouseUp={handleVolumeChangeEnd}
                    className="param-slider-input"
                  />
                </div>
                <div className="param-slider-row">
                  <div className="param-slider-meta">
                    <span className="param-lbl">Soft Knee width</span>
                    <span className="param-val-bubble">{satKneeVal.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="1.0"
                    step="0.05"
                    value={satKneeVal}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setSatKneeVal(val);
                      track.satKnee = val;
                      engine.updateTrackNodeLevels(track);
                      onTrackChange(false);
                    }}
                    onMouseUp={handleVolumeChangeEnd}
                    className="param-slider-input"
                  />
                </div>
                <div className="param-slider-row">
                  <div className="param-slider-meta">
                    <span className="param-lbl">Output Gain</span>
                    <span className="param-val-bubble">{satOutputGainVal >= 0 ? `+${satOutputGainVal.toFixed(1)}` : satOutputGainVal.toFixed(1)} dB</span>
                  </div>
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="0.5"
                    value={satOutputGainVal}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setSatOutputGainVal(val);
                      track.satOutputGainDb = val;
                      engine.updateTrackNodeLevels(track);
                      onTrackChange(false);
                    }}
                    onMouseUp={handleVolumeChangeEnd}
                    className="param-slider-input"
                  />
                </div>
              </div>
            )}
            {activeEffect === 'Pedal' && (
              <div className="params-sliders-grid">
                <div className="param-slider-row">
                  <div className="param-slider-meta">
                    <span className="param-lbl">Sustain Release Time</span>
                    <span className="param-val-bubble">{pedalReleaseVal.toFixed(1)} s</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="10.0"
                    step="0.1"
                    value={pedalReleaseVal}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setPedalReleaseVal(val);
                      track.pedalRelease = val;
                      onTrackChange(false);
                    }}
                    onMouseUp={handleVolumeChangeEnd}
                    className="param-slider-input"
                  />
                </div>
                <div className="param-slider-row">
                  <div className="param-slider-meta">
                    <span className="param-lbl">High Damping Coefficient</span>
                    <span className="param-val-bubble">{pedalDampingVal.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.80"
                    max="1.00"
                    step="0.01"
                    value={pedalDampingVal}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setPedalDampingVal(val);
                      track.pedalDamping = val;
                      onTrackChange(false);
                    }}
                    onMouseUp={handleVolumeChangeEnd}
                    className="param-slider-input"
                  />
                </div>
                <div className="param-slider-row">
                  <div className="param-slider-meta">
                    <span className="param-lbl">Sympathetic Resonance</span>
                    <span className="param-val-bubble">{Math.round(pedalResonanceVal * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="1.0"
                    step="0.05"
                    value={pedalResonanceVal}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setPedalResonanceVal(val);
                      track.pedalResonance = val;
                      onTrackChange(false);
                    }}
                    onMouseUp={handleVolumeChangeEnd}
                    className="param-slider-input"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Volume Channel Strip & Level Indicator */}
      <div className="inspector-section fader-strip-section">
        <div className="meta-label">VOLUME CHANNEL STRIP</div>
        <div className="channel-fader-assembly">
          <div className="db-ticks-labels">
            <span>+6dB</span>
            <span>0dB</span>
            <span>-6dB</span>
            <span>-12dB</span>
            <span>-24dB</span>
            <span>-48dB</span>
            <span>-∞</span>
          </div>

          <div className="vertical-slider-well">
            <input
              type="range"
              min="-60"
              max="6"
              step="0.5"
              value={dbVal}
              onChange={handleVolumeChange}
              onMouseUp={handleVolumeChangeEnd}
              onTouchEnd={handleVolumeChangeEnd}
              onDoubleClick={handleVolumeDoubleClick}
              className="vertical-db-slider"
            />
            {/* Value display overlay */}
            <div className="db-value-bubble">
              {dbVal <= -60 ? '-∞ dB' : `${dbVal.toFixed(1)} dB`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
