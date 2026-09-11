import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AdminRouteGuard } from '@/features/admin-auth/admin-route-guard';
import { AppLayout } from '@/layouts/app-layout';
import { AdminDashboardPage } from '@/pages/admin-dashboard-page';
import { AdminLoginPage } from '@/pages/admin-login-page';
import { AdminMatchDetailPage } from '@/pages/admin-match-detail-page';
import { AdminTournamentDetailPage } from '@/pages/admin-tournament-detail-page';
import { AdminTournamentsPage } from '@/pages/admin-tournaments-page';
import { MatchAccessPage } from '@/pages/match-access-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { ScoreboardPage } from '@/pages/scoreboard-page';
import { MatchRole } from '@/types/shared';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <Navigate replace to="/admin" />,
      },
      {
        path: 'login',
        element: <AdminLoginPage />,
      },
      {
        path: 'admin/login',
        element: <Navigate replace to="/login" />,
      },
      {
        path: 'admin',
        element: <AdminRouteGuard />,
        children: [
          {
            index: true,
            element: <AdminDashboardPage />,
          },
          {
            path: 'tournaments',
            element: <AdminTournamentsPage />,
          },
          {
            path: 'tournaments/:tournamentId',
            element: <AdminTournamentDetailPage />,
          },
          {
            path: 'matches/:matchId',
            element: <AdminMatchDetailPage />,
          },
        ],
      },
      {
        path: 'trong-tai',
        element: <MatchAccessPage expectedRole={MatchRole.REFEREE} key="referee-access" />,
      },
      {
        path: 'giam-dinh',
        element: <MatchAccessPage expectedRole={MatchRole.INSPECTOR} key="inspector-access" />,
      },
      {
        path: 'bang-diem',
        element: <ScoreboardPage />,
      },
      {
        path: 'bang-diem/:matchId',
        element: <ScoreboardPage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);
