import { useGameStore, getWallEdges } from './gameStore'
import { playerState } from './playerState'
import { GRID_COLS, GRID_ROWS, TILE_SIZE } from '../data/constants'
import { LEVELS } from '../data/levels'

let botInterval: ReturnType<typeof setInterval> | null = null
let botActive = false
let botState = 'IDLE'
let botActCooldown = 0
let botWaypoint: { gx: number; gy: number } | null = null

// Guest input driven by the bot (same structure as WebSocket guest input)
export const botInput = { up: false, down: false, left: false, right: false, act: false }

export function isBotActive() { return botActive }

export function startBot() {
  if (botInterval) clearInterval(botInterval)
  botActive = true
  botActCooldown = 0
  botInterval = setInterval(botThink, 50)
}

export function stopBot() {
  if (botInterval) { clearInterval(botInterval); botInterval = null }
  botActive = false
  botInput.up = botInput.down = botInput.left = botInput.right = botInput.act = false
}

function gd(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)
}

function botThink() {
  if (!botActive) return
  botInput.up = botInput.down = botInput.left = botInput.right = botInput.act = false

  const state = useGameStore.getState()
  if (state.gamePhase !== 'playing') return
  if (botActCooldown > 0) botActCooldown -= 50

  // Bot controls P2 — get its grid position
  const p2gx = playerState.p2.x / TILE_SIZE
  const p2gy = playerState.p2.z / TILE_SIZE
  const p2Carry = state.p2Carry
  const stations = state.stations
  const activeStations = LEVELS[state.currentLevel]?.activeStations

  const find = (name: string) => stations.find(s => s.name === name && (!activeStations || activeStations.includes(s.name)))
  const findAll = (name: string) => stations.filter(s => s.name === name && (!activeStations || activeStations.includes(s.name)))

  const prevState = botState
  const tm = find('TEMPLATES')
  const intake = find('INTAKE')
  const counters = findAll('COUNTER')
  const del = find('DELIVERY')
  const nearC = counters.sort((a, b) => gd(p2gx, p2gy, a.gx + 0.5, a.gy + 0.5) - gd(p2gx, p2gy, b.gx + 0.5, b.gy + 0.5))[0]
  const doneC = counters.find(c => c.items.some(i => i.t === 'DONE'))
  const anyHasTmpl = counters.some(c => c.items.some(i => i.t === 'TMPL'))
  const anyHasRq = counters.some(c => c.items.some(i => i.t === 'RQ'))

  if (p2Carry) {
    if (p2Carry.t === 'DONE') {
      botState = 'DELIVER'
      if (del) botNavigate(del.gx + 0.5, del.gy + 0.5, p2gx, p2gy)
    } else {
      botState = 'DROP_AT_COUNTER'
      if (nearC) botNavigate(nearC.gx + 0.5, nearC.gy + 0.5, p2gx, p2gy)
    }
  } else {
    if (doneC) {
      botState = 'PICKUP_DONE'
      botNavigate(doneC.gx + 0.5, doneC.gy + 0.5, p2gx, p2gy)
    } else if (!anyHasTmpl && tm && tm.items.length > 0) {
      botState = 'FETCH_TMPL'
      botNavigate(tm.gx + 0.5, tm.gy + 0.5, p2gx, p2gy)
    } else if (!anyHasRq && intake && intake.items.length > 0) {
      botState = 'FETCH_RQ'
      botNavigate(intake.gx + 0.5, intake.gy + 0.5, p2gx, p2gy)
    } else {
      botState = 'IDLE'
      if (nearC) {
        const idleDist = gd(p2gx, p2gy, nearC.gx + 1.3, nearC.gy + 0.5)
        if (idleDist > 1.5) botNavigate(nearC.gx + 1.3, nearC.gy + 0.5, p2gx, p2gy)
      }
    }
  }

  if (prevState !== botState) botWaypoint = null
}

// Wall gap finders
function botVGap(wx: number, fy: number): number {
  const wallEdges = getWallEdges()
  let u = -1, d = -1
  for (let y = fy - 1; y >= 0; y--) { if (!wallEdges.has(`V:${wx}:${y}`)) { u = y; break } }
  for (let y = fy + 1; y < GRID_ROWS; y++) { if (!wallEdges.has(`V:${wx}:${y}`)) { d = y; break } }
  if (u < 0 && d < 0) return -1
  if (u < 0) return d
  if (d < 0) return u
  return (fy - u) <= (d - fy) ? u : d
}

function botHGap(wy: number, fx: number): number {
  const wallEdges = getWallEdges()
  let l = -1, r = -1
  for (let x = fx - 1; x >= 0; x--) { if (!wallEdges.has(`H:${x}:${wy}`)) { l = x; break } }
  for (let x = fx + 1; x < GRID_COLS; x++) { if (!wallEdges.has(`H:${x}:${wy}`)) { r = x; break } }
  if (l < 0 && r < 0) return -1
  if (l < 0) return r
  if (r < 0) return l
  return (fx - l) <= (r - fx) ? l : r
}

function botNavigate(tx: number, ty: number, bx: number, by: number) {
  const wallEdges = getWallEdges()
  const MN = 0.3, MX = GRID_COLS - 0.7, MY = GRID_ROWS - 0.7
  tx = Math.max(MN + 0.1, Math.min(MX - 0.1, tx))
  ty = Math.max(MN + 0.1, Math.min(MY - 0.1, ty))

  // Wall avoidance
  if (wallEdges.size > 0 && !botWaypoint) {
    const btx = Math.floor(bx), bty = Math.floor(by)
    const ttx = Math.floor(tx)
    if (Math.abs(tx - bx) > 0.3) {
      const step = tx > bx ? 1 : -1
      const startX = step > 0 ? btx + 1 : btx
      const endX = step > 0 ? ttx + 1 : ttx
      for (let wx = startX; step > 0 ? wx <= endX : wx >= endX; wx += step) {
        if (wallEdges.has(`V:${wx}:${bty}`)) {
          const g = botVGap(wx, bty)
          if (g >= 0) botWaypoint = { gx: step > 0 ? wx + 0.5 : wx - 0.5, gy: g + 0.5 }
          break
        }
      }
    }
    if (!botWaypoint && Math.abs(ty - by) > 0.3) {
      const tty = Math.floor(ty)
      const step = ty > by ? 1 : -1
      const startY = step > 0 ? Math.floor(by) + 1 : Math.floor(by)
      const endY = step > 0 ? tty + 1 : tty
      for (let wy = startY; step > 0 ? wy <= endY : wy >= endY; wy += step) {
        if (wallEdges.has(`H:${btx}:${wy}`)) {
          const g = botHGap(wy, btx)
          if (g >= 0) botWaypoint = { gx: g + 0.5, gy: step > 0 ? wy + 0.5 : wy - 0.5 }
          break
        }
      }
    }
  }

  if (botWaypoint) {
    const wd = Math.sqrt((botWaypoint.gx - bx) ** 2 + (botWaypoint.gy - by) ** 2)
    if (wd < 0.5) { botWaypoint = null }
    else { tx = botWaypoint.gx; ty = botWaypoint.gy }
  }

  const dx = tx - bx
  const dy = ty - by
  const dist = Math.sqrt(dx * dx + dy * dy)

  if (dist < 0.8 && !botWaypoint) {
    if (botActCooldown <= 0) { botInput.act = true; botActCooldown = 300 }
    return
  }

  // ISO mapping: UP→(-gx,-gy), DOWN→(+gx,+gy), LEFT→(-gx,+gy), RIGHT→(+gx,-gy)
  const T = 0.1
  if (-dx - dy > T) botInput.up = true
  if (dx + dy > T) botInput.down = true
  if (-dx + dy > T) botInput.left = true
  if (dx - dy > T) botInput.right = true
}
