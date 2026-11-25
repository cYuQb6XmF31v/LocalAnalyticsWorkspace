export interface PickedTxtFile {
  fileName: string;
  content: string;
}

export type OpenFileResult =
  | { status: 'picked'; file: PickedTxtFile }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export type SaveFileResult =
  | { status: 'saved'; method: 'picker' | 'download' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

interface FileSystemWritableStreamLike {
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
}

interface FileSystemFileHandleLike {
  getFile: () => Promise<File>;
  createWritable: () => Promise<FileSystemWritableStreamLike>;
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
    const file = await handles[0].getFile();
    return await readTxtFromFileInput(file);
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
 * Exports TXT using showSaveFilePicker when supported, falling back to Blob download.
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
      return { status: 'saved', method: 'picker' };
    } catch (error) {
      if (isAbortError(error)) {
        return { status: 'cancelled' };
      }
      // Fallback to Blob download on picker failure
    }
  }

  return exportTxtViaBlobDownload(fileName, content);
}
