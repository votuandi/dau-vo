import {
  Check,
  Download,
  FileSpreadsheet,
  History,
  Monitor,
  Pause,
  ShieldCheck,
  Wifi,
} from 'lucide-react';

/*
 * HTML/CSS illustrations of the real screens, filled with sample data. They are
 * marked as images so screen readers get one summary instead of every label.
 */

function WindowBar({ title, dark = false }: { readonly title: string; readonly dark?: boolean }) {
  return (
    <div className={dark ? 'home-window-bar' : 'home-window-bar home-window-bar-light'}>
      <span className="home-window-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="truncate">{title}</span>
      <Monitor size={15} />
    </div>
  );
}

export function ScoreboardMockup() {
  return (
    <div
      className="home-scoreboard"
      role="img"
      aria-label="Mockup bảng điểm minh họa: hiệp 2, còn 1 phút 24 giây, bên đỏ 8 điểm, bên xanh 6 điểm"
    >
      <WindowBar title="Bảng điểm thi đấu" dark />
      <div className="home-score-meta">
        <span>VÕ GẬY · HẠNG CÂN 60 KG</span>
        <span className="home-live">
          <i /> Đang thi đấu
        </span>
      </div>
      <div className="home-timer">
        <span>HIỆP 02</span>
        <strong>01:24</strong>
        <span>Thời gian còn lại</span>
      </div>
      <div className="home-scores">
        <div className="home-red">
          <span>GÓC ĐỎ</span>
          <h3>Nguyễn Minh Anh</h3>
          <p>Đơn vị A</p>
          <strong>08</strong>
          <span>Lỗi nhẹ: 1 · Lỗi nặng: 0</span>
        </div>
        <div className="home-blue">
          <span>GÓC XANH</span>
          <h3>Trần Hoàng Nam</h3>
          <p>Đơn vị B</p>
          <strong>06</strong>
          <span>Lỗi nhẹ: 0 · Lỗi nặng: 0</span>
        </div>
      </div>
      <div className="home-score-bottom">
        <ShieldCheck size={15} /> Giám sát điều hành <span>Hiệp 2 / 3</span>
      </div>
    </div>
  );
}

export function JudgePhoneMockup() {
  return (
    <div
      className="home-phone"
      role="img"
      aria-label="Mockup màn hình giám định trên điện thoại: đồng hồ hiệp 2 và hai nút chọn bên đỏ, bên xanh"
    >
      <div className="home-phone-screen">
        <span className="home-phone-notch" aria-hidden="true" />
        <div className="home-phone-head">
          <div>
            <small>GIÁM ĐỊNH 1</small>
            <b>M-0142</b>
          </div>
          <span>
            <i /> Đã kết nối
          </span>
        </div>
        <div className="home-phone-timer">
          <small>HIỆP 2</small>
          <strong>01:24</strong>
          <small>Thời gian do máy chủ xác định</small>
        </div>
        <div className="home-phone-votes">
          <span className="home-phone-red">
            <small>RED</small>
            <b>RED</b>
            <em>Minh Anh</em>
          </span>
          <span className="home-phone-blue">
            <small>BLUE</small>
            <b>BLUE</b>
            <em>Hoàng Nam</em>
          </span>
        </div>
        <p className="home-phone-status">
          <Check size={12} /> Máy chủ đã ghi nhận lựa chọn RED
        </p>
      </div>
    </div>
  );
}

const athletes = [
  ['Nguyễn Minh Anh', 'CLB Bình Định', 'Đã xếp'],
  ['Trần Hoàng Nam', 'CLB Tây Sơn', 'Đã xếp'],
  ['Lê Quốc Huy', 'CLB An Nhơn', 'Đã xếp'],
  ['Phạm Gia Bảo', 'CLB Quy Nhơn', 'Chờ xếp'],
] as const;

export function AdminRosterMockup() {
  return (
    <div
      className="home-window home-admin"
      role="img"
      aria-label="Mockup trang quản lý vận động viên: danh sách theo hạng cân, nút nhập từ Excel"
    >
      <WindowBar title="Giải Võ gậy mở rộng 2026 · Vận động viên" />
      <div className="home-admin-body">
        <aside aria-hidden="true">
          {['Tổng quan', 'Hạng cân', 'Đơn vị', 'Vận động viên', 'Trận đấu', 'Giám định'].map(
            (item) => (
              <span key={item} className={item === 'Vận động viên' ? 'is-active' : undefined}>
                {item}
              </span>
            ),
          )}
        </aside>
        <div className="min-w-0">
          <div className="home-admin-top">
            <div className="min-w-0">
              <b>Vận động viên</b>
              <small>128 VĐV · 12 hạng cân · 9 đơn vị</small>
            </div>
            <span className="home-admin-import">
              <FileSpreadsheet size={13} /> Nhập Excel
            </span>
          </div>
          <div className="home-admin-chips">
            {['48 kg', '52 kg', '56 kg', '60 kg', '64 kg'].map((weight) => (
              <span key={weight} className={weight === '60 kg' ? 'is-active' : undefined}>
                {weight}
              </span>
            ))}
          </div>
          <div className="home-admin-table">
            {athletes.map(([name, club, status]) => (
              <div key={name}>
                <span className="home-admin-avatar">{name.split(' ').at(-1)?.[0]}</span>
                <span className="min-w-0">
                  <b>{name}</b>
                  <small>{club}</small>
                </span>
                <em className={status === 'Đã xếp' ? 'is-done' : undefined}>{status}</em>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BracketMockup() {
  return (
    <div
      className="home-window home-bracket-window"
      role="img"
      aria-label="Mockup nhánh đấu minh họa: hai trận bán kết dẫn đến chung kết, có nút tải PDF"
    >
      <WindowBar title="Nhánh đấu · Hạng cân 60 kg" />
      <div className="home-bracket-tools">
        <span>Đặc cách: Hạt giống</span>
        <span className="home-bracket-pdf">
          <Download size={12} /> Tải PDF
        </span>
      </div>
      <div className="home-bracket">
        <div className="home-bracket-round">
          <p>BÁN KẾT</p>
          <div>
            <span className="home-bracket-winner">
              Minh Anh <b>8</b>
            </span>
            <span>
              Quốc Huy <b>5</b>
            </span>
          </div>
          <div>
            <span>
              Gia Bảo <b>4</b>
            </span>
            <span className="home-bracket-winner">
              Hoàng Nam <b>6</b>
            </span>
          </div>
        </div>
        <div className="home-bracket-connector" aria-hidden="true" />
        <div className="home-bracket-round">
          <p>CHUNG KẾT</p>
          <div className="home-bracket-final">
            <span>
              Minh Anh <b>—</b>
            </span>
            <span>
              Hoàng Nam <b>—</b>
            </span>
          </div>
          <p className="home-bracket-next">Chờ thi đấu</p>
        </div>
      </div>
    </div>
  );
}

export function SupervisorMockup() {
  return (
    <div
      className="home-window home-supervisor"
      role="img"
      aria-label="Mockup màn hình giám sát: ba giám định đã kết nối, điểm hai bên, nút điểm cộng, lỗi và lịch sử Check VAR"
    >
      <WindowBar title="Giám sát · Trận M-0142" />
      <div className="home-supervisor-body">
        <div className="home-supervisor-judges">
          {['Giám định 1', 'Giám định 2', 'Giám định 3'].map((judge) => (
            <span key={judge}>
              <Wifi size={12} /> {judge}
            </span>
          ))}
        </div>
        <div className="home-supervisor-score">
          <span className="is-red">
            <small>ĐỎ</small>
            <b>08</b>
          </span>
          <span className="home-supervisor-clock">
            <small>HIỆP 2</small>
            <b>01:24</b>
            <em>
              <Pause size={11} /> Tạm dừng
            </em>
          </span>
          <span className="is-blue">
            <small>XANH</small>
            <b>06</b>
          </span>
        </div>
        <div className="home-supervisor-actions">
          <span className="is-red">+ Điểm cộng đỏ</span>
          <span className="is-blue">+ Điểm cộng xanh</span>
          <span>Lỗi nhẹ</span>
          <span>Lỗi nặng</span>
        </div>
        <div className="home-supervisor-var">
          <p>
            <History size={13} /> CHECK VAR
          </p>
          <ol>
            {[
              ['01:24', 'GĐ 1, 2, 3 chọn Đỏ', '+1 Đỏ'],
              ['01:36', 'Lỗi nhẹ góc đỏ', 'Lỗi'],
              ['02:00', 'Bắt đầu hiệp 2', 'Hiệp'],
            ].map(([time, text, tag]) => (
              <li key={time}>
                <span>{time}</span>
                {text}
                <em>{tag}</em>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
