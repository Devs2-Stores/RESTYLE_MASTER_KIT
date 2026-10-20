# Changelog

## 2.12.1 - 2026-10-20

- **`lib/receipt-audit.js`**: content index chỉ giữ mtime cũ cho file có bytes không đổi khi không có receipt nào được ghi giữa lần kiểm tra trước và mtime hiện tại. Trước đây chuỗi sửa A → B → chạy QA → trả về A làm receipt đo B được tính là còn mới. Index lên `version: 2` (thêm `checkedAtMs`); index cũ được coi như chưa có.
- **`.gitignore`**: giữ lại fixture `test/mock-theme/.haravan-cli_local.json` (shop/theme id giả); thiếu file này thì test `stitch_pipeline_runner execute` hỏng trên bản checkout sạch.

## 2.12.0 - 2026-10-20

Bỏ ngưỡng 44px cho control/vùng chạm mobile (quyết định của user). Còn lại: chữ ≥ 12px, vùng chạm ≥ 24px (WCAG 2.2 SC 2.5.8), control cùng vai trò trong một hàng cao bằng nhau.

- **`registry/thresholds.json`**: chỉ còn `minTextPx` (12) và `minTapHitPx` (24); bỏ `minControlPx` và `tapSpacingCirclePx`. `lib/registry.js` và `lib/registry-probes.browser.js` đọc đúng hai key này; contract khai `typeScale.minControlPx` giờ bị từ chối là key lạ.
- **Probe `control-height-band`**: chỉ báo control cùng vai trò (cùng cha, cùng tag + class đầu) lệch chiều cao > 1px; không còn dải 24-44px ở touch width. **Probe `tap-target-hit-area`**: báo vùng chạm < `minTapHitPx`, bỏ nhánh vòng tròn giãn cách.
- **`lib/remake-contract.js`**: `designDefaults.typeScale` chỉ nhận `{ minTextPx }`; `controlHeight.mobile` chỉ cần là số px dương, không còn sàn 44.
- **`qa_restyle_check.js`**: `--min-tap-target-px` mặc định 24.
- Template contract, `NEW_THEME_MASTER_PROMPT.md`, `PROMPT.template.md`, `STITCH_PROMPT.template.md` và `registry/guidance-assertions.json` đổi theo; fixture `control-height-band-good` là hai nút 36px bằng nhau, bỏ `control-height-band-mismatch-bad` (trùng với `-bad`).
- Contract 6 theme devs2 (Sky Fashion, Pet House, Glam Studio, Active Fit, Melody House, Corporate) đã bỏ `typeScale.minControlPx`.

## 2.11.0 - 2026-10-19

Vá các lỗ hổng khiến `guard:final --require-pre-showcase` không thể PASS dù dữ liệu đạt (S2 Corporate, S2 Active Fit).

- **`pre_showcase_gate.js` / `workflow_final_guard.js`**: thêm `--navigations <file>` (guard chuyển tiếp như `--config/--base/--theme-id`) và chuyển cho `HaravanDemoKit readiness`. Không truyền thì dùng `<demo-kit>/output/<project_key>/navigations.json` (đọc `project_key` từ `--config`) nếu file tồn tại; thiếu cả hai thì menu-depth vẫn là `UNMEASURED`.
- **`final_showcase_capture.js`**: sau khi nạp lazy asset, đo trong trang mọi `<img>` đang hiển thị có src (`total`, `broken` = ảnh `naturalWidth 0` hoặc chưa tải xong; SVG inline bị loại, như bước chờ settle) và ghi `imageHealth: {total, broken, measuredAt, viewports}` vào từng template trong `CAPTURE_MANIFEST.json` (gộp desktop + mobile). Một viewport không đo được thì không ghi record, `image-health` vẫn `UNMEASURED`. Ảnh xuất ra không đổi.
- **`lib/receipt-audit.js`**: `expectedCells` bỏ qua màn hình `status: verified-static-hosted-auth` (Haravan chuyển sang SSO hosted ngoài theme nên không receipt nào khớp được) và trả `skippedHostedAuth`; `pre_showcase_gate` ghi chú các màn này trong chi tiết `qa-gate`. Logic ô còn lại giữ nguyên.
- **`qa_gate.js`**: màn hình tên `404`/`not-found` hoặc khai `expectStatus: 404` chỉ hợp lệ khi phản hồi HTTP 404 và trang là template 404 của theme (class `404` trên body hoặc phần tử `[class*=404]`); 404 ở màn hình khác, 404 không phải template theme, hoặc 200 ở màn hình chờ 404 vẫn là `PREVIEW_UNREACHABLE`. Probe `text-overlap` bỏ phần tử bị cắt (`clip: rect(0,0,0,0)`, `clip-path: inset(50%/100%)`, hộp ≤1px `overflow:hidden`, kể cả phần tử cha) và chrome preview Haravan (`#preview-bar-iframe`, `iframe[src*=preview_bar]`, `.haravan-preview-bar`).
- **Recipe (`haravan-stitch-full-run`)**: `CERTIFIED` phải so với baseline chụp trước thay đổi (ghi baseline id + commit); promote + compare cùng lần chạy không phải bằng chứng hồi quy; trang dài ở 320/375/768 có thể chạm trần 55000ms của `theme.qa_validate` (thử lại một lần với `multiBreakpoint:false`, nếu không thì `UNMEASURED`); thanh cuộn classic/overlay lệch ~15px ở 1440 nên chỉ so baseline cùng chế độ.
- **Probe overlay (`lib/registry-probes*.js`)**: panel overlay chỉ là phần tử `fixed`/`absolute` đang ẩn trước khi click (hoặc nằm ngoài viewport trong ngữ cảnh `fixed`), nên nội dung trang cuộn hay trượt vào màn hình không còn bị báo `overlay-viewport-cap`. Trước khi click: trigger được cuộn vào giữa viewport (click không rơi vào dock/thanh cố định ở mép dưới) và chrome preview Haravan (`#haravan-notification`, preview bar) bị ẩn. Trigger làm trang điều hướng thì báo lỗi kèm hook và URL đích thay vì crash. Fixture mới: `overlay-fit-scrolled-content`, `overlay-fit-drawer-bad`, `overlay-preview-chrome`, `overlay-trigger-navigates`, `overlay-trigger-under-dock`.

## 2.10.0 - 2026-10-16

Toolchain hardening sau dự án S2 Sky Fashion (devs2): mỗi lớp lỗi tìm thấy trên theme giờ có đúng một cơ chế chặn (lint, settings-audit, readiness, receipt hoặc probe), có fixture bad/good, và QA không còn PASS khi đo không đủ.

- **Registry lớp lỗi (`registry/defect-classes.json`, `lib/registry.js`)**: 32 slug, mỗi slug một gate, một rule một dòng và fixture `bad`/`good`. Loader báo lỗi khi slug trùng, tier sai, thiếu trường hoặc fixture không tồn tại. Ngưỡng trong `registry/thresholds.json` (`minTextPx` 12, `minControlPx` 44, `minTapHitPx` 24); hợp đồng ghi đè bằng `designDefaults.typeScale`. 15 slug đã lên `blocker` (12 rule lint, `settings-ungated-toggle`, `settings-handle-unresolved`, `settings-text-typed-number`). Các slug receipt/probe/readiness còn `warn` cho tới khi có receipt native của AntiFan và hợp đồng khai báo gate readiness.
- **`haravan_lint.js`**: 12 rule mới theo registry: `LIQUID_INCLUDE_GLOBAL_FALLBACK`, `LIQUID_INCLUDE_SCOPE_LEAK`, `LIQUID_SCHEME_BEFORE_IMG_URL`, `LIQUID_HARDCODED_PALETTE`, `LIQUID_HARDCODED_VISIBLE_TEXT` / `JS_HARDCODED_VISIBLE_TEXT`, `JS_UTC_DATE_IDIOM`, `CSS_ROOT_FONT_SHRINK`, `CSS_FONT_BELOW_MIN` (quy đổi rem theo `mobileRootFontPx` của hợp đồng), `CSS_UNDECLARED_VAR`, `SVG_ICON_STROKE_MISMATCH`, `CSS_OVERLAY_NO_VIEWPORT_CAP`, `LIQUID_TRIGGER_WITHOUT_GATE`. `--waivers <json>` nhận `{rule, reason}` (lý do tối thiểu 10 ký tự), có scope theo loại thuộc tính; finding được waive vẫn được liệt kê, không bị đếm. `--contract` mặc định là `deliverables/FULL_REMAKE_CONTRACT.json` khi tồn tại.
- **`qa:gate` (`qa_gate.js`, `lib/receipt-audit.js`, `lib/registry-probes*.js`)**: gate độc lập với AntiFan. Dựng ô `màn hình × độ rộng` từ hợp đồng (màn hình `shell` kế thừa home), đọc receipt v1.2/v1.3 (`RECEIPT_WRONG_ROOT`, `RECEIPT_STALE`, `RECEIPT_DEGRADED` cho v1.1), áp `--coverage-floor`, và chạy probe registry bằng Chromium (`--probe-only`). Exit: 0 PASS, 1 FAIL, 2 UNMEASURED, 3 usage. `--classify-receipts <dir>` nhóm receipt theo host/workspaceRoot để xoá theo manifest.
- **`audit:backlog` (`backlog_audit.js`, `registry/backlog.json`)**: 82 dòng phủ 71 mục union đúng một lần; `declined` và `approval-pending` bắt buộc có lý do; P0 còn mở làm gate FAIL.
- **`skills:sync`**: `--check` và chế độ ghi đếm cùng một tập thư mục (thư mục canonical không có `SKILL.md`, như `references`, là thư mục hỗ trợ); `registry/skills-sync-exclusions.json` giữ bản mirror cố ý khác canonical. **`skills_routes_lint.js`**: báo tên skill chết/không tồn tại trong route; `--assert-phrases registry/guidance-assertions.json` kiểm tra câu bắt buộc trong skill/rule.
- **Delivery**: `final_theme_export.js` kết thúc mọi chế độ bằng kiểm tra allow-list của zip (dùng chung `theme_package.js`); `contract_promote.js` (mới) nâng từng mục hợp đồng (`--screen`, `--feature`, `--preview`) và dòng ledger pending (`--ledger-gate`) chỉ khi có file evidence thật; `lib/remake-contract.js` nhận `path`, `typeScale`, `qaGate` tuỳ chọn; `run_preflight.js` báo `UNMEASURED` cho watcher không gắn được với root (theo cwd hoặc `--root`) thay vì coi là pass; `settings_merge.js` gộp setting không id (header/paragraph) theo nội dung, thêm `--reset-skeleton` và `--prune-orphan-data` (chỉ ghi khi có `--write-data --allow-settings-data` và `--backup-dir`).
- **Scripts**: `test:backlog`, `test:registry`, `test:settings-audit`, `test:skills-sync`, `test:delivery`, `test:qa-gate`, `qa:gate`, `audit:backlog`; `npm test` chạy cả bảy bộ.
- **`workflow_final_guard.js` (2026-10-17, S2 Sky Fashion U1)**: chặn handoff khi bất kỳ ô `Status` nào trong bảng của `RESTYLE_PROGRESS_LEDGER.md` chứa `structural` hoặc `QA-debt` (ngay cả khi dòng `Final approval` đã ghi `passed`); báo rõ tên dòng và yêu cầu receipt `CERTIFIED` từ `theme.qa_validate`, hoặc ghi nhận miễn trừ có lý do bằng `--allow-structural-qa "<reason>"` (in `WARNING` kèm lý do, thiếu/rỗng báo lỗi cú pháp). Từ `structural` nằm ngoài ô `Status` (cột `Notes`/`Evidence` hoặc văn bản thường) không bị chặn.

## 2.9.0 - 2026-10-14

Bảo trì sau dự án S2 Rog Bike (devs2), đóng các mục trong `SKILL_IMPROVEMENT_LOG.md` của theme đó.

- **`skills:sync` (`skills_sync.js`)**: `C:/Users/Admin/.claude/skills` là bản canonical cho các skill pipeline (`haravan-stitch-full-run`, `haravan-demo-kit`, `final-showcase`, `theme-qa-az`, `haravan`, `haravan-settings-schema`, `ai-image-studio`, `haravan-preview-screenshot`). `--check` liệt kê mirror lệch (`~/.agents/skills`, `E:/Work/themes/.claude/skills`), chạy không cờ thì chép canonical đè lên mirror đã có skill đó. `audit:context` đọc skill từ canonical và báo mirror drift.
- **`sync:wait` (`wait_theme_sync.js`)**: chờ theme đồng bộ lên CDN trước khi QA: tải HTML storefront + asset với cache-bust, so SHA256 với file local (`--asset`), hoặc chờ marker xuất hiện trên route (`--marker`, `--path`). Thay vòng lặp poll viết tay mỗi lần sửa.
- **`claim:scan` (`claim_scan.js`)**: quét Liquid/JSON/locale/default setting tìm cam kết thương mại bịa (giao hàng toàn quốc, chính hãng 100%, bảo hành trọn đời...) và thông số kỹ thuật không nguồn.
- **`haravan_lint.js`**: rule mới gồm `HARAVAN_CART_ADD_ITEMS_ARRAY` (Haravan `/cart/add.js` trả 404 với payload `{ items: [...] }`), `MISSING_HIDDEN_ATTRIBUTE_OVERRIDE` / `MISSING_HIDDEN_CLASS_IN_CSS` (thuộc tính `hidden` bị `display` của class đè), `UNDEFINED_THEME_UTIL_FUNCTION`, `HARAVAN_DROP_JSON_FILTER`, `DUPLICATE_GLOBAL_SNIPPET_INCLUDE`, `CONTAINER_INVARIANT_VIOLATION`, `FORBIDDEN_REDUCED_MOTION`, `BOT_DETECTION_LOCATION_RELOAD`, `HARAVAN_DOTLIQUID_NIL_SIZE`.
- **`residue_scan.js`**: `--brands "A,B,C"` quét nhiều thương hiệu cũ cùng lúc. **`remake_contract_audit.js`**: allowlist nhận `{ path, reason }` và in lý do. **`stitch_generate.js`**: bỏ project id mặc định `claudekit-default`, bắt buộc `--project`/`STITCH_PROJECT_ID`.
- **Final showcase**: gỡ popup không còn bấm nhầm ô tìm kiếm/form (gây điều hướng sang `/search`); `--hide <selector>` ẩn thêm widget nổi; zip thô của CLI chuyển vào `final-showcase/raw/` và guard từ chối zip thô trong `final-showcase/`; export báo URL `cdn.hstatic.net/themes/<org>/<themeId>/` cứng trong `settings_data.json` (cảnh báo, không chặn); deck tối đa 7 slide tính năng.

## 2.8.1 - 2026-10-13

- **`final_showcase_capture.js` & `final_feature_capture.js`**: bước gỡ popup trước khi chụp chỉ ẩn phần tử `[class*="overlay"]` khi nó hoặc một phần tử cha có `position: fixed` (backdrop modal, drawer, megamenu, newsletter). Trước đây selector ẩn cả lớp phủ thiết kế đặt `absolute` trong card/section (Lux Wine: `.lux-home-categories__overlay` trên 6 ô danh mục, `.lux-home-spotlight__overlay`), khiến ảnh trang chủ và slide PPTX có chữ trắng trên nền ảnh sáng. `.modal-backdrop`, `.popup-overlay`, `.newsletter-overlay` vẫn luôn bị ẩn.
- **`FULL_REMAKE_CONTRACT.template.json`**: thêm `settingsHandleWaivers: []`, là danh sách setting id `page`/`collection`/`blog`/`link_list` cố ý để trống. `HaravanDemoKit readiness` tự suy ra yêu cầu handle từ `settings_schema.json` + `settings_data.json` và bỏ qua các id trong danh sách này; handle rỗng không có trong danh sách sẽ báo `missing` (Lux Wine: icon yêu thích, tab sản phẩm, hướng dẫn size bị ẩn im lặng).

## 2.8.0 - 2026-10-12

Nâng cấp automation stack chuẩn bị cho dự án theme Haravan tiếp theo dựa trên bài học từ Lux Wine (devs2):
- **`workflow_final_guard.js`**: Tách kiểm tra full-remake contract ra khỏi nhánh `findLedger`, chạy độc lập để gom lỗi đồng thời cùng lỗi thiếu ledger; thông báo hướng dẫn user chạy `npm run ledger:init -- --root <theme>`. Chấp nhận theme F1GENZ có `config/settings_schema.json` thay vì chỉ `config/settings.html`. Tích hợp `validateDescription` với bộ quy tắc chặt chẽ của Haravan Partners.
- **`ledger:init` (`ledger_init.js`)**: Lệnh mới khởi tạo `deliverables/RESTYLE_PROGRESS_LEDGER.md` từ canonical template nếu chưa tồn tại (bảo vệ ledger hiện có, không bao giờ ghi đè).
- **`residue:scan` (`residue_scan.js`) & `lib/remake-contract.js`**: Quét brand residue không phân biệt hoa thường, tự động sinh các biến thể slug/email/domain (`S2 Spa` -> `s2spa`, `s2-spa`, `s2_spa`, `s2 spa`), quét toàn bộ theme, `config/settings_data.json` và archive ZIP (`--zip`). `workflow_final_guard.js` và `remake_contract_audit.js` dùng chung logic này.
- **`final_theme_export.js`**: Sau khi copy và validate file ZIP xuất bản chuẩn (`Haravan-<Brand>-<Theme>-vYYYYMMDD-HHmm.zip`), tự động dọn dẹp/di chuyển file ZIP tạm của Haravan CLI (`Theme-DD_MM_YYYY.zip`) ra khỏi theme root. Chấp nhận `config/settings_schema.json` hoặc `config/settings.html`. Cập nhật tài liệu (`FINAL_SHOWCASE.md`, `START_HERE.md`, `FLOW_A.md`, `RUN_GUIDE.md`) dùng canonical naming timestamp `vYYYYMMDD-HHmm`.
- **`description:check` (`description_check.js`) & `THEME_DESCRIPTION.template.html`**: Tiền kiểm soát tài liệu mô tả Marketplace: bắt buộc dạng fragment (không doctype/html/head/body), tối thiểu 200 ký tự, có h1-h3 và ul, bộ ký tự visible text + alt giới hạn nghiêm ngặt (chữ tiếng Việt/Anh, số, khoảng trắng, . , : - ( )), cấm tuyệt đối emoji, bullet (•, ▸), mũi tên, em dash (—), dấu ngoặc kép cong, &amp; (thay bằng "và") và comment HTML. Toàn bộ `<img src>` phải trỏ về `https://cdn.hstatic.net/files/...`; cờ `--probe` thực hiện HTTP HEAD 200 có timeout. Cập nhật `THEME_DESCRIPTION.template.html` theo cấu trúc chuẩn Bootstrap 3 tham chiếu từ Lux Wine và S2 Spa.
- **`final_feature_deck.js`**: Loại bỏ các màn tiện ích/auth (`login`, `register`, `404`, `cart`, `checkout`, `account`, `search`) ra khỏi danh sách ảnh nền fallback; hỗ trợ chỉ định ảnh nền trực tiếp per-feature trong `FEATURES.json` (`feature.background`) và tìm khớp theo từ khóa title trước khi fallback modulo.
- **`final_showcase_capture.js` & `final_feature_capture.js`**: `final:capture --all-templates` loại trừ màn login/register theo mặc định (thêm cờ `--include-auth` khi cần); cuộn từng bước, kích hoạt `aos-animate` trên toàn bộ phần tử `[data-aos]` và gọi `anim.finish()` trên Web Animations trước khi chụp để chống màn hình trắng; hỗ trợ mật khẩu cửa hàng tự động qua biến môi trường `HARAVAN_STOREFRONT_PASSWORD`.
- **`MERCHANT_DEFAULT`**: Bổ sung mẫu allowlist cấu hình phân trang số (`products_per_page | default: 24`) trong `FULL_REMAKE_CONTRACT.template.json`; tin nhắn lỗi gợi ý ép kiểu `| plus: 0` và kiểm tra `blank` thay vì dùng fallback text cứng.
- **Pipeline & Haravan Lint (`stitch_generate.js`, `haravan_lint.js`, `run_preflight.js`)**: Phối hợp cùng KitPipelineFixer tích hợp các lệnh `stitch:generate`, `lint:haravan`, `preflight` kiểm tra credentials, bảo vệ utility classes (`.hidden`, `.sr-only`, v.v.), và chain `test/pipeline_tests.js` vào bộ test của kit.
- **`haravan_lint.js`**: (1) `| json` trong `<script>` thực thi giờ là warn `HARAVAN_JSON_IN_SCRIPT`; trong `application/json`/`ld+json` thì cho phép; trong markup vẫn là blocker. (2) Rule mới `HARAVAN_RECAPTCHA_DUPLICATE_LET` (blocker): Haravan chèn `<script>let recaptchaElm…</script>` vào mỗi `{% form %}`, nên 2 form giữ tên mặc định trên cùng trang sẽ ném `Identifier 'recaptchaElm' has already been declared` và reCAPTCHA của form sau không bind. Rule báo khi các form chưa `capture` + `replace: 'recaptchaElm'` (hoặc `'<script'`) nằm cùng một file, nằm trong `{% for %}` với tên cố định, hoặc nằm trong `layout/`/`snippets/` cạnh một form mặc định khác. Các template khác nhau không bao giờ render cùng nhau nên không bị báo. Lux Wine: footer newsletter + comment article (đã thấy lỗi trên live), login + recover và form địa chỉ trong loop (phát hiện tĩnh).
- **`run_preflight.js` & `haravan_preflight_fallback.py`**: mẫu mojibake báo nhầm chữ hoa tiếng Việt hợp lệ (`Đ`, `Ã` trong `MÃ`, `NGÃ`); giờ chỉ bắt chuỗi UTF-8 bị đọc thành latin-1 (byte dẫn `Â/Ã/Ä/Æ` theo sau ký tự 0x80-0xBF, `â€`, `áº`/`á»`).

## 2.6.1 - 2026-07-24
`final_feature_deck.js` (user-request, approved in-project): feature slide typography nâng cấp — title 17→24pt **lime trên panel tối** (`colors.bg`), body 11.5→14pt trắng, bullet marker `▸` màu accent (trả text runs thay vì string đơn để tô màu marker riêng), index màu accent. Copy panel đổi từ card sáng sang panel tối GenZ (readable lime+white) để chữ đặc biệt có màu mà vẫn tương phản. Image well sáng giữ nguyên bên phải. Trước đó title/body xám nhỏ trên nền sáng → "mô tả 1 đằng, hình đọc mệt". Không đổi layout mapping (image vẫn lấy `features[].image` 1:1).

## 2.6.0 - 2026-07-16

Đồng bộ kit theo 15 feedback items của user (trước đây chỉ nằm trong skill layer — kit docs/prompts chưa mang các rule mới, nên chạy qua kit vẫn tái phạm).

- **`STITCH_PROMPT.template.md`**: thêm mục **GLOBAL RULES (BẮT BUỘC)** — full screen list (mọi trang + account 5 màn + Quickview/Cart Sidebar/Menu Mobile/Compare/Wishlist/Smart search/Newsletter/TOC/Account Modal/Menu Dropdown Desktop/Megamenu Desktop + **Swal Modal/Sale Popup/Notify Modal/Livechat Modal** + mobile TỪNG trang), SHELL SPEC chống header/footer drift, MOTION/INTERACTION SPEC (hover/animation/slider/marquee/countdown/counter), font VN subset, tên màn EN/copy VN, set-position line, 1 prompt/screen; ASSET RULES ghi jpg/png only.
- **`STITCH_FIDELITY.md`**: §1A template-first conversion doctrine (không restyle, không CSS overlay, không legacy fallback, feature/behavior bảo tồn, scope = GLOBAL RULES checklist); motion spec = bề mặt fidelity; §5B quy ước ship code (naming theo brand, no-wrapper, extend file asset sẵn có per-template, SCSS dialect + cấm min()/max(), REM-first, cấm webp, comment hygiene, 5 mechanical checks); anti-patterns mới (CSS overlay, legacy fallback hoarding, parallel asset file, wrapper 1 chỗ); acceptance gate thêm screen coverage + motion + mechanical checks.
- **`liquid_content_audit.js`**: rule mới `SCSS_MIN_MAX` (blocker, scoped `.scss.*`), `STITCH_FILENAME` (blocker, quét tên MỌI file ship kể cả ảnh), `WEBP_ASSET` (blocker), `WEBP_REF` (warn). Tests + fixtures mock-theme-bad tương ứng.
- **`RUN_GUIDE.md`**: A.9 nhúng doctrine + mechanical checks; pitfalls thêm 6 hàng (CSS overlay, file mới, min/max, naming, webp, wrapper); output contract thêm dòng Mechanical checks + Improvement log.
- **`HARAVAN_THEME_RESTYLE_WORKFLOW.md`**: entry point thêm nạp `/haravan` trước + kit READ-ONLY; nguyên tắc chung thêm 7 rule mới; luồng C đổi thành Template-First Conversion; anti-patterns F thêm 6 mục; 0.12 thêm nghi thức improvement log.
- **`FLOW_A.md`**: checklist section 12 mục (markup mới, hook feature, motion, REM, webp, naming, wrapper); 6 → **11 quy tắc cứng**.
- **`START_HERE.md`**: vị trí kit CỐ ĐỊNH + READ-ONLY; nạp `/haravan` trước; quy tắc khóa mới; "Chuyển sang dự án mới" bỏ hướng dẫn copy kit (kit ở nguyên chỗ, project ở thư mục làm việc); thêm file 11.
- **`PROMPT.template.md`**: prompt #0/#1 thêm constraint template-first / extend file sẵn / naming / webp / REM / improvement log / nạp `/haravan`.
- **`SKILL_IMPROVEMENT_LOG.template.md`** (mới): log cải tiến kit/skill per-project — tag `[kit-bug|cli-gap|skill-gap|user-request|workaround|new-pitfall]`, surface tại mỗi STOP, review cuối dự án.
- Version drift fix: package.json 2.5.3 ↔ START_HERE 2.5.1 ↔ README 2.5.1 → đồng bộ 2.6.0 (2 test version trước đó đang FAIL).
- Skill sync: Claude skill → v2.4.0 (danh sách màn hình +4 modal, standing rules, khôi phục `post-restyle-qa-checklist.md` bị mất), port Codex + Copilot cập nhật theo.

## 2.5.3 - 2026-07-15

- **`final_theme_export.js`**: Haravan CLI `theme export` does **not** accept `--file` (v1.1.x). Script now runs bare `haravan theme export` in theme root, then copies newest zip → `--out/--file` with PK magic validation.
- **`FINAL_SHOWCASE.md`**: export-only steps + pre-final UI traps pointer.
- Skill `haravan-stitch-full-run`: new `references/post-restyle-qa-checklist.md` (Sass min-unit escape, long menu clip, product-card hover opacity trap, collection 4-col, PDP gallery, W3C red-only gate, export CLI). Wired into SKILL Phase 5 / STOP 3, `one-command-workflow`, `final-showcase-pptx`, checkpoint policy.
- Project note (F1GENZ GenZ): handoff zip `final-showcase/F1GENZ-GenZ-final-theme.zip`.

## 2.5.2 - 2026-07-15

- **`FINAL_SHOWCASE.md`**: gold-standard final pack (widget tight crops, modal kill, merchant FEATURES copy, custom pages full-page, home mobile 276×480, PPTX margins).
- **`scripts/final_feature_pack.example.js`**: production reference capture pack (stage canvas `#f3f4f6`, kill `#shop-modal-contact`, section/page taxonomy).
- **`final_feature_deck.js`**: manual aspect-fit from PNG dimensions (no stretch); ≥0.5" slide margins + ≥0.35" frame pad.
- **`final_showcase_capture.js`**: page PNGs use **readable Vietnamese names** (`Trang chi tiết sản phẩm.png`, not `product-desktop.png`); path-aware labels for about/store/contact/faq. Home guard files: `Trang chủ.png` / `Trang chủ-mobile.png` (legacy names still accepted by `workflow_final_guard.js`).
- **`FEATURES.template.json`**: merchant-plain Vietnamese guidance; widget vs page capture notes.
- **`RUN_GUIDE` A.15**: aligns with skill `final-showcase-pptx.md`.

## 2.5.1 - 2026-07-15

- **`final_feature_capture.js` + `npm run final:feature-capture`**: desktop-only feature-region screenshots (selector clip / click / hover) → `final-showcase/features/*.png` for PPTX accuracy. Template: `FEATURE_SHOTS.template.json`.
- **`final_feature_deck.js`**: feature slides use longer left copy column + optional `bullets[]`; screenshot panel uses `contain` (no squash) with letterbox well instead of `cover`.
- **`final_showcase_capture.js`**: multi-template `pages/*` defaults to **desktop only** (`--no-mobile-pages` default). Pass `--mobile-pages` when mobile page shots are needed. Home guard still writes both desktop + mobile crops.
- Docs/tests: help flags, template presence, feature-capture script.

## 2.5.0 - 2026-07-15

- **`final_showcase_capture.js` multi-template**: besides the home 4-PNG guard contract, supports `--all-templates`, `--paths-file`, `--paths`, `--theme-id`, `--no-mobile-pages`. Extra templates write to `final-showcase/pages/{key}-{desktop,mobile}.png` + `CAPTURE_MANIFEST.json`. Default keys: home, collection, product, blog, article, page-default, page-custom, login, register.
- **`CAPTURE_PATHS.template.json`**: seed map for real product/article/page-custom handles.
- **`final_feature_deck.js` + `npm run final:pptx`**: build sales feature PPTX (cover → TÍNH NĂNG NỔI BẬT → 1 slide/feature → thank-you) from `FEATURES.json` + showcase screenshots. Dependency: `pptxgenjs`.
- **`FEATURES.template.json`**: brand + feature list template (title/body/image).
- **`workflow_final_guard.js`**: optional `--require-pptx` checks for `*.pptx` in final-showcase.
- Docs: `RUN_GUIDE` A.15, `FLOW_A` final step, `PROMPT.template` final handoff, README scripts/quick final.
- Skill `haravan-stitch-full-run` Phase 5: multi-template capture + feature PPTX before STOP 3 / export.
- Tests: capture help + path/feature templates, deck smoke write, guard `--require-pptx`, package scripts/deps.
- Bump version 2.4.2 → 2.5.0.

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
