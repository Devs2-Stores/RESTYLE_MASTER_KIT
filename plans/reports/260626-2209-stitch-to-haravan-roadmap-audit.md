---
title: Stitch-to-Haravan Roadmap + Audit
created: 2026-06-26
project: RESTYLE_MASTER_KIT
mode: brainstorm-report
status: approved-direction
scope: roadmap-audit
---

# Stitch-to-Haravan Roadmap + Audit

## Summary

Mục tiêu đã chốt lại: **MCP Stitch xuất layout 100%, sau đó merge phù hợp vào theme Haravan**.

Vì vậy RESTYLE_MASTER_KIT không nên cải thiện theo hướng “thêm thật nhiều feature”. Nên cải thiện theo hướng **Stitch fidelity pipeline**:

1. Nhận Stitch export/screen làm nguồn visual truth.
2. Consume/strip raw Stitch code an toàn.
3. Trích token, asset slot, section inventory rõ.
4. Merge vào Haravan theme-native Liquid/CSS/JS/settings.
5. Audit để bảo đảm không còn raw CDN/Tailwind/placeholder/hardcode sai.
6. QA visual/a11y/perf/final guard để chứng minh layout đã về đúng.

Thesis khuyến nghị:

> **Stabilize Stitch-to-Haravan first.** Khóa fidelity contract, test gates, CLI/report/path safety, rồi mới tính workflow orchestrator. Không làm mega-runner trước khi artifacts và gates đáng tin.

---

## Problem-first inversion

### 1. Solution-jumping diagnosis

Câu “MCP Stitch xuất 100% layout về merge phù hợp Haravan” cho thấy pain thật:

- Agent/automation dễ tự chế layout khác Stitch.
- Raw Stitch code/Tailwind/CDN không thể ship thẳng trong Haravan theme.
- Merge theme-native dễ làm mất fidelity: spacing, màu, section order, assets, copy, responsive.
- QA cuối thường phát hiện muộn: placeholder, hardcode, lệch visual, setting thiếu, asset sai ratio.

### 2. Underlying problem

Cần một pipeline đáng tin để biến Stitch design thành Haravan theme-native implementation **mà vẫn giữ fidelity của design**, không phụ thuộc vào cảm tính hoặc trí nhớ của agent.

### 3. Assumption challenges

| Assumption | Risk nếu sai | Validation |
|---|---|---|
| Stitch export đủ sạch để làm source truth | Export có Tailwind/CDN/placeholder/DOM dư | `stitch_consume.js` report phải liệt kê strip result + token/asset/section evidence |
| “100% layout” có thể hiểu bằng mắt | Mỗi agent hiểu khác nhau | Cần checklist: section list, spacing/tokens, responsive, copy, assets, allowed deviations |
| Merge Haravan chỉ là copy HTML/CSS | Phá Liquid/settings/theme-native behavior | Phải qua `haravan-liquid`, settings boundary audit, QA flow |
| Visual diff tự động đủ chứng minh fidelity | Restyle full theme diff cao không nói đúng/sai | Cần screenshot review + section checklist + gate artifacts |
| Orchestrator sẽ giải quyết pain chính | Nếu contract chưa ổn, runner chỉ tự động hóa lỗi | Làm helper/tests/contracts trước runner |

### 4. Problem statement

- **Users/context:** người dùng/agent chạy Haravan theme restyle từ Stitch design.
- **Struggle:** giữ layout đúng Stitch trong khi vẫn phải chuyển sang Liquid/CSS/JS/settings native.
- **Cause:** workflow hiện giàu docs nhưng script contracts, report schema, visual gates, và shared helpers chưa đủ chặt.
- **Consequence:** dễ lệch design, duplicate CSS, bỏ sót asset, placeholder lọt storefront, QA/final tốn nhiều vòng sửa.
- **Success:** một Stitch screen/theme có thể đi qua consume → token/asset/section map → merge → audit/QA/final với evidence rõ và ít lệch thủ công.

### 5. Three alternative framings

| Frame | Cách hiểu | Solution space | Nhận định |
|---|---|---|---|
| A. Fidelity contract problem | Agent không có contract đủ đo được | Bổ sung manifest/checklist/gates | Nên làm ngay |
| B. Tooling consistency problem | Scripts nhiều nhưng contract/helpers lặp | Shared core + tests | Nên làm song hành |
| C. Workflow automation problem | Người dùng chạy sai thứ tự | Orchestrator/checkpoint | Làm sau, không phải P0 |

### 6. Evidence status

Evidence: **medium-strong**.

- Docs đã nhấn mạnh Stitch fidelity nhiều lần: `STITCH_FIDELITY.md`, `FLOW_A.md`, `RUN_GUIDE.md`, `START_HERE.md`.
- Scripts đã có đầy đủ pipeline pieces: `stitch_consume.js`, `design_token_extract.js`, `section_scaffold.js`, `asset_pipeline.js`, audit/QA/final scripts.
- Subagent audit phát hiện duplication và contract gaps across CLI/report/browser/tests.
- `npm test` pass 121/121 nhưng thiếu fixture sâu cho final guard/visual diff/browser QA.

### 7. Validation plan

- Chạy kit trên một Stitch export thực tế và một mock export controlled.
- So section list/copy/assets/tokens trước và sau merge.
- Bắt buộc audit blockers về 0.
- Bắt buộc final screenshot artifact pass.
- Ghi allowed deviations vào ledger.
- So preview Haravan bằng manual review + visual evidence, không chỉ pixel diff.

### 8. Draft stakeholder message

> Mục tiêu không phải biến kit thành automation khổng lồ. Mục tiêu là làm pipeline Stitch → Haravan đáng tin hơn: giữ layout 100%, merge theme-native, có evidence rõ, và tránh agent tự chế. Ta sẽ ưu tiên contract/gates/tests trước, runner tự động để sau.

---

## Current codebase fit

### Project type

- Node.js CommonJS toolkit.
- `package.json` version: `2.4.2`.
- Node engine: `>=18`.
- Dependencies chính: `puppeteer`, `axe-core`.
- Scripts public nằm trong `package.json`.

### Existing Stitch-to-Haravan pipeline pieces

| Stage | Existing file/script | Vai trò |
|---|---|---|
| Preflight theme | `run_preflight.js`, `haravan_preflight_fallback.py` | Kiểm cấu trúc theme trước merge |
| Stitch consume | `stitch_consume.js` | Strip CDN/Tailwind, extract token candidate |
| Token mapping | `design_token_extract.js` | Map Stitch token vs theme token |
| Section scaffold | `section_scaffold.js` | Generate Liquid section/snippet skeleton |
| Asset plan | `asset_pipeline.js` | Validate/generate asset slot plan |
| Content/settings/css audit | `liquid_content_audit.js`, `settings_boundary_audit.js`, `css_token_audit.js`, `audit_restyle.js` | Chặn anti-pattern sau merge |
| QA/a11y/perf | `qa_restyle_check.js`, `a11y_deep.js`, `perf_check.js` | Verify preview behavior |
| Visual evidence | `visual_diff.js`, `final_showcase_capture.js` | Capture/diff final screenshots |
| Handoff guard | `workflow_final_guard.js`, `final_theme_export.js`, `theme_push.js` | Final export/push guard |

### Current constraints

- Giữ public npm scripts/flags hiện có.
- Không ship raw Stitch/Tailwind/CDN code.
- Không sửa `config/settings_data.json` nếu chưa có permission.
- Toàn bộ copy storefront/admin phải Việt hóa.
- Không hardcode `1280px`.
- Merge phải theme-native, không chồng CSS mới lên orphan cũ.

---

## Audit findings by relevance to Stitch-to-Haravan goal

### A. Fidelity risk

| Finding | Impact | Priority |
|---|---|---|
| Stitch fidelity hiện chủ yếu nằm ở docs, chưa đủ machine-readable manifest | Agent vẫn có thể bỏ section/asset/copy mà gate không bắt | P0 |
| Visual diff chưa đủ functional tests | Không chắc visual gate đáng tin khi dùng làm evidence | P0 |
| Final guard thiếu pass/fail fixture sâu | Handoff gate quan trọng nhưng regression protection yếu | P0 |
| QA Puppeteer chưa có local fixture server | Browser behavior chưa được test ổn định offline | P2 |

### B. Merge safety risk

| Finding | Impact | Priority |
|---|---|---|
| CLI parsing nhiều script dùng `argv[++i]` | Chạy sai flag có thể scan/ghi nhầm path | P0 |
| Path traversal/schema validation yếu trong config/asset/flow | Asset/scaffold có thể ghi sai nơi hoặc crash khó hiểu | P1 |
| Shell execution boundary còn rộng ở generator/export/push | Rủi ro chạy nhầm command hoặc command injection nếu input không tin cậy | P1 |
| File writes thiếu atomicity | Export/scaffold/report fail giữa chừng có thể tạo artifact nửa vời | P1 |

### C. Contract/report risk

| Finding | Impact | Priority |
|---|---|---|
| `--fail-on warn` không nhất quán | Gate có thể pass/fail sai expectation | P0 |
| Report Markdown/JSON chưa có helper chung | Downstream khó parse, bảng có thể vỡ vì `|`/newline | P1 |
| Output artifacts chưa có schema chung | Khó làm orchestrator/checkpoint đáng tin | P2 |

### D. Docs/workflow risk

| Finding | Impact | Priority |
|---|---|---|
| Nhiều entrypoint: `README`, `START_HERE`, `RUN_GUIDE`, `FLOW_A` | Người mới/agent dễ đọc sai thứ tự | P2 |
| `STITCH_PROMPT.template.md` tham chiếu section cũ | Prompt có thể hướng agent sai workflow | P0 |
| `UPGRADE.md` có version example cũ | Maintenance docs giảm độ tin cậy | P2 |
| Script tables/rules lặp nhiều nơi | Dễ stale khi script đổi | P3 |

---

## Definition of “100% layout” for this kit

“100% layout” không nên hiểu là pixel-perfect tuyệt đối trên mọi viewport. Trong Haravan theme, đúng hơn là:

1. **Section fidelity:** section list/order/role khớp Stitch.
2. **Layout fidelity:** grid, alignment, hierarchy, spacing rhythm, responsive breakpoints khớp intent Stitch.
3. **Visual token fidelity:** màu/font/radius/shadow/spacing được map vào theme tokens, không hardcode bừa.
4. **Content fidelity:** copy, CTA, product/card semantics đúng; không placeholder/lorem/demo copy lọt storefront.
5. **Asset fidelity:** mọi image/icon slot có nguồn, ratio, alt/caption, không broken URL.
6. **Interaction fidelity:** menu/cart/filter/variant/form không hỏng sau merge.
7. **Theme-native fidelity:** dùng Liquid/settings/snippets/assets lifecycle của Haravan, không ship raw Stitch Tailwind/CDN.
8. **Allowed deviations:** chỉ chấp nhận khi có lý do: Haravan constraint, accessibility/perf, legal/asset availability, responsive practicality, user override.

---

## Prioritized roadmap

## P0 — Lock Stitch fidelity and critical gates

### P0.1. Add Stitch-to-Haravan fidelity checklist/report

**Goal:** biến “100% layout” thành checklist có thể verify.

**Touchpoints:**
- `STITCH_FIDELITY.md`
- `FLOW_A.md`
- `RESTYLE_PROGRESS_LEDGER.template.md`
- `stitch_consume.js`
- `design_token_extract.js`
- `section-config.template.json`
- `asset-plan.template.json`

**Recommended output:**
- Add/standardize a `stitch-fidelity-manifest` concept, initially as markdown/json artifact in scratch.
- Include: sections, assets, tokens, copy blocks, allowed deviations, merge status.

**Acceptance criteria:**
- Every Stitch screen has section inventory.
- Every section has asset/token/copy status.
- Any deviation must cite allowed reason.
- Report can be used before implementation and before final QA.

**Risk:** overbuilding schema.

**Keep it KISS:** start as additive report/checklist, not full parser engine.

---

### P0.2. Fix CLI parsing safety for flow-critical scripts

**Goal:** prevent wrong root/out/base due to malformed flags.

**Touchpoints:**
- `stitch_consume.js`
- `design_token_extract.js`
- `section_scaffold.js`
- `asset_pipeline.js`
- `qa_restyle_check.js`
- `visual_diff.js`
- `workflow_final_guard.js`
- audit scripts

**Acceptance criteria:**
- Missing value fails with useful message.
- Value cannot silently be another flag.
- Enum/number flags validate.
- `--help` stable.
- Existing command examples still work.

---

### P0.3. Normalize `--fail-on` semantics

**Goal:** audit gates behave predictably.

**Touchpoints:**
- `liquid_content_audit.js`
- `settings_boundary_audit.js`
- `css_token_audit.js`
- `audit_restyle.js`
- new helper `lib/findings.js`

**Acceptance criteria:**
- `fail-on=blocker`: fail only blocker and above.
- `fail-on=warn`: fail warn + blocker.
- Tests cover clean/warn/blocker combinations.
- Changelog notes if behavior becomes stricter.

---

### P0.4. Add final guard fixture tests

**Goal:** final handoff gate must be trustworthy.

**Touchpoints:**
- `workflow_final_guard.js`
- `test/run_tests.js`
- test fixtures for final-showcase

**Acceptance criteria:**
- Pass fixture with correct final artifacts.
- Fail fixtures for missing screenshot, wrong dimensions, invalid theme description, pending ledger.
- Exit code and key messages asserted.

---

### P0.5. Add visual diff functional tests

**Goal:** visual evidence must not be untested.

**Touchpoints:**
- `visual_diff.js`
- `test/run_tests.js`
- small PNG fixtures

**Acceptance criteria:**
- Identical images -> 0% diff.
- Small diff under threshold -> pass.
- Diff over threshold -> fail.
- Size mismatch/corrupt PNG -> clear report.

---

### P0.6. Fix stale docs that directly affect Stitch flow

**Touchpoints:**
- `STITCH_PROMPT.template.md`
- `UPGRADE.md`
- `START_HERE.md`

**Acceptance criteria:**
- No obsolete `H.2/G.7/H.4/H.5` section references.
- Version examples no longer stale.
- Numbering/entrypoint errors fixed.

---

## P1 — Shared core for reliable merge tooling

### P1.1. `lib/cli-args.js`

**Goal:** one safe parser for all scripts.

**Acceptance criteria:**
- Supports required value, optional value, boolean, enum, number, csv.
- Applies to audit scripts and final guard first.
- No public CLI rename.

### P1.2. `lib/report.js` and `lib/findings.js`

**Goal:** consistent findings and reports.

**Acceptance criteria:**
- Markdown cells escaped.
- Findings have `severity`, `rule`, `file`, `line`, `message`, `evidence`.
- JSON summary has counts by severity/rule.

### P1.3. `lib/path-utils.js`

**Goal:** safe root/out/path handling.

**Acceptance criteria:**
- Reject path traversal for config-driven writes.
- Preserve existing default root/out behavior.
- URL/path join logic shared.

### P1.4. `lib/image.js`

**Goal:** shared image dimension helpers.

**Acceptance criteria:**
- Used by `asset_pipeline.js` and `workflow_final_guard.js`.
- PNG/JPEG/SVG fixtures pass.
- `visual_diff.js` pixel decoder can remain separate.

### P1.5. Shell boundary hardening

**Goal:** command execution safer and clearer.

**Touchpoints:**
- `asset_pipeline.js`
- `theme_push.js`
- `final_theme_export.js`

**Acceptance criteria:**
- Avoid shell where possible.
- Split executable and args.
- Env command values validated/documented.
- `--execute` remains explicit, not default.

---

## P2 — Browser and preview verification hardening

### P2.1. `lib/puppeteer-utils.js`

**Goal:** one browser lifecycle utility.

**Touchpoints:**
- `qa_restyle_check.js`
- `a11y_deep.js`
- `visual_diff.js`
- `final_showcase_capture.js`

**Acceptance criteria:**
- `withPage()` always closes page in `finally`.
- Browser reuse for multi-capture visual diff.
- Shared `navigateAndSettle()` and viewport presets.

### P2.2. Local preview fixture server

**Goal:** test QA/a11y without external Haravan preview.

**Acceptance criteria:**
- Fixture pages for console error, page error, overflow, missing alt, bad flow selector, success flow.
- `qa_restyle_check.js` local E2E smoke.
- `a11y_deep.js` local axe smoke.

### P2.3. Additive artifact contract

**Goal:** outputs parseable later by orchestrator/dashboard.

**Acceptance criteria:**
- Keep existing filenames.
- Add fields: `toolVersion`, `generatedAt`, `status`, `summary`, `counts`, `artifacts`.
- No breaking downstream consumers.

---

## P3 — Docs navigation focused on Stitch-to-Haravan

### P3.1. Canonical landing

**Recommended roles:**

| Doc | Role |
|---|---|
| `START_HERE.md` | Canonical landing + journey map |
| `README.md` | Repo overview + script reference |
| `RUN_GUIDE.md` | Decision tree A/B/C/D |
| `FLOW_A.md` | Stitch full theme cheat sheet |
| `HARAVAN_THEME_RESTYLE_WORKFLOW.md` | Workflow policy/source of truth |
| `STITCH_FIDELITY.md` | Stitch fidelity contract |

**Acceptance criteria:**
- New user knows the first file to read.
- Journey table: full Stitch theme / single page / audit-led / resume / final / kit health.
- Docs stop competing as “read first”.

### P3.2. Reduce duplicated script/rule blocks

**Acceptance criteria:**
- Full script catalog lives in one main place.
- Flow docs only include relevant commands.
- Landing docs keep only critical red flags.

---

## P4 — Skill operating model

### Skill map by phase

| Phase | Skills | Use when | Avoid when |
|---|---|---|---|
| Scout/fingerprint | `scout`, `haravan-audit`, `ck:debug` | Theme unknown, preflight fail | Already have fresh fingerprint |
| Stitch/design | `stitch`, `frontend-design`, `ai-multimodal` | Need generate/refine/analyze visual source | Design already approved and frozen |
| Token/asset/section map | `haravan-settings`, `media-processing`, `ai-artist` | Settings/asset slots need decisions | Before section list and brand direction clear |
| Merge implementation | `haravan-liquid`, `haravan-pages`, `ck:cook` | Scope approved, files clear | Requirements vague |
| QA/fix | `web-testing`, `haravan-accessibility`, `haravan-performance`, `ck:debug` | Gates fail or need browser evidence | Pure docs-only task |
| Review/final | `ck:code-review`, `project-management`, `haravan-preview-screenshot`, `copywriting` | Before handoff/final description | No diff/artifact yet |
| Planning | `ck:plan` | After brainstorm approval | Before goal/acceptance criteria clear |

### Skills to delay until design approval

- `ck:cook`
- `haravan-settings`
- `ai-artist`
- `copywriting`
- `haravan-preview-screenshot`

Reason: they create implementation/copy/assets/settings that become rework if Stitch layout is not approved.

---

## P5 — Optional workflow runner later

**Only after P0-P3.**

### Goal

Create a thin runner/checklist for Flow A/B/C/D.

### Non-goals

- Not a full CI/CD engine.
- Not live push by default.
- Not asset generation by default.
- Not raw Stitch auto-converter.

### Acceptance criteria

- `--dry-run` or checklist mode first.
- Reads artifact summaries instead of fragile stdout parsing.
- Requires explicit confirm flags for push/export/generate.
- Existing npm scripts continue working standalone.

---

## Proposed acceptance criteria for the project goal

A Stitch-to-Haravan merge is acceptable when:

1. `npm test` pass.
2. Preflight theme root pass.
3. Stitch consume output exists: cleaned HTML/CSS, tokens, report.
4. Fidelity manifest/checklist complete.
5. Asset plan: missing/wrong assets = 0 or documented allowed deviation.
6. Token mapping reviewed: reuse/replace/new token decision clear.
7. Section scaffold/merge follows Haravan Liquid/settings conventions.
8. Static audit: 0 blocker.
9. Settings boundary audit: 0 blocker.
10. CSS token audit: warnings triaged or fixed.
11. QA preview: 0 fail.
12. A11y deep: 0 critical/serious.
13. Perf delta acceptable vs baseline.
14. Final capture artifacts valid.
15. Final guard pass.
16. Ledger records deviations and next queue empty.

---

## Risk and rollback

| Risk | Impact | Mitigation | Rollback |
|---|---|---|---|
| Refactor helper breaks CLI | User commands fail | Characterization tests + migrate one script at a time | Revert helper adoption per script |
| Fidelity manifest becomes busywork | Slows workflow | Keep checklist short, evidence-based | Keep docs-only checklist |
| Visual diff creates false confidence | Layout still wrong | Pair with section checklist and screenshot review | Treat visual diff as evidence, not sole gate |
| Puppeteer tests become flaky | CI/local noise | Local static fixture, small scope, no network | Mark browser E2E optional first |
| Orchestrator over-automates side effects | Push/export/generate wrong | Dry-run default + explicit flags | Keep scripts standalone |
| Docs rewrite churn | More confusion | Canonical navigation only, no mass rewrite | Revert doc IA changes |

---

## Recommended next step

Convert this brainstorm into `/ck:plan --tdd` because the recommended work touches shared helpers, gates, and behavior of existing scripts. Tests should lock current public behavior first.

If implementation starts, first implementation target should be:

1. P0 final guard tests.
2. P0 visual diff tests.
3. P0 CLI parsing helper pilot on one low-risk script.
4. P0 stale Stitch docs fixes.

Do **not** start with workflow orchestrator.
