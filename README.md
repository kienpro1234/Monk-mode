# ⛰️ LÊN NÚI (ASCEND THE MOUNTAIN) — Shanshui Zen Desktop App

**Hệ thống Kỷ Luật Cực Đoan & Phong Tỏa Tâm Trí (Monk Mode)** dành cho Windows Desktop, thiết kế theo mỹ học **Tranh Thủy Mặc Thiền Tông (Shanshui Zen)** kết hợp **Sách Cổ Khâu Chỉ & Dấu Mộc Đỏ Chu Sa**.

---

## ✨ Tính năng Cốt lõi (Mô hình 4-Trong-1 & Tàng Kinh Các)

1. **⛰️ Mô-đun 1 — Đỉnh Núi (`The Peak` / Goal Tracker)**
   - Mỗi kỳ tu luyện chỉ tập trung chinh phục **1 Đỉnh Núi duy nhất** kèm chỉ số định lượng (`KPI/OKR`) và thời hạn dự kiến xuống núi.
   - Mọi Nghi Thức (Habit) và Công Phá (Todo) đều gắn kết trực tiếp với Đỉnh Núi này.
2. **🔥 Mô-đun 2 — Nghi Thức (`Rituals` / Habit Tracker)**
   - Các kỷ luật lặp lại hàng ngày theo khung giờ cố định (ví dụ: `05:00 – 06:30`, `21:00 – 22:00`).
   - Bỏ lỡ khung giờ quy định khi đang bật Monk Mode sẽ bị tính là **Vi phạm Luật Núi** (Reset chuỗi `Streak = 0` và cộng phạt thêm ngày tu luyện).
3. **⚔️ Mô-đun 3 — Công Phá (`Daily Strikes` / Todo List)**
   - Danh sách các nhiệm vụ tác chiến cụ thể cần giải quyết dứt điểm trong ngày để đẩy thanh tiến độ của Đỉnh Núi tiến về mốc `100%`.
4. **📜 Mô-đun 4 — Tự Vấn (`Reflection` / Daily Journal)**
   - Nghi thức nghiệm thu và sám hối cuối ngày (mở từ `20:00` đến `23:59` khi bật Monk Mode).
5. **📕 Mô-đun 5 — Tàng Kinh Các (`Sacred Archive` / Bí Kíp Tu Luyện)**
   - Khi hoàn thành `100%` khóa tu luyện và xuống núi, toàn bộ nhật trình được đóng quyển thành một cuốn **Bí Kíp cổ thư khâu chỉ** trên nền giấy tuyên chỉ (`#F6F4EE`) kèm **Dấu Mộc Đỏ Chu Sa (`#9E2A2B`)**, hỗ trợ đọc lật trang ngang và in/xuất PDF.

---

## 🛡️ Cơ chế Kiểm duyệt Bằng chứng Xác thực (Proof of Work - PoW)

| Hạng mục kiểm tra | Khi Monk Mode: OFF | Khi Monk Mode: ON (Bắt buộc Proof of Work) |
| :--- | :--- | :--- |
| **Thực hiện Todo / Habit** | Tự giác tích chọn (Checkbox thông thường). | **Khóa Pomodoro (Focus Timer Lock)**: Phải bật đồng hồ đếm ngược Pomodoro trong app. Rời cửa sổ quá `30 giây` sẽ hủy phiên. |
| **Nghiệm thu Kết quả** | Không yêu cầu hình ảnh minh chứng. | **Chụp ảnh Trực tiếp (Live Camera / Screen Evidence)**: Chặn tải ảnh cũ từ ổ cứng; kiểm tra độ sáng, độ nét (Laplacian) & Entropy bằng thuật toán OpenCV/Bitmap để chống chụp ảnh đen hoặc che ống kính. |
| **Nhật ký Tự Vấn (Daily Journal)** | Viết tự do, không giới hạn độ dài tối thiểu. | **Kiểm duyệt Tối thiểu 100 Từ Hợp lệ**: Chặn hoàn toàn Copy/Paste (`Ctrl+V` / chuột phải) và kiểm tra mật độ từ vựng (`Lexical Diversity >= 0.45`) để chặn gõ ký tự rác lặp lại. |

---

## 🚀 Hướng dẫn Chạy App Ngay Lập Tức (Trên Windows)

Dự án đã được đóng gói sẵn bản build trong thư mục `dist/`, vì vậy người dùng tải về có thể mở chạy ngay:

### Cách 1: Chạy trực tiếp không cần cài đặt gì thêm (Nhanh nhất)
- Nhấp đúp vào file **`Mo-Ngay-App-Khong-Can-Server.bat`**.
- Cửa sổ Desktop App sẽ mở lên ngay lập tức (dữ liệu lưu tự động trong máy).

### Cách 2: Chạy đầy đủ tính năng Hệ điều hành Windows (Đổi hình nền Desktop, Quét tiến trình Whitelist)
- Yêu cầu máy đã cài [Node.js](https://nodejs.org/).
- Nhấp đúp vào file **`Chay-App-Len-Nui.bat`** (hoặc chạy **`Mo-App-Khong-Can-CMD.vbs`** nếu muốn mở ngầm không hiện cửa sổ dòng lệnh).

---

## 🛠️ Dành cho Lập trình viên (Chỉnh sửa mã nguồn & Build lại)

```bash
# 1. Cài đặt thư viện (nếu cần)
npm install

# 2. Đóng gói lại mã nguồn từ thư mục src/ ra dist/
node scripts/build.mjs

# 3. Khởi chạy Desktop Server + Cửa sổ App
node scripts/desktop-server.mjs
```

> **Phím tắt Cứu hộ Khẩn cấp (Developer Emergency Override)**: Bấm tổ hợp `Ctrl + Shift + Alt + M` (hoặc nút trên thanh công cụ Mô phỏng ở đáy màn hình) để cưỡng bức mở khóa và khôi phục hình nền Windows gốc khi đang test.
