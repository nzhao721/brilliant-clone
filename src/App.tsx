import { Navigate, Route, Routes } from 'react-router-dom';
import { SoundProvider } from './audio/SoundProvider';
import { AuthProvider } from './auth/AuthContext';
import { DailyGateRoute } from './auth/DailyGateRoute';
import { LessonGate } from './auth/LessonGate';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppLayout } from './components/AppLayout';
import { ScrollToTop } from './components/ScrollToTop';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { DashboardPage } from './pages/DashboardPage';
import { GamePlayPage } from './pages/GamePlayPage';
import { GamesPage } from './pages/GamesPage';
import { HomePage } from './pages/HomePage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { LessonPage } from './pages/LessonPage';
import { LoginPage } from './pages/LoginPage';
import { PracticePage } from './pages/PracticePage';
import { RacePage } from './pages/RacePage';

export default function App() {
  return (
    <SoundProvider>
      <AuthProvider>
        <ScrollToTop />
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="login" element={<LoginPage mode="login" />} />
            <Route path="signup" element={<LoginPage mode="signup" />} />
            <Route element={<ProtectedRoute />}>
              {/* /practice stays OUTSIDE the daily gate so it is always reachable
                  (it is where the gate sends learners to do their required set). */}
              <Route path="practice" element={<PracticePage />} />
              {/* Practice is now one unified pool; redirect the old per-chapter URLs. */}
              <Route path="practice/:chapterId" element={<Navigate to="/practice" replace />} />
              <Route path="leaderboard" element={<LeaderboardPage />} />
              {/* Overview/list pages RENDER even while the daily gate is active: they
                  show a banner + grayed-out, disabled launch buttons (dashboard trail
                  + "next up", arcade play) labeled "Complete daily practice to unlock",
                  rather than redirecting the learner away. */}
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="games" element={<GamesPage />} />
              {/* The Slipstream race HOME page also renders while gated: it shows the
                  banner + grayed-out, disabled "Play a bot"/"Play a friend" start
                  buttons (labeled "Complete daily practice to unlock"), matching the
                  arcade, instead of redirecting the learner away. */}
              <Route path="race" element={<RacePage />} />
              {/* DEFENSE-IN-DEPTH: the game-play route and a direct link into an
                  ACTIVE race match stay FULLY gated — a direct URL renders the
                  banner-only blocked screen (not the game/race) until today's set is
                  passed, since the launch buttons above are only disabled, not removed. */}
              <Route element={<DailyGateRoute />}>
                <Route path="games/:gameId" element={<GamePlayPage />} />
                <Route path="race/:matchId" element={<RacePage />} />
              </Route>
              {/* Lessons are gated PER-LESSON: while gated, a COMPLETED lesson stays
                  reviewable (renders normally) but a not-yet-completed one shows the
                  banner-only blocked screen. LessonGate reads :lessonId to decide. */}
              <Route path="lessons/:lessonId" element={<LessonGate />} />
            </Route>
            <Route path="preview-lesson/:lessonId" element={<LessonPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </SoundProvider>
  );
}
