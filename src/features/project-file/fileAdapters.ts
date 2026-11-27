export interface PickedTxtFile {
  fileName: string;
  content: string;
  hasWriteHandle?: boolean;
}

export type OpenFileResult =
  | { status: 'picked'; file: PickedTxtFile }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export type SaveFileResult =
  | { status: 'saved'; method: 'picker' | 'direct' | 'download'; fileName?: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

interface FileSystemWritableStreamLike {
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
}

interface FileSystemPermissionDescriptorLike {
  mode?: 'read' | 'readwrite';
}

interface FileSystemFileHandleLike {
  name?: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<FileSystemWritableStreamLike>;
  queryPermission?: (desc?: FileSystemPermissionDescriptorLike) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?: (desc?: FileSystemPermissionDescriptorLike) => Promise<'granted' | 'denied' | 'prompt'>;
}

let activeFileHandle: FileSystemFileHandleLike | null = null;
let activeFileName: string | null = null;

export function getActiveFileHandleInfo(): { fileName: string } | null {
  return activeFileHandle ? { fileName: activeFileName || activeFileHandle.name || 'project.txt' } : null;
}

export function clearActiveFileHandle(): void {
  activeFileHandle = null;
  activeFileName = null;
}

interface WindowWithFilePickers extends Window {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandleLike[]>;
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandleLike>;
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError');
}

export function buildExportFileName(projectName: string): string {
  const cleaned = projectName
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_');
  const base = cleaned.length > 0 ? cleaned : 'local-analytics-project';
  return base.toLowerCase().endsWith('.txt') ? base : `${base}.txt`;
}

export function stripTxtExtension(fileName: string): string {
  return fileName.replace(/\.txt$/i, '').trim() || 'Source Data';
}

export async function readTxtFromFileInput(file: File): Promise<OpenFileResult> {
  try {
    const content = await file.text();
    return {
      status: 'picked',
      file: {
        fileName: file.name,
        content,
      },
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Не вдалося прочитати вибраний файл.',
    };
  }
}

/**
 * Progressive enhancement file picker when available, returning null when caller should
 * trigger the baseline <input type="file"> fallback.
 */
export async function tryOpenTxtWithFilePicker(): Promise<OpenFileResult | null> {
  const win = window as WindowWithFilePickers;
  if (typeof win.showOpenFilePicker !== 'function') {
    return null;
  }

  try {
    const handles = await win.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: 'TXT files',
          accept: { 'text/plain': ['.txt'] },
        },
      ],
    });
    if (!handles || handles.length === 0) {
      return { status: 'cancelled' };
    }
    const handle = handles[0];
    const file = await handle.getFile();
    const res = await readTxtFromFileInput(file);
    if (res.status === 'picked') {
      activeFileHandle = handle;
      activeFileName = file.name;
      return {
        status: 'picked',
        file: {
          ...res.file,
          hasWriteHandle: true,
        },
      };
    }
    return res;
  } catch (error) {
    if (isAbortError(error)) {
      return { status: 'cancelled' };
    }
    // Fall back to baseline input if browser blocks picker in this context
    return null;
  }
}

export function exportTxtViaBlobDownload(fileName: string, content: string): SaveFileResult {
  try {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { status: 'saved', method: 'download' };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Не вдалося сформувати файл для завантаження.',
    };
  }
}

/**
 * Exports TXT using showSaveFilePicker when supported (and retains the handle for quick Ctrl+S),
 * falling back to Blob download.
 */
export async function saveTxtFile(fileName: string, content: string): Promise<SaveFileResult> {
  const win = window as WindowWithFilePickers;
  if (typeof win.showSaveFilePicker === 'function') {
    try {
      const handle = await win.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: 'TXT files',
            accept: { 'text/plain': ['.txt'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      activeFileHandle = handle;
      activeFileName = handle.name || fileName;
      return { status: 'saved', method: 'picker', fileName: activeFileName };
    } catch (error) {
      if (isAbortError(error)) {
        return { status: 'cancelled' };
      }
      // Fallback to Blob download on picker failure
    }
  }

  return exportTxtViaBlobDownload(fileName, content);
}

/**
 * Overwrites the previously opened/saved FileSystemFileHandle directly in one click (Ctrl+S),
 * falling back cleanly to saveTxtFile() if no handle exists or permission was revoked.
 */
export async function saveDirectToActiveHandleOrFallback(
  suggestedFileName: string,
  content: string,
): Promise<SaveFileResult> {
  if (activeFileHandle) {
    try {
      if (typeof activeFileHandle.queryPermission === 'function') {
        const perm = await activeFileHandle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted' && typeof activeFileHandle.requestPermission === 'function') {
          const req = await activeFileHandle.requestPermission({ mode: 'readwrite' });
          if (req !== 'granted') {
            throw new Error('Permission denied');
          }
        }
      }
      const writable = await activeFileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      return {
        status: 'saved',
        method: 'direct',
        fileName: activeFileName || suggestedFileName,
      };
    } catch {
      // Handle revoked or unsupported — clear stale handle and fall back cleanly
      clearActiveFileHandle();
    }
  }

  return saveTxtFile(suggestedFileName, content);
}
