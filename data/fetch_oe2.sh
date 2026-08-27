#!/bin/bash
cd "/c/Users/15967/OneDrive/桌面/lol选手"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
declare -A IDS=( [2023]=1XXk2LO0CsNADBB1LRGOV5rUpyZdEZ8s2 [2024]=1IjIEhLc9n8eLKeY-yh_YigKVWbhgGBsN [2025]=1v6LRphp2kYciU4SXp0PCjEMuev1bDejc [2026]=1hnpbrUpBMS1TZI7IovfpKeZfWJH1Aptm )
for a in $(seq 1 40); do
  left=0
  for y in 2023 2024 2025 2026; do
    f="data/oracleselixir/${y}_OE.csv"
    [ -f "$f" ] && [ $(stat -c%s "$f") -gt 5000000 ] && continue
    left=1
    curl -sL --max-time 900 -A "$UA" "https://drive.usercontent.google.com/download?id=${IDS[$y]}&export=download&confirm=t" -o "$f.tmp"
    sz=$(stat -c%s "$f.tmp" 2>/dev/null || echo 0)
    if [ "$sz" -gt 5000000 ]; then mv "$f.tmp" "$f"; echo "[a$a] $y OK $sz"; else rm -f "$f.tmp"; echo "[a$a] $y quota ($sz)"; fi
    sleep $((RANDOM % 20 + 10))
  done
  [ "$left" = "0" ] && { echo "ALL DONE"; break; }
  sleep 180
done
ls -la data/oracleselixir/
