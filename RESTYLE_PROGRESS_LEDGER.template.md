# Restyle Progress Ledger

## Context

- Project:
- Theme:
- Owner:
- Date:
- Agent:
- Issue source:
- Scope:
- Layout mode: rebuild 100% / restyle existing / patch fix
- Preview URL:
- Store/theme ID:
- Source of truth khi mâu thuẫn:
- `settings_data.json`: allowed / not allowed
- CSS/JS cleanup: allowed / report-only / not allowed
- Data/API changes: allowed / not allowed
- Push/sync: allowed / not allowed
- Rollback mode: git / backup folder / ledger-only
- Rollback reference:

## Understanding Gate

- User asked:
- Agent understanding:
- Question-only or implementation task:
- Blocking questions asked:
- Assumptions if user said "tự quyết":
- Chốt scope chưa:
- **Stitch Fidelity đã đọc**: [ ] yes — deviation planned: <none | list>

## Stitch Inventory (điền ở A.4–A.5)

| # | Stitch section name | Screen | File Liquid sẽ tạo | Snippet cần | Stitch gap cần hỏi |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
| 6 | | | | | |
| 7 | | | | | |
| 8 | | | | | |

## Stitch Gap Checklist (điền ở A.9 trước khi implement)

| State | Page | Stitch có? | Xử lý |
|---|---|---|---|
| Empty cart | /cart | [ ] | reuse default / design thêm |
| Sold-out product | /products/* | [ ] | badge + disabled btn |
| Sale price display | card + PDP | [ ] | compare price logic |
| Low stock badge | PDP | [ ] | |
| Out of stock variant | PDP | [ ] | disabled option |
| Collection empty | /collections/* | [ ] | empty state block |
| Search no result | /search | [ ] | empty state block |
| Blog no articles | /blogs/* | [ ] | |
| Form success / error | contact/form | [ ] | |
| Mobile menu open/close | global | [ ] | |
| Loading state (slider/async) | global | [ ] | |

Hỏi user 1 câu gộp cho state "Stitch không có": "Stitch không có state X, Y, Z — dùng Haravan default hay design thêm?"

## Stitch Fidelity Manifest Snapshot

| Artifact / Field | Present | Notes |
|---|---|---|
| `stitch-fidelity.json` | [ ] | |
| `stitch-fidelity-token-map.json` | [ ] | |
| sections inventory synced | [ ] | |
| asset slots synced | [ ] | |
| token map reviewed | [ ] | |
| copy blocks reviewed | [ ] | |
| merge status updated | [ ] | |

## Allowed Deviation Log

| Section / Asset | Change | Reason | Approved by | Notes |
|---|---|---|---|---|
| | | | | |

## Preconditions

| Item | Status | Notes |
|---|---|---|
| Issue source confirmed | pending | |
| Scope confirmed | pending | |
| Layout mode confirmed | pending | |
| Preview URL available | pending | |
| Asset source confirmed | pending | |
| Settings/data permission confirmed | pending | |
| CSS/JS cleanup permission confirmed | pending | |
| Rollback/checkpoint ready | pending | |

## Theme Fingerprint

- CSS architecture:
- JS/init lifecycle:
- Slider/carousel:
- Product card:
- Article card/blog:
- Icon system:
- Font/design tokens:
- Settings pattern:
- Asset naming:
- SEO/a11y base:
- Main risks:

## Theme-Native Reuse

| System | Existing pattern | Reuse decision | New code needed? | Reason |
|---|---|---|---|---|
| Slider | | | no | |
| Fonts | | | no | |
| Icons | | | no | |
| Settings | | | no | |
| Product card | | | no | |
| Article card | | | no | |
| JS lifecycle | | | no | |
| Container/breakpoint | | | no | |
| Design tokens/global classes | | | no | |
| Asset generator | | | no | |

Rule:

- [ ] Không tự chế hệ mới nếu theme đã có pattern đủ dùng.
- [ ] Ưu tiên `page-width`, token màu/font/spacing, helper/snippet/card có sẵn.
- [ ] Nếu buộc tạo mới thì ghi rõ lý do và phạm vi.

## Phase Status

| Phase | Status | Files | QA/Evidence | Blocker |
|---|---|---|---|---|
| H.0 Preconditions | pending | | | |
| H.2 Fingerprint | pending | | | |
| H.7 Theme-native contract | pending | | | |
| Design system normalize | pending | | | |
| Shared layer | pending | | | |
| Home | pending | | | |
| Collection | pending | | | |
| Product | pending | | | |
| Blog/article/page | pending | | | |
| Cart/search/other | pending | | | |
| Asset resolution | pending | | | |
| Generated CSS/JS cleanup | pending | | | |
| CSS cascade/source order check | pending | | | |
| QA | pending | | | |
| Cleanup | pending | | | |
| Report/handoff | pending | | | |

## Issue Log

| ID | Source | Page/Area | Issue | Severity | Status | Notes |
|---|---|---|---|---|---|---|
| 1 | | | | | pending | |

## Asset Ledger

| Asset | Source | Target size | Final file | Status | Notes |
|---|---|---|---|---|---|
| | user/reuse/generate/stock | | | pending | |

## QA Evidence

| Page | Viewport | Tool | Screenshot | Console | Network | Overflow | Contrast | Spacing/font | Status |
|---|---:|---|---|---|---|---|---|---|---|
| | 320 | DevTools/Puppeteer | | | | | | | pending |

## Changed Files

- Modified:
- Added:
- Read-only reference:
- Not changed by design:

## Blockers

- Asset:
- Permission:
- Data/API:
- Preview:
- Visual approval:

## Final Notes

- Remaining risk:
- User approval needed:
- Push/sync status:
- Next action:

## Final Readiness Gate

Pass only when:

- shared layer đã refactor
- QA chính đã pass
- content rule đã pass
- contrast/spacing/font/responsive đã pass
- CSS mới không bị rule cũ đè sai do load order/cascade/specificity
- final screenshot đã review
- final description đã đúng dạng editor fragment
- theme export đã có nếu user yêu cầu

Nếu chưa đạt, ghi đúng:

`Checkpoint - chưa final`

và nêu rõ `next queue`.
