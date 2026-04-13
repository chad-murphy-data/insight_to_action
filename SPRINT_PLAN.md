# Insight Kitchen — Ship Sprint Plan

**Goal:** Tutorial + 3 levels + 1 inside-joke level, playable end-to-end by two pairs of non-gamers at a BeSci virtual onsite. Nobody fails — scoring is the competition. Polish to the point where it feels like a real game, not a prototype.

**Audience:** 4 people, two teams of two. Not gamers. Will play through once or twice. Fun > difficulty.

---

## Current State (what's done)

- Isometric canvas game, single HTML file, multiplayer via WebSocket or local bot
- Tutorial with 3-phase step-by-step walkthrough
- 6 active stations: Templates, Intake, Data Collection, Counter, Shareout, Trash
- 4 gated stations: Analysis, Synthesis, Feedback, Copilot
- Overcooked burger-patty DATA mechanic (cook 5s, warn 10s, stale 15s)
- Single-slot carry with direction-based positioning
- Auto-combine on counter (TMPL + ingredients = DONE)
- Order queue with expiry and weighted recipe spawning
- Bot AI (handles TMPL + RQ only)
- Gemini sprites for all stations + carry items, integrated
- Player collision / bumping
- Star rating (1-3 stars)
- Hidden IJKL P2 testing controls

---

## Architecture: Levels & Recipes

### Recipe Lineup

| ID | Name | Ingredients | Points | Unlocked |
|---|---|---|---|---|
| STAT_SNAPSHOT | **Stat Snapshot** | TMPL + Intake | 1 | Tutorial Phase 1 |
| INSIGHT_REPORT | **Insight Report** | TMPL + Intake + Data | 2 | Tutorial Phase 3 |
| DEEP_DIVE | **Deep Dive** | TMPL + Intake + Data + Lit | 3 | Level 2 |
| THE_FRAMEWORK | **The Framework** | TMPL + Intake + Data + Lit + Feedback | 4 | Level 3 (boss level) |

### Level Progression

| Level | Name | Recipes | New Mechanic | Stations | Layout Gimmick |
|---|---|---|---|---|---|
| **Tutorial** | The Onboarding | Stat Snapshot, Insight Report | Learn everything | Templates, Intake, Data, Counter x2, Shareout, Trash | Open floor, no obstacles |
| **Level 1** | The Sprint | Stat Snapshot, Insight Report | Time pressure, more orders | Same + rearranged | Island divider down the middle |
| **Level 2** | The Deep Dive | + Deep Dive | Lit Review station unlocks | + Lit Review, Counter x3 | L-shaped wall, two "rooms" |
| **Level 3** | The Framework | All four recipes | Feedback station + boss NPC | + Feedback, Counter x3 | U-shaped kitchen, boss desk blocks center |
| **Bonus** | [Inside Joke Level] | All recipes, chaotic | Everything at once | All stations | TBD — needs your input on the joke |

---

## Sprint Breakdown

### Sprint 1: Recipe & Counter Overhaul
**Goal:** Multiple counters, renamed recipes, per-recipe finished sprites

- [ ] **Rename recipes** — QUICK_STAT to STAT_SNAPSHOT, FULL_READOUT to INSIGHT_REPORT, PSYCH_INSTRUMENT to DEEP_DIVE, FRAMEWORK_DECK to THE_FRAMEWORK
- [ ] **Per-recipe DONE tinting** — when DONE deck sits on counter or is carried, tint the carry_deck sprite with the recipe's color (blue for Snapshot, gold for Report, orange for Deep Dive, sparkle-gold for Framework). Do this in code via canvas compositing, no new sprites needed
- [ ] **Multiple counters** — change STA array to support 2-3 COUNTER stations. The auto-combine `tryCombineCounter` already runs per-station in the update loop, so this should just work. Give each counter its own grid position
- [ ] **Counter pickup priority** — when multiple counters exist, picking up a DONE deck should pull from the counter you're standing at, not a global search
- [ ] **Update order cards** — show recipe name + colored icon instead of generic emoji. Show ingredient checklist with checkmarks for what's already on a counter
- [ ] **Tutorial references** — update any tutorial prompts that reference "the counter" to work with multiple counters

**Estimated size:** Medium (half day)

---

### Sprint 2: Level Layouts & Obstacles
**Goal:** Each level has a unique kitchen layout with walls/dividers that create routing puzzles

- [ ] **Wall/obstacle system** — add a per-level `walls` array of grid segments that block player movement. Render as isometric wall sprites or simple colored blocks. Collision check in `updPl` against wall segments
- [ ] **Per-level station positions** — each level config gets its own `stationPositions` map that overrides the default STA grid coordinates. Stations move between levels like Overcooked kitchens
- [ ] **Level 1 layout: "The Sprint"** — island counter divider running vertically down the middle. Templates + Intake on one side, Shareout + Trash on the other, Counters accessible from both sides. Forces players to specialize (one fetches, one delivers)
- [ ] **Level 2 layout: "The Deep Dive"** — L-shaped wall creating two rooms. Main room has Templates, Intake, Counters. Side room has Data Collection + Lit Review. One player runs the "lab", the other runs the "kitchen". A narrow doorway connects them
- [ ] **Level 3 layout: "The Framework"** — U-shaped counter arrangement. Feedback station with boss NPC in the back. Players must navigate around the U to reach different stations. Boss desk partially blocks the center
- [ ] **Wall rendering** — isometric wall segments that match the existing art style. Can be simple colored blocks initially, Gemini sprites later
- [ ] **Minimap or station labels** — make sure station pills are always visible even when layout gets complex

**Estimated size:** Large (full day)

**Difficulty calibration for non-gamers:**
- Wide doorways (2+ tiles), never a 1-tile chokepoint
- No dead ends — always two ways to reach any station
- Walls create interesting routing, not frustration
- Level 1 divider has openings at both ends

---

### Sprint 3: Lit Review & Feedback Stations
**Goal:** Activate the gated stations with proper mechanics

- [ ] **Lit Review station** — source station like Templates/Intake. Player walks up, presses ACT, picks up a LIT item. Auto-restocks. Simple — no cooking mechanic, just another ingredient to fetch
- [ ] **Feedback station** — processing station. Player drops a DONE deck here, boss NPC "reviews" it (2-3 second processing timer), then it comes back as an upgraded DONE with +1 bonus point. Required for The Framework recipe. Visual: boss character examines the deck, speech bubble shows review comments
- [ ] **Bot AI expansion** — bot should handle DATA (walk to Data Collection, wait for cook, pick up) and LIT (simple fetch). Framework recipe is too complex for bot — that's fine, humans handle it
- [ ] **Recipe gating per level** — Level 1 only spawns Stat Snapshot + Insight Report orders. Level 2 adds Deep Dive. Level 3 adds The Framework. Orders should weight toward simpler recipes so non-gamers aren't overwhelmed (70% simple, 20% medium, 10% complex)

**Estimated size:** Medium (half day)

---

### Sprint 4: Throwing & Passing
**Goal:** Players can toss items to each other — the signature Overcooked co-op mechanic

- [ ] **Throw mechanic** — double-tap ACT (or a dedicated throw key) while carrying an item: launches the item in the player's facing direction. Item slides across the floor as a physics object (bounces off walls, decelerates). If it reaches another player, they auto-catch it (if hands are empty). If it reaches a counter, it drops on the counter
- [ ] **Throw arc visual** — the item sprite moves along the floor with a slight shadow underneath, maybe a small bounce
- [ ] **Throw range** — ~4 tiles max, generous auto-catch radius (1.5 tiles) so non-gamers can actually land throws
- [ ] **Throw tutorial step** — add an optional "try throwing!" prompt in the tutorial. Not required to complete, just shown
- [ ] **Throw feedback** — satisfying "catch" particle burst when a teammate catches an item

**Estimated size:** Medium (half day)

**Non-gamer note:** Make this very forgiving. Large catch radius, items slide to the nearest valid target (player or counter) if close. The throw should feel like a fun bonus, not a required skill.

---

### Sprint 5: Sound & Music
**Goal:** Audio transforms the feel from "prototype" to "game"

- [ ] **Background music** — upbeat loop, Overcooked-style. Can use a royalty-free track or generate with Suno/Udio. Should be cheerful, not stressful. Volume control or mute button
- [ ] **Core SFX (6-8 sounds):**
  - Pickup item (short pop)
  - Drop item on counter (thunk)
  - Recipe combines (sparkle/chime)
  - Deliver/shareout (cha-ching / celebration)
  - Trash (sad trombone or crumple)
  - Order expires (gentle buzzer)
  - Data ready (ding)
  - Data going stale (warning beep)
- [ ] **Web Audio API** — use AudioContext for low-latency playback. Preload all sounds on first user interaction (browser autoplay policy)
- [ ] **Mute toggle** — keyboard shortcut (M) + UI button. Remember preference in localStorage

**Estimated size:** Medium (half day)

**Source options:** Free SFX from freesound.org or zapsplat.com. Music from a royalty-free game music pack or AI-generated.

---

### Sprint 6: UI & Juice Polish
**Goal:** Make it feel finished

- [ ] **Level select screen** — after tutorial, show a level map or list. Each level shows best star rating. Can replay any unlocked level
- [ ] **Between-level transition** — "Level Complete!" screen with star rating, score breakdown, "Next Level" button. Show time remaining as bonus context ("you finished with 45s left!")
- [ ] **Order card polish** — ingredient icons use carry sprites instead of emoji. Progress bar shows time remaining. Flash/pulse when order is about to expire (last 15s)
- [ ] **Countdown polish** — 3-2-1-GO with each number zooming in, maybe a drum roll sound
- [ ] **Game over screen** — show both teams' scores side by side (if multiplayer). Crown icon for the winning team. Fun superlatives ("Most deliveries", "Fastest recipe", "Most items trashed")
- [ ] **Tutorial skip button** — for replay. "Skip Tutorial" button visible during tutorial for anyone who's played before
- [ ] **Mobile controls** — the on-screen DPAD + ACT button already exist but may need sizing/positioning polish for tablet play
- [ ] **Team labels** — P1 and P2 should have visible name tags or team colors above their heads

**Estimated size:** Medium-Large (half to full day)

---

### Sprint 7: Inside Joke Level
**Goal:** One bonus level that's an inside joke for the BeSci team

**Need your input here! Some frameworks to riff on:**

- **"The Reorg"** — stations physically swap positions every 30 seconds. Chaos mode
- **"Stakeholder Surprise"** — the boss NPC walks around the kitchen getting in the way, randomly freezing players for 2s with "feedback" speech bubbles
- **"The All-Hands"** — every recipe is The Framework (4+ ingredients). Orders come fast. Pure chaos. The joke is "everything is urgent and everything requires everything"
- **"Scope Creep"** — new ingredient stations keep appearing mid-round. Every 30s a new station spawns in a random spot. Recipes get more complex as the round goes on
- **"The Retro"** — everything runs in reverse. Shareout is where you pick up finished decks, and you have to disassemble them back into ingredients and return them to the right stations. (This would be wild to build but hilarious)

Pick one (or combine ideas) and I'll build it.

---

### Sprint 8: Multiplayer & Hosting
**Goal:** Two pairs can play simultaneously in a competitive format

- [ ] **Room-based multiplayer** — already exists via WebSocket (server.js). Verify it works with the new level system
- [ ] **Competitive mode** — both teams play the same level simultaneously, see each other's score in real-time (or blind until the end for drama)
- [ ] **Shared level progression** — host picks the level, both teams play it. After the round, show comparative scores
- [ ] **Hosting** — deploy to Render (render.yaml already exists) or Netlify. Verify WebSocket connectivity. Test with 4 simultaneous players
- [ ] **Room codes** — already implemented. Make sure they're easy to share (short codes, copy button)
- [ ] **Spectator mode** — nice to have. One person can watch both teams' screens

**Estimated size:** Medium (half day for testing/fixing, deployment already scaffolded)

---

## Difficulty Calibration (Non-Gamer Friendly)

This is critical. These players will:
- Not know WASD intuitively
- Not understand "recipes" without being told
- Struggle with time pressure
- Need to feel successful, not frustrated

### Guardrails

| Mechanic | Overcooked (Hard) | Our Version (Friendly) |
|---|---|---|
| **Order expiry** | Fail state, fire | -1 point, order disappears quietly |
| **Stale data** | Burns, causes fire | Refused at counter, -1 point, no cascading failure |
| **Time limits** | Tight, stressful | Generous. Tutorial: 3 min. Levels: 2:30-3:00 |
| **Order frequency** | Constant pressure | Max 2-3 active orders. Never overwhelming |
| **Recipe complexity** | 3-5 ingredients common | 2-3 ingredients for most recipes. 4-ingredient Framework is the "challenge" |
| **Throwing** | Required for efficiency | Optional fun bonus, never required |
| **Level fail** | Can fail with 0 stars | **Cannot fail. Always get at least 1 star.** Minimum score threshold = 0 |
| **Tutorial** | Brief or none | Full 3-phase guided walkthrough. Can't mess up |
| **Controls** | Assumed knowledge | WASD + Space only. Big on-screen labels. Tutorial teaches each key |

### Star Thresholds (Proposed)

| Level | 1 Star (Participation) | 2 Stars (Good) | 3 Stars (Great) |
|---|---|---|---|
| Tutorial | 1 delivery | 3 deliveries | 5 deliveries |
| Level 1 | 2 deliveries | 4 deliveries | 7 deliveries |
| Level 2 | 2 deliveries | 5 deliveries | 8 deliveries |
| Level 3 | 1 delivery | 3 deliveries | 6 deliveries |
| Bonus | 1 delivery | Any survival | Laugh achieved |

### Speed & Timing

| Setting | Current | Proposed |
|---|---|---|
| Player speed | ~2.4 tiles/sec | Keep — feels right |
| DATA cook time | 5s | Keep — good rhythm |
| DATA stale time | 15s | Maybe 18-20s for non-gamers? |
| Order time limit | 60s tutorial, 50s L2 | 75s across the board. Non-gamers are slow |
| Round duration | 180s tutorial, 150s levels | 180s for all levels. Nobody should run out of time mid-flow |
| Order spawn interval | 12 frames | Slow it down: 18-20 frames. Less pressure |
| Max active orders | 2-4 | Tutorial: 2, L1: 2, L2: 3, L3: 3 |

---

## Sprint Sizing Summary

| Sprint | Scope | Est. Time | Priority |
|---|---|---|---|
| 1. Recipes & Counters | Rename, tint, multi-counter | Half day | **P0 — do first** |
| 2. Level Layouts | Walls, per-level positions, 3 layouts | Full day | **P0** |
| 3. Lit Review & Feedback | Activate 2 gated stations | Half day | **P0** |
| 4. Throwing | Toss items to partner | Half day | **P1** |
| 5. Sound | Music + 6-8 SFX | Half day | **P1** |
| 6. UI Polish | Level select, transitions, order cards | Half-full day | **P1** |
| 7. Inside Joke Level | Bonus chaos level | Half day | **P2 — fun** |
| 8. Multiplayer & Hosting | Test, deploy, room codes | Half day | **P0** |

**Total estimate: ~4-5 days of focused work**

**Minimum viable ship (P0 only): ~2.5 days**
- Sprint 1 + 2 + 3 + 8 = recipes, layouts, stations, deployed

---

## Open Questions for You

1. **Inside joke level** — which concept resonates? Or is there a better BeSci inside joke to build around?
- Let's hold off on this. Definite P2
2. **Recipe names** — are Stat Snapshot / Insight Report / Deep Dive / The Framework good? Any other team lingo to work in?
- These are perfect!
3. **Character sprites** — right now P1 is "owner.png" and P2 is "employee.png". Want custom characters or are these fine?
- I would like to rebuild sprites. Let's build some fun ones if we have time.
4. **Team names** — should teams be named (Team Alpha / Team Beta) or should players enter names?
- I think each team will just open a separate room. Let's call this v2
5. **Feedback station flavor** — what does your boss actually say during feedback? Real quotes would make this hilarious
- Let me think on this one, it would be :) 
6. **Data stale timing** — 15s currently. Want to relax it to 18-20s for non-gamers?
- I think 15s feels about right. I'd like this to cause headaches :) 
7. **Deploy target** — Render (render.yaml exists) or Netlify (MCP available) or somewhere else?
- Already deployed on Render, which seems fine? 
8. Can we add "chopping animations" somehow? 
