import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createInitialWorkspaceState,
} from '../src/app/projectReducer';
import {
  clearSessionSnapshot,
  loadSessionSnapshot,
  saveSessionSnapshot,
  SESSION_STORAGE_KEY,
  type StorageLike,
} from '../src/app/sessionRecovery';

function createMemoryStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

describe('sessionRecovery', () => {
  it('round-trips workspace state via sessionStorage', () => {
    const storage = createMemoryStorage();
    const state = createInitialWorkspaceState(createEmptyProject('Session Demo', 'Overview'));

    const saveResult = saveSessionSnapshot(state, storage);
    expect(saveResult).toEqual({ ok: true });

    const loadResult = loadSessionSnapshot(storage);
    expect(loadResult.status).toBe('restored');
    if (loadResult.status === 'restored') {
      expect(loadResult.state.project.name).toBe('Session Demo');
      expect(loadResult.state.activePageId).toBe(state.activePageId);
    }

    clearSessionSnapshot(storage);
    expect(loadSessionSnapshot(storage)).toEqual({ status: 'empty' });
  });

  it('handles QuotaExceededError and SecurityError explicitly without throwing', () => {
    const state = createInitialWorkspaceState(createEmptyProject('Big Project', 'Page 1'));

    const quotaStorage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        const err = new Error('Quota exceeded');
        err.name = 'QuotaExceededError';
        throw err;
      },
      removeItem: () => undefined,
    };

    const quotaRes = saveSessionSnapshot(state, quotaStorage);
    expect(quotaRes.ok).toBe(false);
    if (!quotaRes.ok) {
      expect(quotaRes.reason).toBe('quota');
    }

    const securityStorage: StorageLike = {
      getItem: () => {
        const err = new Error('Access denied');
        err.name = 'SecurityError';
        throw err;
      },
      setItem: () => {
        const err = new Error('Access denied');
        err.name = 'SecurityError';
        throw err;
      },
      removeItem: () => undefined,
    };

    const secSave = saveSessionSnapshot(state, securityStorage);
    expect(secSave.ok).toBe(false);
    if (!secSave.ok) {
      expect(secSave.reason).toBe('security');
    }

    const secLoad = loadSessionSnapshot(securityStorage);
    expect(secLoad.status).toBe('error');
    if (secLoad.status === 'error') {
      expect(secLoad.reason).toBe('security');
    }
  });

  it('detects corrupted JSON or incompatible snapshot versions', () => {
    const storage = createMemoryStorage();
    storage.setItem(SESSION_STORAGE_KEY, '{invalid-json');
    expect(loadSessionSnapshot(storage)).toMatchObject({
      status: 'error',
      reason: 'corrupted',
    });

    storage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ version: 999, savedAt: '2026-01-01', state: {} }),
    );
    expect(loadSessionSnapshot(storage)).toMatchObject({
      status: 'error',
      reason: 'unsupportedVersion',
    });
  });
});
