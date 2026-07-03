import { AudioEngine, type Track } from './AudioEngine';

// MIDI pitch map for C3 to B5 chromatic scale
const MIDI_PITCHES: { [note: string]: number } = {
  'C3': 48, 'C#3': 49, 'D3': 50, 'D#3': 51, 'E3': 52, 'F3': 53, 'F#3': 54, 'G3': 55, 'G#3': 56, 'A3': 57, 'A#3': 58, 'B3': 59,
  'C4': 60, 'C#4': 61, 'D4': 62, 'D#4': 63, 'E4': 64, 'F4': 65, 'F#4': 66, 'G4': 67, 'G#4': 68, 'A4': 69, 'A#4': 70, 'B4': 71,
  'C5': 72, 'C#5': 73, 'D5': 74, 'D#5': 75, 'E5': 76, 'F5': 77, 'F#5': 78, 'G5': 79, 'G#5': 80, 'A5': 81, 'A#5': 82, 'B5': 83,
};

// Converts standard variable length quantity (VLQ) for MIDI
function toVariableLengthQuantity(val: number): number[] {
  const bytes = [];
  let buffer = val & 0x7f;
  while ((val >>= 7) > 0) {
    buffer <<= 8;
    buffer |= 0x80;
    buffer |= (val & 0x7f);
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) {
      buffer >>= 8;
    } else {
      break;
    }
  }
  return bytes;
}

export function exportTracksToMidi(tracks: Track[], bpm: number) {
  const ticksPerQuarterNote = 96; // Standard division
  const ticksPerStep = ticksPerQuarterNote / 4; // 16th note step = 24 ticks
  
  // Format 1 header
  const headerChunk = [
    0x4d, 0x54, 0x68, 0x64, // "MThd"
    0x00, 0x00, 0x00, 0x06, // Chunk length (6 bytes)
    0x00, 0x01,             // Format 1 (multi-track)
    0x00, 0x02,             // Number of tracks (Track 0: Tempo + Track 1: MIDI Note Track)
    0x00, 0x60              // Division: 96 ticks per quarter note
  ];

  // --- TRACK 0: Tempo track ---
  const track0Events: number[] = [];
  
  // Set tempo event (0xFF 0x51 0x03 microseconds-per-quarter-note)
  // microseconds = 60,000,000 / BPM
  const microSeconds = Math.round(60000000 / bpm);
  const t1 = (microSeconds >> 16) & 0xff;
  const t2 = (microSeconds >> 8) & 0xff;
  const t3 = microSeconds & 0xff;
  
  track0Events.push(0x00); // delta time
  track0Events.push(0xff, 0x51, 0x03, t1, t2, t3);
  
  // End of track event
  track0Events.push(0x00); // delta time
  track0Events.push(0xff, 0x2f, 0x00);
  
  const track0Length = track0Events.length;
  const track0Chunk = [
    0x4d, 0x54, 0x72, 0x6b, // "MTrk"
    (track0Length >> 24) & 0xff,
    (track0Length >> 16) & 0xff,
    (track0Length >> 8) & 0xff,
    track0Length & 0xff,
    ...track0Events
  ];

  // --- TRACK 1: Note track containing all synth notes ---
  const track1Events: number[] = [];
  
  // We collect all notes from synth tracks and build sequence
  // Sort notes by step
  interface MidiNoteEvent {
    tickTime: number;
    type: 'on' | 'off';
    pitch: number;
    channel: number;
  }
  
  const eventsList: MidiNoteEvent[] = [];
  
  tracks.forEach((track, trackIdx) => {
    let channel = trackIdx % 16; // Limit to midi channel bounds
    if (channel === 9) {
      channel = 10; // Avoid standard General MIDI percussion channel 9 for synths
    }
    
    if (track.type === 'synth') {
      const totalSteps = AudioEngine.getInstance().totalSteps;
      for (let step = 0; step < totalSteps; step++) {
        const stepNotes = track.steps[step];
        if (stepNotes && stepNotes.length > 0) {
          stepNotes.forEach(noteObj => {
            const noteName = typeof noteObj === 'string' ? noteObj : noteObj.pitch;
            const noteDuration = typeof noteObj === 'string' ? 1 : (noteObj.duration || 1);
            
            const pitch = MIDI_PITCHES[noteName] || 60;
            const startTick = step * ticksPerStep;
            const durationTicks = ticksPerStep * noteDuration * 0.9; // 90% step duration for crisp gating
            const endTick = startTick + durationTicks;
            
            eventsList.push({ tickTime: startTick, type: 'on', pitch, channel });
            eventsList.push({ tickTime: endTick, type: 'off', pitch, channel });
          });
        }
      }
    } else if (track.type === 'drum') {
      // Convert drum steps to general MIDI percussion pitches (Channel 9 / 10 in MIDI)
      // Channel 9 (index 9) is standard drum channel
      const drumChannel = 9;
      const drumPitches: { [key: string]: number } = {
        kick: 36,  // Bass Drum 1
        snare: 38, // Acoustic Snare
        hihat: 42, // Closed Hi Hat
        clap: 39,  // Hand Clap
      };
      
      Object.entries(track.drumSteps).forEach(([instId, steps]) => {
        const pitch = drumPitches[instId] || 36;
        steps.forEach((active, step) => {
          if (active) {
            const startTick = step * ticksPerStep;
            const durationTicks = ticksPerStep * 0.8;
            const endTick = startTick + durationTicks;
            
            eventsList.push({ tickTime: startTick, type: 'on', pitch, channel: drumChannel });
            eventsList.push({ tickTime: endTick, type: 'off', pitch, channel: drumChannel });
          }
        });
      });
    }
  });

  // Sort events list by tickTime, with 'off' events preceding 'on' events if times are equal
  eventsList.sort((a, b) => {
    if (a.tickTime === b.tickTime) {
      return a.type === 'off' ? -1 : 1;
    }
    return a.tickTime - b.tickTime;
  });

  // Compile MIDI delta events
  let lastTick = 0;
  eventsList.forEach(evt => {
    const delta = evt.tickTime - lastTick;
    lastTick = evt.tickTime;
    
    // Add delta-time
    const deltaBytes = toVariableLengthQuantity(delta);
    track1Events.push(...deltaBytes);
    
    // Add MIDI event
    const status = (evt.type === 'on' ? 0x90 : 0x80) | evt.channel;
    const velocity = 0x64; // Default velocity 100
    track1Events.push(status, evt.pitch, velocity);
  });
  
  // End of Track 1
  track1Events.push(0x00); // delta
  track1Events.push(0xff, 0x2f, 0x00);
  
  const track1Length = track1Events.length;
  const track1Chunk = [
    0x4d, 0x54, 0x72, 0x6b, // "MTrk"
    (track1Length >> 24) & 0xff,
    (track1Length >> 16) & 0xff,
    (track1Length >> 8) & 0xff,
    track1Length & 0xff,
    ...track1Events
  ];
  
  const fullMidiBytes = new Uint8Array([
    ...headerChunk,
    ...track0Chunk,
    ...track1Chunk
  ]);
  
  // Create download link
  const blob = new Blob([fullMidiBytes], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'project_sequence.mid';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
