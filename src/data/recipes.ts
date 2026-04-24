export interface Recipe {
  name: string
  points: number
  color: string
  emoji: string
  requires: string[]
  level: number
  needsFeedback?: boolean
  rainbow?: boolean
}

export const RECIPES: Record<string, Recipe> = {
  STAT_SNAPSHOT: {
    name: 'Stat Snapshot', points: 1, color: '#88bbff', emoji: '📈',
    requires: ['RQ'], level: 1,
  },
  INSIGHT_REPORT: {
    name: 'Insight Report', points: 2, color: '#f0c040', emoji: '📊',
    requires: ['RQ', 'DATA'], level: 1,
  },
  DEEP_DIVE: {
    name: 'Deep Dive', points: 3, color: '#ff8c42', emoji: '🧠',
    requires: ['RQ', 'DATA', 'LIT'], level: 2,
  },
  THE_FRAMEWORK: {
    name: 'The Framework', points: 4, color: '#d4a843', emoji: '🦄',
    requires: ['RQ', 'DATA', 'LIT'], level: 2, needsFeedback: true,
    rainbow: true,
  },
}
