---
title: "Haravan Stitch Cook Skill Brainstorm"
created: 2026-06-27
project: RESTYLE_MASTER_KIT
mode: brainstorm-report
status: approved-direction
scope: skill-orchestration
---

# Haravan Stitch Cook Skill Brainstorm

## Summary

Đã chốt hướng: **nâng global skill `haravan-stitch-full-run` thành workflow skill A-Z kiểu `/ck:cook`**, thay vì giữ nó ở mức thin wrapper hoặc tạo skill mới riêng.

Khuyến nghị kiến trúc:
- **runner** vẫn là execution engine: `stitch_pipeline_runner.js`
- **skill** là workflow/orchestration layer
- skill phải **safe-by-default**, dry-run trước, resume được, và dừng ở checkpoint thật

## Current codebase fit

Các mảnh nền đã có sẵn:

- `package.json` đã có `stitch:full`
- `stitch_pipeline_runner.js` đã có dry-run + execute safe prefix + checkpoint stop
- docs entrypoint đã được canonicalize ở `README.md`, `START_HERE.md`, `RUN_GUIDE.md`
- fidelity artifacts, shared helpers, browser verification, và test suite đã hoàn tất
- project plan chính đã completed 5/5

Điều này nghĩa là skill A-Z không cần viết từ số 0; nó nên **evolve từ skill hiện tại** để wrap engine hiện có.

## Underlying problem

Nhu cầu thật không phải “có thêm một skill nữa”, mà là:

- user muốn một trải nghiệm **1 command / 1 workflow**
- giảm cognitive load khi convert Stitch → Haravan
- vẫn giữ trust boundary ở asset / gap / permission / visual approval
- không lặp lại logic đã nằm trong runner/scripts/docs

## Options considered

### Option A — Nâng `haravan-stitch-full-run` thành workflow skill _(được chọn)_

Biến skill hiện tại thành lớp orchestration giống `/ck:cook`:
- detect mode
- validate input
- dry-run first
- đọc `stitch-pipeline-plan.json`
- điều phối checkpoint
- hỗ trợ resume
- route tiếp sang sub-skills / scripts phù hợp

**Pros**
- Tận dụng engine sẵn có
- Ít drift hơn
- Dễ maintain hơn mega-skill
- Trải nghiệm gần `/ck:cook` nhất

**Cons**
- Cần thêm orchestration logic ở lớp skill
- Resume semantics phải thiết kế cẩn thận

### Option B — Giữ thin wrapper

Skill chỉ hỏi input rồi gọi `stitch:full`.

**Pros**: gọn, ít rủi ro.  
**Cons**: chưa đủ “A-Z workflow” như mục tiêu.

### Option C — Tạo skill mới riêng kiểu `haravan-stitch-cook`

**Pros**: tách brand/thin/full rõ hơn.  
**Cons**: dễ duplicate, tăng maintenance, không cần thiết lúc này.

### Option D — Mega skill monolith

Skill tự gánh hầu hết logic business.

**Pros**: UX nhìn mạnh.  
**Cons**: sai hướng, drift nhanh, khó test, dễ one-click mù.

## Recommended design

### 1. Skill role

Skill nên là **workflow conductor**, không phải execution engine.

Nó phải:
- nhận intent tự nhiên từ user
- chọn mode đúng
- hỏi đủ input tối thiểu
- chạy dry-run trước
- giải thích checkpoint hiện tại
- resume đúng artifact / ledger / phase state
- route qua scripts và sub-skills phù hợp

### 2. Engine role

Logic thực thi tiếp tục ở:
- `stitch_pipeline_runner.js`
- `stitch_consume.js`
- `design_token_extract.js`
- `section_scaffold.js`
- `asset_pipeline.js`
- QA / a11y / visual / final guard scripts

### 3. Skill modes

Skill nên hiểu tối thiểu 4 mode:
- `full-theme`
- `single-page`
- `audit-led`
- `resume`

### 4. Input contract

Skill nên thu thập:
- `theme`
- `stitch` (khi cần)
- `base`
- `mode`
- permission notes
  - `settings_data.json`
  - push unpublished/live
  - cleanup orphan

### 5. Mandatory checkpoints

Skill phải luôn surfacing rõ:
- asset approval
- stitch gap resolution
- permission boundary
- visual approval

### 6. Domain routing

Khi cần, skill có thể route/activate các mảnh phù hợp:
- `haravan-liquid`
- `haravan-pages`
- `haravan-settings`
- `web-testing`
- `haravan-accessibility`
- `haravan-performance`
- `ck:debug`
- `project-management`

## Non-goals

Skill này không nên:
- bypass `STITCH_FIDELITY.md`
- auto-approve asset/gap choices
- one-click push live
- duplicate toàn bộ business logic vào `SKILL.md`
- thay thế runner/scripts gốc

## Implementation considerations

### Skill structure

Khuyến nghị tiếp tục dùng chính thư mục global hiện có:
- `C:\Users\Admin\.claude\skills\haravan-stitch-full-run\SKILL.md`
- mở rộng `references/`
- có thể thêm workflow-specific references cho:
  - resume policy
  - sub-skill routing
  - approval prompts
  - final handoff policy

### Needed upgrades

- evolve description để trigger mạnh hơn cho A-Z workflow use cases
- thêm mode-specific orchestration rules vào `SKILL.md`
- thêm evals / trigger cases
- thiết kế resume contract rõ hơn
- ràng buộc execute only after dry-run / checkpoint understanding

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Skill layer duplicate logic runner | Drift | Giữ runner là source of truth |
| Skill trở thành one-click mù | Trust loss | Bắt buộc gated stops |
| Resume semantics mơ hồ | Sai checkpoint | Đọc artifact + ledger + mode state trước khi tiếp tục |
| Trigger yếu / undertrigger | UX kém | Pushy description + eval loop |
| Trigger quá rộng | Gọi nhầm | Scope rõ: Stitch -> Haravan only |

## Success criteria

- skill trigger đúng khi user muốn full Stitch → Haravan workflow
- luôn dry-run trước
- luôn tóm tắt checkpoint hiện tại
- resume đúng mode và artifact
- không bypass checkpoint bắt buộc
- không duplicate engine logic

## Recommended next step

Chuyển sang **`/ck:plan --tdd`** cho việc evolve `haravan-stitch-full-run` thành workflow skill A-Z.

Lý do:
- đây là thay đổi behavior trên skill orchestration hiện có
- cần lock trigger/orchestration/resume behavior trước khi sửa lớn
- nên thêm eval/fixture/test strategy cùng plan thay vì patch cảm tính

## Unresolved questions

- Có muốn skill này chỉ trigger trong repo có RESTYLE_MASTER_KIT, hay cho phép trigger ở project khác miễn có `stitch:full`?
- Resume nên dựa chủ yếu vào `stitch-pipeline-plan.json`, hay phải đọc thêm ledger mỗi lần?
- Khi gặp checkpoint asset/gap, skill chỉ hỏi user hay còn invoke sub-skill hỗ trợ ngay?
