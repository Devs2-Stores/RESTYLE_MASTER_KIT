# Restyle Master Kit

KIT_VERSION: 2.4.2

Đây là bộ khung canonical để bắt đầu một dự án Haravan theme mới.

## Bắt đầu chạy ngay

Khởi động project mới với agent? **Copy prompt từ `PROMPT.template.md`** — có sẵn 7 prompt mẫu (kickoff luồng A, resume, audit-led, single page, fix bug, final handoff, kit health check).

Nếu đã cài global skill `haravan-stitch-full-run`, có thể dùng skill đó như workflow conductor A-Z; nếu chưa, dùng prompt templates + `stitch:full` trực tiếp.

### Chọn đúng luồng trước

| Tình huống | Vào đâu trước |
|---|---|
| Mới mở project, chưa biết đi luồng nào | `RUN_GUIDE.md` |
| Muốn 1 command full-run có checkpoint | `npm run stitch:full -- --theme <theme> --stitch <export> [--base <preview-url>] --mode full-theme` *(nếu chưa có export: generate trước bằng `/ck:stitch`)* |
| Stitch full theme | `FLOW_A.md` |
| Stitch chỉ 1 page | `RUN_GUIDE.md` → Luồng B |
| Audit-led, không có Stitch | `RUN_GUIDE.md` → Luồng C |
| Resume project dở dang | `RUN_GUIDE.md` → Luồng D + ledger (+ `stitch-pipeline-plan.json` nếu có) |
| Cần contract chống lệch design | `STITCH_FIDELITY.md` |

Nếu muốn đọc tài liệu trực tiếp:
- `FLOW_A.md` — cheat sheet luồng A Stitch full theme (15 bước + lệnh sẵn)
- `RUN_GUIDE.md` — playbook 4 luồng A/B/C/D
- `STITCH_FIDELITY.md` — đọc bắt buộc trước khi implement Stitch

## Khi nào dùng

- Restyle theme hiện có.
- Làm full theme từ approved design / Stitch / Figma.
- Cần intake, refactor, QA, final export, và retrospective có trật tự.

## File chính

1. `RUN_GUIDE.md` — playbook bắt đầu, đọc đầu tiên khi chưa rõ luồng
2. `FLOW_A.md` — cheat sheet riêng cho luồng A Stitch full theme (lệnh sẵn + Stitch gap checklist)
3. `PROMPT.template.md` — 7 prompt mẫu copy-paste khi khởi động agent
4. `ISSUE_INTAKE.template.md`
5. `THEME_FINGERPRINT.template.md`
6. `STITCH_PROMPT.template.md`
7. `STITCH_FIDELITY.md` — contract chống agent tự chế khi implement Stitch
8. `HARAVAN_THEME_RESTYLE_WORKFLOW.md`
9. `RESTYLE_PROGRESS_LEDGER.template.md`
10. `RESTYLE_RETROSPECTIVE.template.md`
11. `FLOW_AUTHORING.md`
12. `qa_restyle_check.js`
13. `final_showcase_capture.js`
14. `final_theme_export.js`
15. `workflow_final_guard.js`
16. `liquid_content_audit.js`
17. `settings_boundary_audit.js`
18. `css_token_audit.js`
19. `audit_restyle.js` — combo 3 audit
20. `stitch_consume.js` — strip CDN/Tailwind, extract token
21. `asset_pipeline.js` + `asset-plan.template.json`
22. `orphan_sweep.js`
23. `visual_diff.js`
24. `theme_push.js`
25. `run_preflight.js`
26. `haravan_preflight_fallback.py`
27. `package.json`

## Nếu dùng Stitch MCP

- Nếu đã có Stitch project/screen, lấy project/screen trước bằng MCP.
- Nếu cần tạo screen mới, dùng `STITCH_PROMPT.template.md` làm prompt gốc rồi gọi `generate_screen_from_text`.
- Nếu chỉ sửa nhỏ, ưu tiên `edit_screens` thay vì regenerate.
- Stitch là nguồn visual/design; không ship raw code/Tailwind/font/icon/placeholder trực tiếp từ Stitch.
- **Sau khi có Stitch design, đọc `STITCH_FIDELITY.md` trước khi implement**. Đây là contract chống tự chế ra layout/section/copy/màu khác Stitch. Mọi deviation phải có lý do hợp lệ và ghi vào ledger.
- Chạy `node stitch_consume.js --in <stitch-export> --out scratch/stitch/<screen>` để strip CDN/Tailwind và extract token candidate.

## Thứ tự chuẩn

1. Intake
2. Fingerprint
3. Refactor shared layer
4. Asset / content / settings map
5. Page loop
6. QA
7. Final showcase + export
8. Cleanup + retrospective

## Quy tắc khóa

- Refactor shared layer/design system trước khi thay asset mới.
- Không QA toàn theme trước refactor. Chỉ baseline/preflight.
- Không hard text/demo/fallback trong Liquid, trừ system/action label cần hardcode.
- Toàn bộ copy storefront/admin phải Việt hóa.
- Không hardcode `1280px`; map qua `page-width`/container setting hoặc target 1920 nếu user yêu cầu.
- Generated code từ AI/Stitch phải chuyển về theme-native Liquid/CSS/JS.
- **Khi có Stitch design, bưng nguyên Stitch (section list, layout, copy, color, font, spacing, component, icon family). Mọi deviation phải có 1 trong 5 lý do hợp lệ ở `STITCH_FIDELITY.md` và ghi vào ledger.** Không được "thêm cho đẹp", "bỏ vì không thiết yếu", "đổi màu cho nổi", "đổi layout cho hiện đại".
- Layout mới theo approved design phải rebuild module sạch theo design 100%, không chồng CSS/HTML mới lên block cũ.
- Khi thay CSS/JS block mới, xóa block cũ đã orphan sau khi kiểm tra selector/dependency để tránh phình asset. Dùng `orphan_sweep.js` để liệt kê.
- Khi CSS mới không ăn, kiểm tra source order/cascade/specificity trước: đặt block mới sau rule cũ hoặc xóa rule cũ đúng cách; không vá bằng `!important`/nested selector quá sâu nếu chưa xác minh nguyên nhân.
- Ưu tiên class/biến global của theme như `page-width`, token màu/font/spacing, helper/card/snippet sẵn có.
- Khi cần asset demo, dùng `asset_pipeline.js` + `asset-plan.json` chuẩn hóa nguồn (`demo-image-assets`/`magnific`/`iconify`); không để asset thô, placeholder, hoặc ảnh sai ratio vào `assets/`.
- CSS từ Stitch/AI phải strip property dư (chạy `stitch_consume.js` trước), normalize icon `width`/`height`/`flex`, reset font/spacing/contrast theo design system trước khi ship.
- Không giữ comment rác/TODO/Stitch note không có giá trị trong Liquid/CSS/JS.
- Không sửa `config/settings_data.json` nếu chưa có permission hiện tại.
- Nếu có bản demo/old version tốt hơn, chỉ dùng để nâng cấp rule; không được lùi về bản giản lược hơn nếu làm mất gate.
- Nếu chưa xong, nói `Checkpoint - chưa final` và ghi `next queue`.

## Skill map theo phase

| Phase | Skill nên dùng | Ghi chú |
|---|---|---|
| Scout / fingerprint | `scout`, `haravan-audit`, `ck:debug` | Dùng khi theme lạ hoặc preflight fail |
| Stitch / design | `stitch`, `frontend-design`, `ai-multimodal` | Dùng để tạo/đọc/critique visual source |
| Merge implementation | `haravan-liquid`, `haravan-pages`, `haravan-settings`, `ck:cook` | `ck:cook` / settings chỉ nên dùng sau khi design đã chốt |
| QA / fix | `web-testing`, `haravan-accessibility`, `haravan-performance`, `ck:debug` | Dùng khi preview gate fail |
| Final handoff | `haravan-preview-screenshot`, `ck:code-review`, `project-management`, `copywriting` | Dùng cho screenshot, review, sync-back, theme description |

## Final artifacts

Khi user yêu cầu final/showcase/theme description:

- `final-showcase/desktop-876x2000.png`
- `final-showcase/mobile-276x480.png`
- `final-showcase/desktop-fullpage-raw.png`
- `final-showcase/mobile-fullpage-raw.png`
- `final-showcase/THEME_DESCRIPTION.html`
- `final-showcase/ivory-gem-final-theme.zip`

## Final screenshot rule

- Phải scroll qua toàn trang để kích hoạt lazy-load.
- Phải prime `data-src`/`data-srcset`/background image trước khi chụp.
- Phải đóng popup/modal transient nếu nó che hero hoặc nội dung chính.
- Phải xem lại ảnh output trước handoff. Nếu còn placeholder/ô trắng/popup che nội dung thì chụp lại.

## Theme description rule

- File mô tả là HTML fragment để paste vào editor, không phải full document.
- Không dùng `doctype`, `<html>`, `<head>`, `<body>`, CDN, hoặc wrapper kỹ thuật.
- Nội dung phải mang giọng giới thiệu thương hiệu, tập trung vào niềm tin và lợi ích mua theme.
- Chỉ nên có một tiêu đề chính, tránh lặp heading.

## Chuyển sang dự án mới

- Copy kit này ra một thư mục riêng ngoài project.
- Không mang theo `scratch/`, `output/`, `node_modules/`, hay artifact tạm.
- Chỉ giữ source theme, `final-showcase/`, và kit canonical.
