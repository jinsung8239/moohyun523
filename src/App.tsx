import { useState, useEffect, useRef } from 'react';
import { AudioEngine, type Track } from './audio/AudioEngine';
import { Navbar } from './components/Navbar';
import { TrackList } from './components/TrackList';
import { Inspector } from './components/Inspector';
import { Arranger } from './components/Arranger';
import { Mixer } from './components/Mixer';
import { PianoRoll } from './components/PianoRoll';
import { DrumPad } from './components/DrumPad';
import { Visualizer } from './components/Visualizer';
import { LiveLoops } from './components/LiveLoops';
import { ScratchPad } from './components/ScratchPad';
import { ActionManagerModal } from './components/ActionManagerModal';
import { RoutingMatrix } from './components/RoutingMatrix';
import { AutomationEditor } from './components/AutomationEditor';
import { ArrangementEditor } from './components/ArrangementEditor';
import { HelpCircle, Keyboard, Sliders, Maximize2, Minimize2 } from 'lucide-react';
import { exportTracksToMidi } from './audio/MidiExporter';

const copyTracks = (tracksList: Track[]): Track[] => {
  return tracksList.map(t => ({
    ...t,
    steps: JSON.parse(JSON.stringify(t.steps)),
    drumSteps: JSON.parse(JSON.stringify(t.drumSteps)),
    audioBuffer: t.audioBuffer
  }));
};

const shallowCopyTracks = (tracksList: Track[]): Track[] => {
  return tracksList.map(t => ({
    ...t
  }));
};

interface Collaborator {
  id: string;
  name: string;
  color: string;
  step: number;
  trackId: string;
}

function App() {
  const engine = AudioEngine.getInstance();
  
  const [isPlaying, setIsPlaying] = useState(engine.isPlaying);
  const [bpm, setBpm] = useState(engine.bpm);
  const [currentStep, setCurrentStep] = useState(0);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  
  const [loopStart, setLoopStart] = useState(engine.loopStart);
  const [loopEnd, setLoopEnd] = useState(engine.loopEnd);
  const [loopEnabled, setLoopEnabled] = useState(engine.loopEnabled);
  const [totalSteps, setTotalSteps] = useState(32); // Default project length in steps (32 steps = 2 bars)
  
  // Layout toggles & Workspace Tabs
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [lowerPanelOpen, setLowerPanelOpen] = useState(true);
  const [lowerPanelMaximized, setLowerPanelMaximized] = useState(false);
  const [activeTab, setActiveTab] = useState<'mixer' | 'pianoroll' | 'drumpad' | 'automation' | 'arrangement'>('mixer');
  const [mainTab, setMainTab] = useState<'arranger' | 'liveLoops' | 'scratchPad'>('arranger');

  // Modals
  const [isActionManagerOpen, setIsActionManagerOpen] = useState(false);
  const [isRoutingMatrixOpen, setIsRoutingMatrixOpen] = useState(false);
  
  // History Stack
  const undoStack = useRef<Track[][]>([]);
  const redoStack = useRef<Track[][]>([]);
  
  const [isAudioRunning, setIsAudioRunning] = useState(false);
  const [isExportingWav, setIsExportingWav] = useState(false);

  // Auto-Save Interval (30 Seconds)
  useEffect(() => {
    const autoSaveTimer = setInterval(() => {
      if (engine.tracks.length > 0) {
        localStorage.setItem('antigravity_daw_autosave', engine.exportProjectJson());
      }
    }, 30000);
    return () => clearInterval(autoSaveTimer);
  }, []);

  const handleExportJson = () => {
    const jsonStr = engine.exportProjectJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `antigravity-project-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          const success = engine.importProjectJson(content);
          if (success) {
            setTracks(copyTracks(engine.tracks));
            setBpm(engine.bpm);
            setTotalSteps(engine.totalSteps);
            setLoopStart(engine.loopStart);
            setLoopEnd(engine.loopEnd);
            if (engine.tracks.length > 0) setSelectedTrackId(engine.tracks[0].id);
          }
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Mock Collaborators Telemetry
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);

  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleFullscreenToggle = () => {
    if (isFullscreen) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    } else {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn(`HTML5 Fullscreen blocked or unsupported: ${err.message}`);
      });
      setIsFullscreen(true);
    }
  };

  useEffect(() => {
    engine.resetToEmptyState();
    setTracks([]);

    // Initialize mock collaborators once tracks are available
    const collabInterval = setInterval(() => {
      if (engine.tracks.length > 0) {
        setCollaborators([
          {
            id: 'collab-1',
            name: 'Min-ji 👤',
            color: '#EC4899', // Pink
            step: Math.floor(Math.random() * engine.totalSteps),
            trackId: engine.tracks[0].id
          },
          {
            id: 'collab-2',
            name: 'Ji-hoon 👤',
            color: '#8B5CF6', // Violet
            step: Math.floor(Math.random() * engine.totalSteps),
            trackId: engine.tracks[1]?.id || engine.tracks[0].id
          }
        ]);
      } else {
        setCollaborators([]);
      }
    }, 2500);

    return () => clearInterval(collabInterval);
  }, []);

  // Sync totalSteps to engine
  useEffect(() => {
    engine.totalSteps = totalSteps;
  }, [totalSteps]);

  // Synchronize active editor tab with selected track type
  useEffect(() => {
    if (selectedTrackId) {
      const track = engine.tracks.find(t => t.id === selectedTrackId);
      if (track) {
        if (track.type === 'synth') {
          setActiveTab('pianoroll');
        } else if (track.type === 'drum') {
          setActiveTab('drumpad');
        } else {
          setActiveTab('mixer');
        }
      }
    }
  }, [selectedTrackId]);


  const pushHistory = (currentTracksState: Track[]) => {
    undoStack.current.push(copyTracks(currentTracksState));
    redoStack.current = [];
  };

  const handleUndo = () => {
    if (undoStack.current.length === 0) return;
    const previousState = undoStack.current.pop()!;
    redoStack.current.push(copyTracks(engine.tracks));
    
    engine.tracks = copyTracks(previousState);
    engine.tracks.forEach(t => engine.updateTrackNodeLevels(t));
    setTracks(copyTracks(engine.tracks));
  };

  const handleRedo = () => {
    if (redoStack.current.length === 0) return;
    const nextState = redoStack.current.pop()!;
    undoStack.current.push(copyTracks(engine.tracks));
    
    engine.tracks = copyTracks(nextState);
    engine.tracks.forEach(t => engine.updateTrackNodeLevels(t));
    setTracks(copyTracks(engine.tracks));
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'SELECT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayToggle();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        handleStop();
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
        e.preventDefault();
        handleRedo();
      } else if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
        e.preventDefault();
        setIsActionManagerOpen(prev => !prev);
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selectedTrackId) {
          const track = engine.tracks.find(t => t.id === selectedTrackId);
          if (track) {
            pushHistory(engine.tracks);
            if (track.type === 'synth') {
              track.steps = {};
            } else if (track.type === 'drum') {
              Object.keys(track.drumSteps).forEach(k => {
                track.drumSteps[k] = Array(engine.totalSteps).fill(false);
              });
            }
            setTracks(copyTracks(engine.tracks));
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, selectedTrackId, isAudioRunning, tracks]);

  const handlePlayToggle = () => {
    if (!isAudioRunning) {
      engine.init();
      setIsAudioRunning(true);
    }

    if (isPlaying) {
      engine.stop();
      setIsPlaying(false);
    } else {
      engine.start(
        (step) => {
          setCurrentStep(step);
          // Sync tracks from engine to update animated faders/knobs during automation
          setTracks(shallowCopyTracks(engine.tracks));
        },
        () => {
          setIsPlaying(engine.isPlaying);
          setTracks(shallowCopyTracks(engine.tracks));
        }
      );
    }
  };

  const handleStop = () => {
    engine.stop();
    setIsPlaying(false);
    setCurrentStep(engine.loopStart);
  };

  const handleBpmChange = (newBpm: number) => {
    setBpm(newBpm);
    engine.updateBpm(newBpm);
  };

  const handleAddTrack = (type: 'synth' | 'drum' | 'audio') => {
    pushHistory(engine.tracks);
    const newTrack = engine.addNewTrack(type);
    setTracks(copyTracks(engine.tracks));
    setSelectedTrackId(newTrack.id);
    
    // Auto shift active editor tabs
    if (type === 'synth') setActiveTab('pianoroll');
    if (type === 'drum') setActiveTab('drumpad');
  };

  const handleDeleteTrack = (trackId: string) => {
    pushHistory(engine.tracks);
    engine.deleteTrack(trackId);
    setTracks(copyTracks(engine.tracks));
    // Remove collaborators on the deleted track
    setCollaborators((prev) => prev.filter((c) => c.trackId !== trackId));
    if (selectedTrackId === trackId) {
      const remaining = engine.tracks;
      setSelectedTrackId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const handleTrackChange = (shouldPushHistory = true) => {
    if (shouldPushHistory) {
      pushHistory(engine.tracks);
    }
    engine.tracks = copyTracks(tracks);
    engine.tracks.forEach(t => engine.updateTrackNodeLevels(t));
    setTracks(copyTracks(engine.tracks));
  };

  const handleLoopChange = (start: number, end: number) => {
    engine.loopStart = start;
    engine.loopEnd = end;
    setLoopStart(start);
    setLoopEnd(end);
    
    // Snap playhead inside new loop bounds if it falls outside
    if (engine.currentStep < start || engine.currentStep >= end) {
      engine.currentStep = start;
      setCurrentStep(start);
    } else if (!isPlaying) {
      setCurrentStep(start);
    }
  };

  const handleLoopEnabledToggle = () => {
    const nextVal = !loopEnabled;
    engine.loopEnabled = nextVal;
    setLoopEnabled(nextVal);
  };

  const handleTotalStepsChange = (newSteps: number) => {
    setTotalSteps(newSteps);
    
    // Resize/pad drumSteps for all tracks in engine & React state
    pushHistory(engine.tracks);
    engine.tracks.forEach(track => {
      if (track.type === 'drum') {
        Object.keys(track.drumSteps).forEach(instId => {
          const arr = track.drumSteps[instId] || [];
          if (arr.length < newSteps) {
            const pad = Array(newSteps - arr.length).fill(false);
            track.drumSteps[instId] = [...arr, ...pad];
          } else if (arr.length > newSteps) {
            track.drumSteps[instId] = arr.slice(0, newSteps);
          }
        });
      }
    });
    setTracks(copyTracks(engine.tracks));
    
    let nextStart = loopStart;
    let nextEnd = loopEnd;
    if (nextEnd > newSteps) {
      nextEnd = newSteps;
    }
    if (nextStart >= newSteps) {
      nextStart = newSteps - 1;
    }
    // Auto-extend loop bounds if loopEnd previously matched totalSteps
    if (loopEnd === totalSteps) {
      nextEnd = newSteps;
    }
    handleLoopChange(nextStart, nextEnd);
  };

  const handlePlayheadMove = (step: number) => {
    engine.setStep(step);
    setCurrentStep(step);
  };

  const handleDoubleClickRegion = (track: Track) => {
    setSelectedTrackId(track.id);
    setLowerPanelOpen(true);
    if (track.type === 'synth') {
      setActiveTab('pianoroll');
    } else if (track.type === 'drum') {
      setActiveTab('drumpad');
    } else {
      setActiveTab('mixer'); // default to Mixer Console for audio tracks
    }
  };

  const handleExportWav = async () => {
    engine.init();
    setIsExportingWav(true);
    const stepDuration = 60.0 / bpm / 4.0;
    const duration = (loopEnd - loopStart) * stepDuration;
    try {
      const wavBlob = await engine.exportToWav(duration);
      const url = URL.createObjectURL(wavBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'master_mix.wav';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('WAV export error:', err);
    } finally {
      setIsExportingWav(false);
    }
  };

  const handleExportMidi = () => {
    exportTracksToMidi(engine.tracks, bpm);
  };

  const selectedTrack = tracks.find(t => t.id === selectedTrackId);

  return (
    <div className={`daw-container ${!inspectorOpen ? 'no-inspector' : ''} ${!lowerPanelOpen ? 'no-lower' : ''} ${isFullscreen ? 'pseudo-fullscreen' : ''} ${lowerPanelMaximized ? 'lower-maximized' : ''}`}>
      
      {/* 1. Transport Control Header */}
      <div className="daw-header-container">
        <Navbar
          isPlaying={isPlaying}
          bpm={bpm}
          currentStep={currentStep}
          onPlayToggle={handlePlayToggle}
          onStop={handleStop}
          onBpmChange={handleBpmChange}
          onAddTrack={handleAddTrack}
          onExportWav={handleExportWav}
          onExportMidi={handleExportMidi}
          loopStart={loopStart}
          loopEnd={loopEnd}
          onLoopChange={handleLoopChange}
          isExportingWav={isExportingWav}
          totalSteps={totalSteps}
          onTotalStepsChange={handleTotalStepsChange}
          loopEnabled={loopEnabled}
          onLoopEnabledToggle={handleLoopEnabledToggle}
          isFullscreen={isFullscreen}
          onFullscreenToggle={handleFullscreenToggle}
          activeTab={mainTab}
          onTabChange={setMainTab}
          onOpenActionManager={() => setIsActionManagerOpen(true)}
          onOpenRoutingMatrix={() => setIsRoutingMatrixOpen(true)}
          onExportJson={handleExportJson}
          onImportJson={handleImportJson}
        />
        
        {/* Panel Toggles */}
        <div className="panel-toggles-floating">
          <button
            className={`toggle-icon-btn ${inspectorOpen ? 'active' : ''}`}
            onClick={() => setInspectorOpen(!inspectorOpen)}
            title="Toggle Left Inspector Panel"
          >
            <Sliders size={14} />
          </button>
          <button
            className={`toggle-icon-btn ${lowerPanelOpen ? 'active' : ''}`}
            onClick={() => setLowerPanelOpen(!lowerPanelOpen)}
            title="Toggle Lower Editor Panel"
          >
            <Sliders size={14} className="rotate-90" />
          </button>
        </div>
      </div>

      {/* 2. Left Column: Inspector Panel */}
      <aside className="daw-inspector-container">
        <Inspector track={selectedTrack || null} onTrackChange={handleTrackChange} />
      </aside>

      {/* 3. Right Column: Timeline / Arranger Workspace */}
      <main className="daw-arranger-container">
        {tracks.length === 0 ? (
          <div className="empty-sequencer-state">
            <HelpCircle size={40} className="empty-icon animate-pulse" />
            <h3>Anti-Gravity Logic Pro Web Workspace</h3>
            <p>Add a new track from the top action bar to begin arranging.</p>
            
            <button
              className="shortcut-info-btn"
              onClick={() => setIsActionManagerOpen(true)}
            >
              <Keyboard size={14} /> View Reaper Action Shortcuts (?)
            </button>
          </div>
        ) : mainTab === 'liveLoops' ? (
          <LiveLoops tracks={tracks} onSelectTrack={setSelectedTrackId} />
        ) : mainTab === 'scratchPad' ? (
          <ScratchPad tracks={tracks} onUpdateTracks={handleTrackChange} />
        ) : (
          <div className="arranger-split-view">
            {/* Headers headers list on left */}
            <TrackList
              tracks={tracks}
              selectedTrackId={selectedTrackId}
              onSelectTrack={setSelectedTrackId}
              onDeleteTrack={handleDeleteTrack}
              onTrackChange={handleTrackChange}
            />
            {/* Timeline canvas grid on right */}
            <Arranger
              tracks={tracks}
              selectedTrackId={selectedTrackId}
              currentStep={currentStep}
              onSelectTrack={setSelectedTrackId}
              onDoubleClickRegion={handleDoubleClickRegion}
              onPlayheadMove={handlePlayheadMove}
              collaborators={collaborators}
              bpm={bpm}
              onTrackChange={handleTrackChange}
              totalSteps={totalSteps}
              loopStart={loopStart}
              loopEnd={loopEnd}
              onLoopChange={handleLoopChange}
              onTotalStepsChange={handleTotalStepsChange}
            />
          </div>
        )}
      </main>

      {/* 4. Bottom Left: Visualizer Block */}
      <div className="daw-visualizer-block">
        <div className="visualizer-header">MASTER MONITOR</div>
        <Visualizer isPlaying={isPlaying} />
      </div>

      {/* 5. Bottom Right: Editor / Console Lower Panel */}
      <section className="daw-lower-editor-container">
        {/* Tab Headers */}
        <div className="lower-tabs-bar">
          <button
            className={`lower-tab-btn ${activeTab === 'mixer' ? 'active' : ''}`}
            onClick={() => setActiveTab('mixer')}
          >
            Mixer Console
          </button>
          <button
            className={`lower-tab-btn ${activeTab === 'pianoroll' ? 'active' : ''}`}
            onClick={() => setActiveTab('pianoroll')}
          >
            Piano Roll
          </button>
          <button
            className={`lower-tab-btn ${activeTab === 'drumpad' ? 'active' : ''}`}
            onClick={() => setActiveTab('drumpad')}
          >
            Drum Sequencer
          </button>
          <button
            className={`lower-tab-btn ${activeTab === 'automation' ? 'active' : ''}`}
            onClick={() => setActiveTab('automation')}
          >
            Automation
          </button>
          <button
            className={`lower-tab-btn ${activeTab === 'arrangement' ? 'active' : ''}`}
            onClick={() => setActiveTab('arrangement')}
          >
            Arrangement Markers
          </button>

          {/* Maximize Toggle Button */}
          <button
            className="lower-panel-expand-btn"
            onClick={() => setLowerPanelMaximized(!lowerPanelMaximized)}
            title={lowerPanelMaximized ? "Collapse Editor Panel" : "Maximize Editor Panel"}
          >
            {lowerPanelMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span>{lowerPanelMaximized ? "Restore Layout" : "Maximize Editor"}</span>
          </button>
        </div>

        {/* Tab Views */}
        <div className="lower-tab-content">
          {activeTab === 'mixer' && (
            <Mixer
              tracks={tracks}
              onTrackChange={handleTrackChange}
              isPlaying={isPlaying}
            />
          )}
          {activeTab === 'pianoroll' && (
            <PianoRoll
              track={selectedTrack || null}
              tracks={tracks}
              onSelectTrack={setSelectedTrackId}
              currentStep={currentStep}
              onUpdateSteps={handleTrackChange}
              onPlayheadMove={handlePlayheadMove}
              totalSteps={totalSteps}
            />
          )}
          {activeTab === 'drumpad' && (
            <DrumPad
              track={selectedTrack || null}
              tracks={tracks}
              onSelectTrack={setSelectedTrackId}
              currentStep={currentStep}
              onUpdateSteps={handleTrackChange}
              onPlayheadMove={handlePlayheadMove}
              totalSteps={totalSteps}
            />
          )}
          {activeTab === 'automation' && (
            <AutomationEditor
              tracks={tracks}
              selectedTrackId={selectedTrackId}
              onSelectTrack={setSelectedTrackId}
              onUpdateSteps={handleTrackChange}
              totalSteps={totalSteps}
            />
          )}
          {activeTab === 'arrangement' && (
            <ArrangementEditor
              tracks={tracks}
              bpm={bpm}
              onBpmChange={handleBpmChange}
              loopStart={loopStart}
              loopEnd={loopEnd}
              onLoopChange={handleLoopChange}
              onExportWav={handleExportWav}
              onExportMidi={handleExportMidi}
              isExportingWav={isExportingWav}
              totalSteps={totalSteps}
            />
          )}
        </div>
      </section>

      {/* Modals */}
      <ActionManagerModal isOpen={isActionManagerOpen} onClose={() => setIsActionManagerOpen(false)} />
      <RoutingMatrix isOpen={isRoutingMatrixOpen} onClose={() => setIsRoutingMatrixOpen(false)} tracks={tracks} />
    </div>
  );
}

export default App;
