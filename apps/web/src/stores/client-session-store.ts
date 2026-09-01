import type { MatchSessionView } from '@dau-vo/shared-types';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

function deviceId(): string {
  if (typeof crypto !== 'undefined') {
    if ('randomUUID' in crypto) return crypto.randomUUID();
    const bytes = new Uint32Array(4);
    crypto.getRandomValues(bytes);
    return `device-${Array.from(bytes, (value) => value.toString(36)).join('-')}`;
  }
  return `device-${Date.now()}-${performance.now().toString(36)}`;
}
interface State { deviceId: string; matchSession: MatchSessionView | null; lastMatchPublicId: string; revokedReason: string | null; setMatchSession: (session: MatchSessionView) => void; clearMatchSession: (reason?: string) => void; setLastMatchPublicId: (id: string) => void; clearRevokedReason: () => void; }
export const useClientSessionStore = create<State>()(persist((set) => ({ deviceId: deviceId(), matchSession: null, lastMatchPublicId: '', revokedReason: null, setMatchSession: (matchSession) => set({ matchSession, lastMatchPublicId: matchSession.matchPublicId, revokedReason: null }), clearMatchSession: (reason) => set({ matchSession: null, revokedReason: reason ?? null }), setLastMatchPublicId: (lastMatchPublicId) => set({ lastMatchPublicId }), clearRevokedReason: () => set({ revokedReason: null }) }), { name: 'dau-vo-client-session-v1', storage: createJSONStorage(() => localStorage), partialize: ({ deviceId: id, lastMatchPublicId, matchSession }) => ({ deviceId: id, lastMatchPublicId, matchSession }) }));
