---
title: Stitch-to-Haravan Fidelity Pipeline Stabilization
description: >-
  TDD-first implementation plan to make the Stitch → Haravan merge pipeline
  reliable, measurable, and backward-compatible.
status: completed
priority: P1
effort: medium
branch: ''
tags:
  - stitch
  - haravan
  - tdd
  - toolkit
blockedBy: []
blocks: []
created: '2026-06-26T15:17:51.971Z'
createdBy: 'ck:plan'
source: skill
---

# Stitch-to-Haravan Fidelity Pipeline Stabilization

## Overview

Plan này chuyển hướng brainstorm đã duyệt trong `../reports/260626-2209-stitch-to-haravan-roadmap-audit.md` thành implementation roadmap theo **tests-first**.

Mục tiêu không phải thêm nhiều feature mới. Mục tiêu là làm pipeline **Stitch → Haravan** đáng tin hơn: giữ layout fidelity, merge theme-native an toàn, có **stitch-fidelity manifest/checklist** để đo được “100% layout”, khóa gate bằng test, và tiến tới **single-entry pipeline với gated stops** để một lệnh có thể chạy full flow từ đầu tới done mà vẫn dừng đúng chỗ cần decision của người.

## Phases

| Phase | Name | Status | Priority | Depends On | Objective |
|-------|------|--------|----------|------------|-----------|
| 1 | [Lock Critical Gates](./phase-01-lock-critical-gates.md) | Completed | P1 | - | Khóa stitch-fidelity manifest/checklist, final guard, visual diff, và audit fail thresholds bằng fixture tests trước khi refactor. |
| 2 | [Shared Core Utilities](./phase-02-shared-core-utilities.md) | Completed | P1 | 1 | Trích helper chung cho CLI args, findings, reports, path safety, image dimensions làm nền cho single-entry pipeline. |
| 3 | [Browser Verification Hardening](./phase-03-browser-verification-hardening.md) | Completed | P2 | 2 | Chuẩn hóa helper browser, thêm local QA/A11y smoke fixtures, và giảm drift lifecycle giữa qa/a11y/final capture. |
| 4 | [Docs And Skill Operating Model](./phase-04-docs-and-skill-operating-model.md) | Completed | P2 | 3 | Canonicalize entry docs, remove stale Stitch refs, and add phase-based skill guidance for the full Stitch -> Haravan flow. |
| 5 | [Single-Entry Pipeline Runner](./phase-05-optional-workflow-runner-prep.md) | Completed | P2 | 4 | Tạo `stitch:full` safe-by-default, ghi plan artifact JSON, và execute chỉ chạy safe prefix rồi dừng ở gated checkpoint. |

## Dependencies

- Cross-plan dependencies: **None found** trong `plans/*/plan.md` tại thời điểm tạo plan.
- Execution order khuyến nghị: **01 → 02 → 03 → 04 → 05**.
- Boundary bắt buộc:
  - Giữ `package.json` scripts hiện có trừ khi additive-only.
  - Không đổi behavior public nếu chưa có characterization test khóa trước.
  - Không thêm dependency mới nếu helper thuần Node hiện tại là đủ.
  - Không xây mega-orchestrator trước khi phases 1-4 hoàn tất.

## Success Criteria

- [x] Có stitch-fidelity manifest/checklist additive để track sections, assets, tokens, copy blocks và allowed deviations.
- [x] Có fixture tests cho `workflow_final_guard.js` pass/fail quan trọng nhất.
- [x] Có functional tests cho `visual_diff.js` với PNG fixtures deterministic.
- [x] `--fail-on` behavior được chuẩn hóa và được test.
- [x] Shared helpers giảm duplication ở CLI/report/path/image mà không phá command hiện có.
- [x] QA/a11y/browser checks có local verification path, không phụ thuộc preview thật cho smoke coverage.
- [x] `STITCH_PROMPT.template.md` và docs chính không còn stale references gây lệch workflow.
- [x] Có skill operating model rõ: skill nào dùng ở phase nào, skill nào phải đợi design approval.
- [x] Có single-entry pipeline runner cho Stitch -> Haravan với gated stops rõ ràng cho asset, stitch gap, permission, và visual approval; default vẫn an toàn, không one-click mù.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Refactor helper làm vỡ CLI scripts hiện có | Cao | Characterization tests trước, migrate từng script nhỏ |
| Visual/browser tests flaky | Trung bình | Dùng fixture local, không phụ thuộc network ngoài |
| Docs churn nhiều hơn giá trị | Trung bình | Chỉ sửa stale refs + navigation + skill map, không rewrite toàn bộ |
| Workflow runner nở scope | Cao | Đẩy runner xuống Phase 5, chỉ làm khi phases 1-4 đã ổn |

## Open Questions

None.
