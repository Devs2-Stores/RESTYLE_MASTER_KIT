---
phase: 2
title: Shared Core Utilities
status: completed
priority: P1
dependencies:
  - 1
---

# Phase 2: Shared Core Utilities

## Overview

Sau khi Phase 1 đã khóa contract quan trọng, phase này trích shared helpers nhỏ để giảm duplication mà không phá surface public của toolkit. Đây cũng là nền bắt buộc để về sau có thể dựng single-entry runner mà không phải parse stdout chắp vá hay lặp CLI/path/report logic khắp nơi.

## Requirements

- Functional:
  - Tạo helper chung cho CLI parsing, findings severity, report formatting, path safety, và image dimensions.
  - Migrate các script lặp nhiều logic sang helper mới theo từng cụm nhỏ.
  - Giữ nguyên commands/flags documented trong `package.json` và `README.md`.
- Non-functional:
  - Không thêm dependency mới nếu chưa thật cần.
  - Ưu tiên helper thuần Node, dễ đọc, ít magic.
  - Migration phải incremental, có test che chắn từ Phase 1.

## Architecture

Tạo một shared core tối giản trong `lib/`:

- `lib/cli-args.js`: đọc required value, boolean flag, enum, number, csv.
- `lib/findings.js`: severity rank, `shouldFail()`, summary helpers.
- `lib/report.js`: escape Markdown cell, write JSON/MD, findings table helpers.
- `lib/path-utils.js`: resolve root/out, ensure-inside-root, URL/path join.
- `lib/image.js`: PNG/JPEG/SVG dimension reader đủ cho asset/final guard use cases.

Adoption strategy:
1. Bắt đầu với audit scripts + `workflow_final_guard.js`.
2. Sau đó áp dụng sang `asset_pipeline.js`, `theme_push.js`, `final_theme_export.js` nếu helper thật sự giảm duplication.
3. Chỉ migrate những phần có lặp rõ và đã có contract tests.

## Related Code Files

- Create: `lib/cli-args.js`
- Create: `lib/findings.js`
- Create: `lib/report.js`
- Create: `lib/path-utils.js`
- Create: `lib/image.js`
- Modify: `liquid_content_audit.js`
- Modify: `settings_boundary_audit.js`
- Modify: `css_token_audit.js`
- Modify: `workflow_final_guard.js`
- Modify: `asset_pipeline.js`
- Modify: `theme_push.js`
- Modify: `final_theme_export.js`
- Modify: `test/run_tests.js`

## Implementation Steps

1. Viết tests/characterization bổ sung cho helper behaviors thông qua public script behavior trước khi migrate rộng.
2. Tạo `lib/cli-args.js` với API nhỏ, rõ, đủ dùng cho repo hiện tại.
3. Tạo `lib/findings.js` và trích severity semantics từ 3 audit scripts.
4. Tạo `lib/report.js` để chuẩn hóa Markdown/JSON formatting, đặc biệt escape bảng Markdown.
5. Tạo `lib/path-utils.js` để xử lý root/out/path traversal nhất quán.
6. Tạo `lib/image.js` và thay thế logic đọc dimensions lặp ở final guard / asset pipeline.
7. Migrate cụm audit scripts trước; sau khi pass test mới áp dụng sang scripts còn lại theo mức lặp thực tế.
8. Chạy full suite và review manual help/output để xác nhận không đổi surface người dùng.

## Success Criteria

- [x] Có 5 helper files mới trong `lib/` với scope nhỏ, rõ, không framework hóa quá mức.
- [x] 3 audit scripts dùng chung severity/CLI/report logic thay vì lặp copy-paste.
- [x] `workflow_final_guard.js` và `asset_pipeline.js` dùng shared path/image helpers khi hợp lý.
- [x] Markdown reports không bị vỡ bảng bởi `|` hoặc newline trong message/path.
- [x] Public CLI examples trong `README.md` vẫn dùng được nguyên trạng.

## Risk Assessment

- Rủi ro: over-extraction làm code khó theo dõi hơn.
- Mitigation: chỉ trích logic lặp thực sự, helper ngắn, API tối giản.
- Rủi ro: helper adoption một lượt làm khó debug regression.
- Mitigation: migrate theo cụm script nhỏ, chạy test mỗi cụm.
