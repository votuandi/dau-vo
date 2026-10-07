import { unitStatusLabel, type UnitImportStatus } from './athlete-import-summary';

/* Read-only summaries shown in the athlete import preview and completion dialogs. */

export function ImportReviewSection({
  records,
  title,
}: {
  readonly title: string;
  readonly records: readonly {
    readonly id: number;
    readonly label: string;
    readonly eligible: boolean;
    readonly reason: string;
  }[];
}) {
  const eligible = records.filter((record) => record.eligible);
  const ineligible = records.filter((record) => !record.eligible);
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="font-black">{title}</h3>
      <div>
        <p className="font-bold text-emerald-700">Có thể thêm ({eligible.length})</p>
        <ul className="list-disc space-y-1 pl-5">
          {eligible.map((record) => (
            <li className="break-words" key={record.id}>
              {record.label}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-bold text-destructive">Không thể thêm ({ineligible.length})</p>
        <ul className="list-disc space-y-1 pl-5">
          {ineligible.map((record) => (
            <li className="break-words" key={record.id}>
              {record.label}
              {record.reason ? ` — ${record.reason}` : ''}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function ImportCompletionSection({
  added,
  notAdded,
  title,
}: {
  readonly title: string;
  readonly added: readonly { readonly id: number; readonly label: string }[];
  readonly notAdded: readonly {
    readonly id: number;
    readonly label: string;
    readonly reason: string;
  }[];
}) {
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="font-black">{title}</h3>
      <div>
        <p className="font-bold text-emerald-700">Đã thêm ({added.length})</p>
        <ul className="list-disc space-y-1 pl-5">
          {added.map((record) => (
            <li className="break-words" key={record.id}>
              {record.label}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-bold text-destructive">Không thêm được ({notAdded.length})</p>
        <ul className="list-disc space-y-1 pl-5">
          {notAdded.map((record) => (
            <li className="break-words" key={record.id}>
              {record.label} — {record.reason}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function ImportUnitSection({
  records,
  title,
}: {
  readonly title: string;
  readonly records: readonly {
    readonly id: string;
    readonly label: string;
    readonly status: UnitImportStatus;
    readonly errors: readonly string[];
  }[];
}) {
  const groups: readonly { readonly status: UnitImportStatus; readonly tone: string }[] = [
    { status: 'pending', tone: 'text-emerald-700' },
    { status: 'created', tone: 'text-emerald-700' },
    { status: 'existing', tone: 'text-muted-foreground' },
    { status: 'restored', tone: 'text-emerald-700' },
    { status: 'invalid', tone: 'text-destructive' },
  ];
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="font-black">{title}</h3>
      {groups.map(({ status, tone }) => {
        const items = records.filter((record) => record.status === status);
        if (!items.length) return null;
        return (
          <div key={status}>
            <p className={`font-bold ${tone}`}>
              {unitStatusLabel(status)} ({items.length})
            </p>
            <ul className="list-disc space-y-1 pl-5">
              {items.map((record) => (
                <li className="break-words" key={record.id}>
                  {record.label}
                  {record.errors.length ? ` — ${record.errors.join(', ')}` : ''}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
