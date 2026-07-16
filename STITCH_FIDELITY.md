# Stitch Fidelity Contract

Tài liệu này là rule bắt buộc khi implement một Haravan theme từ Stitch design. Mục đích: chặn agent tự chế ra layout/section/copy/màu khác với Stitch.

## 1. Quy tắc gốc

**Stitch là source of truth duy nhất cho visual và structure.**

Khi user đã duyệt Stitch design, agent phải implement đúng những gì Stitch render. Không được tự sáng tạo, không được tự bỏ section, không được tự thêm section "cho đẹp".

## 1A. Template-first conversion — doctrine (KHÔNG phải restyle, KHÔNG phải CSS overlay)

Phạm vi công việc là **TEMPLATE CONVERSION toàn phần**: mọi template trong scope được dựng MARKUP MỚI theo Stitch design, thể hiện theme-native. Đây KHÔNG phải restyle và KHÔNG phải phủ CSS lên markup cũ:

- Markup cũ không thể hiện được layout Stitch → markup cũ PHẢI ĐI. Không giữ DOM legacy rồi vá style lên trên — đó chính là lỗi "phủ CSS lên layout cũ".
- **Không fallback legacy-layout**: không conditional quay về design cũ, không giữ toggle `*_enable` bảo tồn layout cũ, không dual render path, không section "để dành". Làm mới hoàn toàn — code bị thay là code bị XÓA (orphan sweep xác nhận).
- Ranh giới: **FEATURE/behavior của theme cũ được BẢO TỒN** (AJAX cart, variant picker, slider, lazy-load, mega menu, search suggest, countdown, popup, tracking hook... — bưng hook sang markup mới); chỉ có ĐƯỜNG LUI LAYOUT cũ là không được giữ.
- Reuse đúng chỗ: **reuse infrastructure** (bộ file asset per-template, token, JS lib/lifecycle, helper, settings mechanism) — **REBUILD markup** theo Stitch. Lạm dụng reuse vào markup = lỗi CSS-overlay; lạm dụng rebuild vào infrastructure = phình code.
- Scope conversion = đầy đủ danh sách màn hình trong GLOBAL RULES của `STITCH_PROMPT.template.md` (mọi trang + mọi modal + bản mobile). Track per-screen trong ledger; full-theme chưa xong khi còn màn hình chưa convert.

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
- **MOTION/INTERACTION SPEC**: hover effect, entrance animation, JS slider (dots/arrows/peek), marquee, countdown, counter đã spec trong design là BỀ MẶT FIDELITY — thiếu một interaction đã spec = fidelity gap, không phải "extra tùy chọn". Dùng slider/animation lib CÓ SẴN của theme (thêm lib mới = deviation phải log); tôn trọng `prefers-reduced-motion`; countdown/counter bind data thật (settings deadline / object counts), không fake số.

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

## 5B. Quy ước ship code (bắt buộc khi convert)

1. **Naming theo brand theme, không theo tool**: tên file/ảnh/CSS class/settings key/snippet ship ra derive từ brand/ngữ nghĩa theme (vd `nau-hero.liquid`, `header-logo.jpg`, `.gz-product-card`) — chữ "stitch" (hay tên generator bất kỳ) KHÔNG được xuất hiện trong code/asset ship. Artifact scratch/pipeline được giữ tên tool; theme thì không. (`audit:content` chặn bằng `STITCH_LEAK` + `STITCH_FILENAME`.)
2. **Sửa thẳng file đích — không wrapper snippet 1 chỗ**: sửa trực tiếp `header.liquid`, `index.liquid`, `footer.liquid`… Tạo snippet mới rồi include ngược vào file đích ("`abc-header.liquid` include vào header") = thêm bước vô ích. Snippet MỚI chỉ hợp lệ khi: nội dung lặp ở 2+ chỗ, hoặc pattern theme sẵn có đã tách vùng đó thành snippet.
3. **Extend file CSS/JS có sẵn theo đúng template**: map kiến trúc asset thật của theme trước (`ls assets/`) — home → `index.*`, shell/global → `main.*`, blog → `blog.*`, article → `article.*`, product/collection/cart/search/page/customer/404 → cặp file riêng của template đó. KHÔNG tạo file CSS/JS mới song song (lỗi thật: `f1-shell.scss.liquid` cạnh `index.scss.liquid` sẵn có); file mới chỉ khi theme thật sự không có slot, wire qua cơ chế include sẵn của theme, và log deviation.
4. **SCSS server-side**: giữ file `.scss.*` của theme (không đổi sang `.css` mới). Cấu trúc = SCSS NESTING; giá trị property = plain CSS. Cấm `min()`/`max()` chữ thường (compiler legacy chết cả file — `audit:content` chặn bằng `SCSS_MIN_MAX`); dùng `width: 100%; max-width: var(--x)`, `clamp()`/`var()`/`calc()` OK; bất khả kháng → `unquote("min(...)")`. Sau upload: fetch từng `.scss.*` đã đụng từ CDN, grep `Error >`.
5. **Đơn vị REM-first**: rem = type scale/spacing/section padding/gap (Stitch px ÷ 16); em = chỉ padding trong button/badge, icon theo text; px = border 1–2px, hairline, breakpoint. `html { font-size: 100% }` — cấm hack 62.5%.
6. **Asset jpg/png ONLY — cấm webp** (`audit:content` chặn bằng `WEBP_ASSET`/`WEBP_REF`). Ảnh từ Stitch export/AI generate phải nén qua sharp (resize đúng slot, q~80) trước khi vào `assets/`.
7. **Comment hygiene**: không banner generator ("Stitch source: ..."), không comment tường thuật, không TODO sót. Provenance ghi vào LEDGER, không ghi vào code. Mật độ comment theo theme sẵn có.

**Mechanical checks (chạy máy móc trước MỌI checkpoint/handoff — hit nào fix ngay):**

```
1. SCSS-safety:  grep -nE '(^|[^-@a-zA-Z.$])(min|max)\(' <file .scss.* đã đụng>  → 0 hit
2. New-file:     file CSS/JS MỚI trong assets/ so với fingerprint               → 0 file
3. Naming:       grep -ri 'stitch' <file ship đã đụng> + tên file               → 0 hit
4. Webp:         file/tham chiếu .webp mới                                      → 0
5. Wrapper:      snippet mới chỉ include đúng 1 nơi                             → 0 (gộp vào file đích)
```

`npm run audit:content` đã tự động hóa check 1/3/4 (SCSS_MIN_MAX, STITCH_LEAK/STITCH_FILENAME, WEBP_ASSET/WEBP_REF); check 2/5 đối chiếu tay với fingerprint. Log 5 kết quả PASS/FAIL-fixed vào ledger.

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
| **Gratuitous animation** | Thêm parallax/fade in/scroll reveal NGOÀI motion spec của design (interaction ĐÃ spec thì bắt buộc làm — xem mục 2) |
| **Icon family swap** | Stitch dùng line icon, agent dùng solid icon vì theme cũ có solid |
| **CSS overlay lên legacy** | Giữ DOM cũ, chỉ đè class/style mới cho "giống Stitch" thay vì dựng markup mới (vi phạm 1A) |
| **Legacy fallback hoarding** | Giữ section/toggle/conditional quay về layout cũ "phòng khi cần" thay vì xóa (vi phạm 1A) |
| **Parallel asset file** | Tạo `x-new.scss.liquid` cạnh `index.scss.liquid` sẵn có thay vì extend đúng file (vi phạm 5B.3) |
| **Wrapper snippet 1 chỗ** | Tạo snippet mới include đúng 1 nơi thay vì sửa thẳng file đích (vi phạm 5B.2) |

## 7. Acceptance gate cuối

Trước khi đóng task, phải pass tất cả:

- [ ] Section list khớp Stitch (số lượng, thứ tự, tên).
- [ ] **Screen coverage**: mọi màn hình trong GLOBAL RULES checklist (trang + modal + mobile) đã convert hoặc có deviation/gap log hợp lệ.
- [ ] `stitch-fidelity.json` và `stitch-fidelity-token-map.json` tồn tại, phản ánh đúng section/asset/token/copy status hiện tại.
- [ ] Mỗi section có screenshot side-by-side với Stitch hoặc % visual match >= 92% nếu chạy `visual_diff.js`.
- [ ] Tất cả deviation đã ghi vào ledger với lý do hợp lệ.
- [ ] Color/font/spacing map qua token, không hex/family lạc.
- [ ] Empty/sold-out/sale/loading state đã trao đổi với user (giữ default hoặc design rõ).
- [ ] Motion spec đã implement đủ (hover/animation/slider/marquee/countdown/counter theo design).
- [ ] 5 mechanical checks (mục 5B) PASS trên toàn bộ file đã đụng; `.scss.*` trên CDN không còn `Error >`.
- [ ] Không còn markup legacy bị đè CSS thay vì convert; code bị thay đã xóa (orphan sweep xác nhận).

Không có gate nào pass theo cảm tính. Phải có evidence.
