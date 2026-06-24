import { useId } from 'react';

type LogoProps = {
  className?: string;
  title?: string;
};

/**
 * SlopeWise brand mark: a rising curve (growth) grazed by a tangent line at a
 * single point (the derivative / slope) — the core idea the product teaches.
 * Decorative by default; pass a `title` to expose it as a labelled image.
 */
export function Logo({ className = 'brand-logo', title }: LogoProps) {
  const rawId = useId();
  const gradientId = `slopewise-curve-${rawId.replace(/:/g, '')}`;
  const decorative = title === undefined;

  return (
    <svg
      className={className}
      viewBox="0 0 48 36"
      fill="none"
      role="img"
      aria-hidden={decorative ? 'true' : undefined}
      aria-label={decorative ? undefined : title}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1="6"
          y1="30"
          x2="42"
          y2="7"
        >
          <stop offset="0" stopColor="#0b5e3f" />
          <stop offset="1" stopColor="#2fd27f" />
        </linearGradient>
      </defs>
      <circle className="brand-logo-halo" cx="26" cy="23.25" r="8.5" />
      {/* Tangent at the contact point (26, 23.25), slope -23/36 to match the
          curve's derivative there; extended symmetrically so it stays centered
          on the point (and on the loading pivot origin). */}
      <path className="brand-logo-tangent" d="M8.3 34.56 L43.7 11.94" />
      <path
        className="brand-logo-curve"
        d="M6 30 Q28 28 42 7"
        pathLength={100}
        stroke={`url(#${gradientId})`}
      />
      <circle className="brand-logo-point" cx="26" cy="23.25" r="4.2" />
    </svg>
  );
}
