# Upgrade Guide

Hướng dẫn nâng phiên bản RESTYLE_MASTER_KIT cho project đang chạy.

## Kiểm tra phiên bản hiện tại

```powershell
Select-String -Path "START_HERE.md" -Pattern "KIT_VERSION"
```

## Nguyên tắc khi nâng kit

- Không overwrite file ledger, fingerprint, hay artifact đang dùng của project hiện tại.
- Chỉ merge các file canonical (workflow, scripts, templates) — không merge `scratch/`, `final-showcase/`, hay file đã fill dữ liệu project.
- Nếu project có bản tùy chỉnh của một template, so sánh diff trước khi merge.
- Sau khi merge scripts, chạy lại `npm install` nếu `package.json` thay đổi.

## Quy trình nâng từ bản cũ lên bản mới

### 1. Backup project hiện tại

```powershell
Copy-Item -Path "RESTYLE_MASTER_KIT" -Destination "RESTYLE_MASTER_KIT.bak" -Recurse
```

### 2. Xác định file nào cần merge

| File | Hành động |
|---|---|
| `lib/theme-walk.js` | Copy thẳng nếu chưa có |
| `qa_restyle_check.js` | Merge — kiểm tra custom flow logic trước |
| `liquid_content_audit.js` | Merge — giữ pattern tùy chỉnh nếu có |
| `settings_boundary_audit.js` | Merge |
| `workflow_final_guard.js` | Merge |
| `final_showcase_capture.js` | Merge |
| `final_theme_export.js` | Merge |
| `run_preflight.js` | Copy thẳng |
| `haravan_preflight_fallback.py` | Merge |
| `HARAVAN_THEME_RESTYLE_WORKFLOW.md` | Merge — đọc CHANGELOG trước để biết rule nào đổi |
| `START_HERE.md` | Merge |
| `STITCH_PROMPT.template.md` | Merge — giữ brief tùy chỉnh nếu có |
| `ISSUE_INTAKE.template.md` | Merge |
| `THEME_FINGERPRINT.template.md` | Merge |
| `RESTYLE_PROGRESS_LEDGER.template.md` | **Không overwrite** nếu đang dùng cho project |
| `RESTYLE_RETROSPECTIVE.template.md` | Merge template gốc, không đụng bản đã fill |
| `INTERACTION_FLOW.*.template.json` | Merge template gốc, không đụng bản project-specific |
| `CHANGELOG.md` | Append entry mới vào đầu |
| `package.json` | Merge scripts + dependencies, giữ `name`/`version` nếu đã đổi |

### 3. Cập nhật dependencies

```powershell
cd RESTYLE_MASTER_KIT
npm install
```

### 4. Chạy smoke test sau merge

```powershell
node run_preflight.js --root ..
node liquid_content_audit.js
node settings_boundary_audit.js
```

### 5. Cập nhật KIT_VERSION trong START_HERE.md

```powershell
(Get-Content START_HERE.md) -replace 'KIT_VERSION: \S+', 'KIT_VERSION: 2.4.2' | Set-Content START_HERE.md -Encoding UTF8
```

## Nâng từng phiên bản cụ thể

### 2.1.2 → 2.1.3

- Tạo mới `lib/theme-walk.js` (shared walk utility).
- Replace `liquid_content_audit.js` và `settings_boundary_audit.js` với bản mới (dùng shared lib, thêm section schema parse, fix false positive `section.settings`).
- Patch `qa_restyle_check.js`: thêm overflow detection, alt check, tap target check.
- Patch `workflow_final_guard.js`: thêm PNG dimension validation.
- Patch `final_showcase_capture.js`: fix `resizeCrop` dùng `file://`.
- Patch `haravan_preflight_fallback.py`: thêm mojibake scan, settings_data check.
- Merge `STITCH_PROMPT.template.md`: thêm Cart brief.
- Merge `RESTYLE_PROGRESS_LEDGER.template.md`: thêm field Rollback reference.
- Update `INTERACTION_FLOW.*.template.json` sang format `{"flows":[...]}`.

### 2.1.1 → 2.1.2

- Thêm rule CSS cascade/source order/specificity vào workflow và intake.
- Không có script change.

### 2.1.0 → 2.1.1

- Siết gate rebuild theo approved design.
- Patch `workflow_final_guard.js` để check final-showcase screenshot và description fragment.
- Scope audit scripts chỉ vào thư mục source theme.

## Tạo project mới từ kit

```powershell
Copy-Item -Path "RESTYLE_MASTER_KIT" -Destination "..\my-new-project\RESTYLE_MASTER_KIT" -Recurse -Exclude "node_modules","*.bak"
cd "..\my-new-project\RESTYLE_MASTER_KIT"
npm install
```

Không mang theo `scratch/`, `output/`, `final-showcase/`, hay file ledger đã fill của project cũ.
