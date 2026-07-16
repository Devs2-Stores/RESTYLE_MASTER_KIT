# Prompt Templates

Copy-paste prompt vào agent (Codex / Claude / Cursor / Kiro). Điền `<...>` rồi gửi.

Nếu đã cài global skill `haravan-stitch-full-run`, có thể ưu tiên gọi skill đó cho full workflow Stitch -> Haravan; bộ prompt này vẫn hữu ích khi muốn điều khiển flow bằng prompt tay hoặc debug từng luồng riêng.

Quy tắc: agent cần **3 thông tin tối thiểu** mới start được:
- Theme path
- Stitch export path (nếu có)
- Preview URL (hoặc xác nhận chưa có)

Nếu thiếu 1 trong 3, agent sẽ hỏi lại — đỡ dài hơn nếu cho luôn.

---

## 0. Gọi global skill trực tiếp (ngắn nhất)

```text
Nạp skill /haravan trước, rồi dùng global skill haravan-stitch-full-run cho flow Stitch -> Haravan.
Theme: <C:/path/to/theme>
Stitch export: <C:/path/to/stitch-export> hoặc nói rõ là chưa có export
Preview URL: <https://...> hoặc "chưa có"
```

Nếu chưa có export, skill nên route upstream qua `/ck:stitch` trước; nếu đã có export thì đi vào `stitch:full` dry-run.

---

## 1. Kickoff luồng A — Stitch full theme

**Minimum (3 dòng)**:

```
Đọc RESTYLE_MASTER_KIT/FLOW_A.md và chạy luồng A từ A.1.
Theme: <C:/path/to/theme>
Stitch export: <C:/path/to/stitch-export-folder> (đã có file html/css của từng screen: home, collection, product, blog, cart)
```

**Full version (khuyến nghị, agent đỡ phải hỏi lại)**:

```
Restyle full theme Haravan theo Stitch design.

Đọc RESTYLE_MASTER_KIT/FLOW_A.md và chạy luồng A từ A.1.

Context:
- Theme đích: <C:/path/to/theme>
- Stitch export: <C:/path/to/stitch-export>
- Preview URL hiện tại: <https://...> (hoặc "chưa có, sẽ chạy haravan theme dev sau")
- Brand: <tên brand>, ngành <skincare/fashion/...>, tone <minimal/luxury/...>

Permissions:
- settings_data.json: <được sửa | KHÔNG được sửa>
- Push live: <được | KHÔNG, chỉ unpublished>
- Xóa CSS/JS/asset cũ orphan: <được | report-only>

Asset source ưu tiên: <BFL flux-2 | brand cung cấp | reuse theme cũ | iconify free>

Constraint:
- Nạp skill /haravan trước khi làm việc (nếu có hệ skill Haravan).
- Template-first conversion: markup MỚI 100% theo Stitch, xóa code bị thay — không đè CSS lên layout cũ, không fallback layout cũ. Feature/behavior cũ bưng hook sang markup mới.
- Bưng nguyên Stitch theo STITCH_FIDELITY.md, deviation phải ghi ledger.
- CSS/JS extend file có sẵn đúng template (index/main/blog/...) — không tạo file mới; không min()/max() trong .scss.*.
- Tên file/ảnh/class theo brand theme — 0 chữ "stitch" trong code ship. Asset jpg/png, cấm webp. Đơn vị REM-first.
- Việt hóa toàn bộ copy storefront.
- Container dùng page-width, không hardcode 1280px.
- Ghi <theme>/deliverables/SKILL_IMPROVEMENT_LOG.md ngay khi có kit bug / yêu cầu đổi từ tôi.

Bắt đầu A.1 intake. Hỏi tôi 1-3 câu nếu còn thiếu.
```

---

## 2. Resume project đang giữa chừng

```
Resume project Haravan theme đang làm dở.

Đọc:
- RESTYLE_MASTER_KIT/FLOW_A.md
- <theme>/deliverables/RESTYLE_PROGRESS_LEDGER.md (xác định bước cuối Status: pending)
- <theme>/deliverables/THEME_FINGERPRINT.md (ngữ cảnh theme)

Theme: <path>
Preview URL: <url>

Tìm bước A.<X> đầu tiên chưa pass trong ledger và resume từ đó. Đừng chạy lại generate (stitch consume, asset, scaffold) nếu output đã có trong scratch/.
```

---

## 3. Audit-led không có Stitch (luồng C)

```
Audit + fix theme cũ, không có Stitch design.

Đọc RESTYLE_MASTER_KIT/RUN_GUIDE.md mục "Luồng C" và chạy 10 bước.

Theme: <path>
Preview URL hiện tại: <url>

Scope ưu tiên: <bug | perf | a11y | UX | visual | full audit>
Permissions: settings_data <yes/no>, xóa code cũ <yes/no/report-only>, push <yes/no>.

Bắt đầu C.1 intake. Lưu baseline screenshot + perf trước khi đụng.
```

---

## 4. Chỉ làm 1 page (luồng B)

```
Restyle 1 page Haravan theo Stitch design.

Đọc RESTYLE_MASTER_KIT/RUN_GUIDE.md mục "Luồng B" và chạy 10 bước.

Theme: <path>
Stitch export screen: <C:/path/to/stitch-export/<screen>>
Page Liquid sẽ sửa: <templates/index.liquid | collection.liquid | product.liquid>
Preview URL: <url>

Permissions: settings_data <yes/no>, push <yes/no>.

Constraint: bưng nguyên Stitch theo STITCH_FIDELITY.md. Không động vào page khác.

Bắt đầu B.1.
```

---

## 5. Fix 1 bug cụ thể, không restyle

```
Fix 1 bug Haravan theme, không restyle, không refactor rộng.

Theme: <path>
Bug: <mô tả 2-3 dòng cụ thể: page nào, viewport nào, triệu chứng nào>
Preview URL: <url>

Đọc <theme>/deliverables/THEME_FINGERPRINT.md (nếu có) để biết pattern.

Quy tắc:
- Tìm root cause trước, không vá bừa bằng !important.
- Chỉ sửa file liên quan trực tiếp bug.
- Không refactor sang phần khác.
- Sau khi sửa: `npm run audit:content -- --root <theme>` + visual check page đó.

Báo lại file đã đổi + 1 dòng giải thích root cause.
```

---

## 6. Final handoff (đã làm xong, kiểm gate cuối)

```
Project Haravan theme đã implement xong. Chạy gate cuối + final artifacts.

Theme: <path>
Preview URL: <url>

Chạy theo thứ tự:
1. npm run audit:restyle -- --root <theme>           (0 blocker)
2. npm run a11y:deep -- --base <url> --paths /,/products/sample --fail-on serious
3. npm run perf:check -- --root <theme> --baseline scratch/perf/perf-baseline.json --lighthouse --base <url> --paths /
4. npm run final:capture -- --base <url> --all-templates --paths-file final-showcase/CAPTURE_PATHS.json
5. Eyeball home 4 PNG + pages/* (collection/product/blog/article/page-default/page-custom/login/register); chụp lại nếu xấu
6. Điền final-showcase/THEME_DESCRIPTION.html từ template (sales-focused fragment)
7. Điền final-showcase/FEATURES.json (từ FEATURES.template.json) — TẤT CẢ tính năng nổi bật + image path
8. npm run final:pptx -- --out final-showcase --brand "<Brand>"
9. npm run final:export -- --root <theme> --file <project>-final-theme.zip
10. npm run guard:final -- --root <theme> --require-pptx   (PASS bắt buộc)

Báo theo template Final trong FLOW_A.md mục "Output báo user sau mỗi phase".
```

---

## 7. Kit health check (trước khi mở project mới)

```
Verify RESTYLE_MASTER_KIT đang OK trước khi dùng cho project mới.

Chạy:
1. cd RESTYLE_MASTER_KIT
2. npm install (nếu chưa)
3. npm test                     (phải 112+/0 pass)
4. node run_preflight.js -h     (Python interpreter OK)
5. haravan --version            (Haravan CLI OK)

Báo: pass/fail từng item. Nếu fail, hỏi tôi trước khi tự fix kit.
```

---

## Anti-prompt (ĐỪNG dùng)

| Prompt sai | Tại sao fail |
|---|---|
| "Đọc FLOW_A.md" | Thiếu theme path, agent không biết làm với cái gì |
| "Restyle theme này theo Stitch" | Không trỏ kit, agent có thể bỏ qua FLOW_A và tự chế |
| "Làm cho đẹp hơn" | Không có Stitch reference, agent sẽ tự sáng tạo, vi phạm Stitch Fidelity |
| "Sửa hết các bug" | Scope mơ hồ, agent có thể refactor lan rộng không kiểm soát |
| "Chạy hết script trong kit" | Có script cần permission (push live), không dùng đại trà được |

---

## Kết hợp với context override

Nếu agent có hệ thống context inject (Cursor `.cursorrules`, Claude project settings, Kiro steering files), thêm vào đó:

```
Khi user nhắc "restyle Haravan", "Stitch full theme", "luồng A", hoặc trỏ vào RESTYLE_MASTER_KIT:
- Đọc RESTYLE_MASTER_KIT/FLOW_A.md trước.
- Đọc RESTYLE_MASTER_KIT/STITCH_FIDELITY.md trước khi viết Liquid.
- Theo thứ tự rule: user request > STITCH_FIDELITY > FLOW_A > RUN_GUIDE > workflow doc.
- Output theo template "Output báo user sau mỗi phase" trong FLOW_A.
- Không tự chế section/copy/màu khác Stitch. Deviation phải có 1 trong 5 lý do trong STITCH_FIDELITY.
- Trước final phải pass: audit:restyle 0 blocker, a11y:deep 0 serious, guard:final PASS.
```
