export type NumericMatrix = number[][];

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

export function parseNumericMatrix(latex: string): NumericMatrix | null {
  const match = latex.match(MATRIX_PATTERN);
  if (!match) return null;
  const rows = match[2]
    .split(/\\\\/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => row.split('&').map(scalarLatexToNumber));
  if (rows.length === 0 || rows.some((row) => row.length === 0 || row.some((value) => value === null))) {
    return null;
  }
  const width = rows[0].length;
  if (rows.some((row) => row.length !== width)) return null;
  return rows as number[][];
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

function numberLatex(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(value);
}

export function matrixToLatex(matrix: NumericMatrix): string {
  return `\\begin{bmatrix}${matrix.map((row) => row.map(numberLatex).join('&')).join('\\\\')}\\end{bmatrix}`;
}

export function requestedMatrixOperation(latex: string): 'determinant' | 'rref' | null {
  if (!MATRIX_PATTERN.test(latex)) return null;
  if (/\\det\b|\\begin\{[vV]matrix\}|\\left\|/.test(latex)) return 'determinant';
  if (/\\operatorname\{(?:rref|rowReduce)\}|\\mathrm\{rref\}|\brref\b/i.test(latex)) return 'rref';
  return null;
}
