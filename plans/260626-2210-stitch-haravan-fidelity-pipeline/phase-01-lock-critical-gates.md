---
phase: 1
title: Lock Critical Gates
status: completed
priority: P1
dependencies: []
---

# Phase 1: Lock Critical Gates

## Overview

Khóa những gate quan trọng nhất của pipeline Stitch → Haravan bằng test deterministic trước khi trích helper hay dọn kiến trúc. Đây là phase TDD nền tảng để mọi refactor sau đó không vô tình nới lỏng handoff quality.

## Requirements

- Functional:
  - Định nghĩa và khóa `stitch-fidelity manifest/checklist` tối thiểu cho sections, assets, tokens, copy blocks và allowed deviations.
  - Thêm fixture pass/fail cho `workflow_final_guard.js`.
  - Thêm functional fixtures cho `visual_diff.js`.
  - Test và chuẩn hóa `--fail-on blocker|warn` cho 3 audit scripts.
  - Thêm coverage cho malformed CLI input ở các gate scripts ưu tiên.
- Non-functional:
  - Giữ `npm test` local, deterministic, không phụ thuộc network ngoài.
  - Không đổi public CLI names/flags/output filenames.
  - Chỉ sửa code tối thiểu để pass các tests mới.

## Architecture

Giữ test harness hiện tại dựa trên `test/run_tests.js` thay vì kéo framework mới. Thêm fixture directories trong `test/fixtures/` để mô tả contract thực tế của stitch-fidelity evidence, final handoff, và visual diff.

Deliverable đầu tiên của phase này là một manifest/checklist đủ nhỏ nhưng đo được “100% layout” trong ngữ cảnh Stitch → Haravan: section inventory, asset slots, token mapping status, copy blocks, allowed deviations, merge status.

Luồng TDD:
1. Viết fixtures + assertions trước.
2. Chạy `npm test` để thấy fail đúng chỗ.
3. Vá `stitch_consume.js` / `design_token_extract.js` / templates liên quan, rồi mới vá `workflow_final_guard.js`, `visual_diff.js`, và audit threshold semantics vừa đủ để pass.
4. Re-run full suite.

## Related Code Files

- Create: `test/fixtures/final-guard/pass/**`
- Create: `test/fixtures/final-guard/fail-missing-artifact/**`
- Create: `test/fixtures/final-guard/fail-wrong-dimensions/**`
- Create: `test/fixtures/final-guard/fail-invalid-description/**`
- Create: `test/fixtures/final-guard/fail-pending-ledger/**`
- Create: `test/fixtures/visual-diff/*.png`
- Create: `test/fixtures/stitch-fidelity/**`
- Modify: `test/run_tests.js`
- Modify: `workflow_final_guard.js`
- Modify: `visual_diff.js`
- Modify: `stitch_consume.js`
- Modify: `design_token_extract.js`
- Modify: `section-config.template.json`
- Modify: `asset-plan.template.json`
- Modify: `STITCH_FIDELITY.md`
- Modify: `RESTYLE_PROGRESS_LEDGER.template.md`
- Modify: `liquid_content_audit.js`
- Modify: `settings_boundary_audit.js`
- Modify: `css_token_audit.js`

## Implementation Steps

1. Định nghĩa manifest/checklist tối thiểu cho Stitch fidelity: section inventory, assets, tokens, copy blocks, allowed deviations, merge status.
2. Tạo fixture directories nhỏ và deterministic cho final guard; đảm bảo có cả case pass và nhiều case fail đại diện.
3. Tạo PNG fixtures nhỏ để test `visual_diff.js` cho các case identical, over-threshold, size mismatch, corrupt input.
4. Mở rộng `test/run_tests.js` bằng assertions mới cho:
   - stitch-fidelity artifact shape/content tối thiểu
   - `workflow_final_guard.js` pass/fail paths
   - `visual_diff.js` diff behavior
   - audit `--fail-on` semantics
   - malformed flag handling ở scripts ưu tiên
5. Chạy suite để khóa behavior mong muốn trước khi sửa code.
6. Vá `stitch_consume.js` / `design_token_extract.js` / templates liên quan ở mức tối thiểu để phát ra checklist/manifest additive.
7. Vá `workflow_final_guard.js` và `visual_diff.js` theo đúng contract tests, giữ nguyên surface CLI.
8. Chuẩn hóa logic `--fail-on warn` sao cho fail với cả `warn` và `blocker`.
9. Re-run `npm test` và targeted smoke commands để xác nhận không sinh regression ngoài scope.

## Success Criteria

- [x] Có stitch-fidelity manifest/checklist additive với fields tối thiểu cho sections, assets, tokens, copy blocks và allowed deviations.
- [x] `workflow_final_guard.js` có pass fixture và ít nhất 3 fail fixtures được assert rõ.
- [x] `visual_diff.js` có test cho identical, threshold fail, size mismatch, corrupt PNG.
- [x] `--fail-on warn` hành xử nhất quán giữa 3 audit scripts.
- [x] `npm test` vẫn pass đầy đủ sau khi thêm tests.
- [x] Không đổi tên scripts hay vị trí output documented trong `README.md`.

## Risk Assessment

- Rủi ro: fixture ảnh/screenshots quá lớn làm suite chậm.
- Mitigation: dùng PNG nhỏ, deterministic, không fullpage thật.
- Rủi ro: test harness monolithic khó đọc hơn.
- Mitigation: nhóm test theo section rõ ràng và comment mục đích từng block.
