"""
One-off: regenerate feedback_station_sprite with a tight, explicit prompt
that matches the chunky warm-lit style of the other station sprites.
Bypasses the full pipeline (no auditor/art-director) since we know exactly
what we want.
"""

import sys
import os
import time
import base64
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from polish_pipeline import (
    _load_dotenv,
    get_anthropic_client,
    get_gemini_client,
    chroma_key_to_alpha,
    save_image,
    Candidate,
)

_load_dotenv()

# Very tight, style-matched prompt. Explicitly anti-pastel, anti-sparkle.
PROMPT = """A single isometric 2.5D sprite of a manager's review desk for a
behavioral science office game. View from a 45-degree top-down angle.

The desk is warm wood (honey oak tone, matching other office desks in the
game). On the desk: a clipboard with a stack of papers (some with red marks),
a red ballpoint pen lying next to it, and a small coffee mug. Maybe a desk
lamp on the corner giving warm light.

Style: clean cartoonish art with bold black outlines, chunky proportions,
flat but shaded colors (think Overcooked aesthetic). Warm lighting, soft
contact shadows under the desk. Absolutely NO pastels. NO sparkles. NO floating
particles. NO ethereal glow effects. NO white/lavender tones. This is a
grounded, tactile office desk — not a fairy scene.

Background: solid pure magenta #FF00FF, completely flat and uniform, no
gradients, no checkerboard. The magenta will be chroma-keyed to alpha in
post-processing.

No text, no labels, no words, no numbers anywhere in the image.
Centered subject with empty magenta space around the edges.
"""

NUM_CANDIDATES = 3
OUT_PATH = "assets/generated/feedback_station_sprite.png"
TASK_DIR = "assets/generated/regen_feedback"

os.makedirs(TASK_DIR, exist_ok=True)

print("=" * 60)
print("  REGENERATING feedback_station_sprite")
print("=" * 60)

gemini_client = get_gemini_client()
anthropic_client = get_anthropic_client()

from google.genai import types

# -------- Generate candidates --------
candidates = []
for i in range(NUM_CANDIDATES):
    print(f"\n[gen] candidate {i+1}/{NUM_CANDIDATES}...")
    try:
        response = gemini_client.models.generate_content(
            model="gemini-3.1-flash-image-preview",
            contents=[PROMPT],
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"],
            ),
        )
        for part in response.candidates[0].content.parts:
            if part.inline_data is not None:
                img_bytes = part.inline_data.data
                if isinstance(img_bytes, str):
                    img_bytes = base64.b64decode(img_bytes)
                cpath = f"{TASK_DIR}/candidate_{i}.png"
                save_image(img_bytes, cpath)
                chroma_key_to_alpha(cpath)
                with open(cpath, "rb") as f:
                    img_bytes = f.read()
                candidates.append(Candidate(index=i, image_data=img_bytes, filename=f"candidate_{i}.png"))
                break
        else:
            print(f"  [warn] candidate {i+1} produced no image")
    except Exception as e:
        print(f"  [err] candidate {i+1}: {e}")
    if i < NUM_CANDIDATES - 1:
        time.sleep(2)

if not candidates:
    print("\n[err] no candidates generated, aborting")
    sys.exit(1)

# -------- Rank with Claude --------
print(f"\n[eval] ranking {len(candidates)} candidates...")
content_parts = [{
    "type": "text",
    "text": f"""Rank these {len(candidates)} candidate sprites for a feedback/review
station in a 2.5D isometric office game. The sprite should look like a
manager's desk for reviewing work — chunky cartoon style, warm wood, clipboard
with red pen, bold black outlines, Overcooked aesthetic. NO pastels,
NO sparkles, NO ethereal effects.

Rank best-to-worst. Return JSON array:
[{{"candidate_index": N, "rank": R, "reasoning": "..."}}, ...]
Return ONLY valid JSON."""
}]

from polish_pipeline import _sniff_media_type
for c in candidates:
    content_parts.append({
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": _sniff_media_type(c.image_data),
            "data": base64.b64encode(c.image_data).decode(),
        }
    })
    content_parts.append({"type": "text", "text": f"[Candidate {c.index}]"})

resp = anthropic_client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1500,
    messages=[{"role": "user", "content": content_parts}]
)

import json
raw = resp.content[0].text.strip()
if raw.startswith("```"):
    raw = raw.split("\n", 1)[1]
if raw.endswith("```"):
    raw = raw.rsplit("```", 1)[0]
rankings = json.loads(raw.strip())

print("\nRankings:")
for r in sorted(rankings, key=lambda x: x["rank"]):
    marker = " <- WINNER" if r["rank"] == 1 else ""
    print(f"  #{r['rank']}: Candidate {r['candidate_index']} - {r['reasoning']}{marker}")

winner_idx = next(r["candidate_index"] for r in rankings if r["rank"] == 1)
winner = next(c for c in candidates if c.index == winner_idx)

with open(OUT_PATH, "wb") as f:
    f.write(winner.image_data)
print(f"\n[save] winner written to {OUT_PATH}")
