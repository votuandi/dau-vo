import { useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import type { ScoreboardSource } from '../scoreboard-source';
import { ScoreboardAccessForm } from './scoreboard-access-form';

export function ScoreboardSourceSwitcher({
  source,
  onSelect,
}: {
  readonly source: ScoreboardSource;
  readonly onSelect: (source: ScoreboardSource) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <p className="truncate font-mono text-[clamp(1.375rem,4.4vmin,2.5rem)] font-black tracking-[0.12em]">
        {source.kind === 'match' ? source.matchPublicId : source.scoreboardCode}
      </p>
      <button
        aria-label="Đổi mã theo dõi"
        title="Đổi mã theo dõi"
        type="button"
        onClick={() => {
          setEditing(true);
        }}
        aria-expanded={editing}
        aria-haspopup="dialog"
        className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-3 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:border-white/50 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-950"
      >
        <ArrowRightLeft aria-hidden="true" className="size-5" />
        Đổi mã
      </button>
      {editing ? (
        <Dialog
          title="Đổi mã theo dõi"
          pending={busy}
          description="Chọn theo dõi bằng mã trận đấu hoặc mã giám sát."
          className="max-w-lg rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl sm:p-8"
          showCloseButton
          onClose={() => {
            setEditing(false);
          }}
        >
          <div className="mt-6">
            <ScoreboardAccessForm
              source={source}
              onPendingChange={setBusy}
              onCancel={() => {
                setEditing(false);
              }}
              onSelect={(next) => {
                onSelect(next);
                setEditing(false);
              }}
            />
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
