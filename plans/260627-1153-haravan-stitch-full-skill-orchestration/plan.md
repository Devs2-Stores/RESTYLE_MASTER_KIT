---
title: Haravan Stitch Full Skill Orchestration
description: >-
  TDD-first plan to evolve the global haravan-stitch-full-run skill into an A-Z
  workflow conductor that can orchestrate /ck:stitch upstream and stitch:full
  downstream without breaking safe-by-default boundaries.
status: completed
priority: P1
effort: medium
branch: ''
tags:
  - skill
  - stitch
  - haravan
  - orchestration
  - tdd
blockedBy: []
blocks: []
created: '2026-06-27T04:53:14.937Z'
createdBy: 'ck:plan'
source: skill
---

# Haravan Stitch Full Skill Orchestration

## Overview

Plan này chuyển hướng brainstorm đã duyệt trong `../reports/260627-1145-stitch-skill-orchestration-brainstorm.md` thành implementation roadmap theo **tests-first**.

Mục tiêu không phải nhét Stitch API vào runner CLI. Mục tiêu là nâng global skill `haravan-stitch-full-run` thành một workflow skill A-Z kiểu `/ck:cook`: hiểu mode, thu input tối thiểu, quyết định khi nào gọi `/ck:stitch`, khi nào gọi `stitch:full`, resume từ artifact/ledger, và luôn giữ **dry-run first + gated stops**.

## Phases

| Phase | Name | Status | Priority | Depends On | Objective |
|-------|------|--------|----------|------------|-----------|
| 1 | [Lock Trigger And Input Contract](./phase-01-lock-trigger-and-input-contract.md) | Completed | P1 | - | Khóa trigger behavior, input contract, và eval matrix để skill không undertrigger hoặc hỏi sai dữ liệu nền. |
| 2 | [Route Stitch Upstream And Modes](./phase-02-route-stitch-upstream-and-modes.md) | Completed | P1 | 1 | Route đúng giữa `/ck:stitch` upstream và `stitch:full` downstream theo 4 mode chính. |
| 3 | [Add Resume And Checkpoint Guidance](./phase-03-add-resume-and-checkpoint-guidance.md) | Completed | P2 | 2 | Thêm hybrid resume semantics, checkpoint explanation, và stop-and-suggest support-skill routing. |
| 4 | [Document And Validate Global Skill](./phase-04-document-and-validate-global-skill.md) | Completed | P2 | 3 | Hoàn thiện references, docs discoverability, và eval matrix cho global skill orchestration. |

## Dependencies

- Cross-plan dependencies: không có unfinished plan chồng lấn trong `plans/*/plan.md`.
- Foundational completed context: `../260626-2210-stitch-haravan-fidelity-pipeline/plan.md` đã hoàn tất 5/5 và cung cấp nền runner/docs/artifacts cho skill mới này.
- Execution order khuyến nghị: **01 → 02 → 03 → 04**.
- Boundary bắt buộc:
  - Không nhúng Stitch API/SDK trực tiếp vào `stitch_pipeline_runner.js`.
  - Giữ `stitch_pipeline_runner.js` là conversion engine deterministic.
  - Skill orchestration luôn dry-run trước.
  - Không bypass asset/gap/permission/visual checkpoints.
  - Trigger global skill theo **capability markers** (`stitch:full`, runner/docs tương đương), không khóa cứng vào tên repo/kit.
  - Resume dùng **hybrid state**: `stitch-pipeline-plan.json` là nguồn chính, ledger để cross-check và giải thích trạng thái.
  - Checkpoint behavior là **stop-and-suggest**: dừng đúng chỗ, rồi gợi ý skill/command kế tiếp phù hợp.
  - Chỉ chỉnh global skill ở `C:\Users\Admin\.claude\skills\haravan-stitch-full-run\` vì user đã explicit yêu cầu global skill.

## Success Criteria

- [x] `haravan-stitch-full-run` trigger đúng cho các ask kiểu “clone/convert/restyle Stitch -> Haravan”, “1 command full flow”, “resume flow”, và “audit-led”.
- [x] Khi export chưa tồn tại, skill route qua `/ck:stitch`; khi export đã có, skill đi thẳng vào `stitch:full`.
- [x] Skill luôn thu đúng input tối thiểu theo mode và không hỏi thừa.
- [x] Skill luôn dry-run trước, đọc `stitch-pipeline-plan.json`, và giải thích checkpoint hiện tại.
- [x] Resume path đọc artifact + ledger đúng trước khi đề xuất continue.
- [x] Existing project runner/docs/scripts không bị bẻ gãy contract hiện có.
- [x] Có eval/test matrix đủ để khóa trigger, routing, checkpoint messaging, và resume semantics.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Skill duplicate logic với runner | Cao | Giữ runner là source of truth, skill chỉ orchestration |
| Stitch integration làm skill thành one-click blind automation | Cao | Mandatory dry-run + gated stop explanations |
| Resume semantics mơ hồ | Trung bình | Luôn re-read `stitch-pipeline-plan.json`, ledger, và mode context |
| Trigger quá yếu hoặc quá rộng | Trung bình | Pushy description + eval prompts positive/negative |
| Global skill thay đổi gây ảnh hưởng nhiều repo | Cao | TDD/eval trước, thay nhỏ từng phase, giữ refs concise |

## Open Questions

None.
