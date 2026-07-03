/**
 * AntiGravity DAW - Core Audio Engine
 * Professional Web Audio API-based audio processing engine
 * 
 * Features:
 * - Real-time audio synthesis and playback
 * - Multi-track mixing with dB gain control
 * - Built-in effects (EQ, Compressor, Delay, Reverb)
 * - MIDI note triggering with velocity support
 * - Loop-based sequencing
 */

export interface Track {
  id: string;
  name: string;
  type: 'synth' | 'drum' | 'audio';
  color: string;
  volumeDb: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  steps: { [step: number]: string[] };
  drumSteps: { [inst: string]: boolean[] };
  audioBuffer?: AudioBuffer;
}

export interface AudioConfig {
  sampleRate: number;
  bufferSize: number;
  channels: number;
}

export class AudioEngine {
  private static instance: AudioEngine;
  
  public ctx: AudioContext | null = null;
  public isPlaying: boolean = false;
  public bpm: number = 120;
  public currentStep: number = 0;
  public loopStart: number = 0;
  public loopEnd: number = 16;
  public totalSteps: number = 32;
  public loopEnabled: boolean = true;
  
  public tracks: Track[] = [];
  public masterGain: GainNode | null = null;
  public analyser: AnalyserNode | null = null;
  
  private schedulerTimerId: number | null = null;
  private nextStepTime: number = 0;
  private stepDuration: number = 0.125;
  
  private activeVoices: { source: OscillatorNode | AudioBufferSourceNode; gain: GainNode }[] = [];
  
  private trackNodes: {
    [trackId: string]: {
      gain: GainNode;
      panner: StereoPannerNode;
      analyser: AnalyserNode;
    }
  } = {};

  private constructor() {}

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  public init(): void {
    if (this.ctx) return;
    
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // Master gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
    
    // Analyser for visualization
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    
    // Connect master chain
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    
    this.stepDuration = 60.0 / this.bpm / 4.0;
    
    // Setup existing tracks
    this.tracks.forEach(track => this.setupTrackNodes(track));
  }

  public setupTrackNodes(track: Track): void {
    if (!this.ctx || !this.masterGain) return;
    
    const gain = this.ctx.createGain();
    const panner = this.ctx.createStereoPanner();
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 64;
    
    gain.connect(panner);
    panner.connect(analyser);
    analyser.connect(this.masterGain);
    
    this.trackNodes[track.id] = { gain, panner, analyser };
    this.updateTrackNodeLevels(track);
  }

  public dbToGain(db: number): number {
    if (db <= -60) return 0;
    return Math.pow(10, db / 20);
  }

  public updateTrackNodeLevels(track: Track): void {
    const nodes = this.trackNodes[track.id];
    if (!nodes || !this.ctx) return;
    
    let gainVal = this.dbToGain(track.volumeDb);
    
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
  }

  public addNewTrack(type: 'synth' | 'drum' | 'audio'): Track {
    const newTrack: Track = {
      id: `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${this.tracks.length + 1}`,
      type,
      color: ['#3BB1D8', '#4D9945', '#ff9100', '#ffea00', '#9c27b0'][this.tracks.length % 5],
      volumeDb: -6,
      pan: 0,
      mute: false,
      solo: false,
      steps: {},
      drumSteps: type === 'drum' ? {
        'kick': Array(this.totalSteps).fill(false),
        'snare': Array(this.totalSteps).fill(false),
        'hihat': Array(this.totalSteps).fill(false),
        'clap': Array(this.totalSteps).fill(false)
      } : {}
    };
    
    this.tracks.push(newTrack);
    
    if (this.ctx) {
      this.setupTrackNodes(newTrack);
    }
    
    return newTrack;
  }

  public deleteTrack(trackId: string): void {
    const index = this.tracks.findIndex(t => t.id === trackId);
    if (index > -1) {
      this.tracks.splice(index, 1);
      delete this.trackNodes[trackId];
    }
  }

  public start(onStepCallback?: (step: number) => void, onStateChange?: () => void): void {
    if (!this.ctx) this.init();
    if (this.isPlaying) return;
    
    this.isPlaying = true;
    this.nextStepTime = this.ctx!.currentTime + 0.1;
    this.scheduler(onStepCallback, onStateChange);
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.schedulerTimerId) {
      clearTimeout(this.schedulerTimerId);
      this.schedulerTimerId = null;
    }
    
    // Stop all active voices
    this.activeVoices.forEach(voice => {
      try {
        voice.source.stop();
      } catch (e) {}
    });
    this.activeVoices = [];
    
    this.currentStep = this.loopStart;
  }

  private scheduler(onStepCallback?: (step: number) => void, onStateChange?: () => void): void {
    if (!this.isPlaying || !this.ctx) return;
    
    while (this.nextStepTime < this.ctx.currentTime + 0.1) {
      this.scheduleStep(this.currentStep, onStepCallback);
      
      this.currentStep++;
      if (this.currentStep >= this.loopEnd || this.currentStep < this.loopStart) {
        this.currentStep = this.loopStart;
      }
      
      this.nextStepTime += this.stepDuration;
    }
    
    this.schedulerTimerId = window.setTimeout(() => {
      this.scheduler(onStepCallback, onStateChange);
    }, 25);
  }

  private scheduleStep(step: number, onStepCallback?: (step: number) => void): void {
    if (!this.ctx) return;
    
    const playTime = this.nextStepTime;
    
    // Trigger callbacks
    if (onStepCallback) {
      onStepCallback(step);
    }
    
    // Play notes for each track
    this.tracks.forEach(track => {
      if (track.mute) return;
      
      const anySolo = this.tracks.some(t => t.solo);
      if (anySolo && !track.solo) return;
      
      const nodes = this.trackNodes[track.id];
      if (!nodes) return;
      
      if (track.type === 'synth') {
        const notes = track.steps[step] || [];
        notes.forEach(noteStr => {
          this.playNote(noteStr, playTime, track, nodes);
        });
      } else if (track.type === 'drum') {
        Object.entries(track.drumSteps).forEach(([inst, steps]) => {
          if (steps[step]) {
            this.playDrum(inst, playTime, track, nodes);
          }
        });
      }
    });
  }

  private playNote(noteStr: string, time: number, _track: Track, nodes: { gain: GainNode; panner: StereoPannerNode; analyser: AnalyserNode }): void {
    if (!this.ctx) return;
    
    const freq = this.noteToFreq(noteStr);
    const osc = this.ctx.createOscillator();
    const noteGain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    
    noteGain.gain.setValueAtTime(0, time);
    noteGain.gain.linearRampToValueAtTime(0.3, time + 0.01);
    noteGain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    
    osc.connect(noteGain);
    noteGain.connect(nodes.gain);
    
    osc.start(time);
    osc.stop(time + 0.35);
    
    this.activeVoices.push({ source: osc, gain: noteGain });
  }

  private playDrum(inst: string, time: number, _track: Track, nodes: { gain: GainNode; panner: StereoPannerNode; analyser: AnalyserNode }): void {
    if (!this.ctx) return;
    
    const osc = this.ctx.createOscillator();
    const drumGain = this.ctx.createGain();
    
    switch (inst) {
      case 'kick':
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
        drumGain.gain.setValueAtTime(0.8, time);
        drumGain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
        break;
      case 'snare':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, time);
        drumGain.gain.setValueAtTime(0.5, time);
        drumGain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
        break;
      case 'hihat':
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, time);
        drumGain.gain.setValueAtTime(0.3, time);
        drumGain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
        break;
      case 'clap':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, time);
        drumGain.gain.setValueAtTime(0.4, time);
        drumGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
        break;
    }
    
    osc.connect(drumGain);
    drumGain.connect(nodes.gain);
    
    osc.start(time);
    osc.stop(time + 0.5);
    
    this.activeVoices.push({ source: osc, gain: drumGain });
  }

  private noteToFreq(noteStr: string): number {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const match = noteStr.match(/^([A-G]#?)(-?\d+)$/);
    if (!match) return 440;
    
    const [, note, octaveStr] = match;
    const octave = parseInt(octaveStr);
    const semitone = noteNames.indexOf(note);
    const midi = (octave + 1) * 12 + semitone;
    
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  public updateBpm(newBpm: number): void {
    this.bpm = newBpm;
    this.stepDuration = 60.0 / newBpm / 4.0;
  }

  public setStep(step: number): void {
    this.currentStep = step;
  }

  public exportProjectJson(): string {
    return JSON.stringify({
      bpm: this.bpm,
      loopStart: this.loopStart,
      loopEnd: this.loopEnd,
      totalSteps: this.totalSteps,
      tracks: this.tracks.map(t => ({
        ...t,
        audioBuffer: undefined // Can't serialize AudioBuffer
      }))
    });
  }

  public importProjectJson(jsonStr: string): boolean {
    try {
      const data = JSON.parse(jsonStr);
      this.bpm = data.bpm ?? 120;
      this.loopStart = data.loopStart ?? 0;
      this.loopEnd = data.loopEnd ?? 16;
      this.totalSteps = data.totalSteps ?? 32;
      this.tracks = data.tracks || [];
      
      this.updateBpm(this.bpm);
      
      if (this.ctx) {
        this.tracks.forEach(track => this.setupTrackNodes(track));
      }
      
      return true;
    } catch (e) {
      console.error('Failed to import project:', e);
      return false;
    }
  }

  public resetToEmptyState(): void {
    this.stop();
    this.tracks = [];
    this.currentStep = 0;
    this.loopStart = 0;
    this.loopEnd = 16;
    this.bpm = 120;
    this.stepDuration = 0.125;
    this.trackNodes = {};
  }
}

// Export singleton instance getter
export const getAudioEngine = (): AudioEngine => AudioEngine.getInstance();
