# Stitch Prompt Template For Haravan Restyle

Use this template before generating screens in Google Stitch or Stitch MCP. The goal is to get designs that convert cleanly into a Haravan theme using `HARAVAN_THEME_RESTYLE_WORKFLOW.md`.

## How To Use

1. Fill the project fields.
2. Choose the prompt mode:
   - `Creative Direction`: let Stitch explore layout and section composition.
   - `Conversion-Safe`: keep ecommerce states and dynamic data very explicit.
3. Pick the page type and module intent. Do not force every module into the screen.
4. Paste the final prompt into Stitch, or pass it to Stitch MCP `generate_screen_from_text`.
5. After Stitch generates the screen, run the conversion workflow:
   - Preflight + điền `THEME_FINGERPRINT.template.md`
   - Chạy `node stitch_consume.js --in <stitch-export> --out scratch/stitch/<screen>`
   - Điền `section-config.template.json` + `asset-plan.template.json`
   - Implement theo `STITCH_FIDELITY.md`
   - QA bằng `qa_restyle_check.js` + `a11y_deep.js`

## Master Prompt

```markdown
Create a high-fidelity ecommerce storefront design for a Haravan theme restyle.

**PROJECT CONTEXT**
- Brand name: [BRAND_NAME]
- Industry/category: [BEAUTY / FASHION / HOME / FOOD / TECH / OTHER]
- Target customer: [TARGET_CUSTOMER]
- Desired mood: [MINIMAL / LUXURY / EDITORIAL / PREMIUM RETAIL / ORGANIC / PLAYFUL / TECH]
- Main conversion goal: [BUY PRODUCT / BOOK SERVICE / READ CONTENT / CONTACT / FIND STORE]
- Source of truth: [STITCH MCP PROJECT/SCREEN / STITCH NEW DESIGN / EXISTING SITE RESTYLE / SCREENSHOT FEEDBACK / ISSUE LIST]
- Prompt mode: [CREATIVE DIRECTION / CONVERSION-SAFE]
- Required dynamic groups: [PRODUCT GROUP / COLLECTION GROUP / ARTICLE-BLOG GROUP / SERVICE GROUP / NONE WITH REASON]

**FLEXIBILITY RULES**
- Do not follow a fixed section count.
- You may merge, omit, reorder, or recompose sections when it improves the page.
- Choose modules based on the brand, customer, page goal, content depth, and product type.
- Avoid generic ecommerce page formulas. The page should feel designed for this brand and category.
- Keep the structure convertible to Haravan Liquid: dynamic product, collection, article, page, menu, form, and asset slots must remain clear.
- Header and footer are useful for full storefront pages, but can be simplified or omitted for focused screen/module explorations.
- Creative freedom does not mean dropping required dynamic groups. If the goal is `BUY PRODUCT`, include a clear product group, collection group, product grid, or related-products group unless the page type truly does not need one. If the goal is `READ CONTENT`, include a clear article/blog group unless the page is a single article detail.
- Dynamic groups must look repeatable: multiple cards/items, consistent card pattern, clear heading/CTA, and realistic empty/edge state when relevant. Do not replace a product/article group with one static promotional tile.

**HARAVAN CONVERSION CONSTRAINTS**
- Design is a visual reference, not production code.
- Use ecommerce-friendly, semantic sections that can be converted to Liquid templates.
- Prefer reusable components: header, footer, product card, article card, collection card, form fields, modal/search/cart surfaces.
- Do not invent app-specific behavior that cannot map to standard Haravan data.
- Do not rely on hover-only interactions; all important actions must work on mobile.
- Avoid decorative complexity that would require custom animation libraries.
- Avoid layouts that require one-off global resets or new framework assumptions.
- Do not design a partial replacement that depends on the old layout; modules should be rebuildable as clean sections.
- Prefer existing theme/global container and token concepts such as `page-width`, color roles, typography roles, and spacing roles.
- Keep cards at 8px border radius or less unless the brand direction clearly needs softer shapes.

**DESIGN SYSTEM DIRECTION**
- Platform: responsive web storefront, desktop and mobile.
- Layout rhythm: consistent container width, reusable grid, clear section spacing.
- Typography: use a clear heading/body hierarchy; if the existing theme has fonts, assume those fonts will be reused.
- Color roles: define primary, surface, text, muted text, border, sale/error, success.
- Buttons: primary, secondary, text/icon button states.
- Form controls: visible labels, clear focus state, readable errors.
- Icons: use one consistent icon style; do not mix icon families.
- Icon sizing: keep icons in explicit stable boxes; avoid oversized SVG/image properties that can break layout.

**ASSET RULES**
- Product, collection, and article imagery should be represented as dynamic data slots.
- Hero/banner/lifestyle images can use placeholders, but each placeholder must have a clear descriptive `data-alt` or visible note for asset generation.
- Do not place Vietnamese or brand copy inside images; text must be real HTML text.
- Avoid dark, blurred, cropped, stock-like images when product/place/object inspection matters.
- Keep image slots with stable aspect ratios for desktop and mobile.

**RESPONSIVE REQUIREMENTS**
- Must work at 320, 375, 768, 1024, and 1440px.
- No horizontal overflow.
- Header, filters, product grids, sliders, CTA bars, and forms must remain usable on mobile.
- Text must not overlap images, buttons, cards, badges, or sticky elements.
- Touch targets should be at least 44px where practical.

**PAGE DIRECTION**
- Page type: [HOME / COLLECTION / PRODUCT DETAIL / BLOG LIST / ARTICLE / GENERIC PAGE / CONTACT / FAQ / CART / SEARCH / OTHER]
- Primary user job: [WHAT THE VISITOR SHOULD DO]
- Content priority: [PRODUCT-FIRST / BRAND-STORY-FIRST / PROMOTION-FIRST / EDUCATION-FIRST / SERVICE-FIRST]
- Module ideas to consider, not all required: [MODULE IDEAS]
- Required dynamic groups to show: [FEATURED PRODUCTS / COLLECTION CARDS / COLLECTION PRODUCT GRID / RELATED PRODUCTS / ARTICLE LIST / RELATED ARTICLES / SERVICE LIST / NONE WITH REASON]
- Required ecommerce states to represent: [EMPTY / SOLD OUT / SALE / VARIANT / FILTER / LONG CONTENT / FORM SUCCESS-ERROR / NONE]
- Creative notes: [WHAT SHOULD FEEL DISTINCTIVE]
```

## Flexible Page Briefs

Use these briefs as direction, not a mandatory section list.

### Home Page

```markdown
**HOME PAGE BRIEF**
Goal: establish brand/product signal quickly and move visitors into shopping or the main conversion goal.

Required clarity:
- First viewport should clearly show the brand/category/product world.
- Product, collection, article, menu, and asset areas should be recognizable as dynamic slots.
- Reusable product card and collection/article card patterns should be clear if those modules are used.
- If the page goal is shopping, include at least one clear product or collection group. If the page goal is education/content, include at least one clear article/blog group or explain why content is not needed.

Module ideas to choose from:
- Hero or campaign lead
- Featured collections
- Featured products, best sellers, new arrivals, routines, bundles, or service cards
- Brand story, ingredient/material/technology education, social proof, benefits, journal, newsletter, store/contact

Creative freedom:
- Use fewer, stronger sections if the brand needs a premium/editorial feel.
- Use denser scan-friendly modules if the brand needs retail efficiency.
- Merge story, product education, and merchandising when that makes a better page.
```

### Collection Page

```markdown
**COLLECTION PAGE BRIEF**
Goal: help visitors understand the collection, compare products, filter/sort, and continue browsing.

Required clarity:
- Dynamic collection title, optional description/image, filter/sort affordance, product list/grid, pagination/load-more or equivalent continuation.
- Product cards must support sale/no-sale/sold-out and long names.
- Empty state must be plausible even if not visually dominant.

Creative freedom:
- Collection intro can be compact, editorial, image-led, or utility-first.
- Filter UI can be toolbar, drawer, sidebar, or chip system as long as mobile behavior is clear.
- SEO/rich content is optional and should not clutter the shopping flow.
```

### Product Detail Page

```markdown
**PRODUCT DETAIL PAGE BRIEF**
Goal: make the product understandable and purchasable while supporting real variant/data states.

Required clarity:
- Product media area, product title, price/compare price, variant options, quantity, add-to-cart/buy/contact action, stock state.
- Product gallery must work with 1 image, many images, and a no-image fallback.
- Details/description content should support long rich text.
- Mobile purchase controls must not cover content.

Module ideas to choose from:
- Trust row, delivery/returns, usage/ingredients/specs, size guide, FAQ, reviews/social proof, related products, routines/bundles.

Creative freedom:
- Gallery can be grid, carousel, stacked editorial, or thumbnail-led depending on product type.
- Details can be accordion, tabs, long-form content, or split sections.
```

### Blog List / Article

```markdown
**BLOG / ARTICLE BRIEF**
Goal: make editorial content readable and connected to commerce or brand education.

Required clarity:
- Blog list should support dynamic article cards, tags/sidebar if useful, and empty state.
- Article detail should support title, date/author/tag optional, rich content typography, images, tables, quotes, embeds, and related articles.
- If the page is a blog list, show an actual repeatable article group, not only one editorial hero.
- If the page is an article detail and related reading matters, show related article cards as a repeatable group.

Creative freedom:
- Use magazine-style, guide-style, minimal article, or product-education layout depending on category.
- Do not force a sidebar if the content reads better full-width.
```

### Generic Page / Contact / FAQ / Store Locator

```markdown
**GENERIC PAGE BRIEF**
Goal: present admin-authored content or a utility flow without looking like a generic landing page.

Required clarity:
- Dynamic page title and rich content area.
- Long and short content must both look intentional.
- If a form/list/FAQ/store module is used, show success/error/empty/long-text behavior where relevant.

Module ideas to choose from:
- Contact form, FAQ accordion, policy content, store list/map, service booking prompt, brand story, team/certificate/press blocks.

Creative freedom:
- Choose the simplest structure that makes the page useful.
- Avoid adding ecommerce merchandising modules unless they support the page goal.
```


### Cart / Checkout

```markdown
**CART / CHECKOUT BRIEF**
Goal: make the cart and checkout entry point trustworthy, clear, and frictionless.

Required clarity:
- Cart must show item list (thumbnail, name, variant, quantity control, price, remove), order summary, and a prominent checkout CTA.
- Empty cart state must be designed intentionally with a clear return-to-shop action.
- Cart note / gift message field if the brand uses it.
- Checkout button must be above the fold on mobile without scrolling.

Module ideas to choose from:
- Trust badges / security note near checkout CTA, delivery estimate, free-shipping progress bar, promo code field, upsell/cross-sell row, loyalty points reminder.

Creative freedom:
- Layout can be single-column stacked, two-column summary sidebar, or slide-in drawer depending on the brand context.
- Do not add checkout steps or payment UI ? those are handled by the platform.
```

## Stitch Output Instructions

```markdown
**OUTPUT QUALITY**
- Make the design polished and production-realistic.
- Do not create a landing page if the request is an ecommerce page; design the actual usable page.
- Keep UI dense enough for shopping and scanning, not only editorial decoration.
- Make components repeatable and easy to convert to Liquid snippets.
- Avoid hardcoded product names as structural dependency; use realistic examples only.
- Use clear placeholders for dynamic data and asset slots.
- Do not include visible instructions, keyboard shortcuts, or implementation notes inside the UI.
- Do not add Tailwind/CDN/framework instructions; the Haravan workflow will translate the design into theme-native Liquid/CSS/JS.
- Avoid over-specified CSS-like properties. The implementation will normalize CSS manually and remove unused old blocks.
- Keep icon, media, and decorative element sizes bounded so generated code does not produce inflated icons or broken grids.
- Avoid designs that require fragile cascade hacks, excessive selector nesting, or `!important` to override old theme styles; modules should be implementable with scoped selectors and correct source order.
```

## Minimal Prompt Version

Use this when you need a quick prompt:

```markdown
Create a high-fidelity responsive Haravan ecommerce [PAGE_TYPE] design for [BRAND_NAME] in the [INDUSTRY] industry.

Design for conversion and clean Liquid implementation: reusable header/footer, product-card/article-card patterns, dynamic image/data slots, mobile-first usability, no horizontal overflow, clear form/focus states, and stable image ratios.

Use the existing theme's font/icon/design system conceptually; do not introduce a new framework or one-off component system. Product, collection, article, menu, and page content must feel dynamic and reusable, not hardcoded.

Design modules as clean rebuildable sections, not partial replacements on top of an old layout. Keep icons/media size-stable and avoid CSS-heavy effects that would leave unused properties in generated code.

Avoid visual patterns that depend on fragile CSS overrides, excessive selector nesting, or `!important`; the implementation should work through scoped module selectors and correct source order.

Include desktop and mobile-friendly module ideas for: [SECTIONS]. You may merge, omit, reorder, or recompose modules, but do not omit required dynamic groups: [PRODUCT GROUP / COLLECTION GROUP / ARTICLE-BLOG GROUP / SERVICE GROUP / NONE WITH REASON].

Avoid text inside images, placeholder links, hover-only behavior, over-decorated hero composition, and interactions that need custom libraries. The output is a visual reference that will be converted to Haravan Liquid/CSS/JS.
```
