#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path
import sys

# Chi bat chu ky mojibake that (UTF-8 doc nham latin-1):
# - 'Th\u00c6'  = "Th\u01b0" vo (\u00c6 khong dung sau Th trong tieng Viet chuan)
# - '\u00c3'+chu cai = chuoi UTF-8 vo dien hinh (vd "\u00c3\u00a1" thay vi "\u00e1")
# - '\u00c2'+ky tu la = "\u00c2\u00ab", "\u00c2\u00b0", "\u00c2"+nbsp... ; van tha "\u00c2m", "\u00c2u" (chu Viet hop le)
# Khong dung literal tieng Viet thuong (Khu/D\u1ecd) lam chu ky \u2014 gay false positive.
MOJIBAKE_PATTERN = re.compile(
    r'Th\xc6|\xc3[A-Za-z]|\xc2[^\sA-Za-z]'
)

LIQUID_EXTS = {'.liquid', '.html', '.js', '.css'}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Haravan preflight fallback.')
    parser.add_argument('--root', default='.', help='Theme root to inspect.')
    return parser.parse_args()


def scan_mojibake(root: Path) -> list[str]:
    issues: list[str] = []
    scan_dirs = ['assets', 'config', 'layout', 'snippets', 'templates']
    for dir_name in scan_dirs:
        d = root / dir_name
        if not d.exists():
            continue
        for f in d.rglob('*'):
            if f.suffix.lower() not in LIQUID_EXTS:
                continue
            try:
                text = f.read_text(encoding='utf-8', errors='replace')
                if MOJIBAKE_PATTERN.search(text):
                    issues.append(f'Possible mojibake: {f.relative_to(root)}')
            except Exception:
                pass
    return issues


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()
    issues: list[str] = []

    # 1. Required directories
    required_dirs = ['assets', 'config', 'layout', 'snippets', 'templates']
    for name in required_dirs:
        if not (root / name).exists():
            issues.append(f'[blocker] Missing directory: {name}')

    # 2. Required files
    required_files = [
        root / 'layout' / 'theme.liquid',
        root / 'config' / 'settings.html',
    ]
    for file_path in required_files:
        if not file_path.exists():
            issues.append(f'[blocker] Missing file: {file_path.relative_to(root)}')

    # 3. settings_data.json presence (warn only — can be empty on fresh theme)
    settings_data = root / 'config' / 'settings_data.json'
    if not settings_data.exists():
        issues.append('[warn] Missing config/settings_data.json — defaults will be empty on deploy')

    # 4. Mojibake scan
    mojibake = scan_mojibake(root)
    issues.extend(f'[blocker] {m}' for m in mojibake)

    # 5. File count summary
    file_count = sum(
        len(list((root / d).rglob('*')))
        for d in required_dirs if (root / d).exists()
    )

    print('# Haravan Preflight')
    print(f'Root: {root}')
    print(f'Theme files found: {file_count}')

    blockers = [i for i in issues if i.startswith('[blocker]')]
    warns    = [i for i in issues if i.startswith('[warn]')]

    if issues:
        print(f'Findings: {len(issues)} ({len(blockers)} blocker, {len(warns)} warn)')
        for issue in issues:
            print(f'- {issue}')
    else:
        print('Findings: 0')

    if blockers:
        print('\nFAIL: blockers must be resolved before proceeding.')
        return 1

    print('\nPASS: theme structure looks sane.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
