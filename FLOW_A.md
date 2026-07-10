# Flow A: Stitch Full Theme — Cheat Sheet

Dùng file này khi làm luồng A. Không cần đọc file nào khác để chạy. Link sâu hơn nếu cần: `RUN_GUIDE.md` → `STITCH_FIDELITY.md` → `HARAVAN_THEME_RESTYLE_WORKFLOW.md`.

> Khởi động project mới với agent? Copy prompt từ **`PROMPT.template.md`** mục #1, đừng chỉ nói "đọc FLOW_A.md" — agent sẽ thiếu theme path / Stitch path / preview URL.

---

## Thứ tự 15 bước + lệnh sẵn

Copy lệnh từ đây, thay `<theme>` và `<preview-url>`. Bước nào có **→ Gate** thì không được qua khi chưa pass.

---

### A.1 · Intake
```powershell
Copy-Item RESTYLE_MASTER_KIT/ISSUE_INTAKE.template.md <theme>/deliverables/ISSUE_INTAKE.md
# Điền: scope, permission settings_data, permission push live, asset source
```
**→ Gate**: biết được sửa `settings_data.json` không, push live không.

---

### A.2 · Preflight + Fingerprint
```powershell
npm run preflight -- --root <theme>
Copy-Item RESTYLE_MASTER_KIT/THEME_FINGERPRINT.template.md <theme>/deliverables/THEME_FINGERPRINT.md
# Điền Quick Checklist: container, font, slider, card, icon, JS lifecycle
```
**→ Gate**: preflight 0 blocker. Biết theme dùng Swiper / Slick / hand-roll chưa.

---

### A.3 · Baseline trước khi đụng
```powershell
npm run qa -- --base <current-url> --paths /,/collections/all,/products/sample --out scratch/baseline
npm run perf:check -- --root <theme> --out scratch/perf --save-baseline
```
**→ Gate**: có PNG trong `scratch/baseline/` + `scratch/perf/perf-baseline.json`.

---

### A.4 · Đọc Stitch Fidelity (BẮT BUỘC)
Đọc `STITCH_FIDELITY.md`. Ghi vào ledger:
```
Stitch Fidelity: đã đọc.
Deviation planned: <none | list cụ thể>
```
**→ Gate**: có dòng đó trong ledger.

---

### A.5 · Stitch Consume (mỗi screen)
```powershell
# Stitch export đã lưu trong scratch/stitch-input/<screen>/
npm run stitch:consume -- --in scratch/stitch-input/home --out scratch/stitch/home
npm run stitch:consume -- --in scratch/stitch-input/collection --out scratch/stitch/collection
npm run stitch:consume -- --in scratch/stitch-input/product --out scratch/stitch/product
npm run stitch:consume -- --in scratch/stitch-input/blog --out scratch/stitch/blog
npm run stitch:consume -- --in scratch/stitch-input/cart --out scratch/stitch/cart
```
Đọc `scratch/stitch/<screen>/report.md`:
- CDN tags stripped > 0? (nếu Stitch export có CDN thì phải > 0)
- Placeholder URLs phải = 0 bỏ sót (mọi URL phải vào asset-plan ở A.8)

**→ Gate**: mỗi screen có `report.md`, placeholder list đã đưa vào `scratch/asset-plan.json`.

---

### A.6 · Token Extract + Map
```powershell
npm run token:extract -- --theme <theme> --stitch-tokens scratch/stitch/home/tokens.json --out scratch/tokens/home
```
Mở `scratch/tokens/home/mapping.md`:
- Distance < 12 → **Reuse** var hiện có, không tạo mới.
- Distance 12–40 → **Replace** hex cũ sang giá trị Stitch.
- Distance > 40 → **New token**, paste từ `tokens.css`.

Paste phần cần từ `scratch/tokens/home/tokens.css` vào `<theme>/assets/theme.css :root`. Đổi tên slot theo brand (vd `--color-primary` → `--color-amber`).

Verify:
```powershell
npm run audit:css-tokens -- --root <theme>
```
**→ Gate**: hardcode count giảm so với baseline (không cần = 0 vì legacy có thể còn).

---

### A.7 · Section Scaffold
```powershell
Copy-Item RESTYLE_MASTER_KIT/section-config.template.json scratch/section-config.json
# Edit scratch/section-config.json:
#   - List đúng section Stitch có trong screen (home + global header/footer)
#   - Mỗi section: name, label, stitchSource, settings[], blocks[]

npm run section:scaffold -- --config scratch/section-config.json --root <theme> --dry-run
# Xem output, OK mới ghi:
npm run section:scaffold -- --config scratch/section-config.json --root <theme>
```
Scaffold ra:
- `templates/sections/<name>.liquid` — structure + schema (chưa có CSS scoped)
- `snippets/section-<name>-<type>.liquid` — block card (nếu có blocks)

**→ Gate**: số file generated khớp section list trong ledger Stitch inventory.

---

### A.8 · Asset Plan + Generate
```powershell
Copy-Item RESTYLE_MASTER_KIT/asset-plan.template.json scratch/asset-plan.json
# Edit scratch/asset-plan.json:
#   - List mọi image slot từ TẤT CẢ screen Stitch
#   - Ghi đúng ratio (hero 16:9, card 1:1, banner 21:9 ...)
#   - Source: demo-image-assets / bfl / iconify / flaticon / existing / brand-provided

npm run asset:plan -- --plan scratch/asset-plan.json --root <theme>
# Output in lệnh BFL/Iconify/... cho từng asset thiếu
# Chạy từng lệnh (hoặc skill demo-image-assets)
# Lặp đến khi:
npm run asset:plan -- --plan scratch/asset-plan.json --root <theme>
# Missing: 0 | Wrong: 0
```
**→ Gate**: `Missing: 0 | Wrong: 0`.

---

### A.9 · Implement — Thứ tự bắt buộc

> **Đọc thứ tự này trước khi viết Liquid. Làm sai thứ tự = phải sửa lại.**

```
Thứ tự triển khai:

  1. GLOBAL LAYER (làm trước hết)
     ├─ layout/theme.liquid  ← container, CSS/JS include, meta
     ├─ snippets/header.liquid (+ menu mobile)
     ├─ snippets/footer.liquid
     ├─ snippets/product-card.liquid  ← dùng ở collection + home
     └─ snippets/article-card.liquid  ← dùng ở blog + home

  2. HOME  (/templates/index.liquid + sections/)
     ├─ Từng section theo thứ tự Stitch (trên xuống dưới)
     └─ Sau mỗi section: eyeball vs Stitch screen

  3. COLLECTION  (/templates/collection.liquid + sections/)
  4. PRODUCT DETAIL  (/templates/product.liquid + sections/)
  5. BLOG LIST  (/templates/blog.liquid)
     ARTICLE  (/templates/article.liquid)
  6. GENERIC PAGE  (/templates/page.liquid)
  7. CART  (/templates/cart.liquid)
  8. SEARCH  (/templates/search.liquid)

  Sau mỗi page (không phải section):
    npm run audit:content -- --root <theme>   ← check ngay
    Update ledger: file đã đổi
```

**Checklist mỗi section**:
- [ ] Layout grid khớp Stitch (số col, width ratio).
- [ ] Copy text lấy đúng từ Stitch (Việt hóa nếu Stitch tiếng Anh).
- [ ] Color/font dùng `var(--*)`, không hex lạc.
- [ ] Image slot đúng ratio, có `loading="lazy"`, có `alt`.
- [ ] CSS scoped theo class module, không global.
- [ ] Không còn Tailwind class, CDN, placeholder Stitch.
- [ ] Deviation nếu có → đã ghi ledger.

**→ Gate per section**: eyeball compare với Stitch. Lệch không có lý do → dừng, hỏi user.

---

### Stitch Gap Checklist (điền vào ledger, không được bỏ qua)

Stitch thường không vẽ các state này. Phải xử lý TRƯỚC khi QA:

| State | Page | Stitch có? | Xử lý | Notes |
|---|---|---|---|---|
| Empty cart | /cart | [ ] | reuse default / design thêm | |
| Sold-out product | /products/* | [ ] | badge + disabled btn | |
| Sale price display | card + PDP | [ ] | compare price logic | |
| Low stock badge | PDP | [ ] | | |
| Out of stock variant | PDP | [ ] | disabled option | |
| Collection empty | /collections/* | [ ] | empty state block | |
| Search no result | /search | [ ] | empty state block | |
| Blog no articles | /blogs/* | [ ] | | |
| Form success | contact/form | [ ] | success message | |
| Form error | contact/form | [ ] | error message | |
| Mobile menu open/close | global | [ ] | | |
| Loading state (slider/async) | global | [ ] | | |

Với mỗi state "Stitch không có": ưu tiên reuse pattern theme đích. Nếu theme đích cũng không có, hỏi user 1 câu gộp trước khi tự design.

---

### A.10 · Audit Static
```powershell
npm run audit:restyle -- --root <theme>
```
**→ Gate**: 0 blocker. (Warn xem xét, không cần = 0.)

---

### A.11 · Orphan Sweep
```powershell
npm run orphan:sweep -- --root <theme>
```
Xóa thủ công những file **đã verify** là orphan thật (không phải dynamic concat như `'section-' + handle`).

**→ Gate**: orphan list giảm vs trước restyle.

---

### A.12 · Push Dev
```powershell
npm run theme:push -- --root <theme> --target unpublished
```
Lấy preview URL. Test tay nhanh: trang load, menu mở, product card hiển thị.

**→ Gate**: không 500, không blank page.

---

### A.13 · QA chính + A11y Deep + Perf
```powershell
# QA Puppeteer (screenshot + overflow + a11y cơ bản + interaction flow)
npm run qa -- --base <preview-url> --paths /,/collections/all,/products/sample,/blogs/news,/cart --viewports 320,375,768,1024,1440

# A11y deep axe-core (contrast, ARIA, keyboard, focus)
npm run a11y:deep -- --base <preview-url> --paths /,/products/sample --viewports 1440,375 --fail-on serious

# Perf bundle diff + Lighthouse
npm run perf:check -- --root <theme> --baseline scratch/perf/perf-baseline.json --lighthouse --base <preview-url> --paths /,/products/sample
```

Đọc kết quả:
- QA: 0 fail. Overflow warn → fix. A11y warn (tap target/alt) → fix.
- A11y deep: **0 critical, 0 serious** bắt buộc. Moderate/minor xem xét.
- Perf: bundle delta hợp lý. Lighthouse perf ≥ 70 desktop. LCP ≤ 2500ms. CLS ≤ 0.1.

**→ Gate**: qa 0 fail + a11y 0 critical + a11y 0 serious.

---

### A.14 · Visual Diff (optional nhưng nên làm)
```powershell
npm run visual:diff -- --before scratch/baseline --after <preview-url> --paths /,/collections/all,/products/sample --capture --threshold 0.30
```
- diff > 0 trên page đã restyle → confirm có apply.
- diff ≈ 0 trên page **không** restyle → confirm không phá.

**→ Gate**: diff > 0 trên tất cả page đã sửa.

---

### A.15 · Final + Guard
```powershell
# Chụp final (scroll, lazy-load, popup dismiss tự động)
npm run final:capture -- --base <preview-url>

# Eyeball 4 PNG output trước khi tiếp:
# final-showcase/desktop-876x2000.png
# final-showcase/mobile-276x480.png
# final-showcase/desktop-fullpage-raw.png
# final-showcase/mobile-fullpage-raw.png
# Còn placeholder/ô trắng/popup che → chụp lại

# Edit THEME_DESCRIPTION.html từ template (sales-focused, fragment chỉ)
Copy-Item RESTYLE_MASTER_KIT/THEME_DESCRIPTION.template.html final-showcase/THEME_DESCRIPTION.html
# ...điền nội dung...

# Export zip
npm run final:export -- --root <theme> --file <project-name>-final-theme.zip

# Gate cuối
npm run guard:final -- --root <theme>
```
**→ Gate**: `guard:final` PASS. Tức là:
- 5 PNG + zip + THEME_DESCRIPTION.html đủ.
- PNG dimensions đúng (876×2000 desktop, 276×480 mobile).
- THEME_DESCRIPTION.html ≥ 200 chars, có `<h1-3>`, có `<ul>`, không có `<!doctype>`.
- Ledger không còn `| pending |` hoặc `Checkpoint - chưa final`.

---

## Output báo user sau mỗi phase

```
## Phase: <tên> [A.<số>]
- File đổi: <list>
- Audit: <command> → <summary>
- QA: pass | warn | fail
- A11y deep: <critical/serious count>
- Perf: bundle <X>kB (delta <Y>kB), LCP <Z>ms, CLS <W>
- Deviation log: [section] <change> → <reason> (hoặc none)
- Status: pass | checkpoint - chưa final | blocked
- Next queue: <bước tiếp>
```

Final output:
```
## Final [A.15]
- Guard: PASS
- A11y: 0 critical, 0 serious
- Perf: bundle <X>kB (Δ<Y>kB), LCP <Z>ms, CLS <W>
- Visual diff vs baseline: home <X>%, collection <Y>%, product <Z>%
- QA fail: 0
- Artifacts: 5 PNG + zip + THEME_DESCRIPTION.html ✓
```

---

## 6 quy tắc cứng (copy vào ledger, không được bỏ qua)

```
1. Bưng nguyên Stitch — section list/order/layout/copy/color/font/spacing/component/icon.
   Lệch chỉ với 5 case trong STITCH_FIDELITY.md, phải ghi ledger.

2. Thứ tự implement: global layer → home → collection → product → blog/page → cart → search.
   Không làm home khi header/footer/product-card chưa xong.

3. Không hardcode 1280px hay #hex — dùng page-width/var(--*).
   Sau mỗi page: npm run audit:css-tokens.

4. Không sửa settings_data.json khi chưa có permission.
   Cần default mới → ghi ledger note, hỏi user.

5. Không push live khi chưa guard:final PASS.

6. A11y critical/serious phải về 0 trước final.
   Không skip, không workaround.
```

---

## Quick lookup — lệnh hay dùng nhất

| Lúc nào | Lệnh |
|---|---|
| Đầu project | `npm run preflight -- --root <theme>` |
| Sau khi nhận Stitch | `npm run stitch:consume -- --in <export> --out scratch/stitch/<screen>` |
| Map token | `npm run token:extract -- --theme <theme> --stitch-tokens scratch/stitch/home/tokens.json --out scratch/tokens/home` |
| Gen Liquid khung | `npm run section:scaffold -- --config scratch/section-config.json --root <theme>` |
| Asset thiếu | `npm run asset:plan -- --plan scratch/asset-plan.json --root <theme>` |
| Check nhanh sau mỗi section | `npm run audit:content -- --root <theme>` |
| Trước QA | `npm run audit:restyle -- --root <theme>` |
| Sau xóa code cũ | `npm run orphan:sweep -- --root <theme>` |
| Push dev | `npm run theme:push -- --root <theme> --target unpublished` |
| QA full | `npm run qa -- --base <preview-url> --paths /,/collections/all,/products/sample,/cart` |
| A11y deep | `npm run a11y:deep -- --base <preview-url> --paths /,/products/sample --fail-on serious` |
| Perf + Lighthouse | `npm run perf:check -- --root <theme> --baseline scratch/perf/perf-baseline.json --lighthouse --base <preview-url> --paths /` |
| Visual diff | `npm run visual:diff -- --before scratch/baseline --after <preview-url> --paths / --capture --threshold 0.30` |
| Final | `npm run final:capture && npm run final:export && npm run guard:final -- --root <theme>` |
| Confirm kit healthy | `npm test` |
