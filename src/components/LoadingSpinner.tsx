import { Logo } from './Logo';

type LoadingSpinnerProps = {
  label?: string;
};

export function LoadingSpinner({ label = 'Loading' }: LoadingSpinnerProps) {
  return (
    <div className="loading-spinner" role="status" aria-label={label}>
      <span className="loading-logo" aria-hidden="true">
        <Logo />
      </span>
    </div>
  );
}
