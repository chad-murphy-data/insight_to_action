// Grid dimensions (matching original game)
export const GRID_COLS = 12
export const GRID_ROWS = 10
export const TILE_SIZE = 2 // world units per grid cell

// World dimensions
export const WORLD_WIDTH = GRID_COLS * TILE_SIZE  // 24
export const WORLD_DEPTH = GRID_ROWS * TILE_SIZE  // 20

// Player physics
export const PLAYER_SPEED = 8
export const PLAYER_RADIUS = 0.4

// Interaction
export const INTERACT_RANGE = 1.8 * TILE_SIZE // scaled from original IR=1.8

// Spawn intervals (seconds)
export const RQ_SPAWN_INTERVAL = 5
export const RQ_MAX_QUEUE = 3
export const TMPL_SPAWN_INTERVAL = 6
export const TMPL_MAX_QUEUE = 6
export const DATA_MAX_QUEUE = 3

// Data cook timings
export const DATA_COOK_TIME = 5
export const DATA_WARN_TIME = 10
export const DATA_STALE_TIME = 15

// Orders
export const ORDER_INTERVAL = 12

// Convert grid coordinates to 3D world position
export function gridToWorld(gx: number, gy: number): [number, number, number] {
  return [gx * TILE_SIZE, 0, gy * TILE_SIZE]
}

// Convert world position back to grid
export function worldToGrid(x: number, z: number): { gx: number; gy: number } {
  return { gx: x / TILE_SIZE, gy: z / TILE_SIZE }
}
