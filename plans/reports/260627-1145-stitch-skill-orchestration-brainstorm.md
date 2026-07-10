---
title: "Stitch Skill Orchestration Brainstorm"
created: 2026-06-27
project: RESTYLE_MASTER_KIT
mode: brainstorm-report
status: approved-direction
scope: stitch-skill-orchestration
---

# Stitch Skill Orchestration Brainstorm

## Summary

Đã chốt hướng: **tích hợp `/ck:stitch` ở lớp skill orchestration**, không nhúng Stitch API/SDK trực tiếp vào `stitch_pipeline_runner.js`.

Mục tiêu là nâng global skill `haravan-stitch-full-run` thành workflow skill A-Z kiểu `/ck:cook` cho domain Stitch → Haravan:
- detect mode
- thu input tối thiểu
- nếu chưa có export thì invoke `/ck:stitch`
- nếu đã có export thì vào thẳng `stitch:full`
- dry-run trước
- đọc artifact
- resume đúng checkpoint
- giữ gated stops bắt buộc

## Codebase fit

### Relevant current assets

- `stitch_pipeline_runner.js` đã là conversion engine deterministic.
- `package.json` có `stitch:full`.
- `README.md`, `START_HERE.md`, `RUN_GUIDE.md` đã canonicalize entrypoint và boundaries.
- `STITCH_PROMPT.template.md` đã sạch stale refs, phù hợp để đứng trước bước generate/export của Stitch.
- Global skill `haravan-stitch-full-run` đã tồn tại ở `C:\Users\Admin\.claude\skills\haravan-stitch-full-run\SKILL.md` nhưng mới ở mức thin wrapper.
- Skill `/ck:stitch` đã có đầy đủ upstream capabilities: quota, generate, export, project isolation.

### Constraints discovered

- `stitch_pipeline_runner.js` hiện require `--stitch` path cho `full-theme` và `single-page`; nó giả định export đã tồn tại.
- Safe-by-default là contract cốt lõi, không được phá.
- Skill layer phải tránh duplicate logic với runner/scripts/docs.
- Stitch có quota/credits + API key, nên không nên gắn chặt vào deterministic CLI engine.

## Underlying problem

Nhu cầu thật không phải “thêm một skill nữa”, mà là làm cho user có trải nghiệm **1 workflow từ idea/design đến Haravan theme merge** mà vẫn giữ:
- trust boundary
- checkpoint approval
- resume semantics rõ ràng
- engine testable và maintainable

## Options considered

### Option A — `/ck:stitch` là upstream stage của workflow skill _(được chọn)_

`haravan-stitch-full-run` evolve thành workflow conductor:
- nếu có export → gọi `stitch:full`
- nếu chưa có export → gọi `/ck:stitch` generate/export trước, rồi handoff vào `stitch:full`

**Pros**
- giữ runner deterministic
- tận dụng đúng năng lực của `/ck:stitch`
- gần mô hình `/ck:cook` nhất
- dễ maintain hơn nhúng trực tiếp SDK/API vào engine

**Cons**
- skill orchestration dày hơn
- phải thiết kế handoff artifact giữa `/ck:stitch` và runner

### Option B — Nhúng Stitch generation vào `stitch_pipeline_runner.js`

**Pros**: cảm giác 1 command mạnh.  
**Cons**: coupling cao, quota/API key/project selection đi thẳng vào engine, khó test, khó debug, sai boundary.

**Rejected.**

### Option C — Chỉ docs/prompt guidance

**Pros**: ít rủi ro.  
**Cons**: không đạt mục tiêu A-Z workflow.

## Recommended architecture

### Layer 1 — Design generation

`/ck:stitch`
- check quota
- generate design / variants
- export HTML/Tailwind/DESIGN.md
- manage Stitch project isolation

### Layer 2 — Conversion engine

`stitch_pipeline_runner.js`
- dry-run by default
- emit `stitch-pipeline-plan.json`
- safe prefix only on `--execute`
- stop at checkpoints
- do not own Stitch API concerns

### Layer 3 — Workflow skill A-Z

`haravan-stitch-full-run`
- detect mode
- validate inputs
- decide whether `/ck:stitch` is needed
- orchestrate dry-run → checkpoint → execute → resume
- explain why it stopped and what exact input is needed next

## Proposed modes

- `full-theme`
- `single-page`
- `audit-led`
- `resume`

## Input contract

Skill orchestration should collect:
- `theme`
- `stitch` export path (or explicit instruction to generate via Stitch)
- `base` preview URL
- `mode`
- permissions
  - `settings_data.json`
  - push unpublished/live
  - orphan cleanup

## Mandatory checkpoints

Skill must always surface:
- asset approval
- stitch gap resolution
- permission boundary
- visual approval

## Touchpoints to modify if implemented

### Global skill
- `C:\Users\Admin\.claude\skills\haravan-stitch-full-run\SKILL.md`
- `C:\Users\Admin\.claude\skills\haravan-stitch-full-run\references\input-contract.md`
- `C:\Users\Admin\.claude\skills\haravan-stitch-full-run\references\mode-routing.md`
- `C:\Users\Admin\.claude\skills\haravan-stitch-full-run\references\checkpoint-policy.md`
- new references for resume policy / stitch handoff / sub-skill routing

### Project docs / engine
- `stitch_pipeline_runner.js`
- `README.md`
- `START_HERE.md`
- `RUN_GUIDE.md`
- `STITCH_PROMPT.template.md`
- `test/run_tests.js`

## Non-goals

This skill should not:
- bypass `STITCH_FIDELITY.md`
- auto-approve asset or gap decisions
- live push by default
- duplicate engine logic inside `SKILL.md`
- replace the existing runner/scripts as source of truth

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Skill duplicates runner logic | Drift | Keep runner as source of truth |
| Workflow becomes one-click blind automation | Trust loss | Mandatory gated stops |
| Resume semantics unclear | Wrong continuation | Read artifact + ledger + mode state before continue |
| Stitch trigger underfires | Poor UX | Pushy skill description + eval loop |
| Stitch integration overreaches engine boundary | Maintenance pain | Keep `/ck:stitch` in orchestration layer only |

## Success criteria

- `haravan-stitch-full-run` triggers correctly for Stitch → Haravan full workflow asks
- if export is absent, it can route through `/ck:stitch`
- if export is present, it goes straight to `stitch:full`
- always dry-runs first
- always explains the current checkpoint
- resume works without losing artifact state
- no checkpoint bypass

## Recommended next step

Proceed to **`/ck:plan --tdd`** to evolve `haravan-stitch-full-run` from thin wrapper into A-Z workflow skill orchestration.

Why TDD:
- this changes behavior of an existing skill
- trigger / routing / resume / checkpoint semantics need to be locked by tests/evals first
- it is easy to regress UX orchestration silently without explicit fixtures

## Unresolved questions

- Should the global skill trigger only inside repos with RESTYLE_MASTER_KIT, or anywhere a project exposes `stitch:full`?
- For resume, should the skill primarily trust `stitch-pipeline-plan.json`, or also require ledger state every time?
- At asset/gap checkpoints, should the skill merely stop and ask, or proactively route into support skills like `haravan-settings` / `web-testing` / `stitch` edit flows?
