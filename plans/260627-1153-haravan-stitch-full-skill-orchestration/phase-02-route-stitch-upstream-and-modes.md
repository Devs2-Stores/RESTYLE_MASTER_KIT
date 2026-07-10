---
phase: 2
title: Route Stitch Upstream And Modes
status: completed
priority: P1
dependencies:
  - 1
---

# Phase 2: Route Stitch Upstream And Modes

## Overview

Phase này biến skill từ thin wrapper thành workflow conductor thực thụ: biết khi nào phải gọi `/ck:stitch`, khi nào đi thẳng vào `stitch:full`, và cách biểu diễn 4 mode mà không phá safe-by-default boundary.

## Requirements

- Functional:
  - Route `/ck:stitch` khi mode cần design generation mà user chưa có export.
  - Route `stitch:full` khi export đã sẵn sàng.
  - Chuẩn hóa mode handling cho `full-theme`, `single-page`, `audit-led`, `resume`.
- Non-functional:
  - Không nhúng Stitch API/SDK vào runner engine.
  - Không để skill duplicate logic deterministic vốn đã nằm trong `stitch_pipeline_runner.js`.
  - Vẫn luôn dry-run first.

## Architecture

Decision tree orchestration:
1. detect mode
2. inspect whether export exists
3. if no export and mode requires design -> invoke `/ck:stitch`
4. if export exists -> run `stitch:full` dry-run
5. summarize `stitch-pipeline-plan.json`
6. offer next safe continue step

Skill layer owns **routing**, not engine execution semantics.

## Related Code Files

- Modify: `C:\Users\Admin\.claude\skills\haravan-stitch-full-run\SKILL.md`
- Modify: `C:\Users\Admin\.claude\skills\haravan-stitch-full-run\references\mode-routing.md`
- Create: `C:\Users\Admin\.claude\skills\haravan-stitch-full-run\references\stitch-upstream-handoff.md`
- Modify: `C:\Users\Admin\Desktop\RESTYLE_MASTER_KIT\README.md`
- Modify: `C:\Users\Admin\Desktop\RESTYLE_MASTER_KIT\RUN_GUIDE.md`
- Modify: `C:\Users\Admin\Desktop\RESTYLE_MASTER_KIT\START_HERE.md`

## Implementation Steps

1. Định nghĩa mode matrix:
   - `full-theme`: export required or generate via `/ck:stitch`
   - `single-page`: same, but page-scoped
   - `audit-led`: no Stitch required
   - `resume`: artifact/ledger first
2. Viết `stitch-upstream-handoff.md` mô tả exact handoff artifact giữa `/ck:stitch` và `stitch:full`.
3. Nâng `SKILL.md` để branch rõ giữa “generate first” và “convert existing export”.
4. Cập nhật docs entrypoint để user hiểu global skill giờ đã có upstream Stitch routing.
5. Re-check boundaries: runner vẫn là deterministic CLI, skill chỉ phối luồng.

## Success Criteria

- [x] Skill phân biệt đúng 4 mode.
- [x] Khi thiếu export ở mode cần design, skill route qua `/ck:stitch` thay vì fail mơ hồ.
- [x] Khi export đã có, skill không bắt user generate lại vô ích.
- [x] Docs entrypoint phản ánh đúng routing mới.
- [x] Không có logic Stitch API bị nhúng vào `stitch_pipeline_runner.js`.

## Risk Assessment

- Rủi ro: orchestration lẫn lộn giữa “design generation” và “theme conversion”.
- Mitigation: một reference riêng cho upstream handoff.
- Rủi ro: mode `single-page` và `full-theme` nói khác nhau nhưng action giống nhau gây dư thừa.
- Mitigation: share rules, chỉ giữ điểm khác ở scope/inputs.
