---
title: "Tổng kết kế hoạch Haravan Stitch Full Skill Orchestration"
date: "2026-06-27 12:13"
status: "resolved"
severity: "Low"
component: "Global skill orchestration `haravan-stitch-full-run`"
---

## context
- Kế hoạch đã làm tới checkpoint cuối tại `plans/260627-1153-haravan-stitch-full-skill-orchestration/plan.md`.
- Báo cáo tổng hợp PM (`reports/pm-260627-1210-final-skill-plan-sync-back.md`) xác nhận `progress: 4/4`, `open phase: 0`, và tất cả phase đều `completed`.
- Môi trường hiện tại không có git repo, nên không có bước commit/ship; đây là nhật ký tổng kết chứ không phải lịch sử release.

## what happened
- Hoàn tất toàn bộ 4 phase của plan, từ khóa trigger/input contract, routing giữa upstream-runner, resume+checkpoint, rồi đóng gói tài liệu/eval.
- **Thực tế lớn**: kỹ năng đã từ “wrapper mỏng” đổi thành orchestrator thực thụ A-Z: đọc context, route, gọi đúng phase, giải thích trạng thái trước khi gợi ý bước kế tiếp.
- Quyết định cứng về ranh giới được khóa:
  - `/ck:stitch` giữ trách nhiệm **upstream-design** khi chưa có export chuẩn.
  - `stitch:full` giữ **runner-conversion** theo deterministic flow khi đã có export (nhấn mạnh lại trong `SKILL.md` lines về boundary).
- Áp dụng `hybrid resume` và `stop-and-suggest`: ưu tiên đọc `stitch-pipeline-plan.json` làm source chính rồi đối chiếu ledger khi tiếp tục; gặp checkpoint (asset/gap/permission/visual) thì dừng, giải thích rõ và suggest skill/command kế tiếp.
- Expanded eval matrix đã được bổ sung cho các nhánh trigger/routing/checkpoint/resume.
- Tăng discoverability docs: `README.md`, `START_HERE.md`, `PROMPT.template.md`, các references trong global skill.

Cảm giác khi tổng hợp xong: nhẹ nhõm vì đã gỡ được phần loạn route trước đó, nhưng đúng thật là cực mệt vì phải giữ đồng nhất mô tả giữa skill + docs + plan để không tạo ra ambiguity.

## decisions
- Không nhúng logic MCP vào runner; chỉ orchestration ở skill.
- Giữ `stitch_pipeline_runner.js` deterministic và an toàn theo dry-run trước, execute có checkpoint.
- Giữ route mode rõ ràng theo capability markers (stitch:full, runner equivalents, intent user).
- Chấp nhận không có pilot run sản phẩm thật tại giai đoạn này; chốt bằng review contracts/evals trước.

## next
- [Owner: PM / plan lead] Trong 1 ngày: archive plan kết quả để đội khác onboarding nhanh hơn.
- [Owner: maintainer skill] Trong 1 tuần tới: rà một lần thực chiến nhỏ (`full-theme` dry-run + execute đến first checkpoint) để validate messaging checkpoint đúng như eval.
- [Owner: docs steward] Duy trì discoverability khi đổi version skill, đặc biệt phần boundary `/ck:stitch` vs `stitch:full`.
