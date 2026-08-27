#!/bin/bash
cd "/c/Users/15967/OneDrive/桌面/lol选手"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
declare -A IDS=( [2022]=1EHmptHyzY8owv0BAcNKtkQpMwfkURwRy [2023]=1XXk2LO0CsNADBB1LRGOV5rUpyZdEZ8s2 [2024]=1IjIEhLc9n8eLKeY-yh_YigKVWbhgGBsN [2025]=1v6LRphp2kYciU4SXp0PCjEMuev1bDejc [2026]=1hnpbrUpBMS1TZI7IovfpKeZfWJH1Aptm )
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  allok=1
  for y in 2022 2023 2024 2025 2026; do
    f="data/oracleselixir/${y}_OE.csv"
    if [ -f "$f" ] && [ $(stat -c%s "$f") -gt 1000000 ]; then continue; fi
    allok=0
    curl -sL --max-time 600 -A "$UA" "https://drive.usercontent.google.com/download?id=${IDS[$y]}&export=download&confirm=t" -o "$f"
    sz=$(stat -c%s "$f" 2>/dev/null || echo 0)
    echo "[try $attempt] $y -> $sz bytes"
    if [ "$sz" -lt 1000000 ]; then rm -f "$f"; fi
  done
  if [ "$allok" = "1" ]; then echo "ALL DONE"; break; fi
  sleep 120
done
ls -la data/oracleselixir/
