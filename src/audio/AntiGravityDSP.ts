/**
 * Anti-Gravity Platform Audio DSP Library
 * 
 * This library contains clean, high-performance, frame-rate optimized DSP algorithms
 * designed to run on the Web Audio API (e.g. inside an AudioWorkletProcessor or 
 * directly processing raw AudioBuffer channels).
 * 
 * All implementations are completely free of UI code, focusing purely on numerical signal processing.
 */

// ============================================================================
// 1. COMPRESSOR (컴프레서)
// ============================================================================
/**
 * Dynamic Range Compressor
 * 
 * Mathematical Model:
 * 1. Convert input signal amplitude to Decibels (dB):
 *    x_dB = 20 * log10(|x| + epsilon)
 * 
 * 2. Calculate static gain reduction (Static Curve):
 *    If x_dB > Threshold:
 *       y_dB = Threshold + (x_dB - Threshold) / Ratio
 *    Else:
 *       y_dB = x_dB
 *    Gain Change (g_dB) = y_dB - x_dB
 * 
 * 3. Smooth the gain change using linear/exponential time constants (Ballistics):
 *    Attack factor: alpha_att = exp(-1 / (attackSec * sampleRate))
 *    Release factor: alpha_rel = exp(-1 / (releaseSec * sampleRate))
 * 
 *    If targetGain_dB < smoothedGain_dB (Attack phase):
 *       smoothedGain = target + (smoothedGain - target) * alpha_att
 *    Else (Release phase):
 *       smoothedGain = target + (smoothedGain - target) * alpha_rel
 */
export class AntiGravityCompressor {
  private sampleRate: number;
  private thresholdDb: number;
  private ratio: number;
  private attackMs: number;
  private releaseMs: number;
  private smoothedGainDb: number;

  constructor(sampleRate = 44100) {
    this.sampleRate = sampleRate;
    this.thresholdDb = -12; // dB
    this.ratio = 4;        // Ratio (e.g., 4:1)
    this.attackMs = 10;     // ms
    this.releaseMs = 150;   // ms
    
    this.smoothedGainDb = 0; // State variable (smoothed attenuation)
  }

  setParams(thresholdDb: number, ratio: number, attackMs: number, releaseMs: number) {
    this.thresholdDb = thresholdDb;
    this.ratio = Math.max(1.0001, ratio);
    this.attackMs = Math.max(0.1, attackMs);
    this.releaseMs = Math.max(1.0, releaseMs);
  }

  process(channels: Float32Array[]) {
    const numChannels = channels.length;
    if (numChannels === 0) return;
    const numSamples = channels[0].length;
    
    // Calculate smoothing coefficients
    const attCoeff = Math.exp(-1.0 / ((this.attackMs / 1000.0) * this.sampleRate));
    const relCoeff = Math.exp(-1.0 / ((this.releaseMs / 1000.0) * this.sampleRate));
    const eps = 1e-6; // Epsilon to avoid log10(0)

    for (let n = 0; n < numSamples; n++) {
      // 1. Detect Peak Amplitude across all channels (Linked Compression)
      let peak = 0;
      for (let c = 0; c < numChannels; c++) {
        const absVal = Math.abs(channels[c][n]);
        if (absVal > peak) peak = absVal;
      }

      // 2. Convert to dB
      const peakDb = 20 * Math.log10(peak + eps);

      // 3. Static Gain Curve
      let targetGainDb = 0;
      if (peakDb > this.thresholdDb) {
        // Amount of compression in dB
        targetGainDb = (this.thresholdDb - peakDb) * (1.0 - 1.0 / this.ratio);
      }

      // 4. Smooth Gain Reduction (Envelope Ballistics)
      const coeff = targetGainDb < this.smoothedGainDb ? attCoeff : relCoeff;
      this.smoothedGainDb = targetGainDb + (this.smoothedGainDb - targetGainDb) * coeff;

      // 5. Convert gain reduction back to linear amplitude coefficient
      const compressionGain = Math.pow(10, this.smoothedGainDb / 20.0);

      // 6. Apply gain reduction to all channels
      for (let c = 0; c < numChannels; c++) {
        channels[c][n] *= compressionGain;
      }
    }
  }
}

// ============================================================================
// 2. 4-BAND PARAMETRIC EQ (4밴드 이퀄라이저)
// ============================================================================
/**
 * 4-Band Parametric Equalizer
 * 
 * Composed of four Biquad filters in series:
 * 1. Low Shelf
 * 2. Peak 1 (Low-Mid)
 * 3. Peak 2 (High-Mid)
 * 4. High Shelf
 * 
 * Mathematical Difference Equation (Direct Form I):
 * y[n] = (b0/a0)*x[n] + (b1/a0)*x[n-1] + (b2/a0)*x[n-2] 
 *        - (a1/a0)*y[n-1] - (a2/a0)*y[n-2]
 */
class BiquadFilter {
  public b0 = 1; public b1 = 0; public b2 = 0;
  public a0 = 1; public a1 = 0; public a2 = 0;
  
  // State variables per channel: [x1, x2, y1, y2]
  public states: Float32Array[] = []; 

  reset() {
    this.states = [];
  }

  private ensureStateChannels(numChannels: number) {
    while (this.states.length < numChannels) {
      this.states.push(new Float32Array(4)); // [x1, x2, y1, y2] initialized to 0
    }
  }

  process(channels: Float32Array[]) {
    const numChannels = channels.length;
    this.ensureStateChannels(numChannels);
    const numSamples = channels[0].length;

    // Local cached coefficients for speed
    const { b0, b1, b2, a0, a1, a2 } = this;
    const invA0 = 1.0 / a0;
    const b0_n = b0 * invA0;
    const b1_n = b1 * invA0;
    const b2_n = b2 * invA0;
    const a1_n = a1 * invA0;
    const a2_n = a2 * invA0;

    for (let c = 0; c < numChannels; c++) {
      const channel = channels[c];
      const state = this.states[c];
      let x1 = state[0];
      let x2 = state[1];
      let y1 = state[2];
      let y2 = state[3];

      for (let n = 0; n < numSamples; n++) {
        const x = channel[n];
        const y = b0_n * x + b1_n * x1 + b2_n * x2 - a1_n * y1 - a2_n * y2;
        
        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;

        channel[n] = y;
      }
      
      state[0] = x1;
      state[1] = x2;
      state[2] = y1;
      state[3] = y2;
    }
  }

  // Robert Bristow-Johnson (RBJ) Cookbook coefficient formulas
  calcLowShelf(f0: number, gainDb: number, Q: number, fs: number) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = (2 * Math.PI * f0) / fs;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = (sinw0 / 2) * Math.sqrt((A + 1/A) * (1/Q - 1) + 2);
    const sqrtA2Alpha = 2 * Math.sqrt(A) * alpha;

    this.b0 = A * ((A + 1) - (A - 1) * cosw0 + sqrtA2Alpha);
    this.b1 = 2 * A * ((A - 1) - (A + 1) * cosw0);
    this.b2 = A * ((A + 1) - (A - 1) * cosw0 - sqrtA2Alpha);
    this.a0 = (A + 1) + (A - 1) * cosw0 + sqrtA2Alpha;
    this.a1 = -2 * ((A - 1) + (A + 1) * cosw0);
    this.a2 = (A + 1) + (A - 1) * cosw0 - sqrtA2Alpha;
  }

  calcPeaking(f0: number, gainDb: number, Q: number, fs: number) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = (2 * Math.PI * f0) / fs;
    const cosw0 = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Q);

    this.b0 = 1 + alpha * A;
    this.b1 = -2 * cosw0;
    this.b2 = 1 - alpha * A;
    this.a0 = 1 + alpha / A;
    this.a1 = -2 * cosw0;
    this.a2 = 1 - alpha / A;
  }

  calcHighShelf(f0: number, gainDb: number, Q: number, fs: number) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = (2 * Math.PI * f0) / fs;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = (sinw0 / 2) * Math.sqrt((A + 1/A) * (1/Q - 1) + 2);
    const sqrtA2Alpha = 2 * Math.sqrt(A) * alpha;

    this.b0 = A * ((A + 1) + (A - 1) * cosw0 + sqrtA2Alpha);
    this.b1 = -2 * A * ((A - 1) + (A + 1) * cosw0);
    this.b2 = A * ((A + 1) + (A - 1) * cosw0 - sqrtA2Alpha);
    this.a0 = (A + 1) - (A - 1) * cosw0 + sqrtA2Alpha;
    this.a1 = 2 * ((A - 1) - (A + 1) * cosw0);
    this.a2 = (A + 1) - (A - 1) * cosw0 - sqrtA2Alpha;
  }
}

export class AntiGravityEQ4Band {
  private sampleRate: number;
  private filters: BiquadFilter[];

  constructor(sampleRate = 44100) {
    this.sampleRate = sampleRate;
    this.filters = [
      new BiquadFilter(), // 1. Low Shelf
      new BiquadFilter(), // 2. Low-Mid Peak
      new BiquadFilter(), // 3. High-Mid Peak
      new BiquadFilter()  // 4. High Shelf
    ];
    
    // Default initial parameters: [Freq, Gain(dB), Q]
    this.setParams(
      [80, 0, 0.707],   // Low Shelf
      [400, 0, 1.0],    // Low-Mid Peak
      [2000, 0, 1.0],   // High-Mid Peak
      [8000, 0, 0.707]  // High Shelf
    );
  }

  setParams(band1: number[], band2: number[], band3: number[], band4: number[]) {
    // band = [freq, gain, Q]
    this.filters[0].calcLowShelf(band1[0], band1[1], band1[2], this.sampleRate);
    this.filters[1].calcPeaking(band2[0], band2[1], band2[2], this.sampleRate);
    this.filters[2].calcPeaking(band3[0], band3[1], band3[2], this.sampleRate);
    this.filters[3].calcHighShelf(band4[0], band4[1], band4[2], this.sampleRate);
  }

  process(channels: Float32Array[]) {
    // Process signal sequentially through the 4 filters in series
    for (let i = 0; i < 4; i++) {
      this.filters[i].process(channels);
    }
  }
}

// ============================================================================
// 3. STEREO DELAY (스테레오 딜레이)
// ============================================================================
/**
 * Stereo Delay with Independent Feedback Loop and Linear Interpolation
 * 
 * Mathematical Formulation:
 * 1. Buffer Size Calculation:
 *    N_max = maxDelaySeconds * sampleRate
 * 
 * 2. Delay Sample Count (Floating Point for fractional delays):
 *    D = (delayTimeMs / 1000) * sampleRate
 * 
 * 3. Fractional delay extraction using Linear Interpolation:
 *    idx_floor = floor(writeIndex - D) mod N_max
 *    idx_ceil  = ceil(writeIndex - D) mod N_max
 *    fraction  = D - floor(D)
 * 
 *    delayedSample = (1 - fraction) * buffer[idx_floor] + fraction * buffer[idx_ceil]
 * 
 * 4. Write back input with feedback factor:
 *    buffer[writeIndex] = inputSample + delayedSample * feedback
 * 
 * 5. Dry / Wet mix calculation:
 *    outputSample = (1 - mix) * inputSample + mix * delayedSample
 */
export class AntiGravityStereoDelay {
  private sampleRate: number;
  private maxDelaySamples: number;
  private buffers: Float32Array[];
  private writeIndices: number[];
  
  private delayTimeMs: number[];
  private feedback: number;
  private dryWet: number;

  constructor(sampleRate = 44100, maxDelayMs = 2000) {
    this.sampleRate = sampleRate;
    this.maxDelaySamples = Math.ceil((maxDelayMs / 1000.0) * sampleRate);
    
    // Circular ring buffers for Left and Right channels
    this.buffers = [
      new Float32Array(this.maxDelaySamples),
      new Float32Array(this.maxDelaySamples)
    ];
    this.writeIndices = [0, 0];
    
    // Default Parameters
    this.delayTimeMs = [375, 500]; // Independent Left / Right delay time
    this.feedback = 0.45;          // 0.0 to 1.0 (45%)
    this.dryWet = 0.35;            // 0.0 to 1.0 (35%)
  }

  setParams(delayTimeMsL: number, delayTimeMsR: number, feedbackPct: number, dryWetPct: number) {
    this.delayTimeMs[0] = Math.max(1.0, delayTimeMsL);
    this.delayTimeMs[1] = Math.max(1.0, delayTimeMsR);
    this.feedback = Math.max(0.0, Math.min(0.999, feedbackPct / 100.0));
    this.dryWet = Math.max(0.0, Math.min(1.0, dryWetPct / 100.0));
  }

  process(channels: Float32Array[]) {
    const numChannels = channels.length;
    if (numChannels === 0) return;
    const numSamples = channels[0].length;

    for (let c = 0; c < numChannels; c++) {
      // Map channels greater than 2 to alternate buffers if multitrack
      const bufIdx = c % 2; 
      const buffer = this.buffers[bufIdx];
      const channel = channels[c];
      let wIdx = this.writeIndices[bufIdx];
      
      const delayTimeSamples = (this.delayTimeMs[bufIdx] / 1000.0) * this.sampleRate;

      for (let n = 0; n < numSamples; n++) {
        const inputSample = channel[n];
        
        // 1. Calculate read position index (with fractional sub-sample delay offset)
        const rPos = wIdx - delayTimeSamples;
        const rPosClamped = rPos < 0 ? rPos + this.maxDelaySamples : rPos;
        
        const idxFloor = Math.floor(rPosClamped) % this.maxDelaySamples;
        const idxCeil = Math.ceil(rPosClamped) % this.maxDelaySamples;
        const frac = rPosClamped - Math.floor(rPosClamped);

        // 2. Extract delayed sample using linear interpolation
        const delayedSample = (1.0 - frac) * buffer[idxFloor] + frac * buffer[idxCeil];

        // 3. Write back current input and attenuated feedback loop sample
        buffer[wIdx] = inputSample + delayedSample * this.feedback;

        // 4. Mix dry signal and wet delay output
        channel[n] = (1.0 - this.dryWet) * inputSample + this.dryWet * delayedSample;

        // 5. Advance circular write pointer index
        wIdx = (wIdx + 1) % this.maxDelaySamples;
      }
      this.writeIndices[bufIdx] = wIdx;
    }
  }
}

// ============================================================================
// 4. ALGORITHMIC REVERB (알고리즘 리버브)
// ============================================================================
/**
 * Schroeder Algorithmic Reverb
 * 
 * Architectural Design:
 *   Input -> 4 Parallel Feedback Comb Filters (FBCF) -> 2 Series All-Pass Filters (APF) -> Output
 * 
 * 1. Feedback Comb Filter (IIR FBCF with High-Frequency Damp):
 *    y[n] = x[n - D] + g * ((1 - damp) * y[n - D] + damp * y_last[n - D])
 * 
 * 2. All-Pass Filter (APF):
 *    y[n] = -g * x[n] + x[n - D] + g * y[n - D]
 */
class FeedbackCombFilter {
  private buffer: Float32Array;
  private writeIdx = 0;
  private lastOut = 0; // State variable for Damp low-pass filter

  constructor(delaySamples: number) {
    this.buffer = new Float32Array(delaySamples);
  }

  process(x: number, feedback: number, damp: number): number {
    const rIdx = (this.writeIdx + 1) % this.buffer.length;
    const delayed = this.buffer[this.writeIdx];
    
    // Low-pass filter (dampening) in feedback path
    const filtered = (1 - damp) * delayed + damp * this.lastOut;
    this.lastOut = filtered;

    this.buffer[this.writeIdx] = x + filtered * feedback;
    this.writeIdx = rIdx;

    return delayed;
  }
}

class AllPassFilter {
  private buffer: Float32Array;
  private writeIdx = 0;

  constructor(delaySamples: number) {
    this.buffer = new Float32Array(delaySamples);
  }

  process(x: number, feedback: number): number {
    const rIdx = (this.writeIdx + 1) % this.buffer.length;
    const delayed = this.buffer[this.writeIdx];

    const out = -feedback * x + delayed;
    this.buffer[this.writeIdx] = x + feedback * out;
    this.writeIdx = rIdx;

    return out;
  }
}

export class AntiGravityReverb {
  private combFiltersL: FeedbackCombFilter[];
  private combFiltersR: FeedbackCombFilter[];
  private allpassFiltersL: AllPassFilter[];
  private allpassFiltersR: AllPassFilter[];

  private roomSize: number;
  private decayTime: number;
  private damp: number;
  private dryWet: number;

  constructor() {
    // Classic Schroeder Comb filter prime delay lines (prime numbers to avoid overlapping harmonics)
    const combDelays = [1116, 1188, 1277, 1356]; 
    const allpassDelays = [556, 441];

    this.combFiltersL = combDelays.map(d => new FeedbackCombFilter(d));
    this.combFiltersR = combDelays.map(d => new FeedbackCombFilter(d + 37)); // offset right channels for stereo width
    
    this.allpassFiltersL = allpassDelays.map(d => new AllPassFilter(d));
    this.allpassFiltersR = allpassDelays.map(d => new AllPassFilter(d + 19));

    // Default Parameters
    this.roomSize = 0.75; // feedback level
    this.decayTime = 0.5; // multiplier for room size
    this.damp = 0.25;     // HF absorption factor
    this.dryWet = 0.3;
  }

  setParams(roomSize: number, decayTime: number, damp: number, dryWet = 0.3) {
    // Clamp parameters
    this.roomSize = Math.max(0.1, Math.min(0.98, roomSize));
    this.decayTime = Math.max(0.1, Math.min(1.0, decayTime));
    this.damp = Math.max(0.0, Math.min(0.8, damp));
    this.dryWet = Math.max(0.0, Math.min(1.0, dryWet));
  }

  process(channels: Float32Array[]) {
    const numChannels = channels.length;
    if (numChannels === 0) return;
    const numSamples = channels[0].length;

    // Left and Right channels references
    const leftCh = channels[0];
    const rightCh = numChannels > 1 ? channels[1] : channels[0];

    const feedback = this.roomSize * this.decayTime;

    for (let n = 0; n < numSamples; n++) {
      const inL = leftCh[n];
      const inR = rightCh[n];

      // 1. Process 4 Parallel Comb Filters
      let outCombL = 0;
      let outCombR = 0;
      for (let i = 0; i < 4; i++) {
        outCombL += this.combFiltersL[i].process(inL, feedback, this.damp);
        outCombR += this.combFiltersR[i].process(inR, feedback, this.damp);
      }
      outCombL *= 0.25; // Scale to prevent clipping
      outCombR *= 0.25;

      // 2. Process 2 Series Allpass Filters
      let wetL = outCombL;
      let wetR = outCombR;
      for (let i = 0; i < 2; i++) {
        wetL = this.allpassFiltersL[i].process(wetL, 0.5);
        wetR = this.allpassFiltersR[i].process(wetR, 0.5);
      }

      // 3. Mix original Dry input signal with Wet reverberated signal
      leftCh[n] = (1 - this.dryWet) * inL + this.dryWet * wetL;
      if (numChannels > 1) {
        rightCh[n] = (1 - this.dryWet) * inR + this.dryWet * wetR;
      }
    }
  }
}

// ============================================================================
// 5. SATURATOR (새츄레이터)
// ============================================================================
/**
 * Analog Tube / Tape Saturation
 * 
 * Mathematical Formulation:
 * 1. Apply Input Drive:
 *    x_drive = x * 10^(Drive / 20)
 * 
 * 2. Nonlinear Waveshaping function (Hyperbolic Tangent):
 *    y_tanh = tanh(x_drive)
 * 
 * 3. Soft Knee Polynomial blending (Knee parameter):
 *    We interpolate between the aggressive tanh curve and a smooth cubic soft-clipper.
 *    Linear soft-clip window based on knee factor `k`:
 *       If |x_drive| < k:
 *          y = x_drive - (x_drive^3) / (3 * k^2)
 *       Else:
 *          y = sign(x_drive) * (k * (2/3)) (clamped boundary saturation limit)
 * 
 * 4. Apply Output Gain:
 *    output = y * 10^(OutGain / 20)
 */
export class AntiGravitySaturator {
  private driveDb: number;      // Drive in dB
  private knee: number;       // Knee soft factor (0.0 to 1.0)
  private outputGainDb: number; // Output Gain in dB

  constructor() {
    this.driveDb = 6;      // Drive in dB
    this.knee = 0.5;       // Knee soft factor (0.0 to 1.0)
    this.outputGainDb = 0; // Output Gain in dB
  }

  setParams(driveDb: number, knee: number, outputGainDb: number) {
    this.driveDb = driveDb;
    this.knee = Math.max(0.001, Math.min(1.0, knee));
    this.outputGainDb = outputGainDb;
  }

  process(channels: Float32Array[]) {
    const numChannels = channels.length;
    if (numChannels === 0) return;
    const numSamples = channels[0].length;
    
    const driveGain = Math.pow(10, this.driveDb / 20.0);
    const outGain = Math.pow(10, this.outputGainDb / 20.0);
    const k = this.knee;
    const invThreeK2 = 1.0 / (3.0 * k * k);

    for (let c = 0; c < numChannels; c++) {
      const channel = channels[c];
      for (let n = 0; n < numSamples; n++) {
        // 1. Amplification of input signal (Drive)
        const xDrive = channel[n] * driveGain;
        const absX = Math.abs(xDrive);
        let y = 0;

        // 2. Nonlinear Saturation Waveshaping (Cubic Knee Blend / tanh blend)
        if (absX < k) {
          // Polynomial soft-clipping knee zone
          y = xDrive - (xDrive * xDrive * xDrive) * invThreeK2;
        } else {
          // Hard tanh compression zone for warm tape saturation harmonics
          const sign = xDrive < 0 ? -1 : 1;
          const tanhPart = Math.tanh(xDrive);
          const clipPart = sign * (k * (2.0 / 3.0));
          // Mix polynomial clip with tanh for warm analog tube emulation
          y = 0.5 * tanhPart + 0.5 * clipPart;
        }

        // 3. Compensation Output Gain
        channel[n] = y * outGain;
      }
    }
  }
}
