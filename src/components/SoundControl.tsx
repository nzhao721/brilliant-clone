import type { ChangeEvent } from 'react';
import { useSound } from '../audio/SoundProvider';
import './SoundControl.css';

const iconProps = {
  className: 'sound-control-icon',
  viewBox: '0 0 24 24',
  width: 20,
  height: 20,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

// The speaker body (cone) shared by every state.
const speakerCone = <path d="M4 9v6h4l5 4V5L8 9H4z" />;

function MutedIcon() {
  return (
    <svg {...iconProps}>
      {speakerCone}
      <line x1="16" y1="9" x2="22" y2="15" />
      <line x1="22" y1="9" x2="16" y2="15" />
    </svg>
  );
}

function LowVolumeIcon() {
  return (
    <svg {...iconProps}>
      {speakerCone}
      <path d="M16 9.5a4 4 0 0 1 0 5" />
    </svg>
  );
}

function HighVolumeIcon() {
  return (
    <svg {...iconProps}>
      {speakerCone}
      <path d="M16 9.5a4 4 0 0 1 0 5" />
      <path d="M19 7a8 8 0 0 1 0 10" />
    </svg>
  );
}

/**
 * Compact audio control for the header: a mute-toggle speaker button (glyph
 * reflects muted/low/high) plus a volume slider. Raising the slider from zero
 * while muted also unmutes.
 */
export function SoundControl() {
  const { isMuted, toggleMute, volume, setVolume } = useSound();

  const effectiveVolume = isMuted ? 0 : volume;
  const Icon = isMuted || volume === 0 ? MutedIcon : volume < 0.5 ? LowVolumeIcon : HighVolumeIcon;
  const label = isMuted ? 'Unmute sound' : 'Mute sound';

  function handleVolumeChange(event: ChangeEvent<HTMLInputElement>) {
    const next = Number(event.target.value);
    setVolume(next);
    // Nudging the slider up off zero should bring sound back.
    if (isMuted && next > 0) {
      toggleMute();
    }
  }

  return (
    <div className="sound-control">
      <button
        type="button"
        className="sound-control-toggle"
        onClick={toggleMute}
        aria-pressed={isMuted}
        aria-label={label}
        title={label}
      >
        <Icon />
      </button>
      <input
        className="sound-control-slider"
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={effectiveVolume}
        onChange={handleVolumeChange}
        aria-label="Volume"
      />
    </div>
  );
}
