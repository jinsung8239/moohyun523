/**
 * AntiGravity DAW - MIDI Engine
 * Professional MIDI processing and sequencing module
 * 
 * Features:
 * - Piano roll note editing
 * - MIDI quantization
 * - MIDI file import/export
 * - Velocity and duration control
 */

export interface MidiNote {
  pitch: number;      // MIDI note number (0-127)
  velocity: number;   // 0-127
  startStep: number;  // Start position in steps
  duration: number;   // Duration in steps
}

export interface MidiTrack {
  id: string;
  name: string;
  channel: number;    // 0-15
  notes: MidiNote[];
  isDrumTrack: boolean;
}

export interface MidiConfig {
  ticksPerBeat: number;
  tempo: number;      // BPM
  timeSignature: [number, number];
}

export class MidiEngine {
  private static instance: MidiEngine;
  
  public tracks: MidiTrack[] = [];
  public config: MidiConfig = {
    ticksPerBeat: 480,
    tempo: 120,
    timeSignature: [4, 4]
  };
  
  private selectedNotes: Set<string> = new Set();
  private clipboard: MidiNote[] = [];

  private constructor() {}

  public static getInstance(): MidiEngine {
    if (!MidiEngine.instance) {
      MidiEngine.instance = new MidiEngine();
    }
    return MidiEngine.instance;
  }

  /**
   * Create a new MIDI track
   */
  public createTrack(name: string, isDrumTrack: boolean = false): MidiTrack {
    const track: MidiTrack = {
      id: `midi-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      channel: this.tracks.length % 16,
      notes: [],
      isDrumTrack
    };
    
    this.tracks.push(track);
    return track;
  }

  /**
   * Add a note to a track
   */
  public addNote(trackId: string, pitch: number, startStep: number, duration: number, velocity: number = 100): MidiNote {
    const track = this.tracks.find(t => t.id === trackId);
    if (!track) throw new Error(`Track ${trackId} not found`);
    
    const note: MidiNote = {
      pitch,
      velocity,
      startStep,
      duration
    };
    
    track.notes.push(note);
    this.sortNotes(track);
    return note;
  }

  /**
   * Remove a note from a track
   */
  public removeNote(trackId: string, noteIndex: number): void {
    const track = this.tracks.find(t => t.id === trackId);
    if (!track) return;
    
    track.notes.splice(noteIndex, 1);
  }

  /**
   * Update note properties
   */
  public updateNote(trackId: string, noteIndex: number, updates: Partial<MidiNote>): void {
    const track = this.tracks.find(t => t.id === trackId);
    if (!track || !track.notes[noteIndex]) return;
    
    Object.assign(track.notes[noteIndex], updates);
    this.sortNotes(track);
  }

  /**
   * Sort notes by start position
   */
  private sortNotes(track: MidiTrack): void {
    track.notes.sort((a, b) => a.startStep - b.startStep);
  }

  /**
   * Quantize notes to grid
   */
  public quantizeNotes(trackId: string, gridSize: number = 1): void {
    const track = this.tracks.find(t => t.id === trackId);
    if (!track) return;
    
    track.notes.forEach(note => {
      note.startStep = Math.round(note.startStep / gridSize) * gridSize;
      note.duration = Math.max(gridSize, Math.round(note.duration / gridSize) * gridSize);
    });
    
    this.sortNotes(track);
  }

  /**
   * Get notes within a step range
   */
  public getNotesInRange(trackId: string, startStep: number, endStep: number): MidiNote[] {
    const track = this.tracks.find(t => t.id === trackId);
    if (!track) return [];
    
    return track.notes.filter(note => 
      note.startStep >= startStep && note.startStep < endStep
    );
  }

  /**
   * Select/deselect notes
   */
  public selectNote(trackId: string, noteIndex: number, selected: boolean): void {
    const key = `${trackId}-${noteIndex}`;
    if (selected) {
      this.selectedNotes.add(key);
    } else {
      this.selectedNotes.delete(key);
    }
  }

  /**
   * Clear all selections
   */
  public clearSelection(): void {
    this.selectedNotes.clear();
  }

  /**
   * Copy selected notes to clipboard
   */
  public copySelectedNotes(): void {
    this.clipboard = [];
    
    this.tracks.forEach(track => {
      track.notes.forEach((note, index) => {
        const key = `${track.id}-${index}`;
        if (this.selectedNotes.has(key)) {
          this.clipboard.push({ ...note });
        }
      });
    });
  }

  /**
   * Paste notes from clipboard
   */
  public pasteNotes(trackId: string, offsetStep: number = 0): void {
    const track = this.tracks.find(t => t.id === trackId);
    if (!track) return;
    
    this.clipboard.forEach(note => {
      track.notes.push({
        ...note,
        startStep: note.startStep + offsetStep
      });
    });
    
    this.sortNotes(track);
  }

  /**
   * Delete selected notes
   */
  public deleteSelectedNotes(): void {
    this.tracks.forEach(track => {
      track.notes = track.notes.filter((_note, index) => {
        const key = `${track.id}-${index}`;
        return !this.selectedNotes.has(key);
      });
    });
    
    this.clearSelection();
  }

  /**
   * Export to Standard MIDI File format
   */
  public exportToMidiFile(bpm: number = 120): Uint8Array {
    const ticksPerBeat = this.config.ticksPerBeat;
    const ticksPerStep = ticksPerBeat / 4; // 16th notes
    
    // Build MIDI data
    const midiData: number[] = [];
    
    // Header chunk "MThd"
    midiData.push(0x4D, 0x54, 0x68, 0x64); // MThd
    midiData.push(0x00, 0x00, 0x00, 0x06); // Header length
    midiData.push(0x00, 0x01); // Format 1 (multiple tracks)
    midiData.push(0x00, this.tracks.length + 1); // Number of tracks
    midiData.push((ticksPerBeat >> 8) & 0xFF, ticksPerBeat & 0xFF); // Ticks per beat
    
    // Tempo meta event track
    midiData.push(0x4D, 0x54, 0x72, 0x6B); // MTrk
    const tempoTrackLength = 8;
    midiData.push(0x00, 0x00, 0x00, tempoTrackLength);
    midiData.push(0x00, 0xFF, 0x51, 0x03); // Tempo meta event
    const microsecondsPerBeat = Math.floor(60000000 / bpm);
    midiData.push(
      (microsecondsPerBeat >> 16) & 0xFF,
      (microsecondsPerBeat >> 8) & 0xFF,
      microsecondsPerBeat & 0xFF
    );
    midiData.push(0x00, 0xFF, 0x2F, 0x00); // End of track
    
    // Note tracks
    this.tracks.forEach((track) => {
      const events: { time: number; data: number[] }[] = [];
      
      // Note on/off events
      track.notes.forEach(note => {
        const startTime = note.startStep * ticksPerStep;
        const endTime = startTime + note.duration * ticksPerStep;
        
        events.push({
          time: startTime,
          data: [0x90 | track.channel, note.pitch, note.velocity] // Note on
        });
        
        events.push({
          time: endTime,
          data: [0x80 | track.channel, note.pitch, 0] // Note off
        });
      });
      
      // Sort events by time
      events.sort((a, b) => a.time - b.time);
      
      // Build track data with delta times
      const trackData: number[] = [];
      let currentTime = 0;
      
      events.forEach(event => {
        const deltaTime = event.time - currentTime;
        trackData.push(...this.encodeVariableLength(deltaTime));
        trackData.push(...event.data);
        currentTime = event.time;
      });
      
      // End of track
      trackData.push(0x00, 0xFF, 0x2F, 0x00);
      
      // Write track chunk
      midiData.push(0x4D, 0x54, 0x72, 0x6B); // MTrk
      midiData.push(...this.encodeVariableLength(trackData.length));
      midiData.push(...trackData);
    });
    
    return new Uint8Array(midiData);
  }

  /**
   * Encode variable-length quantity for MIDI
   */
  private encodeVariableLength(value: number): number[] {
    const result: number[] = [];
    let v = value;
    
    do {
      let byte = v & 0x7F;
      v >>= 7;
      if (result.length > 0) {
        byte |= 0x80;
      }
      result.unshift(byte);
    } while (v > 0);
    
    return result;
  }

  /**
   * Import from MIDI file
   */
  public importFromMidiFile(data: Uint8Array): boolean {
    try {
      // Parse MIDI file header
      if (data[0] !== 0x4D || data[1] !== 0x54 || data[2] !== 0x68 || data[3] !== 0x64) {
        console.error('Invalid MIDI file: missing MThd header');
        return false;
      }
      
      const headerLength = (data[4] << 24) | (data[5] << 16) | (data[6] << 8) | data[7];
      const format = (data[8] << 8) | data[9];
      const numTracks = (data[10] << 8) | data[11];
      const ticksPerBeat = (data[12] << 8) | data[13];
      
      console.log(`MIDI Import: Format ${format}, ${numTracks} tracks, ${ticksPerBeat} ticks/beat`);
      
      // Parse tracks
      let offset = 8 + headerLength;
      
      for (let i = 0; i < numTracks; i++) {
        if (offset + 8 > data.length) break;
        
        // Read track header
        if (data[offset] !== 0x4D || data[offset + 1] !== 0x54 || 
            data[offset + 2] !== 0x72 || data[offset + 3] !== 0x6B) {
          console.error('Invalid track header');
          break;
        }
        
        const trackLength = (data[offset + 4] << 24) | (data[offset + 5] << 16) | 
                           (data[offset + 6] << 8) | data[offset + 7];
        offset += 8;
        
        // Create track
        const track = this.createTrack(`Imported Track ${i + 1}`);
        
        // Parse track events
        const trackEnd = offset + trackLength;
        let currentTime = 0;
        const activeNotes: Map<number, { start: number; velocity: number }> = new Map();
        
        while (offset < trackEnd) {
          // Read delta time
          let deltaTime = 0;
          let byte: number;
          do {
            byte = data[offset++];
            deltaTime = (deltaTime << 7) | (byte & 0x7F);
          } while (byte & 0x80);
          
          currentTime += deltaTime;
          
          if (offset >= trackEnd) break;
          
          // Read event
          const status = data[offset++];
          
          if (status === 0xFF) {
            // Meta event
            const type = data[offset++];
            let length = 0;
            do {
              byte = data[offset++];
              length = (length << 7) | (byte & 0x7F);
            } while (byte & 0x80 && offset < trackEnd);
            
            offset += length;
            
            if (type === 0x2F) {
              // End of track
              break;
            }
          } else if ((status & 0xF0) === 0x90) {
            // Note on
            const pitch = data[offset++];
            const velocity = data[offset++];
            
            if (velocity > 0) {
              activeNotes.set(pitch, { start: currentTime, velocity });
            } else {
              // Note on with velocity 0 = note off
              const noteInfo = activeNotes.get(pitch);
              if (noteInfo) {
                const step = noteInfo.start / (ticksPerBeat / 4);
                const duration = (currentTime - noteInfo.start) / (ticksPerBeat / 4);
                this.addNote(track.id, pitch, step, Math.max(1, duration), noteInfo.velocity);
                activeNotes.delete(pitch);
              }
            }
          } else if ((status & 0xF0) === 0x80) {
            // Note off
            const pitch = data[offset++];
            offset++; // Skip velocity
            
            const noteInfo = activeNotes.get(pitch);
            if (noteInfo) {
              const step = noteInfo.start / (ticksPerBeat / 4);
              const duration = (currentTime - noteInfo.start) / (ticksPerBeat / 4);
              this.addNote(track.id, pitch, step, Math.max(1, duration), noteInfo.velocity);
              activeNotes.delete(pitch);
            }
          } else if (status & 0x80) {
            // Channel message with running status
            offset += 2;
          }
        }
        
        offset = trackEnd;
      }
      
      return true;
    } catch (e) {
      console.error('Failed to import MIDI file:', e);
      return false;
    }
  }

  /**
   * Download MIDI file
   */
  public downloadMidiFile(filename: string, bpm: number = 120): void {
    const midiData = this.exportToMidiFile(bpm);
    // Convert Uint8Array to proper ArrayBuffer for Blob compatibility
    const arrayBuffer = midiData.buffer.slice(
      midiData.byteOffset,
      midiData.byteOffset + midiData.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Clear all tracks
   */
  public clearAll(): void {
    this.tracks = [];
    this.clearSelection();
    this.clipboard = [];
  }
}

// Export singleton instance
export const getMidiEngine = (): MidiEngine => MidiEngine.getInstance();
