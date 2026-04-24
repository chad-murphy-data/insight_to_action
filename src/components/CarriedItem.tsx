import { useRef, useEffect, Suspense } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text, useTexture } from '@react-three/drei'
import { playerState } from '../store/playerState'
import { useGameStore } from '../store/gameStore'
import { ITEMS } from '../data/items'
import { CARRY_SPRITES } from '../data/sprites'
import * as THREE from 'three'

// Preload carry sprites
Object.values(CARRY_SPRITES).forEach(path => useTexture.preload(path))

const CARRY_SIZE = 1.1  // cartoony-readable, Overcooked-style
const CARRY_Y_OFFSET = 0.85  // hand/chest height — in front of chef, not above head
const CARRY_FORWARD = 0.6    // how far out in front of the chef (world units)

function CarrySpriteImg({ path }: { path: string }) {
  const texture = useTexture(path)
  return (
    <Billboard>
      <mesh>
        <planeGeometry args={[CARRY_SIZE, CARRY_SIZE]} />
        <meshBasicMaterial map={texture} transparent />
      </mesh>
    </Billboard>
  )
}

function CarryFallback({ color, sym }: { color: string; sym: string }) {
  return (
    <>
      <mesh castShadow>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
      </mesh>
      <Billboard position={[0, 0.55, 0]}>
        <Text fontSize={0.4} color="white" anchorX="center" anchorY="middle"
          outlineWidth={0.03} outlineColor="black">
          {sym}
        </Text>
      </Billboard>
    </>
  )
}

function HeldItem({ playerIdx }: { playerIdx: number }) {
  const groupRef = useRef<THREE.Group>(null!)
  const carry = useGameStore(s => playerIdx === 0 ? s.p1Carry : s.p2Carry)
  const pickupT = useRef(99)   // pop timer (large = pop finished)
  const timeRef = useRef(0)
  const prevPosRef = useRef({ x: 0, z: 0 })

  // Reset pop animation any time the carry reference changes (pickup or FEEDBACK bump)
  useEffect(() => {
    if (carry) pickupT.current = 0
  }, [carry])

  useFrame((_, delta) => {
    if (!groupRef.current || !carry) return
    const ps = playerIdx === 0 ? playerState.p1 : playerState.p2

    // Movement detection
    const dx = ps.x - prevPosRef.current.x
    const dz = ps.z - prevPosRef.current.z
    const isMoving = Math.abs(dx) + Math.abs(dz) > 0.005
    prevPosRef.current = { x: ps.x, z: ps.z }

    timeRef.current += delta
    pickupT.current += delta

    // Pickup pop: 0 -> overshoot 1.15 -> settle 1.0 over ~0.25s
    let scale = 1
    if (pickupT.current < 0.25) {
      const t = pickupT.current / 0.25
      // ease-out-back style bounce
      scale = 0.4 + 0.75 * t + 0.1 * Math.sin(t * Math.PI)
    }

    // Walk bob (quick up/down) OR idle wobble (slow tilt)
    let bobY = 0
    let tilt = 0
    if (isMoving) {
      bobY = Math.abs(Math.sin(timeRef.current * 9)) * 0.09
    } else {
      bobY = Math.sin(timeRef.current * 2) * 0.04
      tilt = Math.sin(timeRef.current * 1.4) * 0.08
    }

    // Hold in front of the chef at hand height, Overcooked-style.
    // ps.facing = atan2(moveDir.x, moveDir.z), so forward vector is (sin, 0, cos).
    const fx = Math.sin(ps.facing)
    const fz = Math.cos(ps.facing)
    groupRef.current.position.set(
      ps.x + fx * CARRY_FORWARD,
      ps.y + CARRY_Y_OFFSET + bobY,
      ps.z + fz * CARRY_FORWARD,
    )
    groupRef.current.scale.setScalar(scale)
    groupRef.current.rotation.z = tilt
  })

  if (!carry) return null
  const itemDef = ITEMS[carry.t]
  const color = itemDef?.color || '#ffffff'
  const sym = itemDef?.sym || '?'
  const spritePath = CARRY_SPRITES[carry.t]

  return (
    <group ref={groupRef}>
      {spritePath ? (
        <Suspense fallback={<CarryFallback color={color} sym={sym} />}>
          <CarrySpriteImg path={spritePath} />
        </Suspense>
      ) : (
        <CarryFallback color={color} sym={sym} />
      )}
    </group>
  )
}

export default function CarriedItems() {
  return (
    <>
      <HeldItem playerIdx={0} />
      <HeldItem playerIdx={1} />
    </>
  )
}
