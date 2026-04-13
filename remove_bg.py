"""
Remove magenta background from Gemini sprites using flood-fill from edges.
This avoids eating red/purple sprite content (trash, feedback) by only removing
the connected magenta background region, not interior pixels of similar hue.
Also removes the sparkle watermark Gemini adds in the bottom-right corner.
"""
from PIL import Image
from collections import deque
import os, colorsys, sys

ASSETS = os.path.join(os.path.dirname(__file__), 'assets')

NAMES = {
    1:  'templates_station_sprite.png',
    2:  'intake_station_sprite.png',
    3:  'data_collection_station_sprite.png',
    4:  'counter_station_sprite.png',
    5:  'shareout_station_sprite.png',
    6:  'trash_station_sprite.png',
    7:  'carry_template.png',
    8:  'carry_intake.png',
    9:  'carry_data.png',
    10: 'carry_lit.png',
    11: 'carry_deck.png',
    12: 'analysis_station_sprite.png',
    13: 'synthesis_station_sprite.png',
    14: 'feedback_station_sprite.png',
    15: 'copilot_station_sprite.png',
}

# Increase recursion limit isn't needed since we use BFS, but bump stack for safety
sys.setrecursionlimit(100)

def color_dist(r1, g1, b1, r2, g2, b2):
    """Euclidean distance in RGB space."""
    return ((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) ** 0.5

def is_bg_pixel(r, g, b, tol=80):
    """Is this pixel close enough to magenta (#FF00FF) to be background?
    Uses a generous tolerance to catch the dark magenta shadow regions
    and anti-aliased edge pixels, but won't reach into true reds or purples
    because the flood fill constrains connectivity."""
    return color_dist(r, g, b, 255, 0, 255) < tol

def flood_fill_remove(img):
    """BFS flood fill from all edge pixels. Any edge pixel that looks magenta
    seeds the fill; the fill spreads to any 4-connected neighbor that also
    looks magenta. This only removes the connected background region."""
    pixels = img.load()
    w, h = img.size
    visited = set()
    queue = deque()

    # Seed from all 4 edges
    for x in range(w):
        for y in [0, h - 1]:
            r, g, b, a = pixels[x, y]
            if is_bg_pixel(r, g, b):
                queue.append((x, y))
                visited.add((x, y))
    for y in range(h):
        for x in [0, w - 1]:
            if (x, y) not in visited:
                r, g, b, a = pixels[x, y]
                if is_bg_pixel(r, g, b):
                    queue.append((x, y))
                    visited.add((x, y))

    # BFS flood fill
    while queue:
        cx, cy = queue.popleft()
        pixels[cx, cy] = (0, 0, 0, 0)
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in visited:
                r, g, b, a = pixels[nx, ny]
                if is_bg_pixel(r, g, b):
                    visited.add((nx, ny))
                    queue.append((nx, ny))

    return len(visited)

def clear_sparkle(img, margin=180):
    """Blank out the small sparkle watermark in the bottom-right corner."""
    pixels = img.load()
    w, h = img.size
    for y in range(h - margin, h):
        for x in range(w - margin, w):
            r, g, b, a = pixels[x, y]
            if a > 0:
                pixels[x, y] = (0, 0, 0, 0)

for num, name in NAMES.items():
    src = os.path.join(ASSETS, f'image{num}.png')
    dst = os.path.join(ASSETS, name)

    img = Image.open(src).convert('RGBA')
    changed = flood_fill_remove(img)
    clear_sparkle(img)
    img.save(dst)

    w, h = img.size
    pct = changed / (w * h) * 100
    print(f'  {name}: {w}x{h}, removed {changed:,} px ({pct:.1f}%)')

print('\nDone! Background flood-filled + sparkle removed.')
