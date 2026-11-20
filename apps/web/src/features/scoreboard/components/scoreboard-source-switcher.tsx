import { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import type { ScoreboardSource } from '../scoreboard-source';
import { ScoreboardAccessForm } from './scoreboard-access-form';

/**
 * The match code, shown as a button: clicking it opens "Đổi mã theo dõi" to
 * follow another match or a supervisor code. Before a supervisor picks a
 * match there is no code yet, so the button reads "Đổi mã".
 */
export function ScoreboardSourceSwitcher({
  source,
  matchPublicId,
  onSelect,
}: {
  readonly source: ScoreboardSource;
  readonly matchPublicId?: string | undefined;
  readonly onSelect: (source: ScoreboardSource) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        aria-expanded={editing}
        aria-haspopup="dialog"
        aria-label={matchPublicId ? `Trận ${matchPublicId}. Đổi mã theo dõi` : 'Đổi mã theo dõi'}
        className="flex min-h-10 shrink-0 cursor-pointer items-center rounded-xl border border-white/30 bg-white/10 px-3 py-2 font-mono text-md font-black tracking-[0.12em] text-white transition-colors duration-150 hover:border-white/50 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-950"
        onClick={() => {
          setEditing(true);
        }}
        title="Đổi mã theo dõi"
        type="button"
      >
        {matchPublicId ?? <span className="font-sans tracking-normal">Đổi mã</span>}
      </button>
      {editing ? (
        <Dialog
          className="max-w-lg rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl sm:p-8"
          description="Chọn theo dõi bằng mã trận đấu hoặc mã giám sát."
          onClose={() => {
            setEditing(false);
          }}
          pending={busy}
          showCloseButton
          title="Đổi mã theo dõi"
        >
          <div className="mt-6">
            <ScoreboardAccessForm
              onCancel={() => {
                setEditing(false);
              }}
              onPendingChange={setBusy}
              onSelect={(next) => {
                onSelect(next);
                setEditing(false);
              }}
              source={source}
            />
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
