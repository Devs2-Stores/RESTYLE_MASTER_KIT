# Theme Fingerprint

Điền file này trước khi code. Không tạo pattern mới cho slider, card, icon, font, settings, container hoặc JS lifecycle nếu chưa chứng minh theme hiện tại không có pattern dùng được.

## Project

- Project:
- Date:
- Theme root:
- Issue source:
- Scope:
- Preview URL:
- Source of truth khi mâu thuẫn:

## Quick Checklist

Điền phần này trước — 5 phút, để đủ agent biết không cần tạo mới gì.

| Mục | Có sẵn? | Pattern dùng được? | Ghi chú |
|---|---|---|---|
| Container / page-width | [ ] | [ ] | |
| CSS variables / tokens | [ ] | [ ] | |
| Breakpoints | [ ] | [ ] | |
| Slider / carousel library | [ ] | [ ] | |
| Product card snippet | [ ] | [ ] | |
| Article card snippet | [ ] | [ ] | |
| Icon system | [ ] | [ ] | |
| Font loading | [ ] | [ ] | |
| JS init / destroy pattern | [ ] | [ ] | |
| Settings pattern (settings.html) | [ ] | [ ] | |
| Cart drawer / modal | [ ] | [ ] | |
| Search modal | [ ] | [ ] | |

**Rule**: Chỉ tạo mới khi cột "Pattern dùng được?" = không. Ghi lý do vào cột Ghi chú.

---

## Entry Points

- Layout chính:
- CSS include trong head:
- JS include trong head/footer:
- Header snippet:
- Footer snippet:
- Template trong scope:
- Section/snippet liên quan:

Commands:

```powershell
rg -n "asset_url.*css|stylesheet|script_tag|asset_url.*js|include 'header'|include 'footer'|render 'header'|render 'footer'" layout snippets templates
```

## CSS Architecture

- Global CSS:
- Template/module CSS:
- Naming style:
- Container class:
- Page width/max width source:
- Breakpoints:
- CSS variables/tokens:
- Font loading:
- Risky globals:

Commands:

```powershell
rg -n ":root|--|container|max-width|page-width|@media|font-family" assets snippets templates config
```

Decision:

- [ ] Dùng container/token có sẵn.
- [ ] Chỉ thêm token scoped vì theme thiếu.
- [ ] Không hardcode `1280px`.
- [ ] Nếu design 1280 từ Stitch, map sang `page-width`/container hoặc 1920 theo yêu cầu user.

## Design System / Tokens / Fonts

- Existing token source:
- Primary palette:
- Surface/background:
- Text colors:
- Border/radius:
- Spacing rhythm:
- Button style:
- Image treatment:
- Font decision:

Reuse decision:

- [ ] Giữ font system hiện tại.
- [ ] Thêm font mới có lý do rõ.
- [ ] Không để generated code kéo CDN/font ngoài nếu theme đã có system.

## JavaScript Lifecycle

- Library stack:
- Init pattern:
- Reinit pattern:
- Destroy pattern:
- Event delegation:
- AJAX update surfaces:
- Section reload / modal / drawer behavior:
- Risks:

Commands:

```powershell
rg -n "document\\.ready|addEventListener|init|destroy|reinit|ajax|fetch|new Swiper|slick\\(|owlCarousel|theme\\." assets snippets templates layout
```

## Slider / Carousel

- Existing library:
- Existing helper/component:
- Init location:
- Multi-instance behavior:
- Mobile behavior:
- Reinit/destroy requirement:
- Decision:

Rule: reuse existing slider/helper first. If none exists, prefer Swiper. Do not hand-roll slider until this section proves no usable pattern exists.

## Product Card

- Snippet:
- Inputs/variables:
- Modifiers:
- Used by:
- Image ratio:
- Price/sale logic:
- Add-cart/quickview hooks:
- Badge/wishlist/compare:
- Decision:

Commands:

```powershell
rg -n "product-card|include 'product|render 'product|quickview|add-to-cart|wishlist|compare" templates snippets assets
```

## Article Card / Blog

- Snippet:
- Inputs/variables:
- Used by:
- Image ratio:
- Tag/date/author pattern:
- Empty/fallback pattern:
- Decision:

## Product Detail

- Template:
- Gallery:
- Variant picker:
- Add-to-cart form:
- Quantity control:
- Sticky CTA:
- Product tabs/description:
- Related products:
- Risks:

## Collection / Search

- Templates:
- Filter source:
- Sort/pagination:
- AJAX/reload:
- Empty state:
- Product card include:
- Mobile filter behavior:
- Risks:

## Cart / Modal / Search UI

- Cart page:
- Cart drawer/modal:
- Search modal:
- Quickview:
- Wishlist/compare:
- Account/login surfaces:
- Risks:

## Icon System

- Existing icon source:
- SVG sprite/snippet:
- FontAwesome/Iconify/Material Symbols:
- Social icons:
- Payment icons:
- Decision:

Commands:

```powershell
rg -n "include 'icon'|render 'icon'|icons-sprite|fontawesome|iconify|material-symbols|<svg" snippets assets layout
```

## Settings Pattern

- Settings file:
- Grouping:
- Toggle pattern:
- Naming convention:
- Select classes:
- Nested fieldset pattern:
- Preview image pattern:
- `settings_data.json` permission:
- Decision:

Commands:

```powershell
rg -n "_check|class=\"collection\"|class=\"blog\"|class=\"page\"|class=\"linklist\"|fieldset|legend|type=\"image\"" config/settings.html
```

Rule:

- [ ] Product/blog/collection/page/menu phải dùng select class đúng loại.
- [ ] Không sửa `config/settings_data.json` nếu chưa có permission hiện tại.
- [ ] Brand/demo copy, link, ảnh, collection/blog/page chọn thủ công phải có setting/data phù hợp.

## Content Boundary

- System/action labels có thể hardcode:
- Storefront copy phải lấy từ settings/data:
- Object content phải lấy từ product/article/collection/page:
- Demo/fallback copy cần loại bỏ:
- Copy tiếng Anh cần Việt hóa:

Rule:

- [ ] Không hard text/demo/default/fallback trong Liquid trừ system/action label.
- [ ] Không tạo nội dung giả chỉ để preview nếu không có setting/data tương ứng.

## Asset Pattern

- Naming convention:
- Existing brand assets:
- Placeholder asset:
- Final target sizes:
- Compression/finalization:
- Demo metadata location:
- Decision:

Rule:

- [ ] Không thay asset mới vào code cũ trước khi refactor shared layer.
- [ ] Không để file raw/cache/metadata trong `assets/`.
- [ ] Ảnh final phải đúng ratio/size cần dùng.

## SEO / Accessibility Base

- Skip link:
- Breadcrumb:
- H1 pattern:
- Alt helper:
- Focus state:
- Form label pattern:
- Tap target:
- Contrast risk:

## Final Decision

- Reuse:
- Scoped additions allowed:
- New systems explicitly rejected:
- Blockers:
- First implementation phase:
- QA scope sau refactor:
