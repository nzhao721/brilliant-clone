declare module 'react-katex' {
  import type { ReactElement, ReactNode } from 'react';

  type MathComponentProps = {
    children?: string;
    errorColor?: string;
    math?: string;
    renderError?: (error: Error) => ReactNode;
  };

  export function BlockMath(props: MathComponentProps): ReactElement;
  export function InlineMath(props: MathComponentProps): ReactElement;
}
