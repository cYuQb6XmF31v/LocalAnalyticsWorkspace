import { createContext, useContext } from 'react';

export interface ResizeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasSnapContextValue {
  onResizeSnap: (elementId: string, rect: ResizeRect) => void;
  onResizeSnapEnd: (elementId: string, rect: ResizeRect) => ResizeRect;
}

export const CanvasSnapContext = createContext<CanvasSnapContextValue | null>(null);

export function useCanvasSnap() {
  return useContext(CanvasSnapContext);
}
