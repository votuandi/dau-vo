export function SiteFooter() {
  return (
    <footer className="border-t border-white/70 bg-white/40 py-6 text-sm text-muted-foreground backdrop-blur">
      <div className="container flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL}logo.webp`}
            alt="Logo Chấm Điểm Võ Thuật"
            width={56}
            height={56}
            className="size-14 shrink-0 object-contain"
            loading="lazy"
          />
          <p className="font-semibold text-foreground">Nền tảng chấm điểm võ thuật</p>
        </div>
        <div className="min-w-0 space-y-1 lg:text-right">
          <p>Website được thực hiện bởi: Trần Trung Sơn - Võ Hoài Nam - Võ Tuấn Dĩ</p>
          <p>
            Kỹ sư phát triển: Võ Tuấn Dĩ - E-mail:{' '}
            <a
              className="rounded hover:text-primary hover:underline"
              href="mailto:divt.it97@gmail.com"
            >
              divt.it97@gmail.com
            </a>{' '}
            - SĐT:{' '}
            <a className="rounded hover:text-primary hover:underline" href="tel:0708699808">
              0708.699.808
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
