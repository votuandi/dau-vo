interface PlaceholderPageProps {
  readonly title: string;
  readonly description: string;
  readonly route: string;
}

export function PlaceholderPage({ title, description, route }: PlaceholderPageProps) {
  return (
    <section className="mx-auto w-full max-w-3xl rounded-2xl border border-border bg-card p-8 shadow-sm md:p-12">
      <div className="inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wider text-secondary-foreground">
        Sắp triển khai
      </div>
      <h1 className="mt-6 text-3xl font-black tracking-tight md:text-5xl">{title}</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
        {description}
      </p>
      <p className="mt-8 font-mono text-sm text-muted-foreground">{route}</p>
    </section>
  );
}
