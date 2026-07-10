---
phase: 4
title: Document And Validate Global Skill
status: completed
priority: P2
dependencies:
  - 3
---

# Phase 4: Document And Validate Global Skill

## Overview

Phase cuối cùng đóng gói phần orchestration thành một global skill dùng được thật: docs concise, references rõ, eval loop có giá trị, và project-side discoverability đủ để người khác dùng mà không cần đọc toàn bộ lịch sử thay đổi.

## Requirements

- Functional:
  - Hoàn thiện references cho skill orchestration.
  - Chạy/thiết kế validation path cho trigger, routing, checkpoint, resume.
  - Đồng bộ project docs đủ để discover skill mới.
- Non-functional:
  - Không làm `SKILL.md` phình quá mức.
  - Giữ progressive disclosure: trigger ở metadata, flow ở `SKILL.md`, chi tiết ở references.
  - Chỉ update docs/project files khi giúp user discover/use skill tốt hơn.

## Architecture

Validation stack nên gồm:
- positive trigger prompts
- negative trigger prompts
- routing prompts by mode
- resume prompts
- checkpoint explanation prompts

Project docs chỉ cần đủ để:
- nói skill tồn tại
- nói khi nào dùng
- không thay thế `RUN_GUIDE.md` / `STITCH_FIDELITY.md`

## Related Code Files

- Modify: `C:\Users\Admin\.claude\skills\haravan-stitch-full-run\SKILL.md`
- Modify: `C:\Users\Admin\.claude\skills\haravan-stitch-full-run\references\*.md`
- Create: `C:\Users\Admin\.claude\skills\haravan-stitch-full-run\evals\evals.json`
- Modify: `C:\Users\Admin\Desktop\RESTYLE_MASTER_KIT\README.md`
- Modify: `C:\Users\Admin\Desktop\RESTYLE_MASTER_KIT\START_HERE.md`
- Modify: `C:\Users\Admin\Desktop\RESTYLE_MASTER_KIT\PROMPT.template.md`

## Implementation Steps

1. Tighten `SKILL.md` wording theo đúng orchestration role cuối cùng.
2. Bổ sung references còn thiếu và xóa trùng lặp khỏi `SKILL.md`.
3. Tạo eval matrix tối thiểu cho trigger/routing/resume/checkpoint.
4. Cập nhật docs discoverability ở project nếu cần:
   - khi nào dùng global skill
   - khi nào dùng trực tiếp `stitch:full`
5. Chạy review cuối để chắc skill không claim quá khả năng thực tế.

## Success Criteria

- [x] Global skill docs đủ để người khác dùng mà không cần đoán.
- [x] Có eval matrix cho trigger/routing/resume/checkpoint semantics.
- [x] Project docs discover được skill nhưng không bị trùng flow docs hiện có.
- [x] `SKILL.md` vẫn concise và đúng progressive disclosure.

## Risk Assessment

- Rủi ro: docs quá nhiều, lấn vai trò của `RUN_GUIDE.md`.
- Mitigation: chỉ thêm discoverability + pointers.
- Rủi ro: eval matrix thiếu negative cases.
- Mitigation: bắt buộc có prompts out-of-scope và ambiguous.
