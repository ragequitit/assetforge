#!/usr/bin/env python3
"""
process_image.py — Pet Planet asset post-processing.

Pipeline:
  1. Remove background if the image is not already transparent
  2. Crop away empty (fully transparent) edges
  3. Center the subject
  4. Scale the subject to fit with padding
  5. Export an exact NxN PNG with a transparent background (default 512x512)

Usage:
  python3 process_image.py <input> <output> [--size 512] [--padding 0.08] [--tolerance 30]

Background removal:
  - If `rembg` is installed it is used (best quality). Install with:
        pip install rembg onnxruntime
  - Otherwise a numpy flood-fill fallback removes a near-uniform background
    that is connected to the image edges. Good for solid/flat backgrounds.
"""

import argparse
import os
import sys
from collections import deque

from PIL import Image

try:
    import numpy as np
    HAS_NUMPY = True
except Exception:
    HAS_NUMPY = False


def log(msg: str) -> None:
    print(f"[process_image] {msg}", file=sys.stderr)


def has_transparency(img: Image.Image) -> bool:
    """True if the image already has at least one non-opaque pixel."""
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        alpha = img.convert("RGBA").getchannel("A")
        lo, _hi = alpha.getextrema()
        return lo < 255
    return False


def remove_background(img: Image.Image) -> Image.Image:
    """Remove the background, preferring rembg, falling back to flood-fill."""
    try:
        from rembg import remove  # type: ignore
        log("removing background with rembg")
        return remove(img.convert("RGBA"))
    except Exception as exc:  # rembg missing or failed
        log(f"rembg unavailable ({exc.__class__.__name__}); using flood-fill fallback")
        return remove_background_floodfill(img)


def remove_background_floodfill(img: Image.Image, tolerance: int = 30) -> Image.Image:
    """
    Make edge-connected, near-uniform background pixels transparent.
    Requires numpy. If numpy is missing, returns the image unchanged.
    """
    if not HAS_NUMPY:
        log("numpy not installed; skipping background removal")
        return img.convert("RGBA")

    img = img.convert("RGBA")
    arr = np.array(img)
    h, w = arr.shape[:2]
    rgb = arr[:, :, :3].astype(np.int32)

    corners = [rgb[0, 0], rgb[0, w - 1], rgb[h - 1, 0], rgb[h - 1, w - 1]]
    bg = np.mean(corners, axis=0)
    tol_sq = float(tolerance) ** 2

    def is_bg(y: int, x: int) -> bool:
        d = rgb[y, x] - bg
        return float(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) <= tol_sq

    visited = np.zeros((h, w), dtype=bool)
    mask_bg = np.zeros((h, w), dtype=bool)
    dq: deque = deque()

    def seed(y: int, x: int) -> None:
        if not visited[y, x] and is_bg(y, x):
            visited[y, x] = True
            mask_bg[y, x] = True
            dq.append((y, x))

    for x in range(w):
        seed(0, x)
        seed(h - 1, x)
    for y in range(h):
        seed(y, 0)
        seed(y, w - 1)

    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
                visited[ny, nx] = True
                if is_bg(ny, nx):
                    mask_bg[ny, nx] = True
                    dq.append((ny, nx))

    arr[mask_bg, 3] = 0
    return Image.fromarray(arr, "RGBA")


def subject_bbox(img: Image.Image, alpha_threshold: int):
    """
    Bounding box of the *solid* subject.

    Using getbbox() directly counts every pixel whose alpha is > 0, so a faint,
    near-invisible halo, glow spill or compression noise off to one side (common
    in the "transparent" PNGs the image API returns) stretches the box and pushes
    the visible subject off-centre. We instead threshold the alpha first, so only
    pixels that are actually visible define the box. Falls back to the raw box if
    thresholding would leave nothing.
    """
    alpha = img.getchannel("A")
    if alpha_threshold > 0:
        mask = alpha.point(lambda a: 255 if a >= alpha_threshold else 0)
        bbox = mask.getbbox()
        if bbox is not None:
            return bbox
    return alpha.getbbox()


def trim_center_pad(
    img: Image.Image, size: int, padding_ratio: float, alpha_threshold: int = 16
) -> Image.Image:
    """Crop to the subject, then center+scale it onto a size x size transparent canvas."""
    img = img.convert("RGBA")
    bbox = subject_bbox(img, alpha_threshold)  # box of the visible subject only

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    if bbox is None:
        log("warning: image is fully transparent, exporting empty canvas")
        return canvas

    cropped = img.crop(bbox)
    pad = int(round(size * padding_ratio))
    max_content = max(1, size - 2 * pad)

    cw, ch = cropped.size
    scale = min(max_content / cw, max_content / ch)
    new_w = max(1, int(round(cw * scale)))
    new_h = max(1, int(round(ch * scale)))
    resized = cropped.resize((new_w, new_h), Image.LANCZOS)

    ox = (size - new_w) // 2
    oy = (size - new_h) // 2
    canvas.paste(resized, (ox, oy), resized)
    return canvas


def main() -> int:
    parser = argparse.ArgumentParser(description="Pet Planet asset post-processor")
    parser.add_argument("input", help="path to the raw generated image")
    parser.add_argument("output", help="path to write the processed PNG")
    parser.add_argument("--size", type=int, default=512, help="output edge length (default 512)")
    parser.add_argument("--padding", type=float, default=0.08, help="padding as ratio of size")
    parser.add_argument("--tolerance", type=int, default=30, help="flood-fill color tolerance")
    parser.add_argument(
        "--alpha-threshold",
        type=int,
        default=16,
        help="ignore pixels fainter than this (0-255) when finding the subject, so faint "
        "halos don't push centering off (default 16)",
    )
    args = parser.parse_args()

    if not os.path.isfile(args.input):
        log(f"input not found: {args.input}")
        return 2

    img = Image.open(args.input)

    if has_transparency(img):
        log("image already transparent; skipping background removal")
        img = img.convert("RGBA")
    else:
        img = remove_background(img)

    result = trim_center_pad(
        img, size=args.size, padding_ratio=args.padding, alpha_threshold=args.alpha_threshold
    )

    out_dir = os.path.dirname(os.path.abspath(args.output))
    os.makedirs(out_dir, exist_ok=True)
    result.save(args.output, "PNG")
    log(f"wrote {args.output} ({args.size}x{args.size})")
    print(args.output)  # stdout: final path, for the Node caller
    return 0


if __name__ == "__main__":
    sys.exit(main())
