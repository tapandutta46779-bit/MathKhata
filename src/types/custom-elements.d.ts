import type { DetailedHTMLProps, HTMLAttributes, Ref } from 'react';
import type { MathfieldElement } from 'mathlive';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': DetailedHTMLProps<HTMLAttributes<MathfieldElement>, MathfieldElement> & {
        class?: string;
        ref?: Ref<MathfieldElement>;
        'read-only'?: string;
      };
    }
  }
}

