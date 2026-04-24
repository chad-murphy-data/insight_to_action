import { Suspense, useRef, useEffect } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { OrthographicCamera } from '@react-three/drei'
import { useGameStore } from './store/gameStore'
import { LEVELS } from './data/levels'
import { GRID_COLS, GRID_ROWS, TILE_SIZE } from './data/constants'
import Kitchen from './components/Kitchen'
import Player from './components/Player'
import CarriedItems from './components/CarriedItem'
import Particles from './components/Particles'
import GameLoop from './components/GameLoop'
import HUD from './components/HUD'
import LobbyUI from './components/LobbyUI'
import GameOverScreen from './components/GameOverScreen'
import * as THREE from 'three'
import './App.css'

// Center of the grid (constant)
const cx = (GRID_COLS * TILE_SIZE) / 2
const cz = (GRID_ROWS * TILE_SIZE) / 2
const camDist = 22

function IsometricCamera() {
  const camRef = useRef<THREE.OrthographicCamera>(null!)
  const { size } = useThree()
  const deliveries = useGameStore(s => s.deliveries)
  const shakeRef = useRef(0)
  const prevDelRef = useRef(0)

  useEffect(() => {
    if (camRef.current) {
      camRef.current.lookAt(cx, 0, cz)
      camRef.current.updateProjectionMatrix()
    }
  }, [size])

  useEffect(() => {
    if (deliveries > prevDelRef.current) {
      shakeRef.current = 0.35  // seconds of shake
    }
    prevDelRef.current = deliveries
  }, [deliveries])

  useFrame((_, delta) => {
    if (!camRef.current) return
    const bx = cx + camDist, by = camDist, bz = cz + camDist
    if (shakeRef.current > 0) {
      const amp = Math.min(shakeRef.current, 0.35) * 1.4  // intensity falls off with time
      camRef.current.position.set(
        bx + (Math.random() - 0.5) * amp,
        by + (Math.random() - 0.5) * amp * 0.6,
        bz + (Math.random() - 0.5) * amp,
      )
      camRef.current.lookAt(cx, 0, cz)
      shakeRef.current -= delta
    } else if (shakeRef.current !== 0) {
      // Snap back once at end of shake
      camRef.current.position.set(bx, by, bz)
      camRef.current.lookAt(cx, 0, cz)
      shakeRef.current = 0
    }
  })

  return (
    <OrthographicCamera
      ref={camRef}
      makeDefault
      position={[cx + camDist, camDist, cz + camDist]}
      zoom={38}
      near={0.1}
      far={200}
    />
  )
}

function PhysicsWorld() {
  const currentLevel = useGameStore(s => s.currentLevel)
  const gamePhase = useGameStore(s => s.gamePhase)
  const cfg = LEVELS[currentLevel]
  const isInGame = gamePhase === 'playing' || gamePhase === 'countdown' || gamePhase === 'gameover'

  return (
    <Physics gravity={[0, -20, 0]}>
      <Kitchen />
      <Particles />
      {isInGame && (
        <>
          <Player
            index={0}
            color="#4488ff"
            startGx={cfg.spawnP1.gx}
            startGy={cfg.spawnP1.gy}
          />
          <Player
            index={1}
            color="#ff6644"
            startGx={cfg.spawnP2.gx}
            startGy={cfg.spawnP2.gy}
          />
          <CarriedItems />
        </>
      )}
      <GameLoop />
    </Physics>
  )
}

function Scene() {
  return (
    <>
      <IsometricCamera />
      <color attach="background" args={['#87CEEB']} />
      <fog attach="fog" args={['#87CEEB', 60, 120]} />
      <ambientLight intensity={0.75} />
      <directionalLight
        position={[cx + 10, 20, cz + 10]}
        intensity={0.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      {/* Fill light from opposite side */}
      <directionalLight
        position={[cx - 10, 10, cz - 10]}
        intensity={0.2}
      />
      <Suspense fallback={null}>
        <PhysicsWorld />
      </Suspense>
    </>
  )
}

export default function App() {
  return (
    <div id="game-container">
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
      >
        <Scene />
      </Canvas>
      <HUD />
      <LobbyUI />
      <GameOverScreen />
    </div>
  )
}
