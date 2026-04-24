import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import { TILE_SIZE } from '../data/constants'
import * as THREE from 'three'

interface Particle {
  id: number
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  life: number; maxLife: number
  emoji: string; size: number
}

let nextId = 0
const particles: Particle[] = []
const EMOJIS = ['🎉', '⭐', '✨', '🎯', '💯', '🔥', '📊']

export function spawnCelebration(gx: number, gy: number) {
  const wx = (gx + 0.5) * TILE_SIZE
  const wz = (gy + 0.5) * TILE_SIZE
  for (let i = 0; i < 12; i++) {
    const life = 1 + Math.random() * 0.8
    particles.push({
      id: nextId++,
      x: wx, y: 1.5, z: wz,
      vx: (Math.random() - 0.5) * 6,
      vy: Math.random() * 4 + 2,
      vz: (Math.random() - 0.5) * 6,
      life, maxLife: life,
      emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
      size: 0.3 + Math.random() * 0.2,
    })
  }
}

export default function Particles() {
  const groupRef = useRef<THREE.Group>(null!)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.vy -= 6 * dt // gravity
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      p.life -= dt
      if (p.life <= 0) particles.splice(i, 1)
    }
  })

  return (
    <group ref={groupRef}>
      {particles.map(p => (
        <Billboard key={p.id} position={[p.x, p.y, p.z]}>
          <Text
            fontSize={p.size}
            anchorX="center"
            anchorY="middle"
            fillOpacity={Math.max(0, p.life / p.maxLife)}
          >
            {p.emoji}
          </Text>
        </Billboard>
      ))}
    </group>
  )
}
