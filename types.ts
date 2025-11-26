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
  type: 'text' | 'logo';
  content: string; // Text content or Image URL
  x: number;
  y: number;
  width?: number; // For logo
  height?: number; // For logo
  style?: React.CSSProperties; // For text styling
}

export interface AIAnalysisResult {
  textColor: string;
  fontFamily: string;
  textShadow: string;
  fontReasoning: string;
  suggestedTextPosition: 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  suggestedLogoPosition: 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
}
