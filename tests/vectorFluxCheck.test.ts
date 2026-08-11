import { describe, expect, it } from 'vitest';
import { checkSphereFluxQuestion } from '../src/assistant/vectorFluxCheck';

describe('checked sphere flux', () => {
  it('checks diagonal polynomial fields on the unit sphere', () => {
    const result = checkSphereFluxQuestion(
      'For \\(\\mathbf F=(x^3,y^3,z^3)\\), find the outward flux through the unit sphere using the divergence theorem.',
    );

    expect(result).toContain('\\nabla\\cdot\\mathbf F=3x^{2}+3y^{2}+3z^{2}');
    expect(result).toContain('\\frac{12}{5}\\pi');
  });

  it('declines unsupported fields instead of guessing', () => {
    expect(checkSphereFluxQuestion('Find the flux of an arbitrary field through a torus.')).toBeNull();
    expect(checkSphereFluxQuestion('Find the flux of \\(\\mathbf F=(xy,yz,zx)\\) through the unit sphere.')).toBeNull();
  });
});
