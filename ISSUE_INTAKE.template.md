# Issue Intake

Điền nhanh trước khi chạy goal dài. Nếu prompt đã có câu trả lời thì không cần hỏi lại.

## 1. Issue Source

- Nguồn chính:
  - [ ] Stitch export/design
  - [ ] User issue list / checklist
  - [ ] Screenshot / video feedback
  - [ ] Preview / live storefront để agent tự inspect
  - [ ] Audit / QA / Lighthouse report
  - [ ] Ticket / comment từ khách hoặc team
  - [ ] Tự audit toàn theme
- Source of truth khi mâu thuẫn:
- Agent được tự phát hiện thêm issue ngoài danh sách:
  - [ ] Có, tự fix cùng scope nếu an toàn
  - [ ] Có, nhưng chỉ report trước khi sửa
  - [ ] Không, chỉ làm đúng issue được giao

## 2. Scope

- Scope:
  - [ ] Home
  - [ ] Header / footer / global
  - [ ] Collection / search
  - [ ] Product
  - [ ] Blog / article / page
  - [ ] Cart / account / other
  - [ ] Full theme
- Không được đụng:
- Mức redesign:
  - [ ] Restyle nhẹ
  - [ ] Giữ cấu trúc, đổi visual mạnh
  - [ ] Redesign theo Stitch / design mới
  - [ ] Rebuild mới 100% theo approved design, không chồng lên layout cũ

## 3. Permissions

- Được sửa `config/settings_data.json`:
  - [ ] Có
  - [ ] Không
- Được xóa asset/snippet/settings cũ:
  - [ ] Có
  - [ ] Không
  - [ ] Chỉ report danh sách trước
- Được xóa CSS/JS block cũ đã orphan sau khi verify:
  - [ ] Có
  - [ ] Không
  - [ ] Chỉ report danh sách trước
- Được gọi API/admin sửa data:
  - [ ] Có
  - [ ] Không
- Được push/sync theme:
  - [ ] Có
  - [ ] Không

## 4. Asset

- Nguồn asset:
  - [ ] User cung cấp
  - [ ] Reuse asset theme
  - [ ] Generate BFL / Magnific / Freepik
  - [ ] Stock free
- Cần asset không chữ:
  - [ ] Có
  - [ ] Không
- Slot / size quan trọng:
- Asset còn thiếu / blocker:

## 5. Design / Content Rules

- Design source width:
  - [ ] 1280 design nhưng storefront target dùng `page-width` / container setting
  - [ ] 1920 max width theo yêu cầu user
  - [ ] Khác:
- Container rule:
  - [ ] Không hardcode `max-width: 1280px`
  - [ ] Dùng token / container hiện có của theme
- Implementation rule:
  - [ ] Rebuild module mới theo design 100%, không patch nửa vời lên layout cũ
  - [ ] Dùng class/biến global như `page-width`, design token, helper/snippet có sẵn
  - [ ] Xóa CSS/JS/comment cũ không dùng sau khi xác minh orphan
  - [ ] Kiểm tra CSS source order/cascade/specificity trước khi dùng `!important` hoặc selector nested sâu
- Visual quality gate:
  - [ ] Contrast đủ đọc
  - [ ] Spacing/font-size/line-height đồng bộ desktop/mobile
  - [ ] Không còn default/fallback/demo content trong Liquid
- Content language:
  - [ ] Việt hóa toàn bộ storefront / admin copy
  - [ ] Không để English demo / placeholder
- Dynamic content boundary:
  - [ ] Campaign / brand / demo copy / link / ảnh -> settings / data phù hợp
  - [ ] Product / article / collection / page content -> object / data thật
  - [ ] System / action labels có thể hardcode tiếng Việt
  - [ ] Không tạo fallback / default demo content trong Liquid
- Generated code compliance:
  - [ ] Chuyển code từ Stitch / AI về Liquid / CSS / JS theme-native
  - [ ] Strip property CSS dư, normalize icon/media size, bỏ framework/reset lạ
- Final screenshot:
  - [ ] Scroll / lazy-load / popup đã xử lý trước khi chụp
  - [ ] Ảnh output đã được xem lại trước handoff

## 6. Preview / QA

- Preview URL:
- Final showcase path:
  - [ ] Home `/`
  - [ ] Path khác:
- Final artifacts user yêu cầu:
  - [ ] Gom tất cả artifact vào root `final-showcase/`
  - [ ] Desktop screenshot `876x2000`
  - [ ] Mobile screenshot `276x480`
  - [ ] Theme description HTML fragment
  - [ ] Theme export zip
- Viewport cần test:
  - [ ] 320
  - [ ] 375
  - [ ] 768
  - [ ] 1024
  - [ ] 1440
- Flow cần test:
  - [ ] Menu
  - [ ] Search
  - [ ] Filter / sort
  - [ ] Product variant
  - [ ] Add cart
  - [ ] Cart
  - [ ] Form
  - [ ] Slider

## 7. Tradeoff

Nếu phải chọn, ưu tiên:

- [ ] Giống design nhất
- [ ] Ít rủi ro logic nhất
- [ ] Admin chỉnh được nhiều nhất
- [ ] Load nhanh nhất
- [ ] Xong nhanh nhất

## 8. Agent Understanding

- Tôi hiểu task là:
- Tôi sẽ bắt đầu bằng:
- Cần hỏi thêm trước khi chạy:
- Final được phép khi:
- Nếu chưa final-ready, checkpoint tiếp theo là:
