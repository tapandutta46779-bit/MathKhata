type Scope = Record<string, number>;
type Node = (scope: Scope) => number;

// Interpret a small numerical grammar rather than generating JavaScript. This
// works under the production CSP and never grants expressions code execution.
const functions: Record<string, (...args: number[]) => number> = {
  abs: Math.abs, acos: Math.acos, acosh: Math.acosh, asin: Math.asin, asinh: Math.asinh,
  atan: Math.atan, atanh: Math.atanh, atan2: Math.atan2, ceil: Math.ceil,
  cos: Math.cos, cosh: Math.cosh, exp: Math.exp, floor: Math.floor,
  log: (x, base) => base === undefined ? Math.log(x) : Math.log(x) / Math.log(base),
  log10: Math.log10, max: Math.max, min: Math.min, mod: (a, b) => a % b,
  sin: Math.sin, sinh: Math.sinh, sqrt: Math.sqrt, tan: Math.tan, tanh: Math.tanh,
  sign: Math.sign, sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x),
  cot: (x) => 1 / Math.tan(x), sech: (x) => 1 / Math.cosh(x),
  csch: (x) => 1 / Math.sinh(x), coth: (x) => 1 / Math.tanh(x),
};

export function compileNumericProgram(source: string): Node {
  const tokens = source.match(/(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|[+*/^(),-]/g) ?? [];
  if (tokens.join('') !== source.replace(/\s/g, '') || tokens.length > 2048) throw new Error('Unsupported numerical grammar');
  let cursor = 0;
  const take = (value: string) => { if (tokens[cursor] === value) { cursor++; return true; } return false; };
  const requireToken = (value: string) => { if (!take(value)) throw new Error(`Expected ${value}`); };
  function expression(minimum = 0, depth = 0): Node {
    if (depth > 128) throw new Error('Expression is too deeply nested');
    const token = tokens[cursor++];
    let left: Node;
    if (token === '+' || token === '-') {
      const child = expression(3, depth + 1);
      left = token === '-' ? (scope) => -child(scope) : child;
    } else if (token === '(') {
      left = expression(0, depth + 1); requireToken(')');
    } else if (token && /^(\d|\.)/.test(token)) {
      const value = Number(token); left = () => value;
    } else if (token && /^[A-Za-z_]/.test(token)) {
      if (take('(')) {
        if (!Object.hasOwn(functions, token)) throw new Error('Unsupported numerical function');
        const fn = functions[token]; const args: Node[] = [];
        if (!take(')')) { do { args.push(expression(0, depth + 1)); } while (take(',')); requireToken(')'); }
        left = args.length === 1 ? (scope) => fn(args[0](scope))
          : (scope) => fn(...args.map((arg) => arg(scope)));
      } else {
        left = token === 'pi' ? () => Math.PI : token === 'e' ? () => Math.E
          : (scope) => Object.hasOwn(scope, token) ? scope[token] : Number.NaN;
      }
    } else throw new Error('Expected a numerical expression');
    while (cursor < tokens.length) {
      const operator = tokens[cursor];
      const precedence = operator === '+' || operator === '-' ? 1 : operator === '*' || operator === '/' ? 2 : operator === '^' ? 4 : -1;
      if (precedence < minimum) break;
      cursor++;
      const exponentStart = cursor;
      const a = left; const b = expression(precedence + (operator === '^' ? 0 : 1), depth + 1);
      if (operator === '+') left = (scope) => a(scope) + b(scope);
      else if (operator === '-') left = (scope) => a(scope) - b(scope);
      else if (operator === '*') left = (scope) => a(scope) * b(scope);
      else if (operator === '/') left = (scope) => a(scope) / b(scope);
      else {
        // A variable exponent on an unknown-sign base needs the CAS's real/
        // complex branch rules. Keep that uncommon case on the existing path.
        if (!Number.isFinite(b({})) && !(a({}) > 0)) throw new Error('Variable power requires CAS evaluation');
        // Nerdamer uses real odd roots, e.g. (-8)^(1/3) = -2. JavaScript's
        // Math.pow alone would turn the entire negative half of that curve blank.
        const fraction = tokens.slice(exponentStart, cursor).join('').replace(/[()]/g, '').match(/^(-?\d+)\/(\d+)$/);
        const numerator = fraction ? Number(fraction[1]) : 0;
        const denominator = fraction ? Number(fraction[2]) : 0;
        const oddRoot = fraction && Number.isSafeInteger(numerator) && Number.isSafeInteger(denominator) && denominator % 2 === 1;
        left = (scope) => {
          const base = a(scope); const exponent = b(scope);
          return base < 0 && oddRoot ? (numerator % 2 === 0 ? 1 : -1) * Math.pow(-base, exponent) : Math.pow(base, exponent);
        };
      }
    }
    return left;
  }
  const result = expression();
  if (cursor !== tokens.length) throw new Error('Unexpected numerical token');
  return (scope) => { const value = result(scope); return Number.isFinite(value) ? value : Number.NaN; };
}

export function boundedCache<K, V>(limit: number) {
  const entries = new Map<K, V>();
  return {
    get(key: K) { return entries.get(key); },
    set(key: K, value: V) {
      entries.delete(key); entries.set(key, value);
      if (entries.size > limit) entries.delete(entries.keys().next().value!);
      return value;
    },
    delete(key: K) { entries.delete(key); },
  };
}

export function gridValues(minimum: number, maximum: number, step: number): number[] {
  if (![minimum, maximum, step].every(Number.isFinite) || step <= 0 || maximum < minimum) return [];
  const first = Math.ceil(minimum / step) * step;
  const count = Math.min(1200, Math.floor((maximum - first) / step) + 1);
  return Array.from({ length: Math.max(0, count) }, (_, index) => first + index * step);
}
