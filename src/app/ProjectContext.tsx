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
import type { WorkspaceState } from '../domain/models';
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
  sessionNotice: SessionNotice | null;
  dismissSessionNotice: () => void;
  resetSessionProject: () => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

const SAVE_DEBOUNCE_MS = 350;

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

  const [state, dispatch] = useReducer(projectReducer, bootRef.current.initialState);
  const [sessionNotice, setSessionNotice] = useState<SessionNotice | null>(
    bootRef.current.initialNotice,
  );

  const latestStateRef = useRef(state);
  latestStateRef.current = state;

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
      sessionNotice,
      dismissSessionNotice,
      resetSessionProject,
    }),
    [state, sessionNotice, dismissSessionNotice, resetSessionProject],
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
