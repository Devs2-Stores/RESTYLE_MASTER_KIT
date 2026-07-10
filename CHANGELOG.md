# Changelog

## 2.4.2 - 2026-06-12

- **`PROMPT.template.md`** — 7 prompt mẫu copy-paste cho agent (Codex/Claude/Cursor/Kiro):
  1. Kickoff luồng A Stitch full theme (minimum 3 dòng + full version)
  2. Resume project đang giữa chừng (đọc ledger + skip generate steps)
  3. Audit-led không có Stitch (luồng C)
  4. Single page Stitch (luồng B)
  5. Fix 1 bug cụ thể, không refactor lan
  6. Final handoff (chuỗi 8 lệnh chốt gate)
  7. Kit health check (verify trước khi mở project)
- Mỗi prompt có 3 thông tin tối thiểu: theme path, Stitch path (nếu có), preview URL.
- Thêm bảng "Anti-prompt — ĐỪNG dùng" với 5 prompt sai phổ biến (vd "Đọc FLOW_A.md" trống không, "Restyle theme này theo Stitch") + lý do fail.
- Thêm context override snippet để paste vào Cursor `.cursorrules`/Claude project settings/Kiro steering.
- `FLOW_A.md` đầu file, `RUN_GUIDE.md`, `README.md`, `START_HERE.md` đều thêm callout chỉ về `PROMPT.template.md`.
- `test/run_tests.js` +9 test: validate `PROMPT.template.md` tồn tại + có 7 prompt section + lists Anti-prompt + 3 minimum info; README + FLOW_A đều link tới PROMPT template.
- Bump version 2.4.1 → 2.4.2.

## 2.4.1 - 2026-06-12

- **`FLOW_A.md`** — cheat sheet riêng cho luồng A Stitch full theme: 15 bước với lệnh copy-paste sẵn, thứ tự implement bắt buộc (global layer → home → collection → product → blog → page → cart → search), checklist mỗi section, Stitch Gap Checklist 11 state, 6 quy tắc cứng, quick lookup table 16 lệnh, output contract mẫu.
- **`RESTYLE_PROGRESS_LEDGER.template.md`** thêm: `Stitch Inventory` table (# / section name / screen / file Liquid / snippet / stitch gap), `Stitch Gap Checklist` 11 state, field `Stitch Fidelity: đã đọc + deviation planned` vào Understanding Gate.
- **`THEME_FINGERPRINT.template.md`** fix: Quick Checklist bị mojibake hết dấu tiếng Việt → khôi phục UTF-8 đầy đủ.
- `RUN_GUIDE.md`: thêm callout "Hay làm luồng A? Đọc thẳng `FLOW_A.md`" tại decision tree.
- `START_HERE.md`: đưa `FLOW_A.md` lên #2 trong danh sách file chính, cập nhật mô tả luồng A.
- `test/run_tests.js` +11 test: check `FLOW_A.md` tồn tại + có 15 bước + global layer order + Stitch Gap + quick lookup + 6 rules; check ledger template có Stitch Inventory + Stitch Gap + Stitch Fidelity field; check RUN_GUIDE link tới `FLOW_A.md`.
- Bump version 2.4.0 → 2.4.1 trong `package.json`, `START_HERE.md`, `README.md`.

## 2.4.0 - 2026-06-12

- **Coverage A-Z 100%**: thêm 4 script advanced để hoàn tất kit:
  - `design_token_extract.js`: đọc `<theme>/assets/*.css` (cả `:root` vars lẫn raw hex) + `tokens.json` từ Stitch consume, tính color distance, đề xuất reuse/replace/new token. Output `mapping.md`, `mapping.json`, `tokens.css` (root block paste-ready).
  - `section_scaffold.js`: đọc JSON config → gen Liquid section + `{% schema %}` + snippet block từ schema settings (text/textarea/richtext/image_picker/url/collection/page/blog/menu/product). Có `--dry-run` xem trước, `--force` overwrite. Render CTA pair (`cta_text` + `cta_url`) thành `<a>` button gộp, không lặp.
  - `a11y_deep.js`: axe-core 4.12 inject vào page qua Puppeteer, run với tag `wcag2a/wcag2aa/wcag21a/wcag21aa/best-practice`. Output report.md group theo impact (critical/serious/moderate/minor) + selector + failureSummary. `--fail-on critical|serious|moderate|minor`.
  - `perf_check.js`: bundle scan `<theme>/assets/*.{css,js}` + diff vs baseline JSON + Lighthouse optional via `npx --yes lighthouse` (perf score, LCP, TBT, CLS, FCP). Có `--save-baseline` để lưu snapshot.
- Thêm `section-config.template.json` schema mẫu với 3 section (hero-banner / featured-collections / bestseller-grid) + 3 loại setting + blocks demo.
- Add dependency `axe-core ^4.10.0` vào `package.json`. Lighthouse cố tình không thêm cứng (gọi `npx --yes lighthouse` khi cần để giảm install size).
- Thêm 4 npm script: `token:extract`, `section:scaffold`, `a11y:deep`, `perf:check`.
- `RUN_GUIDE.md` viết lại thành "rule cuối cùng": 4 luồng A/B/C/D với tổng cộng 35+ bước. Luồng A bumped 13 → 15 bước (thêm baseline before touching + token extract step + a11y deep + perf check). Common pitfalls bumped 9 → 12 entries. Quick reference table bumped 11 → 16 commands. Thêm mục "Order tổng quát của rule" định rõ thứ tự ưu tiên giữa user request → Stitch Fidelity → Workflow → Run Guide → README → default.
- `README.md` Scripts table bumped từ 14 → 18 entries có 4 script mới.
- `test/run_tests.js` bumped 73 → 102 test: thêm BOM check 4 file mới, smoke test `--help` cho từng script, integration test end-to-end `design_token_extract` (chain với stitch_consume trên mock), `section_scaffold` dry-run + force + skip-existing modes, `perf_check` bundle scan + save baseline + diff zero-delta, `a11y_deep` resolve axe-core dependency. Bonus: validate 4 npm script mới + axe-core declared + section-config valid JSON.
- Bump version 2.3.1 → 2.4.0 trong `package.json`, `START_HERE.md`, `README.md`.

## 2.3.1 - 2026-06-12

- Thêm `RUN_GUIDE.md`: playbook bắt đầu cho 4 luồng A/B/C/D (Stitch full, Stitch 1 page, audit-led, resume) với chuỗi lệnh ready-to-copy + acceptance gate sau mỗi bước.
- `RUN_GUIDE.md` chứa: first-time setup, quy ước thư mục, decision tree luồng, common pitfalls, quick reference khi nào dùng script nào, output contract mẫu cho agent.
- `README.md` thêm callout chỉ vào `RUN_GUIDE.md`. `START_HERE.md` thêm mục "Bắt đầu chạy ngay" và đưa `RUN_GUIDE.md` lên đầu danh sách file chính.

## 2.3.0 - 2026-06-12

- **Stitch Fidelity Contract**: thêm `STITCH_FIDELITY.md` chứa rule chống agent tự chế khi implement Stitch design (bưng nguyên section list, layout, copy, color, font, spacing, component, icon family). Có allowed deviation table (5 case hợp lệ) và bảng anti-patterns kèm acceptance gate.
- **5 script automation mới** mở rộng kit từ "guard rail" lên "end-to-end":
  - `stitch_consume.js`: strip `<script src="cdn.tailwindcss.com">`, Google Fonts CDN, link CDN khác. Merge inline `<style>` ra `cleaned.css`. Extract histogram color/font/font-size/spacing → đề xuất token name. Phát hiện placeholder URL (picsum, placehold, unsplash). Output `cleaned.html`, `cleaned.css`, `tokens.json`, `report.md`.
  - `asset_pipeline.js`: đọc `asset-plan.json`, validate file exist + đúng PNG/JPEG dimensions. In lệnh generate cụ thể cho `demo-image-assets`/`magnific`/`bfl`/`iconify`/`flaticon`/`existing`/`brand-provided`. Hỗ trợ `--execute --generator <cmd>` để pipe spec qua stdin.
  - `orphan_sweep.js`: tìm asset/snippet/section liquid không reference qua `asset_url`/`include`/`render`/`section`. Chỉ report, không tự xóa.
  - `visual_diff.js`: diff pixel giữa 2 PNG hoặc capture từ URL. Decoder PNG built-in (zlib + unfilter scanlines), không cần dep mới. Threshold mặc định 5%, exit 1 khi vượt.
  - `theme_push.js`: wrapper `haravan theme push --unpublished` với double-confirm cho live target (`--target live` cần `--confirm-live`, đếm lùi 5s). Hỗ trợ `--dry-run`, `--only`, `--nodelete`.
- Thêm `asset-plan.template.json`: schema mẫu khai báo asset với 8 source: `existing`, `brand-provided`, `demo-image-assets`, `bfl`, `iconify`, `flaticon`, `freepik`, `magnific`.
- Mở rộng workflow Stitch trong `HARAVAN_THEME_RESTYLE_WORKFLOW.md`: 16 bước từ Stitch consume → token map → asset plan → implement section-by-section → visual diff → orphan sweep → push dev. Thêm anti-pattern "Tự chế khi implement Stitch" vào section F.
- README mới: section "Luồng Stitch → Haravan end-to-end" với chuỗi 11 lệnh ready-to-copy.
- `package.json`: thêm 5 npm script `stitch:consume`, `asset:plan`, `orphan:sweep`, `visual:diff`, `theme:push`.
- `START_HERE.md`: thêm `STITCH_FIDELITY.md` vào File chính, thêm rule "bưng nguyên Stitch" vào Quy tắc khóa, link `orphan_sweep.js`/`asset_pipeline.js` vào các rule liên quan.
- `test/run_tests.js`: 43 → 60 test. Thêm BOM check cho 5 script mới, smoke test spawn `--help` cho từng script, integration test `stitch_consume` thật trên sample HTML, test `asset_pipeline` đọc plan template, test `orphan_sweep` zero-orphan trên clean mock, test `theme_push --dry-run` + test guard live blocking, validate tồn tại + nội dung `STITCH_FIDELITY.md` và `asset-plan.template.json`, validate README có document Stitch end-to-end flow.
- Bump version 2.2.1 → 2.3.0 trong `package.json`, `START_HERE.md`, `README.md`.

## 2.2.1 - 2026-06-12

- Strip BOM khỏi 4 file `.js` (`liquid_content_audit.js`, `settings_boundary_audit.js`, `css_token_audit.js`, `lib/theme-walk.js`) để Node parse được shebang khi chạy độc lập.
- Sửa 2 regex bị mất `\` escape trong `liquid_content_audit.js`: `HARDCODE_COLOR` và `HARDCODE_FONT` giờ match đúng `\s*:\s*` thay vì `s*:s*` chết cứng.
- Xóa double `main()` ở cuối `liquid_content_audit.js` và `settings_boundary_audit.js` (trước đó in báo cáo 2 lần).
- Sửa mojibake `?` thay cho `-` trong `workflow_final_guard.js` (thông báo description quá ngắn) và `final_showcase_capture.js` (comment + lỗi resizeCrop).
- Khôi phục tiếng Việt có dấu và format code fence chuẩn cho mục `Kit Scripts Reference` trong `HARAVAN_THEME_RESTYLE_WORKFLOW.md` (trước đó tên file `run_preflight.js`/`final_*.js` bị mất chữ vì escape sai và code fence dùng 1 backtick).
- Đồng bộ version trong `README.md` (2.1.3 → 2.2.1) và bổ sung script `audit:restyle` vào bảng scripts.
- Xóa thư mục `mock-theme-bad/` mồ côi ở root project (đã có bản dùng được trong `test/mock-theme-bad/`).
- Bỏ vòng count file dead code trong `haravan_preflight_fallback.py`.
- Mở rộng `test/run_tests.js`: thêm integration test spawn thật 3 audit script trên `mock-theme` và `mock-theme-bad`, kiểm exit code và stdout chứa rule expected.
- Bump version 2.2.0 → 2.2.1 trong `package.json` và `START_HERE.md`.

## 2.2.0 - 2026-06-10

- Thêm `css_token_audit.js`: quét 8 pattern hardcode design value (hex/rgb color, font-size, spacing, border-radius, font-family, z-index magic, transition duration), summary by rule, `--help`, `--fail-on`, try/catch.
- Thêm `--dry-run` flag cho `settings_boundary_audit.js`: báo findings nhưng luôn exit 0.
- Thêm `README.md`: quick start, bảng scripts, bảng audit patterns, QA output, final artifacts, quy tắc khóa.
- Thêm `UPGRADE.md`: hướng dẫn nâng kit version, bảng file merge/skip, quy trình từng bước.
- Thêm `test/mock-theme/` và `test/run_tests.js`: 23 smoke test, chạy bằng `npm test`.
- Thêm script `test` và `audit:css-tokens` vào `package.json`.
- `run_preflight.js`: thêm `--help`, `use strict`, pass args xuống Python.
- `liquid_content_audit.js`, `settings_boundary_audit.js`, `final_theme_export.js`: thêm try/catch wrap graceful.
- `qa_restyle_check.js`, `workflow_final_guard.js`, `final_showcase_capture.js`, `final_theme_export.js`: thêm `use strict`.
- `workflow_final_guard.js`: thêm content length + heading + `<ul>` check cho `THEME_DESCRIPTION.html`.
- `qa_restyle_check.js`: thêm a11y detail section trong `qa-results.md`.
- `liquid_content_audit.js`: thêm `INLINE_STYLE` pattern.
- `settings_boundary_audit.js`: thêm `ORPHAN_SETTING` warn.
- `THEME_FINGERPRINT.template.md`: thêm Quick Checklist table trước Entry Points.
- Bump version 2.1.3 → 2.2.0 trong `package.json` và `START_HERE.md`.

## 2.1.3 - 2026-06-10

- Tách shared walk utility thành `lib/theme-walk.js`; loại bỏ code trùng lặp giữa `liquid_content_audit.js` và `settings_boundary_audit.js`.
- `settings_boundary_audit.js`: fix false positive cho `section.settings.X` bằng negative lookbehind; thêm parse section schema block để báo cáo số key nội tuyến.
- `qa_restyle_check.js`: thêm overflow detection mỗi viewport/page (`scrollWidth > innerWidth`), báo warn nếu tràn ngang.
- `workflow_final_guard.js`: đọc PNG header để validate đúng pixel dimensions (876x2000, 276x480), không chỉ check file tồn tại.
- `final_showcase_capture.js`: `resizeCrop` dùng `file://` URL thay data URI để tránh crash với fullpage screenshot lớn.
- `haravan_preflight_fallback.py`: thêm mojibake scan, check `settings_data.json`, báo file count summary, phân loại blocker/warn.
- `STITCH_PROMPT.template.md`: thêm Cart / Checkout page brief.
- `RESTYLE_PROGRESS_LEDGER.template.md`: thêm field Rollback reference.
- `INTERACTION_FLOW.*.template.json`: chuyển sang format `{"flows":[...]}` nhất quán với docs và QA script.
- `package.json`: bỏ `--root ..` redundant trong `audit:restyle`.

## 2.1.2 - 2026-06-09

- Bổ sung rule CSS cascade/source order/specificity: khi CSS mới bị rule cũ đè, phải kiểm tra vị trí load, computed style và rule cũ trước khi dùng `!important` hoặc selector nested sâu.
- Cập nhật intake/ledger/Stitch prompt để chặn pattern vá CSS sai layer và khuyến khích gỡ/di chuyển rule cũ đúng cách.

## 2.1.1 - 2026-06-09

- Siết gate rebuild theo approved design, cleanup CSS/JS orphan, dùng `page-width`/design token/global helper của theme.
- Bổ sung rule xử lý output Stitch/AI: strip CSS property dư, normalize icon/media size, bỏ reset/framework/comment rác trước khi ship.
- Scope audit script chỉ vào thư mục source theme để tránh false positive từ `.stitch`, artifact, `node_modules` hoặc chính `RESTYLE_MASTER_KIT`.
- Nâng `workflow_final_guard.js` để kiểm `final-showcase` screenshot, theme description fragment và zip optional.
- Bổ sung suppression popup newsletter trong final screenshot capture.

## 2.1.0 - 2026-06-03

- Nâng workflow/intake/ledger theo bản demo nhưng giữ canonical gọn hơn và an toàn hơn.
- Siết lại rule refactor-first, no hard fallback Liquid, no hard `1280px`, và Việt hóa toàn bộ storefront/admin copy.
- Thêm `Theme-Native First Contract`, `Agent Output Contract`, và gate rõ hơn cho final/checkpoint/next queue.
- Sửa `qa_restyle_check.js` để hỗ trợ flow reload control đúng scope và giảm fail nhiễu khi smoke test.

## 2.0.0 - 2026-06-03

- Rebuilt the kit as a clean canonical workflow for the next project.
- Tightened intake, workflow, ledger, and final rules around refactor-first, Vietnamese-only storefront copy, and no hard `1280px`.
- Changed final theme description guidance to a sales-focused editor fragment with no technical notes or duplicate headings.
- Added final screenshot capture rule: scroll lazy-load, dismiss transient popups, and review output before handoff.
