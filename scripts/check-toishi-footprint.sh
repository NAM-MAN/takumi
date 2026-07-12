#!/usr/bin/env bash
#
# check-toishi-footprint.sh — takumi skill 内の toishi 言及行数を機械検証
#
# 目的: toishi 連携は opt-in (利用者数% 想定)。99% のユーザーへの footprint を
#       約束として固定し、将来「ちょっと脚注追記」で SKILL.md / 辞書 / 連携 doc が
#       じわじわ膨張するのを防ぐ。
#
# 上限 (AC-TOISHI-009 物理保証):
#   - SKILL.md          : ≤ 6 行 (脚注 3 + 進入路 1 + buffer 2)
#   - natural-language.md: == 0 行 (辞書には 1 語も入れない)
#   - integrations.md   : ≤ 15 行 (連携節 8-12 行 + 既存 mention buffer)
#
# 使用:
#   bash scripts/check-toishi-footprint.sh                # repo root から
#   bash scripts/check-toishi-footprint.sh --verbose      # 違反箇所を表示
#
# 推奨運用 (hook 基盤未整備の現状):
#   - PR レビュー時に手動 run
#   - skill の SKILL.md / natural-language.md / integrations.md を編集した PR では必須
#   - 将来 lefthook / pre-commit を入れたら hook 経由化を検討
#

set -euo pipefail

# repo root に移動 (script はどこから呼ばれても OK)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

VERBOSE=false
if [ "${1:-}" = "--verbose" ]; then VERBOSE=true; fi

# 検査対象ファイル (path, max_hits)
declare -a TARGETS=(
  "skills/takumi/SKILL.md:6"
  "skills/takumi/natural-language.md:0"
  "skills/takumi/integrations.md:15"
)

EXIT_CODE=0

for entry in "${TARGETS[@]}"; do
  file="${entry%:*}"
  max_hits="${entry##*:}"

  if [ ! -f "$file" ]; then
    echo "⚠ $file not found, skipping"
    continue
  fi

  # grep -c は行数を返す (1 行に複数 match があっても 1 カウント)
  # case-insensitive で toishi / Toishi / TOISHI / ToishiGate 全部を捕捉
  actual=$(grep -ic 'toishi' "$file" || true)

  if [ "$actual" -le "$max_hits" ]; then
    printf "✓ %-40s %2d/%d hits\n" "$file" "$actual" "$max_hits"
  else
    printf "✗ %-40s %2d/%d hits (上限超過)\n" "$file" "$actual" "$max_hits"
    EXIT_CODE=1
    if [ "$VERBOSE" = true ]; then
      echo "  違反箇所:"
      grep -in 'toishi' "$file" | sed 's/^/    /'
      echo
    fi
  fi
done

if [ "$EXIT_CODE" -ne 0 ]; then
  echo
  echo "✗ toishi footprint check FAILED"
  echo "  上限超過 = 99% ユーザーへの侵襲ゼロ約束 (AC-TOISHI-009) 違反"
  echo "  対処:"
  echo "    1. 追記内容を skills/takumi/toishi-integration.md に集約する"
  echo "    2. SKILL.md / natural-language.md / integrations.md からの言及を最小化"
  echo "    3. 詳細運用: skills/takumi/toishi-integration.md 参照"
  echo "  違反箇所を確認: bash scripts/check-toishi-footprint.sh --verbose"
fi

exit "$EXIT_CODE"
