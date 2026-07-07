#!/bin/bash
# Optimize portfolio JPGs into web-ready WebP (thumbs + full) and build a JSON manifest.
# Usage: scripts/optimize.sh "portfolio/Sarah Birthday" sarah-birthday
set -euo pipefail

SRC_DIR="$1"
SLUG="$2"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
THUMB_DIR="$ROOT/assets/img/$SLUG/thumbs"
FULL_DIR="$ROOT/assets/img/$SLUG/full"
DATA_DIR="$ROOT/assets/data"
mkdir -p "$THUMB_DIR" "$FULL_DIR" "$DATA_DIR"

manifest="$DATA_DIR/$SLUG.json"
echo -n '[' > "$manifest"
first=1

for f in "$SRC_DIR"/*.jpg "$SRC_DIR"/*.JPG; do
  [ -e "$f" ] || continue
  base="$(basename "$f")"
  name="${base%.*}"
  [ -f "$THUMB_DIR/$name.webp" ] || cwebp -quiet -q 75 -resize 640 0 "$f" -o "$THUMB_DIR/$name.webp"
  [ -f "$FULL_DIR/$name.webp" ]  || cwebp -quiet -q 80 -resize 1600 0 "$f" -o "$FULL_DIR/$name.webp"
  # thumb dimensions for masonry aspect ratios
  w=$(sips -g pixelWidth  "$THUMB_DIR/$name.webp" | awk '/pixelWidth/{print $2}')
  h=$(sips -g pixelHeight "$THUMB_DIR/$name.webp" | awk '/pixelHeight/{print $2}')
  [ $first -eq 1 ] && first=0 || echo -n ',' >> "$manifest"
  echo -n "{\"n\":\"$name\",\"w\":$w,\"h\":$h}" >> "$manifest"
done
echo ']' >> "$manifest"
echo "Done: $(ls "$THUMB_DIR" | wc -l | tr -d ' ') images -> $manifest"
