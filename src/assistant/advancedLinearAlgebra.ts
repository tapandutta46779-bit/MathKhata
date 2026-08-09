export type NumericMatrix = number[][];
export type LatexMatrix = string[][];

export interface ParsedLatexMatrix {
  cells: LatexMatrix;
  environment: string;
  start: number;
  end: number;
}

const MATRIX_PATTERN = /\\begin\{(p?matrix|bmatrix|Bmatrix|vmatrix|Vmatrix)\}([\s\S]*?)\\end\{\1\}/;

function scalarLatexToNumber(source: string): number | null {
  const clean = source.trim();
  const plain = clean.match(/^-?\d+(?:\.\d+)?$/);
  if (plain) return Number(plain[0]);
  if (clean === '\\pi') return Math.PI;
  const fraction = clean.match(/^\\frac\{(-?\d+(?:\.\d+)?)\}\{(-?\d+(?:\.\d+)?)\}$/);
  if (fraction && Number(fraction[2]) !== 0) return Number(fraction[1]) / Number(fraction[2]);
  const root = clean.match(/^(-?)\\sqrt\{(\d+(?:\.\d+)?)\}$/);
  if (root) return (root[1] ? -1 : 1) * Math.sqrt(Number(root[2]));
  return null;
}

export function parseLatexMatrix(latex: string): ParsedLatexMatrix | null {
  const match = latex.match(MATRIX_PATTERN);
  if (!match) return null;
  const cells = match[2]
    .split(/\\\\/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => row.split('&').map((cell) => cell.trim()));
  if (cells.length === 0 || cells.some((row) => row.length === 0 || row.some((cell) => !cell))) return null;
  const width = cells[0].length;
  if (cells.some((row) => row.length !== width)) return null;
  const start = match.index ?? 0;
  return { cells, environment: match[1], start, end: start + match[0].length };
}

export function parseNumericMatrix(latex: string): NumericMatrix | null {
  const parsed = parseLatexMatrix(latex);
  if (!parsed) return null;
  const rows = parsed.cells.map((row) => row.map(scalarLatexToNumber));
  if (rows.some((row) => row.some((value) => value === null))) return null;
  return rows as number[][];
}

export function symbolicDeterminantExpression(matrix: LatexMatrix): string {
  const size = matrix.length;
  if (!matrix.every((row) => row.length === size)) throw new Error('A determinant requires a square matrix.');
  if (size === 0) return '1';
  if (size === 1) return `(${matrix[0][0]})`;
  return matrix[0].map((entry, column) => {
    const minor = matrix.slice(1).map((row) => row.filter((_, index) => index !== column));
    const term = `((${entry})*(${symbolicDeterminantExpression(minor)}))`;
    return column % 2 === 0 ? term : `-(${term})`;
  }).join('+');
}

function normalized(value: number): number {
  if (Math.abs(value) < 1e-10) return 0;
  const rounded = Math.round(value);
  return Math.abs(value - rounded) < 1e-10 ? rounded : Number(value.toPrecision(10));
}

export function determinant(matrix: NumericMatrix): number {
  const size = matrix.length;
  if (!matrix.every((row) => row.length === size)) throw new Error('A determinant requires a square matrix.');
  const work = matrix.map((row) => [...row]);
  let sign = 1;
  let value = 1;
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(work[row][column]) > Math.abs(work[pivot][column])) pivot = row;
    }
    if (Math.abs(work[pivot][column]) < 1e-12) return 0;
    if (pivot !== column) {
      [work[pivot], work[column]] = [work[column], work[pivot]];
      sign *= -1;
    }
    const pivotValue = work[column][column];
    value *= pivotValue;
    for (let row = column + 1; row < size; row += 1) {
      const ratio = work[row][column] / pivotValue;
      for (let next = column + 1; next < size; next += 1) {
        work[row][next] -= ratio * work[column][next];
      }
    }
  }
  return normalized(sign * value);
}

export function rowReduce(matrix: NumericMatrix): NumericMatrix {
  const work = matrix.map((row) => [...row]);
  let pivotRow = 0;
  for (let column = 0; column < work[0].length && pivotRow < work.length; column += 1) {
    let pivot = pivotRow;
    for (let row = pivotRow + 1; row < work.length; row += 1) {
      if (Math.abs(work[row][column]) > Math.abs(work[pivot][column])) pivot = row;
    }
    if (Math.abs(work[pivot][column]) < 1e-12) continue;
    [work[pivotRow], work[pivot]] = [work[pivot], work[pivotRow]];
    const divisor = work[pivotRow][column];
    work[pivotRow] = work[pivotRow].map((value) => value / divisor);
    for (let row = 0; row < work.length; row += 1) {
      if (row === pivotRow) continue;
      const factor = work[row][column];
      work[row] = work[row].map((value, index) => value - factor * work[pivotRow][index]);
    }
    pivotRow += 1;
  }
  return work.map((row) => row.map(normalized));
}

export function transposeMatrix(matrix: NumericMatrix): NumericMatrix {
  if (!matrix.length || !matrix[0].length) throw new Error('A matrix cannot be empty.');
  return matrix[0].map((_, column) => matrix.map((row) => row[column]));
}

export function inverseMatrix(matrix: NumericMatrix): NumericMatrix {
  const size = matrix.length;
  if (!size || !matrix.every((row) => row.length === size)) throw new Error('A matrix inverse requires a square matrix.');
  const augmented = matrix.map((row, rowIndex) => [
    ...row,
    ...Array.from({ length: size }, (_, columnIndex) => rowIndex === columnIndex ? 1 : 0),
  ]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-12) throw new Error('This matrix is singular and has no inverse.');
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    augmented[column] = augmented[column].map((value) => value / divisor);
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      augmented[row] = augmented[row].map((value, index) => value - factor * augmented[column][index]);
    }
  }
  return augmented.map((row) => row.slice(size).map(normalized));
}

function numberLatex(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(value);
}

export function matrixToLatex(matrix: NumericMatrix): string {
  return `\\begin{bmatrix}${matrix.map((row) => row.map(numberLatex).join('&')).join('\\\\')}\\end{bmatrix}`;
}

export function requestedMatrixOperation(latex: string): 'determinant' | 'rref' | 'inverse' | 'transpose' | null {
  if (!MATRIX_PATTERN.test(latex)) return null;
  if (/\\det\b|\\begin\{[vV]matrix\}|\\left\|/.test(latex)) return 'determinant';
  if (/\\operatorname\{(?:rref|rowReduce)\}|\\mathrm\{rref\}|\brref\b/i.test(latex)) return 'rref';
  if (/\\operatorname\{(?:inv|inverse)\}|\\mathrm\{(?:inv|inverse)\}|\^\{-1\}/i.test(latex)) return 'inverse';
  if (/\\operatorname\{transpose\}|\\mathrm\{transpose\}|\^\{?(?:T|\\mathsf\{T\}|\\top)\}?/i.test(latex)) return 'transpose';
  return null;
}
