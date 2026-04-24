import { useGameStore } from '../store/gameStore'
import { LEVELS } from '../data/levels'

export default function GameOverScreen() {
  const gamePhase = useGameStore(s => s.gamePhase)
  const score = useGameStore(s => s.score)
  const deliveries = useGameStore(s => s.deliveries)
  const currentLevel = useGameStore(s => s.currentLevel)
  const actions = useGameStore(s => s.actions)

  if (gamePhase !== 'gameover') return null

  const cfg = LEVELS[currentLevel]
  const thresholds = cfg.starThresholds
  const stars = score >= thresholds[3] ? 3 : score >= thresholds[2] ? 2 : score >= thresholds[1] ? 1 : 0

  const handleReplay = () => {
    actions.resetGame(currentLevel)
  }

  const handleMenu = () => {
    actions.setPhase('menu')
  }

  const handleNext = () => {
    const nextLevel = currentLevel + 1
    if (LEVELS[nextLevel]) {
      actions.setLevel(nextLevel)
      actions.resetGame(nextLevel)
    }
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      background: 'rgba(0,0,0,0.75)',
      fontFamily: "'Fredoka', 'Comic Sans MS', cursive",
      color: 'white',
    }}>
      <h1 style={{ fontSize: 48, margin: 0 }}>Time's Up!</h1>

      <div style={{ fontSize: 64, margin: '16px 0' }}>
        {'★'.repeat(stars)}{'☆'.repeat(3 - stars)}
      </div>

      <div style={{ fontSize: 24, marginBottom: 8 }}>
        Score: <span style={{ color: '#4f4', fontWeight: 900 }}>{score}</span>
      </div>
      <div style={{ fontSize: 16, color: '#aaa', marginBottom: 24 }}>
        {deliveries} dishes delivered
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={handleReplay} style={btnStyle('#4488ff')}>
          Replay
        </button>
        {LEVELS[currentLevel + 1] && (
          <button onClick={handleNext} style={btnStyle('#50b060')}>
            Next Level
          </button>
        )}
        <button onClick={handleMenu} style={btnStyle('#888')}>
          Menu
        </button>
      </div>
    </div>
  )
}

const btnStyle = (color: string): React.CSSProperties => ({
  padding: '12px 24px', borderRadius: 10, cursor: 'pointer',
  border: `2px solid ${color}`, background: `${color}33`,
  color: 'white', fontFamily: 'inherit', fontSize: 18, fontWeight: 700,
})
