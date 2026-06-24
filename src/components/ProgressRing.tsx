import { useId } from 'react';

type ProgressRingProps = {
  percent: number;
  label?: string;
  ariaLabel?: string;
  size?: number;
  strokeWidth?: number;
};

export function ProgressRing({
  percent,
  label,
  ariaLabel,
  size = 116,
  strokeWidth = 11,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);
  const displayLabel = label ?? `${Math.round(clamped)}%`;
  const gradientId = `progress-ring-${useId().replace(/:/g, '')}`;

  return (
    <div
      className="progress-ring"
      role="img"
      aria-label={ariaLabel ?? `${Math.round(clamped)}% complete`}
      style={{ width: size, height: size }}
    >
      <svg className="progress-ring-svg" viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--brand-bright)" />
            <stop offset="100%" stopColor="var(--brand)" />
          </linearGradient>
        </defs>
        <circle
          className="progress-ring-track"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <circle
          className="progress-ring-fill"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth}
          stroke={`url(#${gradientId})`}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </svg>
      <span className="progress-ring-label" aria-hidden="true">
        {displayLabel}
      </span>
    </div>
  );
}
