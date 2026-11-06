# Bàn giao phiên 2026-11-06

Nhánh: `feat/ready-match-flow-and-c2pa-uploads`. Nhánh đích PR: `develop`.
Chưa merge và chưa deploy production.

## Các thay đổi đã thực hiện

- Bỏ nút **Chuẩn bị trận** và mutation tương ứng trên trang quản lý trận.
- Thay lifecycle `NOT_STARTED` bằng `READY`. Lifecycle còn bốn giá trị:
  `READY`, `IN_PROGRESS`, `SUSPENDED`, `COMPLETED`; trạng thái hiển thị có thêm
  `NOT_READY` cho ô nhánh đấu chưa đủ hai VĐV. Các pha hiệp đấu vẫn độc lập.
- Mọi fixture thuộc nhánh đấu đang hoạt động, đủ hai VĐV, chưa có bản ghi
  điều hành đều xuất hiện trong danh sách chọn của Giám sát. Danh sách tự
  cập nhật mỗi 5 giây. Việc xem danh sách không tạo bản ghi trận.
- Khi Giám sát xác nhận nhận trận cùng đủ giám định, hệ thống tạo trận,
  chốt cấu hình số hiệp/thời lượng/số giám định, phân công đội ngũ và đổi
  lifecycle sang `IN_PROGRESS` trong cùng một transaction. Có kiểm tra tranh
  chấp, giám định bận, cấu hình thay đổi và retry cùng đội ngũ.
- Sau khi nhận trận, phase vẫn là `WAITING`; đồng hồ chỉ chạy khi bắt đầu
  hiệp 1. Thoát và hủy toàn bộ kết quả trả trận về `READY`, giải phóng đội
  ngũ. Đặt lại điểm nhưng giữ đội ngũ đang điều hành giữ `IN_PROGRESS`.
- Thống kê dashboard tính cả fixture `READY` chưa tạo trận, không đếm trùng
  trận đã có bản ghi điều hành. Cập nhật nhãn và tài liệu trạng thái.
- Sửa thứ tự giải phóng phân công khi admin chỉ định người thắng: giải phóng
  giám định trước Giám sát, tránh vi phạm trigger kiểm tra người phân công.
- Sửa ảnh PNG có metadata C2PA chứa SVG icon bị từ chối nhầm với
  `IMAGE_INVALID_CONTENT`. Bỏ qua chunk metadata `caBX` trong phép quét, sau
  đó giải mã và chuyển sang WebP để loại metadata; vẫn từ chối markup chèn
  ngoài ảnh. Đã kiểm tra đúng tệp `Confident Martial Artist Headshot-3_s.png`:
  480 × 480, 298690 byte, xử lý thành WebP 13850 byte thành công.
- Giữ nguyên nguyên nhân lỗi upload trong `Error.cause` và hiển thị thông
  báo tải ảnh cụ thể; retry không tạo trùng VĐV.

Endpoint admin `prepare-match` cũ vẫn còn để tương thích; giao diện không
còn sử dụng và Giám sát không phụ thuộc endpoint này. `MATCH_PREPARED` còn
là trạng thái fixture nội bộ để đánh dấu đã có bản ghi điều hành, không phải
một bước người dùng cần thực hiện.

## Migration

`apps/api/prisma/migrations/20261106140000_ready_match_lifecycle/migration.sql`:

- Đổi tên enum PostgreSQL `NOT_STARTED` thành `READY`, giữ dữ liệu cũ.
- Trận đã có phân công Giám sát đang hoạt động được đổi sang `IN_PROGRESS`.

Migration đã áp dụng thành công lên PostgreSQL local trong phiên này.
Khi bật Docker lại, vẫn chạy migration deploy để kiểm tra/áp dụng trên đúng
database; thao tác này không áp dụng lại migration đã hoàn tất.

## Kết quả kiểm tra

- Toàn bộ frontend: **49 test files, 349 tests đạt**.
- Sau những chỉnh sửa cuối về polling/câu chữ: **12 test files, 132 tests
  frontend liên quan đạt**.
- API không dùng database: **35 test suites, 276 tests đạt**. Lệnh đã chạy:

  ```powershell
  pnpm.cmd --filter @martial-arts-scoring/api exec jest --runInBand --testPathIgnorePatterns e2e.spec.ts integration.spec.ts database-constraints.spec.ts
  ```

- Lint toàn workspace, kiểm tra TypeScript API/web, build API và build web đạt.
- **Chưa có kết quả tích hợp xanh toàn bộ cho bản cuối**. Docker Desktop đã
  ngừng chạy trong lúc kiểm thử khiến PostgreSQL/Redis mất kết nối. Người dùng
  yêu cầu tạm thời không dùng Docker nên không chạy tiếp phần tích hợp.
- Trước khi mất kết nối, kiểm thử đã xác nhận danh sách READY, rollback khi
  thiếu giám định, hai Giám sát tranh một trận, lifecycle sau nhận trận và
  retry không tạo trận trùng. Kiểm thử chuyển người thắng sang vòng sau phát
  hiện lỗi thứ tự giải phóng đội ngũ nói trên; lỗi đã sửa và assertion HTTP
  đã chỉnh sang `201`, cần chạy lại kịch bản cuối này.

Log local không commit: `.logs/ready-unit-tests.log`,
`.logs/ready-integration.log`, `.logs/ready-regressions.log`.

## Tiếp tục sau khi bật Docker

Chạy từ thư mục gốc repository:

```powershell
git switch feat/ready-match-flow-and-c2pa-uploads
pnpm.cmd install --frozen-lockfile
pnpm.cmd docker:up
pnpm.cmd --filter @martial-arts-scoring/api prisma:migrate:deploy
pnpm.cmd --filter @martial-arts-scoring/api prisma:generate
pnpm.cmd test
pnpm.cmd dev
```

Nếu cần kiểm tra tích hợp có trọng tâm trước khi chạy toàn bộ test:

```powershell
pnpm.cmd --filter @martial-arts-scoring/api exec jest --runInBand src/brackets/bracket.e2e.spec.ts src/realtime/match-lifecycle.e2e.spec.ts src/admin-management/admin-management.e2e.spec.ts
```

Kiểm tra thủ công: xác nhận nhánh đấu → không có nút Chuẩn bị trận → Giám sát
thấy các trận đủ hai VĐV ở trạng thái Sẵn sàng → chọn trận và đủ giám định →
Nhận trận → trạng thái Đang diễn ra → bắt đầu hiệp 1 để chạy đồng hồ.
Sau khi hoàn tất hai trận trước, trận vòng sau phải tự xuất hiện khi đủ hai VĐV.
Kiểm tra thêm thoát/hủy kết quả, hoãn/nhận lại trận và tải lại ảnh C2PA.

Yêu cầu cho phiên tiếp theo: đọc tài liệu này và PR của nhánh, khôi phục dịch vụ
local, chạy lại các kiểm thử tích hợp còn thiếu, xử lý lỗi nếu còn rồi cập nhật
kết quả vào PR. Không tự merge hoặc deploy khi chưa có yêu cầu.
