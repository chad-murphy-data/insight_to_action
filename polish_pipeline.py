#!/usr/bin/env python3
"""
Insight Kitchen Visual Polish Pipeline
=======================================
Multi-agent orchestrator that audits, designs, generates, and implements
visual polish for the Insight Kitchen (BeSci Overcooked) game.

Agents:
  1. Auditor    — Reads codebase, ranks visual polish tasks
  2. Art Director — Writes creative briefs for each task
  3. Asset Generator — Calls Gemini Nano Banana 2 for sprite generation
  4. Implementer — Writes code changes to integrate new assets
  5. Evaluator  — Ranks multi-candidate outputs, gates quality

Usage:
  export ANTHROPIC_API_KEY=your_key
  export GEMINI_API_KEY=your_key
  python polish_pipeline.py --repo /path/to/insight-kitchen
"""

import os
import sys
import json
import base64
import argparse
import subprocess
import time
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, field
from typing import Optional

# Force UTF-8 on stdout/stderr so emoji and unicode from Claude's responses
# don't crash the print pipeline on Windows (default cp1252).
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# Load .env file if present (keys live there, gitignored)
def _load_dotenv():
    env_path = Path(__file__).parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and not os.environ.get(key):
            os.environ[key] = value

_load_dotenv()


def _sniff_media_type(data: bytes) -> str:
    """Detect image media type from magic bytes."""
    if data.startswith(b"\x89PNG"):
        return "image/png"
    if data.startswith(b"\xff\xd8"):
        return "image/jpeg"
    if data.startswith(b"GIF8"):
        return "image/gif"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    return "image/png"

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

CLAUDE_MODEL = "claude-sonnet-4-5"
GEMINI_MODEL = "gemini-3.1-flash-image-preview"
CANDIDATES_PER_TASK = 4  # Multi-candidate generation
MAX_REFINEMENT_ROUNDS = 2
CONSISTENCY_CHECK_EVERY = 3  # Run consistency checker every N tasks

# Art direction north star — injected into every agent prompt
ART_DIRECTION = """
STYLE GUIDE — Insight Kitchen (BeSci Overcooked)
- Isometric 2.5D perspective, ~45° top-down angle
- Clean, colorful, slightly cartoonish style (think Overcooked meets corporate office)
- Warm lighting, soft shadows
- Stations should sit on desks/tables where appropriate
- Items characters carry should be small, iconic, readable at 64x64
- Floor should look like realistic office flooring (carpet tiles or polished concrete)
- The game has two halves separated by a barrier: Owner side and Employee side
- Pass-through window connects the two sides
- Characters are office workers in a behavioral science kitchen
- Consistent outline weight and color palette across all assets

CRITICAL RULES FOR ALL SPRITE PROMPTS:
- NEVER include text, words, captions, labels, numbers, or written language
  inside the sprite itself. The filename will identify it.
- GENERATE ONE SUBJECT PER IMAGE. Never ask for grids, sheets, or
  multiple stations in a single image, EXCEPT for true character sprite
  sheets that need all 8 directions for animation — those are the sole exception.
- Center the single subject in the frame with empty background space around it.
- BACKGROUND RULE: Gemini does not reliably output true alpha transparency
  (it bakes a checkerboard pattern into RGB pixels). Instead, EVERY sprite
  prompt MUST request a "solid pure magenta background, exact color #FF00FF,
  completely flat and uniform, no gradients, no checkerboard, no transparency —
  the magenta will be chroma-keyed to alpha in post-processing". This makes
  clean background removal trivial.
"""

# Initial priority list from Chad
PRIORITY_LIST = """
PRIORITY AREAS (ordered by impact) — expand each into individual per-sprite tasks:
1. Individual station sprites — ONE task per station: Inbox, Analysis, Deck Builder,
   Delivery, Pass-Through Window, Shredder, Copilot, Feedback, Trash, Boss Desk
2. Carry icons — ONE task per item the character holds (deck, slide, report, etc.)
3. Floor texture — Realistic office flooring
4. Character sprite sheets — 8-direction sheet per character (owner, employee, boss, copilot).
   These ARE allowed to be grid sprite sheets since they need 8 directions.
5. Barrier/divider wall
6. Environmental props (desk chairs, plants, signage — one per task)

CRITICAL: Never bundle multiple stations/items into a single task.
Each sprite gets its own task, its own prompt, its own file.
"""


# ---------------------------------------------------------------------------
# API Clients
# ---------------------------------------------------------------------------

def get_anthropic_client():
    """Lazy import + init for Anthropic."""
    try:
        import anthropic
    except ImportError:
        print("Installing anthropic SDK...")
        subprocess.check_call([sys.executable, "-m", "pip", "install",
                               "anthropic", "--break-system-packages", "-q"])
        import anthropic
    return anthropic.Anthropic()


def get_gemini_client():
    """Lazy import + init for Google GenAI."""
    try:
        from google import genai
    except ImportError:
        print("Installing google-genai SDK...")
        subprocess.check_call([sys.executable, "-m", "pip", "install",
                               "google-genai", "--break-system-packages", "-q"])
        from google import genai
    return genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))


# ---------------------------------------------------------------------------
# Data Types
# ---------------------------------------------------------------------------

@dataclass
class PolishTask:
    id: int
    name: str
    category: str  # sprite | palette | ui_layout | animation | texture
    description: str
    priority: int
    needs_asset_gen: bool = True
    status: str = "pending"


@dataclass
class CreativeBrief:
    task: PolishTask
    gemini_prompt: str
    implementation_notes: str
    aspect_ratio: str = "1:1"
    table_or_desk: bool = True


@dataclass
class Candidate:
    index: int
    image_data: bytes  # PNG bytes
    filename: str


@dataclass
class RankedCandidate:
    candidate: Candidate
    rank: int
    reasoning: str


@dataclass
class PipelineState:
    repo_path: str
    completed_tasks: list = field(default_factory=list)
    preference_history: list = field(default_factory=list)
    generated_assets: list = field(default_factory=list)
    current_task_index: int = 0


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def read_codebase(repo_path: str) -> str:
    """Read key source files from the repo for context."""
    repo = Path(repo_path)
    contents = []

    # Grab relevant source files (adjust extensions/paths as needed)
    extensions = {".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".json"}
    skip_dirs = {"node_modules", ".git", "dist", "build", ".next"}

    for f in sorted(repo.rglob("*")):
        if f.is_file() and f.suffix in extensions:
            if any(skip in f.parts for skip in skip_dirs):
                continue
            try:
                text = f.read_text(errors="replace")
                # Truncate very long files
                if len(text) > 5000:
                    text = text[:5000] + "\n... [truncated]"
                contents.append(f"--- {f.relative_to(repo)} ---\n{text}")
            except Exception:
                pass

    return "\n\n".join(contents)


def save_image(image_data: bytes, path: str):
    """Save raw PNG bytes to disk."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        f.write(image_data)
    print(f"  [save] {path}")


def chroma_key_to_alpha(path: str):
    """
    Remove magenta/pink background from the image at `path` using HSV thresholds,
    overwriting the file as RGBA PNG. HSV is robust to lighting/shadow variation
    that breaks naive RGB distance keying. Targets hues in the magenta range
    (around 300 deg, i.e. ~0.75-0.95 in PIL's 0..1 hue space) with high saturation.
    """
    try:
        from PIL import Image
    except ImportError:
        print("  [install] Pillow...")
        subprocess.check_call([sys.executable, "-m", "pip", "install",
                               "Pillow", "--break-system-packages", "-q"])
        from PIL import Image

    img = Image.open(path).convert("RGBA")
    hsv = img.convert("RGB").convert("HSV")
    rgba_pixels = list(img.getdata())
    hsv_pixels = list(hsv.getdata())
    new_data = []
    removed = 0
    # Magenta/pink hue band (PIL HSV uses 0-255 for each channel).
    # Magenta is ~213 (300 deg), pink/fuchsia spans ~200..240.
    # Accept a wide band so shadows and off-tint magentas get caught.
    HUE_LO, HUE_HI = 195, 245
    SAT_MIN = 60     # avoid keying out desaturated content
    VAL_MIN = 40     # avoid keying out pure black
    for (r, g, b, a), (h, s, v) in zip(rgba_pixels, hsv_pixels):
        if HUE_LO <= h <= HUE_HI and s >= SAT_MIN and v >= VAL_MIN:
            new_data.append((0, 0, 0, 0))
            removed += 1
        else:
            new_data.append((r, g, b, a))
    img.putdata(new_data)
    img.save(path, "PNG")
    total = len(rgba_pixels)
    pct = (removed / total) * 100 if total else 0
    print(f"  [chroma] {path}: removed {removed}/{total} px ({pct:.1f}%)")
    return pct


def git_commit(repo_path: str, message: str, paths: Optional[list] = None):
    """
    Stage and commit only the specified paths (safer than `git add .` which
    sweeps in untracked files and unrelated uncommitted work).
    If `paths` is None or empty, this is a no-op.
    """
    if not paths:
        print(f"  [commit] skipped (no explicit paths provided)")
        return
    subprocess.run(["git", "add", "--", *paths], cwd=repo_path, capture_output=True)
    subprocess.run(["git", "commit", "-m", message], cwd=repo_path, capture_output=True)
    print(f"  [commit] {message} ({len(paths)} files)")


def display_header(text: str):
    width = 60
    print(f"\n{'='*width}")
    print(f"  {text}")
    print(f"{'='*width}")


def display_task(task: PolishTask):
    print(f"  [{task.category}] {task.name}")
    print(f"     {task.description}")


# ---------------------------------------------------------------------------
# Agent 1: AUDITOR
# ---------------------------------------------------------------------------

def run_auditor(client, codebase: str, completed_tasks: list) -> list:
    """Reads the codebase and produces a ranked list of visual polish tasks."""

    completed_str = "\n".join(
        [f"- {t['name']}" for t in completed_tasks]
    ) if completed_tasks else "None yet."

    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=4000,
        system=f"""You are a visual polish auditor for a 2.5D isometric game called
Insight Kitchen (a BeSci-themed Overcooked clone). Your job is to examine the
codebase and identify specific visual polish tasks, ranked by impact.

{ART_DIRECTION}

{PRIORITY_LIST}

ALREADY COMPLETED:
{completed_str}

Respond with a JSON array of tasks. Each task has:
- name: short descriptive name
- category: one of sprite|palette|ui_layout|animation|texture
- description: what specifically needs to change
- priority: 1 (highest) to 10 (lowest)
- needs_asset_gen: true if this requires generating an image asset, false if code-only

Return ONLY valid JSON, no markdown fences, no commentary. Order by priority.
Limit to 10 tasks maximum. Do NOT include tasks already completed.""",
        messages=[{
            "role": "user",
            "content": f"Here is the current codebase:\n\n{codebase}"
        }]
    )

    raw = response.content[0].text.strip()
    # Clean potential markdown fences
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]
    if raw.endswith("```"):
        raw = raw.rsplit("```", 1)[0]
    raw = raw.strip()

    tasks_data = json.loads(raw)
    tasks = []
    for i, t in enumerate(tasks_data):
        tasks.append(PolishTask(
            id=i,
            name=t["name"],
            category=t["category"],
            description=t["description"],
            priority=t.get("priority", i + 1),
            needs_asset_gen=t.get("needs_asset_gen", True),
        ))

    return sorted(tasks, key=lambda t: t.priority)


# ---------------------------------------------------------------------------
# Agent 2: ART DIRECTOR
# ---------------------------------------------------------------------------

def run_art_director(client, task: PolishTask, preference_history: list) -> CreativeBrief:
    """Takes a task and produces a specific creative brief with Gemini prompt."""

    pref_context = ""
    if preference_history:
        pref_context = "\n\nPREVIOUS PREFERENCE SIGNALS (use these to calibrate style):\n"
        for p in preference_history[-5:]:  # last 5 preferences
            pref_context += f"- Task '{p['task']}': preferred because '{p['reasoning']}'\n"

    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=2000,
        system=f"""You are the art director for Insight Kitchen, a 2.5D isometric
BeSci-themed Overcooked game. You translate polish tasks into specific creative
briefs that will be sent to an image generation model (Gemini Nano Banana 2).

{ART_DIRECTION}
{pref_context}

For SPRITE tasks: Write a detailed Gemini image generation prompt. Be specific
about perspective (isometric, 45° top-down), style, colors, and what the sprite
should look like. Always specify transparent background. If the station should
be on a desk/table, include that.

For CHARACTER SPRITE SHEET tasks: The prompt should request an 8-direction sprite
sheet arranged in a grid, showing N, NE, E, SE, S, SW, W, NW views.

For TEXTURE tasks: Request tileable/seamless textures.

For NON-ASSET tasks (code-only): Write implementation notes describing exact
CSS/canvas/code changes needed.

Respond with JSON:
{{
  "gemini_prompt": "the exact prompt to send to Nano Banana 2",
  "implementation_notes": "how to integrate this into the codebase",
  "aspect_ratio": "1:1 or 16:9 or 4:3 etc",
  "table_or_desk": true/false
}}

Return ONLY valid JSON.""",
        messages=[{
            "role": "user",
            "content": f"Task: {task.name}\nCategory: {task.category}\nDescription: {task.description}"
        }]
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]
    if raw.endswith("```"):
        raw = raw.rsplit("```", 1)[0]
    raw = raw.strip()

    data = json.loads(raw)

    return CreativeBrief(
        task=task,
        gemini_prompt=data["gemini_prompt"],
        implementation_notes=data["implementation_notes"],
        aspect_ratio=data.get("aspect_ratio", "1:1"),
        table_or_desk=data.get("table_or_desk", True),
    )


# ---------------------------------------------------------------------------
# Agent 3: ASSET GENERATOR (Gemini Nano Banana 2)
# ---------------------------------------------------------------------------

def generate_candidates(gemini_client, brief: CreativeBrief,
                        num_candidates: Optional[int] = None) -> list:
    """Generate multiple sprite candidates via Nano Banana 2."""

    from google.genai import types

    if num_candidates is None:
        num_candidates = CANDIDATES_PER_TASK

    candidates = []

    for i in range(num_candidates):
        print(f"  [gen] candidate {i+1}/{num_candidates}...")

        try:
            response = gemini_client.models.generate_content(
                model=GEMINI_MODEL,
                contents=[brief.gemini_prompt],
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE", "TEXT"],
                ),
            )

            for part in response.candidates[0].content.parts:
                if part.inline_data is not None:
                    # Extract image bytes
                    image_bytes = part.inline_data.data
                    if isinstance(image_bytes, str):
                        image_bytes = base64.b64decode(image_bytes)

                    candidates.append(Candidate(
                        index=i,
                        image_data=image_bytes,
                        filename=f"candidate_{i}.png",
                    ))
                    break
            else:
                print(f"    [warn] candidate {i+1} returned no image, skipping")

        except Exception as e:
            print(f"    [err] candidate {i+1} failed: {e}")

        # Small delay to respect rate limits
        if i < num_candidates - 1:
            time.sleep(2)

    return candidates


# ---------------------------------------------------------------------------
# Agent 4: EVALUATOR (Ranker)
# ---------------------------------------------------------------------------

def run_evaluator(client, task: PolishTask, candidates: list,
                  brief: CreativeBrief, existing_assets: list) -> list:
    """Ranks candidates by quality. Returns ordered list best-to-worst."""

    # Build message with all candidate images
    content_parts = []
    content_parts.append({
        "type": "text",
        "text": f"""You are evaluating {len(candidates)} candidate sprites for the task: "{task.name}"

Creative brief: {brief.gemini_prompt}

Art direction constraints:
{ART_DIRECTION}

CRITICAL EVALUATION CRITERIA:
1. Does it match the isometric 2.5D perspective consistently?
2. Does it look like it was designed by a human with opinions, or like an AI barfed gradients?
3. Is the style consistent with a colorful, slightly cartoonish office game?
4. Would this read clearly at game resolution (~128-256px)?
5. Does it have a transparent background (or could it easily be extracted)?
6. If applicable, does it sit on a desk/table naturally?

Rank ALL candidates from best to worst. For each, explain WHY in one sentence.

Respond with JSON array, ordered best to worst:
[
  {{"candidate_index": 0, "rank": 1, "reasoning": "why this is best"}},
  ...
]

Return ONLY valid JSON."""
    })

    for c in candidates:
        content_parts.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": _sniff_media_type(c.image_data),
                "data": base64.b64encode(c.image_data).decode(),
            }
        })
        content_parts.append({
            "type": "text",
            "text": f"[Candidate {c.index}]"
        })

    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=2000,
        messages=[{"role": "user", "content": content_parts}]
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]
    if raw.endswith("```"):
        raw = raw.rsplit("```", 1)[0]
    raw = raw.strip()

    rankings = json.loads(raw)

    ranked = []
    for r in rankings:
        idx = r["candidate_index"]
        matching = [c for c in candidates if c.index == idx]
        if matching:
            ranked.append(RankedCandidate(
                candidate=matching[0],
                rank=r["rank"],
                reasoning=r["reasoning"],
            ))

    return sorted(ranked, key=lambda r: r.rank)


# ---------------------------------------------------------------------------
# Agent 5: CONSISTENCY CHECKER
# ---------------------------------------------------------------------------

def run_consistency_check(client, assets_dir: str, generated_assets: list) -> str:
    """Reviews all generated assets for style drift."""

    if len(generated_assets) < 2:
        return "Not enough assets to check consistency yet."

    content_parts = [{
        "type": "text",
        "text": f"""You are reviewing all generated assets so far for style consistency.

{ART_DIRECTION}

Check for:
1. Inconsistent perspective angles between sprites
2. Different outline weights or styles
3. Color palette drift (one sprite warm, another cold)
4. Scale inconsistencies
5. Mixed art styles (pixel art vs smooth vector vs cartoon)

For each issue found, describe it specifically and suggest which asset to regenerate.
If everything looks consistent, say so.

Assets being reviewed:"""
    }]

    for asset_info in generated_assets[-6:]:  # Last 6 assets
        asset_path = asset_info.get("path", "")
        if os.path.exists(asset_path):
            with open(asset_path, "rb") as f:
                img_data = f.read()
            content_parts.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": _sniff_media_type(img_data),
                    "data": base64.b64encode(img_data).decode(),
                }
            })
            content_parts.append({
                "type": "text",
                "text": f"[Asset: {asset_info.get('name', asset_path)}]"
            })

    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=1500,
        messages=[{"role": "user", "content": content_parts}]
    )

    return response.content[0].text


# ---------------------------------------------------------------------------
# Agent 6: IMPLEMENTER
# ---------------------------------------------------------------------------

def run_implementer(client, task: PolishTask, brief: CreativeBrief,
                    asset_path: Optional[str], codebase: str) -> str:
    """Generates code changes to integrate the new asset."""

    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=4000,
        system=f"""You are a game developer implementing visual polish changes for
Insight Kitchen, a 2.5D isometric BeSci-themed Overcooked game.

You will be given a task, the creative brief, and the current codebase.
Write the EXACT code changes needed to integrate the new asset or visual change.

If an asset was generated, it has been saved to: {asset_path or 'N/A'}
The asset path relative to the repo should be used in code.

Output a series of file operations as JSON:
[
  {{
    "operation": "create" | "modify",
    "filepath": "relative/path/to/file",
    "content": "full file content for create, or null for modify",
    "search": "exact text to find (for modify only)",
    "replace": "replacement text (for modify only)"
  }}
]

Return ONLY valid JSON. Be precise with search strings — they must match exactly.""",
        messages=[{
            "role": "user",
            "content": f"""Task: {task.name}
Category: {task.category}
Description: {task.description}

Implementation notes from art director:
{brief.implementation_notes}

Asset path: {asset_path or 'No asset — code-only change'}

Current codebase:
{codebase}"""
        }]
    )

    return response.content[0].text


def apply_code_changes(repo_path: str, changes_json: str) -> bool:
    """Apply implementer's code changes to the repo."""
    raw = changes_json.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]
    if raw.endswith("```"):
        raw = raw.rsplit("```", 1)[0]
    raw = raw.strip()

    try:
        changes = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"  [err] Failed to parse implementer output: {e}")
        return False

    for change in changes:
        filepath = os.path.join(repo_path, change["filepath"])
        op = change["operation"]

        if op == "create":
            parent = os.path.dirname(filepath)
            if parent:
                os.makedirs(parent, exist_ok=True)
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(change["content"])
            print(f"  [new] {change['filepath']}")

        elif op == "modify":
            if not os.path.exists(filepath):
                print(f"  [warn] File not found: {change['filepath']}, skipping")
                continue
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            if change["search"] in content:
                content = content.replace(change["search"], change["replace"], 1)
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(content)
                print(f"  [edit] {change['filepath']}")
            else:
                print(f"  [warn] Search string not found in {change['filepath']}, skipping")

    return True


# ---------------------------------------------------------------------------
# Main Pipeline Loop
# ---------------------------------------------------------------------------

def run_pipeline(repo_path: str, auto_approve: bool = False):
    """Main orchestrator loop."""

    # Validate env
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("[err] ANTHROPIC_API_KEY not set")
        sys.exit(1)
    if not os.environ.get("GEMINI_API_KEY"):
        print("[err] GEMINI_API_KEY not set")
        sys.exit(1)
    if not os.path.isdir(repo_path):
        print(f"[err] Repo path not found: {repo_path}")
        sys.exit(1)

    display_header("INSIGHT KITCHEN VISUAL POLISH PIPELINE")
    print(f"  Repo: {repo_path}")
    print(f"  Candidates per task: {CANDIDATES_PER_TASK}")
    print(f"  Model (code): {CLAUDE_MODEL}")
    print(f"  Model (images): {GEMINI_MODEL}")

    # Init clients
    print("\n  Initializing API clients...")
    anthropic_client = get_anthropic_client()
    gemini_client = get_gemini_client()

    # State
    state = PipelineState(repo_path=repo_path)
    assets_dir = os.path.join(repo_path, "assets", "generated")
    os.makedirs(assets_dir, exist_ok=True)

    cycle = 0

    while True:
        cycle += 1
        display_header(f"CYCLE {cycle}")

        # ----- Step 1: Audit -----
        print("\n[auditor] reading codebase...")
        codebase = read_codebase(repo_path)
        # Include already-generated asset filenames so the auditor knows
        # what's done even though there are no git commits to reflect it.
        existing_assets = []
        if os.path.isdir(assets_dir):
            for fname in sorted(os.listdir(assets_dir)):
                if fname.endswith(".png") and os.path.isfile(os.path.join(assets_dir, fname)):
                    existing_assets.append({"name": fname.replace(".png", "").replace("_", " ")})
        tasks = run_auditor(
            anthropic_client, codebase, state.completed_tasks + existing_assets
        )

        if not tasks:
            print("\nNo more tasks found. The game looks polished.")
            break

        print(f"\nTASK LIST ({len(tasks)} tasks):")
        for i, task in enumerate(tasks):
            marker = " <-" if i == 0 else ""
            print(f"  {i+1}. [{task.category}] {task.name} (priority {task.priority}){marker}")

        # ----- Step 2: User picks task -----
        if auto_approve:
            chosen_idx = 0
        else:
            print(f"\nPick a task (1-{len(tasks)}), or 'q' to quit [default: 1]: ", end="", flush=True)
            choice = input().strip()
            if choice.lower() == 'q':
                print("Exiting pipeline.")
                break
            try:
                chosen_idx = int(choice) - 1 if choice else 0
            except ValueError:
                chosen_idx = 0

        task = tasks[chosen_idx]

        # Hard skip: if a winner PNG with this task's safe name already
        # exists on disk, don't regenerate it. Prevents wasted API calls
        # when the auditor occasionally re-proposes completed work.
        safe_name_check = task.name.lower().replace(" ", "_").replace("/", "_")
        already_done_path = os.path.join(assets_dir, f"{safe_name_check}.png")
        if os.path.exists(already_done_path) and task.needs_asset_gen:
            print(f"\n[skip] {task.name} already exists at {already_done_path}")
            state.completed_tasks.append({
                "name": task.name,
                "category": task.category,
                "cycle": cycle,
            })
            continue

        display_header(f"WORKING ON: {task.name}")
        display_task(task)

        # ----- Step 3: Art Direction -----
        print("\n[art-director] writing creative brief...")
        brief = run_art_director(anthropic_client, task, state.preference_history)
        print(f"  Prompt: {brief.gemini_prompt[:120]}...")
        print(f"  Aspect ratio: {brief.aspect_ratio}")
        print(f"  Table/desk: {'Yes' if brief.table_or_desk else 'No'}")

        # ----- Step 4: Generate Assets (if needed) -----
        asset_path = None

        if task.needs_asset_gen:
            print(f"\n[generator] {CANDIDATES_PER_TASK} candidates via Nano Banana 2...")
            candidates = generate_candidates(gemini_client, brief)

            if not candidates:
                print("  [err] No candidates generated. Skipping task.")
                continue

            # Save all candidates for review
            safe_task = "".join(ch if ch.isalnum() or ch in ("_", "-") else "_"
                                 for ch in task.name.replace(" ", "_"))
            task_dir = os.path.join(assets_dir, f"task_{cycle}_{safe_task}")
            os.makedirs(task_dir, exist_ok=True)
            for c in candidates:
                cpath = os.path.join(task_dir, c.filename)
                save_image(c.image_data, cpath)
                # Chroma key magenta -> alpha, then reload bytes so the
                # evaluator sees the transparent version
                chroma_key_to_alpha(cpath)
                with open(cpath, "rb") as f:
                    c.image_data = f.read()

            # ----- Step 5: Rank candidates -----
            print(f"\n[evaluator] ranking {len(candidates)} candidates...")
            ranked = run_evaluator(
                anthropic_client, task, candidates, brief, state.generated_assets
            )

            print("\n  Rankings:")
            for r in ranked:
                marker = " <- WINNER" if r.rank == 1 else ""
                print(f"    #{r.rank}: Candidate {r.candidate.index} - {r.reasoning}{marker}")

            # ----- Step 6: User vibe check -----
            winner = ranked[0]

            if not auto_approve:
                print(f"\nVIBE CHECK - Winner is Candidate {winner.candidate.index}")
                print(f"   Saved at: {task_dir}/candidate_{winner.candidate.index}.png")
                print(f"   Reasoning: {winner.reasoning}")
                print(f"\n   Accept? (y/n/NUMBER to pick different candidate) [y]: ", end="", flush=True)
                vibe = input().strip().lower()

                if vibe == 'n':
                    print("   Skipping task.")
                    continue
                elif vibe.isdigit():
                    pick = int(vibe)
                    matching = [r for r in ranked if r.candidate.index == pick]
                    if matching:
                        winner = matching[0]
                        print(f"   -> Using Candidate {pick} instead.")
                    else:
                        print(f"   -> Candidate {pick} not found, using winner.")

            # Save winner as the final asset
            safe_name = task.name.lower().replace(" ", "_").replace("/", "_")
            final_filename = f"{safe_name}.png"
            asset_path = os.path.join(assets_dir, final_filename)
            save_image(winner.candidate.image_data, asset_path)

            # Record preference signal
            state.preference_history.append({
                "task": task.name,
                "reasoning": winner.reasoning,
                "chosen_index": winner.candidate.index,
            })

            state.generated_assets.append({
                "name": task.name,
                "path": asset_path,
                "category": task.category,
            })

        # ----- Step 7: Integration deferred to Claude Code -----
        # Implementer agent + git commit steps removed intentionally.
        # Assets are generated and saved to assets/generated/; integration
        # into index.html is done manually afterward by Claude Code with
        # direct Read/Edit tools (more precise than a subprocess agent).
        print("\n[integration] deferred -- asset saved, Claude Code will wire up later")

        # Record completion
        state.completed_tasks.append({
            "name": task.name,
            "category": task.category,
            "cycle": cycle,
        })

        print(f"\n[done] {task.name}")

        # ----- Step 9: Consistency check (periodic) -----
        if cycle % CONSISTENCY_CHECK_EVERY == 0 and len(state.generated_assets) >= 2:
            print("\n[consistency] checking for style drift...")
            report = run_consistency_check(
                anthropic_client, assets_dir, state.generated_assets
            )
            print(f"\n{report}")

            if not auto_approve:
                print("\n   Continue? (y/n) [y]: ", end="", flush=True)
                if input().strip().lower() == 'n':
                    break

        # Loop continues — re-audits on next cycle
        print(f"\n{'-'*60}")
        print(f"  Completed {len(state.completed_tasks)} tasks so far.")

        if not auto_approve:
            print("  Press Enter to continue, or 'q' to quit: ", end="", flush=True)
            if input().strip().lower() == 'q':
                break

    # ----- Final summary -----
    display_header("PIPELINE COMPLETE")
    print(f"\n  Tasks completed: {len(state.completed_tasks)}")
    for t in state.completed_tasks:
        print(f"    - {t['name']} (cycle {t['cycle']})")
    print(f"\n  Assets generated in: {assets_dir}")
    print(f"  All changes committed to current branch.")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Insight Kitchen Visual Polish Pipeline")
    parser.add_argument("--repo", required=True, help="Path to the Insight Kitchen repo")
    parser.add_argument("--auto", action="store_true",
                        help="Auto-approve everything (no human in the loop)")
    parser.add_argument("--candidates", type=int, default=CANDIDATES_PER_TASK,
                        help=f"Number of candidates per task (default: {CANDIDATES_PER_TASK})")

    args = parser.parse_args()

    if args.candidates:
        CANDIDATES_PER_TASK = args.candidates

    run_pipeline(args.repo, auto_approve=args.auto)
