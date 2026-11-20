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

## Giám sát chấm điểm như một giám định (TT)

Ở vòng dùng hình thức "theo hiệu lệnh", tab **Cấu hình** có công tắc **Ghi nhận
điểm từ trọng tài/giám sát** (mặc định tắt). Công tắc chỉ bật được với hình thức
này; đổi về chấm tự do 1.5 giây thì tự tắt. Giá trị được chụp vào trận khi chuẩn
bị và khóa cùng các cấu hình khác của vòng.

Khi bật:

1. Trong lượt chấm (sau khi bấm **CHẤM ĐIỂM**), Giám sát chạm vào ô tên VĐV trên
   console để chọn. Được đổi lựa chọn cho đến khi bấm **TIẾP TỤC**.
2. Phiếu của Giám sát được tính như thêm 1 giám định: cần đa số trên (số giám
   định + 1). Ví dụ 3 giám định + TT cần 3 phiếu cùng bên; 2–2 thì không cộng điểm.
3. Bảng điểm thêm ô **TT** sau các ô GĐ; lịch sử chấm điểm (Giám sát và Admin)
   ghi phiếu là **TT (Giám sát)**. Giám định không thấy lựa chọn của Giám sát
   trước khi lượt chấm được chốt.

## Điều kiện tính điểm khi số người chấm là số chẵn

Số người chấm = số giám định, cộng 1 nếu Giám sát chấm như TT. Khi số này là số
chẵn, thẻ của vòng hiện thêm dropdown **Điều kiện tính điểm** kèm một thông báo:

- **Lớn hơn một nửa** (mặc định, đúng cách tính trước đây): VĐV cần nhiều hơn
  một nửa số người chấm. Ví dụ 4 người chấm cần 3 phiếu.
- **Lớn hơn hoặc bằng một nửa**: VĐV cần ít nhất một nửa số người chấm và nhiều
  phiếu hơn VĐV còn lại. Ví dụ 4 người chấm: 2 Đỏ – 1 Xanh thì Đỏ +1; 2 – 2 thì
  không cộng điểm.

"Một nửa" luôn tính trên tổng số người chấm, kể cả người không bấm. Khi số người
chấm là số lẻ, hai cách cho cùng kết quả nên dropdown được ẩn. Cách tính áp dụng
cho cả hai hình thức cho điểm và được chụp vào trận khi chuẩn bị.

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

- Lệnh realtime `vote:supervisor-submit` (chỉ dành cho Giám sát) nhận
  `{ athlete, scoringWindowId }`. Phiếu bị từ chối với `VOTE_FORBIDDEN` nếu trận
  không bật tính năng, và `VOTE_SCORING_CLOSED` nếu lượt chấm đã đóng hoặc sai ID.
- Snapshot `match:state` có `match.supervisorScoringEnabled`; snapshot riêng của
  Giám sát có `viewer.supervisorVote`. Bảng điểm công khai có
  `judgeVotes.supervisorVoting` và `lastResolvedWindow.supervisorVote`.
- `judge_votes.cast_by_supervisor` đánh dấu phiếu TT (không có vị trí giám định).
  Ràng buộc DB: tối đa 1 phiếu TT mỗi lượt chấm, và phiếu TT chỉ đến từ phân công
  hoặc phiên Giám sát của chính trận đó.

## Migration

Migration `20261118090000_referee_command_scoring` chỉ thêm, không sửa dữ liệu:
mọi vòng và trận hiện có nhận giá trị mặc định là chấm tự do 1.5 giây. Bỏ NOT NULL
của `scoring_windows.ends_at` không ảnh hưởng dữ liệu cũ, vì mọi hàng hiện có đều
đã có giá trị.

```sh
pnpm --filter @martial-arts-scoring/api run prisma:migrate:deploy
```

Migration `20261120090000_supervisor_scoring_votes` cũng chỉ thêm: cột
`supervisor_scoring_enabled` (mặc định `false`) cho vòng và trận, cột
`cast_by_supervisor` (mặc định `false`) cho phiếu, kèm các ràng buộc ở trên. Dữ
liệu hiện có giữ nguyên hành vi cũ.

Migration `20261121090000_scoring_threshold` thêm enum `scoring_threshold` và cột
cùng tên (mặc định `MORE_THAN_HALF`) cho vòng và trận; dữ liệu hiện có giữ cách
tính cũ.
