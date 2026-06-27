import { Navigate, Route, Routes } from 'react-router-dom';
import { SoundProvider } from './audio/SoundProvider';
import { AuthProvider } from './auth/AuthContext';
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
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="leaderboard" element={<LeaderboardPage />} />
              <Route path="games" element={<GamesPage />} />
              <Route path="games/:gameId" element={<GamePlayPage />} />
              <Route path="race" element={<RacePage />} />
              <Route path="race/:matchId" element={<RacePage />} />
              <Route path="practice" element={<PracticePage />} />
              {/* Practice is now one unified pool; redirect the old per-chapter URLs. */}
              <Route path="practice/:chapterId" element={<Navigate to="/practice" replace />} />
              <Route path="lessons/:lessonId" element={<LessonPage />} />
            </Route>
            <Route path="preview-lesson/:lessonId" element={<LessonPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </SoundProvider>
  );
}
