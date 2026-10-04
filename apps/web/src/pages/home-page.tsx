import { SiteFooter } from '@/components/site-footer';

const features = [
  [
    'Quản lý giải đấu',
    'Tập trung thông tin giải đấu, đơn vị, vận động viên và hạng cân trong cùng một hệ thống. Nhập danh sách vận động viên từ Excel để chuẩn bị giải.',
  ],
  [
    'Bốc thăm và nhánh đấu',
    'Chia nhánh theo hạng cân, theo dõi lịch thi đấu theo vòng và cập nhật vận động viên đi tiếp sau mỗi trận.',
  ],
  [
    'Chấm điểm theo thời gian thực',
    'Giám định ghi nhận điểm và lỗi nhẹ, lỗi nặng. Giám sát điều hành hiệp đấu, tạm dừng và theo dõi kết nối của các màn hình.',
  ],
  [
    'Bảng điểm và Check VAR',
    'Hiển thị điểm hai bên, thời gian và trạng thái trận đấu trên bảng điểm. Giám sát có thể xem lịch sử chấm điểm, lỗi và sự kiện để đối chiếu.',
  ],
] as const;

const questions = [
  [
    'Đấu Võ hỗ trợ chấm điểm võ gậy như thế nào?',
    'Nền tảng kết nối màn hình giám định, giám sát và bảng điểm trong trận đấu. Điểm số và lỗi được ghi nhận theo thời gian thực, giúp ban tổ chức theo dõi diễn biến thi đấu võ gậy trên cùng một hệ thống.',
  ],
  [
    'Cần chuẩn bị gì để tổ chức thi đấu võ thuật?',
    'Ban tổ chức chuẩn bị thông tin giải đấu, danh sách vận động viên, đơn vị và hạng cân; sau đó bốc thăm nhánh đấu, phân công giám định và giám sát. Thiết bị chấm điểm và bảng điểm cần có kết nối mạng ổn định.',
  ],
  [
    'Phần mềm có thay thế điều lệ thi đấu võ gậy không?',
    'Không. Phần mềm hỗ trợ quản lý và ghi nhận kết quả; điều lệ, cách tính điểm, lỗi và quyết định chuyên môn do ban tổ chức quy định. Trước khi thi đấu, cần kiểm tra thiết lập và chạy thử theo điều lệ của giải.',
  ],
  [
    'Có thể sử dụng trên điện thoại và máy tính không?',
    'Đấu Võ hoạt động trên trình duyệt web. Ban tổ chức có thể sử dụng máy tính để quản lý, điện thoại hoặc máy tính bảng để truy cập màn hình chấm điểm, và màn hình lớn để hiển thị bảng điểm.',
  ],
] as const;

export function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-white/70 bg-white/75">
        <div className="container flex flex-wrap items-center justify-between gap-4 py-4">
          <a
            href="/"
            className="flex items-center gap-3 font-extrabold text-primary"
            aria-label="Đấu Võ Minwy — Trang chủ"
          >
            <img
              src={`${import.meta.env.BASE_URL}logo.webp`}
              alt="Logo Đấu Võ Minwy"
              width={48}
              height={48}
              className="size-12 object-contain"
            />
            Đấu Võ Minwy
          </a>
          <nav
            aria-label="Điều hướng trang chủ"
            className="flex flex-wrap gap-4 text-sm font-semibold"
          >
            <a href="#tinh-nang" className="hover:text-primary">
              Tính năng
            </a>
            <a href="#vo-gay" className="hover:text-primary">
              Võ gậy
            </a>
            <a href="/login" className="text-primary hover:underline">
              Đăng nhập
            </a>
          </nav>
        </div>
      </header>
      <main className="container flex-1 py-12 md:py-20">
        <section className="grid items-center gap-8 md:grid-cols-[1.5fr_0.5fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-primary">
              Từ chuẩn bị giải đến kết quả trận đấu
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight tracking-tight md:text-5xl">
              Nền tảng chấm điểm võ thuật và võ gậy
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Đấu Võ Minwy giúp ban tổ chức quản lý thi đấu võ thuật, chia nhánh và chấm điểm võ gậy
              theo thời gian thực. Kết nối giám định, giám sát và bảng điểm để theo dõi từng trận
              đấu rõ ràng, tập trung.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="/register"
                className="rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground shadow-md hover:bg-primary/90"
              >
                Đăng ký tài khoản
              </a>
              <a
                href="/workspace"
                className="rounded-xl border bg-white px-6 py-3 font-bold text-primary hover:bg-accent"
              >
                Vào nền tảng
              </a>
            </div>
          </div>
          <img
            src={`${import.meta.env.BASE_URL}logo.webp`}
            alt="Cúp Minwy với hình võ sĩ — nền tảng chấm điểm võ thuật"
            width={256}
            height={256}
            className="mx-auto w-48 object-contain md:w-full md:max-w-64"
            fetchPriority="high"
          />
        </section>
        <section id="tinh-nang" className="mt-16 scroll-mt-6">
          <h2 className="text-2xl font-extrabold md:text-3xl">Hỗ trợ tổ chức thi đấu võ thuật</h2>
          <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
            Theo dõi danh sách tham dự, nhánh đấu và tiến trình trận đấu mà không phải chuyển qua
            nhiều công cụ riêng lẻ.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {features.map(([title, description]) => (
              <article key={title} className="rounded-2xl border bg-white/80 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-primary">{title}</h3>
                <p className="mt-3 leading-7 text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </section>
        <section
          id="vo-gay"
          className="mt-16 scroll-mt-6 rounded-2xl border bg-white/80 p-6 md:p-10"
        >
          <h2 className="text-2xl font-extrabold md:text-3xl">
            Chấm điểm võ gậy trong từng trận đấu
          </h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            Trong thi đấu võ gậy, ban tổ chức cần theo dõi điểm của hai vận động viên, lỗi vi phạm
            và thời gian từng hiệp. Đấu Võ cung cấp màn hình riêng cho từng vai trò để giám định ghi
            nhận, giám sát điều hành và khán giả theo dõi bảng điểm.
          </p>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            <li>
              <h3 className="font-bold">1. Chuẩn bị giải</h3>
              <p className="mt-2 leading-7 text-muted-foreground">
                Thêm vận động viên, phân hạng cân, bốc thăm nhánh đấu và phân công người phụ trách.
              </p>
            </li>
            <li>
              <h3 className="font-bold">2. Điều hành trận</h3>
              <p className="mt-2 leading-7 text-muted-foreground">
                Kiểm tra kết nối, bắt đầu hiệp đấu, ghi nhận điểm và lỗi; theo dõi thời gian nghỉ
                giữa hiệp.
              </p>
            </li>
            <li>
              <h3 className="font-bold">3. Đối chiếu kết quả</h3>
              <p className="mt-2 leading-7 text-muted-foreground">
                Xem lịch sử chấm điểm và Check VAR, chốt kết quả rồi theo dõi các trận tiếp theo
                trong nhánh đấu.
              </p>
            </li>
          </ol>
          <p className="mt-6 text-sm leading-6 text-muted-foreground">
            Các quyết định chuyên môn và điều lệ thi đấu thuộc trách nhiệm của ban tổ chức. Hãy chạy
            thử hệ thống trước giải và kiểm tra cấu hình theo điều lệ đang áp dụng.
          </p>
        </section>
        <section className="mt-16">
          <h2 className="text-2xl font-extrabold md:text-3xl">
            Câu hỏi về chấm điểm và thi đấu võ gậy
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {questions.map(([question, answer]) => (
              <article key={question}>
                <h3 className="font-bold">{question}</h3>
                <p className="mt-2 leading-7 text-muted-foreground">{answer}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="mt-16 rounded-2xl bg-primary p-6 text-primary-foreground md:p-10">
          <h2 className="text-2xl font-extrabold">Chuẩn bị giải đấu cùng Đấu Võ Minwy</h2>
          <p className="mt-3 leading-7">
            Đăng nhập để quản lý giải đấu, hoặc truy cập màn hình được phân công trong ngày thi đấu.
          </p>
          <nav
            aria-label="Truy cập nền tảng"
            className="mt-6 flex flex-wrap gap-4 font-bold underline underline-offset-4"
          >
            <a href="/login">Đăng nhập quản lý</a>
            <a href="/giam-dinh">Màn hình giám định</a>
            <a href="/giam-sat">Màn hình giám sát</a>
            <a href="/bang-diem">Bảng điểm</a>
          </nav>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
