# Quản lý phiên bản bảng giá

Chỉ tài khoản `SUPER_ADMIN` có thể mở `/super-admin/pricing` hoặc gọi hai API
`GET`/`PUT /super-admin/pricing`. API cũng kiểm tra vai trò, nên việc truy cập UI
không phải là cơ chế bảo vệ duy nhất.

Mỗi phiên bản có giá cơ bản (VND), thời hạn cơ bản (tháng), giới hạn giải cơ bản,
đơn giá thêm tháng, đơn giá thêm giải và các bậc giảm giá. Giá được hiển thị theo
`vi-VN`, nhưng API luôn nhận số nguyên VND. Các bậc chuẩn bắt buộc là 6 và 12 tháng;
3, 5 và 10 giải. Không được trùng loại/số lượng; số lượng phải dương và giảm giá từ
0 đến 10.000 basis points (0–100%).

Chọn tạo phiên bản sẽ sao chép phiên bản đang hoạt động vào biểu mẫu. Sau khi sửa,
người quản trị xem bản đối chiếu hiện tại/mới, rồi xác nhận kích hoạt. Hủy ở bước này
không gửi yêu cầu. Kích hoạt tạo một phiên bản mới và làm phiên bản cũ chỉ đọc trong
lịch sử. Thay đổi chỉ áp dụng cho báo giá và đơn hàng về sau; ảnh chụp giá của đơn
hàng lịch sử không đổi.
