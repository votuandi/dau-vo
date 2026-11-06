# Cấu hình hiệp đấu theo vòng

## Phạm vi và kế hoạch

Một vòng của nhánh đấu trong từng hạng cân có số hiệp chính và thời lượng mỗi
hiệp riêng. Ví dụ: vòng đầu 1 hiệp × 90 giây, bán kết 2 hiệp × 120 giây,
chung kết 3 hiệp × 180 giây. Thời lượng này tính cho mỗi hiệp, không phải tổng
thời gian của trận. Thời gian nghỉ tiếp tục dùng cấu hình hạng cân hiện có.

Triển khai theo thứ tự: thêm cấu hình và migration; chụp cấu hình vào trận khi
chuẩn bị; mở rộng vòng đời, chấm điểm và phúc khảo cho số hiệp linh hoạt; bổ sung
giao diện quản trị và kiểm thử API/realtime/UI.

## Sử dụng

Trong trang Trận đấu của giải, chọn hạng cân đã có nhánh đấu. Tại mục
**Số hiệp và thời lượng theo vòng**, nhập số hiệp mỗi trận và thời lượng mỗi hiệp
bằng giây rồi bấm **Lưu cấu hình** cho vòng tương ứng. Có thể chỉnh các vòng sau
trong lúc vòng trước đang thi đấu.

Mặc định: 2 hiệp, 120 giây mỗi hiệp. Số hiệp từ 1 đến 20; thời lượng từ 1 đến
3.600 giây. Giao diện nhập số giây nguyên; API lưu thời lượng bằng mili giây.

Vòng bị khóa khi có trận được chuẩn bị hoặc đã xác định người thắng. Mỗi trận
đã chuẩn bị giữ bản chụp cấu hình của vòng. API chỉnh sửa trận cũng không cho
thay đổi thời lượng của trận thuộc nhánh đấu.

## Dữ liệu và giao thức

- `BracketRoundStaffing` chứa thêm `regulationRoundCount`, `roundDurationMs`.
- `Match.regulationRoundCount` lưu số hiệp chính; `Match.roundDurationMs` lưu
  thời lượng được chụp khi chuẩn bị trận.
- `PATCH .../weight-classes/:weightClassId/bracket/staffing/:roundNumber` nhận
  cập nhật từng phần cho số giám định, số hiệp và thời lượng. Cập nhật luật
  thi đấu không phụ thuộc việc đã đăng ký đủ giám định hay chưa.
- Cập nhật cấu hình và chuẩn bị trận cùng khóa hàng giải đấu trước, giúp chúng
  không thể đồng thời ghi đè cấu hình của trận vừa được tạo.
- Để giữ tương thích giao thức, `ROUND_2_RUNNING` và `ROUND_2_PAUSED` biểu diễn
  các hiệp chính từ hiệp 2 trở đi. Số hiệp thực tế lấy từ `currentRound` và
  descriptor của hiệp. Giao diện hiển thị số hiệp thực tế.
- Sau mỗi hiệp chưa phải cuối, trận chuyển sang `BREAK`. Sau hiệp cuối, V2
  chuyển sang `REGULATION_APPEAL`; luồng cũ chuyển sang `AWAITING_RESULT_SAVE`.
  Phúc khảo cộng điểm của tất cả hiệp chính đã cấu hình. Hiệp phụ vẫn có
  descriptor và số lần riêng, dùng thời lượng hiệp của trận.

## Migration và xác minh

Migration `20261105110000_bracket_round_match_settings` thêm trường với mặc
định 2 hiệp cho dữ liệu hiện có, giữ thời lượng của từng trận cũ, và mở rộng
ràng buộc descriptor của hiệp chính. Không sửa migration đã phát hành.

Chạy migration trước khi khởi động API mới:

```sh
pnpm --filter @martial-arts-scoring/api run prisma:migrate:deploy
```

Kiểm thử gồm cấu hình độc lập theo vòng, dữ liệu không hợp lệ, kế thừa khi
chuẩn bị trận, khóa vòng, thi đấu 1/2/3 hiệp, tạm dừng/tiếp tục và đồng bộ hiệp 3,
chấm điểm/ghi lỗi hiệp 3, hủy/khôi phục hiệp 3, phúc khảo và công bố kết quả.
