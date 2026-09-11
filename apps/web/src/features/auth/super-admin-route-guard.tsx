import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet } from 'react-router-dom';
import { authenticatedUserQueryOptions } from './authenticated-user-session';
export function SuperAdminRouteGuard(){const session=useQuery(authenticatedUserQueryOptions);if(session.isPending)return <p>Đang kiểm tra quyền…</p>;if(!session.data)return <Navigate replace to="/login"/>;if(session.data.user.role!=='SUPER_ADMIN')return <Navigate replace to="/"/>;return <Outlet/>;}
