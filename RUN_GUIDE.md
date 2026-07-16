# Run Guide - rule cuối cùng

Đây là playbook chính thức của kit. Bắt đầu mở project mới → đọc file này. Mọi luồng đều có gate evidence-based, không cảm tính.

> Khởi động bằng prompt với agent? Copy từ **`PROMPT.template.md`** — đừng nói "đọc FLOW_A.md" trống không, agent thiếu theme path / preview URL sẽ stuck.

## 0. First-time setup (1 lần per máy)

```powershell
cd RESTYLE_MASTER_KIT
npm install
npm test           # phải pass 100% test trước khi dùng
haravan --version  # đảm bảo Haravan CLI có (cần cho theme:push, final:export)
```

Optional env keys (chỉ khi muốn generate ảnh AI/icon):

```powershell
$env:BFL_API_KEY = "..."         # Black Forest Labs flux-2
$env:MAGNIFIC_API_KEY = "..."    # Magnific paid (fallback)
$env:FREEPIK_API_KEY = "..."     # Flaticon/Freepik
```

---

## 1. Quy ước thư mục

```
<workspace>/
├─ RESTYLE_MASTER_KIT/     ← kit canonical, không sửa khi làm project
├─ <theme>/                ← theme đích, anh em với kit
│   ├─ assets/  config/  layout/  snippets/  templates/
│   └─ deliverables/       ← intake/fingerprint/ledger/retro FILLED
├─ scratch/                ← work-in-progress, gitignore
│   ├─ stitch/<screen>/    ← stitch_consume output
│   ├─ tokens/<screen>/    ← design_token_extract output
│   ├─ section-config.json ← section_scaffold input
│   ├─ asset-plan.json     ← asset_pipeline input
│   ├─ qa/                 ← qa_restyle_check output
│   ├─ a11y/               ← a11y_deep output
│   ├─ perf/               ← perf_check output (kèm baseline.json)
│   ├─ visual-diff/
│   └─ baseline/           ← screenshot trước khi sửa, dùng để so diff
└─ final-showcase/         ← artifact cuối, theo workflow_final_guard.js
```

Mọi `npm run` chạy trong `RESTYLE_MASTER_KIT/`. Tham số `--root <theme>` trỏ về theme đích (thường là `..`).

---

## 1B. Single-entry command cho full flow

Nếu muốn một entrypoint duy nhất để điều phối toàn bộ Stitch → Haravan flow:

```powershell
# Full-theme dry-run: chỉ in flow + ghi plan artifact
npm run stitch:full -- --theme <theme> --stitch <stitch-export> [--base <preview-url>] --mode full-theme

# Full-theme execute: chỉ chạy deterministic safe prefix, rồi dừng ở checkpoint đầu tiên cần approval
npm run stitch:full -- --theme <theme> --stitch <stitch-export> [--base <preview-url>] --mode full-theme --execute

# Single-page dry-run
npm run stitch:full -- --theme <theme> --stitch <single-screen-export> --mode single-page

# Audit-led dry-run (không có Stitch)
npm run stitch:full -- --theme <theme> [--base <preview-url>] --mode audit-led
```

Nếu chưa có export, dùng `/ck:stitch` để generate/export trước, rồi mới quay lại `stitch:full` ở runner-conversion stage.

Checkpoint bắt buộc vẫn tồn tại:
- asset approval
- stitch gap resolution
- permission boundary
- visual approval

Runner này là wrapper an toàn, **không** thay thế việc đọc `STITCH_FIDELITY.md` hay review bằng mắt.

## 2. Decision tree - tôi đang ở luồng nào?

| Tình huống | Luồng |
|---|---|
| Có Stitch design + restyle full theme | **A** (15 bước) |
| Có Stitch design + chỉ 1 page (home/collection/product) | **B** (10 bước) |
| Không có Stitch, audit + fix theme cũ | **C** (10 bước) |
| Resume project đang giữa chừng | **D** (đọc ledger) |

> Hay làm luồng A? Đọc thẳng **`FLOW_A.md`** — cheat sheet 15 bước + lệnh sẵn + Stitch gap checklist, không cần đọc file nào khác.

---

## Luồng A: Stitch design + full theme (15 bước)

### A.1. Intake
- Copy `ISSUE_INTAKE.template.md` → `<theme>/deliverables/ISSUE_INTAKE.md`, điền đủ §0.1-0.6 của workflow.
- **Gate**: biết permission sửa `settings_data.json`, push live.

### A.2. Preflight + fingerprint
```powershell
npm run preflight -- --root <theme>
```
- Copy `THEME_FINGERPRINT.template.md` → fill Quick Checklist + container/font/slider/JS lifecycle.
- **Gate**: preflight 0 blocker; biết theme dùng pattern gì.

### A.3. Baseline before touching
```powershell
npm run qa -- --base <current-preview-url> --paths /,/collections/all,/products/sample --out scratch/baseline
npm run perf:check -- --root <theme> --out scratch/perf --save-baseline
```
- Lưu screenshot + bundle baseline để so diff cuối project.
- **Gate**: có 5 PNG baseline + `scratch/perf/perf-baseline.json`.

### A.4. Đọc STITCH_FIDELITY (BẮT BUỘC)
- Đọc hết `STITCH_FIDELITY.md`. Note section list dự kiến và allowed deviation đã planned vào ledger.
- **Gate**: ledger có dòng "đã đọc Stitch Fidelity, deviation planned: <list hoặc none>".

### A.5. Stitch consume (mỗi screen)
```powershell
npm run stitch:consume -- --in scratch/stitch-input/home --out scratch/stitch/home
npm run stitch:consume -- --in scratch/stitch-input/collection --out scratch/stitch/collection
# ... lặp cho mỗi screen
```
- Đọc `report.md`, confirm CDN strip > 0, không placeholder URL bỏ sót.
- **Gate**: mỗi screen có `cleaned.html`, `cleaned.css`, `tokens.json`, `report.md`.

### A.6. Token extract + map
```powershell
npm run token:extract -- --theme <theme> --stitch-tokens scratch/stitch/home/tokens.json --out scratch/tokens/home
```
- Mở `scratch/tokens/home/mapping.md`. Đọc cột "Suggestion": "Reuse" / "Replace" / "New token".
- Paste `scratch/tokens/home/tokens.css` vào `<theme>/assets/theme.css :root` block, chỉnh tên slot cho hợp brand.
- **Gate**: chạy `npm run audit:css-tokens -- --root <theme>` ra ít hardcode hơn baseline.

### A.7. Section scaffold
```powershell
# Tạo scratch/section-config.json từ template, list mỗi section Stitch
Copy-Item section-config.template.json scratch/section-config.json
# ...edit scratch/section-config.json...
npm run section:scaffold -- --config scratch/section-config.json --root <theme> --dry-run
# Xem output, OK rồi mới ghi thật:
npm run section:scaffold -- --config scratch/section-config.json --root <theme>
```
- Output là Liquid skeleton + schema. Chỉ là khung, bạn sẽ điền CSS scope + asset + layout fidelity sau.
- **Gate**: số file generated khớp số section Stitch + snippet card cần thiết.

### A.8. Asset plan + generate
```powershell
Copy-Item asset-plan.template.json scratch/asset-plan.json
# ...edit scratch/asset-plan.json: list mọi image slot Stitch, ratio, source...
npm run asset:plan -- --plan scratch/asset-plan.json --root <theme>
```
- Output in lệnh BFL/Iconify cho từng asset thiếu. Chạy tay (hoặc skill `demo-image-assets`).
- Lặp `asset:plan` đến khi `Missing: 0`, `Wrong: 0`.
- **Gate**: `Missing: 0 | Wrong: 0`.

### A.9. Implement section-by-section (theo Stitch fidelity)
- **Template-first conversion, không phải restyle**: dựng MARKUP MỚI theo Stitch cho từng template; markup cũ không thể hiện được design thì XÓA, không đè CSS lên DOM legacy, không giữ fallback layout cũ (STITCH_FIDELITY.md §1A). Feature/behavior cũ (AJAX cart, slider, quickview, mega menu...) bưng hook sang markup mới — muốn BỎ một feature phải hỏi user trước.
- Từ scaffold ở A.7, điền: layout grid, copy text, asset slot, CSS scoped, JS lifecycle theo theme đích.
- **CSS/JS viết vào file CÓ SẴN đúng template** (home → `index.*`, shell → `main.*`, blog → `blog.*`, ...), giữ dialect `.scss.*` (nesting OK, cấm `min()`/`max()` chữ thường). Không tạo file asset mới song song. Tên file/class/ảnh theo brand theme — không có chữ "stitch". Ảnh jpg/png, cấm webp. Đơn vị REM-first (px ÷ 16).
- Mỗi section xong: mở Stitch screen song song so visual. Lệch không có lý do trong allowed deviation → dừng, hỏi user.
- **Mechanical checks trước khi kết thúc phiên/section** (STITCH_FIDELITY.md §5B): grep min(/max( trên `.scss.*` = 0 · file CSS/JS mới = 0 · grep stitch trên file ship = 0 · webp = 0 · wrapper snippet 1 chỗ = 0. Ghi kết quả vào ledger.
- Update ledger: file đã đổi + deviation log nếu có + entry `SKILL_IMPROVEMENT_LOG.md` nếu gặp kit bug/rule mù mờ/yêu cầu đổi từ user.
- **Gate per section**: eyeball compare với Stitch screen tương ứng + 5 mechanical checks PASS.

### A.10. Audit static
```powershell
npm run audit:restyle -- --root <theme>
```
- 0 blocker là điều kiện bắt buộc.
- **Gate**: 0 blocker.

### A.11. Orphan sweep
```powershell
npm run orphan:sweep -- --root <theme>
```
- Xóa thủ công asset/snippet/section orphan **đã verify** không phải dynamic concat.
- **Gate**: orphan list giảm vs trước khi restyle.

### A.12. Theme push dev (smoke test)
```powershell
npm run theme:push -- --root <theme> --target unpublished
```
- Lấy preview URL từ output Haravan CLI.
- **Gate**: trang load được, không 500.

### A.13. QA chính + a11y deep + perf
```powershell
npm run qa -- --base <preview-url> --paths /,/collections/all,/products/sample,/blogs/news
npm run a11y:deep -- --base <preview-url> --paths /,/products/sample --viewports 1440,375 --fail-on serious
npm run perf:check -- --root <theme> --baseline scratch/perf/perf-baseline.json --lighthouse --base <preview-url> --paths /,/products/sample
```
- QA: 0 fail, warn cân nhắc.
- A11y: 0 critical/serious. Moderate/minor xem xét.
- Perf: bundle delta hợp lý (restyle full thường tăng nhẹ là OK; tăng quá phải audit JS/CSS). Lighthouse perf ≥ 70 desktop.
- **Gate**: a11y 0 critical, qa 0 fail.

### A.14. Visual diff so với baseline (optional)
```powershell
npm run visual:diff -- --before scratch/baseline --after <preview-url> --paths / --capture --threshold 0.30
```
- Restyle full thì diff sẽ cao (>30%). Threshold cao chỉ để xác nhận có thay đổi, không để pass <5%.
- Nếu diff = 0% trên page mong đổi → cảnh báo: có thể chưa apply.
- **Gate**: diff > 0 trên page đã restyle.

### A.15. Final + guard
```powershell
# 1) Home showcase (4 PNG guard contract) + multi-template pages (desktop pages default)
#    Copy CAPTURE_PATHS.template.json → final-showcase/CAPTURE_PATHS.json
#    Điền product/article/page-custom bằng handle thật trước khi chạy.
#    Always keep home mobile 276x480; do NOT put mobile page grids into sales PPTX unless asked.
npm run final:capture -- --base <preview-url> --all-templates --paths-file final-showcase/CAPTURE_PATHS.json [--theme-id <id>]
# Eyeball: home desktop+mobile + pages/ with readable names:
#   pages/Trang chi tiết sản phẩm.png, Trang chi tiết bài viết.png, …

# 2) Description fragment
# Edit final-showcase/THEME_DESCRIPTION.html từ template, sales-focused fragment (merchant language)

# 3) Feature images + PPTX
# FEATURES.json: plain merchant Vietnamese (lợi ích + bật/tắt settings), NOT eng jargon
# Capture taxonomy (gold standard — see kit FINAL_SHOWCASE.md):
#   - Widgets (pop-sale, popnoti, social, search, cart): tight crop on #f3f4f6, kill #shop-modal-contact first
#   - Sections (hero/flash/…): document-offset crop; hero must not be covered by newsletter modal
#   - Product card: isolated card stage (badge + ATC)
#   - Every page.* custom (about/store/contact/faq/gallery/…): full-page desktop in FEATURES
# Prefer scripts/final_feature_pack.example.js (or theme showcase-recapture-v2) for widgets;
# or npm run final:feature-capture with careful FEATURE_SHOTS.json
npm run final:feature-capture -- --base <preview-url> --out final-showcase [--theme-id <id>]
npm run final:pptx -- --out final-showcase --brand "<Brand>"
# PPTX: aspect-fit (no stretch), ≥0.5" margins, ≥0.35" frame pad — reopen PPTX after rebuild

# 4) Export + gate
#    Pre-export UI smoke: skill haravan-stitch-full-run/references/post-restyle-qa-checklist.md
#    CLI note: `haravan theme export` does NOT accept --file (v1.1.x). Kit script runs bare export
#    then copies newest zip → --out/--file. Manual fallback:
#      cd <theme>; haravan theme export; copy .\*.zip .\final-showcase\<project>-final-theme.zip
npm run final:export -- --root <theme> --file <project>-final-theme.zip --out <theme>/final-showcase
npm run guard:final -- --root <theme> --require-pptx
```
- Mark final trong ledger.
- **Gate**: `guard:final` PASS (home PNG dims + description + pptx khi `--require-pptx`).
- **Visual QA**: wrong subject / newsletter on hero / edge-clipped widgets / tech FEATURES copy → fix before STOP 3.
- **Export-only request:** skip capture/PPTX; run export steps only.

---

## Luồng B: Stitch + chỉ 1 page (10 bước)

Rút gọn từ A:

1. **Intake** ngắn (chỉ scope page đó).
2. **Preflight + fingerprint** giới hạn.
3. **Baseline screenshot** chỉ page đó.
4. **Đọc STITCH_FIDELITY**.
5. **Stitch consume** chỉ screen đó.
6. **Token extract** — chỉ thêm token mới khi bắt buộc, ưu tiên reuse var hiện có (xem cột "Closest theme" trong mapping.md, distance <12 thì reuse).
7. **Asset plan** chỉ asset của page → `Missing: 0`.
8. **Section scaffold** chỉ sections của page → implement section-by-section.
9. **Audit + push dev + qa + a11y deep**:
   ```powershell
   npm run audit:restyle -- --root <theme>
   npm run theme:push -- --root <theme> --target unpublished
   npm run qa -- --base <preview-url> --paths <page-path>
   npm run a11y:deep -- --base <preview-url> --paths <page-path> --fail-on serious
   ```
10. **Final** (capture + export + guard).

Bỏ orphan sweep nếu không xóa file global. Bỏ visual diff nếu không cần.

---

## Luồng C: Audit-led, không có Stitch (10 bước)

Khi user trỏ vào theme cũ + ý "audit và fix", không có design source.

1. **Intake** — xác định scope: bug/perf/a11y/UX/visual.
2. **Preflight + fingerprint** đầy đủ.
3. **Baseline screenshot + perf** trước khi sửa:
   ```powershell
   npm run qa -- --base <preview-url> --paths /,/collections/all,/products/sample --out scratch/baseline
   npm run perf:check -- --root <theme> --out scratch/perf --save-baseline
   ```
4. **Audit static**:
   ```powershell
   npm run audit:restyle -- --root <theme>
   ```
   Output là to-do list cụ thể.
5. **A11y deep snapshot** (để biết debt):
   ```powershell
   npm run a11y:deep -- --base <preview-url> --paths / --fail-on critical
   ```
6. **Fix theo ưu tiên**:
   - blocker từ audit (HARD_1280, MOJIBAKE, MISSING_SETTINGS_BOUNDARY).
   - a11y critical/serious.
   - Hardcode color/font → consolidate token (paste tokens.css, replace var).
   - IMPORTANT_ABUSE → cascade fix.
   - English copy → Việt hóa.
7. **Orphan sweep** sau khi xóa code dead.
8. **Re-audit + re-a11y + re-perf** so vs baseline:
   ```powershell
   npm run audit:restyle -- --root <theme>
   npm run a11y:deep -- --base <preview-url> --paths / --fail-on serious
   npm run perf:check -- --root <theme> --baseline scratch/perf/perf-baseline.json
   ```
   Bundle nên giảm hoặc giữ nguyên. A11y critical/serious phải về 0.
9. **Visual diff so với baseline** (threshold thấp vì đang fix, không restyle):
   ```powershell
   npm run visual:diff -- --before scratch/baseline --after <preview-url> --paths / --threshold 0.05
   ```
10. **Final** như A.15.

---

## Luồng D: Resume từ ledger

1. Mở `<theme>/deliverables/RESTYLE_PROGRESS_LEDGER.md`, tìm dòng `Status: pending` hoặc `next queue`.
2. Nếu có, đọc thêm artifact runner gần nhất như `stitch-pipeline-plan.json` để biết checkpoint machine-readable hiện tại.
3. Đối chiếu checklist của luồng đang chạy (A/B/C) ở trên để biết bước nào pass rồi.
4. Nếu artifact và ledger lệch nhau, báo lệch trước khi tiếp tục; không tự đoán.
5. Resume từ bước đầu chưa pass.
6. **Đừng** chạy lại generate (asset, stitch consume, scaffold) nếu output đã có; rủi ro phá file đã edit.

---

## 3. Common pitfalls

| Vấn đề | Cách tránh |
|---|---|
| Skip Stitch consume, copy paste raw Stitch HTML vào Liquid | Luôn `stitch:consume` trước. Không lấy raw Stitch CSS. |
| Tự thêm/bỏ section, đổi copy/màu | Đọc `STITCH_FIDELITY.md`. Chỉ deviation khi thuộc 5 case hợp lệ + log ledger. |
| Section scaffold ra file rồi không sửa thêm | Scaffold chỉ là khung structure + schema. Phải điền CSS scoped, asset slot, JS lifecycle theo theme. |
| Token extract paste y nguyên `tokens.css` | Đọc `mapping.md` cột "Suggestion". Reuse khi distance <12, replace khi 12-40, new khi >40. Đổi tên slot cho hợp brand. |
| QA full theme khi chưa refactor | Refactor shared layer trước, QA full sau. Trong lúc làm chỉ qa 1 page đang code. |
| Hardcode `#hex` rải rác | Map qua `var(--color-*)`. Sau mỗi page chạy `audit:css-tokens`. |
| Sửa `settings_data.json` không xin phép | Hỏi user trước. Cần default mới → ghi ledger note, không tự sửa. |
| `theme_push live` không xin phép | Default `--unpublished`. Live cần `--confirm-live` + 5s countdown. Đừng bypass. |
| Chụp final khi popup còn che hero | `final_showcase_capture` đã có dismiss, vẫn phải eyeball 4 PNG output. Xấu thì chụp lại. |
| Visual diff threshold 5% fail vì restyle full | Chỉnh `--threshold` cao (0.30-0.50) khi restyle full. Threshold thấp chỉ cho audit-led. |
| A11y deep ra critical, fix bằng cách bỏ qua | Critical/serious phải về 0 trước final. Không skip. |
| Bundle sau restyle to gấp đôi | Chạy `orphan:sweep` xóa CSS/JS cũ. Audit `IMPORTANT_ABUSE`/`INLINE_STYLE`. Move CSS module sang scoped. |
| Đè CSS lên layout legacy thay vì convert | Template-first: dựng markup mới theo Stitch, xóa markup cũ. Không giữ fallback/toggle quay về layout cũ. |
| Tạo file CSS/JS mới thay vì extend file sẵn có | Map `assets/` trước; viết vào `main`/`index`/`blog`/... đúng template. File mới = deviation phải duyệt. |
| `min()`/`max()` trong `.scss.*` giết cả stylesheet | Dùng `width:100% + max-width` / `clamp()`. `audit:content` chặn `SCSS_MIN_MAX`; sau upload grep `Error >` trên CDN. |
| Tên file/ảnh/class dính chữ "stitch" | Đặt tên theo brand theme. `audit:content` chặn `STITCH_LEAK`/`STITCH_FILENAME`. |
| Asset webp lọt vào `assets/` | jpg/png only, nén qua sharp q~80. `audit:content` chặn `WEBP_ASSET`/`WEBP_REF`. |
| Tạo snippet wrapper rồi include đúng 1 nơi | Sửa thẳng file đích (`header.liquid`, `index.liquid`...). Snippet mới chỉ khi tái dùng 2+ chỗ hoặc theme đã có pattern tách. |

---

## 4. Quick reference - khi nào dùng script nào

| Khi | Lệnh |
|---|---|
| Mở project mới | `npm run preflight -- --root <theme>` |
| Lưu baseline trước khi đụng theme | `npm run qa -- --base <url> --paths ... --out scratch/baseline` + `npm run perf:check -- --root <theme> --save-baseline` |
| Vừa nhận Stitch export | `npm run stitch:consume -- --in <export> --out scratch/stitch/<screen>` |
| Map token Stitch sang theme | `npm run token:extract -- --theme <root> --stitch-tokens scratch/stitch/<screen>/tokens.json --out scratch/tokens/<screen>` |
| Gen Liquid section khung | `npm run section:scaffold -- --config scratch/section-config.json --root <theme>` |
| Có asset-plan | `npm run asset:plan -- --plan scratch/asset-plan.json --root <theme>` |
| Sau refactor 1-2 section | `npm run audit:content -- --root <theme>` |
| Trước QA chính | `npm run audit:restyle -- --root <theme>` |
| Sau khi xóa block CSS/JS cũ | `npm run orphan:sweep -- --root <theme>` |
| Smoke test browser thật | `npm run qa -- --base <preview-url> --paths /,...` |
| Deep a11y (contrast/ARIA/keyboard) | `npm run a11y:deep -- --base <preview-url> --paths /,/products/x --fail-on serious` |
| Đo bundle + Lighthouse | `npm run perf:check -- --root <theme> --baseline scratch/perf/perf-baseline.json --lighthouse --base <url> --paths /` |
| Đo regression visual | `npm run visual:diff -- --before <baseline> --after <preview-url> --paths /` |
| Push thử | `npm run theme:push -- --root <theme> --target unpublished` |
| Final | `npm run final:capture && npm run final:export && npm run guard:final` |
| Kit health check | `npm test` (phải pass 100%) |

---

## 5. Output Contract khi báo user

Sau mỗi phase lớn, agent output:

```
## Phase: <tên>
- File đổi: <list relative path>
- Audit run: <command + summary>
- QA run: <pass/warn/fail + link results>
- A11y deep: <critical/serious count + link>
- Perf: <bundle delta + LCP/TBT/CLS nếu có>
- Deviation log: <list nếu có, format [section] change → reason>
- Mechanical checks: <5 check PASS/FAIL-fixed>
- Improvement log: <entry mới trong SKILL_IMPROVEMENT_LOG.md nếu có, hoặc none>
- Status: pass | checkpoint - chưa final | blocked
- Next queue: <bước tiếp nếu chưa final>
```

Khi final:

```
## Final
- Theme root: <path>
- Final artifacts: home 4 PNG + pages/* multi-template + FEATURES.pptx + zip + THEME_DESCRIPTION.html
- Guard: PASS (--require-pptx)
- A11y deep: 0 critical, 0 serious
- Perf: bundle <X> kB (delta <Y> kB), LCP <Zms>, CLS <W>
- Visual diff vs baseline: <%>
- QA fail count: 0
- Description: final-showcase/THEME_DESCRIPTION.html (X chars, có heading + ul)
- Feature deck: final-showcase/<brand>-features.pptx (cover + section + N features + thank-you)
```

Đó là evidence-based handoff, không cảm tính.

---

## 6. Order tổng quát của rule

Khi mâu thuẫn, dùng thứ tự ưu tiên này:

1. **Yêu cầu hiện tại của user** — luôn thắng.
2. **`STITCH_FIDELITY.md`** — khi có Stitch design, đây là contract bắt buộc cho phần implement.
3. **`HARAVAN_THEME_RESTYLE_WORKFLOW.md`** — workflow doc đầy đủ.
4. **`RUN_GUIDE.md`** (file này) — playbook ngắn gọn cho 4 luồng.
5. **`README.md`** — quick reference scripts.
6. **Default assumption** — dùng khi user nói "tự quyết", phải ghi vào ledger.

Khi nghi ngờ một bước → dừng, hỏi user 1 câu ngắn, không tự đoán.
