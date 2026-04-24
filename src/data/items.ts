export interface ItemDef {
  name: string
  color: string
  sym: string
}

export const ITEMS: Record<string, ItemDef> = {
  TMPL: { name: 'Deck Template',  color: '#aaaaaa', sym: '📋' },
  RQ:   { name: 'Intake',         color: '#88bbff', sym: '❓' },
  DATA: { name: 'Analyzed Data',  color: '#40a0e0', sym: '📊' },
  LIT:  { name: 'Lit Review',     color: '#f0c040', sym: '📚' },
  DONE: { name: 'Polished Deck',  color: '#50b060', sym: '✅' },
}

export interface CarriedItem {
  t: string          // item type key (TMPL, RQ, DATA, LIT, DONE)
  recipe: string | null
  bonus: number
  ct?: number        // cook time (DATA items)
}

export interface StationItem {
  t: string
  recipe?: string | null
  bonus?: number
  ct?: number        // cook timer for DATA
  p?: boolean        // processed flag
}
