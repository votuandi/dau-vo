import { useState, type SyntheticEvent } from 'react';
import { ArrowRightLeft, Save, X } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { validateMatchIdChange } from '../scoreboard-view-model';

const iconButton =
  'grid size-[clamp(2.75rem,6vmin,3.5rem)] shrink-0 place-items-center rounded-xl border shadow-lg transition focus-visible:outline-none focus-visible:ring-4';

/** Shows the current match ID and lets an operator switch the board to another match. */
export function MatchIdSwitcher({
  displayId,
  matchPublicId,
  onSwitch,
}: {
  readonly displayId: string;
  readonly matchPublicId: string;
  readonly onSwitch: (nextMatchId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(matchPublicId);

  function cancel(): void {
    setDraft(matchPublicId);
    setEditing(false);
  }

  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const change = validateMatchIdChange(draft, matchPublicId);
    if (!change.ok) {
      toast({ title: change.error, variant: 'destructive' });
      return;
    }
    onSwitch(change.matchId);
  }

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <p className="truncate font-mono text-[clamp(1.375rem,4.4vmin,2.5rem)] font-black tracking-[0.18em]">
          {displayId}
        </p>
        <button
          aria-label="Chuyển đổi mã trận đấu"
          className={`${iconButton} border-sky-200/50 bg-sky-500/20 text-sky-100 shadow-blue-950/20 hover:bg-sky-400/35 focus-visible:ring-sky-300/50`}
          onClick={() => {
            setDraft(matchPublicId);
            setEditing(true);
          }}
          title="Chuyển trận đấu"
          type="button"
        >
          <ArrowRightLeft aria-hidden="true" className="size-5 sm:size-6" strokeWidth={2.5} />
        </button>
      </div>
    );
  }

  return (
    <form className="flex min-w-0 items-center gap-2 sm:gap-3" onSubmit={submit}>
      <input
        aria-label="Mã trận đấu"
        autoCapitalize="characters"
        autoComplete="off"
        autoFocus
        className="h-[clamp(2.75rem,6vmin,3.5rem)] w-full min-w-0 max-w-[12rem] rounded-xl border border-sky-200/70 bg-white px-3 font-mono text-lg font-black uppercase tracking-[0.12em] text-blue-950 outline-none transition focus:ring-4 focus:ring-sky-300 sm:max-w-xs sm:text-2xl"
        enterKeyHint="go"
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') cancel();
        }}
        spellCheck={false}
        value={draft}
      />
      <button
        aria-label="Lưu mã trận đấu"
        className={`${iconButton} border-sky-200/50 bg-sky-500/20 text-sky-100 shadow-blue-950/20 hover:bg-sky-400/35 focus-visible:ring-sky-300/50`}
        title="Lưu"
        type="submit"
      >
        <Save aria-hidden="true" className="size-5 sm:size-6" strokeWidth={2.5} />
      </button>
      <button
        aria-label="Hủy chỉnh sửa mã trận đấu"
        className={`${iconButton} border-rose-200/50 bg-rose-500/20 text-rose-100 shadow-rose-950/20 hover:bg-rose-400/35 focus-visible:ring-rose-300/50`}
        onClick={cancel}
        title="Hủy"
        type="button"
      >
        <X aria-hidden="true" className="size-5 sm:size-6" strokeWidth={2.5} />
      </button>
    </form>
  );
}
