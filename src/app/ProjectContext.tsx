import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';
import type { Project, WorkspaceState } from '../domain/models';
import { uk } from '../i18n/uk';
import {
  createEmptyProject,
  createInitialWorkspaceState,
  projectReducer,
  type ProjectAction,
} from './projectReducer';
import {
  clearSessionSnapshot,
  loadSessionSnapshot,
  saveSessionSnapshot,
} from './sessionRecovery';

export interface SessionNotice {
  kind: 'restored' | 'warning';
  message: string;
}

interface ProjectContextValue {
  state: WorkspaceState;
  dispatch: Dispatch<ProjectAction>;
  undo: () => void;
  canUndo: boolean;
  sessionNotice: SessionNotice | null;
  dismissSessionNotice: () => void;
  resetSessionProject: () => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

const SAVE_DEBOUNCE_MS = 350;
const MAX_UNDO_HISTORY = 50;

const NON_UNDOABLE_ACTIONS = new Set<ProjectAction['type']>([
  'SELECT_PAGE',
  'SELECT_ELEMENT',
  'SELECT_ELEMENTS',
  'SET_PAGE_VIEWPORT',
  'DISMISS_LAYOUT_CHOOSER',
  'MARK_EXPORTED',
  'RESTORE_SNAPSHOT',
  'REPLACE_PROJECT',
  'RESET_PROJECT',
]);

function initializeFromSession(): {
  initialState: WorkspaceState;
  initialNotice: SessionNotice | null;
} {
  const result = loadSessionSnapshot();
  if (result.status === 'restored') {
    return {
      initialState: result.state,
      initialNotice: {
        kind: 'restored',
        message: uk.session.restoredNotice,
      },
    };
  }
  if (result.status === 'error') {
    return {
      initialState: createInitialWorkspaceState(
        createEmptyProject(uk.app.projectPlaceholder, uk.navigator.samplePage),
      ),
      initialNotice: {
        kind: 'warning',
        message: `${uk.session.restoreFailedPrefix} ${result.errorMessage}`,
      },
    };
  }
  return {
    initialState: createInitialWorkspaceState(
      createEmptyProject(uk.app.projectPlaceholder, uk.navigator.samplePage),
    ),
    initialNotice: null,
  };
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const bootRef = useRef<ReturnType<typeof initializeFromSession> | null>(null);
  if (!bootRef.current) {
    bootRef.current = initializeFromSession();
  }

  const [state, rawDispatch] = useReducer(projectReducer, bootRef.current.initialState);
  const [sessionNotice, setSessionNotice] = useState<SessionNotice | null>(
    bootRef.current.initialNotice,
  );
  const undoStackRef = useRef<Array<{ project: Project; activePageId: string }>>([]);
  const [canUndo, setCanUndo] = useState(false);

  const latestStateRef = useRef(state);
  latestStateRef.current = state;

  const dispatch: Dispatch<ProjectAction> = useCallback((action) => {
    if (action.type === 'REPLACE_PROJECT' || action.type === 'RESET_PROJECT') {
      undoStackRef.current = [];
      setCanUndo(false);
      rawDispatch(action);
      return;
    }
    if (!NON_UNDOABLE_ACTIONS.has(action.type)) {
      const current = latestStateRef.current;
      const simulatedNext = projectReducer(current, action);
      if (simulatedNext.project !== current.project) {
        undoStackRef.current.push({
          project: current.project,
          activePageId: current.activePageId,
        });
        if (undoStackRef.current.length > MAX_UNDO_HISTORY) {
          undoStackRef.current.shift();
        }
        latestStateRef.current = simulatedNext;
        setCanUndo(true);
      }
    }
    rawDispatch(action);
  }, []);

  const undo = useCallback(() => {
    const prev = undoStackRef.current.pop();
    if (!prev) {
      return;
    }
    setCanUndo(undoStackRef.current.length > 0);
    rawDispatch({
      type: 'RESTORE_SNAPSHOT',
      project: prev.project,
      activePageId: prev.activePageId,
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) {
        return;
      }
      // Support both Latin ('z') and non-Latin keyboard layouts like Ukrainian ('я' on KeyZ)
      const isZKey = event.code === 'KeyZ' || event.key.toLowerCase() === 'z';
      if (!isZKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target) {
        if (target.isContentEditable || target.tagName === 'TEXTAREA') {
          return;
        }
        if (target.tagName === 'INPUT') {
          const inputType = (target as HTMLInputElement).type.toLowerCase();
          if (
            inputType === 'text' ||
            inputType === 'search' ||
            inputType === 'url' ||
            inputType === 'tel' ||
            inputType === 'password' ||
            inputType === 'number' ||
            inputType === 'email'
          ) {
            return;
          }
        }
      }
      if (undoStackRef.current.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        undo();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [undo]);

  const persistSnapshot = useCallback((targetState: WorkspaceState) => {
    const result = saveSessionSnapshot(targetState);
    if (!result.ok) {
      setSessionNotice({
        kind: 'warning',
        message: result.errorMessage,
      });
    }
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      persistSnapshot(state);
    }, SAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [state, persistSnapshot]);

  useEffect(() => {
    const flushNow = () => {
      persistSnapshot(latestStateRef.current);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushNow();
      }
    };

    window.addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flushNow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [persistSnapshot]);

  const dismissSessionNotice = useCallback(() => {
    setSessionNotice(null);
  }, []);

  const resetSessionProject = useCallback(() => {
    clearSessionSnapshot();
    dispatch({
      type: 'RESET_PROJECT',
      projectName: uk.app.projectPlaceholder,
      firstPageName: uk.navigator.samplePage,
    });
    setSessionNotice(null);
  }, []);

  const value = useMemo<ProjectContextValue>(
    () => ({
      state,
      dispatch,
      undo,
      canUndo,
      sessionNotice,
      dismissSessionNotice,
      resetSessionProject,
    }),
    [state, dispatch, undo, canUndo, sessionNotice, dismissSessionNotice, resetSessionProject],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error('useProject must be used inside ProjectProvider');
  }
  return ctx;
}
