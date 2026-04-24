import { useRef, useMemo, Suspense } from 'react'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import { useGameStore, getWallSegments, getStationLabel, getStationIcon } from '../store/gameStore'
import { GRID_COLS, GRID_ROWS, TILE_SIZE } from '../data/constants'
import { LEVELS } from '../data/levels'
import { Text, Billboard, useTexture } from '@react-three/drei'
import { STATION_SPRITES, CARRY_SPRITES } from '../data/sprites'
import * as THREE from 'three'

// Preload station + carry sprites
Object.values(STATION_SPRITES).forEach(path => useTexture.preload(path))
Object.values(CARRY_SPRITES).forEach(path => useTexture.preload(path))

// ─── Procedural wood texture ───
function createWoodTexture(): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Base wood color
  ctx.fillStyle = '#8B6914'
  ctx.fillRect(0, 0, size, size)

  // Wood grain lines
  for (let i = 0; i < 60; i++) {
    const y = Math.random() * size
    const h = 1 + Math.random() * 3
    const lightness = Math.random() > 0.5 ? 15 : -15
    const r = Math.min(255, Math.max(0, 139 + lightness + Math.random() * 20))
    const g = Math.min(255, Math.max(0, 105 + lightness + Math.random() * 15))
    const b = Math.min(255, Math.max(0, 20 + Math.random() * 10))
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(0, y, size, h)
  }

  // Plank divisions (darker lines)
  const plankWidth = size / 6
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = 'rgba(40, 25, 5, 0.4)'
    ctx.fillRect(i * plankWidth - 1, 0, 2, size)
  }

  // Subtle knots
  for (let i = 0; i < 4; i++) {
    const kx = Math.random() * size
    const ky = Math.random() * size
    const kr = 4 + Math.random() * 8
    const grad = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr)
    grad.addColorStop(0, 'rgba(60, 35, 10, 0.6)')
    grad.addColorStop(1, 'rgba(60, 35, 10, 0)')
    ctx.fillStyle = grad
    ctx.fillRect(kx - kr, ky - kr, kr * 2, kr * 2)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(GRID_COLS / 3, GRID_ROWS / 3)
  return tex
}

// ─── Floor ───
function Floor() {
  const width = GRID_COLS * TILE_SIZE
  const depth = GRID_ROWS * TILE_SIZE
  const woodTex = useMemo(() => createWoodTexture(), [])

  return (
    <RigidBody type="fixed" colliders="cuboid">
      <mesh position={[width / 2, -0.05, depth / 2]} receiveShadow>
        <boxGeometry args={[width, 0.1, depth]} />
        <meshStandardMaterial map={woodTex} roughness={0.8} />
      </mesh>
    </RigidBody>
  )
}

// ─── Grid lines (subtle, matches floor exactly) ───
function GridLines() {
  const width = GRID_COLS * TILE_SIZE
  const depth = GRID_ROWS * TILE_SIZE
  // Build line segments manually to avoid square gridHelper mismatch
  const points: THREE.Vector3[] = []
  // Vertical lines (along Z)
  for (let i = 0; i <= GRID_COLS; i++) {
    const x = i * TILE_SIZE
    points.push(new THREE.Vector3(x, 0.01, 0), new THREE.Vector3(x, 0.01, depth))
  }
  // Horizontal lines (along X)
  for (let j = 0; j <= GRID_ROWS; j++) {
    const z = j * TILE_SIZE
    points.push(new THREE.Vector3(0, 0.01, z), new THREE.Vector3(width, 0.01, z))
  }
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(points)
    return g
  }, [])

  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#5a4a3a" transparent opacity={0.3} />
    </lineSegments>
  )
}

// ─── Wall colors ───
const WALL_COLOR = '#e8dece'
const WALL_TRIM = '#c0b498'

// ─── Window on a wall ───
function WindowPane({ position, rotation }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation || [0, 0, 0]}>
      {/* Window frame */}
      <mesh>
        <boxGeometry args={[1.2, 1.0, 0.08]} />
        <meshStandardMaterial color="#6a5a40" />
      </mesh>
      {/* Glass */}
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[1.0, 0.8]} />
        <meshStandardMaterial color="#88bbdd" transparent opacity={0.4} emissive="#88bbdd" emissiveIntensity={0.15} />
      </mesh>
      {/* Cross bar horizontal */}
      <mesh position={[0, 0, 0.04]}>
        <boxGeometry args={[1.0, 0.04, 0.04]} />
        <meshStandardMaterial color="#6a5a40" />
      </mesh>
      {/* Cross bar vertical */}
      <mesh position={[0, 0, 0.04]}>
        <boxGeometry args={[0.04, 0.8, 0.04]} />
        <meshStandardMaterial color="#6a5a40" />
      </mesh>
    </group>
  )
}

// ─── Poster on a wall ───
function Poster({ position, rotation, color, label }: {
  position: [number, number, number]; rotation?: [number, number, number]
  color: string; label: string
}) {
  return (
    <group position={position} rotation={rotation || [0, 0, 0]}>
      {/* Poster backing */}
      <mesh>
        <planeGeometry args={[0.9, 1.1]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Poster text */}
      <Text position={[0, 0, 0.01]} fontSize={0.12} color="white"
        anchorX="center" anchorY="middle" outlineWidth={0.01} outlineColor="#000"
        maxWidth={0.75}>
        {label}
      </Text>
    </group>
  )
}

// ─── Boundary walls (decorative with windows/posters) ───
function BoundaryWalls() {
  const w = GRID_COLS * TILE_SIZE
  const d = GRID_ROWS * TILE_SIZE
  const wallH = 2.0
  const t = 0.3

  // Walls: north (back-left), south (front-right, viewer side), west (back-right), east (front-left)
  // Camera is at (+x, +y, +z) looking toward center, so south and east face the viewer
  const walls = [
    { id: 'north', pos: [w / 2, wallH / 2, -t / 2] as [number, number, number], size: [w + t * 2, wallH, t] as [number, number, number], facing: 'viewer-away' },
    { id: 'south', pos: [w / 2, wallH / 2, d + t / 2] as [number, number, number], size: [w + t * 2, wallH, t] as [number, number, number], facing: 'viewer' },
    { id: 'west', pos: [-t / 2, wallH / 2, d / 2] as [number, number, number], size: [t, wallH, d] as [number, number, number], facing: 'viewer-away' },
    { id: 'east', pos: [w + t / 2, wallH / 2, d / 2] as [number, number, number], size: [t, wallH, d] as [number, number, number], facing: 'viewer' },
  ]

  return (
    <>
      {walls.map((wall) => (
        <group key={wall.id}>
          {wall.facing === 'viewer' ? (
            /* Viewer-facing walls: explicit physics collider only, no mesh */
            <RigidBody type="fixed" colliders={false} position={wall.pos}>
              <CuboidCollider args={[wall.size[0] / 2, wall.size[1] / 2, wall.size[2] / 2]} />
            </RigidBody>
          ) : (
            /* Back walls: full visual */
            <>
              <RigidBody type="fixed" colliders="cuboid">
                <mesh position={wall.pos}>
                  <boxGeometry args={wall.size} />
                  <meshStandardMaterial color={WALL_COLOR} />
                </mesh>
              </RigidBody>
              {/* Baseboard trim */}
              <mesh position={[wall.pos[0], 0.1, wall.pos[2]]}>
                <boxGeometry args={[
                  wall.id === 'north' ? w + t * 2 : t + 0.1,
                  0.2,
                  wall.id === 'west' ? d : t + 0.1,
                ]} />
                <meshStandardMaterial color={WALL_TRIM} />
              </mesh>
            </>
          )}
        </group>
      ))}

      {/* Windows on north wall inner surface (z = 0.02) */}
      <WindowPane position={[w * 0.25, wallH * 0.55, 0.02]} rotation={[0, 0, 0]} />
      <WindowPane position={[w * 0.55, wallH * 0.55, 0.02]} rotation={[0, 0, 0]} />
      <WindowPane position={[w * 0.8, wallH * 0.55, 0.02]} rotation={[0, 0, 0]} />

      {/* Windows on west wall inner surface (x = 0.02) */}
      <WindowPane position={[0.02, wallH * 0.55, d * 0.25]} rotation={[0, Math.PI / 2, 0]} />
      <WindowPane position={[0.02, wallH * 0.55, d * 0.6]} rotation={[0, Math.PI / 2, 0]} />

      {/* Posters on north wall inner surface */}
      <Poster position={[w * 0.12, wallH * 0.5, 0.02]} color="#3a6a9a" label="Think Like a Scientist" />
      <Poster position={[w * 0.92, wallH * 0.55, 0.02]} color="#9a4a3a" label="Data Driven Decisions" />

      {/* Posters on west wall inner surface */}
      <Poster position={[0.02, wallH * 0.5, d * 0.85]} rotation={[0, Math.PI / 2, 0]} color="#4a8a5a" label="Collaborate & Iterate" />
    </>
  )
}

// ─── Outdoor environment ───
function OutdoorEnvironment() {
  const w = GRID_COLS * TILE_SIZE
  const d = GRID_ROWS * TILE_SIZE
  const groundExtent = 40

  return (
    <group>
      {/* Ground plane beyond kitchen */}
      <mesh position={[w / 2, -0.12, d / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w + groundExtent * 2, d + groundExtent * 2]} />
        <meshStandardMaterial color="#6ab04c" roughness={1} />
      </mesh>

      {/* Concrete path / sidewalk along back walls */}
      <mesh position={[w / 2, -0.1, -1.5]} receiveShadow>
        <boxGeometry args={[w + 6, 0.05, 3]} />
        <meshStandardMaterial color="#b0aa98" roughness={0.9} />
      </mesh>
      <mesh position={[-1.5, -0.1, d / 2]} receiveShadow>
        <boxGeometry args={[3, 0.05, d + 6]} />
        <meshStandardMaterial color="#b0aa98" roughness={0.9} />
      </mesh>

      {/* Trees behind north wall */}
      <Tree position={[-4, 0, -5]} scale={1.2} />
      <Tree position={[6, 0, -6]} scale={0.9} />
      <Tree position={[16, 0, -7]} scale={1.4} />
      <Tree position={[w + 2, 0, -5]} scale={1.0} />

      {/* Trees along west wall */}
      <Tree position={[-6, 0, 4]} scale={1.1} />
      <Tree position={[-7, 0, 14]} scale={1.3} />
      <Tree position={[-5, 0, d - 2]} scale={0.8} />

      {/* Bench behind north wall */}
      <Bench position={[w * 0.4, 0, -3.5]} />

      {/* Lamp posts */}
      <LampPost position={[-3, 0, -3]} />
      <LampPost position={[w + 3, 0, -3]} />

      {/* Bushes along front/viewer sides for softness */}
      <Bush position={[w + 3, 0, d * 0.3]} />
      <Bush position={[w + 4, 0, d * 0.7]} />
      <Bush position={[w * 0.3, 0, d + 3]} />
      <Bush position={[w * 0.7, 0, d + 3.5]} />
    </group>
  )
}

function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      {/* Trunk */}
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.2, 2.4, 8]} />
        <meshStandardMaterial color="#5a3a1a" />
      </mesh>
      {/* Canopy layers */}
      <mesh position={[0, 3.0, 0]} castShadow>
        <sphereGeometry args={[1.2, 8, 8]} />
        <meshStandardMaterial color="#4aad4a" flatShading />
      </mesh>
      <mesh position={[0.4, 3.5, 0.3]} castShadow>
        <sphereGeometry args={[0.8, 8, 8]} />
        <meshStandardMaterial color="#5abe5a" flatShading />
      </mesh>
      <mesh position={[-0.3, 3.3, -0.2]} castShadow>
        <sphereGeometry args={[0.7, 8, 8]} />
        <meshStandardMaterial color="#3d9940" flatShading />
      </mesh>
    </group>
  )
}

function Bush({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <sphereGeometry args={[0.6, 8, 6]} />
        <meshStandardMaterial color="#4aad4a" flatShading />
      </mesh>
      <mesh position={[0.4, 0.3, 0.2]} castShadow>
        <sphereGeometry args={[0.45, 8, 6]} />
        <meshStandardMaterial color="#3d9940" flatShading />
      </mesh>
    </group>
  )
}

function Bench({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Seat */}
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[1.8, 0.08, 0.5]} />
        <meshStandardMaterial color="#6a4a2a" />
      </mesh>
      {/* Back */}
      <mesh position={[0, 0.75, -0.2]} rotation={[0.1, 0, 0]}>
        <boxGeometry args={[1.8, 0.5, 0.06]} />
        <meshStandardMaterial color="#6a4a2a" />
      </mesh>
      {/* Legs */}
      {[-0.7, 0.7].map((x, i) => (
        <mesh key={i} position={[x, 0.22, 0]}>
          <boxGeometry args={[0.06, 0.44, 0.4]} />
          <meshStandardMaterial color="#444" />
        </mesh>
      ))}
    </group>
  )
}

function LampPost({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Pole */}
      <mesh position={[0, 2, 0]}>
        <cylinderGeometry args={[0.06, 0.08, 4, 8]} />
        <meshStandardMaterial color="#555" metalness={0.6} />
      </mesh>
      {/* Lamp head */}
      <mesh position={[0, 4.1, 0]}>
        <sphereGeometry args={[0.2, 8, 8]} />
        <meshStandardMaterial color="#ffe8a0" emissive="#ffe8a0" emissiveIntensity={0.5} />
      </mesh>
      {/* Subtle glow light */}
      <pointLight position={[0, 4, 0]} intensity={0.3} distance={8} color="#ffe8a0" />
    </group>
  )
}

// ─── Interior walls ───
function InteriorWalls() {
  const segments = getWallSegments()
  const h = 1.2
  const thickness = 0.15

  return (
    <>
      {segments.map((seg, i) => {
        let px: number, pz: number, sx: number, sz: number
        if (seg.t === 'V') {
          px = seg.x * TILE_SIZE
          pz = (seg.y + 0.5) * TILE_SIZE
          sx = thickness
          sz = TILE_SIZE
        } else {
          px = (seg.x + 0.5) * TILE_SIZE
          pz = seg.y * TILE_SIZE
          sx = TILE_SIZE
          sz = thickness
        }
        return (
          <RigidBody key={i} type="fixed" colliders="cuboid">
            <mesh position={[px, h / 2, pz]} castShadow>
              <boxGeometry args={[sx, h, sz]} />
              <meshStandardMaterial color="#5a4a6a" />
            </mesh>
          </RigidBody>
        )
      })}
    </>
  )
}

// ─── Station sprite billboard (grounded, shorter than player) ───
const STATION_SPRITE_SIZE = TILE_SIZE * 1.0

function StationSpriteImg({ path, flash, flashT }: { path: string; flash: string | null; flashT: number }) {
  const texture = useTexture(path)
  // Tint white normally; flash to the flash color while flashT > 0
  const tint = flashT > 0 && flash ? flash : '#ffffff'
  // anchorY bottom: sprite sits on ground (y = half height)
  return (
    <Billboard position={[0, STATION_SPRITE_SIZE * 0.5, 0]}>
      <mesh>
        <planeGeometry args={[STATION_SPRITE_SIZE, STATION_SPRITE_SIZE]} />
        <meshBasicMaterial map={texture} color={tint} transparent />
      </mesh>
    </Billboard>
  )
}

// ─── Counter item sprite (shows carry sprite on counter surface) ───
const COUNTER_ITEM_SIZE = 0.65

function CounterItemSprite({ path, position }: { path: string; position: [number, number, number] }) {
  const texture = useTexture(path)
  return (
    <Billboard position={position}>
      <mesh>
        <planeGeometry args={[COUNTER_ITEM_SIZE, COUNTER_ITEM_SIZE]} />
        <meshBasicMaterial map={texture} transparent />
      </mesh>
    </Billboard>
  )
}

// ─── Single station ───
function StationBox({ name, gx, gy, color, items, flash, flashT }: {
  name: string; gx: number; gy: number; color: string
  items: any[]; flash: string | null; flashT: number
}) {
  const cx = (gx + 0.5) * TILE_SIZE
  const cz = (gy + 0.5) * TILE_SIZE
  const icon = getStationIcon(name)
  const label = getStationLabel(name)
  const spritePath = STATION_SPRITES[name]
  const displayColor = flashT > 0 && flash ? flash : color
  const itemCount = items.length

  return (
    <group position={[cx, 0, cz]}>
      {/* Invisible physics collider only — no visible platform */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[TILE_SIZE * 0.4, 0.5, TILE_SIZE * 0.4]} position={[0, 0.5, 0]} />
      </RigidBody>

      {/* Station sprite */}
      {spritePath && (
        <Suspense fallback={null}>
          <StationSpriteImg path={spritePath} flash={flash} flashT={flashT} />
        </Suspense>
      )}

      {/* Label */}
      <Billboard position={[0, STATION_SPRITE_SIZE * 0.85, 0]}>
        <Text fontSize={0.35} color="white" anchorX="center" anchorY="middle" outlineWidth={0.03} outlineColor="black">
          {icon} {label}
        </Text>
      </Billboard>

      {/* Item count badge */}
      {itemCount > 0 && name !== 'COUNTER' && (
        <Billboard position={[0.7, STATION_SPRITE_SIZE * 0.7, 0.7]}>
          <Text fontSize={0.25} color="#fff" anchorX="center" anchorY="middle"
            outlineWidth={0.04} outlineColor="#000">
            {itemCount}
          </Text>
        </Billboard>
      )}

      {/* Counter items — show carry sprites sitting on top */}
      {name === 'COUNTER' && items.map((item, i) => {
        const sprPath = CARRY_SPRITES[item.t]
        // Spread items in a row on top of counter sprite
        const offsetX = (i - (items.length - 1) / 2) * 0.55
        const yPos = STATION_SPRITE_SIZE * 0.65
        if (sprPath) {
          return (
            <Suspense key={i} fallback={null}>
              <CounterItemSprite path={sprPath} position={[offsetX, yPos, 0]} />
            </Suspense>
          )
        }
        // Fallback colored cube
        return (
          <mesh key={i} position={[offsetX, yPos, 0]}>
            <boxGeometry args={[0.25, 0.25, 0.25]} />
            <meshStandardMaterial color={
              item.t === 'TMPL' ? '#aaa' : item.t === 'RQ' ? '#88bbff' :
              item.t === 'DATA' ? '#40a0e0' : item.t === 'LIT' ? '#f0c040' :
              item.t === 'DONE' ? '#50b060' : '#fff'
            } />
          </mesh>
        )
      })}

      {/* DATA_COLLECTION progress bars */}
      {name === 'DATA_COLLECTION' && items.map((item, i) => {
        if (item.t !== 'DATA' || !item.ct) return null
        const progress = Math.min(item.ct / 5, 1)
        const barColor = item.ct >= 15 ? '#f44' : item.ct >= 10 ? '#f0c040' : item.ct >= 5 ? '#4f4' : '#40a0e0'
        return (
          <mesh key={i} position={[0, 0.3 + i * 0.15, 0]}>
            <boxGeometry args={[TILE_SIZE * 0.7 * progress, 0.08, 0.08]} />
            <meshStandardMaterial color={barColor} />
          </mesh>
        )
      })}
    </group>
  )
}

// ─── All stations ───
function Stations() {
  const stations = useGameStore(s => s.stations)
  const currentLevel = useGameStore(s => s.currentLevel)
  const activeStations = LEVELS[currentLevel]?.activeStations

  return (
    <>
      {stations.map(s => {
        if (activeStations && !activeStations.includes(s.name)) return null
        return (
          <StationBox
            key={s.id}
            name={s.name}
            gx={s.gx}
            gy={s.gy}
            color={s.color}
            items={s.items}
            flash={s.flash}
            flashT={s.flashT}
          />
        )
      })}
    </>
  )
}

// ─── Float texts ───
function FloatTexts() {
  const floatTexts = useGameStore(s => s.floatTexts)
  return (
    <>
      {floatTexts.map(ft => {
        const wx = (ft.gx + 0.5) * TILE_SIZE
        const wz = (ft.gy + 0.5) * TILE_SIZE
        const progress = 1 - ft.life / ft.maxLife
        const y = 2.5 + progress * 1.5
        return (
          <Billboard key={ft.id} position={[wx, y, wz]}>
            <Text fontSize={0.3} color={ft.color} anchorX="center" anchorY="middle"
              outlineWidth={0.03} outlineColor="#000" fillOpacity={ft.life / ft.maxLife}>
              {ft.text}
            </Text>
          </Billboard>
        )
      })}
    </>
  )
}

// ─── Kitchen root ───
export default function Kitchen() {
  return (
    <>
      <OutdoorEnvironment />
      <Floor />
      <GridLines />
      <BoundaryWalls />
      <InteriorWalls />
      <Stations />
      <FloatTexts />
    </>
  )
}
