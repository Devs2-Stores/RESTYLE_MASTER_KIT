# Final showcase + feature PPTX (kit)

Canonical rules for sales handoff packs. Full narrative: skill `haravan-stitch-full-run/references/final-showcase-pptx.md`.

## Quick commands

```powershell
# From RESTYLE_MASTER_KIT cwd
npm run final:capture -- --base https://shop.myharavan.com --all-templates --paths-file ../final-showcase/CAPTURE_PATHS.json --theme-id <id>
npm run final:feature-capture -- --base https://shop.myharavan.com --out ../final-showcase --theme-id <id>
npm run final:pptx -- --out ../final-showcase --brand "Brand Name"
npm run guard:final -- --root <theme> --require-pptx
```

For production-quality **widget** crops (pop-sale, popnoti, social, search, cart stage), use `scripts/final_feature_pack.example.js` as the reference implementation (stage canvas + modal kill + taxonomy).

## Capture taxonomy

| Kind | Method |
|---|---|
| Floating widget | Tight crop on `#f3f4f6`, 16–20px pad, force `!important` open |
| Homepage section | Fullpage → crop by document Y; kill `#shop-modal-contact` first |
| Product card | Clone card onto neutral stage |
| Custom `page.*` | Full-page desktop (about/store/contact/faq/gallery/…) |
| Home mobile | Always `Trang chủ-mobile.png` (276×480); not in feature slides unless asked |

## Page file naming (human-readable)

Under `final-showcase/pages/`, use Vietnamese titles — **not** machine keys:

```text
Trang chi tiết sản phẩm.png
Trang chi tiết bài viết.png
Trang nhóm sản phẩm.png
Trang danh sách blog.png
Trang về chúng tôi.png
Trang hệ thống cửa hàng.png
Trang đăng nhập.png
Trang đăng ký.png
```

Desktop = `Trang {tên}.png` (no suffix). Mobile optional = `Trang {tên}-mobile.png`.  
`final_showcase_capture.js` writes these automatically (`resolvePageLabel` from path + key).

## FEATURES.json

Merchant Vietnamese: benefits + what to toggle in Theme settings. No CLS/token/Liquid jargon.

## PPTX

`final_feature_deck.js`: manual aspect-fit from image dimensions, margins ≥0.5", frame pad ≥0.35". Reopen file after rebuild.

## Theme export only

```powershell
# From RESTYLE_MASTER_KIT
npm run final:export -- --root "C:\path\to\theme" --file "Brand-final-theme.zip" --out "C:\path\to\theme\final-showcase"
```

**CLI note (Haravan 1.1.x):** `haravan theme export` does **not** accept `--file`. The kit script runs export in the theme root, then copies the newest zip to `--out/--file`. Fallback manual:

```powershell
cd C:\path\to\theme
haravan theme export
copy .\*-*.zip .\final-showcase\Brand-final-theme.zip
```

## Pre-final UI traps

See skill `haravan-stitch-full-run/references/post-restyle-qa-checklist.md`:

- Sass mixed-unit `min()` → use `#{"min(78vh, 720px)"}`
- Product card hover: never `opacity:1 !important` on all card imgs
- Long header menu: clip + arrows + fixed mega
- Collection default 4 columns; toolbar icons = vertical bars
- PDP gallery: contain+center; don’t grid-force slick
