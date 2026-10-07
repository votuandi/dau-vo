import { lazy, type ComponentType } from 'react';
import { Navigate, createBrowserRouter, type RouteObject } from 'react-router-dom';
import { AdminRouteGuard } from '@/features/admin-auth/admin-route-guard';
import { AuthenticatedRouteGuard } from '@/features/auth/authenticated-route-guard';
import { SuperAdminRouteGuard } from '@/features/auth/super-admin-route-guard';
import { SubscriptionRouteGuard } from '@/features/auth/subscription-route-guard';
import { HomePage } from '@/pages/home-page';
import { AppLayout } from '@/layouts/app-layout';
import { SuperAdminLayout } from '@/layouts/super-admin-layout';
import { TournamentOfficialRole } from '@/types/shared';
import { RoleAwareIndexRedirect } from './role-aware-index-redirect';
import { LegacyJudgeAlias } from './legacy-judge-alias';

/**
 * Route-level code splitting: each page ships in its own chunk so public
 * screens (scoreboard, official consoles) do not download the admin suite.
 * The homepage stays eager because it is prerendered and hydrated.
 */
function lazyPage<Module, Key extends keyof Module>(
  load: () => Promise<Module>,
  exportName: Key,
): Module[Key] {
  return lazy(async () => ({
    default: (await load())[exportName] as ComponentType<unknown>,
  })) as Module[Key];
}

const AdminDashboardPage = lazyPage(
  () => import('@/pages/admin-dashboard-page'),
  'AdminDashboardPage',
);
const AdminLoginPage = lazyPage(() => import('@/pages/admin-login-page'), 'AdminLoginPage');
const AdminMatchDetailPage = lazyPage(
  () => import('@/pages/admin-match-detail-page'),
  'AdminMatchDetailPage',
);
const AdminTournamentDetailPage = lazyPage(
  () => import('@/pages/admin-tournament-detail-page'),
  'AdminTournamentDetailPage',
);
const AdminTournamentsPage = lazyPage(
  () => import('@/pages/admin-tournaments-page'),
  'AdminTournamentsPage',
);
const MatchAccessPage = lazyPage(() => import('@/pages/match-access-page'), 'MatchAccessPage');
const NotFoundPage = lazyPage(() => import('@/pages/not-found-page'), 'NotFoundPage');
const ScoreboardPage = lazyPage(() => import('@/pages/scoreboard-page'), 'ScoreboardPage');
const RegisterPage = lazyPage(() => import('@/pages/register-page'), 'RegisterPage');
const SubscriptionPage = lazyPage(() => import('@/pages/subscription-page'), 'SubscriptionPage');
const SuperAdminHomePage = lazyPage(
  () => import('@/features/super-admin/super-admin-home-page'),
  'SuperAdminHomePage',
);
const SuperAdminPricingPage = lazyPage(
  () => import('@/features/super-admin/pricing/pricing-page'),
  'SuperAdminPricingPage',
);
const CreateSuperAdminUserPage = lazyPage(
  () => import('@/features/super-admin/users/create-user-page'),
  'CreateSuperAdminUserPage',
);
const SuperAdminUsersPage = lazyPage(
  () => import('@/features/super-admin/users/users-page'),
  'SuperAdminUsersPage',
);
const SuperAdminUserDetailPage = lazyPage(
  () => import('@/features/super-admin/users/user-detail-page'),
  'SuperAdminUserDetailPage',
);
const SuperAdminSportGroupsPage = lazyPage(
  () => import('@/features/super-admin/sports/sport-groups-page'),
  'SuperAdminSportGroupsPage',
);
const SuperAdminSportsPage = lazyPage(
  () => import('@/features/super-admin/sports/sports-page'),
  'SuperAdminSportsPage',
);
const AccountPage = lazyPage(() => import('@/pages/public-view-pages'), 'AccountPage');
const MatchPage = lazyPage(() => import('@/pages/public-view-pages'), 'MatchPage');
const TournamentPage = lazyPage(() => import('@/pages/public-view-pages'), 'TournamentPage');
const TournamentsPage = lazyPage(() => import('@/pages/public-view-pages'), 'TournamentsPage');

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'workspace',
        element: <RoleAwareIndexRedirect />,
      },
      {
        path: 'login',
        element: <AdminLoginPage />,
      },
      { path: 'register', element: <RegisterPage /> },
      {
        element: <AuthenticatedRouteGuard />,
        children: [
          {
            element: <SuperAdminRouteGuard />,
            children: [
              { path: 'tournaments', element: <TournamentsPage /> },
              { path: 'tournaments/:id', element: <TournamentPage /> },
            ],
          },
          { path: 'matches/:id', element: <MatchPage /> },
          { path: 'account', element: <AccountPage /> },
          {
            element: <SubscriptionRouteGuard />,
            children: [{ path: 'subscription', element: <SubscriptionPage /> }],
          },
        ],
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
            path: 'tournaments/:tournamentId/weight-classes',
            element: <AdminTournamentDetailPage />,
          },
          {
            path: 'tournaments/:tournamentId/organizations',
            element: <AdminTournamentDetailPage />,
          },
          { path: 'tournaments/:tournamentId/athletes', element: <AdminTournamentDetailPage /> },
          { path: 'tournaments/:tournamentId/matches', element: <AdminTournamentDetailPage /> },
          { path: 'tournaments/:tournamentId/judges', element: <AdminTournamentDetailPage /> },
          { path: 'tournaments/:tournamentId/supervisors', element: <AdminTournamentDetailPage /> },
          {
            path: 'matches/:matchId',
            element: <AdminMatchDetailPage />,
          },
        ],
      },
      {
        path: 'super-admin',
        element: <SuperAdminRouteGuard />,
        children: [
          {
            element: <SuperAdminLayout />,
            children: [
              { index: true, element: <SuperAdminHomePage /> },
              { path: 'users', element: <SuperAdminUsersPage /> },
              { path: 'users/new', element: <CreateSuperAdminUserPage /> },
              { path: 'users/:id', element: <SuperAdminUserDetailPage /> },
              { path: 'pricing', element: <SuperAdminPricingPage /> },
              { path: 'sports', element: <SuperAdminSportsPage /> },
              { path: 'sport-groups', element: <SuperAdminSportGroupsPage /> },
            ],
          },
        ],
      },
      {
        path: 'trong-tai',
        element: <LegacyJudgeAlias />,
      },
      {
        path: 'giam-dinh',
        element: <MatchAccessPage expectedRole={TournamentOfficialRole.JUDGE} key="judge-access" />,
      },
      {
        path: 'giam-sat',
        element: (
          <MatchAccessPage
            expectedRole={TournamentOfficialRole.SUPERVISOR}
            key="supervisor-access"
          />
        ),
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
];

export const router = createBrowserRouter(routes);
