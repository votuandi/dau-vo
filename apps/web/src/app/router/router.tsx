import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AdminAuthGuard } from '@/features/admin-auth/admin-auth-guard';
import { AdminLoginPage } from '@/features/admin-auth/admin-login-page';
import { AdminDashboardPage } from '@/features/admin/admin-dashboard-page';
import { AdminMatchPage } from '@/features/matches/admin-match-page';
import { TournamentDetailPage } from '@/features/tournaments/tournament-detail-page';
import { TournamentListPage } from '@/features/tournaments/tournament-list-page';
import { RefereePage } from '@/features/referee/referee-page';
import { InspectorPage } from '@/features/inspector/inspector-page';
import { ScoreboardPage } from '@/features/scoreboard/scoreboard-page';
import { AdminLayout } from '@/layouts/admin-layout';
import { NotFoundPage } from '@/features/not-found/not-found-page';

export const router = createBrowserRouter([
  { path: '/', element: <Navigate replace to="/bang-diem" /> },
  { path: '/admin/login', element: <AdminLoginPage /> },
  {
    element: <AdminAuthGuard />,
    children: [
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <AdminDashboardPage /> },
          { path: 'tournaments', element: <TournamentListPage /> },
          { path: 'tournaments/:tournamentId', element: <TournamentDetailPage /> },
          { path: 'matches/:matchId', element: <AdminMatchPage /> },
        ],
      },
    ],
  },
  { path: '/trong-tai', element: <RefereePage /> },
  { path: '/giam-dinh', element: <InspectorPage /> },
  { path: '/bang-diem', element: <ScoreboardPage /> },
  { path: '/bang-diem/:publicId', element: <ScoreboardPage /> },
  { path: '*', element: <NotFoundPage /> },
]);
