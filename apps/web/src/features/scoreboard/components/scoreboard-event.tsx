import type { PublicMatchStatePayload } from '@martial-arts-scoring/shared-types';
import { MapPin } from 'lucide-react';
import { ScoreboardImage } from './scoreboard-image';
export function ScoreboardEvent({
  tournament,
}: {
  readonly tournament: PublicMatchStatePayload['tournament'];
}) {
  return (
    <div className="scoreboard-event-slot">
      {' '}
      {tournament ? (
        <div className="scoreboard-event">
          <ScoreboardImage
            alt={`Logo ${tournament.name}`}
            imagePath={tournament.imagePath}
            kind="organization"
            className="scoreboard-event-logo"
          />
          <div className="min-w-0">
            <h1 className="scoreboard-event-name" title={tournament.name}>
              {tournament.name}
            </h1>
            {tournament.location ? (
              <p className="scoreboard-event-location" title={tournament.location}>
                <MapPin aria-hidden="true" className="size-[1em] shrink-0" />
                <span className="truncate">{tournament.location}</span>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
export function ScoreboardWeightClass({
  weightClass,
}: {
  readonly weightClass: PublicMatchStatePayload['weightClass'];
}) {
  return (
    <div className="scoreboard-weight-slot">
      {weightClass ? (
        <p className="scoreboard-weight" title={weightClass.name}>
          <span>Hạng cân</span>
          <strong>{weightClass.name}</strong>
        </p>
      ) : null}
    </div>
  );
}
