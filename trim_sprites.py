"""
Trim transparent padding from all generated sprites so they can be drawn
at sensible sizes in the game canvas. Writes trimmed versions to
`assets/sprites/` (game uses this path), leaving `assets/generated/` as
the untouched originals.
"""

from PIL import Image
import os

SRC_DIR = "assets/generated"
OUT_DIR = "assets/sprites"
PADDING = 8  # small transparent border so edges don't touch the bbox

os.makedirs(OUT_DIR, exist_ok=True)

for fname in sorted(os.listdir(SRC_DIR)):
    if not fname.endswith(".png"):
        continue
    src = os.path.join(SRC_DIR, fname)
    if not os.path.isfile(src):
        continue

    img = Image.open(src).convert("RGBA")
    # Get bbox of non-zero alpha pixels
    alpha = img.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        print(f"[skip] {fname} is fully transparent")
        continue

    l, t, r, b = bbox
    # Add small padding, clamped to image bounds
    l = max(0, l - PADDING)
    t = max(0, t - PADDING)
    r = min(img.width, r + PADDING)
    b = min(img.height, b + PADDING)

    cropped = img.crop((l, t, r, b))
    out_path = os.path.join(OUT_DIR, fname)
    cropped.save(out_path, "PNG")
    ow, oh = img.size
    cw, ch = cropped.size
    savings = 100 * (1 - (cw * ch) / (ow * oh))
    print(f"[trim] {fname}: {ow}x{oh} -> {cw}x{ch} ({savings:.0f}% smaller)")
