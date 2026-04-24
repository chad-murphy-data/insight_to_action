# Insight Kitchen — R3F Refactor Handoff

## What this is

**Insight Kitchen** is a 2-player co-op game modelled on Overcooked, themed around behavioural science research workflows. Two players run around a kitchen picking up "ingredients" (templates, intake cards, data) and combining them on counters to produce "dishes" (insight decks) which they deliver to a shareout station for points. It runs in a browser, has a WebSocket relay for online multiplayer, and 4 levels including a tutorial.

The current implementation is a **single HTML file** (~1800 lines) using Canvas 2D with a hand-rolled isometric renderer. It works but feels physically janky compared to proper 3D.

The goal of this refactor is to rebuild the client using the **React Three Fiber stack** already proven in the sister project "Parcel Pals" (see below), while keeping all game logic, the WebSocket relay, and the asset sprites intact.

---

## Reference project: Parcel Pals

Location: `C:\Users\chadm\Desktop\Parcel Sim 3rd Person`

This is a working R3F game built by the same user. It has already solved:
- 3rd-person player controller with physics (Rapier)
- WASD movement, camera-relative directions
- E-key proximity pickup + carry system (item floats in front of player)
- Zustand game store pattern
- HUD overlay in HTML on top of Canvas
- Feedback flash (approve/deny stamp)
- Proximity detection for interaction zones

**Read this codebase before starting.** The Insight Kitchen refactor should reuse these patterns directly, not reinvent them. Key files:
- `src/components/Player.tsx` — physics body, WASD, E-key pickup
- `src/store/gameStore.ts` — Zustand store pattern
- `src/store/playerState.ts` — mutable frame-sync ref (avoids per-frame store writes)
- `src/components/Parcels.tsx` — carried item that follows player
- `src/components/HUD.tsx` — HTML overlay on canvas

---

## Tech stack (match Parcel Pals exactly)

```json
{
  "@react-three/fiber": "^9.x",
  "@react-three/drei": "^10.x",
  "@react-three/rapier": "^2.x",
  "three": "^0.183.x",
  "zustand": "^5.x",
  "react": "^19.x",
  "typescript": "^6.x",
  "vite": "^8.x"
}
```

---

## Camera: fixed isometric, never moves

This is the most important architectural decision. Unlike Parcel Pals (free 3rd-person orbit), Insight Kitchen uses a **locked isometric camera** so both players can see the whole kitchen at once, and so the isometric sprite art matches the viewing angle.

```typescript
// Approximate camera setup — tune angle/distance to match sprite perspective
camera.position.set(20, 20, 20)  // equal x/y/z = true 45° isometric
camera.lookAt(0, 0, 0)
// OR use @react-three/drei <OrthographicCamera> for true iso (no perspective distortion)
```

The camera never moves or rotates. Both players are always fully visible. This is how Overcooked works.

---

## Grid system

The current game uses a `12 columns × 10 rows` grid. In the R3F version this becomes a flat 3D world:

```typescript
// Grid to world position
function gridToWorld(gx: number, gy: number): [number, number, number] {
  return [gx * TILE_SIZE, 0, gy * TILE_SIZE]
}

const TILE_SIZE = 2  // tune to taste
const GRID_COLS = 12
const GRID_ROWS = 10
```

The floor is a flat plane or tiled grid helper. Stations are box geometry placed at their grid positions.

---

## Game logic to port (copy directly, no changes needed)

These are pure data/logic with zero rendering dependencies. **Do not rewrite them — copy them into the Zustand store or a separate logic file.**

### Recipes
```javascript
const RECIPES = {
  STAT_SNAPSHOT: { name: 'Stat Snapshot', points: 1, color: '#88bbff', requires: ['RQ'] },
  INSIGHT_REPORT: { name: 'Insight Report', points: 2, color: '#f0c040', requires: ['RQ', 'DATA'] },
  DEEP_DIVE: { name: 'Deep Dive', points: 3, color: '#ff8c42', requires: ['RQ', 'DATA', 'LIT'] },
  THE_FRAMEWORK: { name: 'The Framework', points: 4, requires: ['RQ', 'DATA', 'LIT'], needsFeedback: true, rainbow: true },
}
```

### Items (carriable ingredients)
```javascript
const ITEMS = {
  TMPL: { name: 'Deck Template',  sym: '📋' },  // recipe base — from TEMPLATES station
  RQ:   { name: 'Intake',         sym: '❓' },  // from INTAKE station
  DATA: { name: 'Analyzed Data',  sym: '📊' },  // timed cook from DATA_COLLECTION station
  LIT:  { name: 'Lit Review',     sym: '📚' },  // from SYNTHESIS station
  DONE: { name: 'Polished Deck',  sym: '✅' },  // auto-created when recipe completes on COUNTER
}
```

### Auto-combine logic
When a COUNTER station holds a TMPL + all ingredients for any recipe, it auto-creates a DONE item. Port this logic exactly from `index.html` — search for `// auto-combine` in the source.

### DATA cook cycle
DATA_COLLECTION is a timed station (like Overcooked's stove). Player presses interact to start a cook, waits for it to complete, then picks up the result. It has fresh/stale/spoiled states:
- `0 → 5s`: cooking (not pickable)
- `5 → 10s`: fresh READY (pickable, green)
- `10 → 15s`: going stale (amber warning)
- `15s+`: stale — pickable but spoils if dropped on counter (-1 point)

### Level configs
All 4 levels (Tutorial, Sprint, Deep Dive, Framework) have station position overrides, wall layouts, order configs, and player spawn points defined in the `LEVELS` object in `index.html`. Copy this object verbatim.

### Interior wall system
Walls are defined as vertical (`V`) and horizontal (`H`) segments in grid space. In R3F, render these as thin box geometry (RigidBody fixed) matching the grid edges. The collision logic can use Rapier instead of the custom `wallCollide()` function.

---

## Station types

| Station | Key | Behaviour |
|---|---|---|
| TEMPLATES | source | Infinite TMPL items, press interact to take one |
| INTAKE | source | Auto-spawns RQ items (one every 5s, max 3) |
| DATA_COLLECTION | timed cook | Press interact to start 5s cook, pick up result |
| COUNTER | prep | Drop items here; auto-combines into DONE if recipe complete |
| DELIVERY (SHAREOUT) | output | Drop DONE here to score points + spawn order flash |
| TRASH | discard | Drop any item to destroy it |
| FEEDBACK | gated | Level 3 only; boss NPC station, needed for THE_FRAMEWORK recipe |
| ANALYSIS | gated | Not active in current levels |
| SYNTHESIS | gated | Not active in current levels |
| COPILOT | gated | Not active in current levels |

---

## Sprite assets

Location: `C:\Users\chadm\Desktop\BeSci Overcooked\assets\`

Files: `templates_station_sprite.png`, `intake_station_sprite.png`, `data_collection_station_sprite.png`, `counter_station_sprite.png`, `shareout_station_sprite.png`, `trash_station_sprite.png`, `analysis_station_sprite.png`, `synthesis_station_sprite.png`, `feedback_station_sprite.png`, `copilot_station_sprite.png`

Also carry icons: `carry_template.png`, `carry_intake.png`, `carry_data.png`, `carry_lit.png`, `carry_deck.png`

Also character sprites: `owner.png`, `employee.png`, `boss.png`

**Sprite rendering approach:**
- Station sprites are **isometric art** drawn at a fixed viewing angle. Place them as flat `<mesh>` planes (`PlaneGeometry`) on top of the 3D station box, facing up and slightly tilted to match the isometric perspective. Use `meshBasicMaterial` (unlit) so the baked sprite lighting doesn't fight R3F's scene lighting.
- Alternatively, use them as billboard sprites (`<Sprite>` in Three.js / `<Billboard>` in Drei) — they always face the camera.
- Carried items float above the player using the same pattern as Parcel Pals' held parcel.

---

## Multiplayer (WebSocket relay)

**The relay server is already live at:** `wss://insight-to-action.onrender.com`

**Do not change the relay server.** It handles room creation, room codes, and message passing between host and guest. The protocol is:

```javascript
// Messages the relay handles:
{ type: 'create' }                          // host creates room → receives { type: 'created', code: 'XXXX' }
{ type: 'join', code: 'XXXX' }             // guest joins → both receive { type: 'joined' } / { type: 'guest_joined' }
{ type: 'state', data: gameState }          // host → relay → guest (full game state, every frame)
{ type: 'input', data: { up, down, left, right, act } }  // guest → relay → host
{ type: 'peer_left' }                       // relay notifies when other player disconnects
```

**Sync model:**
- **Host** runs the full game simulation (physics, recipes, timers, orders). Sends serialised game state to guest every frame via relay.
- **Guest** sends their input to host each frame. Receives game state from host and renders it.
- Both players render their own 3D scene from the shared state.

The host/guest role is determined by who creates vs joins the room — same as the current implementation.

---

## Player characters

Current sprites: `owner.png` (P1), `employee.png` (P2) — spritesheet format (8 cols × 4 rows, 60×112px per frame, 4 directions).

For the R3F version, the simplest approach is to start with placeholder geometry (capsule body + sphere head, like Parcel Pals) and swap in proper character models or billboard sprites later. The character direction (`DL`, `UL`, `UR`, `DR`) maps to 4 rotation angles in 3D.

---

## Orders system

Orders are time-limited recipe requests that appear in the HUD. Each order has:
- A recipe type (e.g. INSIGHT_REPORT)
- A countdown timer (per-level `orderTimeLimit`, e.g. 75s)
- A point value (from RECIPES)
- Failure penalty if timer runs out

New orders spawn every `ORDER_INTERVAL` seconds (12s) up to `maxOrders` active at once. When a DONE item matching a recipe is delivered, the matching order is fulfilled and points scored.

The orders UI is a row of ticket cards in the HUD — HTML overlay, not 3D geometry.

---

## Suggested sprint plan

### Sprint A — Kitchen & Movement
- Vite + R3F + Rapier + Zustand project scaffold
- Fixed isometric camera (tune to match sprite angle)
- 12×10 grid floor
- Station boxes at correct grid positions (plain colored boxes first, sprites later)
- Interior wall colliders from level config
- Two player physics bodies, WASD movement (P1 local, P2 placeholder)
- Basic HUD shell (score, timer)

### Sprint B — Game Loop
- Carry system (E-key pickup/drop, item floats above player)
- Station interactions: TEMPLATES, INTAKE auto-spawn, COUNTER auto-combine, DELIVERY scoring, TRASH
- DATA_COLLECTION timed cook with progress indicator
- Recipe system + DONE item creation
- Orders system (spawn, countdown, fulfill, fail)
- Score + round timer

### Sprint C — Multiplayer & Polish
- WebSocket relay integration (copy from index.html, adapt to R3F state)
- Guest input → host simulation → state sync
- Lobby UI (create room, join room, room code display)
- Station sprites on top of boxes
- Carry icon sprites above player
- Particle effects on delivery
- Level select + level configs (Tutorial, Sprint, Deep Dive, Framework)
- Game over / star rating screen

---

## What NOT to change

- The relay server at `wss://insight-to-action.onrender.com`
- The room code protocol (create/join/state/input message types)
- Recipe definitions and point values
- Level configs (station positions, wall layouts, star thresholds)
- The overall game loop (source → carry → counter → combine → deliver)

---

## Key files to read before starting

1. `C:\Users\chadm\Desktop\BeSci Overcooked\index.html` — full current game (read the game logic sections, not the Canvas drawing code)
2. `C:\Users\chadm\Desktop\Parcel Sim 3rd Person\src\components\Player.tsx` — player controller to reuse
3. `C:\Users\chadm\Desktop\Parcel Sim 3rd Person\src\store\gameStore.ts` — Zustand store pattern to follow
4. `C:\Users\chadm\Desktop\Parcel Sim 3rd Person\src\components\Parcels.tsx` — carry system to reuse
5. `C:\Users\chadm\Desktop\Parcel Sim 3rd Person\src\App.tsx` — how Physics + Canvas + HUD overlay fits together
