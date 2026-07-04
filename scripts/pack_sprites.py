#!/usr/bin/env python3
"""
pack_sprites.py — pack asset PNGs into a single sprite-sheet atlas + JSON map.

Usage:
  python3 pack_sprites.py --manifest tiles.json --out atlas.png --json atlas.json [--cols N] [--padding 0]

manifest.json is a list of {"name": "...", "path": "..."} objects.
Each tile is centered inside a uniform cell (cell = largest tile). The JSON map
gives per-frame x/y/w/h so a game engine can slice the atlas.
"""

import argparse
import json
import math
from PIL import Image


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--json", required=True)
    ap.add_argument("--cols", type=int, default=0)
    ap.add_argument("--padding", type=int, default=0)
    args = ap.parse_args()

    tiles = json.load(open(args.manifest))
    imgs = [(t["name"], Image.open(t["path"]).convert("RGBA")) for t in tiles]
    if not imgs:
        raise SystemExit("no tiles")

    n = len(imgs)
    cols = args.cols if args.cols > 0 else max(1, math.ceil(math.sqrt(n)))
    rows = math.ceil(n / cols)
    cell_w = max(im.width for _, im in imgs)
    cell_h = max(im.height for _, im in imgs)
    pad = max(0, args.padding)

    atlas_w = cols * cell_w + (cols + 1) * pad
    atlas_h = rows * cell_h + (rows + 1) * pad
    atlas = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))

    frames = {}
    for i, (name, im) in enumerate(imgs):
        c, r = i % cols, i // cols
        x = pad + c * (cell_w + pad) + (cell_w - im.width) // 2
        y = pad + r * (cell_h + pad) + (cell_h - im.height) // 2
        atlas.paste(im, (x, y), im)
        key = name
        k = 2
        while key in frames:  # avoid clobbering duplicate names
            key = f"{name}#{k}"
            k += 1
        frames[key] = {"x": x, "y": y, "w": im.width, "h": im.height}

    atlas.save(args.out, "PNG")
    json.dump(
        {
            "meta": {
                "size": {"w": atlas_w, "h": atlas_h},
                "cols": cols,
                "rows": rows,
                "cell": {"w": cell_w, "h": cell_h},
                "count": n,
            },
            "frames": frames,
        },
        open(args.json, "w"),
        indent=2,
    )
    print(args.out)


if __name__ == "__main__":
    main()
