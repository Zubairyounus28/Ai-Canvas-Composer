import React from 'react';

export type FontStyle = 'Script' | 'Bold' | 'Regular' | 'Modern' | 'Monospace';

export interface CanvasDimensions {
  width: number;
  height: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface DesignElement {
  id: string;
  type: 'text' | 'logo' | 'image'; // Added 'image' for AI objects
  content: string; // Text content or Image URL
  x: number;
  y: number;
  width?: number; // For images/logos
  height?: number; 
  style?: React.CSSProperties; // For text styling
}

export interface AIAnalysisResult {
  textContent: string; // The generated text
  textColor: string;
  fontFamily: string;
  textShadow: string;
  fontReasoning: string;
  suggestedTextPosition: 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  suggestedLogoPosition: 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
}