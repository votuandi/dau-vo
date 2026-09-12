# ADR: Tournament roster registrations and match snapshots

`TournamentAthlete` is the current, tournament-scoped registration record. A
`MatchAthlete` is the historical competitor snapshot used by scoring, penalties,
and audit history. They intentionally coexist: `MatchAthlete.athleteId` is an
optional provenance link, while its name and organization remain independent
snapshot fields.

Roster rows use recoverable deactivation (`isActive` and `deactivatedAt`). Names
are unique for the entire lifetime of a tournament, including deactivated rows.
To replace a deactivated organization or weight class with the same display name, the
old row must first be renamed; this makes restoration unambiguous. Deactivation
does not delete registrations or historical snapshots. Physical tournament purge
cascades roster rows after match cleanup; an athlete referenced by a surviving
snapshot is restricted from physical deletion.

Tournament boundaries are database-enforced with composite foreign keys. The
only legacy backfill is `MatchAthlete.tournamentId`, derived losslessly from its
existing match. No roster data is inferred from legacy snapshot strings.

Images are storage keys behind the `ImageStorage` port. A durable deletion
outbox is written with the permanent-purge transaction and processed after
commit, enabling a future verified S3 adapter without domain-service changes.
