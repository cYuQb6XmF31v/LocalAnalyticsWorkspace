import type { CellValue, Column, Dataset, Row } from '../../domain/models';

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'null' }
  | { kind: 'col'; ref: string }
  | { kind: 'ident'; name: string }
  | { kind: 'op'; op: string }
  | { kind: 'paren'; ch: '(' | ')' }
  | { kind: 'comma' };

export type FormulaValidationResult =
  | { valid: true; referencedRefs: string[] }
  | { valid: false; error: string };

const TWO_CHAR_OPS = new Set(['==', '!=', '<>', '>=', '<=', '&&', '||']);
const ONE_CHAR_OPS = new Set(['+', '-', '*', '/', '%', '>', '<', '=', '!']);

function tokenizeFormula(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }

    if (ch === '(' || ch === ')') {
      tokens.push({ kind: 'paren', ch });
      i += 1;
      continue;
    }

    if (ch === ',') {
      tokens.push({ kind: 'comma' });
      i += 1;
      continue;
    }

    if (ch === '[') {
      const closeIdx = expr.indexOf(']', i + 1);
      if (closeIdx === -1) {
        throw new Error('Незакрита квадратна дужка [ для посилання на колонку.');
      }
      const ref = expr.slice(i + 1, closeIdx).trim();
      if (!ref) {
        throw new Error('Порожнє посилання на колонку [].');
      }
      tokens.push({ kind: 'col', ref });
      i = closeIdx + 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let str = '';
      i += 1;
      let closed = false;
      while (i < expr.length) {
        const cur = expr[i];
        if (cur === '\\' && i + 1 < expr.length) {
          str += expr[i + 1];
          i += 2;
          continue;
        }
        if (cur === quote) {
          closed = true;
          i += 1;
          break;
        }
        str += cur;
        i += 1;
      }
      if (!closed) {
        throw new Error('Незакритий рядковий літерал у формулі.');
      }
      tokens.push({ kind: 'string', value: str });
      continue;
    }

    if (i + 1 < expr.length && TWO_CHAR_OPS.has(expr.slice(i, i + 2))) {
      tokens.push({ kind: 'op', op: expr.slice(i, i + 2) });
      i += 2;
      continue;
    }

    if (ONE_CHAR_OPS.has(ch)) {
      tokens.push({ kind: 'op', op: ch });
      i += 1;
      continue;
    }

    if ((ch >= '0' && ch <= '9') || (ch === '.' && i + 1 < expr.length && expr[i + 1] >= '0' && expr[i + 1] <= '9')) {
      let end = i;
      let seenDot = false;
      while (end < expr.length) {
        const d = expr[end];
        if (d >= '0' && d <= '9') {
          end += 1;
        } else if (d === '.' && !seenDot) {
          seenDot = true;
          end += 1;
        } else {
          break;
        }
      }
      const num = Number(expr.slice(i, end));
      if (!Number.isFinite(num)) {
        throw new Error(`Некоректне число "${expr.slice(i, end)}".`);
      }
      tokens.push({ kind: 'number', value: num });
      i = end;
      continue;
    }

    if (/[\p{L}_]/u.test(ch)) {
      let end = i;
      while (end < expr.length && /[\p{L}\p{N}_]/u.test(expr[end])) {
        end += 1;
      }
      const word = expr.slice(i, end);
      const upper = word.toUpperCase();
      if (upper === 'TRUE') {
        tokens.push({ kind: 'boolean', value: true });
      } else if (upper === 'FALSE') {
        tokens.push({ kind: 'boolean', value: false });
      } else if (upper === 'NULL') {
        tokens.push({ kind: 'null' });
      } else if (upper === 'AND' || upper === 'OR' || upper === 'NOT') {
        tokens.push({ kind: 'op', op: upper });
      } else {
        tokens.push({ kind: 'ident', name: upper });
      }
      i = end;
      continue;
    }

    throw new Error(`Неочікуваний символ "${ch}" у формулі.`);
  }

  return tokens;
}

type AstNode =
  | { kind: 'literal'; value: CellValue }
  | { kind: 'col'; ref: string }
  | { kind: 'unary'; op: string; arg: AstNode }
  | { kind: 'binary'; op: string; left: AstNode; right: AstNode }
  | { kind: 'call'; name: string; args: AstNode[] };

class FormulaParser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): AstNode {
    if (this.tokens.length === 0) {
      throw new Error('Формула не може бути порожньою.');
    }
    const node = this.parseOr();
    if (this.pos < this.tokens.length) {
      throw new Error('Зайві символи в кінці формули.');
    }
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    const tok = this.tokens[this.pos];
    this.pos += 1;
    return tok;
  }

  private parseOr(): AstNode {
    let left = this.parseAnd();
    while (true) {
      const tok = this.peek();
      if (tok?.kind === 'op' && (tok.op === '||' || tok.op === 'OR')) {
        this.consume();
        const right = this.parseAnd();
        left = { kind: 'binary', op: 'OR', left, right };
      } else {
        break;
      }
    }
    return left;
  }

  private parseAnd(): AstNode {
    let left = this.parseEquality();
    while (true) {
      const tok = this.peek();
      if (tok?.kind === 'op' && (tok.op === '&&' || tok.op === 'AND')) {
        this.consume();
        const right = this.parseEquality();
        left = { kind: 'binary', op: 'AND', left, right };
      } else {
        break;
      }
    }
    return left;
  }

  private parseEquality(): AstNode {
    let left = this.parseComparison();
    while (true) {
      const tok = this.peek();
      if (
        tok?.kind === 'op' &&
        (tok.op === '==' || tok.op === '=' || tok.op === '!=' || tok.op === '<>')
      ) {
        this.consume();
        const right = this.parseComparison();
        left = {
          kind: 'binary',
          op: tok.op === '=' || tok.op === '==' ? '==' : '!=',
          left,
          right,
        };
      } else {
        break;
      }
    }
    return left;
  }

  private parseComparison(): AstNode {
    let left = this.parseAdditive();
    while (true) {
      const tok = this.peek();
      if (
        tok?.kind === 'op' &&
        (tok.op === '>' || tok.op === '>=' || tok.op === '<' || tok.op === '<=')
      ) {
        this.consume();
        const right = this.parseAdditive();
        left = { kind: 'binary', op: tok.op, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  private parseAdditive(): AstNode {
    let left = this.parseMultiplicative();
    while (true) {
      const tok = this.peek();
      if (tok?.kind === 'op' && (tok.op === '+' || tok.op === '-')) {
        this.consume();
        const right = this.parseMultiplicative();
        left = { kind: 'binary', op: tok.op, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  private parseMultiplicative(): AstNode {
    let left = this.parseUnary();
    while (true) {
      const tok = this.peek();
      if (tok?.kind === 'op' && (tok.op === '*' || tok.op === '/' || tok.op === '%')) {
        this.consume();
        const right = this.parseUnary();
        left = { kind: 'binary', op: tok.op, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  private parseUnary(): AstNode {
    const tok = this.peek();
    if (tok?.kind === 'op' && (tok.op === '-' || tok.op === '+' || tok.op === '!' || tok.op === 'NOT')) {
      this.consume();
      return { kind: 'unary', op: tok.op === '!' ? 'NOT' : tok.op, arg: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): AstNode {
    const tok = this.peek();
    if (!tok) {
      throw new Error('Неочікуваний кінець формули.');
    }

    if (tok.kind === 'number' || tok.kind === 'string' || tok.kind === 'boolean') {
      this.consume();
      return { kind: 'literal', value: tok.value };
    }

    if (tok.kind === 'null') {
      this.consume();
      return { kind: 'literal', value: null };
    }

    if (tok.kind === 'col') {
      this.consume();
      return { kind: 'col', ref: tok.ref };
    }

    if (tok.kind === 'paren' && tok.ch === '(') {
      this.consume();
      const inner = this.parseOr();
      const close = this.peek();
      if (!close || close.kind !== 'paren' || close.ch !== ')') {
        throw new Error('Очікувалась закриваюча дужка ")".');
      }
      this.consume();
      return inner;
    }

    if (tok.kind === 'ident') {
      this.consume();
      const next = this.peek();
      if (!next || next.kind !== 'paren' || next.ch !== '(') {
        throw new Error(`Невідомий ідентифікатор "${tok.name}". Для колонок використовуйте [Назва].`);
      }
      this.consume(); // '('
      const args: AstNode[] = [];
      const afterOpen = this.peek();
      if (afterOpen && !(afterOpen.kind === 'paren' && afterOpen.ch === ')')) {
        args.push(this.parseOr());
        while (this.peek()?.kind === 'comma') {
          this.consume();
          args.push(this.parseOr());
        }
      }
      const close = this.peek();
      if (!close || close.kind !== 'paren' || close.ch !== ')') {
        throw new Error(`Очікувалась ")" після аргументів функції ${tok.name}.`);
      }
      this.consume();
      return { kind: 'call', name: tok.name, args };
    }

    throw new Error('Некоректний вираз у формулі.');
  }
}

const SUPPORTED_FUNCTIONS = new Set([
  'IF',
  'ROUND',
  'FLOOR',
  'CEIL',
  'ABS',
  'MIN',
  'MAX',
  'COALESCE',
  'CONCAT',
  'UPPER',
  'LOWER',
  'LEN',
  'TRIM',
  'CONTAINS',
  'YEAR',
  'MONTH',
  'DAY',
  'DAYS_DIFF',
]);

function collectRefs(node: AstNode, out: Set<string>): void {
  if (node.kind === 'col') {
    out.add(node.ref);
    return;
  }
  if (node.kind === 'unary') {
    collectRefs(node.arg, out);
    return;
  }
  if (node.kind === 'binary') {
    collectRefs(node.left, out);
    collectRefs(node.right, out);
    return;
  }
  if (node.kind === 'call') {
    if (!SUPPORTED_FUNCTIONS.has(node.name)) {
      throw new Error(`Непідтримувана функція "${node.name}".`);
    }
    for (const arg of node.args) {
      collectRefs(arg, out);
    }
  }
}

export function extractFormulaColumnRefs(formula: string, columns: Column[]): string[] {
  try {
    const ast = new FormulaParser(tokenizeFormula(formula)).parse();
    const rawRefs = new Set<string>();
    collectRefs(ast, rawRefs);
    const colIds: string[] = [];
    for (const ref of rawRefs) {
      const col = findColumnByRef(columns, ref);
      if (col && !colIds.includes(col.id)) {
        colIds.push(col.id);
      }
    }
    return colIds;
  } catch {
    return [];
  }
}

export function validateFormula(formula: string): FormulaValidationResult {
  try {
    const ast = new FormulaParser(tokenizeFormula(formula)).parse();
    const refs = new Set<string>();
    collectRefs(ast, refs);
    return { valid: true, referencedRefs: Array.from(refs) };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Помилка синтаксису формули.',
    };
  }
}

function findColumnByRef(columns: Column[], ref: string): Column | undefined {
  const byId = columns.find((c) => c.id === ref);
  if (byId) {
    return byId;
  }
  const lower = ref.trim().toLowerCase();
  return columns.find((c) => c.name.trim().toLowerCase() === lower);
}

function toNumber(val: CellValue): number | null {
  if (val === null || val === undefined || val === '') {
    return null;
  }
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null;
  }
  if (typeof val === 'boolean') {
    return val ? 1 : 0;
  }
  const num = Number(String(val).trim());
  return Number.isFinite(num) ? num : null;
}

function toBool(val: CellValue): boolean {
  if (val === null || val === undefined || val === '') {
    return false;
  }
  if (typeof val === 'boolean') {
    return val;
  }
  if (typeof val === 'number') {
    return val !== 0;
  }
  const s = String(val).trim().toLowerCase();
  return s !== '' && s !== 'false' && s !== '0';
}

function toStr(val: CellValue): string {
  if (val === null || val === undefined) {
    return '';
  }
  return String(val);
}

function parseIsoUtcMs(val: CellValue): number | null {
  if (typeof val !== 'string') {
    return null;
  }
  const trimmed = val.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }
  const ms = Date.parse(`${trimmed}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

function evalAst(
  node: AstNode,
  rowValues: Record<string, CellValue>,
  columns: Column[],
): CellValue {
  switch (node.kind) {
    case 'literal':
      return node.value;

    case 'col': {
      const col = findColumnByRef(columns, node.ref);
      if (!col) {
        return null;
      }
      return rowValues[col.id] ?? null;
    }

    case 'unary': {
      const val = evalAst(node.arg, rowValues, columns);
      if (node.op === 'NOT') {
        return !toBool(val);
      }
      const num = toNumber(val);
      if (num === null) {
        return null;
      }
      return node.op === '-' ? -num : num;
    }

    case 'binary': {
      if (node.op === 'AND') {
        return toBool(evalAst(node.left, rowValues, columns))
          ? toBool(evalAst(node.right, rowValues, columns))
          : false;
      }
      if (node.op === 'OR') {
        return toBool(evalAst(node.left, rowValues, columns))
          ? true
          : toBool(evalAst(node.right, rowValues, columns));
      }

      const l = evalAst(node.left, rowValues, columns);
      const r = evalAst(node.right, rowValues, columns);

      if (node.op === '==') {
        if (l === null && r === null) return true;
        if (l === null || r === null) return false;
        const ln = toNumber(l);
        const rn = toNumber(r);
        if (ln !== null && rn !== null) return ln === rn;
        return toStr(l) === toStr(r);
      }
      if (node.op === '!=') {
        if (l === null && r === null) return false;
        if (l === null || r === null) return true;
        const ln = toNumber(l);
        const rn = toNumber(r);
        if (ln !== null && rn !== null) return ln !== rn;
        return toStr(l) !== toStr(r);
      }

      if (node.op === '+') {
        if (l === null && r === null) return null;
        const ln = toNumber(l);
        const rn = toNumber(r);
        if (typeof l === 'string' || typeof r === 'string') {
          if (ln !== null && rn !== null && typeof l !== 'boolean' && typeof r !== 'boolean') {
            return ln + rn;
          }
          return `${toStr(l)}${toStr(r)}`;
        }
        return ln !== null && rn !== null ? ln + rn : null;
      }

      const ln = toNumber(l);
      const rn = toNumber(r);

      if (node.op === '-' || node.op === '*' || node.op === '/' || node.op === '%') {
        if (ln === null || rn === null) return null;
        if (node.op === '-') return ln - rn;
        if (node.op === '*') return ln * rn;
        if (node.op === '/') return rn === 0 ? null : ln / rn;
        return rn === 0 ? null : ln % rn;
      }

      // Comparisons: >, >=, <, <=
      if (ln !== null && rn !== null) {
        if (node.op === '>') return ln > rn;
        if (node.op === '>=') return ln >= rn;
        if (node.op === '<') return ln < rn;
        return ln <= rn;
      }
      const ls = toStr(l);
      const rs = toStr(r);
      if (node.op === '>') return ls > rs;
      if (node.op === '>=') return ls >= rs;
      if (node.op === '<') return ls < rs;
      return ls <= rs;
    }

    case 'call': {
      const fn = node.name;
      if (fn === 'IF') {
        if (node.args.length < 2) return null;
        const cond = toBool(evalAst(node.args[0], rowValues, columns));
        if (cond) {
          return evalAst(node.args[1], rowValues, columns);
        }
        return node.args[2] ? evalAst(node.args[2], rowValues, columns) : null;
      }

      const args = node.args.map((a) => evalAst(a, rowValues, columns));

      switch (fn) {
        case 'ROUND': {
          const n = toNumber(args[0] ?? null);
          const digits = toNumber(args[1] ?? 0) ?? 0;
          if (n === null) return null;
          const factor = Math.pow(10, Math.max(0, Math.min(8, Math.floor(digits))));
          return Math.round(n * factor) / factor;
        }
        case 'FLOOR': {
          const n = toNumber(args[0] ?? null);
          return n === null ? null : Math.floor(n);
        }
        case 'CEIL': {
          const n = toNumber(args[0] ?? null);
          return n === null ? null : Math.ceil(n);
        }
        case 'ABS': {
          const n = toNumber(args[0] ?? null);
          return n === null ? null : Math.abs(n);
        }
        case 'MIN': {
          const nums = args.map(toNumber).filter((x): x is number => x !== null);
          return nums.length > 0 ? Math.min(...nums) : null;
        }
        case 'MAX': {
          const nums = args.map(toNumber).filter((x): x is number => x !== null);
          return nums.length > 0 ? Math.max(...nums) : null;
        }
        case 'COALESCE': {
          for (const a of args) {
            if (a !== null && a !== '') return a;
          }
          return null;
        }
        case 'CONCAT':
          return args.map(toStr).join('');
        case 'UPPER':
          return toStr(args[0] ?? null).toUpperCase();
        case 'LOWER':
          return toStr(args[0] ?? null).toLowerCase();
        case 'TRIM':
          return toStr(args[0] ?? null).trim();
        case 'LEN':
          return toStr(args[0] ?? null).length;
        case 'CONTAINS': {
          const hay = toStr(args[0] ?? null).toLowerCase();
          const needle = toStr(args[1] ?? null).toLowerCase();
          return needle === '' ? false : hay.includes(needle);
        }
        case 'YEAR': {
          const ms = parseIsoUtcMs(args[0] ?? null);
          return ms === null ? null : new Date(ms).getUTCFullYear();
        }
        case 'MONTH': {
          const ms = parseIsoUtcMs(args[0] ?? null);
          return ms === null ? null : new Date(ms).getUTCMonth() + 1;
        }
        case 'DAY': {
          const ms = parseIsoUtcMs(args[0] ?? null);
          return ms === null ? null : new Date(ms).getUTCDate();
        }
        case 'DAYS_DIFF': {
          const ms1 = parseIsoUtcMs(args[0] ?? null);
          const ms2 = parseIsoUtcMs(args[1] ?? null);
          if (ms1 === null || ms2 === null) return null;
          return Math.round((ms1 - ms2) / 86_400_000);
        }
        default:
          return null;
      }
    }
  }
}

/**
 * Evaluates all formula columns on a dataset in topological column order without eval().
 * Returns a dataset copy with derived values populated (never mutates original rows).
 */
export function evaluateDatasetFormulas(dataset: Dataset): Dataset {
  const formulaCols = dataset.columns.filter((c) => Boolean(c.formula && c.formula.trim()));
  if (formulaCols.length === 0) {
    return dataset;
  }

  const parsedAsts = new Map<string, AstNode>();
  for (const col of formulaCols) {
    try {
      const ast = new FormulaParser(tokenizeFormula(col.formula!)).parse();
      const refs = new Set<string>();
      collectRefs(ast, refs);
      parsedAsts.set(col.id, ast);
    } catch {
      // Invalid formula evaluates cells to null
    }
  }

  const nextRows: Row[] = dataset.rows.map((row) => {
    const nextValues: Record<string, CellValue> = { ...row.values };
    for (const col of formulaCols) {
      const ast = parsedAsts.get(col.id);
      if (!ast) {
        nextValues[col.id] = null;
        continue;
      }
      try {
        const res = evalAst(ast, nextValues, dataset.columns);
        nextValues[col.id] = res;
      } catch {
        nextValues[col.id] = null;
      }
    }
    return {
      ...row,
      values: nextValues,
    };
  });

  return {
    ...dataset,
    rows: nextRows,
  };
}
