import type { SVGProps } from 'react';

/** The XP icon: a five-pointed star, filled with `currentColor` (callers set the gold via CSS). */
export function XpIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
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
      <path d="M12 2.5 14.2 8.9 21 9.1 15.6 13.2 17.6 19.7 12 15.8 6.4 19.7 8.4 13.2 3 9.1 9.8 8.9Z" />
    </svg>
  );
}

/**
 * The coins icon: a struck gold coin (disc + recessed face + embossed bar),
 * distinct from the XP star. `currentColor` drives the gold; face/engraving use
 * partial black/white to read on any hue.
 */
export function CoinIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <circle cx="12" cy="12" r="9.25" fill="currentColor" />
      <circle cx="12" cy="12" r="6.6" fill="#000" fillOpacity="0.13" />
      <path
        d="M12 7.1v9.8M14 9.6c-.5-.7-1.3-1-2.2-1-1.2 0-2.1.7-2.1 1.7 0 2.4 4.6 1.3 4.6 3.7 0 1-1 1.7-2.3 1.7-1 0-1.9-.4-2.4-1.1"
        stroke="#fff"
        strokeOpacity="0.9"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
