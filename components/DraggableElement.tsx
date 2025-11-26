import React, { useState, useEffect, useRef } from 'react';
import { DesignElement } from '../types';

interface DraggableElementProps {
  element: DesignElement;
  canvasWidth: number;
  canvasHeight: number;
  onUpdate: (id: string, updates: Partial<DesignElement>) => void;
  isSelected?: boolean;
  onSelect?: () => void;
}

export const DraggableElement: React.FC<DraggableElementProps> = ({
  element,
  canvasWidth,
  canvasHeight,
  onUpdate,
  isSelected,
  onSelect,
}) => {
  // Local state for smooth dragging/resizing before committing to parent
  const [position, setPosition] = useState({ x: element.x, y: element.y });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [initialResizeData, setInitialResizeData] = useState<{ 
    width: number; 
    height: number; 
    mouseX: number; 
    mouseY: number;
    fontSize: number;
  } | null>(null);

  const elementRef = useRef<HTMLDivElement>(null);

  // Sync state with props when not interacting
  useEffect(() => {
    if (!isDragging && !isResizing) {
      setPosition({ x: element.x, y: element.y });
    }
  }, [element.x, element.y, isDragging, isResizing]);

  // --- Drag Logic ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isResizing) return;
    
    // Crucial: Stop propagation so the canvas click handler doesn't immediately deselect
    e.stopPropagation();
    
    if (onSelect) onSelect();
    
    if (elementRef.current) {
      const rect = elementRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
    setIsDragging(true);
  };

  // --- Resize Logic ---
  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault(); // Prevent text selection
    if (onSelect) onSelect();
    
    setIsResizing(true);
    
    const currentWidth = elementRef.current?.offsetWidth || 0;
    const currentHeight = elementRef.current?.offsetHeight || 0;
    const currentFontSize = element.type === 'text' 
      ? parseInt(element.style?.fontSize as string || '48', 10) 
      : 0;

    setInitialResizeData({
      width: currentWidth,
      height: currentHeight,
      mouseX: e.clientX,
      mouseY: e.clientY,
      fontSize: currentFontSize
    });
  };

  // --- Window Event Listeners ---
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Dragging
      if (isDragging && elementRef.current) {
        const parentRect = elementRef.current.offsetParent?.getBoundingClientRect();
        // If no parent rect (e.g. unmounted), stop
        if (!parentRect) return;

        let newX = e.clientX - parentRect.left - dragOffset.x;
        let newY = e.clientY - parentRect.top - dragOffset.y;
        
        // Update local visual state immediately
        setPosition({ x: newX, y: newY });
      }

      // Resizing
      if (isResizing && initialResizeData && elementRef.current) {
        const deltaX = e.clientX - initialResizeData.mouseX;

        if (element.type === 'logo' || element.type === 'image') {
          // Resize Image
          const newWidth = Math.max(20, initialResizeData.width + deltaX);
           onUpdate(element.id, { width: newWidth });
        } else if (element.type === 'text') {
           // Resize Text (Scale Font Size)
           const scaleFactor = (initialResizeData.width + deltaX) / initialResizeData.width;
           const newFontSize = Math.max(12, Math.round(initialResizeData.fontSize * scaleFactor));
           onUpdate(element.id, { 
             style: { ...element.style, fontSize: `${newFontSize}px` } 
           });
        }
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        // Commit final position to parent state
        onUpdate(element.id, { x: position.x, y: position.y });
      }
      if (isResizing) {
        setIsResizing(false);
        setInitialResizeData(null);
      }
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragOffset, initialResizeData, element.id, onUpdate, element.type, position.x, position.y]);

  // Clean styles to avoid positioning conflicts
  const cleanStyle = element.style ? { ...element.style } : {};
  delete cleanStyle.position;
  delete cleanStyle.top;
  delete cleanStyle.left;
  delete cleanStyle.transform;

  return (
    <div
      ref={elementRef}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        cursor: isDragging ? 'grabbing' : 'grab',
        zIndex: isSelected ? 50 : 10,
        touchAction: 'none',
        width: (element.type === 'logo' || element.type === 'image') ? element.width : 'auto',
      }}
      className={`group select-none ${isSelected ? 'ring-1 ring-blue-500 ring-offset-1 ring-offset-transparent' : 'hover:ring-1 hover:ring-zinc-400 hover:ring-dashed'}`}
      onMouseDown={handleMouseDown}
    >
      {/* Content */}
      {element.type === 'text' ? (
        <div style={cleanStyle} className="whitespace-pre-wrap p-2 leading-tight pointer-events-none">
          {element.content}
        </div>
      ) : (
        <img
          src={element.content}
          alt={element.type}
          crossOrigin="anonymous" 
          className="pointer-events-none w-full h-auto block"
        />
      )}

      {/* Resize Anchors (Only when selected) */}
      {isSelected && (
        <>
          {/* Bottom Right Anchor */}
          <div
            className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-white border-2 border-blue-500 rounded-full cursor-nwse-resize z-50 shadow-sm hover:scale-110 transition-transform"
            onMouseDown={handleResizeStart}
          />
          {/* Helper label */}
          <div className="absolute -top-6 left-0 bg-blue-600 text-white text-[10px] px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
            Drag to resize
          </div>
        </>
      )}
    </div>
  );
};