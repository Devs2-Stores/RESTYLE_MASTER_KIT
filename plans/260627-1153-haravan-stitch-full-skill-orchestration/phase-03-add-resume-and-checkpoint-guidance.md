---
phase: 3
title: Add Resume And Checkpoint Guidance
status: completed
priority: P2
dependencies:
  - 2
---

# Phase 3: Add Resume And Checkpoint Guidance

## Overview

Phase này làm cho skill có cảm giác giống `/ck:cook` hơn: không chỉ route command, mà còn hiểu nó đang dừng ở đâu và phải nói gì tiếp theo. Trọng tâm là resume semantics, checkpoint messaging, và support-skill routing mà không bypass human judgment.

## Requirements

- Functional:
  - Resume phải re-read `stitch-pipeline-plan.json` và ledger trước khi tiếp tục.
  - Skill phải giải thích checkpoint hiện tại và input còn thiếu.
  - Khi phù hợp, skill có thể gợi ý support skills cho checkpoint kế tiếp.
- Non-functional:
  - Không được auto-approve asset/gap/visual decisions.
  - Không biến checkpoint explanation thành prose dài và mơ hồ.
  - Output phải nhất quán giữa dry-run / execute / resume.

## Architecture

State sources theo thứ tự ưu tiên:
1. current mode request
2. latest `stitch-pipeline-plan.json` (source chính)
3. ledger / deliverables state (cross-check + human state)
4. docs boundaries (`STITCH_FIDELITY.md`, `RUN_GUIDE.md`)

Checkpoint messaging contract:
- what stopped
- why it stopped
- what exact human input is needed
- what command/skill to use next

Checkpoint policy đã chốt là **stop-and-suggest**:
- skill dừng ở checkpoint
- không auto-approve
- nhưng phải gợi ý skill/command kế tiếp phù hợp thay vì chỉ hỏi mơ hồ

## Related Code Files

- Modify: `C:\Users\Admin\.claude\skills\haravan-stitch-full-run\SKILL.md`
- Modify: `C:\Users\Admin\.claude\skills\haravan-stitch-full-run\references\checkpoint-policy.md`
- Create: `C:\Users\Admin\.claude\skills\haravan-stitch-full-run\references\resume-policy.md`
- Create: `C:\Users\Admin\.claude\skills\haravan-stitch-full-run\references\support-skill-routing.md`
- Modify: `C:\Users\Admin\Desktop\RESTYLE_MASTER_KIT\RUN_GUIDE.md`
- Modify: `C:\Users\Admin\Desktop\RESTYLE_MASTER_KIT\START_HERE.md`

## Implementation Steps

1. Viết `resume-policy.md` mô tả artifact + ledger read order.
2. Chuẩn hóa output format cho checkpoint explanation.
3. Thêm support-skill routing table:
   - asset/gap -> `/ck:stitch` edit or `haravan-settings`
   - QA gate -> `web-testing`, `haravan-accessibility`, `haravan-performance`
   - debug gate -> `ck:debug`
4. Thêm evals cho resume asks và blocked-checkpoint asks.
5. Review để chắc skill vẫn stop-and-suggest, không tự lấn sang implementation.

## Success Criteria

- [x] Resume asks re-read đúng artifact + ledger.
- [x] Mỗi checkpoint explanation đều có: stop reason, required input, next exact action.
- [x] Skill gợi ý support-skill đúng ngữ cảnh nhưng không bypass approval.
- [x] Output giữa dry-run / execute / resume nhất quán.

## Risk Assessment

- Rủi ro: resume dựa vào artifact cũ/stale.
- Mitigation: skill phải nói rõ artifact nào đang được dùng.
- Rủi ro: support-skill routing quá hăng, biến brainstorm/orchestration thành implementation tự động.
- Mitigation: chỉ suggest or invoke khi scope cho phép và sau khi checkpoint đã được user hiểu/chọn.
