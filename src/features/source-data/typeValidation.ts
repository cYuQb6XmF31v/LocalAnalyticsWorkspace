import type { CellValue, ColumnType } from '../../domain/models';

export const SUPPORTED_COLUMN_TYPES: readonly ColumnType[] = ['text', 'number', 'date', 'boolean'];

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const STRICT_NUMBER_PATTERN = /^-?(?:\d+\.?\d*|\.\d+)$/;

export interface CellValidationResult {
  valid: boolean;
  /** Parsed canonical representation when valid, or null when empty/invalid. */
  parsed: string | number | boolean | null;
  errorKey?: 'invalidNumber' | 'invalidDate' | 'invalidBoolean';
}

export function isColumnType(value: string): value is ColumnType {
  return (SUPPORTED_COLUMN_TYPES as readonly string[]).includes(value);
}

export function isEmptyCellValue(value: CellValue | undefined): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

/**
 * Validates an ISO calendar date string (YYYY-MM-DD), rejecting impossible dates like 2026-02-30.
 */
export function isValidIsoDate(raw: string): boolean {
  const match = ISO_DATE_PATTERN.exec(raw.trim());
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/**
 * Validates a cell value against a declared column type without mutating the underlying raw value.
 */
export function validateCellValue(value: CellValue | undefined, type: ColumnType): CellValidationResult {
  if (isEmptyCellValue(value)) {
    return { valid: true, parsed: null };
  }

  if (type === 'text') {
    return { valid: true, parsed: String(value) };
  }

  if (type === 'number') {
    if (typeof value === 'number') {
      return Number.isFinite(value)
        ? { valid: true, parsed: value }
        : { valid: false, parsed: null, errorKey: 'invalidNumber' };
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!STRICT_NUMBER_PATTERN.test(trimmed)) {
        return { valid: false, parsed: null, errorKey: 'invalidNumber' };
      }
      const numeric = Number(trimmed);
      return Number.isFinite(numeric)
        ? { valid: true, parsed: numeric }
        : { valid: false, parsed: null, errorKey: 'invalidNumber' };
    }
    return { valid: false, parsed: null, errorKey: 'invalidNumber' };
  }

  if (type === 'date') {
    const str = String(value).trim();
    return isValidIsoDate(str)
      ? { valid: true, parsed: str }
      : { valid: false, parsed: null, errorKey: 'invalidDate' };
  }

  // boolean
  if (typeof value === 'boolean') {
    return { valid: true, parsed: value };
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') {
    return { valid: true, parsed: true };
  }
  if (normalized === 'false') {
    return { valid: true, parsed: false };
  }
  return { valid: false, parsed: null, errorKey: 'invalidBoolean' };
}

/**
 * Suggests the narrowest compatible column type for non-empty values in a column.
 * Returns 'text' when empty or mixed.
 */
export function inferColumnType(values: readonly CellValue[]): ColumnType {
  const nonEmpty = values.filter((v) => !isEmptyCellValue(v));
  if (nonEmpty.length === 0) {
    return 'text';
  }

  if (nonEmpty.every((v) => validateCellValue(v, 'boolean').valid)) {
    return 'boolean';
  }
  if (nonEmpty.every((v) => validateCellValue(v, 'number').valid)) {
    return 'number';
  }
  if (nonEmpty.every((v) => validateCellValue(v, 'date').valid)) {
    return 'date';
  }
  return 'text';
}

/**
 * Normalizes any CellValue to an editable string for grid inputs without losing invalid raw values.
 */
export function cellValueToInputString(value: CellValue | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}
