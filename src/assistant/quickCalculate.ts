interface GroupResult {
  content: string;
  next: number;
}

function readGroup(source: string, start: number): GroupResult | null {
  if (source[start] !== '{') return null;
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) {
      return { content: source.slice(start + 1, index), next: index + 1 };
    }
  }
  return null;
}

function latexToArithmetic(source: string): string | null {
  let output = '';
  for (let index = 0; index < source.length;) {
    if (source.startsWith('\\left', index)) {
      index += 5;
      continue;
    }
    if (source.startsWith('\\right', index)) {
      index += 6;
      continue;
    }
    if (source.startsWith('\\frac', index)) {
      const numerator = readGroup(source, index + 5);
      if (!numerator) return null;
      const denominator = readGroup(source, numerator.next);
      if (!denominator) return null;
      const top = latexToArithmetic(numerator.content);
      const bottom = latexToArithmetic(denominator.content);
      if (!top || !bottom) return null;
      output += `((${top})/(${bottom}))`;
      index = denominator.next;
      continue;
    }
    if (source.startsWith('\\sqrt', index)) {
      const group = readGroup(source, index + 5);
      const radicand = group
        ? group.content
        : source[index + 5] && /[0-9.]/.test(source[index + 5])
          ? source[index + 5]
          : null;
      if (!radicand) return null;
      const value = latexToArithmetic(radicand);
      if (!value) return null;
      output += `sqrt(${value})`;
      index = group ? group.next : index + 6;
      continue;
    }
    if (source.startsWith('\\times', index)) {
      output += '*';
      index += 6;
      continue;
    }
    if (source.startsWith('\\cdot', index)) {
      output += '*';
      index += 5;
      continue;
    }
    if (source.startsWith('\\div', index)) {
      output += '/';
      index += 4;
      continue;
    }
    if (source[index] === '\\' && ',!;: '.includes(source[index + 1] ?? '')) {
      index += 2;
      continue;
    }

    const character = source[index];
    if (character === '{') output += '(';
    else if (character === '}') output += ')';
    else if (character === '×' || character === '·') output += '*';
    else if (character === '÷' || character === '⁄') output += '/';
    else if (character === '−' || character === '–' || character === '—') output += '-';
    else if (/\s/.test(character)) {
      index += 1;
      continue;
    } else if (/[0-9.+\-*/^()]/.test(character)) output += character;
    else return null;
    index += 1;
  }
  return output;
}

class ArithmeticParser {
  private index = 0;

  constructor(private readonly source: string) {}

  parse(): number {
    const value = this.parseAdditive();
    if (this.index !== this.source.length) throw new Error('Unexpected arithmetic token.');
    return value;
  }

  private current(): string | undefined {
    return this.source[this.index];
  }

  private parseAdditive(): number {
    let value = this.parseMultiplicative();
    while (this.current() === '+' || this.current() === '-') {
      const operator = this.source[this.index++];
      const right = this.parseMultiplicative();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }

  private parseMultiplicative(): number {
    let value = this.parseUnary();
    while (true) {
      if (this.current() === '*' || this.current() === '/') {
        const operator = this.source[this.index++];
        const right = this.parseUnary();
        value = operator === '*' ? value * right : value / right;
        continue;
      }
      if (this.startsPrimary()) {
        value *= this.parseUnary();
        continue;
      }
      break;
    }
    return value;
  }

  private parsePower(): number {
    const base = this.parsePrimary();
    if (this.current() !== '^') return base;
    this.index += 1;
    return base ** this.parseUnary();
  }

  private parseUnary(): number {
    if (this.current() === '+') {
      this.index += 1;
      return this.parseUnary();
    }
    if (this.current() === '-') {
      this.index += 1;
      return -this.parseUnary();
    }
    return this.parsePower();
  }

  private startsPrimary(): boolean {
    return this.current() === '(' ||
      this.source.startsWith('sqrt(', this.index) ||
      /[0-9.]/.test(this.current() ?? '');
  }

  private parsePrimary(): number {
    if (this.source.startsWith('sqrt(', this.index)) {
      this.index += 5;
      const value = this.parseAdditive();
      if (this.current() !== ')') throw new Error('Unclosed square root.');
      this.index += 1;
      return Math.sqrt(value);
    }
    if (this.current() === '(') {
      this.index += 1;
      const value = this.parseAdditive();
      if (this.current() !== ')') throw new Error('Unclosed parenthesis.');
      this.index += 1;
      return value;
    }
    const match = this.source.slice(this.index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (!match) throw new Error('Expected a number.');
    this.index += match[0].length;
    return Number(match[0]);
  }
}

function formatResult(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  const normalized = Math.abs(value) < 1e-12 ? 0 : Number(value.toPrecision(12));
  return String(normalized);
}

export function quickCalculate(latex: string): string | null {
  if (!latex.trim() || latex.includes('=') || /\\(?:int|sum|prod|lim)\b/.test(latex)) return null;
  const arithmetic = latexToArithmetic(latex);
  if (!arithmetic) return null;
  try {
    return formatResult(new ArithmeticParser(arithmetic).parse());
  } catch {
    return null;
  }
}

export function appendCalculatedResult(latex: string, result: string): string {
  const clean = latex.trimEnd();
  return clean.endsWith('=') ? `${clean}${result}` : `${clean}=${result}`;
}
