# Chấm điểm theo hiệu lệnh trọng tài

## Phạm vi

Mỗi vòng của nhánh đấu trong từng hạng cân chọn một trong hai hình thức cho
điểm:

- **Giám định chấm điểm tự do trong 1.5 giây** (mặc định, `JUDGE_FREE_WINDOW`):
  lựa chọn đầu tiên của một giám định mở cửa sổ 1.5 giây, hết cửa sổ thì tính đa
  số. Giữ nguyên cách hoạt động trước đây.
- **Giám định chấm điểm theo hiệu lệnh trọng tài** (`REFEREE_COMMAND`): Giám sát
  mở và đóng mỗi lượt chấm theo hiệu lệnh "dừng" của trọng tài trên sàn.

Hình thức của vòng áp dụng cho mọi hiệp chính và hiệp phụ của các trận trong vòng.

## Sử dụng

Trong **Trận đấu → Cấu hình** của hạng cân, mỗi vòng có ô **Hình thức cho điểm**.
Chọn hình thức rồi bấm **Lưu cấu hình**. Cấu hình bị khóa cùng lúc với số hiệp và
thời lượng, tức là khi đã có trận trong vòng được chuẩn bị. Mỗi trận giữ bản chụp
hình thức cho điểm từ lúc chuẩn bị.

Ở chế độ theo hiệu lệnh:

1. Khi hiệp đang chạy, Giám sát thấy nút **TẠM DỪNG** và **CHẤM ĐIỂM**. Lúc này
   nút cho điểm của giám định bị vô hiệu.
2. Khi trọng tài ra hiệu dừng, Giám sát bấm **CHẤM ĐIỂM**: đồng hồ dừng và lượt
   chấm mở ra. Hai nút TẠM DỪNG và CHẤM ĐIỂM ẩn đi, chỉ còn **TIẾP TỤC**.
3. Giám định cho điểm không giới hạn thời gian và được đổi lựa chọn. Hệ thống
   tính lựa chọn cuối cùng của mỗi giám định.
4. Giám sát bấm **TIẾP TỤC**: lượt chấm đóng lại. VĐV đạt đa số phiếu trên số
   giám định yêu cầu (giống cách tính của chế độ 1.5 giây) được +1 điểm. Bảng
   điểm cập nhật ngay, đồng hồ chạy lại.

Nút TẠM DỪNG thường vẫn hoạt động như cũ; khi tạm dừng thường, giám định không
cho điểm được và nút CHẤM ĐIỂM không hiện.

Khi đang có lượt chấm mở, không thể chọn **Thoát và lưu trạng thái hiện tại**
(tạm hoãn hiệp phụ): Giám sát bấm TIẾP TỤC để chốt lượt trước. Lý do: tạm hoãn
giải phóng phân công giám định, nên phiếu của tổ cũ không được tính chung với tổ
nhận lại trận. Vẫn có thể chọn **Hủy kết quả**.

## Dữ liệu và giao thức

- Enum `scoring_method`; cột `BracketRoundStaffing.scoringMethod` và
  `Match.scoringMethod` có mặc định `JUDGE_FREE_WINDOW`.
- `ScoringWindow.endsAt` được phép null khi một lượt chấm theo hiệu lệnh đang mở,
  và được ghi bằng thời điểm đóng. Ràng buộc
  `scoring_windows_resolved_has_end_check` đảm bảo cửa sổ đã chốt luôn có `endsAt`.
- Lệnh realtime mới `scoring:start` (chỉ dành cho Giám sát) tạm dừng hiệp và mở
  lượt chấm trong cùng một transaction đã khóa trận, rồi phát `round:paused` và
  `scoring-window:opened` (`endsAt: null`).
- `round:resume` đóng lượt chấm đang mở trong cùng transaction tiếp tục hiệp, phát
  `scoring-window:resolved` và `score:updated` (nếu có điểm) trước `match:state`.
- Vote ở chế độ này phải gửi `scoringWindowId` của lượt chấm mà giám định đang
  thấy. Server so khớp ID dưới khóa trận, nên phiếu đến trễ (sau khi lượt đó đã
  đóng, kể cả khi một lượt mới đã mở) bị từ chối, không bị tính sang lượt sau.
- Vote ngoài lượt chấm, thiếu ID hoặc sai ID bị từ chối với mã
  `VOTE_SCORING_CLOSED`. Vote lặp lại trong lượt chấm cập nhật vote hiện có, không
  tạo vote mới.
- Hiệp bị vô hiệu (hủy kết quả giữa hiệp) giữ `endedAt = null`; việc nhận phiếu
  chỉ xét hiệp còn hiệu lực.
- Snapshot `match:state` có thêm `match.scoringMethod`;
  `activeScoringWindow.endsAt` là null khi lượt chấm đang mở.
- Audit: `ROUND_PAUSED` có `reason: 'REFEREE_SCORING'` và `scoringWindowId`;
  `ROUND_RESUMED` có `scoringWindowId` khi đóng lượt chấm; việc chốt điểm vẫn ghi
  `SCORE_ACTION / SCORING_WINDOW_RESOLVED` như cũ.

## Migration

Migration `20261118090000_referee_command_scoring` chỉ thêm, không sửa dữ liệu:
mọi vòng và trận hiện có nhận giá trị mặc định là chấm tự do 1.5 giây. Bỏ NOT NULL
của `scoring_windows.ends_at` không ảnh hưởng dữ liệu cũ, vì mọi hàng hiện có đều
đã có giá trị.

```sh
pnpm --filter @martial-arts-scoring/api run prisma:migrate:deploy
```
