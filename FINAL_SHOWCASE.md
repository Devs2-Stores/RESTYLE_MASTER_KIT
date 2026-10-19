# Final showcase + feature PPTX (kit)

Canonical rules for sales handoff packs. Full narrative: skill `haravan-stitch-full-run/references/final-showcase-pptx.md`.

## Quick commands

```powershell
# From RESTYLE_MASTER_KIT cwd
npm run final:capture -- --base https://shop.myharavan.com --out <theme>/final-showcase --all-templates --paths-file <theme>/final-showcase/CAPTURE_PATHS.json --theme-id <id>
npm run final:feature-capture -- --base https://shop.myharavan.com --out <theme>/final-showcase --theme-id <id>
npm run final:pptx -- --out <theme>/final-showcase --brand "Brand Name"
npm run guard:final -- --root <theme> --out <theme>/final-showcase --require-pptx
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

## 8 Standard Pages (Capture Taxonomy)

Under `final-showcase/pages/`, capture exactly the **8 standard pages** with Vietnamese titles — **never add custom pages to `pages/` unless the user explicitly requests them** (Account login/register are skipped by default):

1. `Trang chi tiết sản phẩm.png` (Product page / PDP)
2. `Trang nhóm sản phẩm.png` (Collection listing)
3. `Trang danh sách blog.png` (Blog listing)
4. `Trang chi tiết bài viết.png` (Article detail)
5. `Trang về chúng tôi.png` (About us)
6. `Trang hệ thống cửa hàng.png` (Store locator)
7. `Trang liên hệ.png` (Contact)
8. `Trang FAQ.png` (FAQ)

Desktop = `Trang {tên}.png` (no suffix). Mobile optional = `Trang {tên}-mobile.png`.  
`final_showcase_capture.js` writes these automatically (`resolvePageLabel` from path + key).

## FEATURES.json (Capped at 6–7 features)

Merchant Vietnamese: benefits + what to toggle in Theme settings. No CLS/token/Liquid jargon.
**Feature cap:** Exactly **6–7 features** (maximum 7). Do not exceed 7 features to keep the handoff concise and focused.

## PPTX (Standard 10-Slide Sales Deck)

`final_feature_deck.js`: manual aspect-fit from image dimensions, margins ≥0.5", frame pad ≥0.35". Standard deck structure has exactly **10 slides**:
- Slide 1: Bìa (Cover) — Brand, Tagline, Logo & Palette
- Slide 2: Phân đoạn (Section Divider) — "TÍNH NĂNG NỔI BẬT"
- Slides 3–9: 7 slides tính năng nổi bật (tương ứng 6–7 features)
- Slide 10: Lời cảm ơn (Thank You & Support)
Reopen file after rebuild.
## Theme export only

**Naming convention (mandatory):** `Haravan-<Brand>-<Theme>-<Version>.zip` and `Sapo-<Brand>-<Theme>-<Version>.zip` where `<Version>` = **`vYYYYMMDD-HHmm`** (time granularity — a theme is re-exported multiple times/day, so date-only collides). The stamp is **per-artifact build time**: Haravan (remote export) and Sapo (local convert) are built from different sources at different times, so their stamps need NOT match. The scripts auto-derive the stamp (`final_theme_export.js --brand <B> [--version <v>]`, `fresh_reconvert.py --version <v>`); never hand-type or re-use it. See skill `haravan-stitch-full-run/references/final-showcase-pptx.md` → "Theme export naming convention".

```powershell
# From RESTYLE_MASTER_KIT
npm run final:export -- --root "C:\path\to\theme" --brand "<Brand>-<Theme>" --out "C:\path\to\theme\final-showcase"
```
**CLI note (Haravan 1.1.x):** `haravan theme export` does **not** accept `--file`. The kit script runs export in the theme root, then copies the newest zip to `--out/--file` and moves the raw CLI export zip (`Theme-DD_MM_YYYY.zip`) into `final-showcase/raw/` (or deletes it) so **no raw CLI zip remains in deliverables**. Only the canonical handoff zip `Haravan-<Brand>-<Theme>-v<stamp>.zip` sits in `final-showcase/`.

Fallback manual:
```powershell
cd C:\path\to\theme
haravan theme export
copy .\*-*.zip .\final-showcase\Haravan-<Brand>-<Theme>-vYYYYMMDD-HHmm.zip
move .\*-*.zip .\final-showcase\raw\
```
## Pre-final UI traps

See skill `haravan-stitch-full-run/references/post-restyle-qa-checklist.md`:

- Sass mixed-unit `min()` → use `#{"min(78vh, 720px)"}`
- Product card hover: never `opacity:1 !important` on all card imgs
- Long header menu: clip + arrows + fixed mega
- Collection default 4 columns; toolbar icons = vertical bars
- PDP gallery: contain+center; don’t grid-force slick
