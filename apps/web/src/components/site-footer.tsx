import { ArrowUpRight, Mail, Monitor, Phone, ShieldCheck, Smartphone } from 'lucide-react';

const QUICK_LINKS = [
  { href: '/giam-dinh', label: 'Màn hình giám định', icon: Smartphone },
  { href: '/giam-sat', label: 'Màn hình giám sát', icon: ShieldCheck },
  { href: '/bang-diem', label: 'Bảng điểm trực tiếp', icon: Monitor },
] as const;

const AUTHORS = ['Trần Trung Sơn', 'Võ Hoài Nam', 'Võ Tuấn Dĩ'] as const;

const linkClassName =
  'group inline-flex items-center gap-2 rounded-md text-sky-100/80 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300';

export function SiteFooter() {
  return (
    <footer className="border-t border-white/15 bg-[#061826]/75 text-sm text-sky-100/80 backdrop-blur-xl backdrop-saturate-150">
      <div className="container grid gap-10 py-12 md:grid-cols-2 md:gap-8 lg:grid-cols-[1fr_auto_auto] lg:gap-12">
        <div className="max-w-sm">
          <a
            className="inline-flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            href="/"
          >
            <img
              src={`${import.meta.env.BASE_URL}logo.webp`}
              alt="Logo Chấm Điểm Võ Thuật"
              width={48}
              height={48}
              className="size-12 shrink-0 rounded-lg bg-white/[0.06] object-contain p-1 ring-1 ring-white/10"
              loading="lazy"
            />
            <span>
              <span className="block text-base font-semibold text-[#eef0f5]">
                Chấm Điểm Võ Thuật
              </span>
              <span className="mt-0.5 block text-xs text-[#7a8296]">
                Nền tảng chấm điểm võ thuật
              </span>
            </span>
          </a>
          <p className="mt-4 leading-6">
            Giám định chấm điểm trên điện thoại, giám sát điều hành trận đấu và bảng điểm cập nhật
            theo thời gian thực.
          </p>
        </div>

        <nav aria-label="Truy cập nhanh">
          <h2 className="text-xs font-medium text-[#eef0f5]">Truy cập nhanh</h2>
          <ul className="mt-4 grid gap-2.5">
            {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <a className={linkClassName} href={href}>
                  <Icon aria-hidden="true" className="size-4 text-[#7a8296]" />
                  {label}
                  <ArrowUpRight
                    aria-hidden="true"
                    className="size-3.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                  />
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="md:col-span-2 lg:col-span-1">
          <h2 className="text-xs font-medium text-[#eef0f5]">Liên hệ</h2>
          <p className="mt-4">
            Website được thực hiện bởi:{' '}
            <span className="font-medium text-[#eef0f5]">{AUTHORS.join(' · ')}</span>
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 lg:flex-nowrap lg:whitespace-nowrap">
            <span>
              Kỹ sư phát triển: <span className="font-medium text-[#eef0f5]">Võ Tuấn Dĩ</span>
            </span>
            <span aria-hidden="true">-</span>
            <a className={linkClassName} href="mailto:divt.it97@gmail.com">
              <Mail aria-hidden="true" className="size-4 text-[#7a8296]" />
              divt.it97@gmail.com
            </a>
            <span aria-hidden="true">-</span>
            <a className={linkClassName} href="tel:0708699808">
              <Phone aria-hidden="true" className="size-4 text-[#7a8296]" />
              0708.699.808
            </a>
          </p>
        </div>
      </div>

      <div className="border-t border-white/[0.08]">
        <div className="container py-5 text-xs text-[#7a8296]">
          <p>
            © <span suppressHydrationWarning>{new Date().getFullYear()}</span> Chấm Điểm Võ Thuật
          </p>
        </div>
      </div>
    </footer>
  );
}
