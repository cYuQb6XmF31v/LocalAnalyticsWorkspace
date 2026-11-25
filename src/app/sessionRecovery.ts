import type { WorkspaceState } from '../domain/models';

export const SESSION_STORAGE_KEY = 'local-analytics-workspace:session:v1';
export const SESSION_SNAPSHOT_VERSION = 1;

export interface SessionSnapshotEnvelope {
  version: number;
  savedAt: string;
  state: WorkspaceState;
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type SaveSessionResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'unavailable' | 'quota' | 'security' | 'unknown';
      errorMessage: string;
    };

export type LoadSessionResult =
  | { status: 'empty' }
  | { status: 'restored'; state: WorkspaceState; savedAt: string }
  | {
      status: 'error';
      reason: 'unavailable' | 'security' | 'corrupted' | 'unsupportedVersion';
      errorMessage: string;
    };

function resolveDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function isSecurityError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const name = 'name' in error ? String(error.name) : '';
  return name === 'SecurityError';
}

function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const name = 'name' in error ? String(error.name) : '';
  const code = 'code' in error ? Number(error.code) : 0;
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  );
}

function isValidWorkspaceState(candidate: unknown): candidate is WorkspaceState {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }
  const obj = candidate as Record<string, unknown>;
  if (!obj.project || typeof obj.project !== 'object') {
    return false;
  }
  const project = obj.project as Record<string, unknown>;
  if (
    typeof project.id !== 'string' ||
    typeof project.name !== 'string' ||
    !project.primaryDataset ||
    typeof project.primaryDataset !== 'object' ||
    !Array.isArray(project.canvases) ||
    project.canvases.length === 0
  ) {
    return false;
  }
  const dataset = project.primaryDataset as Record<string, unknown>;
  if (!Array.isArray(dataset.columns) || !Array.isArray(dataset.rows)) {
    return false;
  }
  return true;
}

export function saveSessionSnapshot(
  state: WorkspaceState,
  storage: StorageLike | null = resolveDefaultStorage(),
): SaveSessionResult {
  if (!storage) {
    return {
      ok: false,
      reason: 'unavailable',
      errorMessage: 'sessionStorage недоступний у цьому середовищі браузера.',
    };
  }

  const envelope: SessionSnapshotEnvelope = {
    version: SESSION_SNAPSHOT_VERSION,
    savedAt: new Date().toISOString(),
    state,
  };

  try {
    const serialized = JSON.stringify(envelope);
    storage.setItem(SESSION_STORAGE_KEY, serialized);
    return { ok: true };
  } catch (error) {
    if (isQuotaError(error)) {
      return {
        ok: false,
        reason: 'quota',
        errorMessage:
          'Перевищено ліміт тимчасової пам’яті вкладки (sessionStorage). Збережіть проєкт у TXT-файл.',
      };
    }
    if (isSecurityError(error)) {
      return {
        ok: false,
        reason: 'security',
        errorMessage:
          'Браузер заборонив доступ до sessionStorage. Робота триває в пам’яті — експортуйте TXT.',
      };
    }
    return {
      ok: false,
      reason: 'unknown',
      errorMessage:
        error instanceof Error ? error.message : 'Не вдалося зберегти тимчасову копію сесії.',
    };
  }
}

export function loadSessionSnapshot(
  storage: StorageLike | null = resolveDefaultStorage(),
): LoadSessionResult {
  if (!storage) {
    return {
      status: 'error',
      reason: 'unavailable',
      errorMessage: 'sessionStorage недоступний у цьому середовищі браузера.',
    };
  }

  let raw: string | null = null;
  try {
    raw = storage.getItem(SESSION_STORAGE_KEY);
  } catch (error) {
    if (isSecurityError(error)) {
      return {
        status: 'error',
        reason: 'security',
        errorMessage: 'Браузер заблокував читання sessionStorage.',
      };
    }
    return {
      status: 'error',
      reason: 'unavailable',
      errorMessage: error instanceof Error ? error.message : 'Помилка читання sessionStorage.',
    };
  }

  if (raw === null) {
    return { status: 'empty' };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SessionSnapshotEnvelope>;
    if (parsed.version !== SESSION_SNAPSHOT_VERSION) {
      return {
        status: 'error',
        reason: 'unsupportedVersion',
        errorMessage: 'Знайдено несумісну версію тимчасової сесії.',
      };
    }
    if (!isValidWorkspaceState(parsed.state)) {
      return {
        status: 'error',
        reason: 'corrupted',
        errorMessage: 'Пошкоджені дані тимчасового відновлення сесії.',
      };
    }

    const activeExists = parsed.state.project.canvases.some(
      (page) => page.id === parsed.state?.activePageId,
    );

    const normalizedState: WorkspaceState = {
      ...parsed.state,
      activePageId: activeExists
        ? parsed.state.activePageId
        : parsed.state.project.canvases[0].id,
    };

    return {
      status: 'restored',
      state: normalizedState,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return {
      status: 'error',
      reason: 'corrupted',
      errorMessage: 'Не вдалося розібрати збережену тимчасову сесію.',
    };
  }
}

export function clearSessionSnapshot(
  storage: StorageLike | null = resolveDefaultStorage(),
): void {
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(SESSION_STORAGE_KEY);
  } catch (error) {
    // Explicit non-empty handling: clearing recovery cache must not crash the app.
    console.warn('Failed to clear sessionStorage snapshot:', error);
  }
}
