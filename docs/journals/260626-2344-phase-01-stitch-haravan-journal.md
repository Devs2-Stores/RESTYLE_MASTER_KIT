---
title: "Phase 1 hoàn tất: Lock Critical Gates – Stitch-to-Haravan Fidelity Pipeline"
date: 2026-06-26 23:44
severity: High
component: Stitch to Haravan fidelity tooling
status: Resolved
phase: 1
progress: "Plan in-progress: 1/5 (Phase 01 completed)"
---

## Context
- Plan: `C:\Users\Admin\Desktop\RESTYLE_MASTER_KIT\plans\260626-2210-stitch-haravan-fidelity-pipeline\plan.md`
- Phase file: `C:\Users\Admin\Desktop\RESTYLE_MASTER_KIT\plans\260626-2210-stitch-haravan-fidelity-pipeline\phase-01-lock-critical-gates.md`
- PM sync-back: `C:\Users\Admin\Desktop\RESTYLE_MASTER_KIT\plans\260626-2210-stitch-haravan-fidelity-pipeline\reports\pm-260626-2342-phase-01-sync-back.md`

## What Happened
Phase 1 đã được đóng: lock các gate quan trọng cho fidelity trước khi đụng refactor sâu. Chúng tôi đã khóa artifact theo `STITCH_FIDELITY.md` bằng các fixture pass/fail cho `workflow_final_guard.js` và test hành vi `visual_diff.js`. `stitch-fidelity manifest/checklist` đã được khóa dạng additive trong output của `stitch_consume` và `design_token_extract` với các trường tối thiểu: `sections`, `assetSlots`, `tokens`, `copyBlocks`, `allowedDeviations`, `mergeStatus`.

## The Brutal Truth
Thẳng thắn thì giai đoạn này cực đau đầu ở phần “đóng cửa đúng chỗ.” Nhiều thứ dường như nhỏ như liên kết CSS hay `rgba` nhưng không khóa contract sớm sẽ làm gate đi vào đường hầm vô hình. Cảm giác thật sự là **mệt vì mỗi bước lại phát hiện một lệch tinh vi** rồi lại phải quay lại fixture/logic. Nhưng lúc khóa xong thì thấy nhẹ hẳn: pipeline bây giờ có barđiểm kiểm chứng rõ ràng thay vì đoán mò.

## Technical Details
- Đã sửa `stitch_consume.js` để follow linked CSS đúng cách (tránh bỏ sót rule nguồn ngoài file chính).
- Đã sửa `design_token_extract.js` để bảo toàn `rgb/rgba` khi trích xuất token, tránh mất semantic màu.
- Đã cứng hóa `workflow_final_guard.js` để xác minh PNG thực sự hợp lệ (không nhận file hỏng/bị lỗi), thay vì chỉ chặn thiếu file.
- `npm test` đã xanh lại sau rework: `152/0`.
- PM sync-back xác nhận: plan `status: in-progress`, Phase 01 `completed`, Phase 02-05 còn `pending`, task chain chuyển sang `#11 -> #12 -> #13 -> #14`.

## Decisions
- Đã chọn lock gate bằng fixture deterministic trước khi tối ưu code (đi theo yêu cầu TDD-phase, không đảo ngược). 
- Đã giữ surface CLI ổn định (không đổi script name/flags/output), chỉ thay đổi hành vi nội bộ cần thiết để pass contract tests.
- Đã ưu tiên fix nhanh các blocker thực sự (`linked CSS follow`, `rgba/rgb preservation`, `PNG integrity`) thay vì mở rộng refactor shared helper.

## Root Cause Analysis
Chi tiết gốc là pipeline chưa có manifest/cơ chế bắt buộc đủ đủ cho fidelity trước khi vào các bước “đẹp hóa”. `workflow_final_guard` và `visual_diff` từng thiếu độ cứng cần thiết để chặn regressions thật, nên dễ thoát lỗi mà chưa kịp phát hiện.

## Lessons Learned
- Không có dữ liệu evidence + guard, mọi refactor đều là blindfold.
- Một lỗi về token màu (nhất là `rgb/rgba`) có thể làm audit pass nhưng phá lòng tin vào fidelity.
- Guard phải xác thực file thực thể (`PNG` integrity), không chỉ kiểm tra sự tồn tại.

## Next Steps
- Giao cho phase 02 owner: triển khai `#11 Extract shared core utilities` trong tuần này.
- Trước mỗi thay đổi lớn của phase 02, giữ lại `npm test` và các fixture vừa khóa của phase 01.
- Xử lý concern còn lại từ reviewer: cân nhắc chuyển runtime-generated temp PNG/browser fixtures sang `test/fixtures/**` để audit/debug dễ hơn.

## 200-500 word check
- Entry ngắn gọn đã giữ trọng tâm kỹ thuật và quyết định cụ thể, đủ thông tin để đội ngũ kế thừa hiểu tại sao phase này “đắt” đến mức phải khóa chặt.
