import {
  AntiGravityCompressor,
  AntiGravityEQ4Band,
  AntiGravityStereoDelay,
  AntiGravityReverb,
  AntiGravitySaturator
} from './AntiGravityDSP';

// Logic Pro Web Audio Engine with dB Gains and Real-time Peak Analysis
export interface Track {
  id: string;
  name: string;
  type: 'synth' | 'drum' | 'audio';
  color: string;
  volumeDb: number; // dB volume: -60.0 to +6.0 (or -144 for mute)
  pan: number; // -1.0 to 1.0
  mute: boolean;
  solo: boolean;
  sendDelay: number; // 0.0 to 1.0
  sendReverb: number; // 0.0 to 1.0
  
  // EQ (-12dB to +12dB)
  eqLow: number;
  eqLowMid: number;
  eqMid: number;
  eqHigh: number;
  
  // Dynamics
  compressor: boolean;
  sidechain: boolean;
  
  // Plugin Power states (EQ, Compressor, Delay/Reverb bypass toggles)
  eqBypass: boolean;
  compBypass: boolean;
  delayBypass: boolean;
  reverbBypass: boolean;
  autotuneBypass: boolean;
  autotuneSpeed: number; // Glide duration for synths / modulation speed for vocals (0.01 to 0.5s)
  autotuneAmount: number; // Correction mix depth (0.0 to 1.0)
  
  // Compressor details
  compThresholdDb: number;
  compRatio: number;
  compAttackMs: number;
  compReleaseMs: number;

  // 4-band EQ details
  eqLowFreq: number;
  eqLowQ: number;
  eqLowMidFreq: number;
  eqLowMidQ: number;
  eqHighMidFreq: number;
  eqHighMidQ: number;
  eqHighFreq: number;
  eqHighQ: number;

  // Stereo Delay details
  delayTimeMsL: number;
  delayTimeMsR: number;
  delayFeedback: number;

  // Reverb details
  reverbRoomSize: number;
  reverbDecay: number;
  reverbDamp: number;

  // Saturator details
  satBypass: boolean;
  satDriveDb: number;
  satKnee: number;
  satOutputGainDb: number;
  
  // Pedal details
  pedalBypass: boolean;
  pedalRelease: number;
  pedalDamping: number;
  pedalResonance: number;

  // Group & Folders (Track Stacks)
  groupId?: string;
  isFolder?: boolean;
  collapsed?: boolean;

  // Velocity map: step -> pitch -> velocity (1-127)
  noteVelocities?: { [step: number]: { [pitch: string]: number } };

  // Preset
  preset: 'lead' | 'bass' | 'pluck' | 'pad' | 'piano' | 'sustain_piano';
  
  steps: { [step: number]: (string | { pitch: string; duration: number })[] }; // Synth: step (0-31) -> array of note strings or objects
  drumSteps: { [inst: string]: boolean[] }; // Drum: inst -> 32 steps
  
  // Audio Track Buffer
  audioBuffer?: AudioBuffer;
  audioFileName?: string;
  audioStartStep?: number; // Step at which audio plays (0-31)

  automation?: {
    volume: { [step: number]: number }; // step (0-31) -> volume value (-60 to 6)
    pan: { [step: number]: number };    // step (0-31) -> pan value (-1 to 1)
    enabled: boolean;
    activeParam: 'volume' | 'pan';
  };
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const SCALE_DEFINITIONS: { [scaleName: string]: number[] } = {
  'Major': [0, 2, 4, 5, 7, 9, 11],
  'Natural Minor': [0, 2, 3, 5, 7, 8, 10],
  'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11],
  'Pentatonic': [0, 2, 4, 7, 9],
  'Dorian': [0, 2, 3, 5, 7, 9, 10],
  'Blues': [0, 3, 5, 6, 7, 10]
};

export function isNoteInScale(pitch: string, rootNote: string, scaleName: string): boolean {
  if (!scaleName || scaleName === 'Off' || !SCALE_DEFINITIONS[scaleName]) return true;
  const cleanPitch = pitch.replace(/[0-9\-]/g, '');
  const noteIdx = NOTE_NAMES.indexOf(cleanPitch);
  const rootIdx = NOTE_NAMES.indexOf(rootNote);
  if (noteIdx === -1 || rootIdx === -1) return true;
  const semitonesFromRoot = (noteIdx - rootIdx + 12) % 12;
  return SCALE_DEFINITIONS[scaleName].includes(semitonesFromRoot);
}
const NOTE_FREQS: { [note: string]: number } = {};
for (let octave = 0; octave <= 8; octave++) {
  const baseMidi = (octave + 1) * 12;
  NOTE_NAMES.forEach((name, semitone) => {
    const midi = baseMidi + semitone;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    NOTE_FREQS[`${name}${octave}`] = Math.round(freq * 100) / 100;
  });
}

export class AudioEngine {
  private static instance: AudioEngine;
  
  public ctx: AudioContext | null = null;
  public isPlaying = false;
  public bpm = 120;
  
  // Master effects
  public masterGain: GainNode | null = null;
  public masterLimiter: DynamicsCompressorNode | null = null;
  public delayNode: DelayNode | null = null;
  public delayGain: GainNode | null = null;
  public reverbGain: GainNode | null = null;
  public analyser: AnalyserNode | null = null;
  
  private noiseBuffer: AudioBuffer | null = null;
  
  // Timing / Loop
  public currentStep = 0;
  private nextStepTime = 0.0;
  private stepDuration = 0.0; // seconds per 16th note
  private schedulerTimerId: number | null = null;
  public loopStart = 0;
  public loopEnd = 16; // default to 1 bar (16 steps) initially for Logic Pro feel
  public totalSteps = 32; // project sequence length in steps
  public loopEnabled = true; // cycle play mode toggle
  
  // Active voice nodes for cleanup
  private activeVoices: { trackId?: string; note?: string; source: AudioScheduledSourceNode; gain: GainNode }[] = [];
  
  // Piano Samples Caching
  private pianoBuffers: { [midi: number]: AudioBuffer } = {};
  private isPianoLoading = false;
  
  // Track last played frequency for Autotune glide
  private lastTrackFreq: { [trackId: string]: number } = {};
  
  // Tracks state
  public tracks: Track[] = [];
  
  // Track node associations
  private trackNodes: {
    [trackId: string]: {
      gain: GainNode;
      panner: StereoPannerNode;
      eqLow: BiquadFilterNode;
      eqLowMid: BiquadFilterNode;
      eqMid: BiquadFilterNode;
      eqHigh: BiquadFilterNode;
      comp: DynamicsCompressorNode;
      saturator: WaveShaperNode;
      delaySend: GainNode;
      reverbSend: GainNode;
      analyser: AnalyserNode; // Dedicated RMS analysis node
      autotuneDry?: GainNode;
      autotuneWet?: GainNode;
      autotuneLfo?: OscillatorNode;
    };
  } = {};
  
  // Callbacks
  private onStepCallback: ((step: number) => void) | null = null;
  private onStateChangeCallback: (() => void) | null = null;
  
  private constructor() {
    this.resetToEmptyState();
  }
  
  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }
  
  public resetToEmptyState() {
    this.tracks = [];
    this.activeVoices = [];
    this.currentStep = 0;
    this.loopStart = 0;
    this.loopEnd = 16;
    this.loopEnabled = true;
    this.bpm = 120;
    this.stepDuration = 60.0 / 120.0 / 4.0;
    this.trackNodes = {};
    this.lastTrackFreq = {};
  }
  
  public init() {
    if (this.ctx) return;
    
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // Master Gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
    
    // Master Limiter (DynamicsCompressorNode configured to act as a Brickwall Limiter)
    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.setValueAtTime(-1.0, this.ctx.currentTime); // threshold in dB
    this.masterLimiter.knee.setValueAtTime(0, this.ctx.currentTime);
    this.masterLimiter.ratio.setValueAtTime(20.0, this.ctx.currentTime); // maximum ratio
    this.masterLimiter.attack.setValueAtTime(0.001, this.ctx.currentTime); // ultra fast
    this.masterLimiter.release.setValueAtTime(0.1, this.ctx.currentTime);
    
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 64; // Fast calculations for level meters
    
    // Reverb Send
    this.reverbGain = this.ctx.createGain();
    const reverbSim = this.ctx.createDelay(1.0);
    reverbSim.delayTime.setValueAtTime(0.15, this.ctx.currentTime);
    const reverbSimFeedback = this.ctx.createGain();
    reverbSimFeedback.gain.setValueAtTime(0.5, this.ctx.currentTime);
    
    reverbSim.connect(reverbSimFeedback);
    reverbSimFeedback.connect(reverbSim);
    this.reverbGain.connect(reverbSim);
    reverbSim.connect(this.masterGain);
    
    // Delay Send
    this.delayNode = this.ctx.createDelay(2.0);
    this.delayNode.delayTime.setValueAtTime(0.375, this.ctx.currentTime);
    this.delayGain = this.ctx.createGain();
    this.delayGain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    
    this.delayNode.connect(this.delayGain);
    this.delayGain.connect(this.delayNode);
    
    const delayOutputGain = this.ctx.createGain();
    delayOutputGain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    this.delayNode.connect(delayOutputGain);
    delayOutputGain.connect(this.masterGain);
    
    // Routing Chain: MasterGain -> Limiter -> Analyser -> Destination
    this.masterGain.connect(this.masterLimiter);
    this.masterLimiter.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    
    // Initialize step duration
    this.stepDuration = 60.0 / this.bpm / 4.0;
    
    // Build Noise Buffer for drums
    const bufferSize = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    // Wire up existing tracks
    this.tracks.forEach(track => this.setupTrackNodes(track));
    
    // Preload grand piano audio samples
    this.preloadPianoSamples().catch(e => console.error("Error preloading piano samples:", e));
  }
  
  public async preloadPianoSamples() {
    if (this.isPianoLoading || Object.keys(this.pianoBuffers).length > 0) return;
    this.isPianoLoading = true;
    
    const notesToLoad = [
      { midi: 21, file: 'A0v11.mp3' },
      { midi: 33, file: 'A1v11.mp3' },
      { midi: 45, file: 'A2v11.mp3' },
      { midi: 57, file: 'A3v11.mp3' },
      { midi: 69, file: 'A4v11.mp3' },
      { midi: 81, file: 'A5v11.mp3' },
      { midi: 93, file: 'A6v11.mp3' },
      { midi: 105, file: 'A7v11.mp3' },
      { midi: 24, file: 'C1v11.mp3' },
      { midi: 36, file: 'C2v11.mp3' },
      { midi: 48, file: 'C3v11.mp3' },
      { midi: 60, file: 'C4v11.mp3' },
      { midi: 72, file: 'C5v11.mp3' },
      { midi: 84, file: 'C6v11.mp3' },
      { midi: 96, file: 'C7v11.mp3' },
      { midi: 108, file: 'C8v11.mp3' },
      { midi: 27, file: 'D%231v11.mp3' },
      { midi: 39, file: 'D%232v11.mp3' },
      { midi: 51, file: 'D%233v11.mp3' },
      { midi: 63, file: 'D%234v11.mp3' },
      { midi: 75, file: 'D%235v11.mp3' },
      { midi: 87, file: 'D%236v11.mp3' },
      { midi: 99, file: 'D%237v11.mp3' },
      { midi: 30, file: 'F%231v11.mp3' },
      { midi: 42, file: 'F%232v11.mp3' },
      { midi: 54, file: 'F%233v11.mp3' },
      { midi: 66, file: 'F%234v11.mp3' },
      { midi: 78, file: 'F%235v11.mp3' },
      { midi: 90, file: 'F%236v11.mp3' },
      { midi: 102, file: 'F%237v11.mp3' }
    ];
    
    const baseUrl = 'https://unpkg.com/@audio-samples/piano-mp3-velocity11@1.0.5/audio/';
    
    await Promise.all(
      notesToLoad.map(async (note) => {
        try {
          const response = await fetch(`${baseUrl}${note.file}`);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          if (this.ctx) {
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            this.pianoBuffers[note.midi] = audioBuffer;
          }
        } catch (e) {
          console.warn(`Failed to preload piano sample ${note.file}:`, e);
        }
      })
    );
    this.isPianoLoading = false;
  }
  
  private setupTrackNodes(track: Track) {
    if (!this.ctx || !this.masterGain) return;
    
    const gain = this.ctx.createGain();
    const panner = this.ctx.createStereoPanner();
    const delaySend = this.ctx.createGain();
    const reverbSend = this.ctx.createGain();
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 64; // Fast time-domain capture
    
    // EQ Filters in Series
    const eqLow = this.ctx.createBiquadFilter();
    eqLow.type = 'lowshelf';
    eqLow.frequency.setValueAtTime(200, this.ctx.currentTime);
    
    const eqLowMid = this.ctx.createBiquadFilter();
    eqLowMid.type = 'peaking';
    eqLowMid.frequency.setValueAtTime(400, this.ctx.currentTime);
    eqLowMid.Q.setValueAtTime(1.0, this.ctx.currentTime);
    
    const eqMid = this.ctx.createBiquadFilter();
    eqMid.type = 'peaking';
    eqMid.frequency.setValueAtTime(2000, this.ctx.currentTime);
    eqMid.Q.setValueAtTime(1.0, this.ctx.currentTime);
    
    const eqHigh = this.ctx.createBiquadFilter();
    eqHigh.type = 'highshelf';
    eqHigh.frequency.setValueAtTime(8000, this.ctx.currentTime);
    
    // Track Compressor
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-12, this.ctx.currentTime);
    comp.knee.setValueAtTime(12, this.ctx.currentTime);
    comp.ratio.setValueAtTime(4.0, this.ctx.currentTime);
    comp.attack.setValueAtTime(0.01, this.ctx.currentTime);
    comp.release.setValueAtTime(0.15, this.ctx.currentTime);

    // Track Saturator
    const saturator = this.ctx.createWaveShaper();
    saturator.oversample = '4x';
    
    // Autotune / Pitch Modulator
    const autotuneDry = this.ctx.createGain();
    const autotuneWet = this.ctx.createGain();
    const autotuneDelay = this.ctx.createDelay(0.1);
    const autotuneLfo = this.ctx.createOscillator();
    const autotuneLfoGain = this.ctx.createGain();
    
    autotuneDelay.delayTime.setValueAtTime(0.012, this.ctx.currentTime);
    autotuneLfo.frequency.setValueAtTime(5.5, this.ctx.currentTime);
    autotuneLfoGain.gain.setValueAtTime(0.0018, this.ctx.currentTime);
    
    autotuneLfo.connect(autotuneLfoGain);
    autotuneLfoGain.connect(autotuneDelay.delayTime);
    autotuneLfo.start();
    
    // Connecting nodes in series: Voice -> EQ Low -> EQ Low-Mid -> EQ High-Mid -> EQ High -> Comp -> Saturator -> Autotune -> Analyser -> VolumeGain -> Panner -> MasterGain
    eqLow.connect(eqLowMid);
    eqLowMid.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(comp);
    comp.connect(saturator);
    
    saturator.connect(autotuneDry);
    saturator.connect(autotuneDelay);
    autotuneDelay.connect(autotuneWet);
    
    autotuneDry.connect(analyser);
    autotuneWet.connect(analyser);
    
    analyser.connect(gain);
    gain.connect(panner);
    panner.connect(this.masterGain);
    
    if (this.delayNode) {
      saturator.connect(delaySend);
      delaySend.connect(this.delayNode);
    }
    
    if (this.reverbGain) {
      saturator.connect(reverbSend);
      reverbSend.connect(this.reverbGain);
    }
    
    this.trackNodes[track.id] = {
      gain,
      panner,
      eqLow,
      eqLowMid,
      eqMid,
      eqHigh,
      comp,
      saturator,
      delaySend,
      reverbSend,
      analyser,
      autotuneDry,
      autotuneWet,
      autotuneLfo
    };
    
    this.updateTrackNodeLevels(track);
  }
  
  // Logarithmic conversion: Gain = 10^(dB/20)
  public dbToGain(db: number): number {
    if (db <= -60) return 0;
    return Math.pow(10, db / 20);
  }
  
  public updateTrackNodeLevels(track: Track) {
    const nodes = this.trackNodes[track.id];
    if (!nodes || !this.ctx) return;
    
    let db = track.volumeDb;
    let gainVal = this.dbToGain(db);
    
    if (track.mute) {
      gainVal = 0;
    } else {
      const anySolo = this.tracks.some(t => t.solo);
      if (anySolo && !track.solo) {
        gainVal = 0;
      }
    }
    
    nodes.gain.gain.setTargetAtTime(gainVal, this.ctx.currentTime, 0.01);
    nodes.panner.pan.setTargetAtTime(track.pan, this.ctx.currentTime, 0.01);
    
    // Delay/Reverb Sends (Power/Bypass check)
    const delayVal = track.delayBypass ? 0 : track.sendDelay;
    const reverbVal = track.reverbBypass ? 0 : track.sendReverb;
    if (delayVal === 0) {
      nodes.delaySend.gain.setValueAtTime(0, this.ctx.currentTime);
    } else {
      nodes.delaySend.gain.setTargetAtTime(delayVal, this.ctx.currentTime, 0.01);
    }
    if (reverbVal === 0) {
      nodes.reverbSend.gain.setValueAtTime(0, this.ctx.currentTime);
    } else {
      nodes.reverbSend.gain.setTargetAtTime(reverbVal, this.ctx.currentTime, 0.01);
    }
    
    // EQ Levels (Power/Bypass check)
    const lowGain = track.eqBypass ? 0.0 : track.eqLow;
    const lowMidGain = track.eqBypass ? 0.0 : (track.eqLowMid ?? 0.0);
    const midGain = track.eqBypass ? 0.0 : track.eqMid;
    const highGain = track.eqBypass ? 0.0 : track.eqHigh;

    nodes.eqLow.frequency.setValueAtTime(track.eqLowFreq ?? 80, this.ctx.currentTime);
    nodes.eqLow.gain.setTargetAtTime(lowGain, this.ctx.currentTime, 0.01);

    nodes.eqLowMid.frequency.setValueAtTime(track.eqLowMidFreq ?? 400, this.ctx.currentTime);
    nodes.eqLowMid.Q.setValueAtTime(track.eqLowMidQ ?? 1.0, this.ctx.currentTime);
    nodes.eqLowMid.gain.setTargetAtTime(lowMidGain, this.ctx.currentTime, 0.01);

    nodes.eqMid.frequency.setValueAtTime(track.eqHighMidFreq ?? 2000, this.ctx.currentTime);
    nodes.eqMid.Q.setValueAtTime(track.eqHighMidQ ?? 1.0, this.ctx.currentTime);
    nodes.eqMid.gain.setTargetAtTime(midGain, this.ctx.currentTime, 0.01);

    nodes.eqHigh.frequency.setValueAtTime(track.eqHighFreq ?? 8000, this.ctx.currentTime);
    nodes.eqHigh.gain.setTargetAtTime(highGain, this.ctx.currentTime, 0.01);
    
    // Compressor Bypass & Detail values
    if (track.compBypass || !track.compressor) {
      nodes.comp.threshold.setTargetAtTime(0, this.ctx.currentTime, 0.01); // bypass
      nodes.comp.ratio.setTargetAtTime(1.0, this.ctx.currentTime, 0.01);
    } else {
      nodes.comp.threshold.setTargetAtTime(track.compThresholdDb ?? -12, this.ctx.currentTime, 0.01);
      nodes.comp.ratio.setTargetAtTime(track.compRatio ?? 4, this.ctx.currentTime, 0.01);
      nodes.comp.attack.setTargetAtTime((track.compAttackMs ?? 10) / 1000, this.ctx.currentTime, 0.01);
      nodes.comp.release.setTargetAtTime((track.compReleaseMs ?? 150) / 1000, this.ctx.currentTime, 0.01);
    }

    // Saturator details & waveshaper curve mapping
    const satBypassed = track.satBypass === undefined ? true : track.satBypass;
    if (satBypassed) {
      nodes.saturator.curve = null;
    } else {
      const driveDb = track.satDriveDb ?? 6;
      const knee = Math.max(0.001, Math.min(1.0, track.satKnee ?? 0.5));
      const outGainDb = track.satOutputGainDb ?? 0;
      
      const driveGain = Math.pow(10, driveDb / 20.0);
      const outGain = Math.pow(10, outGainDb / 20.0);
      const k = knee;
      const invThreeK2 = 1.0 / (3.0 * k * k);
      
      const n_samples = 4096; // 4096 points is highly accurate and performs fast
      const curve = new Float32Array(n_samples);
      for (let i = 0; i < n_samples; i++) {
        const x = (i / (n_samples - 1)) * 2 - 1; // range [-1, 1]
        const xDrive = x * driveGain;
        const absX = Math.abs(xDrive);
        let y = 0;
        if (absX < k) {
          y = xDrive - (xDrive * xDrive * xDrive) * invThreeK2;
        } else {
          const sign = xDrive < 0 ? -1 : 1;
          const tanhPart = Math.tanh(xDrive);
          const clipPart = sign * (k * (2.0 / 3.0));
          y = 0.5 * tanhPart + 0.5 * clipPart;
        }
        curve[i] = y * outGain;
      }
      nodes.saturator.curve = curve;
    }
    
    // Autotune / Chorus Levels
    const isBypassed = track.autotuneBypass === undefined ? true : track.autotuneBypass;
    const amount = track.autotuneAmount === undefined ? 0.0 : track.autotuneAmount;
    
    const dryGain = isBypassed ? 1.0 : (1.0 - amount * 0.3);
    const wetGain = isBypassed ? 0.0 : (amount * 0.85);
    
    if (nodes.autotuneDry && nodes.autotuneWet) {
      nodes.autotuneDry.gain.setTargetAtTime(dryGain, this.ctx.currentTime, 0.01);
      nodes.autotuneWet.gain.setTargetAtTime(wetGain, this.ctx.currentTime, 0.01);
    }
  }
  
  public updateBpm(newBpm: number) {
    this.bpm = newBpm;
    if (this.ctx) {
      this.stepDuration = 60.0 / this.bpm / 4.0;
      if (this.delayNode) {
        const delayTime = (60.0 / this.bpm) * 0.75;
        this.delayNode.delayTime.setTargetAtTime(delayTime, this.ctx.currentTime, 0.1);
      }
    }
  }
  
  public setStep(step: number) {
    this.currentStep = step;
    if (this.ctx) {
      this.nextStepTime = this.ctx.currentTime;
      if (this.isPlaying) {
        this.tracks.forEach(track => {
          if (track.type === 'audio') {
            this.playAudioTrackBuffer(track, this.ctx!.currentTime, step);
          }
        });
      }
    }
  }

  public start(onStep: (step: number) => void, onStateChange: () => void) {
    if (this.isPlaying) return;
    this.init();
    if (!this.ctx) return;
    
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    
    this.isPlaying = true;
    this.onStepCallback = onStep;
    this.onStateChangeCallback = onStateChange;
    this.stepDuration = 60.0 / this.bpm / 4.0;
    // Add a 60ms safe lookahead buffer so that step 0 notes are scheduled and played exactly on time
    this.nextStepTime = this.ctx.currentTime + 0.06;
    
    this.tracks.forEach(track => {
      if (track.type === 'audio') {
        this.playAudioTrackBuffer(track, this.nextStepTime, this.currentStep);
      }
    });
    
    this.schedulerTimerId = window.setInterval(() => this.scheduler(), 25);
    onStateChange();
  }
  
  public stop() {
    this.isPlaying = false;
    if (this.schedulerTimerId) {
      clearInterval(this.schedulerTimerId);
      this.schedulerTimerId = null;
    }
    
    this.activeVoices.forEach(voice => {
      try {
        voice.source.stop();
      } catch (e) {}
      voice.source.disconnect();
      voice.gain.disconnect();
    });
    this.activeVoices = [];
    
    this.currentStep = this.loopStart;
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback();
    }
  }
  
  public stopTrackVoices(trackId: string) {
    this.activeVoices = this.activeVoices.filter(voice => {
      if (voice.trackId === trackId) {
        try {
          voice.source.stop();
        } catch (e) {}
        voice.source.disconnect();
        voice.gain.disconnect();
        return false;
      }
      return true;
    });
  }
  
  // Live dB Level Measurement for visual indicators
  public getTrackLevel(trackId: string): number {
    const nodes = this.trackNodes[trackId];
    if (!nodes || !this.ctx || !this.isPlaying) return -144;
    
    const bufferLength = nodes.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    nodes.analyser.getByteTimeDomainData(dataArray);
    
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const val = (dataArray[i] - 128) / 128;
      sum += val * val;
    }
    const rms = Math.sqrt(sum / bufferLength);
    if (rms < 0.0001) return -144;
    
    const db = 20 * Math.log10(rms);
    return Math.max(-144, Math.min(6, db + 12)); // offset slightly for visual aesthetic
  }

  public getMasterLevel(): number {
    if (!this.analyser || !this.ctx || !this.isPlaying) return -144;
    
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteTimeDomainData(dataArray);
    
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const val = (dataArray[i] - 128) / 128;
      sum += val * val;
    }
    const rms = Math.sqrt(sum / bufferLength);
    if (rms < 0.0001) return -144;
    
    const db = 20 * Math.log10(rms);
    return Math.max(-144, Math.min(6, db + 12));
  }
  
  private scheduler() {
    if (!this.ctx) return;
    while (this.nextStepTime < this.ctx.currentTime + 0.1) {
      this.scheduleStep(this.currentStep, this.nextStepTime);
      this.nextStepTime += this.stepDuration;
      
      const prevStep = this.currentStep;
      this.currentStep = this.currentStep + 1;
      if (this.loopEnabled) {
        if (this.currentStep >= this.loopEnd || this.currentStep >= this.totalSteps) {
          this.currentStep = this.loopStart;
        }
      } else {
        if (this.currentStep >= this.totalSteps) {
          this.currentStep = 0;
        }
      }
      
      if (this.onStepCallback) {
        this.onStepCallback(prevStep);
      }
    }
  }
  
  private scheduleStep(step: number, time: number) {
    this.tracks.forEach(track => {
      const nodes = this.trackNodes[track.id];
      if (!nodes) return;
      
      if (track.mute) return;
      const anySolo = this.tracks.some(t => t.solo);
      if (anySolo && !track.solo) return;

      // Apply automation if enabled
      if (track.automation && track.automation.enabled) {
        const param = track.automation.activeParam;
        if (param === 'volume') {
          const autoVal = track.automation.volume[step];
          if (autoVal !== undefined) {
            track.volumeDb = autoVal;
            this.updateTrackNodeLevels(track);
          }
        } else if (param === 'pan') {
          const autoVal = track.automation.pan[step];
          if (autoVal !== undefined) {
            track.pan = autoVal;
            this.updateTrackNodeLevels(track);
          }
        }
      }

      if (track.type === 'synth') {
        Object.entries(track.steps).forEach(([stepStr, notes]) => {
          const noteStep = Number(stepStr);
          if (noteStep >= step && noteStep < step + 1 && notes && notes.length > 0) {
            const offsetSteps = noteStep - step;
            const noteTime = time + offsetSteps * this.stepDuration;
            notes.forEach(noteObj => {
              const noteName = typeof noteObj === 'string' ? noteObj : noteObj.pitch;
              const durationSteps = typeof noteObj === 'string' ? 1 : (noteObj.duration || 1);
              this.playSynthNote(track, noteName, noteTime, nodes.eqLow, durationSteps);
            });
          }
        });
      } else if (track.type === 'drum') {
        let kickTriggered = false;
        
        if (track.drumSteps.kick && track.drumSteps.kick[step]) {
          this.playKick(time, nodes.eqLow);
          kickTriggered = true;
        }
        if (track.drumSteps.snare && track.drumSteps.snare[step]) {
          this.playSnare(time, nodes.eqLow);
        }
        if (track.drumSteps.hihat && track.drumSteps.hihat[step]) {
          this.playHihat(time, nodes.eqLow);
        }
        if (track.drumSteps.clap && track.drumSteps.clap[step]) {
          this.playClap(time, nodes.eqLow);
        }
        
        // Sidechain Ducking
        if (kickTriggered) {
          this.tracks.forEach(t => {
            if (t.sidechain && t.id !== track.id) {
              const tNodes = this.trackNodes[t.id];
              if (tNodes && this.ctx) {
                const now = time;
                // Prevent 0 values in exponentialRampToValueAtTime by enforcing a minimum positive gain
                const baseGain = Math.max(0.0001, this.dbToGain(t.volumeDb));
                tNodes.gain.gain.setValueAtTime(baseGain, now);
                tNodes.gain.gain.exponentialRampToValueAtTime(baseGain * 0.15, now + 0.015);
                tNodes.gain.gain.exponentialRampToValueAtTime(baseGain, now + 0.18);
              }
            }
          });
        }
      } else if (track.type === 'audio') {
        const audioStart = track.audioStartStep || 0;
        if (track.audioBuffer && (step === audioStart || step === this.loopStart)) {
          this.playAudioTrackBuffer(track, time, step);
        }
      }
    });
  }
  
  private playSynthNote(track: Track, note: string, time: number, destinationNode: AudioNode, durationSteps = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    
    // Voice stealing / polyphony overlap prevention (damp matching note on this track)
    this.activeVoices = this.activeVoices.filter(voice => {
      if (voice.trackId === track.id && voice.note === note) {
        try {
          const fadeTime = ctx.currentTime + 0.02;
          voice.gain.gain.cancelScheduledValues(ctx.currentTime);
          voice.gain.gain.setValueAtTime(voice.gain.gain.value, ctx.currentTime);
          voice.gain.gain.linearRampToValueAtTime(0.0001, fadeTime);
          voice.source.stop(fadeTime);
        } catch (e) {}
        return false;
      }
      return true;
    });
    const freq = NOTE_FREQS[note];
    if (!freq) return;
    const midiNote = Math.round(12 * Math.log2(freq / 440) + 69);
    
    if (track.preset === 'piano' || track.preset === 'sustain_piano') {
      const loadedMidis = Object.keys(this.pianoBuffers).map(Number);
      if (loadedMidis.length > 0) {
        const closestMidi = loadedMidis.reduce((prev, curr) => 
          Math.abs(curr - midiNote) < Math.abs(prev - midiNote) ? curr : prev
        );
        
        const diff = midiNote - closestMidi;
        const playbackRate = Math.pow(2, diff / 12);
        
        const sampleSource = ctx.createBufferSource();
        sampleSource.buffer = this.pianoBuffers[closestMidi];
        sampleSource.playbackRate.setValueAtTime(playbackRate, time);
        
        const duration = Math.max(0.15, this.stepDuration * durationSteps * 0.95);
        const tAttack = time + 0.002;
        const tReleaseStart = time + duration;
        const isSustainPedal = !track.pedalBypass || track.preset === 'sustain_piano';
        const pedalDampVal = Math.max(0.99, track.pedalDamping ?? 0.99);
        const baseRelease = isSustainPedal 
          ? Math.max(0.2, (track.pedalRelease ?? 3.8) * Math.pow(pedalDampVal, midiNote - 36)) 
          : (midiNote < 91 ? 0.32 : Math.max(0.32, 2.5 * Math.pow(0.95, midiNote - 91)));
        
        // Calculate slow held decay
        const baseHoldDecay = Math.max(3.0, 12.0 * Math.pow(0.975, midiNote - 36));
        const holdDecayConstant = isSustainPedal 
          ? baseHoldDecay * (1.0 + (track.pedalRelease ?? 3.8) * 0.5) 
          : baseHoldDecay;
        const volumeAtRelease = Math.max(0.05, 0.80 * Math.exp(-duration / holdDecayConstant));
        const tReleaseEnd = tReleaseStart + (isSustainPedal ? baseRelease : 0.3);
        
        const ampEnv = ctx.createGain();
        ampEnv.gain.setValueAtTime(0.0001, time);
        ampEnv.gain.linearRampToValueAtTime(0.80, tAttack);
        
        ampEnv.gain.exponentialRampToValueAtTime(volumeAtRelease, tReleaseStart);
        ampEnv.gain.exponentialRampToValueAtTime(0.0001, tReleaseEnd);
        
        const panner = ctx.createStereoPanner();
        const keyPan = Math.max(-0.4, Math.min(0.4, (midiNote - 60) / 45.0));
        panner.pan.setValueAtTime(keyPan, time);
        
        sampleSource.connect(panner);
        panner.connect(ampEnv);
        ampEnv.connect(destinationNode);
        
        sampleSource.start(time);
        sampleSource.stop(tReleaseEnd + 0.1);
        
        this.activeVoices.push({ source: sampleSource, gain: ampEnv, trackId: track.id, note: note });

        // Sympathetic resonance simulation when pedal is on
        const pedalResonanceVal = track.pedalResonance ?? 0.5;
        if (isSustainPedal && pedalResonanceVal > 0) {
          try {
            const resSource = ctx.createBufferSource();
            resSource.buffer = this.pianoBuffers[closestMidi];
            resSource.playbackRate.setValueAtTime(playbackRate * 1.003, time);
            const resFilter = ctx.createBiquadFilter();
            resFilter.type = 'lowpass';
            resFilter.frequency.setValueAtTime(800, time);
            
            const resGain = ctx.createGain();
            resGain.gain.setValueAtTime(0.0001, time);
            resGain.gain.linearRampToValueAtTime(0.15 * pedalResonanceVal, tAttack);
            resGain.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.15 * pedalResonanceVal * Math.exp(-duration / holdDecayConstant)), tReleaseStart);
            resGain.gain.exponentialRampToValueAtTime(0.0001, tReleaseEnd);

            resSource.connect(resFilter);
            resFilter.connect(resGain);
            resGain.connect(panner);
            
            resSource.start(time);
            resSource.stop(tReleaseEnd + 0.1);
            
            this.activeVoices.push({ source: resSource, gain: resGain, trackId: track.id, note: note + '_res' });
          } catch (e) {}
        }
        return;
      }
      
      if (!this.noiseBuffer) return;
      
      const duration = Math.max(0.15, this.stepDuration * durationSteps * 0.95);
      const tAttack = time + 0.004;
      const tReleaseStart = time + duration;
      
      const isSustainPedal = !track.pedalBypass || track.preset === 'sustain_piano';
      // Decay time tracking: lower strings ring, high strings decay very quickly
      const baseHoldDecay = Math.max(3.0, 10.0 * Math.pow(0.975, midiNote - 36));
      const baseDecay = isSustainPedal 
        ? baseHoldDecay * (1.0 + (track.pedalRelease ?? 3.5) * 0.5) 
        : baseHoldDecay;
      const pedalDampVal = Math.max(0.99, track.pedalDamping ?? 0.99);
      const baseRelease = isSustainPedal 
        ? Math.max(0.2, (track.pedalRelease ?? 3.5) * Math.pow(pedalDampVal, midiNote - 36)) 
        : (midiNote < 91 ? 0.32 : Math.max(0.32, 2.0 * Math.pow(0.95, midiNote - 91)));
      const tReleaseEnd = tReleaseStart + (isSustainPedal ? baseRelease : 0.3);

      const ampEnv = ctx.createGain();
      ampEnv.gain.setValueAtTime(0.0001, time);
      ampEnv.gain.linearRampToValueAtTime(0.65, tAttack); // Strong velocity attack
      
      // Overall fade out envelope
      const volumeAtRelease = Math.max(0.05, 0.65 * Math.exp(-duration / (baseDecay / 2.0)));
      ampEnv.gain.exponentialRampToValueAtTime(volumeAtRelease, tReleaseStart);
      ampEnv.gain.exponentialRampToValueAtTime(0.0001, tReleaseEnd);

      // Inharmonicity coefficient (stiffness of string)
      const B = 0.00022;
      
      // Define the harmonics: multiplier, volume coefficient, decay factor
      const harmonics = [
        { mult: 1, vol: 0.55, decay: 1.0 },
        { mult: 2, vol: 0.28, decay: 0.65 },
        { mult: 3, vol: 0.16, decay: 0.42 },
        { mult: 4, vol: 0.10, decay: 0.28 },
        { mult: 5, vol: 0.06, decay: 0.18 },
        { mult: 6, vol: 0.03, decay: 0.10 }
      ];

      // We will create two parallel channels: Left (detuned flat) and Right (detuned sharp)
      // to simulate the multi-string grand piano unison beating.
      const pannerL = ctx.createStereoPanner();
      const pannerR = ctx.createStereoPanner();
      const keyPan = Math.max(-0.4, Math.min(0.4, (midiNote - 60) / 45.0));
      pannerL.pan.setValueAtTime(Math.max(-1.0, -0.65 + keyPan), time);
      pannerR.pan.setValueAtTime(Math.min(1.0, 0.65 + keyPan), time);

      const gainL = ctx.createGain();
      const gainR = ctx.createGain();
      gainL.gain.setValueAtTime(0.5, time);
      gainR.gain.setValueAtTime(0.5, time);

      // We will generate the oscillators for Left and Right channels
      harmonics.forEach((h) => {
        // Calculate the inharmonic frequency
        const fHarmonic = freq * h.mult * Math.sqrt(1 + h.mult * h.mult * B);
        
        // Unison detuning: Left flat, Right sharp. Detune slightly if pedal is active for sympathetic unison beating.
        const detuneCents = isSustainPedal ? (4.0 * (track.pedalResonance ?? 0.5)) : 0.0;
        const fL = fHarmonic * Math.pow(2, -detuneCents / 1200);
        const fR = fHarmonic * Math.pow(2, detuneCents / 1200);

        // Create Left oscillator
        const oscL = ctx.createOscillator();
        oscL.type = h.mult === 1 ? 'triangle' : 'sine'; // Triangle for warm fundamental, sine for others
        oscL.frequency.setValueAtTime(fL, time);

        // Create Right oscillator
        const oscR = ctx.createOscillator();
        oscR.type = h.mult === 1 ? 'triangle' : 'sine';
        oscR.frequency.setValueAtTime(fR, time);

        // Each harmonic has its own volume envelope to simulate dynamic spectral decay
        const envL = ctx.createGain();
        const envR = ctx.createGain();
        
        const hVol = h.vol;
        const hDecay = baseDecay * h.decay;
        
        envL.gain.setValueAtTime(0.0001, time);
        envL.gain.linearRampToValueAtTime(hVol, tAttack);
        const vLAtRelease = Math.max(0.001, hVol * Math.exp(-duration / hDecay));
        envL.gain.exponentialRampToValueAtTime(vLAtRelease, tReleaseStart);
        envL.gain.exponentialRampToValueAtTime(0.0001, tReleaseStart + (isSustainPedal ? baseRelease : 0.3) * h.decay);

        envR.gain.setValueAtTime(0.0001, time);
        envR.gain.linearRampToValueAtTime(hVol, tAttack);
        const vRAtRelease = Math.max(0.001, hVol * Math.exp(-duration / hDecay));
        envR.gain.exponentialRampToValueAtTime(vRAtRelease, tReleaseStart);
        envR.gain.exponentialRampToValueAtTime(0.0001, tReleaseStart + (isSustainPedal ? baseRelease : 0.3) * h.decay);

        oscL.connect(envL);
        envL.connect(gainL);

        oscR.connect(envR);
        envR.connect(gainR);

        oscL.start(time);
        oscR.start(time);

        const hStopTime = tReleaseStart + baseRelease * h.decay + 0.1;
        oscL.stop(hStopTime);
        oscR.stop(hStopTime);

        this.activeVoices.push({ source: oscL, gain: envL, trackId: track.id, note: note });
        this.activeVoices.push({ source: oscR, gain: envR, trackId: track.id, note: note });
      });

      // Hammer transient sound (woody knock + noise click)
      const hammerOsc = ctx.createOscillator();
      hammerOsc.type = 'sine';
      // Fast pitch sweep for transient impact
      hammerOsc.frequency.setValueAtTime(freq * 3.5, time);
      hammerOsc.frequency.exponentialRampToValueAtTime(freq * 0.8, time + 0.015);

      const hammerGain = ctx.createGain();
      hammerGain.gain.setValueAtTime(0.0001, time);
      hammerGain.gain.linearRampToValueAtTime(0.28, time + 0.002);
      hammerGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.016);

      hammerOsc.connect(hammerGain);
      hammerOsc.start(time);
      hammerOsc.stop(time + 0.03);

      // Noise click for hammer felt strike
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = this.noiseBuffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(3200, time);
      noiseFilter.Q.setValueAtTime(1.5, time);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.0001, time);
      noiseGain.gain.linearRampToValueAtTime(0.12, time + 0.002);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.018);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseSource.start(time);
      noiseSource.stop(time + 0.03);

      // Connect channels to panners
      gainL.connect(pannerL);
      gainR.connect(pannerR);

      // Connect panners to master EQ/Filter
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.setValueAtTime(0.4, time);
      filter.frequency.setValueAtTime(10000, time);

      pannerL.connect(filter);
      pannerR.connect(filter);
      
      // Inject hammer strike to center of mix
      hammerGain.connect(filter);
      noiseGain.connect(filter);

      // High-shelf EQ boost for modern pop grand piano clarity
      const brightEQ = ctx.createBiquadFilter();
      brightEQ.type = 'highshelf';
      brightEQ.frequency.setValueAtTime(4000, time);
      brightEQ.gain.setValueAtTime(5.5, time); // +5.5dB presence boost

      filter.connect(brightEQ);
      brightEQ.connect(ampEnv);
      ampEnv.connect(destinationNode);

      this.activeVoices.push({ source: hammerOsc, gain: ampEnv, trackId: track.id, note: note });
      this.activeVoices.push({ source: noiseSource, gain: ampEnv, trackId: track.id, note: note });
      return;
    }

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const ampEnv = ctx.createGain();
    
    // Autotune / Portamento Glide logic
    const lastFreq = this.lastTrackFreq[track.id];
    const autotuneBypass = track.autotuneBypass === undefined ? true : track.autotuneBypass;
    const autotuneSpeed = track.autotuneSpeed === undefined ? 0.12 : track.autotuneSpeed;
    const glideTime = autotuneSpeed;
    const isGlideActive = !autotuneBypass && lastFreq && lastFreq !== freq;
    
    // Store this pitch as the last played frequency
    this.lastTrackFreq[track.id] = freq;
    
    switch (track.preset) {
      case 'bass':
        osc1.type = 'sawtooth';
        if (isGlideActive) {
          osc1.frequency.setValueAtTime(lastFreq / 2, time);
          osc1.frequency.exponentialRampToValueAtTime(freq / 2, time + glideTime);
        } else {
          osc1.frequency.setValueAtTime(freq / 2, time);
        }
        
        osc2.type = 'triangle';
        if (isGlideActive) {
          osc2.frequency.setValueAtTime((lastFreq / 2) * 1.005, time);
          osc2.frequency.exponentialRampToValueAtTime((freq / 2) * 1.005, time + glideTime);
        } else {
          osc2.frequency.setValueAtTime((freq / 2) * 1.005, time);
        }
        
        filter.type = 'lowpass';
        filter.Q.setValueAtTime(1.0, time);
        filter.frequency.setValueAtTime(Math.max(320, freq * 1.5), time);
        break;
      case 'pluck':
        osc1.type = 'triangle';
        if (isGlideActive) {
          osc1.frequency.setValueAtTime(lastFreq, time);
          osc1.frequency.exponentialRampToValueAtTime(freq, time + glideTime);
        } else {
          osc1.frequency.setValueAtTime(freq, time);
        }
        
        osc2.type = 'sawtooth';
        if (isGlideActive) {
          osc2.frequency.setValueAtTime(lastFreq * 1.002, time);
          osc2.frequency.exponentialRampToValueAtTime(freq * 1.002, time + glideTime);
        } else {
          osc2.frequency.setValueAtTime(freq * 1.002, time);
        }
        
        filter.type = 'lowpass';
        filter.Q.setValueAtTime(3.5, time);
        filter.frequency.setValueAtTime(Math.max(1600, freq * 3.5), time);
        filter.frequency.exponentialRampToValueAtTime(Math.max(150, freq * 0.4), time + 0.08);
        break;
      case 'pad':
        osc1.type = 'triangle';
        if (isGlideActive) {
          osc1.frequency.setValueAtTime(lastFreq, time);
          osc1.frequency.exponentialRampToValueAtTime(freq, time + glideTime);
        } else {
          osc1.frequency.setValueAtTime(freq, time);
        }
        
        osc2.type = 'sine';
        if (isGlideActive) {
          osc2.frequency.setValueAtTime(lastFreq * 0.997, time);
          osc2.frequency.exponentialRampToValueAtTime(freq * 0.997, time + glideTime);
        } else {
          osc2.frequency.setValueAtTime(freq * 0.997, time);
        }
        
        filter.type = 'lowpass';
        filter.Q.setValueAtTime(0.5, time);
        filter.frequency.setValueAtTime(Math.max(750, freq * 2.0), time);
        break;
      case 'lead':
      default:
        osc1.type = 'sawtooth';
        if (isGlideActive) {
          osc1.frequency.setValueAtTime(lastFreq, time);
          osc1.frequency.exponentialRampToValueAtTime(freq, time + glideTime);
        } else {
          osc1.frequency.setValueAtTime(freq, time);
        }
        
        osc2.type = 'square';
        if (isGlideActive) {
          osc2.frequency.setValueAtTime(lastFreq * 1.008, time);
          osc2.frequency.exponentialRampToValueAtTime(freq * 1.008, time + glideTime);
        } else {
          osc2.frequency.setValueAtTime(freq * 1.008, time);
        }
        
        filter.type = 'lowpass';
        filter.Q.setValueAtTime(2.0, time);
        filter.frequency.setValueAtTime(Math.max(2200, freq * 2.5), time);
        filter.frequency.exponentialRampToValueAtTime(Math.max(3200, freq * 3.5), time + 0.04);
        filter.frequency.exponentialRampToValueAtTime(Math.max(800, freq * 1.2), time + 0.22);
        break;
    }
    
    const duration = Math.max(0.15, this.stepDuration * durationSteps * 0.95);
    const tAttack = time + 0.01;
    const tDecay = time + 0.01 + duration * 0.3;
    const tReleaseStart = time + duration;
    
    const isSustainPedal = !track.pedalBypass;
    const baseRelease = isSustainPedal 
      ? Math.max(1.5, (track.pedalRelease ?? 3.5) * Math.pow(track.pedalDamping ?? 0.96, midiNote - 36)) 
      : 0.08;
    const tReleaseEnd = tReleaseStart + (track.preset === 'pad' ? Math.max(0.3, baseRelease) : track.preset === 'pluck' ? Math.max(0.08, baseRelease * 0.2) : baseRelease);
    
    ampEnv.gain.setValueAtTime(0.0, time);
    
    if (track.preset === 'pad') {
      const tPadAttack = time + duration * 0.4;
      const tPadReleaseEnd = tReleaseStart + (isSustainPedal ? baseRelease : 0.3);
      ampEnv.gain.linearRampToValueAtTime(0.18, tPadAttack);
      ampEnv.gain.setValueAtTime(0.18, tReleaseStart);
      ampEnv.gain.exponentialRampToValueAtTime(0.0001, tPadReleaseEnd);
    } else if (track.preset === 'pluck') {
      ampEnv.gain.linearRampToValueAtTime(0.3, tAttack);
      ampEnv.gain.exponentialRampToValueAtTime(0.0001, time + (isSustainPedal ? baseRelease * 0.2 : 0.08));
    } else {
      ampEnv.gain.linearRampToValueAtTime(0.24, tAttack);
      ampEnv.gain.exponentialRampToValueAtTime(0.14, tDecay);
      ampEnv.gain.setValueAtTime(0.14, tReleaseStart);
      ampEnv.gain.exponentialRampToValueAtTime(0.0001, tReleaseEnd);
    }
    
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(ampEnv);
    ampEnv.connect(destinationNode);
    
    osc1.start(time);
    osc2.start(time);
    
    const stopTime = track.preset === 'pad' ? tReleaseStart + (isSustainPedal ? baseRelease : 0.3) : track.preset === 'pluck' ? time + (isSustainPedal ? baseRelease * 0.2 + 0.07 : 0.15) : tReleaseEnd;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    
    this.activeVoices.push({ source: osc1, gain: ampEnv, trackId: track.id, note: note });
    this.activeVoices.push({ source: osc2, gain: ampEnv, trackId: track.id, note: note });
  }
  
  private playKick(time: number, destinationNode: AudioNode) {
    if (!this.ctx) return;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.14);
    
    gain.gain.setValueAtTime(0.0, time);
    gain.gain.linearRampToValueAtTime(1.0, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);
    
    osc.connect(gain);
    gain.connect(destinationNode);
    
    osc.start(time);
    osc.stop(time + 0.3);
    
    this.activeVoices.push({ source: osc, gain });
  }
  
  private playSnare(time: number, destinationNode: AudioNode) {
    if (!this.ctx || !this.noiseBuffer) return;
    
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;
    
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(1100, time);
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0, time);
    noiseGain.gain.linearRampToValueAtTime(0.35, time + 0.01);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
    
    const toneOsc = this.ctx.createOscillator();
    toneOsc.type = 'triangle';
    toneOsc.frequency.setValueAtTime(180, time);
    toneOsc.frequency.exponentialRampToValueAtTime(90, time + 0.08);
    
    const toneGain = this.ctx.createGain();
    toneGain.gain.setValueAtTime(0.0, time);
    toneGain.gain.linearRampToValueAtTime(0.35, time + 0.01);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
    
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(destinationNode);
    
    toneOsc.connect(toneGain);
    toneGain.connect(destinationNode);
    
    noiseSource.start(time);
    toneOsc.start(time);
    
    noiseSource.stop(time + 0.25);
    toneOsc.stop(time + 0.25);
    
    this.activeVoices.push({ source: noiseSource, gain: noiseGain });
    this.activeVoices.push({ source: toneOsc, gain: toneGain });
  }
  
  private playHihat(time: number, destinationNode: AudioNode) {
    if (!this.ctx || !this.noiseBuffer) return;
    
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(8500, time);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0, time);
    gain.gain.linearRampToValueAtTime(0.15, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.048);
    
    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(destinationNode);
    
    noiseSource.start(time);
    noiseSource.stop(time + 0.08);
    
    this.activeVoices.push({ source: noiseSource, gain });
  }
  
  private playClap(time: number, destinationNode: AudioNode) {
    if (!this.ctx || !this.noiseBuffer) return;
    
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, time);
    filter.Q.setValueAtTime(3.5, time);
    
    const gain = this.ctx.createGain();
    
    gain.gain.setValueAtTime(0.0, time);
    gain.gain.linearRampToValueAtTime(0.28, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.02, time + 0.015);
    
    gain.gain.linearRampToValueAtTime(0.22, time + 0.017);
    gain.gain.exponentialRampToValueAtTime(0.02, time + 0.03);
    
    gain.gain.linearRampToValueAtTime(0.18, time + 0.032);
    gain.gain.exponentialRampToValueAtTime(0.02, time + 0.045);
    
    gain.gain.linearRampToValueAtTime(0.28, time + 0.047);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.26);
    
    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(destinationNode);
    
    noiseSource.start(time);
    noiseSource.stop(time + 0.3);
    
    this.activeVoices.push({ source: noiseSource, gain });
  }
  
  public playAudioTrackBuffer(track: Track, startTime: number, startStep: number) {
    if (!this.ctx || !track.audioBuffer) return;
    
    this.stopTrackVoices(track.id);
    
    const nodes = this.trackNodes[track.id];
    if (!nodes) return;
    
    const audioStart = track.audioStartStep || 0;
    const durationSteps = Math.ceil(track.audioBuffer.duration / this.stepDuration);
    
    if (startStep >= audioStart && startStep < audioStart + durationSteps) {
      const offset = (startStep - audioStart) * this.stepDuration;
      
      const source = this.ctx.createBufferSource();
      source.buffer = track.audioBuffer;
      
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(1.0, startTime);
      
      source.connect(gain);
      gain.connect(nodes.eqLow);
      
      source.start(startTime, offset);
      
      this.activeVoices.push({ trackId: track.id, source, gain });
    }
  }
  
  public triggerTrackAudition(track: Track, noteOrInst = 'C4', durationSteps = 2) {
    this.init();
    if (!this.ctx) return;
    
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    
    const nodes = this.trackNodes[track.id];
    if (!nodes) return;
    
    const time = this.ctx.currentTime;
    if (track.type === 'synth') {
      this.playSynthNote(track, noteOrInst, time, nodes.eqLow, durationSteps); // Default audition to 2 steps (8th note)
    } else if (track.type === 'drum') {
      if (noteOrInst === 'snare') {
        this.playSnare(time, nodes.eqLow);
      } else if (noteOrInst === 'hihat') {
        this.playHihat(time, nodes.eqLow);
      } else if (noteOrInst === 'clap') {
        this.playClap(time, nodes.eqLow);
      } else {
        this.playKick(time, nodes.eqLow);
      }
    } else if (track.type === 'audio' && track.audioBuffer) {
      this.playAudioTrackBuffer(track, this.ctx.currentTime, track.audioStartStep || 0);
    }
  }

  public addNewTrack(type: 'synth' | 'drum' | 'audio'): Track {
    const id = `track-${type}-${Date.now()}`;
    
    // logic pro preset track colors
    const colors = ['#3BB1D8', '#4D9945', '#ff9100', '#ffea00', '#9c27b0', '#ff007f'];
    const color = colors[this.tracks.length % colors.length];
    
    const typeLabel = type === 'synth' ? 'Synth' : type === 'drum' ? 'Drum' : 'Audio';
    const name = `${typeLabel} Track ${this.tracks.length + 1}`;
    
    const newTrack: Track = {
      id,
      name,
      type,
      color,
      volumeDb: 0.0, // default 0.0 dB (Unity gain)
      pan: 0.0,
      mute: false,
      solo: false,
      sendDelay: 0.0,
      sendReverb: 0.0,
      eqLow: 2.0,
      eqLowMid: 0.0,
      eqMid: -1.0,
      eqHigh: 3.5,
      compressor: true,
      sidechain: false,
      eqBypass: false,
      compBypass: false,
      delayBypass: false,
      reverbBypass: false,
      autotuneBypass: true,
      autotuneSpeed: 0.12,
      autotuneAmount: 0.0,
      compThresholdDb: -12,
      compRatio: 4,
      compAttackMs: 10,
      compReleaseMs: 150,
      eqLowFreq: 80,
      eqLowQ: 0.707,
      eqLowMidFreq: 400,
      eqLowMidQ: 1.0,
      eqHighMidFreq: 2000,
      eqHighMidQ: 1.0,
      eqHighFreq: 8000,
      eqHighQ: 0.707,
      delayTimeMsL: 375,
      delayTimeMsR: 500,
      delayFeedback: 45,
      reverbRoomSize: 0.75,
      reverbDecay: 0.5,
      reverbDamp: 0.25,
      satBypass: true,
      satDriveDb: 6,
      satKnee: 0.5,
      satOutputGainDb: 0,
      pedalBypass: true,
      pedalRelease: 3.8,
      pedalDamping: 0.99,
      pedalResonance: 0.5,
      preset: 'piano',
      steps: {},
      drumSteps: type === 'drum' ? {
        kick: Array(this.totalSteps).fill(false),
        snare: Array(this.totalSteps).fill(false),
        hihat: Array(this.totalSteps).fill(false),
        clap: Array(this.totalSteps).fill(false)
      } : {},
      audioStartStep: 0,
      automation: {
        volume: {},
        pan: {},
        enabled: false,
        activeParam: 'volume'
      }
    };
    
    this.tracks.push(newTrack);
    this.setupTrackNodes(newTrack);
    
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback();
    }
    return newTrack;
  }
  
  public deleteTrack(trackId: string) {
    this.tracks = this.tracks.filter(t => t.id !== trackId);
    
    const nodes = this.trackNodes[trackId];
    if (nodes) {
      try {
        nodes.gain.disconnect();
        nodes.panner.disconnect();
        nodes.eqLow.disconnect();
        nodes.eqLowMid.disconnect();
        nodes.eqMid.disconnect();
        nodes.eqHigh.disconnect();
        nodes.comp.disconnect();
        nodes.saturator.disconnect();
        nodes.delaySend.disconnect();
        nodes.reverbSend.disconnect();
        nodes.analyser.disconnect();
        if (nodes.autotuneDry) nodes.autotuneDry.disconnect();
        if (nodes.autotuneWet) nodes.autotuneWet.disconnect();
        if (nodes.autotuneLfo) {
          try { nodes.autotuneLfo.stop(); } catch (e) {}
          nodes.autotuneLfo.disconnect();
        }
      } catch (e) {}
      delete this.trackNodes[trackId];
    }
    
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback();
    }
  }

  // Offline Render WAV
  public async exportToWav(durationSeconds: number): Promise<Blob> {
    const sampleRate = 44100;
    const renderLength = sampleRate * durationSeconds;
    
    const OfflineCtxClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    const offlineCtx = new OfflineCtxClass(2, renderLength, sampleRate);
    
    const oMasterGain = offlineCtx.createGain();
    oMasterGain.gain.setValueAtTime(0.8, 0);
    
    const oMasterLimiter = offlineCtx.createDynamicsCompressor();
    oMasterLimiter.threshold.setValueAtTime(-1.0, 0);
    oMasterLimiter.knee.setValueAtTime(0, 0);
    oMasterLimiter.ratio.setValueAtTime(20.0, 0);
    oMasterLimiter.attack.setValueAtTime(0.001, 0);
    oMasterLimiter.release.setValueAtTime(0.1, 0);
    
    oMasterGain.connect(oMasterLimiter);
    oMasterLimiter.connect(offlineCtx.destination);
    
    const oDelayNode = offlineCtx.createDelay(2.0);
    const delayTime = (60.0 / this.bpm) * 0.75;
    oDelayNode.delayTime.setValueAtTime(delayTime, 0);
    const oDelayGain = offlineCtx.createGain();
    oDelayGain.gain.setValueAtTime(0.4, 0);
    
    oDelayNode.connect(oDelayGain);
    oDelayGain.connect(oDelayNode);
    
    const oDelayOutput = offlineCtx.createGain();
    oDelayOutput.gain.setValueAtTime(0.4, 0);
    oDelayNode.connect(oDelayOutput);
    oDelayOutput.connect(oMasterGain);
    
    const oReverbGain = offlineCtx.createGain();
    const oReverbSim = offlineCtx.createDelay(1.0);
    oReverbSim.delayTime.setValueAtTime(0.15, 0);
    const oReverbFeedback = offlineCtx.createGain();
    oReverbFeedback.gain.setValueAtTime(0.5, 0);
    
    oReverbSim.connect(oReverbFeedback);
    oReverbFeedback.connect(oReverbSim);
    oReverbGain.connect(oReverbSim);
    oReverbSim.connect(oMasterGain);
    
    const oNoiseBuffer = offlineCtx.createBuffer(1, sampleRate * 2, sampleRate);
    const oNoiseData = oNoiseBuffer.getChannelData(0);
    for (let i = 0; i < oNoiseBuffer.length; i++) {
      oNoiseData[i] = Math.random() * 2 - 1;
    }
    
    this.tracks.forEach(track => {
      let db = track.volumeDb;
      let gainVal = this.dbToGain(db);
      if (track.mute) gainVal = 0;
      const anySolo = this.tracks.some(t => t.solo);
      if (anySolo && !track.solo) gainVal = 0;
      if (gainVal === 0) return;
      
      const trackGain = offlineCtx.createGain();
      trackGain.gain.setValueAtTime(gainVal, 0);
      
      const trackPanner = offlineCtx.createStereoPanner();
      trackPanner.pan.setValueAtTime(track.pan, 0);
      
      // 4-Band EQ (matching real-time chain)
      const trackEqLow = offlineCtx.createBiquadFilter();
      trackEqLow.type = 'lowshelf';
      trackEqLow.frequency.setValueAtTime(track.eqLowFreq ?? 80, 0);
      trackEqLow.gain.setValueAtTime(track.eqBypass ? 0 : track.eqLow, 0);
      
      const trackEqLowMid = offlineCtx.createBiquadFilter();
      trackEqLowMid.type = 'peaking';
      trackEqLowMid.frequency.setValueAtTime(track.eqLowMidFreq ?? 400, 0);
      trackEqLowMid.Q.setValueAtTime(track.eqLowMidQ ?? 1.0, 0);
      trackEqLowMid.gain.setValueAtTime(track.eqBypass ? 0 : (track.eqLowMid ?? 0), 0);
      
      const trackEqMid = offlineCtx.createBiquadFilter();
      trackEqMid.type = 'peaking';
      trackEqMid.frequency.setValueAtTime(track.eqHighMidFreq ?? 2000, 0);
      trackEqMid.Q.setValueAtTime(track.eqHighMidQ ?? 1.0, 0);
      trackEqMid.gain.setValueAtTime(track.eqBypass ? 0 : track.eqMid, 0);
      
      const trackEqHigh = offlineCtx.createBiquadFilter();
      trackEqHigh.type = 'highshelf';
      trackEqHigh.frequency.setValueAtTime(track.eqHighFreq ?? 8000, 0);
      trackEqHigh.gain.setValueAtTime(track.eqBypass ? 0 : track.eqHigh, 0);
      
      // Compressor with track-specific parameters
      const trackComp = offlineCtx.createDynamicsCompressor();
      if (track.compBypass || !track.compressor) {
        trackComp.threshold.setValueAtTime(0, 0);
        trackComp.ratio.setValueAtTime(1.0, 0);
      } else {
        trackComp.threshold.setValueAtTime(track.compThresholdDb ?? -12, 0);
        trackComp.ratio.setValueAtTime(track.compRatio ?? 4, 0);
      }
      trackComp.knee.setValueAtTime(12, 0);
      trackComp.attack.setValueAtTime((track.compAttackMs ?? 10) / 1000, 0);
      trackComp.release.setValueAtTime((track.compReleaseMs ?? 150) / 1000, 0);
      
      // Saturator (WaveShaperNode)
      const trackSaturator = offlineCtx.createWaveShaper();
      trackSaturator.oversample = '4x';
      const satBypassed = track.satBypass === undefined ? true : track.satBypass;
      if (!satBypassed) {
        const driveDb = track.satDriveDb ?? 6;
        const knee = Math.max(0.001, Math.min(1.0, track.satKnee ?? 0.5));
        const outGainDb = track.satOutputGainDb ?? 0;
        const driveGain = Math.pow(10, driveDb / 20.0);
        const outGain = Math.pow(10, outGainDb / 20.0);
        const k = knee;
        const invThreeK2 = 1.0 / (3.0 * k * k);
        const n_samples = 4096;
        const curve = new Float32Array(n_samples);
        for (let i = 0; i < n_samples; i++) {
          const x = (i / (n_samples - 1)) * 2 - 1;
          const xDrive = x * driveGain;
          const absX = Math.abs(xDrive);
          let y = 0;
          if (absX < k) {
            y = xDrive - (xDrive * xDrive * xDrive) * invThreeK2;
          } else {
            const sign = xDrive < 0 ? -1 : 1;
            const tanhPart = Math.tanh(xDrive);
            const clipPart = sign * (k * (2.0 / 3.0));
            y = 0.5 * tanhPart + 0.5 * clipPart;
          }
          curve[i] = y * outGain;
        }
        trackSaturator.curve = curve;
      }
      
      const delaySend = offlineCtx.createGain();
      delaySend.gain.setValueAtTime(track.delayBypass ? 0 : track.sendDelay, 0);
      const reverbSend = offlineCtx.createGain();
      reverbSend.gain.setValueAtTime(track.reverbBypass ? 0 : track.sendReverb, 0);
      
      trackEqLow.connect(trackEqLowMid);
      trackEqLowMid.connect(trackEqMid);
      trackEqMid.connect(trackEqHigh);
      trackEqHigh.connect(trackComp);
      trackComp.connect(trackSaturator);
      trackSaturator.connect(trackGain);
      trackGain.connect(trackPanner);
      trackPanner.connect(oMasterGain);
      
      trackSaturator.connect(delaySend);
      delaySend.connect(oDelayNode);
      
      trackSaturator.connect(reverbSend);
      reverbSend.connect(oReverbGain);
      
      const tStepDuration = 60.0 / this.bpm / 4.0;
      const loops = Math.ceil(durationSeconds / (tStepDuration * this.totalSteps));
      for (let l = 0; l < loops; l++) {
        const loopOffset = l * this.totalSteps * tStepDuration;
        
        for (let step = 0; step < this.totalSteps; step++) {
          const time = loopOffset + (step * tStepDuration);
          if (time >= durationSeconds) break;
          
          if (track.type === 'synth') {
            const notes = track.steps[step];
            if (notes && notes.length > 0) {
              notes.forEach(noteObj => {
                const noteName = typeof noteObj === 'string' ? noteObj : noteObj.pitch;
                const durationSteps = typeof noteObj === 'string' ? 1 : (noteObj.duration || 1);
                const freq = NOTE_FREQS[noteName];
                if (!freq) return;
                const midiNote = Math.round(12 * Math.log2(freq / 440) + 69);
                const loadedMidis = Object.keys(this.pianoBuffers).map(Number);
                const oFilter = offlineCtx.createBiquadFilter();
                const oAmpEnv = offlineCtx.createGain();
                                if (track.preset === 'piano' || track.preset === 'sustain_piano') {
                  if (loadedMidis.length > 0) {
                    const closestMidi = loadedMidis.reduce((prev, curr) => 
                      Math.abs(curr - midiNote) < Math.abs(prev - midiNote) ? curr : prev
                    );
                    const diff = midiNote - closestMidi;
                    const playbackRate = Math.pow(2, diff / 12);
                    const sampleSource = offlineCtx.createBufferSource();
                    sampleSource.buffer = this.pianoBuffers[closestMidi];
                    sampleSource.playbackRate.setValueAtTime(playbackRate, time);
                    
                    const noteDuration = Math.max(0.15, tStepDuration * durationSteps * 0.95);
                    const tAttack = time + 0.002;
                    const tReleaseStart = time + noteDuration;
                    const isSustainPedal = !track.pedalBypass || track.preset === 'sustain_piano';
                    const pedalDampVal = Math.max(0.99, track.pedalDamping ?? 0.99);
                    const baseRelease = isSustainPedal 
                      ? Math.max(0.2, (track.pedalRelease ?? 3.8) * Math.pow(pedalDampVal, midiNote - 36)) 
                      : (midiNote < 91 ? 0.32 : Math.max(0.32, 2.5 * Math.pow(0.95, midiNote - 91)));
                    
                    // Calculate slow held decay
                    const baseHoldDecay = Math.max(3.0, 12.0 * Math.pow(0.975, midiNote - 36));
                    const holdDecayConstant = isSustainPedal 
                      ? baseHoldDecay * (1.0 + (track.pedalRelease ?? 3.8) * 0.5) 
                      : baseHoldDecay;
                    const volumeAtRelease = Math.max(0.05, 0.80 * Math.exp(-noteDuration / holdDecayConstant));
                    const tReleaseEnd = tReleaseStart + (isSustainPedal ? baseRelease : 0.3);
                    
                    const ampEnv = offlineCtx.createGain();
                    ampEnv.gain.setValueAtTime(0.0001, time);
                    ampEnv.gain.linearRampToValueAtTime(0.80, tAttack);
                    
                    ampEnv.gain.exponentialRampToValueAtTime(volumeAtRelease, tReleaseStart);
                    ampEnv.gain.exponentialRampToValueAtTime(0.0001, tReleaseEnd);
                    
                    const panner = offlineCtx.createStereoPanner();
                    const keyPan = Math.max(-0.4, Math.min(0.4, (midiNote - 60) / 45.0));
                    panner.pan.setValueAtTime(keyPan, time);
                    
                    sampleSource.connect(panner);
                    panner.connect(ampEnv);
                    ampEnv.connect(trackEqLow);
                    
                    sampleSource.start(time);
                    sampleSource.stop(tReleaseEnd + 0.1);

                    // Sympathetic resonance simulation when pedal is on in offline ctx
                    const pedalResonanceVal = track.pedalResonance ?? 0.5;
                    if (isSustainPedal && pedalResonanceVal > 0) {
                      try {
                        const resSource = offlineCtx.createBufferSource();
                        resSource.buffer = this.pianoBuffers[closestMidi];
                        resSource.playbackRate.setValueAtTime(playbackRate * 1.003, time);
                        const resFilter = offlineCtx.createBiquadFilter();
                        resFilter.type = 'lowpass';
                        resFilter.frequency.setValueAtTime(800, time);
                        
                        const resGain = offlineCtx.createGain();
                        resGain.gain.setValueAtTime(0.0001, time);
                        resGain.gain.linearRampToValueAtTime(0.15 * pedalResonanceVal, tAttack);
                        resGain.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.15 * pedalResonanceVal * Math.exp(-noteDuration / holdDecayConstant)), tReleaseStart);
                        resGain.gain.exponentialRampToValueAtTime(0.0001, tReleaseEnd);
                        
                        resSource.connect(resFilter);
                        resFilter.connect(resGain);
                        resGain.connect(panner);
                        
                        resSource.start(time);
                        resSource.stop(tReleaseEnd + 0.1);
                      } catch (e) {}
                    }
                  } else {
                    const noteDuration = Math.max(0.15, tStepDuration * durationSteps * 0.95);
                    const tAttack = time + 0.004;
                    const tReleaseStart = time + noteDuration;
                    const isSustainPedal = !track.pedalBypass || track.preset === 'sustain_piano';
                    const baseHoldDecay = Math.max(3.0, 10.0 * Math.pow(0.975, midiNote - 36));
                    const baseDecay = isSustainPedal 
                      ? baseHoldDecay * (1.0 + (track.pedalRelease ?? 3.5) * 0.5) 
                      : baseHoldDecay;
                    const pedalDampVal = Math.max(0.99, track.pedalDamping ?? 0.99);
                    const baseRelease = isSustainPedal 
                       ? Math.max(0.2, (track.pedalRelease ?? 3.5) * Math.pow(pedalDampVal, midiNote - 36)) 
                       : (midiNote < 91 ? 0.32 : Math.max(0.32, 2.0 * Math.pow(0.95, midiNote - 91)));
                    const tReleaseEnd = tReleaseStart + (isSustainPedal ? baseRelease : 0.3);

                    const ampEnv = offlineCtx.createGain();
                    ampEnv.gain.setValueAtTime(0.0001, time);
                    ampEnv.gain.linearRampToValueAtTime(0.65, tAttack);
                    
                    const volumeAtRelease = Math.max(0.05, 0.65 * Math.exp(-noteDuration / (baseDecay / 2.0)));
                    ampEnv.gain.exponentialRampToValueAtTime(volumeAtRelease, tReleaseStart);
                    ampEnv.gain.exponentialRampToValueAtTime(0.0001, tReleaseEnd);

                    const B = 0.00022;
                    const harmonics = [
                      { mult: 1, vol: 0.55, decay: 1.0 },
                      { mult: 2, vol: 0.28, decay: 0.65 },
                      { mult: 3, vol: 0.16, decay: 0.42 },
                      { mult: 4, vol: 0.10, decay: 0.28 },
                      { mult: 5, vol: 0.06, decay: 0.18 },
                      { mult: 6, vol: 0.03, decay: 0.10 }
                    ];

                    const pannerL = offlineCtx.createStereoPanner();
                    const pannerR = offlineCtx.createStereoPanner();
                    const keyPan = Math.max(-0.4, Math.min(0.4, (midiNote - 60) / 45.0));
                    pannerL.pan.setValueAtTime(Math.max(-1.0, -0.65 + keyPan), time);
                    pannerR.pan.setValueAtTime(Math.min(1.0, 0.65 + keyPan), time);

                    const gainL = offlineCtx.createGain();
                    const gainR = offlineCtx.createGain();
                    gainL.gain.setValueAtTime(0.5, time);
                    gainR.gain.setValueAtTime(0.5, time);

                    harmonics.forEach((h) => {
                      const fHarmonic = freq * h.mult * Math.sqrt(1 + h.mult * h.mult * B);
                      const detuneCents = isSustainPedal ? (4.0 * (track.pedalResonance ?? 0.5)) : 0.0;
                      const fL = fHarmonic * Math.pow(2, -detuneCents / 1200);
                      const fR = fHarmonic * Math.pow(2, detuneCents / 1200);

                      const oscL = offlineCtx.createOscillator();
                      oscL.type = h.mult === 1 ? 'triangle' : 'sine';
                      oscL.frequency.setValueAtTime(fL, time);

                      const oscR = offlineCtx.createOscillator();
                      oscR.type = h.mult === 1 ? 'triangle' : 'sine';
                      oscR.frequency.setValueAtTime(fR, time);

                      const envL = offlineCtx.createGain();
                      const envR = offlineCtx.createGain();
                      const hVol = h.vol;
                      const hDecay = baseDecay * h.decay;
                      
                      envL.gain.setValueAtTime(0.0001, time);
                      envL.gain.linearRampToValueAtTime(hVol, tAttack);
                      const vLAtRelease = Math.max(0.001, hVol * Math.exp(-noteDuration / hDecay));
                      envL.gain.exponentialRampToValueAtTime(vLAtRelease, tReleaseStart);
                      envL.gain.exponentialRampToValueAtTime(0.0001, tReleaseStart + (isSustainPedal ? baseRelease : 0.3) * h.decay);

                      envR.gain.setValueAtTime(0.0001, time);
                      envR.gain.linearRampToValueAtTime(hVol, tAttack);
                      const vRAtRelease = Math.max(0.001, hVol * Math.exp(-noteDuration / hDecay));
                      envR.gain.exponentialRampToValueAtTime(vRAtRelease, tReleaseStart);
                      envR.gain.exponentialRampToValueAtTime(0.0001, tReleaseStart + (isSustainPedal ? baseRelease : 0.3) * h.decay);

                      oscL.connect(envL);
                      envL.connect(gainL);
                      oscR.connect(envR);
                      envR.connect(gainR);

                      oscL.start(time);
                      oscR.start(time);

                      const hStopTime = tReleaseStart + (isSustainPedal ? baseRelease : 0.3) * h.decay + 0.1;
                      oscL.stop(hStopTime);
                      oscR.stop(hStopTime);
                    });

                    const hammerOsc = offlineCtx.createOscillator();
                    hammerOsc.type = 'sine';
                    hammerOsc.frequency.setValueAtTime(freq * 3.5, time);
                    hammerOsc.frequency.exponentialRampToValueAtTime(freq * 0.8, time + 0.015);

                    const hammerGain = offlineCtx.createGain();
                    hammerGain.gain.setValueAtTime(0.0001, time);
                    hammerGain.gain.linearRampToValueAtTime(0.28, time + 0.002);
                    hammerGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.016);

                    hammerOsc.connect(hammerGain);
                    hammerOsc.start(time);
                    hammerOsc.stop(time + 0.03);

                    const noiseSource = offlineCtx.createBufferSource();
                    noiseSource.buffer = oNoiseBuffer;

                    const noiseFilter = offlineCtx.createBiquadFilter();
                    noiseFilter.type = 'bandpass';
                    noiseFilter.frequency.setValueAtTime(3200, time);
                    noiseFilter.Q.setValueAtTime(1.5, time);

                    const noiseGain = offlineCtx.createGain();
                    noiseGain.gain.setValueAtTime(0.0001, time);
                    noiseGain.gain.linearRampToValueAtTime(0.12, time + 0.002);
                    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.018);

                    noiseSource.connect(noiseFilter);
                    noiseFilter.connect(noiseGain);
                    noiseSource.start(time);
                    noiseSource.stop(time + 0.03);

                    gainL.connect(pannerL);
                    gainR.connect(pannerR);

                    const filter = offlineCtx.createBiquadFilter();
                    filter.type = 'lowpass';
                    filter.Q.setValueAtTime(0.4, time);
                    filter.frequency.setValueAtTime(10000, time);

                    pannerL.connect(filter);
                    pannerR.connect(filter);
                    hammerGain.connect(filter);
                    noiseGain.connect(filter);

                    const brightEQ = offlineCtx.createBiquadFilter();
                    brightEQ.type = 'highshelf';
                    brightEQ.frequency.setValueAtTime(4000, time);
                    brightEQ.gain.setValueAtTime(5.5, time);

                    filter.connect(brightEQ);
                    brightEQ.connect(ampEnv);
                    ampEnv.connect(trackEqLow);
                  }
                } else {
                  const oOsc1 = offlineCtx.createOscillator();
                  const oOsc2 = offlineCtx.createOscillator();
                  
                  switch (track.preset) {
                    case 'bass':
                      oOsc1.type = 'sawtooth';
                      oOsc1.frequency.setValueAtTime(freq / 2, time);
                      oOsc2.type = 'triangle';
                      oOsc2.frequency.setValueAtTime(freq / 2 * 1.005, time);
                      oFilter.type = 'lowpass';
                      oFilter.Q.setValueAtTime(1.0, time);
                      oFilter.frequency.setValueAtTime(Math.max(320, freq * 1.5), time);
                      break;
                    case 'pluck':
                      oOsc1.type = 'triangle';
                      oOsc1.frequency.setValueAtTime(freq, time);
                      oOsc2.type = 'sawtooth';
                      oOsc2.frequency.setValueAtTime(freq * 1.002, time);
                      oFilter.type = 'lowpass';
                      oFilter.Q.setValueAtTime(3.5, time);
                      oFilter.frequency.setValueAtTime(Math.max(1600, freq * 3.5), time);
                      oFilter.frequency.exponentialRampToValueAtTime(Math.max(150, freq * 0.4), time + 0.08);
                      break;
                    case 'pad':
                      oOsc1.type = 'triangle';
                      oOsc1.frequency.setValueAtTime(freq, time);
                      oOsc2.type = 'sine';
                      oOsc2.frequency.setValueAtTime(freq * 0.997, time);
                      oFilter.type = 'lowpass';
                      oFilter.Q.setValueAtTime(0.5, time);
                      oFilter.frequency.setValueAtTime(Math.max(750, freq * 2.0), time);
                      break;
                    case 'lead':
                    default:
                      oOsc1.type = 'sawtooth';
                      oOsc1.frequency.setValueAtTime(freq, time);
                      oOsc2.type = 'square';
                      oOsc2.frequency.setValueAtTime(freq * 1.008, time);
                      oFilter.type = 'lowpass';
                      oFilter.Q.setValueAtTime(2.0, time);
                      oFilter.frequency.setValueAtTime(Math.max(2200, freq * 2.5), time);
                      oFilter.frequency.exponentialRampToValueAtTime(Math.max(3200, freq * 3.5), time + 0.04);
                      oFilter.frequency.exponentialRampToValueAtTime(Math.max(800, freq * 1.2), time + 0.22);
                      break;
                  }
                  const noteDuration = Math.max(0.15, tStepDuration * durationSteps * 0.95);
                  const tOfflineAttack = time + 0.01;
                  const tOfflineDecay = time + 0.01 + noteDuration * 0.3;
                  const tOfflineReleaseStart = time + noteDuration;
                  
                  const isSustainPedal = !track.pedalBypass;
                  const baseRelease = isSustainPedal 
                    ? Math.max(1.5, (track.pedalRelease ?? 3.5) * Math.pow(track.pedalDamping ?? 0.96, midiNote - 36)) 
                    : 0.08;
                  const tOfflineReleaseEnd = tOfflineReleaseStart + (track.preset === 'pad' ? Math.max(0.3, baseRelease) : track.preset === 'pluck' ? Math.max(0.08, baseRelease * 0.2) : baseRelease);

                  oAmpEnv.gain.setValueAtTime(0.0, time);
                  if (track.preset === 'pad') {
                    const tPadAttack = time + noteDuration * 0.4;
                    const tPadReleaseEnd = tOfflineReleaseStart + (isSustainPedal ? baseRelease : 0.3);
                    oAmpEnv.gain.linearRampToValueAtTime(0.18, tPadAttack);
                    oAmpEnv.gain.setValueAtTime(0.18, tOfflineReleaseStart);
                    oAmpEnv.gain.exponentialRampToValueAtTime(0.0001, tPadReleaseEnd);
                  } else if (track.preset === 'pluck') {
                    oAmpEnv.gain.linearRampToValueAtTime(0.3, tOfflineAttack);
                    oAmpEnv.gain.exponentialRampToValueAtTime(0.0001, time + (isSustainPedal ? baseRelease * 0.2 : 0.08));
                  } else {
                    oAmpEnv.gain.linearRampToValueAtTime(0.24, tOfflineAttack);
                    oAmpEnv.gain.exponentialRampToValueAtTime(0.14, tOfflineDecay);
                    oAmpEnv.gain.setValueAtTime(0.14, tOfflineReleaseStart);
                    oAmpEnv.gain.exponentialRampToValueAtTime(0.0001, tOfflineReleaseEnd);
                  }
                  
                  oOsc1.connect(oFilter);
                  oOsc2.connect(oFilter);
                  oFilter.connect(oAmpEnv);
                  oAmpEnv.connect(trackEqLow);
                  
                  oOsc1.start(time);
                  oOsc2.start(time);
                  
                  const stopTime = track.preset === 'pad' ? tOfflineReleaseStart + (isSustainPedal ? baseRelease : 0.3) : track.preset === 'pluck' ? time + (isSustainPedal ? baseRelease * 0.2 + 0.07 : 0.15) : tOfflineReleaseEnd;
                  oOsc1.stop(stopTime);
                  oOsc2.stop(stopTime);
                }
              });
            }
          } else if (track.type === 'drum') {
            let kickTriggered = false;
            
            if (track.drumSteps.kick && track.drumSteps.kick[step]) {
              const oOsc = offlineCtx.createOscillator();
              const oGain = offlineCtx.createGain();
              oOsc.frequency.setValueAtTime(140, time);
              oOsc.frequency.exponentialRampToValueAtTime(42, time + 0.14);
              oGain.gain.setValueAtTime(0.0, time);
              oGain.gain.linearRampToValueAtTime(1.0, time + 0.005);
              oGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);
              oOsc.connect(oGain);
              oGain.connect(trackEqLow);
              oOsc.start(time);
              oOsc.stop(time + 0.3);
              kickTriggered = true;
            }
            if (track.drumSteps.snare && track.drumSteps.snare[step]) {
              const oNoise = offlineCtx.createBufferSource();
              oNoise.buffer = oNoiseBuffer;
              const oFilter = offlineCtx.createBiquadFilter();
              oFilter.type = 'bandpass';
              oFilter.frequency.setValueAtTime(1100, time);
              
              const oNGain = offlineCtx.createGain();
              oNGain.gain.setValueAtTime(0.0, time);
              oNGain.gain.linearRampToValueAtTime(0.35, time + 0.01);
              oNGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
              
              const oTone = offlineCtx.createOscillator();
              oTone.type = 'triangle';
              oTone.frequency.setValueAtTime(180, time);
              oTone.frequency.exponentialRampToValueAtTime(90, time + 0.08);
              
              const oTGain = offlineCtx.createGain();
              oTGain.gain.setValueAtTime(0.0, time);
              oTGain.gain.linearRampToValueAtTime(0.35, time + 0.01);
              oTGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
              
              oNoise.connect(oFilter);
              oFilter.connect(oNGain);
              oNGain.connect(trackEqLow);
              oTone.connect(oTGain);
              oTGain.connect(trackEqLow);
              
              oNoise.start(time);
              oTone.start(time);
              oNoise.stop(time + 0.25);
              oTone.stop(time + 0.25);
            }
            if (track.drumSteps.hihat && track.drumSteps.hihat[step]) {
              const oNoise = offlineCtx.createBufferSource();
              oNoise.buffer = oNoiseBuffer;
              const oFilter = offlineCtx.createBiquadFilter();
              oFilter.type = 'highpass';
              oFilter.frequency.setValueAtTime(8500, time);
              
              const oGain = offlineCtx.createGain();
              oGain.gain.setValueAtTime(0.0, time);
              oGain.gain.linearRampToValueAtTime(0.15, time + 0.004);
              oGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.048);
              
              oNoise.connect(oFilter);
              oFilter.connect(oGain);
              oGain.connect(trackEqLow);
              oNoise.start(time);
              oNoise.stop(time + 0.08);
            }
            if (track.drumSteps.clap && track.drumSteps.clap[step]) {
              const oNoise = offlineCtx.createBufferSource();
              oNoise.buffer = oNoiseBuffer;
              const oFilter = offlineCtx.createBiquadFilter();
              oFilter.type = 'bandpass';
              oFilter.frequency.setValueAtTime(1400, time);
              oFilter.Q.setValueAtTime(3.5, time);
              
              const oGain = offlineCtx.createGain();
              oGain.gain.setValueAtTime(0.0, time);
              oGain.gain.linearRampToValueAtTime(0.28, time + 0.002);
              oGain.gain.exponentialRampToValueAtTime(0.02, time + 0.015);
              oGain.gain.linearRampToValueAtTime(0.22, time + 0.017);
              oGain.gain.exponentialRampToValueAtTime(0.02, time + 0.03);
              oGain.gain.linearRampToValueAtTime(0.18, time + 0.032);
              oGain.gain.exponentialRampToValueAtTime(0.02, time + 0.045);
              oGain.gain.linearRampToValueAtTime(0.28, time + 0.047);
              oGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.26);
              
              oNoise.connect(oFilter);
              oFilter.connect(oGain);
              oGain.connect(trackEqLow);
              
              oNoise.start(time);
              oNoise.stop(time + 0.3);
            }
            
            if (kickTriggered) {
              this.tracks.forEach(t => {
                if (t.sidechain && t.id !== track.id) {
                  const tGainVal = this.dbToGain(t.volumeDb);
                  trackGain.gain.setValueAtTime(tGainVal, time);
                  trackGain.gain.exponentialRampToValueAtTime(tGainVal * 0.15, time + 0.015);
                  trackGain.gain.exponentialRampToValueAtTime(tGainVal, time + 0.18);
                }
              });
            }
          } else if (track.type === 'audio') {
            if (track.audioBuffer && track.audioStartStep === step) {
              const oSource = offlineCtx.createBufferSource();
              oSource.buffer = track.audioBuffer;
              oSource.connect(trackEqLow);
              oSource.start(time);
            }
          }
        }
      }
    });
    
    const renderedBuffer = await offlineCtx.startRendering();
    
    // Apply Anti-Gravity custom DSP on the mixed stereo output
    if (this.tracks.length > 0) {
      // Use the first track's settings for master mastering demonstration
      const track = this.tracks[0];
      
      const channels = [
        renderedBuffer.getChannelData(0),
        renderedBuffer.getChannelData(1)
      ];
      
      // 1. Compressor
      if (track.compressor && !track.compBypass) {
        const compressor = new AntiGravityCompressor(sampleRate);
        compressor.setParams(
          track.compThresholdDb ?? -12,
          track.compRatio ?? 4,
          track.compAttackMs ?? 10,
          track.compReleaseMs ?? 150
        );
        compressor.process(channels);
      }
      
      // 2. 4-Band EQ
      if (!track.eqBypass) {
        const eq = new AntiGravityEQ4Band(sampleRate);
        eq.setParams(
          [track.eqLowFreq ?? 80, track.eqLow ?? 2.0, track.eqLowQ ?? 0.707],
          [track.eqLowMidFreq ?? 400, track.eqLowMid ?? 0.0, track.eqLowMidQ ?? 1.0],
          [track.eqHighMidFreq ?? 2000, track.eqMid ?? -1.0, track.eqHighMidQ ?? 1.0],
          [track.eqHighFreq ?? 8000, track.eqHigh ?? 3.5, track.eqHighQ ?? 0.707]
        );
        eq.process(channels);
      }
      
      // 3. Stereo Delay
      if (!track.delayBypass && track.sendDelay > 0) {
        const delay = new AntiGravityStereoDelay(sampleRate);
        delay.setParams(
          track.delayTimeMsL ?? 375,
          track.delayTimeMsR ?? 500,
          track.delayFeedback ?? 45,
          track.sendDelay * 100 // Map dryWet mix
        );
        delay.process(channels);
      }
      
      // 4. Reverb
      if (!track.reverbBypass && track.sendReverb > 0) {
        const reverb = new AntiGravityReverb();
        reverb.setParams(
          track.reverbRoomSize ?? 0.75,
          track.reverbDecay ?? 0.5,
          track.reverbDamp ?? 0.25,
          track.sendReverb // mix
        );
        reverb.process(channels);
      }
      
      // 5. Saturator
      if (!track.satBypass) {
        const saturator = new AntiGravitySaturator();
        saturator.setParams(
          track.satDriveDb ?? 6,
          track.satKnee ?? 0.5,
          track.satOutputGainDb ?? 0
        );
        saturator.process(channels);
      }
    }
    
    return this.bufferToWav(renderedBuffer);
  }
  
  private bufferToWav(buffer: AudioBuffer): Blob {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArr = new ArrayBuffer(length);
    const view = new DataView(bufferArr);
    const channels = [];
    let i;
    let sample;
    let offset = 0;
    let pos = 0;

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8);
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt "
    setUint32(16);
    setUint16(1);
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4);

    for (i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
      for (i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([bufferArr], { type: 'audio/wav' });

    function setUint16(data: number) {
      view.setUint16(pos, data, true);
      pos += 2;
    }

    function setUint32(data: number) {
      view.setUint32(pos, data, true);
      pos += 4;
    }
  }

  public exportProjectJson(): string {
    const projectData = {
      version: '1.0',
      bpm: this.bpm,
      totalSteps: this.totalSteps,
      loopStart: this.loopStart,
      loopEnd: this.loopEnd,
      tracks: this.tracks.map(t => ({
        ...t,
        audioBuffer: undefined // Exclude binary buffer from JSON
      }))
    };
    return JSON.stringify(projectData, null, 2);
  }

  public importProjectJson(jsonStr: string): boolean {
    try {
      const data = JSON.parse(jsonStr);
      if (!data.tracks || !Array.isArray(data.tracks)) return false;
      this.bpm = data.bpm || 120;
      this.totalSteps = data.totalSteps || 32;
      this.loopStart = data.loopStart || 0;
      this.loopEnd = data.loopEnd || 16;
      this.tracks = data.tracks;
      
      // Re-initialize track audio nodes
      this.trackNodes = {};
      if (this.ctx && this.masterGain) {
        this.tracks.forEach(track => this.setupTrackNodes(track));
      }
      if (this.onStateChangeCallback) this.onStateChangeCallback();
      return true;
    } catch (e) {
      console.error('Failed to import project JSON:', e);
      return false;
    }
  }
}
export default AudioEngine;
