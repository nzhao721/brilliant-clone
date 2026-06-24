import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function HomePage() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <section className="hero-section">
      <div className="hero-copy">
        <h1>Learn what a derivative means before memorizing rules.</h1>
        <p>
          SlopeWise is a Brilliant-style MVP for short, interactive lessons
          that explain slope, change, tangent lines, and derivatives from the ground up.
        </p>
        <div className="button-row">
          <Link className="primary-button" to={user ? '/dashboard' : '/login'}>
            {user ? 'View dashboard' : 'Log in'}
          </Link>
          {user ? (
            <button className="secondary-button" type="button" onClick={handleLogout}>
              Log out
            </button>
          ) : (
            <Link className="secondary-button" to="/signup">
              Create account
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
