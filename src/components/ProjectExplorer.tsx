import React, { useState } from 'react';
import { 
  Music, 
  Sliders, 
  Disc, 
  Folder, 
  FolderOpen, 
  FileCode, 
  Search, 
  ChevronRight, 
  ChevronDown 
} from 'lucide-react';

interface ProjectExplorerProps {
  onSelectInstrument?: (name: string) => void;
}

export const ProjectExplorer: React.FC<ProjectExplorerProps> = ({ onSelectInstrument }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<{ [key: string]: boolean }>({
    'my-files': true,
    'components': true,
  });
  const [selectedNode, setSelectedNode] = useState<string>('instrument-3');

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  const handleNodeClick = (nodeId: string, name: string, isFolder: boolean) => {
    setSelectedNode(nodeId);
    if (!isFolder && onSelectInstrument) {
      onSelectInstrument(name);
    }
  };

  const isExpanded = (nodeId: string) => !!expandedNodes[nodeId];
  const isSelected = (nodeId: string) => selectedNode === nodeId;

  return (
    <div className="project-explorer">
      <div className="explorer-header">
        Project Explorer/Library
      </div>
      
      <div className="explorer-categories">
        <div className="category-item active">
          <Music size={14} className="category-icon" />
          <span>Sounds</span>
          <ChevronRight size={12} className="chevron-end" />
        </div>
        <div className="category-item">
          <Disc size={14} className="category-icon" />
          <span>Instruments</span>
          <ChevronRight size={12} className="chevron-end" />
        </div>
        <div className="category-item">
          <Sliders size={14} className="category-icon" />
          <span>Audio Effects</span>
          <ChevronRight size={12} className="chevron-end" />
        </div>
      </div>

      <div className="explorer-search-wrapper">
        <Search size={12} className="search-icon" />
        <input 
          type="text" 
          placeholder="Search" 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="explorer-search-input"
        />
      </div>

      <div className="explorer-tree">
        {/* My Files Root */}
        <div className="tree-node">
          <div 
            className={`tree-row ${isSelected('my-files') ? 'selected' : ''}`}
            onClick={() => toggleNode('my-files')}
          >
            {isExpanded('my-files') ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <FolderOpen size={14} className="folder-icon" />
            <span>My Files</span>
          </div>

          {isExpanded('my-files') && (
            <div className="tree-children">
              
              <div className="tree-row" onClick={() => handleNodeClick('audio-1', 'Audio', true)}>
                <ChevronRight size={12} className="opacity-none" />
                <Folder size={14} className="folder-icon" />
                <span>Audio</span>
              </div>

              <div className="tree-row" onClick={() => handleNodeClick('rewirdos', 'Rewirdos', true)}>
                <ChevronRight size={12} className="opacity-none" />
                <Folder size={14} className="folder-icon" />
                <span>Rewirdos</span>
              </div>

              <div className="tree-row" onClick={() => handleNodeClick('audio-2', 'Audio', true)}>
                <ChevronRight size={12} className="opacity-none" />
                <Folder size={14} className="folder-icon" />
                <span>Audio</span>
              </div>

              {/* Components Folder */}
              <div className="tree-node">
                <div 
                  className={`tree-row ${isSelected('components') ? 'selected' : ''}`}
                  onClick={() => toggleNode('components')}
                >
                  {isExpanded('components') ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <FolderOpen size={14} className="folder-icon" />
                  <span>Components</span>
                </div>

                {isExpanded('components') && (
                  <div className="tree-children">
                    <div 
                      className={`tree-row leaf-node ${isSelected('instrument-1') ? 'selected' : ''}`}
                      onClick={() => handleNodeClick('instrument-1', 'Instrument 1', false)}
                    >
                      <span className="indent-placeholder"></span>
                      <Music size={12} className="leaf-icon" />
                      <span>Instrument 1</span>
                    </div>
                    <div 
                      className={`tree-row leaf-node ${isSelected('instrument-2') ? 'selected' : ''}`}
                      onClick={() => handleNodeClick('instrument-2', 'Instrument 2', false)}
                    >
                      <span className="indent-placeholder"></span>
                      <Music size={12} className="leaf-icon" />
                      <span>Instrument 2</span>
                    </div>
                    <div 
                      className={`tree-row leaf-node ${isSelected('instrument-3') ? 'selected' : ''}`}
                      onClick={() => handleNodeClick('instrument-3', 'Instrument 3', false)}
                    >
                      <span className="indent-placeholder"></span>
                      <Music size={12} className="leaf-icon" />
                      <span>Instrument 3</span>
                    </div>
                    <div 
                      className={`tree-row leaf-node ${isSelected('instrument-4') ? 'selected' : ''}`}
                      onClick={() => handleNodeClick('instrument-4', 'Instrument 4', false)}
                    >
                      <span className="indent-placeholder"></span>
                      <Music size={12} className="leaf-icon" />
                      <span>Instrument 4</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="tree-row" onClick={() => handleNodeClick('fratches', 'Fratches', true)}>
                <ChevronRight size={12} className="opacity-none" />
                <Folder size={14} className="folder-icon" />
                <span>Fratches</span>
              </div>

              <div className="tree-row" onClick={() => handleNodeClick('music', 'Music', true)}>
                <ChevronRight size={12} className="opacity-none" />
                <Folder size={14} className="folder-icon" />
                <span>Music</span>
              </div>

              <div className="tree-row" onClick={() => handleNodeClick('video', 'Video', true)}>
                <ChevronRight size={12} className="opacity-none" />
                <Folder size={14} className="folder-icon" />
                <span>Video</span>
              </div>

              <div 
                className={`tree-row leaf-node ${isSelected('relatees-php') ? 'selected' : ''}`}
                onClick={() => handleNodeClick('relatees-php', 'Relatees.php', false)}
              >
                <ChevronRight size={12} className="opacity-none" />
                <FileCode size={13} className="leaf-icon-file" />
                <span>Relatees.php</span>
              </div>

            </div>
          )}
        </div>

        {/* Second My Files Node */}
        <div className="tree-row" onClick={() => toggleNode('my-files-2')}>
          <ChevronRight size={12} />
          <Folder size={14} className="folder-icon" />
          <span>My Files</span>
        </div>
      </div>
    </div>
  );
};
