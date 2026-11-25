import { describe, expect, it } from 'vitest';
import {
  cellValueToInputString,
  inferColumnType,
  isValidIsoDate,
  validateCellValue,
} from '../src/features/source-data/typeValidation';

describe('typeValidation', () => {
  it('treats empty values as valid for every column type', () => {
    for (const type of ['text', 'number', 'date', 'boolean'] as const) {
      expect(validateCellValue(null, type)).toEqual({ valid: true, parsed: null });
      expect(validateCellValue('', type)).toEqual({ valid: true, parsed: null });
      expect(validateCellValue('   ', type)).toEqual({ valid: true, parsed: null });
    }
  });

  it('validates dot-decimal numbers strictly', () => {
    expect(validateCellValue('42.5', 'number')).toEqual({ valid: true, parsed: 42.5 });
    expect(validateCellValue('-10', 'number')).toEqual({ valid: true, parsed: -10 });
    expect(validateCellValue(100, 'number')).toEqual({ valid: true, parsed: 100 });

    expect(validateCellValue('12,5', 'number').valid).toBe(false);
    expect(validateCellValue('12abc', 'number').valid).toBe(false);
    expect(validateCellValue(Number.NaN, 'number').valid).toBe(false);
  });

  it('validates real ISO calendar dates', () => {
    expect(isValidIsoDate('2026-01-15')).toBe(true);
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('15.01.2026')).toBe(false);

    expect(validateCellValue('2026-03-01', 'date')).toEqual({
      valid: true,
      parsed: '2026-03-01',
    });
    expect(validateCellValue('2026-02-30', 'date')).toEqual({
      valid: false,
      parsed: null,
      errorKey: 'invalidDate',
    });
  });

  it('validates booleans case-insensitively', () => {
    expect(validateCellValue(true, 'boolean')).toEqual({ valid: true, parsed: true });
    expect(validateCellValue('FALSE', 'boolean')).toEqual({ valid: true, parsed: false });
    expect(validateCellValue('yes', 'boolean')).toEqual({
      valid: false,
      parsed: null,
      errorKey: 'invalidBoolean',
    });
  });

  it('infers column type from non-empty values without mutating data', () => {
    expect(inferColumnType([null, ''])).toBe('text');
    expect(inferColumnType(['10', '20.5', null])).toBe('number');
    expect(inferColumnType(['2026-01-01', '2026-01-02'])).toBe('date');
    expect(inferColumnType(['true', 'false'])).toBe('boolean');
    expect(inferColumnType(['10', 'abc'])).toBe('text');
  });

  it('preserves raw values in cellValueToInputString', () => {
    expect(cellValueToInputString(null)).toBe('');
    expect(cellValueToInputString(42)).toBe('42');
    expect(cellValueToInputString('raw text')).toBe('raw text');
  });
});
