import { useGameStore, type Station } from './gameStore'
import { playerState } from './playerState'
import { TILE_SIZE } from '../data/constants'

export interface TutorialState {
  active: boolean
  phase: number    // 1 | 2 | 3 (0 = inactive)
  step: number     // 1..N within a phase
  stepStart: number
  totalElapsed: number
  movementSeenP1: boolean
  movementSeenP2: boolean
  deliveriesAtStepStart: number
  dropsThisStep: Record<string, number>
  complete: boolean
}

export const tutorial: TutorialState = {
  active: false,
  phase: 0,
  step: 0,
  stepStart: 0,
  totalElapsed: 0,
  movementSeenP1: false,
  movementSeenP2: false,
  deliveriesAtStepStart: 0,
  dropsThisStep: {},
  complete: false,
}

// Prompts keyed "phase:step"
export const TUTORIAL_PROMPTS: Record<string, { both: string; p1?: string; p2?: string; solo?: string }> = {
  // Phase 1 — solo basics with first untimed order
  '1:1': { both: "Here's where you'll learn what type of deck you're building. See what pieces it needs? Let's go get them." },
  '1:2': { both: "Every great deck starts with a template — walk to TEMPLATES and grab one." },
  '1:3': { both: "Bring it to a counter — that's where decks come together." },
  '1:4': { both: "Now you'll need an intake question. Head to INTAKE and pick one up." },
  '1:5': { both: "Drop the intake on the same counter — watch what happens…" },
  '1:6': { both: "Boom — a finished deck! Pick it up and let's deliver it." },
  '1:7': { both: "Take it to SHAREOUT to land your first insight." },
  '1:8': { both: "Here's the catch — at Insight Kitchen you have to move fast. If a deck isn't delivered in time, it falls off the radar and you lose the credit." },
  '1:9': { both: "Nice work! Now let's bring in a teammate." },

  // Phase 2 — teamwork
  '2:1': {
    both: "Time to divide and conquer.",
    p1: "P1, you're on TEMPLATES.",
    p2: "P2, you're on INTAKE.",
    solo: "Flying solo? You'll cover both.",
  },
  '2:2': { both: "Drop your item on the counter — combine and conquer!" },
  '2:3': { both: "Grab the finished deck and share it out!" },
  '2:4': { both: "Beautiful teamwork." },

  // Phase 3 — data collection
  '3:1': { both: "Some recipes need data. Press SPACE at DATA_COLLECTION to start cooking." },
  '3:2': { both: "Give it a few seconds. Wait for READY, then grab it before it goes stale." },
  '3:3': { both: "Now we're cooking. Bring template, intake, AND data to a counter." },
  '3:4': { both: "Share out the full readout!" },
  '3:5': { both: "Tutorial complete. You're ready for the real thing." },
}

const PHASE_STEPS: Record<number, number> = { 1: 9, 2: 4, 3: 5 }

function isSolo(): boolean {
  const role = useGameStore.getState().role
  return role === null
}

export function startTutorial() {
  tutorial.active = true
  tutorial.phase = 1
  tutorial.step = 1
  tutorial.stepStart = 0
  tutorial.totalElapsed = 0
  tutorial.movementSeenP1 = false
  tutorial.movementSeenP2 = false
  tutorial.deliveriesAtStepStart = useGameStore.getState().deliveries
  tutorial.dropsThisStep = {}
  tutorial.complete = false
}

export function stopTutorial() {
  tutorial.active = false
  tutorial.phase = 0
  tutorial.step = 0
  tutorial.complete = false
}

function advanceTutorial() {
  tutorial.stepStart = 0
  tutorial.deliveriesAtStepStart = useGameStore.getState().deliveries
  tutorial.dropsThisStep = {}

  if (tutorial.step < (PHASE_STEPS[tutorial.phase] || 0)) {
    tutorial.step++
  } else if (tutorial.phase < 3) {
    tutorial.phase++
    tutorial.step = 1
  } else {
    tutorial.complete = true
    useGameStore.getState().actions.setPhase('gameover')
  }
}

function stepCheck(): boolean {
  const state = useGameStore.getState()
  const { phase: ph, step: st } = tutorial
  const solo = isSolo()
  const stations = state.stations
  const counters = stations.filter(s => s.name === 'COUNTER')
  const counterItems = counters.flatMap(c => c.items.map(i => i.t))

  // Player positions (in grid units for velocity check)
  const p1v = Math.abs(playerState.p1.x) + Math.abs(playerState.p1.z) > 0.1
  const p2v = Math.abs(playerState.p2.x) + Math.abs(playerState.p2.z) > 0.1

  if (ph === 1) {
    // 1:1 is the recipe-card intro — auto-advance after a read beat (player can roam during this).
    if (st === 1) return tutorial.stepStart > 4
    if (st === 2) return !!(solo ? state.p1Carry?.t === 'TMPL' : (state.p1Carry?.t === 'TMPL' || state.p2Carry?.t === 'TMPL'))
    if (st === 3) return counterItems.includes('TMPL')
    if (st === 4) return !!(solo ? state.p1Carry?.t === 'RQ' : (state.p1Carry?.t === 'RQ' || state.p2Carry?.t === 'RQ'))
    if (st === 5) return counterItems.includes('DONE')
    if (st === 6) return !!(solo ? state.p1Carry?.t === 'DONE' : (state.p1Carry?.t === 'DONE' || state.p2Carry?.t === 'DONE'))
    if (st === 7) return state.deliveries > tutorial.deliveriesAtStepStart
    // 1:8 is the timer-intro beat — gives the player time to read the new ticking timer.
    if (st === 8) return tutorial.stepStart > 5
    if (st === 9) return tutorial.stepStart > 2.5
  }
  // suppress unused-var warnings from old movement check
  void p1v; void p2v;
  if (ph === 2) {
    if (st === 1) return tutorial.stepStart > 3
    if (st === 2) return !!(tutorial.dropsThisStep.TMPL && tutorial.dropsThisStep.RQ)
    if (st === 3) return state.deliveries > tutorial.deliveriesAtStepStart
    if (st === 4) return tutorial.stepStart > 2.5
  }
  if (ph === 3) {
    if (st === 1) {
      const dc = stations.find(s => s.name === 'DATA_COLLECTION')
      return !!(dc && dc.items.some(i => i.t === 'DATA'))
    }
    if (st === 2) return !!(solo ? state.p1Carry?.t === 'DATA' : (state.p1Carry?.t === 'DATA' || state.p2Carry?.t === 'DATA'))
    if (st === 3) return !!(tutorial.dropsThisStep.TMPL && tutorial.dropsThisStep.RQ && tutorial.dropsThisStep.DATA)
    if (st === 4) return state.deliveries > tutorial.deliveriesAtStepStart
    if (st === 5) return tutorial.stepStart > 2.5
  }
  return false
}

export function tickTutorial(dt: number) {
  if (!tutorial.active) return
  if (useGameStore.getState().gamePhase !== 'playing') return
  tutorial.totalElapsed += dt
  tutorial.stepStart += dt
  if (stepCheck()) advanceTutorial()
}

// Called from station interaction when an item is dropped on a counter
export function noteCounterDrop(itemType: string) {
  if (!tutorial.active) return
  tutorial.dropsThisStep[itemType] = (tutorial.dropsThisStep[itemType] || 0) + 1
}
