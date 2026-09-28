import { Navigate, useLocation } from 'react-router-dom';

/** `/trong-tai` was the former judge URL. Keep it one-way and retain URL state. */
export function LegacyJudgeAlias() {
  const location = useLocation();
  return <Navigate replace to={`/giam-dinh${location.search}${location.hash}`} />;
}
