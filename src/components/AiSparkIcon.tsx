import type { SVGProps } from 'react';

/**
 * The AI marker: a pair of four-pointed sparkles ("auto-awesome" motif) that
 * reads as machine-generated insight. Filled with `currentColor` so callers set
 * the hue via CSS `color`. Decorative by default — callers needing an accessible
 * name should label a wrapping element (the bare glyph stays `aria-hidden`).
 */
export function AiSparkIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M10.5 6.5Q10.5 13.5 17.5 13.5Q10.5 13.5 10.5 20.5Q10.5 13.5 3.5 13.5Q10.5 13.5 10.5 6.5Z" />
      <path d="M17.5 3Q17.5 6.5 21 6.5Q17.5 6.5 17.5 10Q17.5 6.5 14 6.5Q17.5 6.5 17.5 3Z" />
    </svg>
  );
}
