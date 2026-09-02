#!/usr/bin/env bash
# 下载 Oracle's Elixir 的逐场比赛数据（2022–2026，每年 30–40 MB）。
# 在任何机器上都能跑：相对仓库路径、自动建目录、不依赖 GNU stat 与 bash 4。
#   bash data/fetch_oe.sh
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p data/oracleselixir

UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
id_of() {
  case "$1" in
    2022) echo 1EHmptHyzY8owv0BAcNKtkQpMwfkURwRy ;;
    2023) echo 1XXk2LO0CsNADBB1LRGOV5rUpyZdEZ8s2 ;;
    2024) echo 1IjIEhLc9n8eLKeY-yh_YigKVWbhgGBsN ;;
    2025) echo 1v6LRphp2kYciU4SXp0PCjEMuev1bDejc ;;
    2026) echo 1hnpbrUpBMS1TZI7IovfpKeZfWJH1Aptm ;;
    *) echo ""; ;;
  esac
}
size_of() { if [ -f "$1" ]; then wc -c < "$1" | tr -d ' '; else echo 0; fi; }

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  allok=1
  for y in 2022 2023 2024 2025 2026; do
    f="data/oracleselixir/${y}_OE.csv"
    if [ "$(size_of "$f")" -gt 1000000 ]; then continue; fi
    allok=0
    id="$(id_of "$y")"
    curl -sL --max-time 600 -A "$UA" \
      "https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t" -o "$f" || true
    sz="$(size_of "$f")"
    echo "[try $attempt] $y -> $sz bytes"
    if [ "$sz" -lt 1000000 ]; then rm -f "$f"; fi
  done
  if [ "$allok" = "1" ]; then echo "ALL DONE"; break; fi
  sleep 120
done
ls -la data/oracleselixir/
