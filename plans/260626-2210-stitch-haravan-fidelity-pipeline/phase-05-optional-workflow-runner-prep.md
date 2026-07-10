---
phase: 5
title: Single-Entry Pipeline Runner
status: completed
priority: P2
dependencies:
  - 4
---

# Phase 5: Single-Entry Pipeline Runner

## Overview

Phase cuối cùng biến kit từ tập hợp script + docs thành một entrypoint duy nhất cho Stitch → Haravan flow. Mục tiêu không phải one-click blind automation, mà là **1 command + gated stops**: dry-run mặc định, execute chỉ chạy safe prefix và dừng đúng chỗ cần human judgment.

## Requirements

- Functional:
  - Tạo một single entrypoint command (`stitch:full`) cho Stitch → Haravan flow.
  - Runner phải ghi machine-readable plan artifact để các bước sau có thể resume/inspect.
  - Execute mode chỉ chạy deterministic safe prefix.
  - Runner phải dừng ở các checkpoint bắt buộc: asset approval, stitch gap resolution, permission boundary, visual approval.
- Non-functional:
  - Mặc định an toàn; không push live/export/generate asset bừa.
  - Không phá scripts cũ; runner là wrapper additive.
  - Không parse stdout mong manh để quyết định workflow.

## Architecture

Runner hiện tại dùng `stitch_pipeline_runner.js` và `npm run stitch:full` làm single entrypoint.

Nguyên tắc:
- dry-run by default
- machine-readable plan file: `stitch-pipeline-plan.json`
- safe prefix only khi `--execute`
- gated checkpoints được in rõ và không bị bỏ qua
- public scripts cũ vẫn là source of truth cho từng step cụ thể

## Related Code Files

- Create: `stitch_pipeline_runner.js`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `RUN_GUIDE.md`
- Modify: `START_HERE.md`
- Modify: `test/run_tests.js`

## Implementation Steps

1. Tạo single-entry runner với parse args, mode selection, safe-by-default behavior.
2. Ghi `stitch-pipeline-plan.json` trong dry-run để expose steps + checkpoints machine-readable.
3. Implement execute mode chỉ chạy deterministic safe prefix, rồi dừng ở checkpoint đầu tiên.
4. Thêm script `npm run stitch:full` vào `package.json`.
5. Thêm regression tests cho help, dry-run artifact, execute stop-at-checkpoint.
6. Cập nhật docs entrypoint (`README.md`, `START_HERE.md`, `RUN_GUIDE.md`) để user discover được command mới và hiểu rõ đây là gated flow, không phải one-click mù.

## Success Criteria

- [x] Có single entrypoint `npm run stitch:full`.
- [x] Dry-run ghi `stitch-pipeline-plan.json` với `steps` + `checkpoints`.
- [x] Execute mode dừng ở checkpoint đầu tiên thay vì chạy mù tới cuối.
- [x] Existing scripts vẫn chạy độc lập, không bị đổi contract.
- [x] Docs giải thích đúng boundaries của runner.

## Risk Assessment

- Rủi ro: user hiểu nhầm đây là one-click full auto.
- Mitigation: docs và output CLI phải nhấn mạnh gated stops.
- Rủi ro: mode `audit-led` / `resume` chưa sâu bằng `full-theme`.
- Mitigation: treat current runner as thin wrapper baseline; mở rộng mode depth sau khi full-theme path ổn định.
- Rủi ro: cleanup/test order làm green giả.
- Mitigation: lock runner behavior bằng integration tests trong `test/run_tests.js`.
