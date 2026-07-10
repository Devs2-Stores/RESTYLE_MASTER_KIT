---
phase: 3
title: Browser Verification Hardening
status: completed
priority: P2
dependencies:
  - 2
---

# Phase 3: Browser Verification Hardening

## Overview

Phase này làm cho các browser-based checks đáng tin hơn: ít duplication Puppeteer lifecycle, có local fixtures để test được QA/a11y path mà không cần preview Haravan thật, và giảm khả năng leak page/browser.

## Requirements

- Functional:
  - Tạo shared Puppeteer utility cho open page, viewport, settle, screenshot lifecycle.
  - Thêm local browser fixture pages cho `qa_restyle_check.js` và `a11y_deep.js` smoke coverage.
  - Tối ưu `visual_diff.js` URL capture path để tránh launch browser vô ích mỗi screenshot khi có thể.
- Non-functional:
  - Test local, deterministic, không phụ thuộc theme preview bên ngoài.
  - Không thay đổi user-facing flags của QA/a11y/visual scripts.
  - Ưu tiên reliability hơn micro-optimization.

## Architecture

Tạo `lib/puppeteer-utils.js` với một số primitive chung:

- `launchBrowser()`
- `withPage(browser, fn)` bảo đảm `page.close()` trong `finally`
- `buildUrl(base, pagePath)`
- `navigateAndSettle(page, url, options)`
- `setViewportPreset(page, width)`

Thêm local fixture server tối giản trong test scope để render các page có:
- console error
- page error
- overflow
- missing alt
- bad selector / good selector cho flow actions

## Related Code Files

- Create: `lib/puppeteer-utils.js`
- Create: `test/browser-fixture-server.js`
- Create: `test/fixtures/browser/*.html`
- Modify: `qa_restyle_check.js`
- Modify: `a11y_deep.js`
- Modify: `visual_diff.js`
- Modify: `final_showcase_capture.js`
- Modify: `test/run_tests.js`

## Implementation Steps

1. Thiết kế fixture pages tối thiểu bao phủ các browser issues quan trọng nhất của kit.
2. Viết smoke tests local cho QA/a11y path trước khi refactor browser internals.
3. Tạo `lib/puppeteer-utils.js` với API nhỏ và rõ.
4. Migrate `qa_restyle_check.js` sang shared lifecycle helpers.
5. Migrate `a11y_deep.js` và `final_showcase_capture.js` sang `withPage()` / `navigateAndSettle()`.
6. Refactor `visual_diff.js` URL capture path để reuse browser/page hợp lý và xử lý lỗi rõ hơn.
7. Re-run full suite + targeted browser smoke tests để xác nhận phase không tăng flakiness.

## Success Criteria

- [x] Có local browser fixtures cho ít nhất console error, overflow, missing alt, và flow action success/fail.
- [x] `qa_restyle_check.js` có local smoke coverage, không chỉ `--help`.
- [x] `a11y_deep.js` có local axe smoke path.
- [x] `final_showcase_capture.js` và các script browser quan trọng dùng lifecycle an toàn với `finally`.
- [x] Browser-based tests vẫn đủ nhanh để chạy local thường xuyên.

## Risk Assessment

- Rủi ro: browser tests flaky trên máy yếu/CI khác nhau.
- Mitigation: fixture nhỏ, timeout bảo thủ, không phụ thuộc network ngoài.
- Rủi ro: shared Puppeteer helper che mất logic script-specific.
- Mitigation: helper chỉ giữ lifecycle/common flow; rule nghiệp vụ vẫn ở script gốc.
