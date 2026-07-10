# Haravan Theme Restyle Workflow

Tài liệu này là canonical cho mọi dự án Haravan theme mới. Nếu có bản demo hoặc bản cũ chi tiết hơn, chỉ lấy phần rule mạnh hơn để nâng cấp. Không được lùi về bản giản lược nếu làm mất gate, QA, ledger hoặc final contract.

## Agent Entry Point

Khi user nói "đọc workflow", "làm theo workflow", "restyle theme", "làm lại từ Stitch", hoặc yêu cầu tương tự, agent phải dùng tài liệu này như source of truth cho thứ tự chạy.

- Nếu prompt là câu hỏi/đánh giá/brainstorm, trả lời trước rồi mới hành động.
- Nếu prompt là yêu cầu làm/sửa/refactor, tóm tắt hiểu biết trong 3-6 dòng trước khi chạy dài.
- Nếu thiếu issue source, scope, quyền sửa data/settings, asset source hoặc preview URL, hỏi tối đa 1-3 câu ngắn.
- Nếu user nói "tự quyết", dùng default an toàn nhưng phải ghi assumption vào ledger/report.
- Nếu user chỉ trỏ vào `RESTYLE_MASTER_KIT`, đọc `START_HERE.md` trước rồi quay lại file này.

## Nguyên tắc chung

- Refactor shared layer trước khi thay asset mới vào code cũ.
- Không QA toàn theme trước khi refactor xong. Chỉ được baseline/preflight.
- Không hard text, hard content, default content hoặc fallback trong Liquid, trừ system/action labels cần hardcode.
- Toàn bộ copy storefront/admin phải Việt hóa.
- Không hardcode `1280px`; map qua `page-width`/container setting hoặc dùng 1920 nếu user yêu cầu rõ.
- Generated code từ Stitch/AI phải được chuẩn hóa về theme-native Liquid/CSS/JS.
- Layout mới từ design phải rebuild thành module sạch theo design 100%, không replace/overwrite nửa vời vào layout cũ.
- Khi thay CSS/JS, xóa selector/init/block orphan đã xác minh không còn dùng để tránh phình asset và double-init.
- Với CSS mới, phải kiểm tra vị trí load, source order, cascade và specificity của rule cũ trước khi kết luận CSS lỗi. Ưu tiên đặt rule mới đúng layer/sau rule cũ hoặc gỡ rule cũ đã orphan; không lạm dụng `!important` hay nested selector quá sâu để thắng cascade.
- CSS/JS từ Stitch/AI phải strip property dư, normalize icon/media size, và reset font/spacing/contrast theo design system trước khi ship.
- Ưu tiên global class/biến theme như `page-width`, token màu/font/spacing, helper/card/snippet sẵn có.
- Asset demo mới phải đi qua `demo-image-assets`/`magnific`, đúng ratio/kích thước trước khi đưa vào theme `assets/`.
- Không sửa `config/settings_data.json` nếu chưa có permission hiện tại.
- Nếu có demo/reference mạnh hơn, phải coi đó là nguồn nâng cấp, không phải lý do để làm thấp hơn.

## 0. Master Preflight Trước Goal Dài

Mục tiêu của phần này là chốt đủ thông tin ngay từ đầu để tránh hỏi lắt nhắt giữa chừng.

### 0.1. Nguồn vấn đề / input task

1. Nguồn chính là gì?
   - Stitch export/design
   - user issue list/checklist
   - screenshot/video feedback
   - preview/live storefront
   - audit/QA/Lighthouse report
   - ticket/comment từ team/khách
   - tự audit toàn theme
2. Nếu nhiều nguồn, source of truth khi mâu thuẫn là gì?
3. Agent có được tự phát hiện thêm issue ngoài danh sách không?

### 0.2. Scope

1. Scope lần này là gì?
   - chỉ home
   - home + global components
   - một số page con
   - full theme
2. Những template nào bắt buộc phải làm?
3. Những template/snippet nào không được đụng?
4. Có được giữ layout cũ hay phải redesign?

### 0.3. Quyền sửa và cleanup

1. Có được sửa `config/settings_data.json` không?
2. Có được xóa asset/snippet/settings cũ không?
3. Có được gọi API/admin để sửa data không?
4. Có được push/sync theme không?
5. File cũ không còn dùng được xóa luôn hay chỉ report danh sách?

### 0.4. Brand / data / asset

1. Brand thuộc ngành nào, tone nào, khách hàng mục tiêu nào?
2. Có brand guideline, logo, font, màu, website tham khảo không?
3. Store hiện có data chưa: product, collection, blog, article, page, menu?
4. Nếu data thiếu, có được tạo demo data không?
5. Asset dùng nguồn nào, có cần không chữ không, size/ratio nào quan trọng?
6. Icon dùng nguồn nào: existing icon, Flaticon/Freepik, Iconify hay SVG custom?

### 0.5. Admin / settings / deploy / QA

1. Mức dynamic mong muốn là gì?
2. Section nào cần toggle, collection/blog/page/menu picker, preview image?
3. User đang chạy `haravan theme dev` chưa?
4. Có preview URL/theme ID cụ thể không?
5. Viewport và flow nào bắt buộc test?
6. Có cần screenshot evidence và final report không?

### 0.6. Cách gom câu hỏi để không làm phiền user

- Gom tối đa 3 câu nếu chưa đủ input.
- Câu hỏi phải ngắn, có thể trả lời nhanh.
- Nếu prompt đã có câu trả lời, không hỏi lại.

### 0.7. Default assumptions nếu user cho phép tự quyết

- Ưu tiên giữ structure hợp lý và sửa visual sạch trước.
- Nếu thiếu asset, dùng reuse hoặc generate đúng nguồn được phép.
- Nếu thiếu data, chỉ tạo demo ở đúng boundary cho phép.
- Nếu thiếu preview URL nhưng có local build, dùng local preview trước.

### 0.8. Decision tree chọn workflow

1. Chỉ home -> làm home workflow.
2. Home + shared components -> làm home trước rồi global.
3. Full theme -> fingerprint, refactor shared layer, rồi từng page.
4. Có Stitch source -> nhập visual design rồi normalize về theme-native.

### 0.9. Risk gates bắt buộc

- Sau audit theme: không được biến audit thành rewrite mù.
- Trước khi xóa cleanup: phải biết file nào là orphan thật.
- Trước khi thêm `!important`/selector nặng: phải kiểm tra CSS load order, computed style, rule nào đang đè và có thể di chuyển/gỡ rule cũ không.
- Trước khi dynamic hóa: phải biết content boundary là gì.
- Trước khi sửa `settings_data.json`: phải có permission rõ.
- Trước khi push/sync: phải có checkpoint hoặc rollback.

### 0.10. Definition of Done theo scope

- Done nếu chỉ đổi home: home đúng design, responsive ổn, QA pass, final screenshot pass.
- Done nếu đổi home + global: home pass + header/footer/global pass + không phá page khác.
- Done nếu đổi full theme: từng page trọng yếu pass, content rule pass, final artifact đủ.

### 0.11. Kickoff template để hỏi user trước khi chạy goal

`Nguồn vấn đề lấy từ đâu, scope cụ thể là gì, và có được sửa settings/data hay không?`

### 0.12. Execution protocol cho agent

#### Trước khi sửa file

- Đọc theme thật trước.
- Làm fingerprint trước khi code.
- Chốt asset/content boundary trước khi thay asset.

#### Trong khi làm

- Làm shared layer trước.
- Sau mỗi batch lớn, cập nhật ledger.
- Không QA toàn theme khi còn đang refactor.

#### Sau mỗi batch lớn

- Ghi file đã đổi.
- Ghi blocker nếu có.
- Ghi next queue nếu chưa final.

### 0.13. Evidence matrix bắt buộc khi tự nhận xong

- Desktop screenshot đã xem lại.
- Mobile screenshot đã xem lại.
- Console error đã kiểm.
- Network lỗi đã kiểm.
- Overflow/responsive đã kiểm.
- Final description đã đúng dạng editor fragment.

### 0.14. QA matrix theo trang

- Desktop: 320, 375, 768, 1024, 1440.
- Flow: menu, search, filter/sort, variant, add cart, cart, form, slider.

## A. Workflow: Home Only

1. Intake source, scope, permission, asset, preview.
2. Audit theme đích để biết container, font, slider, card, settings, JS lifecycle.
3. Cleanup trang chủ cũ nếu cần, nhưng không xóa rộng khi chưa biết dependency.
4. Lập asset plan trước khi thay ảnh.
5. Static Liquid first: dựng structure sạch trước, chưa dynamic hóa vội.
6. Scoped CSS/JS: chỉ tác động đúng module đang sửa.
7. Include asset theo pattern theme có sẵn.
8. Settings admin: map copy/ảnh/link vào đúng setting nếu có thể.
9. Dynamic hóa sau khi static layout ổn.
10. Seed demo chỉ khi cần preview.
11. QA desktop/mobile + final screenshot.

## B. Workflow: Full Theme

1. Chốt brand direction và mức redesign.
2. Inventory toàn theme: layout, templates, snippets, assets, settings, script, icon, font.
3. Lập scope matrix cho từng page và shared component.
4. Normalize design foundation: container, spacing, font, color, button, card.
5. Làm header/menu/footer trước vì đây là global surface dễ vỡ.
6. Làm product card system rồi collection.
7. Làm product detail, blog/article/page, cart/search/other UI.
8. Đồng bộ settings admin toàn theme nếu cần.
9. Chốt data/API nếu user cho phép.
10. QA full matrix trước final.

## C. Workflow: Google Stitch / Visual Source

> Bắt buộc đọc `STITCH_FIDELITY.md` trước khi implement. Mục đó là contract chống agent tự chế ra layout/section/copy/màu khác Stitch.

1. Dùng Stitch để lấy direction visual, không ship raw Tailwind/CDN/placeholder trực tiếp.
2. Chạy `node stitch_consume.js --in <stitch-export> --out scratch/stitch/<screen>` để strip CDN, extract token candidate.
3. Đọc `scratch/stitch/<screen>/report.md`: confirm token color/font/spacing trước khi map vào theme `:root`.
4. Lập **Stitch inventory + mapping table** trong ledger: từng section Stitch → từng `sections/*.liquid` + snippet.
5. Lập **asset-plan.json**: list mọi image slot Stitch, ratio, nguồn. Chạy `node asset_pipeline.js --plan scratch/asset-plan.json --root <theme>` để biết asset nào missing/wrong-size.
6. Nếu design có 1280, map sang `page-width`/container hoặc 1920 theo rule đã chốt.
7. Token/font/icon phải hợp với theme hiện tại; không tạo hệ mới nếu hệ cũ đủ dùng. Tên token dùng default `--color-primary/surface/text/muted/border/accent/sale/success`.
8. Asset placeholder phải đổi sang asset thật hoặc asset demo đúng kích thước qua `asset_pipeline.js`.
9. Content demo phải chuyển vào settings/data thật nếu có boundary phù hợp.
10. Animation/JS của Stitch phải đổi sang helper/theme-native.
11. Markup phải sạch: không dư wrapper, không để text demo kỹ thuật lộ ra storefront.
12. CSS generated phải được lọc lại thủ công: bỏ property không có tác dụng, giới hạn icon/SVG/media size, không giữ reset/framework lạ.
13. Implement section-by-section. Sau mỗi section, so sánh thị giác với Stitch screen tương ứng. Nếu lệch không có lý do trong allowed deviation, **dừng và hỏi user trước khi tiếp tục**.
14. Khi xong page, chạy `node visual_diff.js --before <baseline-dir> --after <preview-url> --paths <list>` để đo % regression so với Stitch reference (nếu có baseline) hoặc so với checkpoint cũ.
15. Trước khi push, chạy `node orphan_sweep.js --root <theme>` để gỡ asset/snippet/section orphan đã thay thế.
16. Push dev qua `node theme_push.js --target unpublished` smoke test trước khi final.

## D. Theme-Native First Contract

- Ưu tiên reuse library/helper/snippet/settings đang có trong theme.
- Chỉ tạo mới khi fingerprint chứng minh theme chưa có pattern dùng được.
- Nếu có slider, icon, product card, article card, settings pattern hoặc JS lifecycle sẵn thì phải bám vào pattern đó.
- Mọi generated code phải được normalize về Liquid/CSS/JS của theme đích.

## E. Agent Output Contract

- Sau mỗi phase lớn, báo rõ đã làm gì, file nào đổi, còn gì pending.
- Nếu chưa final, phải nói rõ `Checkpoint - chưa final` và `next queue`.
- Khi final, phải có: final screenshot đã review, description sales-focused, artifact nằm đúng `final-showcase/`, và export zip nếu user yêu cầu.
- Không kết luận xong nếu còn asset placeholder, hard fallback Liquid, overflow, hoặc copy chưa Việt hóa.

## F. Anti-patterns Cần Chặn

- Sửa asset trước khi refactor shared layer.
- QA toàn theme quá sớm.
- Dùng hard text/demo/default content trong Liquid để đỡ phải làm settings.
- Hardcode `1280px` thay vì dùng container/page-width.
- Chèn CSS mới sai vị trí rồi vá bằng `!important`/nested quá sâu thay vì xử lý source order hoặc xóa rule cũ.
- Chuyển code Stitch sang code theme mà giữ nguyên framework/placeholder/cdn.
- Chụp final khi ảnh chưa load xong hoặc popup còn che nội dung chính.
- **Tự chế khi implement Stitch**: thêm/bỏ/hoán đổi section, đổi copy/màu/font/spacing/icon family/layout grid mà không có deviation log. Xem `STITCH_FIDELITY.md`.

## G. Handoff Report Template

- Scope đã làm:
- File đã đổi:
- QA đã chạy:
- Blocker còn lại:
- Next queue:
- Final status:

## H. Scoring Rubric: Khi Nào Đạt 10/10

- Refactor trước asset.
- Content rule không vỡ.
- UI đúng theme-native.
- Desktop/mobile ổn.
- Final artifact đủ và sạch.
- Không còn demo/fallback kỹ thuật lộ ra storefront.

## I. Kit Scripts Reference

Chạy từ bên trong thư mục `RESTYLE_MASTER_KIT/`. Tất cả script có `--help` và `--root <path>`.

| Script | Mục đích | Khi nào chạy |
|---|---|---|
| `run_preflight.js` | Kiểm cấu trúc theme | Trước khi bắt đầu |
| `stitch_consume.js` | Strip CDN/Tailwind, extract token candidate từ Stitch export | Ngay sau khi nhận Stitch design |
| `asset_pipeline.js` | Validate `asset-plan.json`, in lệnh generate cho asset thiếu | Sau Stitch consume, trước khi viết Liquid |
| `liquid_content_audit.js` | Quét anti-pattern Liquid/CSS/JS | Sau refactor, trước QA |
| `settings_boundary_audit.js` | Kiểm `settings.html` vs Liquid usage | Sau khi thêm setting mới |
| `css_token_audit.js` | Quét hardcode color/font/spacing | Sau refactor CSS |
| `audit_restyle.js` | Combo 3 audit trên (1 lệnh, share argv) | Trước QA và trước final |
| `orphan_sweep.js` | Tìm asset/snippet/section không reference | Sau refactor, trước push |
| `qa_restyle_check.js` | Screenshot + overflow + a11y + flow | QA chính |
| `visual_diff.js` | So sánh % pixel khác giữa baseline và preview | Sau mỗi page hoặc trước final |
| `workflow_final_guard.js` | Gate cuối trước handoff | Trước final |
| `theme_push.js` | Wrapper Haravan CLI push (unpublished/live) | Smoke test dev hoặc deploy |
| `final_showcase_capture.js` | Chụp final desktop/mobile screenshot | Final |
| `final_theme_export.js` | Export theme zip | Final |

Chạy full audit:

```powershell
node liquid_content_audit.js --root <theme-root>
node settings_boundary_audit.js --root <theme-root>
node css_token_audit.js --root <theme-root>
```

Chạy QA:

```powershell
node qa_restyle_check.js --base <preview-url> --paths /,/collections/all,/products/sample
```

Chạy final gate:

```powershell
node workflow_final_guard.js --root <theme-root>
```
