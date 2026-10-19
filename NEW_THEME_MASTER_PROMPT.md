# Master Prompt Xây Dựng Theme Haravan Hoàn Chỉnh (New Theme Master Prompt)

Tài liệu này định nghĩa cấu trúc Master Prompt và quy trình thực thi chuẩn hóa 10 giai đoạn (Phase 0 đến Phase 9) dành cho việc xây dựng theme Haravan mới từ thiết kế Stitch hoặc chuyển đổi từ theme nền có sẵn (Stitch Design -> Theme Remake -> Demo Data -> QA Kiểm thử -> Final Showcase -> Export ZIP -> Haravan Partners Submission).

Quy trình được đúc kết từ bài học thực tế của dự án mẫu Lux Wine (chuyển đổi từ base S2 Spa), khắc phục triệt để các lỗi kỹ thuật, đảm bảo tính ổn định của hệ thống và tuân thủ nghiêm ngặt 3 điểm dừng phê duyệt bất biến (**STOP 1, STOP 2, STOP 3**).

---

## 1. Khung Master Prompt Đầu Vào (Master Prompt Template)

Người dùng copy đoạn khung dưới đây, điền các giá trị đầu vào và gửi vào phiên làm việc để bắt đầu dự án:

```markdown
Bạn là Kỹ sư Trưởng Hệ thống & Độ tin cậy (Principal Systems & Reliability Engineer) chuyên trách phát triển Storefront Haravan cao cấp. Hãy thực thi quy trình xây dựng theme Haravan theo hợp đồng chuẩn hóa dưới đây:

### THÔNG TIN DỰ ÁN (PROJECT INTAKE)
- BRAND_NAME: [Tên thương hiệu mới, ví dụ: Lux Wine]
- INDUSTRY: [Ngành hàng, ví dụ: Rượu vang cao cấp & Quà tặng doanh nghiệp]
- BRANCH: [devs2 hoặc f1genz]
- BASE_THEME_PATH: [Đường dẫn theme nguồn, ví dụ: E:/Work/themes/devs2/Haravan/S2 Spa]
- TARGET_THEME_PATH: [Đường dẫn thư mục theme đích dạng `E:/Work/themes/<nhánh>/Haravan/<Tên theme>`, ví dụ: E:/Work/themes/devs2/Haravan/Lux Wine] (LƯU Ý: Đường dẫn này được KHÓA CỐ ĐỊNH ngay từ đầu, TUYỆT ĐỐI KHÔNG di chuyển hay đổi tên giữa chừng để bảo toàn lịch sử phiên chat OMP)
- SHOP_DOMAIN: [Tên miền Haravan, ví dụ: lux-wine.myharavan.com]
- THEME_ID: [ID theme bản nháp để preview, ví dụ: 1000854212]
- STITCH_PROJECT_OR_EXPORT: [Đường dẫn thư mục export Stitch hoặc Link dự án Stitch, hoặc ghi 'none' nếu sinh mới]
- DEMO_DATA_COUNTS: [Số lượng: ví dụ 24 sản phẩm, 6 danh mục, 8 bài blog, 4 trang tĩnh]
- PALETTE_TYPOGRAPHY_DIRECTION: [Ví dụ: Tông sáng thanh lịch, nền trắng ngà #FDFBF7, điểm nhấn vàng kim #C5A880, font Playfair Display cho tiêu đề & Inter cho nội dung, góc bo tối đa 2px]
- REQUIRED_FEATURES: [Ví dụ: Cổng xác minh tuổi 18+ (Age Gate), Form tư vấn & Quà tặng thay booking spa, Megamenu 3 cấp, Filter Drawer, Quickview, Sản phẩm thường mua cùng (Bought Together), Swiper PDP Gallery, Mini Cart Drawer, Thông báo đơn hàng nổi (Popnoti)]
- PARTNERS_PRICE: [Giá bán niêm yết trên Haravan Theme Store, ví dụ: 1.500.000đ hoặc Miễn phí]
- REFERENCE_THEMES: [Danh sách theme tham chiếu thị trường VN, ví dụ: Theme A, Theme B]
- MOBILE_BEHAVIOR: [Chiến lược mobile: menu drawer, mobile dock, compact product cards, sticky ATC]
- HOME_SECTION_INVENTORY: [Danh sách section trang chủ: hero slider, why/cam kết, danh mục nổi bật, flash sale/deal sốc, rails tab sản phẩm, brands, blog, newsletter]
- COLOR_POLICY: [Chính sách 2 màu: màu chính primary + màu nhấn accent/ink, tối đa 2 settings màu]
- IMAGE_PLAN: [Kế hoạch hình ảnh: tỷ lệ khung hình, phong cách chụp ngành hàng, mockups, banners]
- CANVAS_COLOR: [Màu nền trang mặc định (`designDefaults.canvasColor`), mặc định: `#FFFFFF` (chỉnh được ở Phase 0)]
- MOBILE_ROOT_FONT_PX: [Cỡ chữ gốc mobile ở `<=767px` (`designDefaults.mobileRootFontPx`), mặc định: `14` (vùng chạm tính bằng `px` >= 24px, không ép chiều cao control, input mobile >= 16px)]
- PRICE_COLOR: [Màu giá sản phẩm (`designDefaults.priceColor` / `--<pfx>-color-price`), mặc định: `#C8102E` trên nền sáng / `#FF5A5F` trên nền tối (giữ schema đúng 2 settings màu)]
- HOME_SECTION_ORDER: [Thứ tự 6-10 section trang chủ chốt ở Phase 0 (`designDefaults.homeSectionOrder`, ngân sách `HOME_SECTION_BUDGET` min 6, max 10): lõi `Hero -> Marquee/Trust -> Featured Product Rails -> Category Chapters -> Blog -> Newsletter`, thêm tối đa 4 section theo ngành từ `Flash Deal/Spotlight`, `Brands Grid`, `Interactive Tool/Finder`, `3D/Story`, `Service/Workshop`, `Lookbook`; không đặt hai section cùng vai trò liền nhau]

### HỢP ĐỒNG THỰC THI (EXECUTION CONTRACT)
1. Tuân thủ 10 Phase tuần tự (Phase 0 đến Phase 9). Không nhảy cóc.
2. Dừng lại tại ĐÚNG 3 điểm phê duyệt bất biến:
   - STOP 1: Bảng Conversion Map trước khi build theme.
   - STOP 2: Mỗi lần tải bản nháp lên Haravan preview hoặc thay đổi remote state.
   - STOP 3: Gói bằng chứng Final Showcase trước khi xuất bản file ZIP thương mại.
   - Kèm phê duyệt bổ sung cho các lệnh ghi live dữ liệu (PUT/POST sản phẩm, upload Haravan Files).
3. Catalog và bài viết demo do mô hình native của phiên viết, không cần khóa văn bản. Ảnh demo sinh qua `ai-image-studio` với khóa duy nhất `AIBOX_API_KEY` (AI Box, `qwen-image-3.0-pro`); Phase 3 chỉ cần khóa này cho ảnh, thiếu thì dừng hỏi user, cấm chuyển sang nhà cung cấp ảnh hay văn bản khác.
4. Mọi link kiểm thử preview bắt buộc dùng query parameter chuẩn Haravan: `?themeid=<theme_id>` (tuyệt đối không dùng cú pháp Shopify `?preview_theme_id=`).
5. Giao tiếp, báo cáo tiến độ và bảng tổng hợp bằng tiếng Việt có dấu đầy đủ; giữ nguyên tên lệnh, tên biến, file và mã lỗi gốc.
6. Chế độ overnight chỉ chạy bước cục bộ. Cho phép: đặt contract home sang `approved-final` (sau khi có bằng chứng Morning Review), xuất local ZIP, và showcase capture. Cấm tuyệt đối, intake không mở rộng được: Partners Create/Update, lệnh `haravan`/`hrv` CLI, theme push, ghi `config/settings_data.json`. Báo cáo sáng liệt kê `commands ran` và `commands not run`.
7. Mỗi brief subagent mở đầu bằng khối `Skills phải đọc`, rồi `Owned files ONLY` và `Non-goals`; mỗi lát cắt ghi slice receipt `deliverables/receipts/<slice>.json`, thiếu slice receipt thì lát cắt chưa xong.
```

---

## 2. Quy Trình Thực Thi Chi Tiết 10 Giai Đoạn (Phased Workflow)

### Phase 0: Tiếp Nhận & Kiểm Tra Môi Trường (Intake + Preflight)
- **Mục tiêu**: Khóa cứng thư mục làm việc, xác thực token CLI, kiểm tra tính đầy đủ của môi trường/API key từ Registry, loại bỏ watcher trùng lặp, đối soát ngành hàng và khởi tạo sổ cái tiến độ.
- **Skill cần nạp**: `haravan`, `haravan-audit`, `haravan-stitch-full-run`, `ui-ux-pro-max`
- **Lệnh / Công cụ thực thi**:
  1. *Khóa thư mục (Folder Lock)*: Xác nhận `TARGET_THEME_PATH` là đường dẫn cố định duy nhất. Không thực hiện lệnh `cd` hoặc di chuyển CWD để tránh làm mất lịch sử phiên OMP gắn theo path tuyệt đối.
  2. *Kiểm tra CLI an toàn*: Đọc file `.haravan-cli_local.json` trong thư mục theme đích bằng script đọc thuộc tính an toàn (`shop`, `theme_id`, `org_id`); tuyệt đối không in token ra màn hình console hay file log.
  3. *Kiểm tra môi trường & khóa API*:
     ```bash
     cd E:/Work/tools/RESTYLE_MASTER_KIT
     npm run preflight -- --theme <TARGET_THEME_PATH>
     ```
     Script sẽ tự động kiểm tra Node >= 18, Haravan executable, và quét biến môi trường `STITCH_API_KEY` / `AIBOX_API_KEY` trong `process.env` hoặc truy vấn từ Windows Registry (`reg.exe query HKCU\Environment`).
  4. *Kiểm soát Watcher duy nhất*: Preflight liệt kê PID các tiến trình `hrv theme dev`/haravan watcher của theme. Nếu có nhiều hơn 1, báo user tự tắt bản thừa; agent không tự kill tiến trình.
  4b. *Truy vấn AntiFan Core*: Gọi `xd://mcp__antifan_browser_core_context_pack_v2` với `platform: "haravan"` để nạp đầy đủ claims, rules, pitfalls, và historical cases cập nhật nhất của nền tảng Haravan.
  4c. *Kiểm tra vai trò theme & Khóa `designDefaults` ở Phase 0 (Preflight theme-role check, log 20)*: `npm run preflight` chấp nhận `.haravan-cli_local.json` chỉ có `{ org_id, theme_id }` và chặn cứng (`[blocker]`) nếu `role === 'main'`. Tuyệt đối không chạy overnight hay build/sync trên theme MAIN đang chạy trực tiếp của shop mà phải chuyển sang theme nháp (unpublished). Đồng thời chốt cứng khối `designDefaults` (`canvasColor: "#FFFFFF"`, `mobileRootFontPx: 14`, `priceColor: "#C8102E"`, `sectionSpace: "clamp(2.5rem, 6vw, 4.5rem)"`, `gutterToken: "--<pfx>-gutter"`, `homeSectionOrder`) trong `<TARGET_THEME_PATH>/deliverables/FULL_REMAKE_CONTRACT.json`.
  4d. *Design Gate (trước Stitch, trước mọi dòng code)*: nạp `ui-ux-pro-max` cho ngành hàng; chụp 2-3 storefront tham chiếu (`REFERENCE_THEMES`) bằng `anti.reference.capture` + `anti.inspect.page_inventory`, lưu `deliverables/reference/<slug>.json`; từ đó suy ra bộ token đầy đủ trong `designDefaults` (`typeScale`, `spacingScale`, `radius`, `controlHeight`, `iconStroke`, `cardDensity`, `homeSectionOrder` 6-10 mục, `homeSectionBudget: { min: 6, max: 10 }` cùng các khóa ở 4c). Trình bộ token cho user duyệt MỘT lần, ghi vào ledger; chưa duyệt thì không chạy `stitch:generate` và không build. Thiếu thư mục `deliverables/reference` là `DESIGN_GATE_MISSING`; `homeSectionOrder` ngoài 6-10 là `HOME_SECTION_BUDGET` (`npm run audit:remake-contract`).
  5. *Đối soát ngành hàng (Industry Match)*: Đối chiếu ngành hàng thực tế của cửa hàng mục tiêu với ngành hàng dự kiến. Nếu phát hiện lệch ngành (ví dụ cửa hàng đang chứa dữ liệu Spa nhưng làm theme Rượu), đánh dấu kích hoạt kế hoạch làm mới catalog ở Phase 3.
  6. *Khởi tạo Sổ cái tiến độ (Ledger Init)*:
     ```bash
     npm run ledger:init -- --root <TARGET_THEME_PATH>
     ```
     Lệnh tự động sao chép `RESTYLE_PROGRESS_LEDGER.template.md` sang `<TARGET_THEME_PATH>/deliverables/RESTYLE_PROGRESS_LEDGER.md` nếu chưa có (không bao giờ ghi đè file cũ).
  7. *Tạo dấu vân tay theme base*: Chạy whole-theme scout để tạo `<TARGET_THEME_PATH>/deliverables/THEME_FINGERPRINT.md` và khởi tạo `deliverables/SKILL_IMPROVEMENT_LOG.md`.
- **Kết quả đầu ra trên đĩa**:
  - `<TARGET_THEME_PATH>/deliverables/RESTYLE_PROGRESS_LEDGER.md`
  - `<TARGET_THEME_PATH>/deliverables/THEME_FINGERPRINT.md`
  - `<TARGET_THEME_PATH>/deliverables/SKILL_IMPROVEMENT_LOG.md`
  - `<TARGET_THEME_PATH>/deliverables/reference/*.json` và bộ token `designDefaults` đã duyệt
- **Cổng xác thực (Verification Gate)**: `npm run preflight` PASS 100%, ledger tồn tại trên đĩa, không có watcher trùng lặp, Design Gate đã duyệt (không còn `DESIGN_GATE_MISSING`).
- **Điểm dừng phê duyệt (STOP)**: Không thêm STOP; lần duyệt Design Gate duy nhất được xin cùng lúc xác nhận intake và ghi vào ledger (Conversion Map STOP 1 sau đó dùng đúng bộ token này).

---

### Phase 1: Sao Chép Theme Nền & Dọn Dẹp Sạch (Base Import + Cleanup)
- **Mục tiêu**: Sao chép chọn lọc mã nguồn từ base theme, bảo toàn cấu hình CLI, quét sạch tàn dư thương hiệu cũ, thanh lọc toàn bộ cú pháp cấm và nén ảnh dung lượng cao.
- **Skill cần nạp**: `haravan-theme`, `haravan-audit`, `haravan-theme-image-compression`
- **Lệnh / Công cụ thực thi**:
  1. *Sao chép chọn lọc (Selective Copy)*:
     Chỉ sao chép các thư mục theme chuẩn: `assets/`, `layout/`, `snippets/`, `templates/`, `config/settings_schema.json` từ `BASE_THEME_PATH` sang `TARGET_THEME_PATH`. Bảo toàn nguyên vẹn file `.haravan-cli_local.json`. Loại trừ tuyệt đối các thư mục: `final-showcase/`, `deliverables/`, `tests/`, `specs/`, `tools/`, `scripts/`, `backups/`, `scratch/`.
  2. *Xử lý an toàn `settings_data.json`*:
     Hỏi người dùng xác nhận trước khi sao chép `config/settings_data.json`. Đảm bảo parser bảo toàn mã hóa Unicode escape (`\uXXXX`), cấu trúc byte-for-byte và merchant presets nguyên bản.
  3. *Quét tàn dư thương hiệu & từ vựng ngành cũ (Residue & Donor Vocabulary Scan)*:
     ```bash
     cd E:/Work/tools/RESTYLE_MASTER_KIT
     npm run residue:scan -- --root <TARGET_THEME_PATH> --brands "<Tên brand cũ, vd: S2 Spa>" --source-domain-words "<từ,vựng,ngành,cũ>"
     ```
     Script quét case-insensitive toàn bộ file Liquid, CSS, JS, `config/settings_schema.json`, `config/settings_data.json` và chuyển tiếp `--residue-words` sang `audit-settings-schema.mjs`.
  4. *Thanh lọc cú pháp cấm*:
     - Loại bỏ triệt để filter `| json` bên ngoài thẻ `<script type="application/json">` (thay bằng `| escape`, `| strip_html` hoặc serialize thủ công).
     - Loại bỏ thẻ `{% continue %}` (thay bằng `{% unless %}`).
     - Thay thế `{% render %}` bằng `{% include %}`.
     - Xóa bỏ block `{% schema %}` trong template (F1GENZ chỉ dùng `config/settings_schema.json`).
     - Thay thế filter `image_url` của Shopify thành `img_url`.
  5. *Quét asset mồ côi & kiểm tra CDN*:
     ```bash
     npm run orphan:sweep -- --root <TARGET_THEME_PATH>
     ```
     Đối soát mọi thẻ `asset_url` với file trong `assets/` và kiểm tra HEAD HTTP 200 trên remote CDN.
  6. *Nén ảnh raster*: Nén tất cả ảnh raster trong `assets/` có kích thước > 200KB bằng Sharp, giữ nguyên định dạng.
- **Kết quả đầu ra trên đĩa**: Mã nguồn theme sạch sẽ, cấu trúc thư mục chuẩn Haravan.
- **Cổng xác thực (Verification Gate)**: `npm run lint:haravan -- --root <TARGET_THEME_PATH>` đạt 0 lỗi; `npm run residue:scan` trả về 0 kết quả dư thừa.
- **Điểm dừng phê duyệt (STOP)**: Người dùng đồng ý sao chép và kế thừa `config/settings_data.json`.

---

### Phase 2: Thiết Kế Giao Diện Stitch (Stitch Design)
- **Mục tiêu**: Tạo thiết kế Stitch chuẩn ngành hàng với tỷ lệ thị giác "ít chữ, nhiều ảnh", chia nhỏ prompt chống timeout và lập bảng Conversion Map.
- **Skill cần nạp**: `ak-stitch`, `stitch-chunked-generation`, `ai-image-studio`
- **Lệnh / Công cụ thực thi**:
  0. *Layout DNA khi nhiều store dùng chung một base theme*:
     Khi từ 2 store trở lên được remake từ cùng một base ZIP, mỗi master prompt phải ghim sẵn bảng "Layout DNA" riêng: archetype header, hero, trust strip, product card, collection, PDP, footer và mobile khác nhau giữa các store, cùng font và màu canvas khác base; `HOME_SECTION_ORDER` và mobile behavior viết lại theo DNA. Bảng được gán từ trước để các run song song không trùng nhau. Cổng khác biệt: ≥70% dòng bị loại so với base đã đổi tên prefix, cộng so sánh hình side-by-side với showcase của base. Thiếu bảng DNA thì run sẽ trôi về reskin.
  1. *Phân chia Chunk (Prompt Chunking)*:
     Tuyệt đối không gửi toàn bộ trang chủ trong 1 prompt để tránh lỗi gateway timeout 300s (`-32001`). Ngay từ bước thiết kế Stitch và lập Conversion Map, phải quy hoạch tổng số section trang chủ `<= 10` (ngân sách `registry/home-structure.json` từ 6 đến 10 sections; ví dụ dự án Sky Fashion thiết kế 12 sections đã bị chặn bởi `HOME_SECTION_BUDGET` ở cổng nghiệm thu cuối và phải tắt bớt 2 sections muộn qua `settings_merge.js --key ... --write-data --backup-dir`). Chia trang thành 2-3 chunk nhỏ (mỗi chunk <= 6 sections, tổng toàn trang 6-10 sections, dung lượng prompt ~0.9 - 1.4KB):
     - Chunk Top: Header, Announcement bar, Hero slider, Trust marks.
     - Chunk Middle: Featured collections, Countdown flash sale, Curated wine grid.
     - Chunk Bottom: Editorial tasting notes, Sommelier consultation / Gifting form, Reviews, Footer.
  2. *Ghi prompt ra file*: Lưu nội dung prompt vào file tạm trên đĩa (ví dụ `E:/Work/scratch/stitch/prompt-chunk1.txt`) để tránh lỗi Windows cmd.exe ngắt chuỗi tại ký tự xuống dòng.
  3. *Sinh màn hình & render*:
     ```bash
     cd E:/Work/tools/RESTYLE_MASTER_KIT
     npm run stitch:generate -- --prompt-file E:/Work/scratch/stitch/prompt-chunk1.txt --out deliverables/stitch/chunk1 --render
     ```
     Script tự động gọi Stitch SDK, lọc màn hình lấy đúng `screenType === 'DESIGN'` (bỏ qua màn IMAGE), và dùng Puppeteer render file `design.html` ở viewport 1440px tạo ảnh full-page PNG (`design.full.png`) thay vì sử dụng thumbnail mờ 176px.
  4. *Chuẩn hóa Typography tiếng Việt*: line-height tiêu đề tối thiểu 1.18 (cấm <= 1.1 vì cắt dấu), nội dung khoảng 1.6 - 1.8. Lux Wine chốt `--line-height-tight: 1.18`, `--line-height-base: 1.65`.
  5. *Lập bảng Conversion Map*:
     Tổng hợp Section list, Block list, Data-binding (`setting-id`/`setting-type`), Asset plan, Kế hoạch xử lý các trạng thái thiếu (theo chuẩn theme-native), Design Tokens map và danh sách Planned Deviations.
- **Kết quả đầu ra trên đĩa**:
  - `deliverables/stitch/chunk*/design.html`
  - `deliverables/stitch/chunk*/design.full.png`
  - Bảng tổng hợp Conversion Map hoàn chỉnh.
- **Cổng xác thực (Verification Gate)**: Tất cả chunk sinh thành công, ảnh fullpage 1440px rõ nét, không lỗi timeout.
- **Điểm dừng phê duyệt (STOP 1)**: **Trình bày Bảng Conversion Map (Sections + Assets + Gaps + Deviations) kèm STOP 1 Checklist cho người dùng duyệt một lần duy nhất trước khi bắt tay viết code.**
  #### STOP 1 Checklist (Bắt buộc duyệt trước khi code, <=15 dòng):
  1. [ ] Legacy-free rebuild 100%: không kế thừa HTML/CSS cũ, chỉ giữ hook/endpoint backend (log 27).
  2. [ ] Section inventory: tổng số section trang chủ chốt trong ngưỡng 6-10 (`<= 10` sections theo `registry/home-structure.json` để tránh lỗi `HOME_SECTION_BUDGET`); hero slider + flash sale/deal sốc hiện diện và visible trên cả desktop & mobile.
  3. [ ] Mobile UX: menu footer tự động accordion/collapse trên mobile; product card mobile compact, không tràn ngang.
  4. [ ] Breadcrumbs chuẩn SEO: hiển thị đầy đủ, không bao giờ bị cắt cụt bằng '...'.
  5. [ ] Accessibility & State: mọi button/link có hover, focus-visible và tap target chuẩn.
  6. [ ] Trust icons & media: toàn bộ icon cam kết/dịch vụ cấu hình uploadable qua image_picker settings.
  7. [ ] Color policy: tối đa 2 settings màu (primary + accent), cấm phân mảnh biến màu vô tội vạ.
  8. [ ] Cấu trúc schema: tab 'Thiết lập chung' chỉ chứa settings merchant thực tế, không nhét technical flags.
  9. [ ] Bật full tính năng: đặt default: true trong settings_schema.json, TUYỆT ĐỐI KHÔNG tự ghi vào settings_data.json.
  10. [ ] Dynamic copy: 100% nội dung chữ, hotline, label lấy từ settings/Liquid, không hardcode bản ngữ.
  11. [ ] Cấm claim thương mại tự bịa (log 30): cấm số liệu bịa đặt (UCI, CdA, Toray...), bind từ data thật.
  12. [ ] Machine checks bắt buộc mỗi slice: chạy `npm run claim:scan` và `npm run residue:scan --brands "<brands>"` trước khi báo xong.

---

### Phase 3: Dữ Liệu Mẫu Cửa Hàng (Demo Data)
- **Mục tiêu**: Xây dựng kho dữ liệu demo chân thực, giàu định dạng HTML (bảng, FAQ, tasting notes), hình ảnh chất lượng cao và đúng đặc thù ngành hàng mà không phụ thuộc API key ngoài.
- **Skill cần nạp**: `haravan-demo-kit`, `haravan-demo-live-seed`, `haravan-demo-data-audit`, `ai-image-studio`
- **Lệnh / Công cụ thực thi**:
  1. *Đối soát yêu cầu dữ liệu (Readiness, read-only)*:
     ```bash
     node HaravanDemoKit/src/cli.js readiness --config configs/<brand>.local.json --contract <TARGET_THEME_PATH>/deliverables/FULL_REMAKE_CONTRACT.json --theme <TARGET_THEME_PATH>
     ```
     Đối soát config với `requiredData` của contract (catalog, collection, blog, page, menu) VÀ các handle tự suy ra từ `config/settings_schema.json` + `settings_data.json` (dòng `source: "settings"`): mọi setting `page`/`collection`/`blog`/`link_list` phải trỏ tới handle có thật hoặc nằm trong `settingsHandleWaivers`. Page có `template_suffix` (`wishlist`, `stores`, `faq`...) phải nằm trong `pages[]` của config. Admin verification vẫn `pending`. Token CLI kiểm bằng `hrv-token.js` (hạn `access_token_expires_at` tính ms + GET `/com/products/count.json`). Endpoint: `/com/` cho sản phẩm, danh mục, tồn kho; `/web/` cho blogs, bài viết, trang, menu.
  2. *Nghiên cứu ngành hàng thật (Real-brand Grounding)*: Nghiên cứu cấu trúc dữ liệu ngành hàng mục tiêu (ví dụ: giống nho, niên vụ, vùng trồng, nồng độ cồn, gợi ý món ăn kèm, nhiệt độ thưởng thức). Không để LLM bịa đặt thông số kỹ thuật.
  3. *Tạo Catalog qua Native Model (Không cần API Key)*:
     Không đòi hỏi khóa văn bản nào. Chỉ ảnh cần `AIBOX_API_KEY`, nên bước catalog chạy được khi chưa có khóa. Sử dụng session model hiện tại tạo file JSON catalog hoặc chạy chế độ dry-run lưu ra đĩa:
     ```bash
     node HaravanDemoKit/src/cli.js products --config configs/<brand>.local.json --dry-run
     ```
     Kết quả ghi vào `HaravanDemoKit/output/<brand>/catalog.json`. Sau đó nạp qua cờ `--from-file`:
     ```bash
     node HaravanDemoKit/src/cli.js products --config configs/<brand>.local.json --from-file HaravanDemoKit/output/<brand>/catalog.json
     ```
  4. *Tiền kiểm định nội dung (Deterministic Validator)*:
     ```bash
     node HaravanDemoKit/src/cli.js validate-content --config configs/<brand>.local.json --file HaravanDemoKit/output/<brand>/catalog.json
     ```
     Chuẩn hóa HTML (loại bỏ `loading="lazy"` trước khi so sánh hash), kiểm tra độ dày nội dung (1200-1800 từ, đầy đủ h3, table, ul, blockquote).
  5. *Contact Sheet kiểm tra ảnh*: Tạo ảnh ghép lưới (contact sheet) qua Sharp kiểm tra 100% ảnh sản phẩm, biến thể và bài viết trước khi tải lên, loại bỏ triệt để ảnh rác từ base cũ.
  6. *Snapshot sao lưu bắt buộc*:
     ```bash
     node HaravanDemoKit/src/cli.js snapshot --config configs/<brand>.local.json
     ```
     Tự động sao lưu toàn bộ `body_html` live hiện tại ra thư mục backup trước khi ghi đè.
  7. *Tạo Blogs, Bài viết & Bình luận*:
     Chạy lệnh tạo bài viết và sử dụng `HaravanClient` đọc token CLI để tự động gán bình luận chân thực cho các bài viết.
  8. *Tạo Cây Menu (Navigation Seeding)*:
     ```bash
     node HaravanDemoKit/src/cli.js menus --config configs/<brand>.local.json
     ```
     Script sinh file `HaravanDemoKit/output/<brand>/seed-menus-console.js`. Cung cấp đường dẫn tuyệt đối cho người dùng paste vào console trong iframe Haravan Admin (`web.haravan.app/menus`) hoặc inject tự động qua AntiFan evaluate. Các liên kết lọc theo tag bắt buộc dùng cú pháp toàn cục `/collections/all/<tag>` (không dùng `/collections/<handle>/<tag>`).
  9. *Cổng dữ liệu demo trước QA*: tạo và gắn ảnh biến thể trước (`node HaravanDemoKit/src/cli.js variant-images ...` qua `ai-image-studio`, rồi contact sheet), sau đó trang bảng size, swatch map, menu 3 cấp (kiểm qua `/api/navigations/{id}`), link không 404, handle page/blog tồn tại; chạy `readiness --live` đạt. Mọi ảnh dùng cho `image_picker` trong settings phải được tải lên Haravan Files (`file.hstatic.net` / `cdn.hstatic.net/files/...`) qua skill `haravan-upload-file`, tuyệt đối không trỏ vào URL gắn cứng theo theme `cdn.hstatic.net/themes/<org>/<themeId>/...`. MST, hotline, địa chỉ, mạng xã hội lấy từ brief hoặc để trống và gắn cờ; cấm bịa placeholder (`0123456789`) hay trỏ social về `/collections/all`. QA trên shop thiếu ảnh biến thể hoặc menu cấp 3 không hợp lệ.
- **Kết quả đầu ra trên đĩa**:
  - `HaravanDemoKit/output/<brand>/catalog.json`
  - `HaravanDemoKit/output/<brand>/seed-menus-console.js`
  - Contact sheet ảnh sản phẩm/blog.
  - Snapshot backup trong `HaravanDemoKit/output/<brand>/backup/<timestamp>/`.
- **Cổng xác thực (Verification Gate)**: `validate-content` PASS, snapshot hoàn tất, menu console script sẵn sàng, 0 ảnh sai ngành hàng, `readiness --live` không còn thiếu ảnh biến thể, bảng size hay menu cấp 3.
- **Điểm dừng phê duyệt (STOP)**: Người dùng phê duyệt trước khi kích hoạt lệnh nạp live dữ liệu (PUT/POST sản phẩm, bài viết lên cửa hàng).

---

### Phase 4: Chuyển Đổi Mã Nguồn Theme (Conversion / Remake)
- **Mục tiêu**: Tái tạo giao diện toàn diện theo phong cách mới, loại bỏ ADN base cũ, gom dữ liệu trước khi sửa code, phân rã lát cắt độc quyền và tuân thủ F1GENZ settings contract.
- **Skill cần nạp**: `haravan-theme`, `haravan-settings-schema`, `haravan-empty-settings-render`
- **Lệnh / Công cụ thực thi**:
  1. *Triết lý Template-first Remake*:
     Viết code trực tiếp vào file CSS/JS tương ứng của từng template (ví dụ `assets/index.css`, `assets/product.css`). Cấm viết đè chắp vá CSS cũ, cấm lạm dụng `!important`.
  2. *Hợp nhất Settings chuẩn hóa (`npm run settings:merge` — CẤM script tự viết, CẤM glob)*:
     Mỗi slice chỉ trả file patch JSON riêng (`scratch/settings/G0.json`, `S1.json`..`S8.json`) và hợp nhất qua manifest có thứ tự:
     ```bash
     cd E:/Work/tools/RESTYLE_MASTER_KIT
     npm run settings:merge -- --root <TARGET_THEME_PATH> --manifest <ordered-manifest.json> --asset-cdn-base https://cdn.hstatic.net/themes/<ORG_ID>/<THEME_ID>/14/ [--write-schema] [--write-data]
     ```
     Mọi `image_picker` (cả `default` trong `settings_schema.json` và giá trị trong `settings_data.json`) BẮT BUỘC là full URL trên Haravan Files (`https://file.hstatic.net/...` hoặc `https://cdn.hstatic.net/files/...`) đã tải lên qua `haravan-upload-file` — cấm tên file trần, cấm để rỗng ở section đang bật, và TUYỆT ĐỐI CẤM trỏ vào URL gắn theo theme `cdn.hstatic.net/themes/<org>/<themeId>/...` (gây lỗi `image-picker-theme-scoped-url` vì ảnh bị buộc vào theme nguồn). Các setting mang giá trị số học (mốc lọc giá như `<pfx>_filter_price_1..4`, ngưỡng miễn phí vận chuyển như `<pfx>_cart_freeship_threshold`) không được khai báo kiểu `text` (`text-typed-number`). Tránh sinh các cặp khóa trùng ngữ nghĩa (`duplicate-semantic-key`, ví dụ `<pfx>_header_enable` + `<pfx>_page_header_enable`, `<pfx>_cart_freeship_enable` + `<pfx>_cart_page_freeship_enable`, hoặc các cặp upsell/trending/wishlist trùng lắp). Cả 3 nhóm lỗi `image-picker-theme-scoped-url`, `text-typed-number`, `duplicate-semantic-key` phải được xử lý dứt điểm ngay tại Phase 3/Phase 4 trước khi export, không để dồn tới `guard:final`. Ngoài ra, `select` `default` ∈ `options[].value`; 0 `dead-setting`, 0 `data-orphan-key`; `megamenu_enable_N` chỉ bật khi menu mục đó render đủ 3 cấp (tra con theo dual lookup ở cấp 2 và cấp 3: `link.links`, nếu rỗng thì `linklists[link.handle].links`); ghi `settings_data.json` (`--write-data`) chỉ khi user đã duyệt.
  3. *Pha G0 Design Tokens & Storefront Design-System Invariants*:
     - Áp dụng `designDefaults` đã chốt ở Phase 0 vào `:root` của `assets/theme.css`: `--<pfx>-color-bg: #FFFFFF`, `@media (max-width: 767px) { :where(html) { font-size: 14px; } }` (vùng chạm dùng `px` `>= 24px`, không ép chiều cao control, input mobile `>= 16px`), `--<pfx>-color-price: #C8102E` (`#FF5A5F` trên nền tối), `--<pfx>-space-section: clamp(2.5rem, 6vw, 4.5rem)` (chỉ đặt trong `theme.css`, cấm ghi đè trong `snippets/head-design-systems.liquid`), một token `--<pfx>-gutter` duy nhất (cấm override padding `.container`, cấm `100vw`).
     - Reset `p, ul, ol, dl, blockquote { margin: 0 }` toàn cục; chỉ bọc `margin-bottom: 1rem` trong `:where(.rte, [class*="__rte"], [class*="__prose"], .page-content, .article-content)`.
     - Danh sách `>= 4` item trên mobile bắt buộc dùng `scroll-snap-type: x mandatory` hoặc lưới 2 cột; bảo vệ `.hidden`, `[hidden]`, `.sr-only`, `.visually-hidden`.
  4. *Phân rã lát cắt độc quyền & Single Modal Owner (`S4`)*:
     Phân chia công việc thành các lát cắt độc lập với danh sách tệp sở hữu duy nhất (`Owned files ONLY`), non-goals rõ ràng:
     - **S1 Shell**: `layout/theme.liquid`, `snippets/header.liquid`, `snippets/footer.liquid`, announcement bar, age gate.
     - **S2 Collection**: `snippets/product-card.liquid`, `templates/collection*.liquid`, `templates/list-collections.liquid`, filter/sort drawers, `assets/collection.css`, `assets/collection.js`.
     - **S3 Product (PDP Only)**: `templates/product*.liquid`, `snippets/product-*.liquid` (trừ quickview/size-guide modals), `assets/product.css`, `assets/product.js`, `assets/variants.js`.
     - **S4 Single Modal Owner (Cart, Modals, Drawers & Global Overlays)**: Toàn bộ overlay toàn cục (`snippets/quickview-*.liquid`, `templates/search.quickview.liquid`, `snippets/search-modal.liquid`, `templates/search.smart.liquid`, `snippets/cart-modal.liquid`, `snippets/cart-drawer.liquid`, `snippets/compare-drawer.liquid`, `snippets/booking-modal.liquid`, `snippets/newsletter-modal.liquid`, `snippets/notify-modal.liquid`, `snippets/size-guide-modal.liquid`, `snippets/confirm-modal.liquid`, `snippets/sale-popup.liquid`, `assets/modals.css`, `assets/commerce.js`). Cấm đặt CSS modal trong `product.css`/`index.css`; bắt buộc có bảng State Contract 1:1 giữa JS (`classList.add/toggle`) và CSS (`opacity: 1; visibility: visible; pointer-events: auto` khi mở; `visibility: hidden; pointer-events: none` khi đóng).
     - **S5 Home**: `templates/index.liquid`, `snippets/home-*.liquid`, `assets/index.css`, `assets/index.js` (giữ tổng số section trang chủ đang bật `<= 10` đúng ngân sách 6-10 của `registry/home-structure.json`).
     - **S6 Editorial**: `templates/blog.liquid`, `templates/article.liquid`, `assets/blog.css`, `assets/article.css`.
     - **S7 Pages**: `templates/page.*.liquid` (About, Contact, FAQ, Store locator, Compare, Wishlist), `assets/page*.css`.
     - **S8 Account & System**: `templates/customers/*.liquid`, `templates/404.liquid`, `templates/cart.liquid`, `templates/search.liquid`, `assets/customer.css`, `assets/cart.css`.
     *Quy tắc điều phối*: Tối đa 2-3 subagents song song; mỗi subagent xuất CSS riêng vào `scratch/css/<slice>.css` để Controller hợp nhất.
     *Brief subagent*: mở đầu bằng khối `Skills phải đọc` (skill của lát cắt, `haravan` đọc trước), rồi `Owned files ONLY`, `Non-goals` và đường dẫn slice receipt cần ghi.
  5. *Ràng buộc F1GENZ Settings & Merchant Data (No Hard Defaults)*:
     - Mọi phần tử merchant nhìn thấy gắn `setting-id` + `setting-type` và bọc `{% if settings.key != blank %}` (`setting-id-unguarded`).
     - Cấm `| default: 'literal'`, cấm `{% else %}literal` (`liquid-hardcoded-fallback`), cấm handle cứng `linklists['x']`/`collections['x']` (`liquid-hardcoded-handle`); tra `linklists[link.handle]` bằng handle động của link (dual lookup menu) là hợp lệ.
     - Không dùng selector bare tag (`body input`, `textarea`, `select`).
  6. *Chống xung đột reCAPTCHA đa form*:
     Bọc mọi form trong snippet/layout và trang có >= 2 form bằng `{% capture x %}…{% endcapture %}` rồi `replace: 'recaptchaElm', 'uniqueRecaptchaElm' | replace: 'recaptchaForm', 'uniqueRecaptchaForm'`.
  7. *Cổng kiểm tra mỗi Slice & Per-Slice 3-State Gate (Đòn bẩy số 1)*:
     Sau MỖI slice chạy:
     ```bash
     cd E:/Work/tools/RESTYLE_MASTER_KIT
     npm run lint:haravan -- --root <TARGET_THEME_PATH>
     node C:/Users/Admin/.claude/skills/haravan-settings-schema/scripts/audit-settings-schema.mjs <TARGET_THEME_PATH> --json --max-colors 2
     npm run sync:wait -- --base https://<SHOP_DOMAIN> --theme-id <THEME_ID> --root <TARGET_THEME_PATH>
     npm run gate:asset-syntax -- --root <TARGET_THEME_PATH>
     npm run audit:css-tokens -- --root <TARGET_THEME_PATH>
     ```
     Sau `G0+S1` và sau `S4`, BẮT BUỘC chạy **Per-Slice 3-State Gate** ở `1440px` và `375px` qua 3 trạng thái: `scrollY=0` → `scrollY=600` → mở/đóng từng overlay/megamenu (`theme.qa_validate` + `theme-qa-az` interactive probes); chưa PASS cấm sang slice tiếp theo. Sau khi merge settings slice cuối và `sync:wait` PASS, chạy `node E:/Work/tools/HaravanDemoKit/src/cli.js readiness --config <cfg> --contract <TARGET_THEME_PATH>/deliverables/FULL_REMAKE_CONTRACT.json --theme <TARGET_THEME_PATH> --live --base https://<SHOP_DOMAIN> --theme-id <THEME_ID>`.
     `asset_syntax_check` (`gate:asset-syntax`: stub-render `.js.liquid` + `node --check`, biên dịch Sass) chạy sau MỖI lần sửa asset, trước `sync:wait`. Cuối mỗi lát cắt ghi slice receipt `<TARGET_THEME_PATH>/deliverables/receipts/<slice>.json` (exit code từng lệnh trên, verdict + `certification` của `theme.qa_validate`); thiếu slice receipt thì không sang lát cắt tiếp theo.
  8. *Đối soát Feature Hooks trong Contract trước khi Promote*:
     Mọi feature hook khai báo trong `deliverables/FULL_REMAKE_CONTRACT.json` bắt buộc phải trỏ tới các file thực sự tồn tại trên đĩa: bộ lọc trang danh mục (collection filtering) dùng `view: 'catalog'` trỏ tới `templates/search.catalog.liquid`; bộ lọc tìm kiếm (search filter) dùng `view=filter` trỏ tới `templates/search.filter.liquid` (tuyệt đối không khai báo file ảo không tồn tại như `templates/collection.filter.liquid`). Trước khi chạy `node contract_promote.js --feature <id>`, bắt buộc dùng `grep` đối soát sự tồn tại của từng file và selector/hook thực tế để tránh bị từ chối với lỗi `FEATURE_HOOK_MISSING`.
- **Kết quả đầu ra trên đĩa**: Toàn bộ template Liquid, CSS, JS được remake hoàn chỉnh, cấu trúc BEM chuẩn, F1GENZ binding đầy đủ.
- **Cổng xác thực (Verification Gate)**: `npm run lint:haravan` đạt 0 lỗi, toàn bộ file JS pass `node --check`.
- **Điểm dừng phê duyệt (STOP)**: Không (chạy trong phiên làm việc cục bộ).

---

### Phase 5: Kiểm Thử Giao Diện Trên Preview (QA on Preview ?themeid=)
- **Mục tiêu**: Kiểm thử thực tế trên storefront draft qua AntiFan Desktop MCP, quét toàn bộ routes trên 5 viewports, đảm bảo chuẩn WCAG AA, SEO, hiệu ứng mượt mà và tương tác hoàn hảo.
- **Skill cần nạp**: `theme-qa-az`, `haravan-accessibility`, `haravan-performance`, `haravan-overflow-debug`
- **Lệnh / Công cụ thực thi**:
  1. *Cơ chế link Preview*:
     Mọi link kiểm thử bắt buộc có query parameter **`?themeid=<THEME_ID>`**. Kiểm tra theme ID trong URL asset CDN để chắc chắn đang test đúng bản nháp, không test nhầm bản live.
  2. *Kiểm thử tự động qua AntiFan MCP & Chuẩn `CERTIFIED`*:
     - Cổng nghiệm thu QA bắt buộc đạt `summary.certification: CERTIFIED` trên từng route. Kết quả `theme.qa_validate` có `verdict: PASS` nhưng `certification: STRUCTURAL` chỉ là kiểm tra cấu trúc (`QA-debt`), **KHÔNG PHẢI LÀ PASS** (`AGENTS.md` §16.5).
     - Quét toàn bộ sitemap qua `theme.qa_validate` với `multiBreakpoint: true` (đo 5 mốc **320px, 375px, 768px, 1024px, 1440px**, thiếu đo thì verdict `INCONCLUSIVE`). Đã đo nghĩa là `findings.responsive[mốc].documentOverflow` là `true`/`false` ở đủ 5 mốc; mốc nào `null` hoặc `summary.responsive === 'UNMEASURED'` là chưa đo. Không dùng `qaMatrix.coverage.measuredViewports` làm bằng chứng: trường này đếm baseline so ảnh (`anti.visual.compare`) và vẫn là 0 sau một lần quét thành công. Dùng `anti.inspect.responsive_matrix` để xác nhận độc lập.
     - Để đạt `CERTIFIED`, phải promote visual baseline theo từng viewport từ các màn hình đã được người dùng phê duyệt với 0 lỗi critical. Khi gọi `anti.visual.compare`, bắt buộc truyền tham số `expectedUrl` (hoặc `expectedTargetUrl`), nếu thiếu sẽ trả về `INCONCLUSIVE` kèm `URL_EXPECTATION_MISSING`. Lưu ý: baseline vừa được promote và compare ngay trong cùng một phiên (same-session self-baseline) chỉ chứng minh tính nhất quán khi chụp (capture coherence / regression anchor) chứ không phải bằng chứng chất lượng thị giác độc lập; phải ghi rõ điều này trong báo cáo.
     - Giới hạn công cụ AntiFan đã biết trên trang chủ động: sau bản vá chống resample trên trang tĩnh (`7604c068`), các route tĩnh (`/404`, `/collections/all`...) đạt `PASS` với `captureStateCompatible: true`, nhưng trang chủ (`home`) có countdown/marquee/swiper, hiệu ứng sticky header/back-to-top theo cuộn trang hoặc bước chuẩn hóa ghi `style.display` lên overlay vẫn có thể trả về `INCONCLUSIVE` ("Capture transaction was never coherent across 2 attempts"). Trường hợp này phải ghi nhận trung thực là giới hạn công cụ (tool limit), tuyệt đối không tự chấm `PASS`.
     - Route 404 có chủ đích (`/khong-ton-tai-qa-h8`): bản AntiFan mới tách status document vào `summary.documentStatus` và chỉ fail khi tài nguyên con hỏng. Bản cũ còn báo `network_404` trên chính document URL: đó là hành vi đúng của trang 404, không phải lỗi theme.
     - Xử lý lỗi `CAPTURE_FRAME_STARVATION`: Tải lại tab 1 lần; nếu compositor vẫn không trả frame, tự động fallback sang `anti.browser.evaluate` đọc cấu trúc DOM, getBoundingClientRect và computed styles để xác thực chức năng mà không bị nghẽn tiến trình.
     - Xử lý trôi binding tab & Phục hồi sau khi Restart AntiFan: Nếu nhận lỗi `TARGET_STALE` hoặc tab bị chuyển hướng, gọi `anti.browser.tabs.list` và `anti.browser.rebind_target` để gắn lại tab. Nếu vừa khởi động lại AntiFan live, mọi kết nối MCP của phiên OMP hiện tại sẽ trả lỗi `4001 Unauthorized` và Tab ID được cấp lại: phải respawn proxy / khởi động lại MCP server, tạo tab thuộc project phiên làm việc qua `anti.browser.tabs.create` nếu cần, rồi gọi `anti.browser.rebind_target` (tab không thuộc project hoặc có viewport `0x0` sẽ trả `PROBE_FAILED`).
     - Đóng băng media/slider trước khi đo: Gọi `anti.media.freeze` hoặc `swiper.autoplay.pause()` để triệt tiêu `domUnstable`.
  3. *Khắc phục tràn ngang (Horizontal Overflow)*:
     - Button nhóm co giãn `minmax(0, 1fr)` hoặc xếp dọc trên mobile.
     - Bảng thông số kỹ thuật dùng `display: block; overflow-x: auto; max-width: 100%`.
     - Filter Drawer trên mobile khi đóng bắt buộc có `transform: translateX(100%); visibility: hidden; pointer-events: none;`.
  4. *Trợ năng (Accessibility - a11y)*:
     - Tương phản màu chữ vàng WCAG AA: tách token vàng sáng cho nền tối (`--color-gold-light`) và vàng đậm (`#806023`) cho nền sáng.
     - Input và button: có `aria-label`, thẻ `label` tường minh.
     - Heading Hierarchy: bổ sung thẻ `<h2>` ẩn class `.visually-hidden` vào đầu các lưới danh sách sản phẩm để không bị nhảy cóc heading.
     - Cấu hình Swiper a11y: khai báo `Swiper.extendDefaults({ a11y: { prevSlideMessage: 'Slide trước', nextSlideMessage: 'Slide tiếp theo' } })`.
     - Drawer navigation: bẫy tiêu điểm (`trapFocus`) khi mở và trả tiêu điểm khi đóng.
  5. *Tối ưu SEO*:
     - Thẻ canonical URL chuẩn, breadcrumb 3 tầng ưu tiên (Menu linklists đệ quy -> Danh mục trực tiếp -> Trang chủ > Tên SP).
     - Không áp filter `| escape` lên `search.terms` (Haravan core đã tự động escape; escape 2 lần gây lỗi hiển thị ký tự tiếng Việt có dấu).
  6. *Hiệu ứng Chuyển động (Motion) & Hiệu năng*:
     - Giữ nguyên hiệu ứng chuyển động thương hiệu và marquee theo hợp đồng gốc `AGENTS.md` (cấm thêm style override giảm chuyển động ở client).
     - CẤM `html { scroll-behavior: smooth; }` toàn cục (nguyên nhân gây CLS 0.54-1.0 khi F5 giữa trang). Thay bằng `html:focus-within { scroll-behavior: smooth; }` để giữ CLS = 0.
     - CẤM dùng selector ẩn triệt để `:not(.aos-animate) > * { opacity: 0; }` (gây khoảng trống trắng khổng lồ khi chưa cuộn tới).
  7. *Tương tác thương mại*:
     - Click Swiper Thumbs: dùng `anti.agent.cursor.click` (sự kiện chuột cấp CDP) thay cho `element.click()`.
     - Desktop Megamenu: bổ sung pseudo-element `::before` (`top: -15px; height: 15px; width: 100%`) làm cầu nối chống rớt hover giữa nút trigger và menu con.
     - Sản phẩm giá Liên hệ (0đ): ẩn nút Thêm vào giỏ/Mua ngay, hiện nút Liên hệ.
     - Badge giảm giá phòng thủ: kiểm tra `price > 0 && compare_at_price > price && ((compare_at_price - price) * 100 / compare_at_price) >= 1` trước khi làm tròn, tránh hiển thị `-0%` hoặc `-100%`.
     - Age Gate 18+: xóa `localStorage` kiểm tra popup hiện trọn vẹn, không kích hoạt bot-gating.
  8. *Xử lý trạng thái `QA_PENDING_SYNC`*:
     Trước khi kết luận lỗi template/settings, kiểm tra chuỗi `?v=` trên stylesheet live và fetch URL storefront với `cache: 'no-store'` để phân biệt độ trễ đồng bộ của watcher.
  9. *Quy chuẩn vận hành QA Cockpit (`theme.cockpit_*`)*:
     - *Đối soát khóa `page` và handle thực tế*: truyền `page: 'page-contact'` sẽ bị từ chối `INVALID_ARGUMENT ... not a known page`; truyền `page: 'page-about'` mặc định quét `/pages/about-us` dẫn tới HTTP 404 nếu cửa hàng dùng handle tiếng Việt (ví dụ `/pages/gioi-thieu`). Với mọi trang tĩnh có handle khác `PAGE_DEFS`, phải đọc handle thật từ `/sitemap_pages_1.xml?themeid=<THEME_ID>` và truyền trực tiếp `url: '/pages/<real-handle>'`.
     - *Trang tài khoản Hosted Accounts*: trên cửa hàng bật Haravan Hosted Accounts (`authRedirect: true`), lệnh quét `account` hoàn tất trong ~3s vì chỉ đo trang chuyển hướng chứ không phải form đăng nhập; phải phân loại các mục checklist `account` là `EXTERNAL`.
     - *Đồng bộ schema MCP live*: nếu công cụ `xd://..._theme_cockpit_scan` trong phiên OMP chỉ hiển thị `page,url,workspaceRoot,tabId` (thiếu `profile`, `thresholds`, `viewports`, `multiBreakpoint`, `pick`, `allowNonTheme` đã khai báo trong `scripts/antifan-omp-mcp.cjs`), nguyên nhân là phiên OMP đang giữ schema MCP cũ trong bộ nhớ đệm — hãy khởi động lại MCP server hoặc mở phiên OMP mới, không xóa các tham số này khỏi tài liệu.
     - *Giới hạn probe của Cockpit (không tự mark từ các cờ này)*: lỗi `PDP-04` báo `variant-control-unclickable ... document generation (...) is stale (...)` là do probe không làm mới generation giữa các lần click swatch — phải xác minh đổi biến thể bằng feature probe riêng (click swatch, kiểm tra URL `?variant=` và ảnh chính thay đổi); lỗi `HOM-08` báo "không tìm thấy section newsletter" xảy ra khi form đăng ký bản tin được đặt bên trong `footer`.
- **Kết quả đầu ra trên đĩa**: Báo cáo kết quả kiểm thử trên toàn bộ routes và 5 viewports, biên bản xác thực layout.
- **Cổng xác thực (Verification Gate)**: `theme.qa_validate` đạt `verdict: PASS` kèm `summary.certification: CERTIFIED` trên từng route chính (`STRUCTURAL` là `QA-debt`, không được tính là PASS; ngoại trừ route chạm giới hạn công cụ đã được ghi nhận và có phê duyệt miễn trừ của người dùng), 0 lỗi tràn ngang, 0 lỗi a11y nghiêm trọng, CLS <= 0.05.
- **Điểm dừng phê duyệt (STOP 2)**: **Phê duyệt của người dùng TRƯỚC MỖI LẦN tải gói draft theme lên Haravan hoặc chạy lệnh CLI thay đổi trạng thái remote.**

---

### Phase 6: Rà Soát Mã Nguồn Độc Lập (Review)
- **Mục tiêu**: Rà soát toàn diện chất lượng mã nguồn, kiểm tra tính toàn vẹn hợp đồng, phát hiện hồi quy và tham vấn kiến trúc độc lập khi có tranh chấp.
- **Skill cần nạp**: `ak-code-review`, `kongming`
- **Lệnh / Công cụ thực thi**:
  1. *Rà soát bằng git cục bộ (Local-only git)*:
     Thư mục theme mặc định không phải git repository. Được phép `git init` cục bộ để review (`ak-code-review --pending`) với điều kiện: tạo `.gitignore` TRƯỚC `git init` chứa đủ `.haravan-cli_local.json`, `.haravan-cli_remote.json`, `.haravan-cli_backup/`, `*.har`, `backups/`, `deliverables/`, `output/`; commit baseline ngay sau khi fetch theme; KHÔNG BAO GIỜ `git remote add`/`git push`. Kiểm tra trước baseline commit:
     ```bash
     git status --porcelain --ignored | rg "haravan-cli_|\.har$"   # phải chỉ ra dòng '!!' (ignored)
     ```
     Nếu chưa `git init` (hoặc user không muốn), dùng snapshot trong `E:/Work/scratch/` và `git diff --no-index <SNAPSHOT_BASE_DIR> <TARGET_THEME_PATH>`.
  2. *Đối soát Hợp đồng Remake (Contract Audit)*:
     Đối chiếu mã nguồn với `deliverables/FULL_REMAKE_CONTRACT.json`:
     - 0 lost hooks (`data-action`, `id`, `name`, `setting-id`).
     - 0 unmapped settings trong schema.
     - 0 unstyled legacy elements.
     - 0 cú pháp Shopify cấm.
     - BEM naming nhất quán.
  3. *Tham vấn Cố vấn Cấp cao (Kongming Escalation)*:
     Khi gặp bài toán kiến trúc hóc búa, tranh chấp giải pháp hoặc lỗi hồi quy lặp lại quá 3 lần: triệu hồi subagent `@kongming` để nhận khuyến nghị cố vấn độc lập từ model cao cấp nhất trong một lượt duy nhất mà không cần chuyển đổi model phiên làm việc.
- **Kết quả đầu ra trên đĩa**: Báo cáo code review chi tiết, danh sách các điểm đã được chuẩn hóa.
- **Cổng xác thực (Verification Gate)**: 0 phát hiện Severity High/Critical; hợp đồng remake được xác thực 100%.
- **Điểm dừng phê duyệt (STOP)**: Không (chạy tự động).

---

### Phase 7: Đóng Gói Showcase & Xuất Bản (Final Showcase + Export)
- **Mục tiêu**: Chụp ảnh showcase độ phân giải cao, tạo slide thuyết trình tính năng PPTX, soạn thảo tài liệu mô tả theme chuẩn Haravan Marketplace và đóng gói file ZIP thương mại.
- **Skill cần nạp**: `final-showcase`, `haravan-upload-file`
- **Lệnh / Công cụ thực thi**:
  0. *Cổng handle trước khi chụp (theme-qa-az 0C.20)*: chạy lại `readiness` ở Phase 3 và probe live từng handle (`/pages/<h>` 200 có nội dung, collection có sản phẩm, blog có bài, menu có link). Thiếu page thì tạo bằng `hrv page create --set handle=<h> --set template_suffix=<suffix> --set published=true` sau khi người dùng duyệt lần chạy đó. Không chụp khi còn khối bị ẩn vì handle rỗng/404.
  1. *Chụp ảnh màn hình Showcase*:
     ```bash
     cd E:/Work/tools/RESTYLE_MASTER_KIT
     npm run final:capture -- --base https://<SHOP_DOMAIN> --theme-id <THEME_ID> --out <TARGET_THEME_PATH>/final-showcase
     ```
     Script tự động cuộn từng bước, kích hoạt class `aos-animate`, cưỡng bức hoàn thành web animations (`a.finish()`), và bơm CSS triệt tiêu hoàn toàn `#preview-bar-iframe`, `#admin_bar_iframe`, popup khuyến mãi trước khi chụp.
     *Lưu ý*: Loại trừ các màn auth (`login: ''`, `register: ''` trong `CAPTURE_PATHS.json`) để không làm rối deck tính năng.
  1b. *Bằng chứng tương tác tính năng (Feature Evidence)*:
     Với từng tính năng trong contract, bắt buộc chạy probe tương tác thật trên trình duyệt và ghi file `<TARGET_THEME_PATH>/deliverables/final-approval/features/<name>.json` kèm ảnh chụp màn hình thực tế. Trước khi chụp phải đóng toàn bộ popup newsletter/khuyến mãi (thiết lập cờ `sessionStorage`/`localStorage` tương ứng; nếu thẻ `body` còn class `scroll-locked` nghĩa là popup vẫn đang mở). Bắt buộc kiểm tra thống kê ảnh bằng `sharp.stats()` và loại bỏ ngay mọi ảnh chụp bị lặp ô (tiled) hoặc trắng/rỗng.
  2. *Tạo Slide Thuyết Trình Tính Năng (Feature Deck)*:
     ```bash
     npm run final:pptx -- --root <TARGET_THEME_PATH>
     ```
     Tạo slide PPTX với hình ảnh aspect-fit, canh lề chuẩn xác, ảnh nền chọn lọc theo từ khóa feature, thẻ sản phẩm stage riêng, widget crop chặt chẽ trên nền `#f3f4f6`.
  3. *Soạn thảo `THEME_DESCRIPTION.html` Chuẩn Haravan Partners*:
     - Cấu trúc: HTML fragment chuẩn Bootstrap 3 đồng bộ S2 Spa (pill tagline, 4 pillar cards, 8 page cards link URL thật, 7 features so le `col-sm-push-6`/`pull-6`, spec table, CTA box).
     - **BỘ LỌC KÝ TỰ BẮT BUỘC (CHARACTER ALLOWLIST)**:
       Chỉ cho phép chữ cái (kể cả tiếng Việt có dấu), chữ số, khoảng trắng và các ký tự `. , : - ( )`.
       Dùng từ "và" thay cho `&amp;`.
       TUYỆT ĐỐI CẤM: Emoji, icon, dấu bullet (•, ▸), gạch ngang dài (em dash), ngoặc kép cong, HTML comments.
     - **ẢNH CDN THẬT**: 100% thẻ `<img>` phải sử dụng link ảnh thật đã upload lên Haravan Files (`https://cdn.hstatic.net/files/...`).
  4. *Kiểm tra tài liệu mô tả*:
     ```bash
     npm run description:check -- --file <TARGET_THEME_PATH>/final-showcase/THEME_DESCRIPTION.html --probe
     ```
     Script kiểm tra tính hợp lệ của fragment HTML, quét ký tự cấm và gửi HEAD request HTTP đối soát mã 200 cho toàn bộ link ảnh CDN.
  5. *Tải ảnh lên Haravan Files*: Xin phép người dùng trước khi upload ảnh showcase lên Haravan Files CDN.
  6. *Đóng gói file ZIP thương mại*:
     ```bash
     npm run final:export -- --root <TARGET_THEME_PATH> --brand "<Brand>-<Theme>" --out <TARGET_THEME_PATH>/final-showcase --local
     ```
     Tạo file ZIP định danh chuẩn `Haravan-<Brand>-<Theme>-vYYYYMMDD-HHmm.zip` từ source local (`--local` là mặc định; không gọi CLI Haravan). Chỉ dùng `--cli` (export snapshot remote) khi người dùng yêu cầu rõ; khi đó script tự dọn file `Theme-DD_MM_YYYY.zip` tạm CLI để lại ở thư mục gốc theme.
  7. *Quét dư lượng trong file ZIP*:
     ```bash
     npm run residue:scan -- --root <TARGET_THEME_PATH> --zip <TARGET_THEME_PATH>/final-showcase/<FILE_NAME>.zip --brand "<Brand cũ>"
     ```
  8. *Kiểm định nghiệm thu chốt hạ (Final Guard)*:
     ```bash
     npm run guard:final -- --root <TARGET_THEME_PATH> --out <TARGET_THEME_PATH>/final-showcase --require-zip --require-pptx --require-remake-contract [--allow-structural-qa "<reason>"]
     ```
     Xác thực sổ cái `RESTYLE_PROGRESS_LEDGER.md` không còn ô `| pending |` và không còn dòng mẫu `Checkpoint - chưa final`, contract đạt 100%, file ZIP và PPTX hợp lệ. Lưu ý: `guard:final` (`workflow_final_guard.js`) sẽ **FAIL** nếu sổ cái còn bất kỳ dòng nào mang trạng thái `structural` hoặc `QA-debt`, trừ khi người dùng đã phê duyệt miễn trừ rõ ràng và truyền qua cờ `--allow-structural-qa "<reason>"`. Tuyệt đối không được ghi `Final approval | passed` trong sổ cái khi các dòng QA preview vẫn đang là `structural (QA-debt)`.
- **Kết quả đầu ra trên đĩa**:
  - `<TARGET_THEME_PATH>/final-showcase/Haravan-<Brand>-<Theme>-v*.zip`
  - `<TARGET_THEME_PATH>/final-showcase/feature-deck.pptx`
  - `<TARGET_THEME_PATH>/final-showcase/THEME_DESCRIPTION.html`
  - `<TARGET_THEME_PATH>/final-showcase/pages/*.png`
- **Cổng xác thực (Verification Gate)**: `npm run guard:final` thoát mã 0 (PASS, không còn `structural`/`QA-debt` trái phép hoặc đã đính kèm waiver `--allow-structural-qa` hợp lệ), bộ bằng chứng `deliverables/final-approval/features/*.json` đầy đủ (ảnh không lặp/trắng, không kẹt `scroll-locked`), `description:check` đạt 0 lỗi ký tự và 100% ảnh 200 OK.
- **Điểm dừng phê duyệt (STOP 3)**: **Trình bày toàn bộ Gói Bằng Chứng Final Showcase (Slide PPTX, Ảnh chụp, Mô tả HTML, File ZIP và Báo cáo nghiệm thu) cho người dùng phê duyệt trước khi nộp lên kho theme.**

---

### Phase 8: Nộp Hồ Sơ Haravan Partners (Partners Submission)
- **Mục tiêu**: Tự động hóa chuẩn bị và điền thông tin vào form tạo theme Haravan Partners trên trình duyệt AntiFan an toàn, dừng lại chờ người dùng nhấn nút xuất bản cuối cùng.
- **Skill cần nạp**: `haravan-partners-theme-submit` (công cụ AntiFan MCP `anti.browser.*`)
- **Lệnh / Công cụ thực thi**:
  1. *Kết nối tab trình duyệt*:
     Yêu cầu người dùng cung cấp Tab ID của trang nộp theme (https://partners.haravan.com/themes/new).
  2. *Bước 1 — Đính kèm cả 3 file (`Website image`, `Mobile image`, `Theme .zip`) TRƯỚC qua `DataTransfer` & chờ 500ms*:
     Trang Partners chặn localhost bằng CSP, đồng thời khi đính kèm file `.zip` React form sẽ mount thêm trường `Version` và `Note` và **xóa trắng** `Theme *` cùng `Demo website *` nếu điền chữ trước. Do đó bắt buộc:
     - Mã hóa Base64 từng chunk <= 1.5MB cho Desktop image, Mobile image, và file `.zip`.
     - Gán cả 3 file vào `document.querySelectorAll('input[type="file"]')[0..2]` qua `DataTransfer`, bắn sự kiện `input`, `change`, và **chờ `500ms`** để `Version`/`Note` mount xong.
  3. *Bước 2 — Điền các trường văn bản và mô tả rich text CKEditor*:
     - Điền các trường: `Theme Name`, `Demo Website`, `Price`, `Version`, `Note`.
     - Điền nội dung `THEME_DESCRIPTION.html` vào CKEditor bằng `CKEDITOR.instances.editor1.setData(htmlText)` rồi gọi `CKEDITOR.instances.editor1.updateElement()`.
  4. *Bước 3 — Đọc lại toàn bộ giá trị & đối soát SHA-256 trước khi dừng chờ duyệt*:
     - Đọc lại toàn bộ trường text trên DOM (đảm bảo không bị rỗng) và đối soát mã hash SHA-256 của file `.zip` trong trang qua `crypto.subtle.digest`.
  5. *DỪNG LẠI TẠI FORM - BẢO VỆ NÚT BẤM XUẤT BẢN*:
     **TUYỆT ĐỐI CẤM click vào nút "Tạo giao diện" / "Create theme" (hoặc "Update" khi cập nhật theme đã có) nếu chưa có lệnh phê duyệt rõ ràng từ người dùng trong lượt chat hiện tại cho đúng hành động đó: Create và Update mỗi hành động cần duyệt riêng.**
  6. *Cập nhật phiên bản theme đã có (Partners Update trên `/themes/detail/<n>`)*:
     - Thực hiện sau cổng log-triage của `final-showcase` (`qa-gate-report.json` PASS, log mở đã triage, `guard:final` PASS) theo skill `haravan-partners-theme-submit` (điền Version, Update scope Minor/Major, Notes on file changes).
     - Trên URL `https://partners.haravan.com/themes/detail/<n>`, hàm `diff()` của `partners-form.js` sẽ báo `THEME_ID_UNKNOWN` ("No theme id in the URL") và `UNEXPECTED_CHANGE` do các ô `input[type="file"]` và `textarea` không có label/name: phải trích xuất expected theme ID từ đường dẫn `/themes/detail/(\d+)` và coi các trường không nhãn `File[2]` / scope / notes là các trường hợp lệ được phép thay đổi.
     - Khi gọi `diff(before, after)`, bắt buộc truyền tham số là **object** đã parse, tuyệt đối không truyền chuỗi JSON (truyền string sẽ gây lỗi `CAPABILITY_ERROR: SyntaxError "[object Object]" is not valid JSON`).
     - Huy hiệu phiên bản (Version badge) sau khi đính kèm file `.zip` sẽ hiển thị số phiên bản kế tiếp (ví dụ `1.0002`); nếu các phiên bản cũ hơn trong bảng vẫn ở trạng thái `Pending` nghĩa là nhiều yêu cầu cập nhật đang xếp hàng chờ duyệt.
     - Sau khi người dùng duyệt và nhấn nút `Update`, tuyệt đối không gọi `anti.browser.reload` trên tab đó vì sẽ làm tab rơi vào `TARGET_STALE` (mất tab khỏi `tabs.list`). Cách xác minh chuẩn: mở một tab mới (`anti.browser.tabs.create`) tới `/themes/detail/<n>`, đọc bảng "Version Status" để xác nhận dòng phiên bản mới đã được ghi nhận, sau đó đóng tab tạm này lại — tuyệt đối không bấm submit lại.
- **Kết quả đầu ra trên đĩa**: Biên bản điền form, kết quả `diff(before, after)`, mã hash SHA-256 đối soát của file ZIP và ảnh, cùng bằng chứng dòng phiên bản mới trong bảng "Version Status" (khi Update).
- **Cổng xác thực (Verification Gate)**: Mọi trường trên form hiển thị đúng, file ZIP đính kèm thành công, SHA-256 khớp 100%, xác nhận trạng thái phiên bản qua tab mới mà không submit trùng.
- **Điểm dừng phê duyệt (STOP)**: Người dùng phê duyệt riêng biệt trước khi bấm nút Publish/Create theme hoặc nút Update trên giao diện Haravan Partners.

---

### Phase 9: Tổng Kết & Vòng Lặp Học Hỏi (Retro & Learning Loop)
- **Mục tiêu**: Đúc kết các bài học kỹ thuật mới, cập nhật nhật ký cải tiến và đưa các phát hiện lỗi vào kho tri thức chung của hệ thống.
- **Skill cần nạp**: `learning-loop`, `ak-journal`
- **Lệnh / Công cụ thực thi**:
  1. *Cập nhật nhật ký cải tiến*:
     Hoàn thiện file `<TARGET_THEME_PATH>/deliverables/SKILL_IMPROVEMENT_LOG.md` theo biểu mẫu chuẩn của kit.
  2. *Kích hoạt Learning Loop*:
     Tổng hợp các lỗi phát sinh trong suốt quá trình xây dựng theme và đề xuất giải pháp vào `bugs/<nhánh>.md` hoặc `bugs/chung.md`.
  3. *Lưu trữ tri thức bền vững*:
     Cập nhật các mẫu fix hiệu quả vào hệ thống để các lượt chạy theme tiếp theo tự động kế thừa.
- **Kết quả đầu ra trên đĩa**: File `SKILL_IMPROVEMENT_LOG.md` hoàn chỉnh, các proposal học hỏi được stage trong `docs/learning/`.
- **Cổng xác thực (Verification Gate)**: Tất cả bài học được ghi nhận đầy đủ, không để sót phát hiện kỹ thuật quan trọng.
- **Điểm dừng phê duyệt (STOP)**: Không (chạy tự động).

---

## 3. Bảng Tổng Hợp Bẫy Kỹ Thuật Thường Gặp (Known Pitfalls)

Bảng cô đọng 41 lỗi kỹ thuật mã nguồn và nền tảng nghiêm trọng nhất kèm quy tắc phòng tránh bắt buộc:

| STT | Vấn đề / Triệu chứng lỗi | Nguyên nhân gốc rễ | Quy tắc phòng tránh & Cách khắc phục |
|---|---|---|---|
| 1 | Thiếu định danh trong `.haravan-cli_local.json` | File chỉ có `org_id`, thiếu `shop` và `theme_id` | Chạy Preflight kiểm tra định danh trước khi nạp demo data |
| 2 | Lệch ngành hàng catalog shop với theme | Shop đang chứa dữ liệu của ngành hàng cũ khác | Kiểm tra đối soát catalog ở Phase 0; chủ động nạp lại catalog mới |
| 3 | Mất toàn bộ lịch sử chat OMP | Di chuyển hoặc đổi tên thư mục theme giữa chừng | Khóa cứng CWD ngay từ đầu; cấm tuyệt đối di chuyển folder dự án |
| 4 | Mất token API STITCH / AIBOX trên Windows | Biến môi trường không kế thừa vào phiên agent | Đọc dự phòng từ Windows Registry `HKCU\Environment` |
| 5 | Watcher `hrv theme dev` chạy trùng lặp | Nhiều tiến trình cùng watch gây xung đột đồng bộ | Preflight báo PID ở Phase 0; user tự tắt bản thừa, agent không kill |
| 6 | Lỗi fatal khi chạy lệnh git | Thư mục theme chưa `git init` | Kiểm tra `git rev-parse --git-dir` trước; chưa có repo thì `git init` cục bộ theo Phase 6 (`.gitignore` trước, không remote) hoặc dùng snapshot diff |
| 7 | Tàn dư thương hiệu cũ trong `settings_data.json` | Quét case-sensitive bỏ sót slug chữ thường và email | Dùng `npm run residue:scan` quét case-insensitive cả slug và email |
| 8 | Lỗi render ngầm do filter `\| json` | Haravan không hỗ trợ `\| json` trong markup HTML | Thanh lọc triệt để; thay bằng `\| escape` hoặc JSON thủ công |
| 9 | Lỗi Server 500 do thẻ `{% continue %}` | Engine DotLiquid của Haravan không hỗ trợ `continue` | CẤM dùng `continue`; thay thế bằng bọc điều kiện `{% unless %}` |
| 10 | Lỗi cú pháp Shopify `{% schema %}` và `{% render %}` | Thói quen code Shopify bị đưa nhầm sang Haravan | F1GENZ chỉ dùng `settings_schema.json` và dùng `{% include %}` |
| 11 | Fallback text cứng trong `\| default: '...'` | Vi phạm chính sách merchant (muốn xóa trống để ẩn) | Dùng `{% if settings.key != blank %}` thay vì gán text mặc định |
| 12 | Xung đột biến `let recaptchaElm` khi có nhiều form | Haravan inject script reCAPTCHA trùng tên biến | Bọc form và replace `recaptchaElm`/`recaptchaForm` bằng id duy nhất |
| 13 | Redirect `/account/login` sang trang hosted auth | Cửa hàng kích hoạt Haravan Hosted Accounts | Probe `fetch('/account/login', {redirect: 'manual'})` xử lý 2 chế độ |
| 14 | Tràn ngang 375px do button và flex | Grid không co giãn được trên màn hình nhỏ | Dùng `minmax(0, 1fr)` cho button và `flex-direction: column` mobile |
| 15 | Filter Drawer tràn màn hình khi đóng | Dùng `translateX(100%)` nhưng thiếu `visibility` | Bắt buộc thêm `visibility: hidden; pointer-events: none` khi đóng |
| 16 | CLS cao (0.54 - 1.0) khi reload giữa trang | Thuộc tính `scroll-behavior: smooth` trên toàn cục `html` | Xóa rule trên `html`; chỉ áp dụng `html:focus-within { scroll-behavior: smooth; }` |
| 17 | Khoảng trắng khổng lồ do AOS animation | Selector `:not(.aos-animate) > * { opacity: 0; }` | Xóa bỏ rule ẩn con triệt để; giữ opacity mặc định hiển thị nội dung |
| 18 | Rớt hover chuột tại Megamenu desktop | Khe hở vật lý giữa trigger và dropdown menu | Thêm pseudo-element `::before` (`top: -15px`) làm cầu nối hover |
| 19 | Mất chức năng hover trên màn hình cảm ứng | Thiết bị di động không có chuột để hover | Bọc `:hover` trong `@media (hover: hover)`; trên touch dùng cơ chế 2 chạm |
| 20 | Badge giảm giá hiển thị `-0%` hoặc `-100%` | Làm tròn số trên mức giảm nhỏ hoặc sản phẩm 0đ | Kiểm tra điều kiện đa tầng `price > 0 && compare > price` trước khi tính |
| 21 | Nút Mua vẫn hiện trên sản phẩm giá Liên hệ (0đ) | Thiếu kiểm tra giá trị bằng 0 trong Liquid/JS | Gắn `data-variant-buyable` kiểm tra `price > 0 && available` |
| 22 | Selector bare tag (`input`, `select`) làm vỡ Customizer | CSS reset quá rộng đè lên UI Admin Haravan | Bọc các rule form trong BEM class hoặc `:where(.theme-shell)` |
| 23 | Ký tự tiếng Việt bị double escape trong tìm kiếm | Dùng thêm `\| escape` trên `search.terms` | Không escape biến `search.terms` vì Haravan core đã tự escape |
| 24 | Link lọc tag danh mục trả về 0 sản phẩm | Dùng link dạng `/collections/<handle>/<tag>` | Luôn dùng cấu trúc link toàn cục `/collections/all/<tag>` |
| 25 | Timeout 300s (`-32001`) khi gọi Stitch API | Gửi prompt toàn trang quá dài vượt trần gateway | Chia trang thành các chunk <= 6 sections (~1KB text mỗi chunk) |
| 26 | Lỗi cmd.exe ngắt dòng prompt trên Windows | Windows cmd.exe cắt chuỗi argv tại ký tự `\n` | Ghi prompt ra file tạm và truyền qua cờ `--prompt-file` |
| 27 | Lỗi `CAPTURE_FRAME_STARVATION` trên AntiFan | Compositor dừng kết xuất khung hình screenshot | Reload 1 lần; fallback sang đọc DOM/computed styles qua evaluate |
| 28 | AntiFan QA báo FAIL giả trên route 404 | Nhận diện HTTP 404 là tài nguyên hỏng | Miễn trừ kiểm tra 404 cho route kiểm thử 404 có chủ đích |
| 29 | DOM unstable do hero carousel tự chạy | Slider autoplay liên tục thay đổi DOM làm fail QA | Gọi `anti.media.freeze` hoặc tạm dừng autoplay trước khi đo |
| 30 | `THEME_DESCRIPTION.html` chứa emoji/ký tự lạ | Bị Haravan Marketplace từ chối duyệt | Dùng `npm run description:check` kiểm tra regex allowlist và ảnh CDN |
| 31 | File ZIP thừa tại theme root sau khi export | CLI export để lại file `Theme-DD_MM_YYYY.zip` | Script `final_theme_export.js` tự động xóa file tạm ở root |
| 32 | Python eval giữ file lock ZIP trên Windows | Quên đóng file stream gây lỗi `os error 32` | Luôn dùng context manager `with zipfile.ZipFile(...) as z:` |
| 33 | `theme.qa_validate` báo `PASS` nhưng `certification: STRUCTURAL` | Chưa có baseline so ảnh theo từng viewport nên chỉ mới đạt cấu trúc (`QA-debt`) | Promote baseline từ màn hình user duyệt (0 critical) và chạy `anti.visual.compare` có `expectedUrl` để đạt `CERTIFIED` |
| 34 | `anti.visual.compare` trả về `INCONCLUSIVE` (`URL_EXPECTATION_MISSING`) hoặc treo trên trang chủ | Thiếu tham số `expectedUrl` hoặc trang chủ có countdown/marquee/swiper/sticky scroll làm capture không hội tụ | Luôn truyền `expectedUrl`/`expectedTargetUrl`; nếu trang chủ động vẫn `INCONCLUSIVE` sau khi đóng băng media thì ghi nhận là giới hạn công cụ, cấm tự chấm `PASS` |
| 35 | `guard:final` báo PASS dù QA trong sổ cái còn `structural (QA-debt)` | Sổ cái ghi `Final approval \| passed` trong khi dòng preview vẫn là `structural` / `QA-debt` | Không đặt `Final approval \| passed` khi QA còn `structural`; `guard:final` chặn `structural`/`QA-debt` trừ khi có `--allow-structural-qa "<reason>"` do user duyệt |
| 36 | `theme.cockpit_scan` lỗi `INVALID_ARGUMENT` (`page-contact`) hoặc 404 trên `page-about` | Khóa trang không thuộc `PAGE_DEFS` hoặc handle thật trên shop khác `/pages/about-us` (ví dụ `/pages/gioi-thieu`) | Đọc handle thật từ `/sitemap_pages_1.xml?themeid=...` và truyền trực tiếp `url: '/pages/<real-handle>'` |
| 37 | Cockpit báo lỗi giả `PDP-04` (`document generation is stale`) và `HOM-08` (thiếu newsletter) | Probe không làm mới generation giữa các lần click swatch; form newsletter đặt trong `footer` thay vì section riêng | Xác minh đổi biến thể bằng feature probe riêng (`?variant=` + ảnh chính), kiểm tra newsletter trong footer, và đánh dấu `account` là `EXTERNAL` khi `authRedirect: true` |
| 38 | Lỗi `4001 Unauthorized` hoặc thiếu tham số schema MCP sau khi nâng cấp/restart AntiFan | Phiên OMP giữ kết nối MCP/schema cũ hoặc AntiFan vừa restart đã cấp lại token và Tab ID mới | Khi restart AntiFan phải chờ PID chính tắt hẳn và cổng `20130` giải phóng (`<= 30s`) mới mở lại; sau đó khởi động lại MCP server / phiên OMP và `rebind_target` vào tab có viewport hợp lệ |
| 39 | Lỗi `HOME_SECTION_BUDGET` và `FEATURE_HOOK_MISSING` ở cuối dự án | Thiết kế trang chủ vượt trần 10 sections (`registry/home-structure.json` 6-10) hoặc khai báo file hook không tồn tại (như `templates/collection.filter.liquid`) | Chốt `<= 10` home sections ngay từ Phase 0/Phase 2; dùng đúng `templates/search.catalog.liquid` (`view: 'catalog'`) và `templates/search.filter.liquid` (`view=filter`), kiểm bằng `grep` trước khi `contract_promote.js --feature` |
| 40 | Cảnh báo `image-picker-theme-scoped-url`, `text-typed-number`, `duplicate-semantic-key` và ảnh feature bị lỗi | `image_picker` trỏ vào `cdn.hstatic.net/themes/<org>/<themeId>/...`, mốc giá/freeship dùng kiểu `text`, trùng cặp key bật/tắt, hoặc chụp feature khi popup chưa đóng | Upload ảnh settings qua `haravan-upload-file` lên Files (`file.hstatic.net`), dùng đúng kiểu số, gộp khóa trùng ngữ nghĩa trước khi export; đóng popup (`scroll-locked`) và kiểm tra `sharp.stats()` chống ảnh lặp/trắng |
| 41 | Lỗi `THEME_ID_UNKNOWN`, `UNEXPECTED_CHANGE`, `SyntaxError "[object Object]"` và `TARGET_STALE` khi Update Partners | Trang `/themes/detail/<n>` dùng input không nhãn, truyền chuỗi JSON thay vì object vào `diff()`, và `reload` sau khi bấm Update làm mất tab | Lấy theme ID từ `/themes/detail/(\d+)`, truyền object vào `diff(before, after)`, và sau khi bấm Update phải mở tab mới đọc bảng "Version Status" rồi đóng tab tạm (không submit lại) |

---

## 4. Nguyên Tắc Điều Phối Hệ Thống (Orchestration Rules)

1. **Git trong thư mục Theme chỉ là git cục bộ**:
   Thư mục theme mặc định không phải git repository; kiểm tra `git rev-parse --git-dir` trước mọi lệnh git. Được phép `git init` cục bộ theo Phase 6 (`.gitignore` đủ secret/backup/deliverables TRƯỚC `git init`, baseline commit ngay sau fetch). CẤM `git remote add`, `git push`, và CẤM commit `.haravan-cli_*.json`/`*.har`.
2. **Ghi báo cáo và kết quả trực tiếp ra đĩa (Results to Files)**:
   Mọi subagent review, kiểm thử hoặc phân tích phải ghi kết quả từng phần xuống file markdown hoặc JSON trên đĩa (ví dụ `E:/Work/scratch/<session>/report.md`). Tuyệt đối không dồn toàn bộ dữ liệu vào turn cuối cùng để phòng ngừa mất dữ liệu khi bị timeout hoặc ngắt kết nối.
3. **Quy chuẩn định danh Task Todo**:
   Khi tạo hoặc cập nhật trạng thái todo, sử dụng mã tiền tố ngắn gọn chuẩn hóa (như `D1-D8`, `S1-S8`, `QA1-QA5`) kết hợp tiêu đề ngắn gọn. Tránh sai khác dấu tiếng Việt làm công cụ harness từ chối nhận diện task.
4. **Khắc phục các cạm bẫy Windows Shell**:
   - *Ngắt dòng cmd.exe*: Không bao giờ truyền chuỗi prompt nhiều dòng qua tham số dòng lệnh CLI; luôn lưu prompt ra file và đọc qua file stream.
   - *Mất biến PowerShell*: Không truyền lệnh pipeline PowerShell phức tạp trực tiếp qua công cụ `bash` vì sẽ bị mất biến `$` và `$_`. Hãy lưu lệnh ra file tạm `.ps1` rồi thực thi hoặc chạy qua `powershell -NoProfile -Command "..."`.
   - *Khóa file trên Windows (`os error 32`)*: Khi làm việc với file nén ZIP trong Python, luôn bọc trong khối `with zipfile.ZipFile(...) as z:` để đảm bảo đóng handle ngay sau khi hoàn thành.
5. **Lưu trữ Helper Script vật lý xuống đĩa**:
   Không dựa vào các hàm tiện ích lưu tạm trong bộ nhớ của Python hoặc Node eval kernel vì kernel sẽ bị reset sau các đợt compaction bộ nhớ hoặc khi timeout. Mọi hàm helper QA và kiểm thử phải được lưu thành file script vật lý trong `E:/Work/scratch/` để nạp lại tức thì khi cần.
6. **Giới hạn số lượng Subagent chạy đồng thời**:
   Chỉ cho phép tối đa 2 đến 3 subagents chạy song song khi gọi các model cấp cao để tránh cạn kiệt hạn ngạch API và gặp lỗi `429 RESOURCE_EXHAUSTED`.

---

## 5. Danh Mục Bằng Chứng Bắt Buộc Báo Cáo Theo Từng Phase (Evidence to Report)

Mỗi giai đoạn hoàn thành phải cung cấp đầy đủ các bằng chứng xác thực cụ thể trước khi chuyển sang giai đoạn kế tiếp:

- **Phase 0**:
  - Log xác thực `npm run preflight` (Node version, đường dẫn Haravan executable, trạng thái API keys từ Registry).
  - Trạng thái đường dẫn thư mục đã khóa cố định.
  - Thông tin shop domain và `theme_id` đã xác thực từ `.haravan-cli_local.json`.
  - Kết quả kiểm tra watcher duy nhất.
  - Đường dẫn file `deliverables/THEME_FINGERPRINT.md` và `deliverables/RESTYLE_PROGRESS_LEDGER.md`.
  - Thư mục `deliverables/reference/*.json`, bộ token `designDefaults` đầy đủ và bản ghi duyệt Design Gate.
- **Phase 1**:
  - Số lượng file đã sao chép từ base theme theo từng thư mục.
  - Log kết quả `npm run residue:scan` (kết quả 0 tàn dư tên thương hiệu cũ, email, slug).
  - Báo cáo kết quả `npm run orphan:sweep`.
  - Danh sách ảnh raster > 200KB đã được nén tối ưu.
- **Phase 2**:
  - Báo cáo sinh Stitch từng chunk kèm thời gian thực thi.
  - Đường dẫn ảnh chụp full-page 1440px của từng chunk trong `deliverables/stitch/`.
  - Bảng tổng hợp Conversion Map hoàn chỉnh trình duyệt STOP 1.
- **Phase 3**:
  - Đường dẫn file snapshot backup `body_html` trước khi ghi đè live.
  - Kết quả kiểm định nội dung `validate-content` (số lượng từ, bảng, FAQ).
  - Đường dẫn ảnh Contact Sheet kiểm tra toàn bộ ảnh sản phẩm/biến thể/blog.
  - Log nạp catalog và blog thành công.
  - Đường dẫn tuyệt đối file `HaravanDemoKit/output/<brand>/seed-menus-console.js`.
  - Kết quả `readiness --live` (ảnh biến thể đã gắn, bảng size, menu 3 cấp, 0 placeholder MST/mạng xã hội).
- **Phase 4**:
  - Danh sách phân rã các lát cắt S1-S8 kèm file sở hữu độc quyền.
  - Kết quả kiểm tra `npm run lint:haravan` trên từng slice (0 lỗi cú pháp cấm, 0 lỗi cân bằng thẻ Liquid).
  - Báo cáo cú pháp JS pass `node --check` và cân bằng ngoặc CSS `braceDepthEnd 0`.
  - Bảng đối soát binding `setting-id` và `setting-type` với `config/settings_schema.json`.
  - Slice receipt từng lát cắt (`deliverables/receipts/<slice>.json`) kèm exit code `gate:asset-syntax` và `audit:css-tokens`.
- **Phase 5**:
  - Bảng kết quả quét QA toàn diện trên AntiFan (`theme.qa_validate`) bao phủ 100% routes kèm trường `summary.certification` (`CERTIFIED` trên từng route, hoặc ghi rõ giới hạn công cụ / lý do miễn trừ `--allow-structural-qa` nếu chỉ đạt `STRUCTURAL` kèm xác nhận nguồn baseline đã được người dùng duyệt chứ không phải self-baseline cùng phiên).
  - Kết quả đo đạc responsive tại đủ 5 mốc breakpoint (320px, 375px, 768px, 1024px, 1440px) qua `anti.inspect.responsive_matrix`.
  - Báo cáo chỉ số CLS (<= 0.05) khi F5 giữa trang và chỉ số LCP.
  - Kết quả kiểm tra trợ năng a11y (0 critical/serious).
  - Hình ảnh chứng minh hoạt động của các tương tác cốt lõi: Swiper thumbs, hover megamenu, đổi biến thể qua feature probe (`?variant=` + ảnh chính), nút Liên hệ khi giá 0đ, popup Age-gate 18+.
- **Phase 6**:
  - Báo cáo snapshot diff đối soát với hợp đồng `FULL_REMAKE_CONTRACT.json`.
  - Biên bản code review ghi nhận 0 lỗi High/Critical.
  - Văn bản khuyến nghị của `@kongming` (nếu có kích hoạt tham vấn kiến trúc).
- **Phase 7**:
  - Bộ ảnh screenshot hoàn chỉnh trong `final-showcase/pages/` và bộ bằng chứng tương tác từng tính năng `deliverables/final-approval/features/<name>.json` (đã xác thực không lặp ô/trắng qua `sharp.stats()` và không kẹt `scroll-locked`).
  - File slide thuyết trình tính năng `final-showcase/feature-deck.pptx`.
  - File `final-showcase/THEME_DESCRIPTION.html` đạt chuẩn character allowlist và log probe HTTP 200 cho toàn bộ link ảnh CDN.
  - File ZIP xuất bản thương mại đã được kiểm tra không còn tàn dư thương hiệu cũ và đã xử lý sạch `image-picker-theme-scoped-url`, `text-typed-number`, `duplicate-semantic-key` trước khi đóng gói.
  - Log kết quả `npm run guard:final` thoát mã 0 (PASS 100%) kèm sổ cái tiến độ không còn mục `pending`, trạng thái `summary.certification` của từng route, và nội dung cờ miễn trừ `--allow-structural-qa "<reason>"` (nếu được người dùng phê duyệt sử dụng; tuyệt đối không có `Final approval | passed` mâu thuẫn với QA `structural` không phép).
- **Phase 8**:
  - Ảnh chụp màn hình giao diện form Haravan Partners đã được điền đủ dữ liệu, đính kèm file và kết quả đối soát `diff(before, after)` (truyền bằng object).
  - Mã băm SHA-256 đối soát của file ZIP đính kèm với file local.
  - Xác nhận đã dừng lại an toàn trước nút Create theme / Update để chờ người dùng phê duyệt riêng, và (sau khi Update) bằng chứng dòng phiên bản mới trong bảng "Version Status" đọc từ tab mới mở.
- **Phase 9**:
  - Đường dẫn file `deliverables/SKILL_IMPROVEMENT_LOG.md` đã hoàn thiện.
  - Danh sách các đề xuất học hỏi (learning loop proposals) đã được stage vào `docs/learning/`.
