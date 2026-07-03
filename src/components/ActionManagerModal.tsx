import React, { useState } from 'react';
import { X, Search, Keyboard } from 'lucide-react';

interface ActionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutAction {
  category: string;
  action: string;
  shortcut: string;
}

const DAW_SHORTCUTS: ShortcutAction[] = [
  { category: 'Transport', action: 'Play / Pause Toggle', shortcut: 'Space' },
  { category: 'Transport', action: 'Return Playhead to Start', shortcut: 'Enter / Home' },
  { category: 'Transport', action: 'Toggle Loop Cycle Mode', shortcut: 'C' },
  { category: 'Editing', action: 'Clear Selected Notes / Grid', shortcut: 'Delete / Backspace' },
  { category: 'Editing', action: 'Undo Last Action', shortcut: 'Ctrl + Z' },
  { category: 'Editing', action: 'Redo Action', shortcut: 'Ctrl + Y' },
  { category: 'Tracks', action: 'Mute Selected Track', shortcut: 'M' },
  { category: 'Tracks', action: 'Solo Selected Track', shortcut: 'S' },
  { category: 'Tracks', action: 'Duplicate Selected Track', shortcut: 'Ctrl + D' },
  { category: 'Navigation', action: 'Open Action Shortcut Manager', shortcut: '?' },
  { category: 'Project', action: 'Export WAV Audio Bounce', shortcut: 'Ctrl + E' },
  { category: 'Project', action: 'Save Project Snapshot', shortcut: 'Ctrl + S' }
];

export const ActionManagerModal: React.FC<ActionManagerModalProps> = ({ isOpen, onClose }) => {
  const [searchTerm, setSearchTerm] = useState<string>('');

  if (!isOpen) return null;

  const filteredShortcuts = DAW_SHORTCUTS.filter(s =>
    s.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.shortcut.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        width: '560px',
        maxHeight: '80vh',
        backgroundColor: '#0d111a',
        border: '1px solid rgba(0, 242, 254, 0.3)',
        borderRadius: '12px',
        padding: '20px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Keyboard size={20} style={{ color: '#00f2fe' }} />
            <span style={{ fontWeight: 'bold', fontSize: '15px', color: '#fff', letterSpacing: '0.5px' }}>
              REAPER ACTION SHORTCUTS MANAGER
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#8b9bb4', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '10px', color: '#8b9bb4' }} />
          <input
            type="text"
            placeholder="Search actions or shortcut keys..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              backgroundColor: '#131826',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '13px',
              outline: 'none'
            }}
          />
        </div>

        {/* Shortcut List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
          {filteredShortcuts.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#131826',
                padding: '10px 14px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.04)'
              }}
            >
              <div>
                <span style={{ fontSize: '10px', color: '#00f2fe', fontWeight: 'bold', textTransform: 'uppercase', display: 'block' }}>
                  {item.category}
                </span>
                <span style={{ fontSize: '13px', color: '#fff' }}>{item.action}</span>
              </div>

              <kbd style={{
                backgroundColor: '#1a2336',
                border: '1px solid rgba(0, 242, 254, 0.4)',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '11px',
                color: '#00f2fe',
                fontFamily: 'monospace',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
              }}>
                {item.shortcut}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
