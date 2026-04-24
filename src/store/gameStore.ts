import { create } from 'zustand'
import { RECIPES } from '../data/recipes'
import { ITEMS, type CarriedItem, type StationItem } from '../data/items'
import { LEVELS, type WallDef } from '../data/levels'
import {
  GRID_COLS, GRID_ROWS, TILE_SIZE,
  RQ_SPAWN_INTERVAL, RQ_MAX_QUEUE,
  TMPL_SPAWN_INTERVAL, TMPL_MAX_QUEUE,
  DATA_MAX_QUEUE, DATA_COOK_TIME, DATA_WARN_TIME, DATA_STALE_TIME,
  ORDER_INTERVAL,
} from '../data/constants'
import { playerState } from './playerState'
import { spawnCelebration } from '../components/Particles'
import { noteCounterDrop } from './tutorial'
import { DEFAULT_P1_CHAR, DEFAULT_P2_CHAR } from '../data/characters'

// ─── Station definition ───
export interface Station {
  id: string
  name: string
  gx: number
  gy: number
  color: string
  items: StationItem[]
  maxQ: number
  lockout: number
  flash: string | null
  flashT: number
  _origGx?: number
  _origGy?: number
}

// ─── Order ───
export interface Order {
  id: number
  recipe: string
  timeLimit: number
  elapsed: number
}

// ─── Float text ───
export interface FloatText {
  id: number
  gx: number
  gy: number
  text: string
  color: string
  life: number
  maxLife: number
}

// ─── Game phases ───
export type GamePhase = 'menu' | 'lobby' | 'countdown' | 'playing' | 'gameover'
export type Role = 'host' | 'guest' | null

// ─── Wall edges (compiled from level walls) ───
let wallEdges = new Set<string>()
let wallSegments: { t: 'V' | 'H'; x: number; y: number }[] = []

export function getWallEdges() { return wallEdges }
export function getWallSegments() { return wallSegments }

function compileWalls(level: number) {
  wallEdges = new Set()
  wallSegments = []
  const cfg = LEVELS[level]
  if (!cfg?.walls) return
  for (const w of cfg.walls) {
    if (w.t === 'V') {
      for (let y = w.y1!; y < w.y2!; y++) {
        wallEdges.add(`V:${w.x}:${y}`)
        wallSegments.push({ t: 'V', x: w.x!, y })
      }
    } else {
      for (let x = w.x1!; x < w.x2!; x++) {
        wallEdges.add(`H:${x}:${w.y}`)
        wallSegments.push({ t: 'H', x, y: w.y! })
      }
    }
  }
}

// ─── Default stations ───
function createStations(): Station[] {
  return [
    { id: 'TEMPLATES_0',       name: 'TEMPLATES',       gx: 3,  gy: 2, color: '#aaaaaa', items: [], maxQ: 6,  lockout: 0, flash: null, flashT: 0 },
    { id: 'INTAKE_0',          name: 'INTAKE',          gx: 9,  gy: 2, color: '#88bbff', items: [], maxQ: 3,  lockout: 0, flash: null, flashT: 0 },
    { id: 'DATA_COLLECTION_0', name: 'DATA_COLLECTION', gx: 9,  gy: 5, color: '#40a0e0', items: [], maxQ: 3,  lockout: 0, flash: null, flashT: 0 },
    { id: 'COUNTER_0',         name: 'COUNTER',         gx: 3,  gy: 5, color: '#e0c040', items: [], maxQ: 8,  lockout: 0, flash: null, flashT: 0 },
    { id: 'COUNTER_1',         name: 'COUNTER',         gx: 7,  gy: 7, color: '#e0c040', items: [], maxQ: 8,  lockout: 0, flash: null, flashT: 0 },
    { id: 'DELIVERY_0',        name: 'DELIVERY',        gx: 3,  gy: 8, color: '#50b060', items: [], maxQ: 99, lockout: 0, flash: null, flashT: 0 },
    { id: 'TRASH_0',           name: 'TRASH',           gx: 6,  gy: 4, color: '#cc4444', items: [], maxQ: 99, lockout: 0, flash: null, flashT: 0 },
    { id: 'ANALYSIS_0',        name: 'ANALYSIS',        gx: 5,  gy: 2, color: '#40a0e0', items: [], maxQ: 3,  lockout: 0, flash: null, flashT: 0 },
    { id: 'COPILOT_0',         name: 'COPILOT',         gx: 2,  gy: 4, color: '#1abc9c', items: [], maxQ: 1,  lockout: 0, flash: null, flashT: 0 },
    { id: 'FEEDBACK_0',        name: 'FEEDBACK',        gx: 9,  gy: 8, color: '#9b59b6', items: [], maxQ: 1,  lockout: 0, flash: null, flashT: 0 },
    { id: 'SYNTHESIS_0',       name: 'SYNTHESIS',       gx: 6,  gy: 7, color: '#f0c040', items: [], maxQ: 3,  lockout: 0, flash: null, flashT: 0 },
  ]
}

const STATION_ICONS: Record<string, string> = {
  TEMPLATES: '📋', INTAKE: '❓', ANALYSIS: '🔬', COUNTER: '🧩',
  DELIVERY: '📤', FEEDBACK: '👔', COPILOT: '🤖', TRASH: '🗑️',
  SYNTHESIS: '📚', DATA_COLLECTION: '📊',
}

const STATION_LABELS: Record<string, string> = {
  DATA_COLLECTION: 'DATA', DELIVERY: 'SHAREOUT',
}

export function getStationIcon(name: string) { return STATION_ICONS[name] || '?' }
export function getStationLabel(name: string) { return STATION_LABELS[name] || name }

// ─── Store ───
interface GameState {
  // Game flow
  gamePhase: GamePhase
  currentLevel: number
  roundTimer: number
  countdownTimer: number
  score: number
  deliveries: number
  tipMultiplier: number  // Overcooked-style tip: bumps on in-order delivery, resets on wrong/expiry

  // Stations
  stations: Station[]

  // Players
  p1Carry: CarriedItem | null
  p2Carry: CarriedItem | null
  p1CharId: string
  p2CharId: string

  // Orders
  orders: Order[]
  orderTimer: number

  // Spawn timers
  rqSpawnTimer: number
  tmplSpawnTimer: number

  // Float texts
  floatTexts: FloatText[]
  nextFloatId: number

  // Multiplayer
  role: Role
  connected: boolean
  roomCode: string | null

  // Actions
  actions: {
    setPhase: (phase: GamePhase) => void
    setLevel: (level: number) => void
    resetGame: (level?: number) => void
    tick: (dt: number) => void
    interact: (playerIdx: number) => void
    setCarry: (playerIdx: number, item: CarriedItem | null) => void
    getCarry: (playerIdx: number) => CarriedItem | null
    setCharId: (playerIdx: number, charId: string) => void
    addFloat: (gx: number, gy: number, text: string, color: string, life: number) => void
    setRole: (role: Role) => void
    setConnected: (connected: boolean) => void
    setRoomCode: (code: string | null) => void
    getSerializedState: () => object
    applyRemoteState: (data: any) => void
  }
}

function findStation(stations: Station[], name: string) {
  return stations.find(s => s.name === name)
}
function findAllStations(stations: Station[], name: string) {
  return stations.filter(s => s.name === name)
}
function isStationActive(stationName: string, level: number) {
  const cfg = LEVELS[level]
  if (!cfg?.activeStations) return true
  return cfg.activeStations.includes(stationName)
}

function applyStationOverrides(stations: Station[], level: number) {
  // Restore originals
  for (const s of stations) {
    if (s._origGx !== undefined) { s.gx = s._origGx; s.gy = s._origGy! }
    else { s._origGx = s.gx; s._origGy = s.gy }
  }
  const cfg = LEVELS[level]
  if (!cfg?.stationOverrides) return
  for (const [name, positions] of Object.entries(cfg.stationOverrides)) {
    const instances = findAllStations(stations, name)
    for (let i = 0; i < Math.min(instances.length, positions.length); i++) {
      instances[i].gx = positions[i].gx
      instances[i].gy = positions[i].gy
    }
  }
}

function weightedRecipePick(orderList: string[]): string | null {
  if (!orderList || orderList.length === 0) return null
  // Weight lower-point recipes more heavily
  const weights = orderList.map(id => {
    const r = RECIPES[id]
    return r ? Math.max(1, 5 - r.points) : 1
  })
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < orderList.length; i++) {
    r -= weights[i]
    if (r <= 0) return orderList[i]
  }
  return orderList[orderList.length - 1]
}

function tryCombineCounter(counter: Station, level: number) {
  if (!counter.items || counter.items.length < 2) return false
  const cfg = LEVELS[level]
  if (!cfg?.orders) return false
  const hasTmpl = counter.items.some(i => i.t === 'TMPL')
  if (!hasTmpl) return false

  const pool = [...cfg.orders].sort((a, b) => (RECIPES[b]?.points || 0) - (RECIPES[a]?.points || 0))
  for (const recipeId of pool) {
    const rc = RECIPES[recipeId]
    if (!rc) continue
    const need = ['TMPL', ...rc.requires]
    const itemsCopy = counter.items.map(i => i.t)
    const consumed: string[] = []
    let ok = true
    for (const req of need) {
      const idx = itemsCopy.indexOf(req)
      if (idx < 0) { ok = false; break }
      itemsCopy[idx] = '__USED__'
      consumed.push(req)
    }
    if (!ok) continue
    // Remove consumed items
    for (const req of consumed) {
      const idx = counter.items.findIndex(i => i.t === req)
      if (idx >= 0) counter.items.splice(idx, 1)
    }
    counter.items.push({ t: 'DONE', recipe: recipeId, bonus: 0, p: false })
    counter.flash = '#4f4'
    counter.flashT = 0.5
    return true
  }
  return false
}

// Interaction distance in grid units
const IR = 1.8

export const useGameStore = create<GameState>((set, get) => ({
  gamePhase: 'menu',
  currentLevel: 1,
  roundTimer: 180,
  countdownTimer: 3.0,
  score: 0,
  deliveries: 0,
  tipMultiplier: 1,

  stations: createStations(),
  p1Carry: null,
  p2Carry: null,
  p1CharId: DEFAULT_P1_CHAR,
  p2CharId: DEFAULT_P2_CHAR,

  orders: [],
  orderTimer: 0,

  rqSpawnTimer: 0,
  tmplSpawnTimer: 0,

  floatTexts: [],
  nextFloatId: 0,

  role: null,
  connected: false,
  roomCode: null,

  actions: {
    setPhase: (phase) => set({ gamePhase: phase }),
    setLevel: (level) => set({ currentLevel: level }),

    resetGame: (level?: number) => {
      const state = get()
      const lvl = level !== undefined ? level : state.currentLevel
      const cfg = LEVELS[lvl]
      const stations = createStations()
      applyStationOverrides(stations, lvl)
      compileWalls(lvl)

      // Pre-stock stations
      const templates = findStation(stations, 'TEMPLATES')
      if (templates) {
        for (let i = 0; i < 3; i++) templates.items.push({ t: 'TMPL' })
      }
      const intake = findStation(stations, 'INTAKE')
      if (intake) {
        intake.items.push({ t: 'RQ', p: false })
      }

      set({
        currentLevel: lvl,
        score: 0,
        deliveries: 0,
        tipMultiplier: 1,
        roundTimer: cfg.roundDuration,
        countdownTimer: 3.0,
        gamePhase: 'countdown',
        stations,
        p1Carry: null,
        p2Carry: null,
        orders: [],
        orderTimer: 0,
        rqSpawnTimer: 0,
        tmplSpawnTimer: 0,
        floatTexts: [],
      })
    },

    tick: (dt: number) => {
      const state = get()
      if (state.gamePhase === 'countdown') {
        const newTimer = state.countdownTimer - dt
        if (newTimer <= -1) {
          set({ gamePhase: 'playing', countdownTimer: 0 })
        } else {
          set({ countdownTimer: newTimer })
        }
        return
      }
      if (state.gamePhase !== 'playing') return

      const cfg = LEVELS[state.currentLevel]
      const stations = state.stations
      let { score, roundTimer, orders, orderTimer, rqSpawnTimer, tmplSpawnTimer, floatTexts, nextFloatId, tipMultiplier } = state

      // Round timer
      roundTimer -= dt
      if (roundTimer <= 0) {
        set({ roundTimer: 0, gamePhase: 'gameover' })
        return
      }

      // RQ spawning at INTAKE
      rqSpawnTimer += dt
      const intake = findStation(stations, 'INTAKE')
      if (intake && isStationActive('INTAKE', state.currentLevel) && rqSpawnTimer >= RQ_SPAWN_INTERVAL && intake.items.length < RQ_MAX_QUEUE) {
        intake.items.push({ t: 'RQ', p: false })
        rqSpawnTimer = 0
      }

      // TMPL spawning at TEMPLATES
      tmplSpawnTimer += dt
      const templates = findStation(stations, 'TEMPLATES')
      if (templates && isStationActive('TEMPLATES', state.currentLevel) && tmplSpawnTimer >= TMPL_SPAWN_INTERVAL && templates.items.length < TMPL_MAX_QUEUE) {
        templates.items.push({ t: 'TMPL' })
        tmplSpawnTimer = 0
      }

      // DATA cook timers
      const dcStations = findAllStations(stations, 'DATA_COLLECTION')
      for (const dc of dcStations) {
        if (!isStationActive('DATA_COLLECTION', state.currentLevel)) continue
        for (const it of dc.items) {
          if (it.t !== 'DATA') continue
          const prev = it.ct || 0
          it.ct = prev + dt
          if (prev < DATA_COOK_TIME && it.ct >= DATA_COOK_TIME) {
            floatTexts.push({ id: nextFloatId++, gx: dc.gx, gy: dc.gy, text: 'Data ready!', color: '#4f4', life: 1.4, maxLife: 1.4 })
            dc.flash = '#4f4'; dc.flashT = 0.4
          } else if (prev < DATA_WARN_TIME && it.ct >= DATA_WARN_TIME) {
            floatTexts.push({ id: nextFloatId++, gx: dc.gx, gy: dc.gy, text: 'Going stale!', color: '#f0c040', life: 1.4, maxLife: 1.4 })
            dc.flash = '#f0c040'; dc.flashT = 0.4
          } else if (prev < DATA_STALE_TIME && it.ct >= DATA_STALE_TIME) {
            floatTexts.push({ id: nextFloatId++, gx: dc.gx, gy: dc.gy, text: 'Data stale!', color: '#f44', life: 1.4, maxLife: 1.4 })
            dc.flash = '#f44'; dc.flashT = 0.4
          }
        }
      }

      // Carried DATA items also tick
      const p1c = state.p1Carry
      const p2c = state.p2Carry
      if (p1c?.t === 'DATA') p1c.ct = (p1c.ct || 0) + dt
      if (p2c?.t === 'DATA') p2c.ct = (p2c.ct || 0) + dt

      // Order spawning
      orderTimer += dt
      const maxO = cfg.maxOrders || 3
      const limO = cfg.orderTimeLimit || 60
      if ((orders.length === 0 || orderTimer >= ORDER_INTERVAL) && orders.length < maxO) {
        const recipe = weightedRecipePick(cfg.orders)
        if (recipe) {
          orders.push({ id: Date.now() + Math.random(), recipe, timeLimit: limO, elapsed: 0 })
          orderTimer = 0
        }
      }

      // Order expiry
      for (let i = orders.length - 1; i >= 0; i--) {
        orders[i].elapsed += dt
        if (orders[i].elapsed >= orders[i].timeLimit) {
          score = Math.max(0, score - 1)
          floatTexts.push({ id: nextFloatId++, gx: 5, gy: 5, text: '-1 (expired)', color: '#cc8844', life: 1.2, maxLife: 1.2 })
          orders.splice(i, 1)
          tipMultiplier = 1  // expiry breaks the streak
        }
      }

      // Counter auto-combine
      for (const s of stations) {
        if (!isStationActive(s.name, state.currentLevel)) continue
        if (s.name === 'COUNTER') tryCombineCounter(s, state.currentLevel)
        if (s.flashT > 0) s.flashT -= dt
      }

      // Float text decay
      for (let i = floatTexts.length - 1; i >= 0; i--) {
        floatTexts[i].life -= dt
        if (floatTexts[i].life <= 0) floatTexts.splice(i, 1)
      }

      set({
        score, roundTimer, orders: [...orders], orderTimer, rqSpawnTimer, tmplSpawnTimer,
        stations: [...stations], floatTexts: [...floatTexts], nextFloatId,
        p1Carry: p1c, p2Carry: p2c, tipMultiplier,
      })
    },

    interact: (playerIdx: number) => {
      const state = get()
      if (state.gamePhase !== 'playing') return


      const ps = playerIdx === 0 ? playerState.p1 : playerState.p2
      const pgx = ps.x / TILE_SIZE
      const pgy = ps.z / TILE_SIZE
      const carry = playerIdx === 0 ? state.p1Carry : state.p2Carry
      const stations = state.stations

      // Find nearest station
      let nearest: Station | null = null
      let bestDist = Infinity
      for (const s of stations) {
        if (!isStationActive(s.name, state.currentLevel)) continue
        const dx = pgx - (s.gx + 0.5)
        const dy = pgy - (s.gy + 0.5)
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d >= IR) continue
        if (d < bestDist) { bestDist = d; nearest = s }
      }
      if (!nearest) return

      let { score, deliveries, orders, floatTexts, nextFloatId, p1Carry, p2Carry, tipMultiplier } = state
      const getCarry = () => playerIdx === 0 ? p1Carry : p2Carry
      const setCarry = (item: CarriedItem | null) => {
        if (playerIdx === 0) p1Carry = item; else p2Carry = item
      }
      const addFloat = (gx: number, gy: number, text: string, color: string, life: number) => {
        floatTexts.push({ id: nextFloatId++, gx, gy, text, color, life, maxLife: life })
      }

      // ── PICKUP (no carry) ──
      if (!getCarry()) {
        if (nearest.name === 'TEMPLATES') {
          if (nearest.items.length > 0) {
            nearest.items.pop()
            setCarry({ t: 'TMPL', recipe: null, bonus: 0 })
          } else {
            addFloat(nearest.gx, nearest.gy, '(empty)', '#888', 0.8)
          }
        } else if (nearest.name === 'INTAKE') {
          if (nearest.items.length > 0) {
            nearest.items.pop()
            setCarry({ t: 'RQ', recipe: null, bonus: 0 })
          } else {
            addFloat(nearest.gx, nearest.gy, '(no intake yet)', '#888', 0.8)
          }
        } else if (nearest.name === 'DATA_COLLECTION') {
          // Try pickup cooked data first
          let oldestIdx = -1, oldestCt = -1
          for (let i = 0; i < nearest.items.length; i++) {
            const it = nearest.items[i]
            if (it.t !== 'DATA') continue
            const ct = it.ct || 0
            if (ct >= DATA_COOK_TIME && ct > oldestCt) { oldestCt = ct; oldestIdx = i }
          }
          if (oldestIdx >= 0) {
            const it = nearest.items.splice(oldestIdx, 1)[0]
            setCarry({ t: 'DATA', recipe: null, bonus: 0, ct: it.ct || 0 })
            const msg = it.ct! >= DATA_STALE_TIME ? 'Stale!' : (it.ct! >= DATA_WARN_TIME ? 'Hurry!' : 'Fresh!')
            const col = it.ct! >= DATA_STALE_TIME ? '#f44' : (it.ct! >= DATA_WARN_TIME ? '#f0c040' : '#40a0e0')
            addFloat(nearest.gx, nearest.gy, msg, col, 0.8)
          } else if (nearest.items.length < (nearest.maxQ || DATA_MAX_QUEUE)) {
            // Start cooking
            nearest.items.push({ t: 'DATA', ct: 0 })
            addFloat(nearest.gx, nearest.gy, 'Collecting...', '#40a0e0', 0.8)
            nearest.flash = '#40a0e0'; nearest.flashT = 0.3
          } else {
            addFloat(nearest.gx, nearest.gy, '(still cooking)', '#888', 0.8)
          }
        } else if (nearest.name === 'COUNTER') {
          const doneIdx = nearest.items.findIndex(i => i.t === 'DONE')
          const idx = doneIdx >= 0 ? doneIdx : nearest.items.findIndex(i => !i.p)
          if (idx >= 0) {
            const it = nearest.items.splice(idx, 1)[0]
            setCarry({ t: it.t, recipe: it.recipe || null, bonus: it.bonus || 0, ct: it.ct })
          } else {
            addFloat(nearest.gx, nearest.gy, '(empty)', '#888', 0.8)
          }
        }
      }
      // ── DROP (with carry) ──
      else {
        const c = getCarry()!

        if (nearest.name === 'TRASH') {
          score = Math.max(0, score - 1)
          addFloat(nearest.gx, nearest.gy, '-1', '#cc8844', 1.2)
          nearest.flash = '#cc8844'; nearest.flashT = 0.4
          setCarry(null)
        } else if (nearest.name === 'DELIVERY') {
          if (c.t === 'DONE') {
            const rc = c.recipe ? RECIPES[c.recipe] : null
            const basePts = rc ? Math.max(0, rc.points + (c.bonus || 0)) : 1

            // Check if delivery matches the oldest open order — Overcooked tip mechanic
            const oldestMatch = c.recipe && orders.length > 0 && orders[0].recipe === c.recipe
            const anyMatch = c.recipe ? orders.findIndex(o => o.recipe === c.recipe) : -1

            let pts = basePts
            if (oldestMatch) {
              // Apply tip multiplier on top of base (x1 = no bonus, x2 = +100%, x3 = +200%, x4 = +300%)
              pts = basePts * tipMultiplier
              if (tipMultiplier > 1) {
                addFloat(nearest.gx, nearest.gy, `x${tipMultiplier} tip!`, '#ffd700', 1.4)
              }
              tipMultiplier = Math.min(4, tipMultiplier + 1)
              orders.shift()
            } else if (anyMatch >= 0) {
              // Out-of-order but still matches an order — resets the streak
              orders.splice(anyMatch, 1)
              tipMultiplier = 1
            } else {
              // No matching order — not a streak break, but no order fulfilled either
              tipMultiplier = 1
            }

            score += pts
            deliveries++
            addFloat(nearest.gx, nearest.gy, '+' + pts, '#4f4', 1.2)
            spawnCelebration(nearest.gx, nearest.gy)
            setCarry(null)
          } else {
            addFloat(nearest.gx, nearest.gy, 'Not ready', '#f44', 1.0)
            nearest.flash = '#f44'; nearest.flashT = 0.4
          }
        } else if (nearest.name === 'FEEDBACK') {
          // Boss feedback: apply +2 bonus to a DONE dish, once per dish
          if (c.t !== 'DONE') {
            addFloat(nearest.gx, nearest.gy, 'Need a deck', '#888', 0.8)
          } else if ((c.bonus || 0) > 0) {
            addFloat(nearest.gx, nearest.gy, 'Already reviewed', '#888', 0.8)
          } else {
            setCarry({ ...c, bonus: (c.bonus || 0) + 2 })
            addFloat(nearest.gx, nearest.gy, '+2 feedback!', '#9b59b6', 1.2)
            spawnCelebration(nearest.gx, nearest.gy)
            nearest.flash = '#9b59b6'; nearest.flashT = 0.6
          }
        } else if (nearest.name === 'COUNTER') {
          // Stale data penalty
          if (c.t === 'DATA' && (c.ct || 0) >= DATA_STALE_TIME) {
            score = Math.max(0, score - 1)
            addFloat(nearest.gx, nearest.gy, 'Stale data!', '#cc8844', 1.2)
            nearest.flash = '#cc8844'; nearest.flashT = 0.4
            setCarry(null)
          } else if (nearest.items.length >= (nearest.maxQ || 8)) {
            addFloat(nearest.gx, nearest.gy, 'Counter full!', '#f44', 1.0)
          } else {
            nearest.items.push({ t: c.t, recipe: c.recipe || null, bonus: c.bonus || 0, p: false })
            const sym = ITEMS[c.t]?.sym || '?'
            addFloat(nearest.gx, nearest.gy, '+' + sym, '#e0c040', 0.6)
            noteCounterDrop(c.t)
            setCarry(null)
          }
        }
      }

      set({
        score, deliveries, orders: [...orders], stations: [...stations],
        floatTexts: [...floatTexts], nextFloatId,
        p1Carry, p2Carry, tipMultiplier,
      })
    },

    setCarry: (playerIdx, item) => {
      if (playerIdx === 0) set({ p1Carry: item })
      else set({ p2Carry: item })
    },

    getCarry: (playerIdx) => {
      const state = get()
      return playerIdx === 0 ? state.p1Carry : state.p2Carry
    },

    setCharId: (playerIdx, charId) => {
      if (playerIdx === 0) set({ p1CharId: charId })
      else set({ p2CharId: charId })
    },

    addFloat: (gx, gy, text, color, life) => {
      set(state => ({
        floatTexts: [...state.floatTexts, { id: state.nextFloatId, gx, gy, text, color, life, maxLife: life }],
        nextFloatId: state.nextFloatId + 1,
      }))
    },

    setRole: (role) => set({ role }),
    setConnected: (connected) => set({ connected }),
    setRoomCode: (code) => set({ roomCode: code }),

    getSerializedState: () => {
      const s = get()

      return {
        p1: { ...playerState.p1, carry: s.p1Carry },
        p2: { ...playerState.p2, carry: s.p2Carry },
        sta: s.stations.map(st => ({ items: st.items, lockout: st.lockout, flash: st.flash, flashT: st.flashT })),
        score: s.score, deliveries: s.deliveries,
        gamePhase: s.gamePhase, roundTimer: s.roundTimer,
        countdownTimer: s.countdownTimer, currentLevel: s.currentLevel,
        orders: s.orders,
        floatTexts: s.floatTexts, nextFloatId: s.nextFloatId,
        tipMultiplier: s.tipMultiplier,
        p1CharId: s.p1CharId, p2CharId: s.p2CharId,
      }
    },

    applyRemoteState: (d: any) => {
      if (!d) return

      // Apply P1 position from host
      playerState.p1.x = d.p1.x; playerState.p1.y = d.p1.y; playerState.p1.z = d.p1.z
      playerState.p1.facing = d.p1.facing
      // Lerp P2 for guest
      const L = 0.4
      playerState.p2.x += (d.p2.x - playerState.p2.x) * L
      playerState.p2.z += (d.p2.z - playerState.p2.z) * L
      playerState.p2.facing = d.p2.facing

      const stations = get().stations
      d.sta.forEach((sd: any, i: number) => {
        if (stations[i]) {
          stations[i].items = sd.items
          if (sd.lockout !== undefined) stations[i].lockout = sd.lockout
          if (sd.flash !== undefined) stations[i].flash = sd.flash
          if (sd.flashT !== undefined) stations[i].flashT = sd.flashT
        }
      })

      set({
        p1Carry: d.p1.carry, p2Carry: d.p2.carry,
        score: d.score, deliveries: d.deliveries ?? get().deliveries,
        gamePhase: d.gamePhase ?? get().gamePhase,
        roundTimer: d.roundTimer ?? get().roundTimer,
        countdownTimer: d.countdownTimer ?? get().countdownTimer,
        currentLevel: d.currentLevel ?? get().currentLevel,
        orders: d.orders ?? get().orders,
        floatTexts: d.floatTexts ?? get().floatTexts,
        nextFloatId: d.nextFloatId ?? get().nextFloatId,
        tipMultiplier: d.tipMultiplier ?? get().tipMultiplier,
        p1CharId: d.p1CharId ?? get().p1CharId,
        p2CharId: d.p2CharId ?? get().p2CharId,
        stations: [...stations],
      })
    },
  },
}))

