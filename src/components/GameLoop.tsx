import { useFrame } from '@react-three/fiber'
import { useGameStore } from '../store/gameStore'
import { clearJustPressed } from '../store/input'
import { tickTutorial, tutorial, startTutorial, stopTutorial } from '../store/tutorial'
import { sendState, sendInput } from '../store/websocket'
import { startBot, stopBot, isBotActive } from '../store/bot'

export default function GameLoop() {
  const actions = useGameStore(s => s.actions)
  const role = useGameStore(s => s.role)
  const gamePhase = useGameStore(s => s.gamePhase)
  const currentLevel = useGameStore(s => s.currentLevel)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)

    // Bot management (solo mode)
    if (role === null && gamePhase === 'playing' && !isBotActive()) {
      startBot()
    }
    if (gamePhase !== 'playing' && gamePhase !== 'countdown' && isBotActive()) {
      stopBot()
    }

    // Tutorial management (level 0)
    if (currentLevel === 0 && gamePhase === 'playing' && !tutorial.active && !tutorial.complete) {
      startTutorial()
    }
    if (gamePhase !== 'playing' && tutorial.active) {
      stopTutorial()
    }

    // Only host (or solo) runs the simulation
    if (role !== 'guest') {
      actions.tick(dt)
      tickTutorial(dt)
    }

    // WebSocket sync
    if (role === 'host') sendState()
    if (role === 'guest') sendInput()

    clearJustPressed()
  })

  return null
}
