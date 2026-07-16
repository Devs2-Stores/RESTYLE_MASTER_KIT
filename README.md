# RESTYLE_MASTER_KIT

**Version:** 2.6.0

Bộ khung canonical để chạy dự án Haravan theme restyle từ đầu đến cuối.
Kit bao gồm workflow docs, audit scripts, QA automation, và final export tooling.

> **Mới mở project?** Bắt đầu ở `START_HERE.md` — landing canonical để chọn đúng luồng.
>
> **Khởi động project mới với agent?** Copy prompt từ `PROMPT.template.md`. 7 prompt mẫu sẵn (kickoff luồng A / resume / audit-led / single page / fix bug / final / kit health check).
>
> **Đã biết là Stitch full theme?** Đọc thẳng `FLOW_A.md` — cheat sheet 15 bước với lệnh copy-paste sẵn.
>
> **Muốn chọn luồng A/B/C/D?** Đọc `RUN_GUIDE.md` — playbook 4 luồng theo scenario.
>
> **Đã cài global skill `haravan-stitch-full-run`?** Có thể gọi skill đó như workflow conductor A-Z; nếu chưa, dùng `stitch:full` trực tiếp theo flow docs bên dưới.

---

## Bắt đầu nhanh

```powershell
cd RESTYLE_MASTER_KIT
npm install
node run_preflight.js --root <theme-root>
```

---

## Thứ tự chuẩn

1. **Intake** — điền `ISSUE_INTAKE.template.md`
2. **Fingerprint** — điền `THEME_FINGERPRINT.template.md` (có Quick Checklist)
3. **Refactor shared layer** — design system, container, token, font
4. **Asset / content / settings map**
5. **Page loop** — home → collection → product → blog → cart
6. **QA** — chạy `qa_restyle_check.js`
7. **Final showcase + export** — chạy `final_showcase_capture.js` + `final_theme_export.js`
8. **Cleanup + retrospective** — điền `RESTYLE_RETROSPECTIVE.template.md`

Chi tiết từng bước: xem `HARAVAN_THEME_RESTYLE_WORKFLOW.md`.

---

## Scripts

| Script | Dùng để | Command |
|---|---|---|
| `run_preflight.js` | Kiểm cấu trúc theme trước khi làm | `npm run preflight -- --root <path>` |
| `stitch_consume.js` | Strip CDN/Tailwind, follow linked CSS from HTML input, và trích candidate token từ Stitch export | `npm run stitch:consume -- --in <export> --out <scratch>` |
| `design_token_extract.js` | Map token Stitch vs theme token cũ, sinh `mapping.md`, `mapping.json`, `tokens.css`, `stitch-fidelity-token-map.json` | `npm run token:extract -- --theme <root> --stitch-tokens <tokens.json> --out <dir>` |
| `section_scaffold.js` | Gen Liquid section + snippet boilerplate từ JSON config | `npm run section:scaffold -- --config <config.json> --root <theme>` |
| `asset_pipeline.js` | Validate `asset-plan.json`, in lệnh generate cho asset thiếu | `npm run asset:plan -- --plan <plan.json> --root <path>` |
| `liquid_content_audit.js` | Quét anti-pattern trong Liquid/CSS/JS | `npm run audit:content -- --root <path>` |
| `settings_boundary_audit.js` | Kiểm settings.html vs Liquid usage | `npm run audit:settings-boundary -- --root <path>` |
| `css_token_audit.js` | Quét hardcode color/font/spacing chưa dùng token | `npm run audit:css-tokens -- --root <path>` |
| `audit:restyle` (combo) | Chạy 3 audit content + settings + css-tokens trong 1 lệnh | `npm run audit:restyle -- --root <path>` |
| `orphan_sweep.js` | Tìm asset/snippet/section không reference | `npm run orphan:sweep -- --root <path>` |
| `qa_restyle_check.js` | Screenshot + overflow + a11y cơ bản + flow QA | `npm run qa -- --base <preview-url>` |
| `a11y_deep.js` | axe-core deep scan (contrast, ARIA, keyboard, focus) | `npm run a11y:deep -- --base <preview-url> --paths /,...` |
| `stitch_pipeline_runner.js` | Single-entry Stitch → Haravan runner. Dry-run mặc định, execute chỉ chạy safe prefix và dừng ở checkpoint cần approval. | `npm run stitch:full -- --theme <theme> --stitch <export> [--base <preview-url>] [--execute]` |
| `perf_check.js` | Bundle size + Lighthouse (optional) | `npm run perf:check -- --root <path> [--lighthouse --base <url> --paths /]` |
| `visual_diff.js` | So sánh % pixel khác giữa baseline và preview | `npm run visual:diff -- --before <dir-or-url> --after <dir-or-url>` |
| `workflow_final_guard.js` | Gate cuối trước handoff | `npm run guard:final -- --root <path>` |
| `theme_push.js` | Wrapper Haravan CLI push (unpublished/live) | `npm run theme:push -- --root <path> [--target unpublished\|live]` |
| `final_showcase_capture.js` | Chụp final home showcase + multi-template pages (pages/* desktop-only mặc định) | `npm run final:capture -- --base <url> --all-templates --paths-file CAPTURE_PATHS.json` |
| `final_feature_capture.js` | Chụp desktop đúng vùng từng tính năng (selector/click/hover) cho PPTX | `npm run final:feature-capture -- --base <url> --out final-showcase --shots FEATURE_SHOTS.json` |
| `final_feature_deck.js` | Build PPTX tính năng nổi bật từ FEATURES.json + screenshots | `npm run final:pptx -- --out <final-showcase>` |
| `final_theme_export.js` | Export theme zip qua Haravan CLI | `npm run final:export -- --root <path>` |

### Chạy một entrypoint full-flow có checkpoint

```powershell
# Full-theme dry-run: in full flow, ghi plan artifact, chưa chạy script nào
npm run stitch:full -- --theme <theme> --stitch <stitch-export> --base <preview-url> --mode full-theme

# Full-theme execute: chỉ chạy deterministic safe prefix, rồi dừng ở checkpoint đầu tiên cần approval
npm run stitch:full -- --theme <theme> --stitch <stitch-export> --base <preview-url> --mode full-theme --execute

# Single-page dry-run
npm run stitch:full -- --theme <theme> --stitch <single-screen-export> --mode single-page

# Audit-led dry-run (không có Stitch)
npm run stitch:full -- --theme <theme> --base <preview-url> --mode audit-led
```

Nếu **chưa có Stitch export**, generate/export trước bằng `/ck:stitch`, rồi mới đưa output đó vào `stitch:full` runner-conversion stage.

Lưu ý: đây **không phải** one-click blind automation. Runner sẽ dừng ở các checkpoint như asset approval, stitch gap resolution, permission boundary, và visual approval.

### Chạy full audit một lần

```powershell
node liquid_content_audit.js --root <theme-root>
node settings_boundary_audit.js --root <theme-root>
node css_token_audit.js --root <theme-root>
```

### QA với interaction flow

```powershell
# 1. Copy template và điền selector thật
Copy-Item INTERACTION_FLOW.product.template.json scratch/qa/flow-product.json
# 2. Edit selector trong file vừa copy
# 3. Chạy
node qa_restyle_check.js --base <preview-url> --paths /products/my-product --flow scratch/qa/flow-product.json --out scratch/qa
```

---

## Audit Patterns

### liquid_content_audit.js

| Rule | Severity | Mô tả |
|---|---|---|
| `HARD_1280` | blocker | Hardcode 1280px |
| `MOJIBAKE` | blocker | Ký tự encode sai |
| `HREF_HASH` | warn | Anchor `href="#"` placeholder |
| `JS_VOID` | warn | `javascript:void(0)` |
| `STITCH_LEAK` | warn | Label Stitch lọt ra storefront |
| `DEMO_COPY` | warn | Lorem ipsum / demo content |
| `FALLBACK_COPY` | warn | Fallback/default copy |
| `LOW_VALUE_COMMENT` | warn | TODO/FIXME/stale comment |
| `IMPORTANT_ABUSE` | warn | `!important` usage |
| `HARDCODE_COLOR` | warn | Hex color chưa dùng token |
| `HARDCODE_FONT` | warn | font-family hardcode |
| `INLINE_STYLE` | warn | Inline style dài |
| `ENGLISH_HARDCODE` | warn | Copy tiếng Anh chưa Việt hóa |

### css_token_audit.js

| Rule | Severity | Mô tả |
|---|---|---|
| `HARDCODE_COLOR_HEX` | warn | Hex color trong CSS property |
| `HARDCODE_COLOR_RGB` | warn | rgb/rgba hardcode |
| `HARDCODE_FONT_SIZE` | warn | font-size hardcode |
| `HARDCODE_SPACING` | warn | margin/padding >= 10px hardcode |
| `HARDCODE_BORDER_RADIUS` | warn | border-radius hardcode |
| `HARDCODE_FONT_FAMILY` | warn | font-family hardcode |
| `MAGIC_ZINDEX` | warn | z-index magic number |
| `HARDCODE_TRANSITION` | warn | transition duration hardcode |

### settings_boundary_audit.js

| Rule | Severity | Mô tả |
|---|---|---|
| `MISSING_SETTINGS_BOUNDARY` | blocker | `settings.X` dùng trong code nhưng không có trong `settings.html` |
| `ORPHAN_SETTING` | warn | Setting định nghĩa trong `settings.html` nhưng không dùng ở đâu |

---

## QA Output

Sau khi chạy `qa_restyle_check.js`, output trong `scratch/qa/`:

- `qa-results.json` — full data gồm overflow, a11y issues, console errors, flow results
- `qa-results.md` — markdown report + A11y Detail section
- `*.png` — screenshot từng page/viewport

---

## Final Artifacts

Sau khi chạy final scripts, output trong `final-showcase/`:

- `Trang chủ.png` — home desktop crop 876×2000 (guard contract; legacy `desktop-876x2000.png` still accepted)
- `Trang chủ-mobile.png` — home mobile crop 276×480 (legacy `mobile-276x480.png` still accepted)
- `Trang chủ-fullpage.png` / `Trang chủ-mobile-fullpage.png` — home fullpage raw
- `pages/Trang ….png` — multi-template captures with **Vietnamese labels** (e.g. `Trang chi tiết sản phẩm.png`; mobile optional `…-mobile.png` via `--mobile-pages`)
- `features/*.png` — feature-region desktop shots (`final:feature-capture` + `FEATURE_SHOTS.json`)
- `CAPTURE_MANIFEST.json` / `CAPTURE_PATHS.json` — path map + capture log
- `THEME_DESCRIPTION.html` — HTML fragment sales-focused
- `FEATURES.json` + `<brand>-features.pptx` — deck tính năng nổi bật (`final:pptx`)
- `*.zip` — theme export (nếu dùng `final_theme_export.js`)

`workflow_final_guard.js` block handoff nếu thiếu home PNG, PNG hỏng/kích thước sai, hoặc `THEME_DESCRIPTION.html` chưa chuẩn. Thêm `--require-pptx` / `--require-zip` khi handoff cần deck/zip.

---

## Luồng Stitch → Haravan end-to-end

```powershell
# 1. Preflight theme đích
npm run preflight -- --root <theme>

# 2. Consume Stitch design (strip CDN/Tailwind, extract token)
npm run stitch:consume -- --in <stitch-export-folder> --out scratch/stitch/home

# 3. Lập asset plan (copy template rồi điền), validate
Copy-Item asset-plan.template.json scratch/asset-plan.json
# ...edit scratch/asset-plan.json...
npm run asset:plan -- --plan scratch/asset-plan.json --root <theme>

# 4. (Đọc STITCH_FIDELITY.md trước khi code)
# 5. Implement section-by-section, theo Stitch Fidelity Contract.

# 6. Audit static
npm run audit:restyle -- --root <theme>

# 7. Tìm orphan
npm run orphan:sweep -- --root <theme>

# 8. Push dev smoke test
npm run theme:push -- --root <theme> --target unpublished

# 9. QA preview Puppeteer
npm run qa -- --base <preview-url> --paths /,/collections/all,/products/sample

# 10. Visual diff so với baseline (nếu có)
npm run visual:diff -- --before scratch/baseline --after <preview-url> --paths / --capture

# 11. Final
npm run final:capture -- --base <preview-url> --all-templates --paths-file final-showcase/CAPTURE_PATHS.json
# Feature-region desktop shots for PPTX (not full-page crops)
# Copy FEATURE_SHOTS.template.json → final-showcase/FEATURE_SHOTS.json and set real selectors
npm run final:feature-capture -- --base <preview-url> --out final-showcase --shots final-showcase/FEATURE_SHOTS.json
# Eyeball features/* ; fill FEATURES.json (title/body/bullets/image) from FEATURES.template.json
npm run final:pptx -- --out final-showcase
npm run final:export -- --root <theme>
npm run guard:final -- --root <theme> --require-pptx
```

---

## Templates

| File | Dùng khi nào |
|---|---|
| `ISSUE_INTAKE.template.md` | Đầu mỗi project/task |
| `THEME_FINGERPRINT.template.md` | Trước khi code — audit theme đích |
| `STITCH_PROMPT.template.md` | Tạo design screen qua Stitch MCP |
| `STITCH_FIDELITY.md` | Contract chống agent tự chế khi implement Stitch |
| `RESTYLE_PROGRESS_LEDGER.template.md` | Tracking progress xuyên suốt project |
| `RESTYLE_RETROSPECTIVE.template.md` | Sau khi xong project |
| `INTERACTION_FLOW.*.template.json` | Smoke test interaction sau restyle |
| `asset-plan.template.json` | Khai báo asset cần generate trước khi code |
| `THEME_DESCRIPTION.template.html` | Viết mô tả theme cho Haravan admin |
| `CAPTURE_PATHS.template.json` | Map path multi-template cho `final:capture --all-templates` |
| `FEATURES.template.json` | List tính năng nổi bật → `final:pptx` |

---

## Nâng phiên bản kit

Xem `UPGRADE.md`.

---

## Quy tắc khóa

- Refactor shared layer trước khi thay asset mới.
- Không QA toàn theme trước khi refactor xong.
- Không hard text/demo/fallback trong Liquid trừ system/action label.
- Toàn bộ copy storefront/admin phải Việt hóa.
- Không hardcode `1280px` — dùng `page-width`/container setting.
- Không sửa `config/settings_data.json` nếu chưa có permission.
