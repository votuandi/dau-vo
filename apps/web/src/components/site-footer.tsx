export function SiteFooter() {
  return (
    <footer className="border-t border-white/70 bg-white/40 py-6 text-sm text-muted-foreground backdrop-blur">
      <div className="container flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL}logo.webp`}
            alt="Logo Đấu Võ Minwy"
            width={56}
            height={56}
            className="size-14 shrink-0 object-contain"
            loading="lazy"
          />
          <p className="font-semibold text-foreground">Nền tảng chấm điểm võ thuật</p>
        </div>
        <address className="space-y-1 not-italic">
          <p>Thực hiện: Võ Tuấn Dĩ</p>
          <p>
            E-mail:{' '}
            <a
              className="rounded hover:text-primary hover:underline"
              href="mailto:divt.it97@gmail.com"
            >
              divt.it97@gmail.com
            </a>
          </p>
          <p>
            SĐT:{' '}
            <a className="rounded hover:text-primary hover:underline" href="tel:0708699808">
              0708.699.808
            </a>
          </p>
        </address>
      </div>
    </footer>
  );
}
