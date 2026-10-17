import {
  ArrowRight,
  Check,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  GitBranch,
  History,
  Monitor,
  Radio,
  ShieldCheck,
  Smartphone,
  Timer,
  Trophy,
  UserCheck,
  Users,
  Wifi,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/site-footer';
import { Reveal } from '@/components/reveal';
import {
  AdminRosterMockup,
  BracketMockup,
  JudgePhoneMockup,
  ScoreboardMockup,
  SupervisorMockup,
} from '@/components/home-mockups';
import '@/styles/home.css';

const highlights = [
  {
    icon: Monitor,
    title: '4 màn hình chuyên biệt',
    text: 'Quản lý · Giám định · Giám sát · Bảng điểm',
  },
  { icon: FileSpreadsheet, title: 'Nhập danh sách từ Excel', text: 'Hỗ trợ .xlsx, .xls và .csv' },
  { icon: GitBranch, title: 'Nhánh đấu tự động', text: 'Bốc thăm, đặc cách, xuất PDF' },
  { icon: Wifi, title: 'Đồng bộ thời gian thực', text: 'Tự kết nối lại khi mạng chập chờn' },
];

const features = [
  {
    icon: Trophy,
    tag: 'Quản lý tập trung',
    title: 'Toàn bộ giải đấu trong một không gian',
    text: 'Tạo giải, khai báo hạng cân, đơn vị và vận động viên ở cùng một nơi. Không còn những bảng tính rời rạc gửi qua lại.',
    points: ['Hạng cân, đơn vị, vận động viên', 'Ảnh đại diện cho giải đấu'],
  },
  {
    icon: FileSpreadsheet,
    tag: 'Chuẩn bị nhanh',
    title: 'Nhập hàng trăm vận động viên trong vài giây',
    text: 'Tải tệp Excel hoặc CSV có sẵn, hệ thống đọc danh sách và đưa vận động viên vào đúng hạng cân để bạn rà soát.',
    points: ['.xlsx, .xls, .csv', 'Tệp không cần dòng tiêu đề'],
  },
  {
    icon: GitBranch,
    tag: 'Nhánh đấu rõ ràng',
    title: 'Bốc thăm công bằng, nhánh đấu minh bạch',
    text: 'Chia nhánh theo hạng cân, chọn đặc cách ngẫu nhiên, theo hạt giống hoặc thủ công. Xem trước, đổi vị trí rồi mới chốt.',
    points: ['Xem trước và đổi vị trí VĐV', 'Tải sơ đồ nhánh đấu PDF'],
  },
  {
    icon: UserCheck,
    tag: 'Đúng người, đúng việc',
    title: 'Phân công trọng tài cho từng trận',
    text: 'Gán giám định và giám sát theo trận. Mỗi người chỉ thấy đúng màn hình và đúng thao tác thuộc vai trò của mình.',
    points: ['Danh sách giám định, giám sát', 'Truy cập theo phân công'],
  },
  {
    icon: Smartphone,
    tag: 'Chấm điểm tại sân',
    title: 'Giám định chấm bằng một chạm',
    text: 'Màn hình giám định tối giản với hai nút Đỏ – Xanh cỡ lớn, dùng tốt trên điện thoại và máy tính bảng ngay cạnh thảm đấu.',
    points: ['Máy chủ xác nhận từng lựa chọn', 'Khóa thao tác khi mất kết nối'],
  },
  {
    icon: Timer,
    tag: 'Điều hành chủ động',
    title: 'Giám sát nắm quyền từng hiệp',
    text: 'Bắt đầu, tạm dừng, tiếp tục hiệp; ghi điểm cộng, lỗi nhẹ, lỗi nặng; xử lý hiệp phụ và phúc khảo ngay trên một màn hình.',
    points: ['Đồng hồ do máy chủ xác định', 'Đếm ngược nghỉ giữa hiệp'],
  },
  {
    icon: History,
    tag: 'Có căn cứ đối chiếu',
    title: 'Check VAR từng sự kiện trận đấu',
    text: 'Mọi lựa chọn của giám định, điểm, lỗi và mốc hiệp đều được lưu theo thời gian để giám sát đối chiếu trước khi công bố.',
    points: ['Lịch sử theo từng giây', 'Hỗ trợ phúc khảo kết quả'],
  },
  {
    icon: Monitor,
    tag: 'Hấp dẫn khán đài',
    title: 'Bảng điểm sống động trên màn hình lớn',
    text: 'Điểm hai bên, đồng hồ, lỗi và trạng thái trận hiển thị rõ ràng, cập nhật tức thì. Chỉ cần mở trình duyệt và trình chiếu.',
    points: ['Trình chiếu toàn màn hình', 'Dễ đọc từ xa'],
  },
];

const showcases: readonly {
  role: string;
  icon: typeof Users;
  title: string;
  text: string;
  points: string[];
  mockup: ReactNode;
}[] = [
  {
    role: 'Dành cho ban tổ chức',
    icon: ClipboardList,
    title: 'Chuẩn bị giải đấu gọn gàng như một bảng tính — nhưng thông minh hơn',
    text: 'Danh sách vận động viên được sắp theo hạng cân và đơn vị ngay khi nhập. Bạn luôn biết ai đã được xếp vào nhánh, ai còn chờ, giải đấu đã sẵn sàng đến đâu.',
    points: [
      'Nhập danh sách từ Excel, chỉnh sửa trực tiếp trên web',
      'Tìm vận động viên nhanh theo tên, đơn vị',
      'Quản lý giám định, giám sát ngay trong giải',
    ],
    mockup: <AdminRosterMockup />,
  },
  {
    role: 'Bốc thăm & nhánh đấu',
    icon: GitBranch,
    title: 'Từ bốc thăm đến chung kết, mọi cặp đấu đều rõ ràng',
    text: 'Hệ thống tự dựng nhánh đấu cho từng hạng cân và đưa người thắng đi tiếp sau mỗi trận. Ban tổ chức không phải tổng hợp lại bằng tay.',
    points: [
      'Đặc cách ngẫu nhiên, theo hạt giống hoặc chọn thủ công',
      'Xem trước, hoán đổi vị trí trước khi chốt',
      'Tải sơ đồ nhánh đấu PDF để in và niêm yết',
    ],
    mockup: <BracketMockup />,
  },
  {
    role: 'Dành cho giám định',
    icon: Smartphone,
    title: 'Chấm điểm bằng điện thoại, chỉ một chạm',
    text: 'Không cần thiết bị chuyên dụng. Giám định mở màn hình trên điện thoại, chạm chọn Đỏ hoặc Xanh khi hiệp đấu diễn ra — máy chủ xác nhận ngay lập tức.',
    points: [
      'Nút bấm lớn, dễ thao tác dưới áp lực thi đấu',
      'Hiển thị rõ trạng thái kết nối và thời gian hiệp',
      'Chỉ mở chấm điểm khi hiệp đang diễn ra, tránh bấm nhầm',
    ],
    mockup: <JudgePhoneMockup />,
  },
  {
    role: 'Dành cho giám sát',
    icon: ShieldCheck,
    title: 'Điều hành trận đấu và đối chiếu bằng Check VAR',
    text: 'Giám sát thấy ngay giám định nào đã kết nối, điểm số hai bên và đồng hồ chính thức. Khi cần, mở Check VAR để xem lại từng sự kiện trước khi công bố kết quả.',
    points: [
      'Bắt đầu, tạm dừng, tiếp tục hiệp; mở hiệp phụ khi cần',
      'Ghi điểm cộng, lỗi nhẹ, lỗi nặng cho từng bên',
      'Phúc khảo và công bố kết quả ngay trên màn hình',
    ],
    mockup: <SupervisorMockup />,
  },
];

const steps = [
  {
    icon: ClipboardList,
    title: 'Tạo giải & nhập danh sách',
    text: 'Khai báo hạng cân, đơn vị; nhập vận động viên từ Excel trong vài giây.',
  },
  {
    icon: GitBranch,
    title: 'Bốc thăm & phân công',
    text: 'Dựng nhánh đấu cho từng hạng cân, phân công giám định và giám sát.',
  },
  {
    icon: Radio,
    title: 'Thi đấu & chấm điểm',
    text: 'Giám định chấm trên điện thoại, giám sát điều hành, bảng điểm cập nhật tức thì.',
  },
  {
    icon: Trophy,
    title: 'Đối chiếu & công bố',
    text: 'Check VAR khi cần, công bố kết quả và đưa người thắng vào vòng tiếp theo.',
  },
];

const questions = [
  [
    'Cần chuẩn bị thiết bị gì?',
    'Một máy tính để ban tổ chức quản lý giải; điện thoại hoặc máy tính bảng cho giám định và giám sát; màn hình lớn hoặc TV nếu muốn trình chiếu bảng điểm. Tất cả chỉ cần trình duyệt và kết nối mạng ổn định — nên chạy thử trước ngày thi đấu.',
  ],
  [
    'Giám định chấm điểm như thế nào?',
    'Mỗi giám định mở màn hình riêng và chạm chọn bên Đỏ hoặc Xanh khi hiệp đấu đang diễn ra. Máy chủ xác nhận từng lựa chọn rồi cập nhật đến giám sát và bảng điểm cùng lúc.',
  ],
  [
    'Nếu mạng chập chờn giữa trận thì sao?',
    'Mỗi màn hình hiển thị trạng thái kết nối và tự kết nối lại. Trong lúc mất kết nối, thao tác chấm điểm bị khóa để tránh ghi nhận sai; thời gian hiệp luôn do máy chủ xác định nên không bị lệch giữa các thiết bị.',
  ],
  [
    'Chấm Điểm Võ Thuật hỗ trợ thi đấu võ gậy như thế nào?',
    'Hệ thống bao quát cả quy trình: quản lý danh sách theo hạng cân, bốc thăm nhánh đấu, chấm điểm của giám định, điều hành hiệp – hiệp phụ – phúc khảo của giám sát và bảng điểm cho khán giả.',
  ],
  [
    'Check VAR có phải video quay lại trận đấu không?',
    'Không. Check VAR là lịch sử điểm, lỗi và các sự kiện được ghi nhận trong hệ thống theo thời gian, giúp giám sát đối chiếu diễn biến. Đây không phải tính năng phát lại video.',
  ],
  [
    'Có thể dùng phần mềm thay cho điều lệ giải không?',
    'Phần mềm hỗ trợ quản lý và ghi nhận kết quả. Điều lệ, cách tính điểm và quyết định chuyên môn do ban tổ chức quy định. Hãy kiểm tra cấu hình và chạy thử theo điều lệ trước khi thi đấu.',
  ],
];

export function HomePage() {
  return (
    <div className="home-page flex min-h-dvh flex-col">
      <header className="home-header">
        <div className="container flex flex-wrap items-center justify-between gap-3 py-3">
          <a
            href="/"
            className="flex items-center gap-2 font-extrabold text-primary"
            aria-label="Chấm Điểm Võ Thuật — Trang chủ"
          >
            <img
              src={`${import.meta.env.BASE_URL}logo.webp`}
              alt="Logo võ sĩ Chấm Điểm Võ Thuật"
              width={48}
              height={48}
              className="size-12 object-contain"
            />
            <span>Chấm Điểm Võ Thuật</span>
          </a>
          <nav
            aria-label="Điều hướng trang chủ"
            className="flex flex-wrap items-center gap-1 text-sm font-semibold"
          >
            <a href="#tinh-nang" className="home-nav-link max-md:hidden">
              Tính năng
            </a>
            <a href="#giao-dien" className="home-nav-link max-md:hidden">
              Giao diện
            </a>
            <a href="#quy-trinh" className="home-nav-link max-md:hidden">
              Quy trình
            </a>
            <a href="#hoi-dap" className="home-nav-link max-md:hidden">
              Hỏi đáp
            </a>
            <a href="/login" className="home-nav-link text-primary">
              Đăng nhập
            </a>
            <a href="/workspace" className="home-button home-button-primary home-button-sm">
              Vào nền tảng <ArrowRight size={15} />
            </a>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <section className="home-hero">
          <div className="container grid items-center gap-14 py-14 lg:grid-cols-[1.05fr_1fr] lg:py-24">
            <div>
              <p className="home-eyebrow">
                <span /> CHẤM ĐIỂM · ĐIỀU HÀNH · TRÌNH CHIẾU
              </p>
              <h1 className="mt-6 text-4xl font-black leading-[1.15] tracking-tight sm:text-5xl xl:text-6xl">
                Nền tảng chấm điểm võ thuật và võ gậy{' '}
                <span className="home-gradient-text">minh bạch đến từng điểm số.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
                Kết nối ban tổ chức, giám định, giám sát và khán giả trên cùng một hệ thống. Chuẩn
                bị giải trong vài bước, chấm điểm bằng điện thoại, điều hành từng hiệp và trình
                chiếu kết quả ngay khi trận đấu diễn ra.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="/register" className="home-button home-button-primary">
                  Bắt đầu tổ chức giải <ArrowRight size={18} />
                </a>
                <a href="#giao-dien" className="home-button home-button-secondary">
                  Xem giao diện <Monitor size={18} />
                </a>
              </div>
              <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                {[
                  'Chạy trên trình duyệt, không cần cài đặt',
                  'Máy tính, máy tính bảng, điện thoại',
                  'Màn hình riêng cho từng vai trò',
                ].map((text) => (
                  <li key={text} className="flex items-center gap-2">
                    <Check size={16} className="text-emerald-600" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
            <div className="home-hero-stage min-w-0">
              <ScoreboardMockup />
              <div className="home-hero-phone">
                <JudgePhoneMockup />
              </div>
              <div className="home-float home-float-top" aria-hidden="true">
                <span className="home-float-icon">
                  <Wifi size={16} />
                </span>
                <span>
                  <b>3/3 giám định</b>
                  <small>đã kết nối</small>
                </span>
              </div>
              <div className="home-float home-float-bottom" aria-hidden="true">
                <span className="home-float-icon home-float-icon-green">
                  <Radio size={16} />
                </span>
                <span>
                  <b>Cập nhật tức thì</b>
                  <small>Giám định → Bảng điểm</small>
                </span>
              </div>
              <p className="home-mock-note">Mockup minh họa với dữ liệu mẫu</p>
            </div>
          </div>
        </section>

        <div className="home-highlights">
          <div className="container grid gap-4 py-7 sm:grid-cols-2 lg:grid-cols-4">
            {highlights.map(({ icon: Icon, title, text }) => (
              <div key={title} className="home-highlight">
                <span className="home-feature-icon">
                  <Icon size={22} />
                </span>
                <div className="min-w-0">
                  <p className="font-bold">{title}</p>
                  <p className="text-sm text-muted-foreground">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <section id="tinh-nang" className="home-section container">
          <Reveal className="text-center">
            <p className="home-kicker">TẤT CẢ TRONG MỘT NỀN TẢNG</p>
            <h2 className="home-heading">
              Mọi công việc của một giải đấu,
              <br className="max-sm:hidden" /> từ khâu chuẩn bị đến lúc trao giải.
            </h2>
            <p className="home-intro mx-auto">
              Thay cho bảng tính, giấy ghi điểm và bảng lật số: một hệ thống duy nhất giữ thông tin
              giải đấu, người tham gia và diễn biến từng trận — chính xác, đồng bộ và dễ đối chiếu.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {features.map(({ icon: Icon, tag, title, text, points }, index) => (
              <Reveal key={title} delay={(index % 4) * 70} className="h-full">
                <article className="home-card home-feature-card h-full">
                  <span className="home-feature-icon">
                    <Icon size={24} />
                  </span>
                  <p className="mt-5 text-xs font-bold uppercase tracking-wider text-primary">
                    {tag}
                  </p>
                  <h3 className="mt-2 text-lg font-bold leading-snug">{title}</h3>
                  <p className="mt-3 text-[0.95rem] leading-7 text-muted-foreground">{text}</p>
                  <ul className="home-points mt-4">
                    {points.map((point) => (
                      <li key={point}>
                        <Check size={14} />
                        {point}
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="giao-dien" className="home-showcase">
          <div className="container home-section">
            <Reveal className="text-center">
              <p className="home-kicker">MỖI VAI TRÒ, MỘT GIAO DIỆN</p>
              <h2 className="home-heading">Thiết kế cho đúng người dùng, đúng thời điểm.</h2>
              <p className="home-intro mx-auto">
                Ban tổ chức làm việc trên máy tính, giám định và giám sát thao tác tại sân bằng điện
                thoại hoặc máy tính bảng, khán giả theo dõi trên màn hình lớn. Tất cả cùng một nhịp.
              </p>
            </Reveal>
            <div className="mt-14 flex flex-col gap-20 lg:gap-28">
              {showcases.map(({ role, icon: Icon, title, text, points, mockup }, index) => (
                <div key={title} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                  <Reveal
                    direction={index % 2 ? 'right' : 'left'}
                    className={index % 2 ? 'lg:order-2' : ''}
                  >
                    <span className="home-role-badge">
                      <Icon size={15} /> {role}
                    </span>
                    <h3 className="mt-4 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
                      {title}
                    </h3>
                    <p className="mt-4 leading-8 text-muted-foreground">{text}</p>
                    <ul className="home-points home-points-lg mt-6">
                      {points.map((point) => (
                        <li key={point}>
                          <Check size={16} />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </Reveal>
                  <Reveal
                    direction="zoom"
                    delay={100}
                    className={`home-mock-frame min-w-0 ${index % 2 ? 'lg:order-1' : ''}`}
                  >
                    {mockup}
                  </Reveal>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="vo-gay" className="home-section container">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal direction="left">
              <div className="home-arena">
                <img
                  src={`${import.meta.env.BASE_URL}martial-arts-arena.webp`}
                  alt="Minh họa hai vận động viên võ gậy mặc giáp đỏ và xanh thi đấu dưới sự giám sát của trọng tài"
                  width={1774}
                  height={887}
                  loading="lazy"
                />
                <span className="home-arena-badge">
                  <Trophy size={14} /> Võ gậy · Tinh thần thượng võ
                </span>
              </div>
            </Reveal>
            <Reveal direction="right" delay={100}>
              <p className="home-kicker">ĐỒNG HÀNH CÙNG VÕ THUẬT VIỆT</p>
              <h2 className="home-heading">
                Võ sĩ tập trung thi đấu.
                <br />
                Kết quả để công nghệ lo.
              </h2>
              <p className="home-intro">
                Trong thi đấu võ gậy, mỗi pha ra đòn và mỗi giây trên đồng hồ đều có thể quyết định
                kết quả. Chấm Điểm Võ Thuật giúp đội ngũ chuyên môn ghi nhận nhanh, điều hành chặt
                chẽ và lưu lại đầy đủ diễn biến — để mọi kết quả đều thuyết phục vận động viên, huấn
                luyện viên và khán giả.
              </p>
              <a href="/register" className="home-text-link">
                Tạo giải đấu đầu tiên <ArrowRight size={18} />
              </a>
            </Reveal>
          </div>
        </section>

        <section id="quy-trinh" className="home-section container !pt-0">
          <Reveal className="text-center">
            <p className="home-kicker">QUY TRÌNH 4 BƯỚC</p>
            <h2 className="home-heading">Sẵn sàng cho ngày thi đấu.</h2>
          </Reveal>
          <div className="home-steps mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ icon: Icon, title, text }, index) => (
              <Reveal key={title} delay={index * 80} className="h-full">
                <article className="home-card home-step h-full">
                  <div className="flex items-center justify-between">
                    <span className="home-feature-icon">
                      <Icon size={22} />
                    </span>
                    <span className="home-step-number">0{index + 1}</span>
                  </div>
                  <h3 className="mt-5 text-lg font-bold">{title}</h3>
                  <p className="mt-2 leading-7 text-muted-foreground">{text}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="hoi-dap" className="container pb-20">
          <Reveal className="text-center">
            <p className="home-kicker">TRƯỚC KHI BẮT ĐẦU</p>
            <h2 className="home-heading">Câu hỏi thường gặp</h2>
          </Reveal>
          <div className="mx-auto mt-10 grid max-w-5xl items-start gap-4 md:grid-cols-2">
            {questions.map(([question, answer], index) => (
              <Reveal key={question} delay={(index % 2) * 80}>
                <details className="home-faq">
                  <summary>
                    {question}
                    <ChevronRight size={18} />
                  </summary>
                  <p>{answer}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="container pb-20">
          <Reveal direction="zoom">
            <div className="home-cta">
              <div>
                <p className="text-sm font-bold uppercase tracking-widest text-sky-200">
                  GIẢI ĐẤU TIẾP THEO CỦA BẠN
                </p>
                <h2 className="mt-4 text-3xl font-extrabold leading-tight md:text-4xl">
                  Chuẩn bị chu đáo.
                  <br />
                  Thi đấu hết mình.
                </h2>
                <p className="mt-4 max-w-xl leading-7 text-sky-100">
                  Tạo tài khoản, dựng giải đấu đầu tiên và chạy thử một trận với đầy đủ màn hình
                  giám định, giám sát và bảng điểm.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <a href="/register" className="home-button home-button-light">
                    Tạo tài khoản ngay <ArrowRight size={18} />
                  </a>
                  <a href="/login" className="home-button home-button-ghost">
                    Đăng nhập
                  </a>
                </div>
              </div>
              <img
                src={`${import.meta.env.BASE_URL}logo.webp`}
                alt="Võ sĩ chibi trong trang phục xanh"
                width={220}
                height={220}
                loading="lazy"
                className="home-cta-mascot hidden w-48 object-contain sm:block"
              />
              <nav aria-label="Truy cập nhanh theo vai trò" className="home-quick-links">
                <a href="/giam-dinh">
                  <Smartphone size={15} /> Màn hình giám định <ArrowRight size={14} />
                </a>
                <a href="/giam-sat">
                  <ShieldCheck size={15} /> Màn hình giám sát <ArrowRight size={14} />
                </a>
                <a href="/bang-diem">
                  <Monitor size={15} /> Bảng điểm <ArrowRight size={14} />
                </a>
              </nav>
            </div>
          </Reveal>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
