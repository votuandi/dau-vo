import { Maximize, Minimize } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScoreboardConnectionStatus } from "../scoreboard-realtime";
import type { ScoreboardSource } from "../scoreboard-source";
import { useFullscreen } from "../display-controls";
import { ScoreboardSourceSwitcher } from "./scoreboard-source-switcher";

const CONNECTION_LABEL = {
  connected: "ĐANG TRỰC TUYẾN",
  reconnecting: "ĐANG KẾT NỐI LẠI",
  connecting: "ĐANG KẾT NỐI",
} as const;

export function ScoreboardHeader({
  source,
  onSelect,
  status,
  hasSnapshot,
  attention = false,
  matchPublicId,
}: {
  readonly source: ScoreboardSource;
  readonly onSelect: (source: ScoreboardSource) => void;
  readonly status: ScoreboardConnectionStatus;
  readonly hasSnapshot: boolean;
  readonly attention?: boolean;
  readonly matchPublicId?: string;
}) {
  return (
    <header
      aria-label="Thông tin bảng điểm"
      className={cn(
        "scoreboard-header rounded-2xl border px-3 py-2 backdrop-blur sm:px-5",
        attention
          ? "border-amber-200/40 bg-amber-950/45"
          : "border-white/10 bg-blue-950/25",
      )}
    >
      <div className="scoreboard-controls">
        <div className="min-w-0">
          <ScoreboardSourceSwitcher
            source={source}
            matchPublicId={matchPublicId ?? ""}
            onSelect={onSelect}
          />
        </div>
        <div className="flex items-center gap-2">
          <ConnectionBadge hasSnapshot={hasSnapshot} status={status} />
          <FullscreenButton />
        </div>
      </div>
    </header>
  );
}

function ConnectionBadge({
  status,
  hasSnapshot,
}: {
  readonly status: ScoreboardConnectionStatus;
  readonly hasSnapshot: boolean;
}) {
  const state =
    status === "connected"
      ? "connected"
      : hasSnapshot
        ? "reconnecting"
        : "connecting";
  return (
    <p
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-md font-bold",
        state === "connected"
          ? "border-emerald-300/40 bg-emerald-500/15 text-emerald-200"
          : "border-amber-200/40 bg-amber-500/15 text-amber-100",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          state === "connected"
            ? "bg-emerald-300"
            : "animate-pulse bg-amber-200",
        )}
      />
      {CONNECTION_LABEL[state]}
    </p>
  );
}

function FullscreenButton() {
  const fullscreen = useFullscreen();
  if (!fullscreen.supported) return null;
  const Icon = fullscreen.active ? Minimize : Maximize;
  const label = fullscreen.active ? "Thoát toàn màn hình" : "Toàn màn hình";
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
