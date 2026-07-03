import React, { useRef, useEffect } from 'react';
import { type Track } from '../audio/AudioEngine';
import { Power, Sliders, Activity } from 'lucide-react';

interface DeviceEffectRackProps {
  selectedTrack: Track | null;
  onTrackChange: (shouldPushHistory?: boolean) => void;
}

export const DeviceEffectRack: React.FC<DeviceEffectRackProps> = ({ selectedTrack, onTrackChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Default values to fall back on if no track is selected
  const hasTrack = !!selectedTrack;
  const eqBypass = selectedTrack?.eqBypass ?? false;
  const compBypass = selectedTrack?.compBypass ?? false;

  // EQ values
  const eqLow = selectedTrack?.eqLow ?? 0; // -12 to 12
  const eqLowMid = selectedTrack?.eqLowMid ?? 0;
  const eqHighMid = selectedTrack?.eqMid ?? 0;
  const eqHigh = selectedTrack?.eqHigh ?? 0;

  // Compressor values
  const compThreshold = selectedTrack?.compThresholdDb ?? -12; // -60 to 0
  const compRatio = selectedTrack?.compRatio ?? 4; // 1 to 20
  const compAttack = selectedTrack?.compAttackMs ?? 10;
  const compRelease = selectedTrack?.compReleaseMs ?? 150;

  // Draw EQ Curve on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    // Clear Canvas
    ctx.clearRect(0, 0, W, H);

    // Draw Grid Lines
    ctx.strokeStyle = '#22252a';
    ctx.lineWidth = 1;

    // Horizontal Lines (dB grid)
    const dbLines = [-15, -10, -5, 0, 5, 10, 15];
    dbLines.forEach(db => {
      const y = H / 2 - (db / 20) * (H * 0.4);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();

      // Label
      ctx.fillStyle = '#4e5460';
      ctx.font = '8px Share Tech Mono';
      ctx.fillText(`${db > 0 ? '+' : ''}${db}`, 3, y - 2);
    });

    // Vertical Lines (Freq grid: 20Hz, 100Hz, 1kHz, 10kHz)
    const freqs = [
      { f: '20', x: W * 0.1 },
      { f: '100', x: W * 0.3 },
      { f: '1k', x: W * 0.6 },
      { f: '10k', x: W * 0.9 }
    ];
    freqs.forEach(item => {
      ctx.beginPath();
      ctx.moveTo(item.x, 0);
      ctx.lineTo(item.x, H);
      ctx.stroke();

      ctx.fillStyle = '#4e5460';
      ctx.font = '8px Share Tech Mono';
      ctx.fillText(item.f, item.x + 2, H - 4);
    });

    // Zero dB center line
    ctx.strokeStyle = '#323742';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();

    // Calculate EQ Curve Points (using a spline approximation of the 4 bands)
    const points: { x: number; y: number }[] = [];
    const numPoints = 100;
    
    // Map bands to positions
    const lowX = W * 0.2;
    const lowMidX = W * 0.45;
    const highMidX = W * 0.7;
    const highX = W * 0.9;

    for (let i = 0; i <= numPoints; i++) {
      const pct = i / numPoints;
      const x = pct * W;
      let gain = 0;

      if (!eqBypass && hasTrack) {
        // Compute gain via Gaussian-like bell curves for our 4 bands
        const lowInfluence = Math.exp(-Math.pow((x - lowX) / (W * 0.2), 2)) * eqLow;
        const lowMidInfluence = Math.exp(-Math.pow((x - lowMidX) / (W * 0.15), 2)) * eqLowMid;
        const highMidInfluence = Math.exp(-Math.pow((x - highMidX) / (W * 0.15), 2)) * eqHighMid;
        const highInfluence = Math.exp(-Math.pow((x - highX) / (W * 0.2), 2)) * eqHigh;
        gain = lowInfluence + lowMidInfluence + highMidInfluence + highInfluence;
      }

      // Clamp gain response
      gain = Math.max(-20, Math.min(20, gain));
      const y = H / 2 - (gain / 20) * (H * 0.4);
      points.push({ x, y });
    }

    // Fill Curve underneath
    if (!eqBypass && hasTrack) {
      ctx.fillStyle = 'rgba(59, 177, 216, 0.08)';
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(W, H / 2);
      ctx.closePath();
      ctx.fill();
    }

    // Draw Curve Line
    ctx.strokeStyle = !eqBypass && hasTrack ? '#3bb1d8' : '#525a6c';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    // Draw active band dots
    if (!eqBypass && hasTrack) {
      const bands = [
        { x: lowX, gain: eqLow },
        { x: lowMidX, gain: eqLowMid },
        { x: highMidX, gain: eqHighMid },
        { x: highX, gain: eqHigh }
      ];

      bands.forEach(band => {
        const y = H / 2 - (band.gain / 20) * (H * 0.4);
        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(band.x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }

  }, [eqLow, eqLowMid, eqHighMid, eqHigh, eqBypass, hasTrack]);

  const handleEqGainChange = (band: 'low' | 'lowMid' | 'highMid' | 'high', val: number) => {
    if (!selectedTrack) return;
    if (band === 'low') selectedTrack.eqLow = val;
    if (band === 'lowMid') selectedTrack.eqLowMid = val;
    if (band === 'highMid') selectedTrack.eqMid = val;
    if (band === 'high') selectedTrack.eqHigh = val;
    onTrackChange(false);
  };

  const handleCompChange = (param: 'threshold' | 'ratio' | 'attack' | 'release', val: number) => {
    if (!selectedTrack) return;
    if (param === 'threshold') selectedTrack.compThresholdDb = val;
    if (param === 'ratio') selectedTrack.compRatio = val;
    if (param === 'attack') selectedTrack.compAttackMs = val;
    if (param === 'release') selectedTrack.compReleaseMs = val;
    onTrackChange(false);
  };

  const toggleEqBypass = () => {
    if (!selectedTrack) return;
    selectedTrack.eqBypass = !selectedTrack.eqBypass;
    onTrackChange(true);
  };

  const toggleCompBypass = () => {
    if (!selectedTrack) return;
    selectedTrack.compBypass = !selectedTrack.compBypass;
    onTrackChange(true);
  };

  return (
    <div className="device-effect-rack">
      <div className="rack-header">
        Device/Effect Rack
      </div>

      <div className="rack-modules-container">
        {/* EQ Eight Module */}
        <div className={`rack-module eq-eight-module ${eqBypass ? 'bypassed' : ''}`}>
          <div className="module-header">
            <button 
              className={`bypass-btn ${!eqBypass && hasTrack ? 'active' : ''}`}
              onClick={toggleEqBypass}
              disabled={!hasTrack}
              title="Toggle EQ Bypass"
            >
              <Power size={11} />
            </button>
            <span className="module-title">EQ Eight</span>
            <Sliders size={11} className="module-icon" />
          </div>

          <div className="eq-display-container">
            <canvas 
              ref={canvasRef} 
              width={240} 
              height={100} 
              className="eq-canvas"
            />
          </div>

          <div className="eq-knobs-grid">
            <div className="rack-knob-wrapper">
              <label>Low</label>
              <input 
                type="range" 
                min="-12" 
                max="12" 
                step="0.5"
                value={eqLow}
                disabled={!hasTrack || eqBypass}
                onChange={(e) => handleEqGainChange('low', parseFloat(e.target.value))}
                className="rack-fader"
              />
              <span className="knob-value">{eqLow.toFixed(1)} dB</span>
            </div>

            <div className="rack-knob-wrapper">
              <label>Low-Mid</label>
              <input 
                type="range" 
                min="-12" 
                max="12" 
                step="0.5"
                value={eqLowMid}
                disabled={!hasTrack || eqBypass}
                onChange={(e) => handleEqGainChange('lowMid', parseFloat(e.target.value))}
                className="rack-fader"
              />
              <span className="knob-value">{eqLowMid.toFixed(1)} dB</span>
            </div>

            <div className="rack-knob-wrapper">
              <label>High-Mid</label>
              <input 
                type="range" 
                min="-12" 
                max="12" 
                step="0.5"
                value={eqHighMid}
                disabled={!hasTrack || eqBypass}
                onChange={(e) => handleEqGainChange('highMid', parseFloat(e.target.value))}
                className="rack-fader"
              />
              <span className="knob-value">{eqHighMid.toFixed(1)} dB</span>
            </div>

            <div className="rack-knob-wrapper">
              <label>High</label>
              <input 
                type="range" 
                min="-12" 
                max="12" 
                step="0.5"
                value={eqHigh}
                disabled={!hasTrack || eqBypass}
                onChange={(e) => handleEqGainChange('high', parseFloat(e.target.value))}
                className="rack-fader"
              />
              <span className="knob-value">{eqHigh.toFixed(1)} dB</span>
            </div>
          </div>
        </div>

        {/* Compressor Module */}
        <div className={`rack-module compressor-module ${compBypass ? 'bypassed' : ''}`}>
          <div className="module-header">
            <button 
              className={`bypass-btn ${!compBypass && hasTrack ? 'active' : ''}`}
              onClick={toggleCompBypass}
              disabled={!hasTrack}
              title="Toggle Compressor Bypass"
            >
              <Power size={11} />
            </button>
            <span className="module-title">Compressor</span>
            <Activity size={11} className="module-icon" />
          </div>

          <div className="compressor-body">
            {/* GR & Level Meter Section */}
            <div className="comp-meters">
              {/* Threshold Fader */}
              <div className="threshold-fader-container">
                <input 
                  type="range" 
                  min="-60" 
                  max="0" 
                  step="1"
                  value={compThreshold}
                  disabled={!hasTrack || compBypass}
                  onChange={(e) => handleCompChange('threshold', parseInt(e.target.value))}
                  className="comp-threshold-slider"
                  style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
                />
                <span className="fader-label">Thresh</span>
              </div>

              {/* VU Meters */}
              <div className="vu-meter-column">
                <div className="vu-bar-wrapper">
                  <span className="vu-label">GR</span>
                  <div className="vu-track">
                    <div 
                      className="vu-bar gr-bar" 
                      style={{ 
                        height: !compBypass && hasTrack 
                          ? `${Math.max(0, Math.min(100, (compThreshold + 60) * 0.8))}%` 
                          : '0%' 
                      }}
                    />
                  </div>
                </div>

                <div className="vu-bar-wrapper">
                  <span className="vu-label">IN/OUT</span>
                  <div className="vu-track double-track">
                    <div className="vu-bar in-bar" style={{ height: hasTrack ? '65%' : '0%' }} />
                    <div className="vu-bar out-bar" style={{ height: hasTrack ? '50%' : '0%' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Compressor Parameters */}
            <div className="comp-controls-grid">
              <div className="comp-control-item">
                <span className="ctrl-label">Thresh</span>
                <span className="ctrl-value">{compThreshold} dB</span>
              </div>

              <div className="comp-control-item">
                <span className="ctrl-label">Ratio</span>
                <input 
                  type="range"
                  min="1"
                  max="20"
                  step="0.5"
                  value={compRatio}
                  disabled={!hasTrack || compBypass}
                  onChange={(e) => handleCompChange('ratio', parseFloat(e.target.value))}
                  className="comp-small-slider"
                />
                <span className="ctrl-value">{compRatio.toFixed(1)}:1</span>
              </div>

              <div className="comp-control-item">
                <span className="ctrl-label">Attack</span>
                <input 
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  value={compAttack}
                  disabled={!hasTrack || compBypass}
                  onChange={(e) => handleCompChange('attack', parseInt(e.target.value))}
                  className="comp-small-slider"
                />
                <span className="ctrl-value">{compAttack} ms</span>
              </div>

              <div className="comp-control-item">
                <span className="ctrl-label">Release</span>
                <input 
                  type="range"
                  min="10"
                  max="1000"
                  step="10"
                  value={compRelease}
                  disabled={!hasTrack || compBypass}
                  onChange={(e) => handleCompChange('release', parseInt(e.target.value))}
                  className="comp-small-slider"
                />
                <span className="ctrl-value">{compRelease} ms</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
