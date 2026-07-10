# Stitch Fidelity Contract

Tài liệu này là rule bắt buộc khi implement một Haravan theme từ Stitch design. Mục đích: chặn agent tự chế ra layout/section/copy/màu khác với Stitch.

## 1. Quy tắc gốc

**Stitch là source of truth duy nhất cho visual và structure.**

Khi user đã duyệt Stitch design, agent phải implement đúng những gì Stitch render. Không được tự sáng tạo, không được tự bỏ section, không được tự thêm section "cho đẹp".

## 2. Bắt buộc bưng nguyên

Implement phải khớp 1-1 với Stitch ở các mặt sau:

- **Section list và thứ tự**: Stitch có bao nhiêu section, thứ tự nào, agent giữ y nguyên.
- **Layout grid trong từng section**: số column, chiều rộng tương đối, vị trí asset/text.
- **Copy text**: heading, paragraph, button label, badge, label form. Lấy đúng chữ Stitch (sau khi Việt hóa nếu Stitch tiếng Anh).
- **Color role**: primary, surface, text, muted, border, sale, success — map đúng giá trị Stitch.
- **Typography role**: heading scale, body size, weight, line-height — map đúng tỉ lệ Stitch.
- **Spacing rhythm**: padding section, gap grid, margin element — giữ tỉ lệ Stitch (có thể quy đổi token nhưng phải cùng tỉ lệ).
- **Component pattern**: card style (border, radius, shadow, hover), button style (size, fill, hover), input style, badge style.
- **Icon style**: line vs solid, weight, size box.
- **Image ratio**: hero 16:9, card 1:1, banner 21:9 — giữ đúng, không đổi.
- **Empty state / sold-out / sale state**: nếu Stitch có, phải implement. Nếu Stitch không có, phải hỏi user (không tự thiết kế).

## 3. Allowed deviation (hẹp, có lý do)

Chỉ được lệch Stitch khi rơi vào một trong các case sau, và phải ghi vào ledger:

| Case | Lý do | Cách xử lý |
|---|---|---|
| **Theme đích đã có pattern tốt hơn cho cùng intent** | Reuse helper/snippet/JS lifecycle có sẵn để tránh phình code | Giữ visual Stitch, dùng pattern theme; ghi `deviation: <X>, reason: theme-native pattern` |
| **Haravan giới hạn data/API** | Section Stitch dùng data Haravan không cung cấp | Map sang data gần nhất; nếu không có, hỏi user trước khi đổi |
| **Accessibility critical** | Stitch vi phạm contrast/tap target/keyboard nav | Sửa tối thiểu để đạt rule; ghi `deviation: a11y-fix` |
| **Mobile responsive critical** | Stitch chỉ có desktop hoặc layout vỡ ở mobile | Adapt layout mobile; giữ desktop đúng Stitch |
| **Performance critical** | Stitch có animation/effect làm vỡ Core Web Vitals | Giảm tối thiểu; ghi `deviation: perf-fix` |

**Không được lệch vì các lý do sau**:

- "Tôi nghĩ thêm section X sẽ đẹp hơn"
- "Section Y trong Stitch không đủ đặc biệt, đổi thành Z"
- "Copy Stitch hơi dài, viết lại ngắn hơn" (trừ khi user yêu cầu Việt hóa hoặc rút gọn)
- "Layout này hơi cũ, dùng layout hiện đại hơn"
- "Tôi thấy theme đích thiếu module X, thêm vào"
- "Color này hơi nhạt, đậm hơn cho nổi"
- "Card có border-radius 8px nhưng tôi để 12px cho mềm"

## 4. Khi Stitch thiếu thông tin

Stitch thường thiếu:

- Empty/error state cho form, cart, search, collection.
- Loading state cho slider, async fetch.
- Hover/active/focus state cho button, link, card.
- Long-content edge case (tên product 60 ký tự, paragraph 20 dòng).
- Sold-out, low-stock, sale badge logic.
- Mobile menu chi tiết nếu Stitch chỉ có desktop nav.

**Cách xử lý**:

1. Liệt kê item thiếu vào ledger với label `stitch-gap`.
2. Ưu tiên reuse pattern theme đích đang có cho các state này.
3. Nếu theme đích cũng không có, hỏi user 1 câu gộp: "Stitch không có state X, Y, Z — dùng pattern Haravan default hay user muốn design thêm?"
4. Không tự design empty/error state phức tạp khi chưa hỏi.

## 5. Quy trình implement

Trước khi viết Liquid:

1. **Stitch inventory**: list từng section Stitch, đánh số, ghi tên ngắn (`hero`, `featured-collections`, `bestseller-grid`, ...). Ghi vào ledger.
2. **Mapping table**: với mỗi section Stitch, map sang section/snippet Liquid sẽ tạo. Ghi rõ Stitch section X → `sections/x.liquid` + `snippets/x-card.liquid`.
3. **Token map**: extract color/font/spacing từ Stitch CSS, đề xuất token name. Đặt vào `:root` của theme. Không nhồi hex/font-family vào component.
4. **Asset map**: list từng image slot Stitch, ghi ratio/kích thước/nguồn (existing | demo-image-assets | iconify | brand-provided).
5. **Deviation log**: nếu cần lệch, ghi `[deviation] section: X, change: Y, reason: Z` vào ledger trước khi code.

## 5A. Stitch fidelity manifest/checklist artifact

Ngoài ledger thủ công, phase đầu phải có artifact additive để khóa ý nghĩa của “100% layout” trước khi merge vào Haravan.

Artifact tối thiểu:

- `scratch/stitch/<screen>/stitch-fidelity.json` từ `stitch_consume.js`
- `scratch/tokens/<screen>/stitch-fidelity-token-map.json` từ `design_token_extract.js`

Field tối thiểu phải có:

- `sections`
- `assetSlots`
- `tokens`
- `copyBlocks`
- `allowedDeviations`
- `mergeStatus`

Quy tắc dùng artifact:

1. Artifact này **không thay thế** review Stitch bằng mắt.
2. Mọi section trong artifact phải map được sang section/snippet Liquid hoặc được ghi là gap/deviation hợp lệ.
3. Mọi asset slot trong artifact phải xuất hiện trong asset plan hoặc được đánh dấu là intentionally omitted với lý do hợp lệ.
4. Mọi deviation vẫn phải ghi vào ledger để có approval trail.
5. Nếu artifact và thực tế implement lệch nhau mà không có log, coi là regression fidelity.

Trong khi viết Liquid:

- Mở Stitch screen song song. Mỗi section implement xong, so sánh thị giác với Stitch trước khi qua section khác.
- Nếu phát hiện nhánh không khớp, dừng → hỏi user thay vì cải tạo.

Sau khi implement xong:

- Chạy `visual_diff.js` (nếu có baseline) hoặc capture screenshot từng section, đối chiếu với Stitch screen.
- Bất kỳ delta lớn nào không có trong deviation log → coi là regression, fix về đúng Stitch.

## 6. Anti-patterns chống chế

| Anti-pattern | Triệu chứng |
|---|---|
| **Section augmentation** | Thêm "trust row", "newsletter", "footer cta", ... mà Stitch không có |
| **Section dropping** | Bỏ một section Stitch vì "nhìn không thiết yếu" |
| **Copy rewriting** | Đổi heading/CTA Stitch sang câu khác mà không có yêu cầu Việt hóa |
| **Color drift** | Đổi primary từ `#A47C5F` sang `#8B6E4F` cho "đậm hơn" |
| **Type drift** | Stitch dùng heading 32/48px, agent đặt 28/40px cho "cân đối" |
| **Layout reflow** | Stitch 3-col grid, agent đổi 2-col |
| **Component substitution** | Stitch card có shadow + border, agent dùng card flat của theme cũ |
| **Asset substitution** | Stitch ratio 4:3, agent đặt 16:9 vì "ảnh sẵn có 16:9" |
| **Gratuitous animation** | Thêm parallax/fade in/scroll reveal mà Stitch không có |
| **Icon family swap** | Stitch dùng line icon, agent dùng solid icon vì theme cũ có solid |

## 7. Acceptance gate cuối

Trước khi đóng task, phải pass tất cả:

- [ ] Section list khớp Stitch (số lượng, thứ tự, tên).
- [ ] `stitch-fidelity.json` và `stitch-fidelity-token-map.json` tồn tại, phản ánh đúng section/asset/token/copy status hiện tại.
- [ ] Mỗi section có screenshot side-by-side với Stitch hoặc % visual match >= 92% nếu chạy `visual_diff.js`.
- [ ] Tất cả deviation đã ghi vào ledger với lý do hợp lệ.
- [ ] Color/font/spacing map qua token, không hex/family lạc.
- [ ] Empty/sold-out/sale/loading state đã trao đổi với user (giữ default hoặc design rõ).

Không có gate nào pass theo cảm tính. Phải có evidence.
