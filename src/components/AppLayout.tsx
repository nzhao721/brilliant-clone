import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { lessons } from '../data/lessons';
import { clearLocalLessonProgress, useLessonProgress } from '../lessons/lessonProgress';
import { resetCoins, useCurrency } from '../games/useCurrency';
import { resetGameHighScores } from '../games';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import { HeaderStats } from './HeaderStats';
import { Logo } from './Logo';
import { MobileTabBar } from './MobileTabBar';
import { ResetProgressDialog } from './ResetProgressDialog';
import { SoundControl } from './SoundControl';
import './AppLayout.css';

function getInitials(user: { displayName?: string | null; email?: string | null }) {
  const source = (user.displayName || user.email || '').trim();

  if (!source) {
    return '?';
  }

  const parts = source.split(/\s+/);

  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

function getFirstName(user: { displayName?: string | null; email?: string | null }) {
  const displayName = user.displayName?.trim();

  if (displayName) {
    return displayName.split(/\s+/)[0];
  }

  const emailName = user.email?.split('@')[0]?.trim();

  return emailName || 'Account';
}

const menuIconProps = {
  className: 'user-menu-item-icon',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

function DashboardMenuIcon() {
  return (
    <svg {...menuIconProps}>
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </svg>
  );
}

function AnalyticsMenuIcon() {
  return (
    <svg {...menuIconProps}>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}

function PracticeMenuIcon() {
  return (
    <svg {...menuIconProps}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function LeaderboardMenuIcon() {
  return (
    <svg {...menuIconProps}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function GamesMenuIcon() {
  return (
    <svg {...menuIconProps}>
      <line x1="6" x2="10" y1="11" y2="11" />
      <line x1="8" x2="8" y1="9" y2="13" />
      <line x1="15" x2="15.01" y1="12" y2="12" />
      <line x1="18" x2="18.01" y1="10" y2="10" />
      <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.544-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" />
    </svg>
  );
}

function RaceMenuIcon() {
  return (
    <svg {...menuIconProps}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" x2="4" y1="22" y2="15" />
    </svg>
  );
}

function LogoutMenuIcon() {
  return (
    <svg {...menuIconProps}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function ResetMenuIcon() {
  return (
    <svg {...menuIconProps}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function DeleteAccountMenuIcon() {
  return (
    <svg {...menuIconProps}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function AppLayout() {
  const { deleteAccount, logout, user } = useAuth();
  /* Mirror DashboardPage's call so reset clears the same stored progress. */
  const { currentStreakDays, progress, resetProgress } = useLessonProgress(lessons, user?.uid);
  /* XP from progress; spendable coin balance from the currency hook (earned − spent). */
  const { coinBalance } = useCurrency();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  /* Password accounts re-enter their password to delete; federated accounts re-verify via popup. */
  const requiresPasswordToDelete =
    user?.providerData?.some((entry) => entry.providerId === 'password') ?? false;
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /* The lesson player is an immersive, full-viewport flow, so hide the phone tab
     bar there (the lesson's own controls + the hardware back button navigate it).
     Elsewhere, signed-in users get the bottom tab bar at phone widths. */
  const isImmersiveRoute =
    location.pathname.startsWith('/lessons/') ||
    location.pathname.startsWith('/preview-lesson/');
  const showMobileTabBar = Boolean(user) && !isImmersiveRoute;

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  async function handleLogout() {
    setMenuOpen(false);
    await logout();
    navigate('/');
  }

  function openResetConfirm() {
    setMenuOpen(false);
    setResetConfirmOpen(true);
  }

  function closeResetConfirm() {
    setResetConfirmOpen(false);
    triggerRef.current?.focus();
  }

  function confirmReset() {
    /* Wipe all device data: progress/XP/lifetime coins (resetProgress), coin
       ledgers (resetCoins), and per-game bests (resetGameHighScores). */
    resetProgress();
    resetCoins();
    resetGameHighScores();
    setResetConfirmOpen(false);
    setMenuOpen(false);
    triggerRef.current?.focus();
  }

  function openDeleteConfirm() {
    setMenuOpen(false);
    setDeleteConfirmOpen(true);
  }

  function closeDeleteConfirm() {
    setDeleteConfirmOpen(false);
    triggerRef.current?.focus();
  }

  /* Throws on failure (cancelled re-auth / wrong password); the dialog catches it. */
  async function confirmDelete(password?: string) {
    await deleteAccount(password);
    clearLocalLessonProgress();
    setDeleteConfirmOpen(false);
    navigate('/');
  }

  /* Contextual menu items (add new ones here); the destructive footer below stays
     grouped at the bottom in escalating severity — never append after it. */
  const dynamicMenuItems = [
    { key: 'dashboard', to: '/dashboard', label: 'Dashboard', icon: <DashboardMenuIcon /> },
    { key: 'practice', to: '/practice', label: 'Practice', icon: <PracticeMenuIcon /> },
    { key: 'analytics', to: '/analytics', label: 'Analytics', icon: <AnalyticsMenuIcon /> },
    { key: 'leaderboard', to: '/leaderboard', label: 'Leaderboard', icon: <LeaderboardMenuIcon /> },
    { key: 'games', to: '/games', label: 'Games', icon: <GamesMenuIcon /> },
    { key: 'race', to: '/race', label: 'Slipstream', icon: <RaceMenuIcon /> },
  ];

  return (
    <div className={`app-shell${showMobileTabBar ? ' has-mobile-tabbar' : ''}`}>
      <header className="site-header">
        <NavLink
          className="brand"
          to={user ? '/dashboard' : '/'}
          aria-label={user ? 'SlopeWise dashboard' : 'SlopeWise home'}
        >
          <Logo className="brand-logo" />
          <span className="brand-wordmark">SlopeWise</span>
        </NavLink>
        <nav className="site-nav" aria-label="Primary navigation">
          <SoundControl />
          {user ? (
            <>
              <HeaderStats coins={coinBalance} xp={progress.totalXp} streak={currentStreakDays} />
              <div className="user-menu" ref={menuRef}>
              <button
                ref={triggerRef}
                type="button"
                className="user-menu-trigger"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                {user.photoURL ? (
                  <img
                    className="user-avatar"
                    src={user.photoURL}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="user-avatar user-avatar-fallback" aria-hidden="true">
                    {getInitials(user)}
                  </span>
                )}
                <span className="user-menu-name">{getFirstName(user)}</span>
                <svg
                  className="user-menu-caret"
                  viewBox="0 0 16 16"
                  width="16"
                  height="16"
                  aria-hidden="true"
                >
                  <path
                    d="M4 6l4 4 4-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {menuOpen ? (
                <div className="user-menu-dropdown" role="menu">
                  {dynamicMenuItems.map((item) => (
                    <NavLink
                      key={item.key}
                      to={item.to}
                      className="user-menu-item"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                    >
                      {item.icon}
                      <span className="user-menu-item-label">{item.label}</span>
                    </NavLink>
                  ))}
                  <div className="user-menu-divider" role="none" />
                  {/* Fixed footer — destructive actions in escalating severity (see note above). */}
                  <button
                    type="button"
                    className="user-menu-item"
                    role="menuitem"
                    onClick={handleLogout}
                  >
                    <LogoutMenuIcon />
                    <span className="user-menu-item-label">Log out</span>
                  </button>
                  <button
                    type="button"
                    className="user-menu-item user-menu-item-danger"
                    role="menuitem"
                    onClick={openResetConfirm}
                  >
                    <ResetMenuIcon />
                    <span className="user-menu-item-label">Reset progress</span>
                  </button>
                  <button
                    type="button"
                    className="user-menu-item user-menu-item-danger"
                    role="menuitem"
                    onClick={openDeleteConfirm}
                  >
                    <DeleteAccountMenuIcon />
                    <span className="user-menu-item-label">Delete account</span>
                  </button>
                </div>
              ) : null}
              </div>
            </>
          ) : (
            <NavLink
              to="/login"
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              Login
            </NavLink>
          )}
        </nav>
      </header>
      <main>
        <div className="page-transition" key={location.pathname}>
          <Outlet />
        </div>
      </main>
      <footer className="site-footer">
        <p className="site-footer-credit">
          Course content adapted from{' '}
          <a href="https://www.apexcalculus.com/" target="_blank" rel="noopener noreferrer">
            APEX Calculus
          </a>{' '}
          by Gregory Hartman et al., licensed under{' '}
          <a
            href="https://creativecommons.org/licenses/by-nc/4.0/"
            target="_blank"
            rel="noopener noreferrer"
          >
            CC BY-NC 4.0
          </a>
          . SlopeWise is a noncommercial educational project.
        </p>
      </footer>
      {showMobileTabBar ? <MobileTabBar /> : null}
      {resetConfirmOpen ? (
        <ResetProgressDialog onCancel={closeResetConfirm} onConfirm={confirmReset} />
      ) : null}
      {deleteConfirmOpen && user ? (
        <DeleteAccountDialog
          email={user.email}
          requiresPassword={requiresPasswordToDelete}
          onCancel={closeDeleteConfirm}
          onConfirm={confirmDelete}
        />
      ) : null}
    </div>
  );
}
