import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { LEVELS } from '../data/levels'
import { CHARACTERS } from '../data/characters'
import { connectWS } from '../store/websocket'

export default function LobbyUI() {
  const gamePhase = useGameStore(s => s.gamePhase)
  const actions = useGameStore(s => s.actions)
  const role = useGameStore(s => s.role)
  const roomCode = useGameStore(s => s.roomCode)
  const currentLevel = useGameStore(s => s.currentLevel)
  const p1CharId = useGameStore(s => s.p1CharId)
  const p2CharId = useGameStore(s => s.p2CharId)

  const [status, setStatus] = useState('')
  const [joinCode, setJoinCode] = useState('')

  if (gamePhase !== 'menu' && gamePhase !== 'lobby') return null

  const handleCreate = async () => {
    try {
      const ws = await connectWS(setStatus)
      actions.setRole('host')
      actions.setPhase('lobby')
      ws.send(JSON.stringify({ type: 'create' }))
    } catch { /* status already set */ }
  }

  const handleJoin = async () => {
    if (!joinCode.trim()) return
    try {
      const ws = await connectWS(setStatus)
      actions.setPhase('lobby')
      ws.send(JSON.stringify({ type: 'join', code: joinCode.trim().toUpperCase() }))
    } catch { /* status already set */ }
  }

  const handleSolo = () => {
    actions.resetGame(currentLevel)
  }

  const levelKeys = Object.keys(LEVELS).map(Number)

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      fontFamily: "'Fredoka', 'Comic Sans MS', cursive",
      color: 'white',
    }}>
      <h1 style={{ fontSize: 52, margin: 0, textShadow: '0 0 30px rgba(100,150,255,0.5)' }}>
        Insight Kitchen
      </h1>
      <p style={{ fontSize: 18, color: '#aaa', margin: '8px 0 30px' }}>
        A BeSci Overcooked
      </p>

      {/* Level select */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {levelKeys.map(lvl => (
          <button key={lvl} onClick={() => actions.setLevel(lvl)} style={{
            padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
            border: currentLevel === lvl ? '2px solid #4488ff' : '2px solid #555',
            background: currentLevel === lvl ? '#4488ff33' : '#333',
            color: 'white', fontFamily: 'inherit', fontSize: 14,
          }}>
            {LEVELS[lvl].name}
          </button>
        ))}
      </div>

      {/* Character picker */}
      <div style={{ marginBottom: 18, textAlign: 'center' }}>
        <CharacterPickerRow
          label="P1"
          accentColor="#4488ff"
          selectedId={p1CharId}
          onPick={id => actions.setCharId(0, id)}
        />
        <CharacterPickerRow
          label="P2"
          accentColor="#ff6644"
          selectedId={p2CharId}
          onPick={id => actions.setCharId(1, id)}
        />
      </div>

      {gamePhase === 'menu' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <button onClick={handleSolo} style={btnStyle('#4488ff')}>
            Solo / Local Co-op
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleCreate} style={btnStyle('#50b060')}>
              Host Online Game
            </button>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
                placeholder="Code"
                maxLength={4}
                style={{
                  width: 70, padding: '8px 12px', borderRadius: 8,
                  border: '2px solid #555', background: '#222', color: 'white',
                  fontFamily: 'inherit', fontSize: 16, textTransform: 'uppercase',
                  textAlign: 'center',
                }}
              />
              <button onClick={handleJoin} style={btnStyle('#f0c040')}>
                Join
              </button>
            </div>
          </div>
        </div>
      )}

      {gamePhase === 'lobby' && (
        <div style={{ textAlign: 'center' }}>
          {roomCode && (
            <div style={{
              fontSize: 48, fontWeight: 900, letterSpacing: 12,
              background: '#222', padding: '10px 30px', borderRadius: 12,
              border: '3px solid #4488ff', marginBottom: 16,
            }}>
              {roomCode}
            </div>
          )}
          <p style={{ color: '#aaa', fontSize: 14 }}>{status}</p>
        </div>
      )}

      {status && gamePhase === 'menu' && (
        <p style={{ color: '#f44', fontSize: 14, marginTop: 10 }}>{status}</p>
      )}
    </div>
  )
}

const btnStyle = (color: string): React.CSSProperties => ({
  padding: '12px 24px', borderRadius: 10, cursor: 'pointer',
  border: `2px solid ${color}`, background: `${color}33`,
  color: 'white', fontFamily: 'inherit', fontSize: 16, fontWeight: 700,
  transition: 'background 0.2s',
})

// ─── Character picker row (one per player) ───
// Each thumbnail is a 60×112 CSS-cropped view of the DR row (y=336..448) of the 60×448 sprite sheet.
function CharacterPickerRow({
  label, accentColor, selectedId, onPick,
}: {
  label: string; accentColor: string; selectedId: string;
  onPick: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, margin: '6px 0' }}>
      <div style={{
        width: 32, fontSize: 16, fontWeight: 800, color: accentColor,
        textShadow: `0 0 8px ${accentColor}88`,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 480 }}>
        {CHARACTERS.map(char => {
          const selected = char.id === selectedId
          return (
            <button
              key={char.id}
              onClick={() => onPick(char.id)}
              title={char.name}
              style={{
                width: 72, height: 120, padding: 0, cursor: 'pointer',
                border: `3px solid ${selected ? accentColor : '#444'}`,
                borderRadius: 10,
                background: selected
                  ? `linear-gradient(180deg, ${accentColor}44 0%, #222 100%)`
                  : '#222',
                boxShadow: selected ? `0 0 14px ${accentColor}aa` : 'none',
                transform: selected ? 'translateY(-2px)' : 'none',
                transition: 'transform 0.12s, box-shadow 0.12s, border-color 0.12s',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Sprite thumbnail — crops row 3 (DR front-view) from the sheet */}
              <div style={{
                width: 60, height: 112, margin: '4px auto 0',
                backgroundImage: `url(${char.sprite})`,
                backgroundPosition: '0px -336px',
                backgroundSize: '60px 448px',
                backgroundRepeat: 'no-repeat',
                imageRendering: 'pixelated',
              }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
