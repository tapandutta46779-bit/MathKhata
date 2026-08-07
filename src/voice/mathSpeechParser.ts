import type { MathCandidate } from './types';

const SMALL_NUMBERS: Record<string, number> = {
  zero: 0,
  oh: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const GREEK: Record<string, string> = {
  alpha: '\\alpha',
  beta: '\\beta',
  gamma: '\\gamma',
  delta: '\\delta',
  epsilon: '\\epsilon',
  theta: '\\theta',
  lambda: '\\lambda',
  mu: '\\mu',
  pi: '\\pi',
  rho: '\\rho',
  sigma: '\\sigma',
  phi: '\\phi',
  psi: '\\psi',
  omega: '\\omega',
};

const FUNCTIONS: Record<string, string> = {
  sine: '\\sin',
  sin: '\\sin',
  cosine: '\\cos',
  cos: '\\cos',
  tangent: '\\tan',
  tan: '\\tan',
  logarithm: '\\log',
  log: '\\log',
  ln: '\\ln',
  exponential: '\\exp',
  exp: '\\exp',
};

const RELATIONS: Record<string, string> = {
  '=': ' = ',
  '≠': ' \\ne ',
  '<': ' < ',
  '>': ' > ',
  '≤': ' \\le ',
  '≥': ' \\ge ',
};

function clock(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[’']/g, '')
    .replace(/\bwhole thing over\b/g, ' WHOLE_OVER ')
    .replace(/\ball over\b/g, ' WHOLE_OVER ')
    .replace(/\bplus or minus\b/g, ' ± ')
    .replace(/\bnot equal(?:s)?(?: to)?\b/g, ' ≠ ')
    .replace(/\bless than or equal(?:s)?(?: to)?\b/g, ' ≤ ')
    .replace(/\bgreater than or equal(?:s)?(?: to)?\b/g, ' ≥ ')
    .replace(/\bless than\b/g, ' < ')
    .replace(/\bgreater than\b/g, ' > ')
    .replace(/\bequal(?:s)?(?: to)?\b/g, ' = ')
    .replace(/\bmultiplied by\b/g, ' × ')
    .replace(/\btimes\b/g, ' × ')
    .replace(/\bdivided by\b/g, ' over ')
    .replace(/\bto the power of\b/g, ' POWER ')
    .replace(/\bto power\b/g, ' POWER ')
    .replace(/\bpower of\b/g, ' POWER ')
    .replace(/\bsquare root of\b/g, ' SQRT ')
    .replace(/\bsquare root\b/g, ' SQRT ')
    .replace(/\bcube root of\b/g, ' CBRT ')
    .replace(/\bcube root\b/g, ' CBRT ')
    .replace(/\bopen (?:parenthesis|parentheses|bracket)\b/g, ' ( ')
    .replace(/\bclose (?:parenthesis|parentheses|bracket)\b/g, ' ) ')
    .replace(/\bnegative\b/g, ' NEG ')
    .replace(/\bpoint\b/g, ' DECIMAL ')
    .replace(/[,.?]/g, ' ')
    .replace(/([()=<>±×≤≥])/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(input: string): string[] {
  return normalize(input).split(' ').filter(Boolean);
}

interface NumberResult {
  value: string;
  next: number;
}

function readNumber(tokens: string[], start: number): NumberResult | null {
  const numeric = tokens[start];
  if (/^\d+(?:\.\d+)?$/.test(numeric ?? '')) {
    return { value: numeric, next: start + 1 };
  }
  let index = start;
  let total = 0;
  let current = 0;
  let found = false;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token in SMALL_NUMBERS) {
      current += SMALL_NUMBERS[token];
      found = true;
    } else if (token in TENS) {
      current += TENS[token];
      found = true;
    } else if (token === 'hundred') {
      current = Math.max(1, current) * 100;
      found = true;
    } else if (token === 'thousand') {
      total += Math.max(1, current) * 1_000;
      current = 0;
      found = true;
    } else if (token === 'million') {
      total = (total + Math.max(1, current)) * 1_000_000;
      current = 0;
      found = true;
    } else {
      break;
    }
    index += 1;
  }
  if (!found) return null;
  let value = String(total + current);
  if (tokens[index] === 'DECIMAL') {
    index += 1;
    let decimals = '';
    while (index < tokens.length) {
      const decimal = SMALL_NUMBERS[tokens[index]];
      if (decimal === undefined || decimal > 9) break;
      decimals += String(decimal);
      index += 1;
    }
    if (decimals) value += `.${decimals}`;
  }
  return { value, next: index };
}

class ExpressionParser {
  private index = 0;
  readonly unknownTokens = new Set<string>();

  constructor(private readonly tokens: string[]) {}

  parse(): string {
    return this.parseRelation().trim();
  }

  private current(): string | undefined {
    return this.tokens[this.index];
  }

  private consume(): string {
    return this.tokens[this.index++] ?? '';
  }

  private parseRelation(): string {
    let left = this.parseAdditive();
    while (this.current() && this.current()! in RELATIONS) {
      const operator = RELATIONS[this.consume()];
      left += operator + this.parseAdditive();
    }
    return left;
  }

  private parseAdditive(): string {
    let left = this.parseTerm();
    while (this.current() === 'plus' || this.current() === 'minus' || this.current() === '±') {
      const token = this.consume();
      const operator = token === 'plus' ? ' + ' : token === 'minus' ? ' - ' : ' \\pm ';
      left += operator + this.parseTerm();
    }
    return left;
  }

  private parseTerm(): string {
    let left = this.parsePower();
    while (this.index < this.tokens.length) {
      if (this.current() === '×') {
        this.consume();
        left += ` \\times ${this.parsePower()}`;
        continue;
      }
      if (this.current() === 'over') {
        this.consume();
        left = `\\frac{${left}}{${this.parseTerm()}}`;
        continue;
      }
      if (this.current() === 'd' && /^[a-z]$/.test(this.tokens[this.index + 1] ?? '')) {
        this.consume();
        left += `\\,d${this.consume()}`;
        continue;
      }
      if (this.startsAtom(this.current())) {
        left += this.parsePower();
        continue;
      }
      break;
    }
    return left;
  }

  private parsePower(): string {
    let base = this.parseUnary();
    while (this.index < this.tokens.length) {
      if (this.current() === 'squared') {
        this.consume();
        base += '^2';
      } else if (this.current() === 'cubed') {
        this.consume();
        base += '^3';
      } else if (this.current() === 'POWER' || this.current() === 'power') {
        this.consume();
        const exponent = this.parseUnary();
        base += `^{${exponent}}`;
      } else {
        break;
      }
    }
    return base;
  }

  private parseUnary(): string {
    if (this.current() === 'NEG') {
      this.consume();
      return `-${this.parseUnary()}`;
    }
    return this.parseAtom();
  }

  private parseAtom(): string {
    const token = this.current();
    if (!token) return '';

    if (token === '(') {
      this.consume();
      const start = this.index;
      let depth = 1;
      while (this.index < this.tokens.length && depth > 0) {
        if (this.current() === '(') depth += 1;
        if (this.current() === ')') depth -= 1;
        if (depth > 0) this.index += 1;
      }
      const innerTokens = this.tokens.slice(start, this.index);
      if (this.current() === ')') this.consume();
      const parser = new ExpressionParser(innerTokens);
      const inner = parser.parse();
      parser.unknownTokens.forEach((item) => this.unknownTokens.add(item));
      return `\\left(${inner}\\right)`;
    }

    if (token === 'SQRT' || token === 'CBRT') {
      this.consume();
      const radicand = this.parseAdditive();
      return token === 'SQRT' ? `\\sqrt{${radicand}}` : `\\sqrt[3]{${radicand}}`;
    }

    if (token === 'absolute') {
      this.consume();
      if (this.current() === 'value') this.consume();
      if (this.current() === 'of') this.consume();
      return `\\left|${this.parseAdditive()}\\right|`;
    }

    if (token in FUNCTIONS) {
      this.consume();
      if (this.current() === 'of') this.consume();
      const argument = this.startsAtom(this.current()) ? this.parsePower() : '';
      return argument ? `${FUNCTIONS[token]}\\left(${argument}\\right)` : FUNCTIONS[token];
    }

    const number = readNumber(this.tokens, this.index);
    if (number) {
      this.index = number.next;
      return number.value;
    }

    if (token === 'infinity') {
      this.consume();
      return '\\infty';
    }
    if (token in GREEK) {
      this.consume();
      return GREEK[token];
    }
    if (/^[a-z]$/.test(token)) {
      this.consume();
      return token;
    }

    this.unknownTokens.add(token);
    this.consume();
    return `\\operatorname{${token.replace(/[^a-z0-9]/g, '')}}`;
  }

  private startsAtom(token: string | undefined): boolean {
    if (!token) return false;
    return (
      token === '(' ||
      token === 'SQRT' ||
      token === 'CBRT' ||
      token === 'absolute' ||
      token === 'NEG' ||
      token === 'infinity' ||
      token in FUNCTIONS ||
      token in GREEK ||
      token in SMALL_NUMBERS ||
      token in TENS ||
      /^\d+(?:\.\d+)?$/.test(token) ||
      /^[a-z]$/.test(token)
    );
  }
}

function parseTokens(tokens: string[]): { latex: string; unknownTokens: string[] } {
  const parser = new ExpressionParser(tokens);
  return { latex: parser.parse(), unknownTokens: [...parser.unknownTokens] };
}

function readBound(tokens: string[], start: number): { latex: string; next: number; unknownTokens: string[] } {
  const number = readNumber(tokens, start);
  if (number) return { latex: number.value, next: number.next, unknownTokens: [] };
  const token = tokens[start];
  if (token === 'infinity') return { latex: '\\infty', next: start + 1, unknownTokens: [] };
  if (token && (token in GREEK || /^[a-z]$/.test(token))) {
    return { latex: GREEK[token] ?? token, next: start + 1, unknownTokens: [] };
  }
  return { latex: '', next: start, unknownTokens: token ? [token] : [] };
}

function parseBoundedOperator(tokens: string[]): { latex: string; unknownTokens: string[] } | null {
  const operator = tokens[0];
  if (operator !== 'integral' && operator !== 'sum' && operator !== 'summation' && operator !== 'product') {
    return null;
  }
  const symbol =
    operator === 'integral' ? '\\int' : operator === 'product' ? '\\prod' : '\\sum';
  if (tokens[1] !== 'from') {
    const body = parseTokens(tokens.slice(1));
    return { latex: `${symbol} ${body.latex}`, unknownTokens: body.unknownTokens };
  }
  const toIndex = tokens.indexOf('to', 2);
  if (toIndex < 0) return null;
  const lower = parseTokens(tokens.slice(2, toIndex));
  const upper = readBound(tokens, toIndex + 1);
  const body = parseTokens(tokens.slice(upper.next));
  return {
    latex: `${symbol}_{${lower.latex}}^{${upper.latex}}${body.latex ? ` ${body.latex}` : ''}`,
    unknownTokens: [...lower.unknownTokens, ...upper.unknownTokens, ...body.unknownTokens],
  };
}

function parseDerivative(tokens: string[]): { latex: string; unknownTokens: string[] } | null {
  if (tokens[0] !== 'derivative') return null;
  let bodyTokens = tokens.slice(1);
  if (bodyTokens[0] === 'of') bodyTokens = bodyTokens.slice(1);
  const respectIndex = bodyTokens.findIndex((token, index) => token === 'with' && bodyTokens[index + 1] === 'respect');
  let variable = 'x';
  if (respectIndex >= 0) {
    const possible = bodyTokens.at(-1);
    if (possible && /^[a-z]$/.test(possible)) variable = possible;
    bodyTokens = bodyTokens.slice(0, respectIndex);
  }
  const body = parseTokens(bodyTokens);
  return {
    latex: `\\frac{d}{d${variable}}\\left(${body.latex}\\right)`,
    unknownTokens: body.unknownTokens,
  };
}

function parseNormalized(tokens: string[]) {
  const groupedOver = tokens.indexOf('WHOLE_OVER');
  if (groupedOver >= 0) {
    const left = tokens.slice(0, groupedOver);
    const right = parseTokens(tokens.slice(groupedOver + 1));
    const relationIndex = left.findIndex((token) => token in RELATIONS);
    if (relationIndex >= 0) {
      const lhs = parseTokens(left.slice(0, relationIndex));
      const numerator = parseTokens(left.slice(relationIndex + 1));
      return {
        latex: `${lhs.latex}${RELATIONS[left[relationIndex]]}\\frac{${numerator.latex}}{${right.latex}}`,
        unknownTokens: [...lhs.unknownTokens, ...numerator.unknownTokens, ...right.unknownTokens],
      };
    }
    const numerator = parseTokens(left);
    return {
      latex: `\\frac{${numerator.latex}}{${right.latex}}`,
      unknownTokens: [...numerator.unknownTokens, ...right.unknownTokens],
    };
  }

  return parseBoundedOperator(tokens) ?? parseDerivative(tokens) ?? parseTokens(tokens);
}

export function parseMathSpeech(
  transcript: string,
  recognitionTimestamp = clock(),
  isFinal = true,
): MathCandidate {
  const parserStartTimestamp = clock();
  const tokens = tokenize(transcript);
  const parsed = parseNormalized(tokens);
  const parserFinishTimestamp = clock();
  const ambiguities: string[] = [];
  if (/\bsquare root of\b/i.test(transcript) && /\b(?:plus|minus)\b/i.test(transcript)) {
    ambiguities.push(
      'A root phrase followed by addition or subtraction is grouped inside the root. Edit the candidate if you intended the operation outside it.',
    );
  }
  return {
    transcript,
    latex: parsed.latex,
    confidence: parsed.unknownTokens.length ? 0.55 : ambiguities.length ? 0.78 : 0.92,
    ambiguities,
    unknownTokens: [...new Set(parsed.unknownTokens)],
    isFinal,
    latency: {
      recognitionTimestamp,
      parserStartTimestamp,
      parserFinishTimestamp,
      recognitionToCandidateMs: Math.max(0, parserFinishTimestamp - recognitionTimestamp),
    },
  };
}

export function markCandidateRendered(candidate: MathCandidate, renderTimestamp = clock()): MathCandidate {
  return {
    ...candidate,
    latency: {
      ...candidate.latency,
      renderTimestamp,
      candidateToRenderMs: Math.max(0, renderTimestamp - candidate.latency.parserFinishTimestamp),
      totalVisibleLatencyMs: Math.max(0, renderTimestamp - candidate.latency.recognitionTimestamp),
    },
  };
}

