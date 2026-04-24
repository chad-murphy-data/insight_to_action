export interface WallDef {
  t: 'V' | 'H'
  x?: number
  y?: number
  y1?: number
  y2?: number
  x1?: number
  x2?: number
}

export interface LevelConfig {
  name: string
  subtitle: string
  orders: string[]
  activeStations: string[]
  synthesisActive: boolean
  roundDuration: number
  starThresholds: { 1: number; 2: number; 3: number }
  maxOrders: number
  orderTimeLimit: number
  isTutorial?: boolean
  walls: WallDef[]
  stationOverrides: Record<string, { gx: number; gy: number }[]>
  spawnP1: { gx: number; gy: number }
  spawnP2: { gx: number; gy: number }
}

export const LEVELS: Record<number, LevelConfig> = {
  0: {
    name: 'Tutorial',
    subtitle: 'The Onboarding',
    orders: ['STAT_SNAPSHOT', 'INSIGHT_REPORT'],
    activeStations: ['TEMPLATES', 'INTAKE', 'COUNTER', 'DELIVERY', 'TRASH', 'DATA_COLLECTION'],
    synthesisActive: false,
    roundDuration: 180,
    starThresholds: { 1: 2, 2: 3, 3: 5 },
    maxOrders: 2,
    orderTimeLimit: 60,
    isTutorial: true,
    walls: [],
    stationOverrides: {
      'TEMPLATES':       [{ gx: 3, gy: 2 }],
      'INTAKE':          [{ gx: 9, gy: 2 }],
      'DATA_COLLECTION': [{ gx: 9, gy: 5 }],
      'COUNTER':         [{ gx: 3, gy: 5 }, { gx: 7, gy: 7 }],
      'DELIVERY':        [{ gx: 3, gy: 8 }],
      'TRASH':           [{ gx: 6, gy: 4 }],
    },
    spawnP1: { gx: 4, gy: 4 },
    spawnP2: { gx: 7, gy: 4 },
  },
  1: {
    name: 'Level 1',
    subtitle: 'The Sprint',
    orders: ['STAT_SNAPSHOT', 'INSIGHT_REPORT'],
    activeStations: ['TEMPLATES', 'INTAKE', 'COUNTER', 'DELIVERY', 'TRASH', 'DATA_COLLECTION'],
    synthesisActive: false,
    roundDuration: 180,
    starThresholds: { 1: 3, 2: 5, 3: 7 },
    maxOrders: 3,
    orderTimeLimit: 75,
    walls: [
      { t: 'V', x: 6, y1: 2, y2: 8 },
    ],
    stationOverrides: {
      'TEMPLATES':       [{ gx: 2, gy: 3 }],
      'INTAKE':          [{ gx: 2, gy: 6 }],
      'DATA_COLLECTION': [{ gx: 9, gy: 3 }],
      'COUNTER':         [{ gx: 4, gy: 5 }, { gx: 8, gy: 5 }],
      'DELIVERY':        [{ gx: 9, gy: 7 }],
      'TRASH':           [{ gx: 5, gy: 1 }],
    },
    spawnP1: { gx: 3, gy: 4 },
    spawnP2: { gx: 8, gy: 4 },
  },
  2: {
    name: 'Level 2',
    subtitle: 'The Deep Dive',
    orders: ['STAT_SNAPSHOT', 'INSIGHT_REPORT'],
    activeStations: ['TEMPLATES', 'INTAKE', 'COUNTER', 'DELIVERY', 'TRASH', 'DATA_COLLECTION'],
    synthesisActive: false,
    roundDuration: 180,
    starThresholds: { 1: 3, 2: 5, 3: 8 },
    maxOrders: 3,
    orderTimeLimit: 75,
    walls: [
      { t: 'V', x: 5, y1: 0, y2: 4 },
      { t: 'V', x: 5, y1: 6, y2: 10 },
      { t: 'V', x: 7, y1: 0, y2: 4 },
      { t: 'V', x: 7, y1: 6, y2: 10 },
      { t: 'H', y: 4, x1: 5, x2: 7 },
      { t: 'H', y: 6, x1: 5, x2: 7 },
    ],
    stationOverrides: {
      'TEMPLATES':       [{ gx: 1, gy: 3 }],
      'INTAKE':          [{ gx: 1, gy: 6 }],
      'DATA_COLLECTION': [{ gx: 9, gy: 3 }],
      'COUNTER':         [{ gx: 3, gy: 5 }, { gx: 9, gy: 6 }],
      'DELIVERY':        [{ gx: 10, gy: 8 }],
      'TRASH':           [{ gx: 3, gy: 2 }],
    },
    spawnP1: { gx: 2, gy: 5 },
    spawnP2: { gx: 9, gy: 5 },
  },
  3: {
    name: 'Level 3',
    subtitle: 'The Framework',
    orders: ['STAT_SNAPSHOT', 'INSIGHT_REPORT'],
    activeStations: ['TEMPLATES', 'INTAKE', 'COUNTER', 'DELIVERY', 'TRASH', 'DATA_COLLECTION', 'FEEDBACK'],
    synthesisActive: false,
    roundDuration: 180,
    starThresholds: { 1: 2, 2: 4, 3: 6 },
    maxOrders: 3,
    orderTimeLimit: 75,
    walls: [
      { t: 'V', x: 4, y1: 2, y2: 7 },
      { t: 'V', x: 8, y1: 2, y2: 7 },
      { t: 'H', y: 7, x1: 4, x2: 8 },
    ],
    stationOverrides: {
      'TEMPLATES':       [{ gx: 1, gy: 2 }],
      'INTAKE':          [{ gx: 1, gy: 5 }],
      'DATA_COLLECTION': [{ gx: 6, gy: 3 }],
      'COUNTER':         [{ gx: 2, gy: 7 }, { gx: 10, gy: 5 }],
      'DELIVERY':        [{ gx: 10, gy: 8 }],
      'TRASH':           [{ gx: 10, gy: 2 }],
      'FEEDBACK':        [{ gx: 6, gy: 5 }],
    },
    spawnP1: { gx: 2, gy: 4 },
    spawnP2: { gx: 10, gy: 4 },
  },
}
