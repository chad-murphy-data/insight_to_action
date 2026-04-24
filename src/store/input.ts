// Global keyboard state — shared between Player and GameLoop
export const keys: Record<string, boolean> = {}
export const justPressed: Record<string, boolean> = {}

// Deferred clear: mark keys for removal, actually delete next frame.
// This guarantees every press survives one full render cycle regardless
// of useFrame execution order (GameLoop vs Player).
let pendingClear: string[] = []

export function clearJustPressed() {
  for (const k of pendingClear) delete justPressed[k]
  pendingClear = Object.keys(justPressed)
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return
    const k = e.key.toLowerCase()
    if (!keys[k]) justPressed[k] = true
    keys[k] = true
  })
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false
  })
}
