function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function parseDiagonalMonomial(component: string, variable: 'x' | 'y' | 'z'): { coefficient: number; power: number } | null {
  const compact = component.replace(/\s+/g, '').replace(/\cdot|\times/g, '');
  const match = compact.match(new RegExp(`^([+-]?\\d*)${variable}(?:\\^\\{?(\\d+)\\}?)?$`));
  if (!match) return null;
  const coefficient = match[1] === '' || match[1] === '+' ? 1 : match[1] === '-' ? -1 : Number(match[1]);
  const power = match[2] ? Number(match[2]) : 1;
  return Number.isFinite(coefficient) && Number.isInteger(power) && power >= 1
    ? { coefficient, power }
    : null;
}

/**
 * Deterministically checks a common divergence-theorem problem family:
 * diagonal polynomial fields over a sphere centered at the origin. Returning
 * null is intentional for wording or mathematics outside that safe subset.
 */
export function checkSphereFluxQuestion(question: string): string | null {
  if (!/\b(?:outward\s+)?flux\b/i.test(question) || !/\bsphere\b/i.test(question)) return null;
  const normalized = question
    .replace(/\\left|\\right/g, '')
    .replace(/\\mathbf\s*\{?F\}?/g, '\\mathbf F');
  const field = normalized.match(/\\mathbf\s*F\s*=\s*\(([^,]+),([^,]+),([^)]+)\)/);
  if (!field) return null;
  const components = [
    parseDiagonalMonomial(field[1], 'x'),
    parseDiagonalMonomial(field[2], 'y'),
    parseDiagonalMonomial(field[3], 'z'),
  ];
  if (components.some((component) => component === null)) return null;

  const radiusMatch = normalized.match(/\bsphere\b[^.\n]{0,80}\bradius\s*(?:=|of)?\s*(\d+)/i);
  const radius = /\bunit sphere\b/i.test(normalized) ? 1 : radiusMatch ? Number(radiusMatch[1]) : null;
  if (!radius || !Number.isSafeInteger(radius) || radius > 100) return null;

  let numerator = 0;
  let denominator = 1;
  const divergenceTerms: string[] = [];
  for (const [index, component] of components.entries()) {
    const checked = component!;
    const variable = (['x', 'y', 'z'] as const)[index];
    const derivativePower = checked.power - 1;
    const derivativeCoefficient = checked.coefficient * checked.power;
    divergenceTerms.push(`${derivativeCoefficient}${derivativePower ? `${variable}^{${derivativePower}}` : ''}`);
    if (derivativePower % 2 === 1) continue;
    const termNumerator = derivativeCoefficient * 4 * radius ** (derivativePower + 3);
    const termDenominator = (derivativePower + 1) * (derivativePower + 3);
    numerator = numerator * termDenominator + termNumerator * denominator;
    denominator *= termDenominator;
    const divisor = gcd(numerator, denominator);
    numerator /= divisor;
    denominator /= divisor;
  }
  const coefficientLatex = denominator === 1 ? `${numerator}` : `\\frac{${numerator}}{${denominator}}`;
  return [
    'Checked sphere-flux result (deterministic polynomial moment calculation):',
    `\\(\\nabla\\cdot\\mathbf F=${divergenceTerms.join('+')}\\).`,
    `For the sphere of radius \\(R=${radius}\\), the outward flux is \\(${coefficientLatex}\\pi\\).`,
    'In spherical coordinates, include exactly one Jacobian factor \\(r^2\\sin\\theta\\); do not add another radial-square factor.',
  ].join(' ');
}
