import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { lessons } from '../data/lessons';
import { clearLocalLessonProgress, useLessonProgress } from '../lessons/lessonProgress';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import { HeaderStats } from './HeaderStats';
import { Logo } from './Logo';
import { ResetProgressDialog } from './ResetProgressDialog';
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
  // Mirror DashboardPage's call signature so reset clears the same stored
  // progress (local + Firestore when signed in).
  const { currentStreakDays, progress, resetProgress } = useLessonProgress(lessons, user?.uid);
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // Password accounts must re-enter their password to delete; federated accounts
  // (e.g. Google) re-verify through a provider popup instead.
  const requiresPasswordToDelete =
    user?.providerData?.some((entry) => entry.providerId === 'password') ?? false;
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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
    resetProgress();
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

  // Throws on failure (e.g. cancelled re-auth or wrong password); the dialog
  // catches it and shows the message, so the account stays intact.
  async function confirmDelete(password?: string) {
    await deleteAccount(password);
    clearLocalLessonProgress();
    setDeleteConfirmOpen(false);
    navigate('/');
  }

  // Optional/contextual menu items render first (add new ones here). The fixed
  // footer below this list is an invariant: the destructive actions stay grouped
  // at the bottom in escalating severity — Log out, then Reset progress, then
  // Delete account last. Never append items after that footer.
  const dynamicMenuItems = [
    { key: 'dashboard', to: '/dashboard', label: 'Dashboard', icon: <DashboardMenuIcon /> },
    { key: 'analytics', to: '/analytics', label: 'Analytics', icon: <AnalyticsMenuIcon /> },
  ];

  return (
    <div className="app-shell">
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
          {user ? (
            <>
              <HeaderStats xp={progress.totalXp} streak={currentStreakDays} />
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
                  {/* Fixed footer — keep this exact order so the destructive
                      actions stay grouped at the bottom, escalating in severity:
                      Log out, then Reset progress, then Delete account last. */}
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
