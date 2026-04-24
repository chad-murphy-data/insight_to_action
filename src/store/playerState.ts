// Mutable frame-sync ref — updated every frame without triggering React re-renders
// Read directly by CarriedItem and other per-frame components
export const playerState = {
  p1: { x: 0, y: 0.5, z: 0, facing: 0 },
  p2: { x: 0, y: 0.5, z: 0, facing: 0 },
}
