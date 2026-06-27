import { createContext, useContext } from 'react';

/** Actions a session node can trigger on the surrounding canvas. Provided by
 *  CanvasBoard so nodes don't have to carry callbacks in their `data`. */
export interface CanvasActions {
  removeSession: (sessionId: string) => void;
  /** Set (or, with `undefined`, clear) a widget's custom border color. */
  setBorderColor: (sessionId: string, color: string | undefined) => void;
  /** Distinct border colors already in use on the canvas — powers quick-select. */
  usedBorderColors: string[];
}

export const CanvasActionsContext = createContext<CanvasActions>({
  removeSession: () => undefined,
  setBorderColor: () => undefined,
  usedBorderColors: [],
});

export const useCanvasActions = (): CanvasActions => useContext(CanvasActionsContext);

/** Per-node data carried by React Flow. */
export interface SessionNodeData {
  sessionId: string;
  /** Custom widget border color (hex). Absent → theme default. */
  borderColor?: string;
  [key: string]: unknown;
}
