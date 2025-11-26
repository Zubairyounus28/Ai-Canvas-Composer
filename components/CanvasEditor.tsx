import React from 'react';
import { DraggableElement } from './DraggableElement';
import { CanvasDimensions, DesignElement } from '../types';

interface CanvasEditorProps {
  dimensions: CanvasDimensions;
  backgroundImage: string | null;
  elements: DesignElement[];
  onUpdateElement: (id: string, updates: Partial<DesignElement>) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  transparentBackground?: boolean;
}

export const CanvasEditor: React.FC<CanvasEditorProps> = ({
  dimensions,
  backgroundImage,
  elements,
  onUpdateElement,
  selectedId,
  onSelect,
  transparentBackground = false,
}) => {
  return (
    <div className="relative overflow-auto p-8 bg-zinc-900/50 rounded-xl border border-zinc-800 flex justify-center items-center shadow-inner min-h-[500px]">
      <div
        id="canvas-export-target" // Target for potential export
        className="relative shadow-2xl transition-all duration-300 overflow-hidden"
        style={{
          width: dimensions.width,
          height: dimensions.height,
          // In transparentBackground mode, we remove background image and color to ensure transparency
          backgroundImage: !transparentBackground && backgroundImage ? `url(${backgroundImage})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundColor: transparentBackground ? 'transparent' : (backgroundImage ? 'transparent' : '#e5e5e5'),
          boxShadow: transparentBackground ? 'none' : undefined, 
        }}
        onClick={() => onSelect(null)}
      >
        {!backgroundImage && !transparentBackground && (
           <div className="absolute inset-0 flex items-center justify-center text-zinc-400 font-medium">
             Upload a background to start
           </div>
        )}

        {elements.map((el) => {
          return (
            <DraggableElement
              key={el.id}
              element={el}
              canvasWidth={dimensions.width}
              canvasHeight={dimensions.height}
              onUpdate={onUpdateElement}
              isSelected={selectedId === el.id}
              onSelect={() => onSelect(el.id)}
            />
          );
        })}
      </div>
    </div>
  );
};