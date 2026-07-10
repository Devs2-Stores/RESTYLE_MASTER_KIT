---
phase: 1
title: Lock Trigger And Input Contract
status: completed
priority: P1
dependencies: []
---

# Phase 1: Lock Trigger And Input Contract

## Overview

Phase đầu khóa phần dễ regress nhất của global skill: trigger, scope boundary, và câu hỏi/input contract. Nếu bước này mơ hồ, skill sẽ undertrigger, overtrigger, hoặc hỏi sai dữ liệu trước cả khi orchestration bắt đầu.

## Requirements

- Functional:
  - Xác định và ghi rõ trigger cases mà skill phải bắt.
  - Khóa input matrix theo 4 mode: `full-theme`, `single-page`, `audit-led`, `resume`.
  - Khóa trigger theo **capability markers** (`stitch:full`, runner/docs tương đương), không chỉ theo tên repo/kit.
  - Xác định condition nào thì cần `/ck:stitch`, condition nào thì vào thẳng `stitch:full`.
- Non-functional:
  - Không duplicate toàn bộ logic brainstorm/report vào `SKILL.md`.
  - Giữ description đủ pushy để trigger tốt nhưng không vượt scope Stitch -> Haravan.
  - Ưu tiên eval prompts trước khi viết orchestration sâu.

## Architecture

Phase này chưa đổi engine. Nó chỉ khóa lớp interface của skill:
- `description` / `when_to_use`
- `argument-hint`
- references về input contract
- eval prompts positive/negative để bắt trigger drift

Tư duy TDD ở đây là **behavior-first**:
1. viết expectation cho trigger và input collection
2. rồi mới chỉnh `SKILL.md` + references

## Related Code Files

- Modify: `C:\Users\Admin\.claude\skills\haravan-stitch-full-run\SKILL.md`
- Modify: `C:\Users\Admin\.claude\skills\haravan-stitch-full-run\references\input-contract.md`
- Modify: `C:\Users\Admin\.claude\skills\haravan-stitch-full-run\references\mode-routing.md`
- Create: `C:\Users\Admin\.claude\skills\haravan-stitch-full-run\references\trigger-examples.md`
- Create: `C:\Users\Admin\.claude\skills\haravan-stitch-full-run\evals\evals.json`

## Implementation Steps

1. Liệt kê 12-20 prompt test đại diện cho các ask thực tế:
   - có export
   - chưa có export
   - single page
   - audit-led
   - resume
   - out-of-scope prompts
2. Khóa expected mode và expected required inputs cho từng prompt.
3. Chỉnh `description` / `when_to_use` để bắt đúng các prompt có giá trị nhất.
4. Tách `input-contract.md` thành bảng bắt buộc / optional / stop conditions rõ hơn.
5. Thêm `trigger-examples.md` với positive + negative examples ngắn.
6. Review để chắc skill không claim quá mức “one-click full auto”.

## Success Criteria

- [x] Có eval prompts rõ cho trigger positive/negative.
- [x] Mỗi mode có input contract cụ thể, không hỏi thừa.
- [x] Skill trigger đúng cho ask kiểu “clone Stitch vào Haravan”, “run full flow”, “resume”, “audit-led”.
- [x] Skill không trigger sai cho ask không thuộc Stitch -> Haravan workflow.
- [x] `SKILL.md` vẫn concise, không phình thành docs dài dòng.

## Risk Assessment

- Rủi ro: overtrigger làm skill nhảy vào cả ask chỉ muốn code nhỏ.
- Mitigation: thêm negative prompts vào evals.
- Rủi ro: undertrigger khi user dùng từ khác như “merge design”, “convert screen”, “resume checkpoint”.
- Mitigation: expand keyword examples và description phrasing theo user language thực tế.
