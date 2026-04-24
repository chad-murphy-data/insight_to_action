import { useRef, useMemo, Suspense } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, BallCollider, type RapierRigidBody } from '@react-three/rapier'
import { Billboard, useTexture } from '@react-three/drei'
import { playerState } from '../store/playerState'
import { useGameStore } from '../store/gameStore'
import { keys, justPressed } from '../store/input'
import { botInput, isBotActive } from '../store/bot'
import { guestInput } from '../store/websocket'
import { CHARACTERS, getCharacter } from '../data/characters'
import { PLAYER_SPEED, TILE_SIZE } from '../data/constants'
import * as THREE from 'three'

// Preload every roster character so the sprite swap is instant when picked in the lobby.
CHARACTERS.forEach(c => useTexture.preload(c.sprite))

// ─── Sprite sheet constants ───
// Single-frame-per-direction mode: sheet is 60×448 (1 col × 4 rows).
// To go back to 8-frame walk cycle, set COLS = 8 and use a 480×448 sheet.
const COLS = 1    // animation frames per row (1 = no walk cycle, still pose only)
const ROWS = 4    // direction rows
const FW = 60     // frame pixel width
const FH = 112    // frame pixel height
const AFPS = 10   // animation frames per second

// Sprite display size in world units (aspect ratio preserved)
const SPRITE_H = 2.6
const SPRITE_W = SPRITE_H * (FW / FH)

// Direction rows: DL=0, UL=1, UR=2, DR=3
function facingToRow(facing: number): number {
  // facing = atan2(moveDir.x, moveDir.z)
  // Map to 4 isometric directions based on quadrant
  if (facing >= 0 && facing < Math.PI / 2) return 3       // DR (down-right, S key)
  if (facing >= Math.PI / 2) return 2                       // UR (up-right, D key)
  if (facing >= -Math.PI / 2 && facing < 0) return 0        // DL (down-left, A key)
  return 1                                                    // UL (up-left, W key)
}

// ─── Isometric movement directions ───
const ISO_UP    = new THREE.Vector3(-1, 0, -1).normalize()
const ISO_DOWN  = new THREE.Vector3( 1, 0,  1).normalize()
const ISO_LEFT  = new THREE.Vector3(-1, 0,  1).normalize()
const ISO_RIGHT = new THREE.Vector3( 1, 0, -1).normalize()

const ROTATION_SPEED = 10

// ─── Animated character sprite ───
function CharacterSprite({ index }: { index: number }) {
  const charId = useGameStore(s => index === 0 ? s.p1CharId : s.p2CharId)
  const path = getCharacter(charId).sprite
  const texture = useTexture(path)

  const clonedTexture = useMemo(() => {
    const t = texture.clone()
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = THREE.RepeatWrapping
    t.repeat.set(1 / COLS, 1 / ROWS)
    t.magFilter = THREE.NearestFilter
    t.minFilter = THREE.NearestFilter
    t.needsUpdate = true
    return t
  }, [texture])

  const frameRef = useRef(0)
  const timerRef = useRef(0)
  const prevPosRef = useRef({ x: 0, z: 0 })
  const billboardRef = useRef<THREE.Group>(null!)
  const idleRef = useRef(0)
  const walkRef = useRef(0)

  useFrame((_, delta) => {
    const ps = index === 0 ? playerState.p1 : playerState.p2

    // Detect movement from position delta
    const dx = ps.x - prevPosRef.current.x
    const dz = ps.z - prevPosRef.current.z
    const isMoving = Math.abs(dx) + Math.abs(dz) > 0.005
    prevPosRef.current = { x: ps.x, z: ps.z }

    // Animate walk cycle
    if (isMoving) {
      timerRef.current += delta
      if (timerRef.current > 1 / AFPS) {
        frameRef.current = (frameRef.current + 1) % COLS
        timerRef.current = 0
      }
      idleRef.current = 0
      walkRef.current += delta
    } else {
      frameRef.current = 0
      timerRef.current = 0
      idleRef.current += delta
      // Decay walk timer smoothly so tilt returns to zero, not a hard snap
      walkRef.current = Math.max(0, walkRef.current - delta * 3)
    }

    // Pick direction row from facing
    const row = facingToRow(ps.facing)
    clonedTexture.offset.set(
      frameRef.current / COLS,
      (ROWS - 1 - row) / ROWS,
    )

    // Scuttle: side-to-side tilt only (no vertical bob), blended with idle breathing height.
    if (billboardRef.current) {
      const idleBob  = isMoving ? 0 : Math.sin(idleRef.current * 2.2) * 0.04
      const walkTilt = Math.sin(walkRef.current * 10) * 0.14 * Math.min(1, walkRef.current * 4)
      billboardRef.current.position.y = SPRITE_H / 2 - 0.25 + idleBob
      billboardRef.current.rotation.z = walkTilt
    }
  })

  return (
    <Billboard ref={billboardRef} position={[0, SPRITE_H / 2 - 0.25, 0]}>
      <mesh>
        <planeGeometry args={[SPRITE_W, SPRITE_H]} />
        <meshBasicMaterial map={clonedTexture} transparent alphaTest={0.1} />
      </mesh>
    </Billboard>
  )
}

// ─── Ground shadow disc ───
function GroundShadow() {
  return (
    <mesh position={[0, -0.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.48, 24]} />
      <meshBasicMaterial color="#000000" transparent opacity={0.3} depthWrite={false} />
    </mesh>
  )
}

// ─── Fallback capsule mesh ───
function PlayerMesh({ color }: { color: string }) {
  return (
    <>
      <mesh position={[0, 0, 0]} castShadow>
        <capsuleGeometry args={[0.3, 0.5, 8, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.6, 0]} castShadow>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} />
      </mesh>
      <mesh position={[0, 0.3, 0.35]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color="white" />
      </mesh>
    </>
  )
}

interface PlayerProps {
  index: number
  color: string
  startGx: number
  startGy: number
}

export default function Player({ index, color, startGx, startGy }: PlayerProps) {
  const bodyRef = useRef<RapierRigidBody>(null!)
  const meshRef = useRef<THREE.Group>(null!)
  const facingRef = useRef(0)
  const actions = useGameStore(s => s.actions)
  const gamePhase = useGameStore(s => s.gamePhase)
  const role = useGameStore(s => s.role)

  const isP1 = index === 0
  const startX = (startGx + 0.5) * TILE_SIZE
  const startZ = (startGy + 0.5) * TILE_SIZE

  useFrame((_, delta) => {
    if (!bodyRef.current) return
    const dt = Math.min(delta, 0.05)

    let moveDir = new THREE.Vector3(0, 0, 0)
    let interact = false

    if (gamePhase === 'playing' || gamePhase === 'countdown') {
      let up = false, down = false, left = false, right = false
      let actPressed = false

      if (isP1) {
        if (role === null || role === 'host') {
          up = !!keys['w']; down = !!keys['s']; left = !!keys['a']; right = !!keys['d']
          actPressed = !!justPressed[' ']
        }
      } else {
        if (role === null && isBotActive()) {
          up = botInput.up; down = botInput.down
          left = botInput.left; right = botInput.right
          actPressed = botInput.act
          if (actPressed) botInput.act = false
        } else if (role === 'host') {
          up = guestInput.up; down = guestInput.down
          left = guestInput.left; right = guestInput.right
          actPressed = guestInput.act
          if (actPressed) guestInput.act = false
        } else if (role === 'guest') {
          up = !!keys['w']; down = !!keys['s']; left = !!keys['a']; right = !!keys['d']
          actPressed = !!justPressed[' ']
        } else {
          up = !!keys['i']; down = !!keys['k']; left = !!keys['j']; right = !!keys['l']
          actPressed = !!justPressed[';']
        }
      }

      if (up) moveDir.add(ISO_UP)
      if (down) moveDir.add(ISO_DOWN)
      if (left) moveDir.add(ISO_LEFT)
      if (right) moveDir.add(ISO_RIGHT)

      if (actPressed && gamePhase === 'playing') interact = true
    }

    // Apply movement
    if (moveDir.lengthSq() > 0) {
      moveDir.normalize().multiplyScalar(PLAYER_SPEED)
      bodyRef.current.setLinvel({ x: moveDir.x, y: 0, z: moveDir.z }, true)
      facingRef.current = Math.atan2(moveDir.x, moveDir.z)
    } else {
      const vel = bodyRef.current.linvel()
      bodyRef.current.setLinvel({ x: vel.x * 0.85, y: vel.y, z: vel.z * 0.85 }, true)
    }

    // Update mutable playerState ref
    const pos = bodyRef.current.translation()
    const ps = index === 0 ? playerState.p1 : playerState.p2
    ps.x = pos.x
    ps.y = pos.y
    ps.z = pos.z
    ps.facing = facingRef.current

    if (interact) actions.interact(index)
  })

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      position={[startX, 0.6, startZ]}
      linearDamping={4}
      angularDamping={10}
      lockRotations
      colliders={false}
    >
      <BallCollider args={[0.4]} />
      <group ref={meshRef}>
        <GroundShadow />
        <Suspense fallback={<PlayerMesh color={color} />}>
          <CharacterSprite index={index} />
        </Suspense>
      </group>
    </RigidBody>
  )
}
