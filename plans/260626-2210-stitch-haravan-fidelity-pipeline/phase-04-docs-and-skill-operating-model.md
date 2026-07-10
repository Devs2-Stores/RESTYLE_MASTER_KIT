---
phase: 4
title: Docs And Skill Operating Model
status: completed
priority: P2
dependencies:
  - 3
---

# Phase 4: Docs And Skill Operating Model

## Overview

Phase này dọn phần con người/agent interface của kit: sửa tài liệu Stitch bị stale, canonical hóa đường vào, giảm overlap giữa các file entrypoint, và gắn skill map đúng phase để hạn chế việc “nạp skill vô tội vạ”.

## Requirements

- Functional:
  - Sửa stale references ảnh hưởng trực tiếp đến Stitch workflow.
  - Làm rõ doc nào là entrypoint chính, doc nào là playbook, doc nào là cheat sheet.
  - Gắn skill operating model vào workflow để biết khi nào dùng `haravan-*`, `stitch`, `web-testing`, `ck:debug`, `ck:plan`, `ck:cook`.
  - Cập nhật docs cho single-entry flow: một command full-run nhưng có gated stops, không phải one-click mù.
- Non-functional:
  - Không rewrite toàn bộ docs nếu không cần.
  - Giảm cognitive load mà vẫn giữ rigor của workflow hiện tại.
  - Chỉ cập nhật nội dung phản ánh đúng scripts/contracts sau các phase trước.

## Architecture

Phân vai docs rõ ràng:

- `START_HERE.md`: landing canonical.
- `README.md`: overview + script catalog chính.
- `RUN_GUIDE.md`: decision tree theo luồng A/B/C/D.
- `FLOW_A.md`: cheat sheet cho full Stitch theme.
- `HARAVAN_THEME_RESTYLE_WORKFLOW.md`: policy/source of truth dài.
- `STITCH_FIDELITY.md`: contract chống lệch design.

Skill operating model nên bám vào các phase workflow, không phải list chung chung.

## Related Code Files

- Modify: `START_HERE.md`
- Modify: `README.md`
- Modify: `RUN_GUIDE.md`
- Modify: `FLOW_A.md`
- Modify: `HARAVAN_THEME_RESTYLE_WORKFLOW.md`
- Modify: `STITCH_FIDELITY.md`
- Modify: `STITCH_PROMPT.template.md`
- Modify: `PROMPT.template.md`
- Modify: `UPGRADE.md`

## Implementation Steps

1. Fix ngay stale Stitch references trong `STITCH_PROMPT.template.md` và version example cũ trong `UPGRADE.md`.
2. Chọn `START_HERE.md` làm landing canonical; thêm journey table và minimum required inputs cho agent/user.
3. Giảm text entrypoint trùng lặp giữa `README.md`, `RUN_GUIDE.md`, `FLOW_A.md` mà vẫn giữ links rõ.
4. Xác định một nơi chính cho script catalog; các doc còn lại chỉ giữ subset theo workflow của chúng.
5. Thêm phase-based skill map: scout/fingerprint, Stitch/design, merge implementation, QA/fix, final handoff.
6. Ghi rõ skill nào chỉ nên dùng sau design approval: `ck:cook`, `haravan-settings`, `ai-artist`, `copywriting`, `haravan-preview-screenshot`.
7. Re-read docs và examples để đảm bảo không còn self-contradiction sau khi chỉnh.

## Success Criteria

- [x] `STITCH_PROMPT.template.md` không còn tham chiếu workflow section đã lỗi thời.
- [x] `START_HERE.md` đóng vai landing rõ ràng, không cạnh tranh với `README.md`/`RUN_GUIDE.md`.
- [x] Người mới có thể nhìn doc map và biết ngay nên vào luồng A/B/C/D nào.
- [x] Skill map theo phase có mặt trong docs phù hợp và phản ánh đúng workflow hiện tại.
- [x] Không có docs change chỉ để “cho đủ”; mọi thay đổi đều giảm friction thực sự.

## Risk Assessment

- Rủi ro: docs churn cao nhưng ít giá trị.
- Mitigation: ưu tiên stale refs, navigation, skill map; tránh rewrite triệt để.
- Rủi ro: thêm skill guidance nhưng lại làm docs dài hơn.
- Mitigation: dùng bảng ngắn, phase-based, không viết prose dài dòng.
