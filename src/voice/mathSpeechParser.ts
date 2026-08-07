import type { MathCandidate } from './types';

interface ParseResult {
  latex: string;
  unknownTokens: string[];
}

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

const ORDINALS: Record<string, string> = {
  first: '1',
  second: '2',
  third: '3',
  fourth: '4',
  fifth: '5',
  sixth: '6',
  seventh: '7',
  eighth: '8',
  ninth: '9',
  tenth: '10',
  eleventh: '11',
  twelfth: '12',
  nth: 'n',
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
  'α': '\\alpha',
  'β': '\\beta',
  'γ': '\\gamma',
  'δ': '\\delta',
  'ε': '\\epsilon',
  'θ': '\\theta',
  'λ': '\\lambda',
  'μ': '\\mu',
  'π': '\\pi',
  'ρ': '\\rho',
  'σ': '\\sigma',
  'φ': '\\phi',
  'ψ': '\\psi',
  'ω': '\\omega',
};

const UPPER_GREEK: Record<string, string> = {
  alpha: 'A',
  beta: 'B',
  gamma: '\\Gamma',
  delta: '\\Delta',
  theta: '\\Theta',
  lambda: '\\Lambda',
  sigma: '\\Sigma',
  phi: '\\Phi',
  psi: '\\Psi',
  omega: '\\Omega',
};

const DIRECT_UPPER_GREEK: Record<string, string> = {
  'Α': 'capital alpha',
  'Β': 'capital beta',
  'Γ': 'capital gamma',
  'Δ': 'capital delta',
  'Θ': 'capital theta',
  'Λ': 'capital lambda',
  'Σ': 'capital sigma',
  'Φ': 'capital phi',
  'Ψ': 'capital psi',
  'Ω': 'capital omega',
};

const FUNCTIONS: Record<string, string> = {
  sine: '\\sin',
  sin: '\\sin',
  cosine: '\\cos',
  cos: '\\cos',
  tangent: '\\tan',
  tan: '\\tan',
  secant: '\\sec',
  sec: '\\sec',
  cosecant: '\\csc',
  csc: '\\csc',
  cotangent: '\\cot',
  cot: '\\cot',
  logarithm: '\\log',
  log: '\\log',
  ln: '\\ln',
  NATURAL_LOG: '\\ln',
  exponential: '\\exp',
  exp: '\\exp',
  INVERSE_SINE: '\\sin^{-1}',
  INVERSE_COSINE: '\\cos^{-1}',
  INVERSE_TANGENT: '\\tan^{-1}',
};

const RELATIONS: Record<string, string> = {
  '=': ' = ',
  '≠': ' \\ne ',
  '<': ' < ',
  '>': ' > ',
  '≤': ' \\le ',
  '≥': ' \\ge ',
  '∈': ' \\in ',
  '∉': ' \\notin ',
  '⊂': ' \\subset ',
  '⊆': ' \\subseteq ',
  '⇒': ' \\Rightarrow ',
  '⇔': ' \\Leftrightarrow ',
};

function clock(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function preserveUpperGreek(input: string): string {
  return [...input].map((character) => DIRECT_UPPER_GREEK[character] ?? character).join('');
}

function normalize(input: string): string {
  return preserveUpperGreek(input)
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[’']/g, '')
    .replace(/\b(?:two|2)[\s-]*(?:by|x|×)[\s-]*(?:two|2)\s+matrix\b/g, ' MATRIX_2 ')
    .replace(/\bmatrix\s+(?:two|2)[\s-]*(?:by|x|×)[\s-]*(?:two|2)\b/g, ' MATRIX_2 ')
    .replace(/\b(?:three|3)[\s-]*(?:by|x|×)[\s-]*(?:three|3)\s+matrix\b/g, ' MATRIX_3 ')
    .replace(/\bmatrix\s+(?:three|3)[\s-]*(?:by|x|×)[\s-]*(?:three|3)\b/g, ' MATRIX_3 ')
    .replace(/\bcolumn vector\b/g, ' COLUMN_VECTOR ')
    .replace(/\bvector(?: of)?\b/g, ' VECTOR ')
    .replace(/\bpartial derivative\b/g, ' PARTIAL_DERIVATIVE ')
    .replace(/\b(?:inverse|arc)\s+sine\b/g, ' INVERSE_SINE ')
    .replace(/\b(?:inverse|arc)\s+cosine\b/g, ' INVERSE_COSINE ')
    .replace(/\b(?:inverse|arc)\s+tangent\b/g, ' INVERSE_TANGENT ')
    .replace(/\bnatural (?:log|logarithm)\b/g, ' NATURAL_LOG ')
    .replace(/\bintegration(?: of)?\b/g, ' integral ')
    .replace(/\bwhole thing over\b/g, ' WHOLE_OVER ')
    .replace(/\ball over\b/g, ' WHOLE_OVER ')
    .replace(/\b(?:is\s+)?not\s+(?:an?\s+)?element of\b/g, ' ∉ ')
    .replace(/\b(?:does\s+not|doesnt)\s+belong to\b/g, ' ∉ ')
    .replace(/\b(?:is\s+)?not in\b/g, ' ∉ ')
    .replace(/\b(?:is\s+)?(?:an?\s+)?element of\b/g, ' ∈ ')
    .replace(/\b(?:belongs|belong) to\b/g, ' ∈ ')
    .replace(/\b(?:is\s+)?(?:a\s+)?proper subset of\b/g, ' ⊂ ')
    .replace(/\b(?:is\s+)?(?:a\s+)?subset\s+(?:of\s+)?or\s+equal(?:s)?(?:\s+to)?\b/g, ' ⊆ ')
    .replace(/\b(?:is\s+)?(?:a\s+)?subset of\b/g, ' ⊆ ')
    .replace(/\bif and only if\b/g, ' ⇔ ')
    .replace(/\b(?:is\s+)?equivalent(?:\s+to)?\b/g, ' ⇔ ')
    .replace(/\bimplies\b/g, ' ⇒ ')
    .replace(/\bfor (?:every|all)\b/g, ' ∀ ')
    .replace(/\bthere exists?\b/g, ' ∃ ')
    .replace(/\bexists\b/g, ' ∃ ')
    .replace(/\bempty set\b/g, ' EMPTY_SET ')
    .replace(/\bunion\b/g, ' ∪ ')
    .replace(/\bintersection\b/g, ' ∩ ')
    .replace(/\bplus or minus\b/g, ' ± ')
    .replace(/\b(?:is\s+)?not equal(?:s)?(?:\s+to)?\b/g, ' ≠ ')
    .replace(/\b(?:is\s+)?less than or equal(?:s)?(?:\s+to)?\b/g, ' ≤ ')
    .replace(/\b(?:is\s+)?greater than or equal(?:s)?(?:\s+to)?\b/g, ' ≥ ')
    .replace(/\b(?:is\s+)?less than\b/g, ' < ')
    .replace(/\b(?:is\s+)?greater than\b/g, ' > ')
    .replace(/\b(?:is\s+)?equal(?:s)?(?:\s+to)?\b/g, ' = ')
    .replace(/\bmultiplication sign\b/g, ' × ')
    .replace(/\bmultiplied by\b/g, ' × ')
    .replace(/\btimes\b/g, ' × ')
    .replace(/\binto\b/g, ' × ')
    .replace(/\bdivided by\b/g, ' over ')
    .replace(/\bdivision sign\b/g, ' ÷ ')
    .replace(/\bdivide\b/g, ' ÷ ')
    .replace(/\braised to(?: the)? power of\b/g, ' POWER ')
    .replace(/\braised to\b/g, ' POWER ')
    .replace(/\bto the power of\b/g, ' POWER ')
    .replace(/\bto power\b/g, ' POWER ')
    .replace(/\bpower of\b/g, ' POWER ')
    .replace(/\bsuperscript\b/g, ' POWER ')
    .replace(/\bsquare root(?: of)?\b/g, ' SQRT ')
    .replace(/\bcube root(?: of)?\b/g, ' CBRT ')
    .replace(/\b([a-z]+|\d+(?:st|nd|rd|th)?)\s+root(?:\s+of)?\b/g, ' INDEX_ROOT $1 ')
    .replace(/\bsquare\b/g, ' squared ')
    .replace(/\bopen (?:parenthesis|parentheses|bracket)\b/g, ' ( ')
    .replace(/\bclose (?:parenthesis|parentheses|bracket)\b/g, ' ) ')
    .replace(/\babsolute of\b/g, ' absolute value of ')
    .replace(/\b(?:approaches|approach|tends to|goes to)\b/g, ' APPROACHES ')
    .replace(/\bupper\s*case\b/g, ' capital ')
    .replace(/\bpie\b/g, ' pi ')
    .replace(/\bnext row\b/g, ' ROW_BREAK ')
    .replace(/\bnew row\b/g, ' ROW_BREAK ')
    .replace(/\bcomma\b/g, ' ENTRY_BREAK ')
    .replace(/\bnegative\b/g, ' NEG ')
    .replace(/\bpoint\b/g, ' DECIMAL ')
    .replace(/(\d)\.(\d)/g, '$1 DECIMAL $2')
    .replace(/√/g, ' SQRT ')
    .replace(/∛/g, ' CBRT ')
    .replace(/∞/g, ' infinity ')
    .replace(/∫/g, ' integral ')
    .replace(/∑/g, ' summation ')
    .replace(/∏/g, ' product ')
    .replace(/²/g, ' squared ')
    .replace(/³/g, ' cubed ')
    .replace(/\^/g, ' POWER ')
    .replace(/\+/g, ' plus ')
    .replace(/[−–—-]/g, ' minus ')
    .replace(/\*/g, ' × ')
    .replace(/[/⁄]/g, ' over ')
    .replace(/[,.?!;:]/g, ' ')
    .replace(/([()=<> ±×÷≤≥≠∈∉⊂⊆∪∩⇒⇔∀∃])/g, ' $1 ')
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

function readDecimals(tokens: string[], start: number): { value: string; next: number } {
  let index = start;
  let value = '';
  while (index < tokens.length) {
    const token = tokens[index];
    if (/^\d+$/.test(token)) {
      value += token;
      index += 1;
      continue;
    }
    const decimal = SMALL_NUMBERS[token];
    if (decimal === undefined || decimal > 9) break;
    value += String(decimal);
    index += 1;
  }
  return { value, next: index };
}

function readNumber(tokens: string[], start: number): NumberResult | null {
  const numeric = tokens[start];
  if (/^\d+$/.test(numeric ?? '')) {
    let next = start + 1;
    let value = numeric;
    if (tokens[next] === 'DECIMAL') {
      const decimals = readDecimals(tokens, next + 1);
      if (decimals.value) {
        value += `.${decimals.value}`;
        next = decimals.next;
      }
    }
    return { value, next };
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
    } else if (token === 'and' && found) {
      index += 1;
      continue;
    } else {
      break;
    }
    index += 1;
  }
  if (!found) return null;

  let value = String(total + current);
  if (tokens[index] === 'DECIMAL') {
    const decimals = readDecimals(tokens, index + 1);
    if (decimals.value) {
      value += `.${decimals.value}`;
      index = decimals.next;
    }
  }
  return { value, next: index };
}

function rootIndex(token: string | undefined): string | null {
  if (!token) return null;
  if (token in ORDINALS) return ORDINALS[token];
  const digits = token.match(/^(\d+)(?:st|nd|rd|th)?$/);
  return digits?.[1] ?? null;
}

function renderUnknown(token: string): string {
  const printable = token.toLowerCase().replace(/[^a-z0-9]/g, '') || 'unknown';
  return `\\operatorname{${printable}}`;
}

class ExpressionParser {
  private index = 0;
  readonly unknownTokens = new Set<string>();

  constructor(private readonly tokens: string[]) {}

  parse(): string {
    let latex = this.parseRelation().trim();
    while (this.index < this.tokens.length) {
      const token = this.consume();
      this.unknownTokens.add(token);
      latex += `${latex ? ' \\;' : ''}${renderUnknown(token)}`;
    }
    return latex;
  }

  private current(): string | undefined {
    return this.tokens[this.index];
  }

  private consume(): string {
    return this.tokens[this.index++] ?? '';
  }

  private parseRelation(): string {
    let left = this.parseUnion();
    while (this.current() && this.current()! in RELATIONS) {
      const operator = RELATIONS[this.consume()];
      left += operator + this.parseUnion();
    }
    return left;
  }

  private parseUnion(): string {
    let left = this.parseIntersection();
    while (this.current() === '∪') {
      this.consume();
      left += ` \\cup ${this.parseIntersection()}`;
    }
    return left;
  }

  private parseIntersection(): string {
    let left = this.parseAdditive();
    while (this.current() === '∩') {
      this.consume();
      left += ` \\cap ${this.parseAdditive()}`;
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
      if (this.current() === '÷') {
        this.consume();
        left += ` \\div ${this.parsePower()}`;
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
        const exponent = this.startsAtom(this.current()) ? this.parseUnary() : '\\placeholder{}';
        base += `^{${exponent}}`;
      } else {
        break;
      }
    }
    return base;
  }

  private parseUnary(): string {
    if (this.current() === 'NEG' || this.current() === 'minus') {
      this.consume();
      return `-${this.parseUnary()}`;
    }
    if (this.current() === 'plus') {
      this.consume();
      return this.parseUnary();
    }
    if (this.current() === '∀' || this.current() === '∃') {
      const quantifier = this.consume() === '∀' ? '\\forall' : '\\exists';
      const subject = this.startsAtom(this.current()) ? this.parseUnary() : '\\placeholder{}';
      return `${quantifier} ${subject}`;
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
      const radicand = this.parseAdditive() || '\\placeholder{}';
      return token === 'SQRT' ? `\\sqrt{${radicand}}` : `\\sqrt[3]{${radicand}}`;
    }

    if (token === 'INDEX_ROOT') {
      this.consume();
      const index = rootIndex(this.current());
      if (index) this.consume();
      if (this.current() === 'of') this.consume();
      const radicand = this.parseAdditive() || '\\placeholder{}';
      if (!index) this.unknownTokens.add(this.current() ?? 'root index');
      return `\\sqrt[${index ?? '\\placeholder{}'}]{${radicand}}`;
    }

    if (token === 'absolute') {
      this.consume();
      if (this.current() === 'value') this.consume();
      if (this.current() === 'of') this.consume();
      return `\\left|${this.parseAdditive() || '\\placeholder{}'}\\right|`;
    }

    if (token in FUNCTIONS) {
      this.consume();
      if ((token === 'log' || token === 'logarithm') && this.current() === 'base') {
        this.consume();
        const base = this.startsAtom(this.current()) ? this.parsePower() : '\\placeholder{}';
        if (this.current() === 'of') this.consume();
        const argument = this.startsAtom(this.current()) ? this.parsePower() : '\\placeholder{}';
        return `\\log_{${base}}\\left(${argument}\\right)`;
      }
      if (this.current() === 'of') this.consume();
      const argument = this.startsAtom(this.current()) ? this.parsePower() : '';
      return argument ? `${FUNCTIONS[token]}\\left(${argument}\\right)` : FUNCTIONS[token];
    }

    if (token === 'VECTOR') {
      this.consume();
      if (this.current() === 'of') this.consume();
      const argument = this.startsAtom(this.current()) ? this.parseUnary() : '\\placeholder{}';
      return `\\vec{${argument}}`;
    }

    if (token === 'capital') {
      this.consume();
      const name = this.consume();
      if (name in UPPER_GREEK) return UPPER_GREEK[name];
      if (/^[a-z]$/.test(name)) return name.toUpperCase();
      this.unknownTokens.add(name || 'capital');
      return renderUnknown(name || 'capital');
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
    if (token === 'EMPTY_SET') {
      this.consume();
      return '\\varnothing';
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
    return renderUnknown(token);
  }

  private startsAtom(token: string | undefined): boolean {
    if (!token) return false;
    return (
      token === '(' ||
      token === 'SQRT' ||
      token === 'CBRT' ||
      token === 'INDEX_ROOT' ||
      token === 'absolute' ||
      token === 'NEG' ||
      token === 'minus' ||
      token === 'infinity' ||
      token === 'EMPTY_SET' ||
      token === 'VECTOR' ||
      token === 'capital' ||
      token === '∀' ||
      token === '∃' ||
      token in FUNCTIONS ||
      token in GREEK ||
      token in SMALL_NUMBERS ||
      token in TENS ||
      /^\d+$/.test(token) ||
      /^[a-z]$/.test(token)
    );
  }
}

function parseTokens(tokens: string[]): ParseResult {
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

function withoutLeadingOf(tokens: string[]): string[] {
  return tokens[0] === 'of' ? tokens.slice(1) : tokens;
}

function parseBoundedOperator(tokens: string[]): ParseResult | null {
  const operator = tokens[0];
  if (operator !== 'integral' && operator !== 'sum' && operator !== 'summation' && operator !== 'product') {
    return null;
  }
  const symbol = operator === 'integral' ? '\\int' : operator === 'product' ? '\\prod' : '\\sum';
  if (tokens[1] !== 'from') {
    const body = parseTokens(withoutLeadingOf(tokens.slice(1)));
    return { latex: `${symbol}${body.latex ? ` ${body.latex}` : ''}`, unknownTokens: body.unknownTokens };
  }
  const toIndex = tokens.indexOf('to', 2);
  if (toIndex < 0) return null;
  const lower = parseTokens(tokens.slice(2, toIndex));
  const upper = readBound(tokens, toIndex + 1);
  const body = parseTokens(withoutLeadingOf(tokens.slice(upper.next)));
  return {
    latex: `${symbol}_{${lower.latex}}^{${upper.latex}}${body.latex ? ` ${body.latex}` : ''}`,
    unknownTokens: [...lower.unknownTokens, ...upper.unknownTokens, ...body.unknownTokens],
  };
}

function parseDerivative(tokens: string[]): ParseResult | null {
  const partial = tokens[0] === 'PARTIAL_DERIVATIVE';
  if (!partial && tokens[0] !== 'derivative') return null;
  let bodyTokens = tokens.slice(1);
  if (bodyTokens[0] === 'of') bodyTokens = bodyTokens.slice(1);
  const respectIndex = bodyTokens.findIndex(
    (token, index) => token === 'with' && bodyTokens[index + 1] === 'respect' && bodyTokens[index + 2] === 'to',
  );
  let variable = 'x';
  let variableUnknown: string[] = [];
  if (respectIndex >= 0) {
    const parsedVariable = parseTokens(bodyTokens.slice(respectIndex + 3));
    variable = parsedVariable.latex || 'x';
    variableUnknown = parsedVariable.unknownTokens;
    bodyTokens = bodyTokens.slice(0, respectIndex);
  }
  const body = parseNormalized(bodyTokens);
  const operator = partial
    ? `\\frac{\\partial}{\\partial ${variable}}`
    : `\\frac{d}{d${variable}}`;
  return {
    latex: body.latex ? `${operator}\\left(${body.latex}\\right)` : operator,
    unknownTokens: [...body.unknownTokens, ...variableUnknown],
  };
}

function parseLimit(tokens: string[]): ParseResult | null {
  if (tokens[0] !== 'limit') return null;
  const approachIndex = tokens.indexOf('APPROACHES');
  if (approachIndex < 0) {
    const remainder = parseTokens(withoutLeadingOf(tokens.slice(1)));
    return {
      latex: `\\lim${remainder.latex ? ` ${remainder.latex}` : ''}`,
      unknownTokens: remainder.unknownTokens,
    };
  }
  const ofIndex = tokens.indexOf('of', approachIndex + 1);
  const variableStart = tokens[1] === 'as' ? 2 : 1;
  const variable = parseTokens(tokens.slice(variableStart, approachIndex));
  const targetEnd = ofIndex >= 0 ? ofIndex : tokens.length;
  const target = parseTokens(tokens.slice(approachIndex + 1, targetEnd));
  const body = parseNormalized(ofIndex >= 0 ? tokens.slice(ofIndex + 1) : []);
  return {
    latex: `\\lim_{${variable.latex}\\to${target.latex}}${body.latex ? ` ${body.latex}` : ''}`,
    unknownTokens: [...variable.unknownTokens, ...target.unknownTokens, ...body.unknownTokens],
  };
}

function splitMatrixCells(tokens: string[]): string[][] {
  let rest = tokens;
  if (rest[0] === 'with' && (rest[1] === 'entries' || rest[1] === 'entry')) rest = rest.slice(2);
  if (rest.some((token) => token === 'ENTRY_BREAK' || token === 'ROW_BREAK')) {
    const cells: string[][] = [];
    let cell: string[] = [];
    for (const token of rest) {
      if (token === 'ENTRY_BREAK' || token === 'ROW_BREAK') {
        if (cell.length) cells.push(cell);
        cell = [];
      } else {
        cell.push(token);
      }
    }
    if (cell.length) cells.push(cell);
    return cells;
  }
  return rest.map((token) => [token]);
}

function parseMatrix(tokens: string[]): ParseResult | null {
  const kind = tokens[0];
  if (kind !== 'MATRIX_2' && kind !== 'MATRIX_3' && kind !== 'COLUMN_VECTOR') return null;

  const dimensions = kind === 'MATRIX_2' ? [2, 2] : kind === 'MATRIX_3' ? [3, 3] : null;
  const rawCells = splitMatrixCells(tokens.slice(1));
  const parsedCells = rawCells.map((cell) => parseTokens(cell));
  const unknownTokens = parsedCells.flatMap((cell) => cell.unknownTokens);

  if (kind === 'COLUMN_VECTOR') {
    const cells = parsedCells.map((cell) => cell.latex);
    while (cells.length < 2) cells.push('\\placeholder{}');
    return {
      latex: `\\begin{pmatrix}${cells.join('\\\\')}\\end{pmatrix}`,
      unknownTokens,
    };
  }

  const [rows, columns] = dimensions!;
  const expectedCells = rows * columns;
  const cells = parsedCells.slice(0, expectedCells).map((cell) => cell.latex);
  while (cells.length < expectedCells) cells.push('\\placeholder{}');
  for (const extraCell of rawCells.slice(expectedCells)) unknownTokens.push(...extraCell);
  const renderedRows = Array.from({ length: rows }, (_, row) =>
    cells.slice(row * columns, (row + 1) * columns).join('&'),
  );
  return {
    latex: `\\begin{pmatrix}${renderedRows.join('\\\\')}\\end{pmatrix}`,
    unknownTokens,
  };
}

function parseDeterminant(tokens: string[]): ParseResult | null {
  if (tokens[0] !== 'determinant') return null;
  const body = parseNormalized(withoutLeadingOf(tokens.slice(1)));
  return {
    latex: `\\det\\left(${body.latex || '\\placeholder{}'}\\right)`,
    unknownTokens: body.unknownTokens,
  };
}

function parseNormalized(tokens: string[]): ParseResult {
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

  return (
    parseDeterminant(tokens) ??
    parseMatrix(tokens) ??
    parseLimit(tokens) ??
    parseBoundedOperator(tokens) ??
    parseDerivative(tokens) ??
    parseTokens(tokens)
  );
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
