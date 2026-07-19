# 🌳 Gia Phả Việt

Website tạo và quản lý cây gia phả, thiết kế theo phong cách truyền thống Á Đông.

## Tính năng

- **Bố cục cây gia phả chuẩn mực**: mỗi đời một hàng; chồng đặt sát bên trái vợ cả, vợ hai kế tiếp; các con xếp từ con cả đến con út, trái qua phải.
- **Hỗ trợ trường hợp đặc biệt**: một chồng nhiều vợ, một vợ nhiều chồng (thứ tự vợ/chồng sắp xếp tự do bằng nút ← →).
- **Thêm đời phía trên** khi cần bổ sung tổ tiên.
- **Chỉnh sửa từng người**: họ tên, giới tính, năm sinh/mất, ghi chú, ảnh đại diện import từ máy (tự nén về 256px).
- **Xuất file in ấn**: PNG độ phân giải cao và PDF, kèm khung viền + tiêu đề trang trọng.
- **Import / Export JSON** để sao lưu và chia sẻ.
- **Đăng ký / đăng nhập**: mỗi người dùng quản lý các gia phả riêng (JWT + bcrypt).
- **Chia sẻ công khai**: tạo link `/share/<token>` cho người không cần tài khoản — xem cây, xem thông tin từng người, tải PNG/PDF; có thể tắt link bất cứ lúc nào.
- **Chia sẻ quyền chỉnh sửa**: cấp quyền edit cho user khác theo tên đăng nhập; người được cấp thấy gia phả trong dashboard của họ (huy hiệu "Được chia sẻ bởi …") và chỉnh sửa được nội dung, nhưng không xóa / không quản lý chia sẻ được (chỉ chủ sở hữu).
- **Dữ liệu mẫu**: tài khoản mới được tặng 2 gia phả mẫu (họ Nguyễn — 1 chồng 2 vợ, họ Trần — 1 vợ 2 chồng).

Tài khoản dùng thử: `demo` / `demo123`

## Công nghệ

- **Backend**: Node.js (≥ 23) + Express + SQLite (module `node:sqlite` có sẵn, không cần cài native module)
- **Frontend**: React 18 + Vite, cây vẽ bằng SVG với engine layout tự viết
- **Xuất file**: canvas → PNG, jsPDF → PDF

## Chạy dự án

Yêu cầu Node.js ≥ 23 (dùng `node:sqlite`).

```bash
npm install
npm run dev        # chạy đồng thời API (cổng 3001) + Vite dev server (cổng 5173)
```

Mở http://localhost:5173

### Build production

```bash
npm run build      # build frontend vào dist/
npm start          # Express phục vụ cả API lẫn frontend tại cổng 3001
```

## Cấu trúc dữ liệu gia phả (JSON)

```jsonc
{
  "version": 1,
  "persons": { "p1": { "id": "p1", "name": "…", "gender": "male", "birth": "1900", "death": "", "note": "", "avatar": null } },
  "unions": {
    // partners: thứ tự hiển thị trái -> phải (chồng trước vợ cả, rồi vợ hai…)
    // children: con cả -> con út
    "u1": { "id": "u1", "partners": ["p1", "p2"], "children": ["p3"] }
  },
  "rootId": "u1"
}
```

Dữ liệu người dùng lưu tại `server/data/familytree.db` (SQLite).

## Triển khai bằng Docker trên Ubuntu

Yêu cầu Docker Engine và Docker Compose plugin. Tại thư mục dự án:

```bash
cp .env.example .env
# Khuyến nghị: điền JWT_SECRET bằng kết quả của `openssl rand -hex 32`
docker compose up -d --build
docker compose ps
```

Mở `http://IP_MAY_CHU`. Nginx lắng nghe cổng 80 và reverse proxy đến ứng dụng
Express ở cổng 3001 trong Docker network; cổng ứng dụng không được public trực
tiếp. Có thể đổi cổng public bằng `HTTP_PORT` trong `.env`, ví dụ
`HTTP_PORT=8080`. Nếu Ubuntu đang bật UFW, cho phép cổng tương ứng:

```bash
sudo ufw allow 80/tcp
```

SQLite và JWT secret được giữ trong named volume `family_tree_data`, nên không
mất khi container được tạo lại. Sao lưu dữ liệu:

```bash
docker compose exec family-tree sh -c \
  'tar -czf /tmp/family-tree-data.tar.gz -C /app/server/data .'
docker compose cp family-tree:/tmp/family-tree-data.tar.gz ./family-tree-data.tar.gz
```

Xem log, cập nhật và dừng dịch vụ:

```bash
docker compose logs -f nginx family-tree
docker compose up -d --build
docker compose down
```

Không dùng `docker compose down -v` nếu chưa sao lưu, vì tùy chọn `-v` sẽ xóa
volume chứa toàn bộ database.
