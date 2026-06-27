import { NavLink } from 'react-router-dom';
import './MobileTabBar.css';

/*
 * Phone-first bottom navigation. It surfaces the most-used signed-in destinations
 * as large, thumb-friendly tab targets and is shown ONLY at narrow widths (see
 * MobileTabBar.css) — on tablets/desktop it is hidden and the existing header
 * navigation is used instead. Secondary destinations (Analytics) and account
 * actions stay reachable from the header avatar menu, which is unchanged.
 *
 * Purely presentational: AppLayout decides WHEN to render it (signed-in, and not
 * inside an immersive lesson), so behavior matches the web app exactly.
 */

const iconProps = {
  className: 'mobile-tab-icon',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

function HomeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

function PracticeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function GamesIcon() {
  return (
    <svg {...iconProps}>
      <line x1="6" x2="10" y1="11" y2="11" />
      <line x1="8" x2="8" y1="9" y2="13" />
      <line x1="15" x2="15.01" y1="12" y2="12" />
      <line x1="18" x2="18.01" y1="10" y2="10" />
      <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.544-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" />
    </svg>
  );
}

function RanksIcon() {
  return (
    <svg {...iconProps}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function RaceIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" x2="4" y1="22" y2="15" />
    </svg>
  );
}

const tabs = [
  { to: '/dashboard', label: 'Home', icon: <HomeIcon /> },
  { to: '/practice', label: 'Practice', icon: <PracticeIcon /> },
  { to: '/games', label: 'Games', icon: <GamesIcon /> },
  { to: '/leaderboard', label: 'Ranks', icon: <RanksIcon /> },
  { to: '/race', label: 'Race', icon: <RaceIcon /> },
];

export function MobileTabBar() {
  return (
    <nav className="mobile-tab-bar" aria-label="Main navigation">
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to} className="mobile-tab">
          {tab.icon}
          <span className="mobile-tab-label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
