import { Maximize, Minimize } from 'lucide-react';
import { cn } from '@/lib/utils';
import { matchToneBarClassName, type MatchScreenTone } from '@/features/match-screen-tone';
import type { ScoreboardSource } from '../scoreboard-source';
import { useFullscreen } from '../display-controls';
import { useScoreboardSponsors } from '../use-scoreboard-sponsors';
import { ScoreboardSourceSwitcher } from './scoreboard-source-switcher';
import { SponsorMarquee } from './sponsor-marquee';

/** Match code (opens "Đổi mã theo dõi") · sponsor logos · fullscreen. */
export function ScoreboardHeader({
  source,
  onSelect,
  tone = 'arena',
  matchPublicId,
}: {
  readonly source: ScoreboardSource;
  readonly onSelect: (source: ScoreboardSource) => void;
  readonly tone?: MatchScreenTone;
  readonly matchPublicId?: string;
}) {
  const sponsors = useScoreboardSponsors(source, matchPublicId);
  return (
    <header
      aria-label="Thông tin bảng điểm"
      className={cn(
        'scoreboard-header rounded-2xl border px-3 py-2 backdrop-blur sm:px-5',
        // The scoreboard keeps its lighter arena bar; pause and scoring share the console tones.
        tone === 'arena' ? 'border-white/10 bg-blue-950/25' : matchToneBarClassName[tone],
      )}
    >
      <div className="flex w-full min-w-0 items-center gap-3">
        <ScoreboardSourceSwitcher
          matchPublicId={matchPublicId}
          onSelect={onSelect}
          source={source}
        />
        <SponsorMarquee sponsors={sponsors} />
        <FullscreenButton />
      </div>
    </header>
  );
}

function FullscreenButton() {
  const fullscreen = useFullscreen();
  if (!fullscreen.supported) return null;
  const Icon = fullscreen.active ? Minimize : Maximize;
  const label = fullscreen.active ? 'Thoát toàn màn hình' : 'Toàn màn hình';
  return (
    <button
      aria-label={label}
      className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/20 bg-white/10 text-white/90 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/50"
      onClick={fullscreen.toggle}
      title={label}
      type="button"
    >
      <Icon aria-hidden="true" className="size-5" strokeWidth={2.5} />
    </button>
  );
}
