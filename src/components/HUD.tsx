import { useState, useEffect, useRef } from 'react'
import { useGameStore } from '../store/gameStore'
import { RECIPES } from '../data/recipes'
import { ITEMS } from '../data/items'
import { LEVELS } from '../data/levels'
import { tutorial, TUTORIAL_PROMPTS } from '../store/tutorial'
import { RECIPE_ICONS, CARRY_SPRITES } from '../data/sprites'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function OrderCard({ recipe, elapsed, timeLimit, untimed }: { recipe: string; elapsed: number; timeLimit: number; untimed?: boolean }) {
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceUpdate(n => n + 1), 250)
    return () => clearInterval(id)
  }, [])

  const rc = RECIPES[recipe]
  if (!rc) return null
  const remaining = timeLimit - elapsed
  const pct = remaining / timeLimit
  const urgent = !untimed && pct < 0.25
  const ingredients = ['TMPL', ...rc.requires]
  const isTutorialHighlight = tutorial.active && tutorial.phase === 1 && tutorial.step === 1

  return (
    <div style={{
      background: urgent ? '#ffe0e0' : '#f5f0e8',
      border: isTutorialHighlight
        ? '3px solid #ffd700'
        : `2px solid ${urgent ? '#f44' : rc.color}`,
      borderRadius: 10,
      padding: '10px 14px',
      minWidth: 140,
      textAlign: 'center',
      transition: 'border-color 0.3s, transform 0.3s',
      boxShadow: isTutorialHighlight
        ? '0 0 24px rgba(255,215,0,0.85)'
        : '0 2px 8px rgba(0,0,0,0.25)',
      animation: isTutorialHighlight ? 'cardHighlight 1.2s ease-in-out infinite' : undefined,
      transform: isTutorialHighlight ? 'scale(1.05)' : 'scale(1)',
      position: 'relative',
    }}>
      {isTutorialHighlight && (
        <div style={{
          position: 'absolute', top: -22, left: -8,
          background: '#ffd700', color: '#5a3a00',
          padding: '4px 10px', borderRadius: 12,
          fontSize: 11, fontWeight: 800,
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          animation: 'wiggle 0.6s ease-in-out infinite',
          whiteSpace: 'nowrap',
        }}>
          START HERE
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 18, fontWeight: 700, color: rc.color }}>
        {RECIPE_ICONS[recipe] && (
          <img src={RECIPE_ICONS[recipe]} alt="" style={{ height: 28, width: 28, objectFit: 'contain' }} />
        )}
        <span>{rc.name}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 4 }}>
        {ingredients.map((i, idx) => (
          <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {CARRY_SPRITES[i] ? (
              <img src={CARRY_SPRITES[i]} alt={i} style={{ height: 22, width: 22, objectFit: 'contain' }} />
            ) : (
              <span style={{ fontSize: 14, color: '#666' }}>{ITEMS[i]?.sym || i}</span>
            )}
            {idx < ingredients.length - 1 && <span style={{ color: '#aaa', fontWeight: 700 }}>+</span>}
          </span>
        ))}
      </div>
      {untimed ? (
        <div style={{
          fontSize: 13, color: '#888', marginTop: 6,
          fontStyle: 'italic', fontWeight: 500,
        }}>
          no rush — first one's chill
        </div>
      ) : (
        <>
          <div style={{
            fontSize: 16, fontWeight: 700, marginTop: 5,
            color: urgent ? '#f44' : '#333',
          }}>
            {formatTime(remaining)}
          </div>
          <div style={{ height: 4, background: '#ccc', borderRadius: 2, marginTop: 4 }}>
            <div style={{
              height: '100%', borderRadius: 2, transition: 'width 0.5s linear',
              width: `${pct * 100}%`,
              background: urgent ? '#f44' : pct < 0.5 ? '#f0c040' : '#4f4',
            }} />
          </div>
        </>
      )}
    </div>
  )
}

function TutorialBanner() {
  const [, forceUpdate] = useState(0)
  const gamePhase = useGameStore(s => s.gamePhase)

  useEffect(() => {
    const id = setInterval(() => forceUpdate(n => n + 1), 100)
    return () => clearInterval(id)
  }, [])

  if (!tutorial.active || gamePhase !== 'playing') return null
  const key = `${tutorial.phase}:${tutorial.step}`
  const prompt = TUTORIAL_PROMPTS[key]
  if (!prompt) return null

  return (
    <div style={{
      position: 'absolute', bottom: 130, left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.85)', border: '2px solid #4488ff', borderRadius: 12,
      padding: '12px 24px', textAlign: 'center', zIndex: 30,
      pointerEvents: 'none', minWidth: 280,
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{prompt.both}</div>
      {prompt.p1 && <div style={{ fontSize: 14, color: '#4488ff', marginTop: 4 }}>{prompt.p1}</div>}
      {prompt.p2 && <div style={{ fontSize: 14, color: '#ff6644', marginTop: 4 }}>{prompt.p2}</div>}
      {prompt.solo && <div style={{ fontSize: 14, color: '#aaa', marginTop: 4 }}>{prompt.solo}</div>}
      <div style={{ fontSize: 13, color: '#aaa', marginTop: 8, fontWeight: 400 }}>
        Press <span style={{ color: '#4488ff', fontWeight: 700 }}>SPACE</span> (P1)  ·  <span style={{ color: '#ff6644', fontWeight: 700 }}>;</span> (P2)
      </div>
    </div>
  )
}

function WelcomeModal() {
  const gamePhase = useGameStore(s => s.gamePhase)
  const currentLevel = useGameStore(s => s.currentLevel)
  const welcomeDismissed = useGameStore(s => s.welcomeDismissed)
  const dismissWelcome = useGameStore(s => s.actions.dismissWelcome)

  const visible = gamePhase === 'countdown' && currentLevel === 0 && !welcomeDismissed

  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        dismissWelcome()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [visible, dismissWelcome])

  if (!visible) return null

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      background: 'rgba(0,0,0,0.6)', zIndex: 60,
      pointerEvents: 'auto',
    }}
      onClick={() => dismissWelcome()}
    >
      <div style={{
        background: '#fff8e8',
        border: '4px solid #d4a843',
        borderRadius: 18,
        padding: '36px 48px',
        maxWidth: 620,
        textAlign: 'center',
        boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
      }}>
        <div style={{
          fontSize: 32, fontWeight: 800, color: '#5a3a1a',
          marginBottom: 18,
        }}>
          Welcome to Insight Kitchen
        </div>
        <div style={{
          fontSize: 18, color: '#6a4a2a',
          lineHeight: 1.55, marginBottom: 26,
        }}>
          The game where, with the right recipe and excellent collaboration,
          you can turn regular insights into action.
        </div>
        <div style={{
          fontSize: 14, color: '#8a7a5a', fontWeight: 600,
        }}>
          Press <span style={{
            display: 'inline-block', padding: '2px 10px',
            background: '#5a3a1a', color: '#fff8e8', borderRadius: 6,
            fontFamily: 'monospace',
          }}>SPACE</span> or click to begin
        </div>
      </div>
    </div>
  )
}

export default function HUD() {
  const score = useGameStore(s => s.score)
  const roundTimer = useGameStore(s => s.roundTimer)
  const orders = useGameStore(s => s.orders)
  const gamePhase = useGameStore(s => s.gamePhase)
  const countdownTimer = useGameStore(s => s.countdownTimer)
  const currentLevel = useGameStore(s => s.currentLevel)
  const p1Carry = useGameStore(s => s.p1Carry)
  const p2Carry = useGameStore(s => s.p2Carry)
  const deliveries = useGameStore(s => s.deliveries)
  const tipMultiplier = useGameStore(s => s.tipMultiplier)

  const cfg = LEVELS[currentLevel]

  return (
    <div style={{
      position: 'absolute', inset: 0,
      pointerEvents: 'none',
      fontFamily: "'Fredoka', 'Comic Sans MS', cursive",
      color: 'white',
      zIndex: 10,
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 20px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>
          {cfg?.name} — {cfg?.subtitle}
        </div>
        <div style={{
          fontSize: 28, fontWeight: 700,
          color: roundTimer < 30 ? '#f44' : roundTimer < 60 ? '#f0c040' : '#fff',
          transition: 'color 0.3s',
        }}>
          {formatTime(roundTimer)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {tipMultiplier > 1 && (
            <div style={{
              fontSize: 18, fontWeight: 900,
              padding: '4px 10px', borderRadius: 14,
              background: 'linear-gradient(180deg, #ffe066 0%, #ffb300 100%)',
              color: '#5a3a00', border: '2px solid #fff1a8',
              boxShadow: '0 2px 10px rgba(255,180,0,0.65)',
              animation: 'tipPop 0.5s ease-out',
              textShadow: '0 1px 0 rgba(255,255,255,0.5)',
            }} key={tipMultiplier}>
              TIP x{tipMultiplier}
            </div>
          )}
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            Score: {score} ({deliveries} delivered)
          </div>
        </div>
      </div>

      {/* Orders bar — upper left */}
      <div style={{
        position: 'absolute', top: 50, left: 12,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {orders.map(o => (
          <OrderCard key={o.id} recipe={o.recipe} elapsed={o.elapsed} timeLimit={o.timeLimit} untimed={o.untimed} />
        ))}
        {orders.length === 0 && gamePhase === 'playing' && (
          <div style={{ color: '#888', fontSize: 14, fontStyle: 'italic' }}>
            Waiting for orders...
          </div>
        )}
      </div>

      {/* Tutorial banner */}
      <TutorialBanner />

      {/* Tutorial welcome modal — replaces countdown on Tutorial */}
      <WelcomeModal />

      {/* Countdown overlay (skipped for Tutorial via WelcomeModal flow) */}
      {gamePhase === 'countdown' && !(currentLevel === 0) && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          background: 'rgba(0,0,0,0.4)',
          zIndex: 50,
        }}>
          <div
            key={countdownTimer > 0 ? Math.ceil(countdownTimer) : 'GO'}
            style={{
              fontSize: countdownTimer > 0 ? 90 : 110,
              fontWeight: 900,
              textShadow: '0 0 20px rgba(255,200,80,0.7), 0 0 40px rgba(255,120,40,0.4)',
              color: countdownTimer > 0 ? '#ffd44d' : '#6fff6f',
              animation: 'countdownPulse 0.9s ease-out',
            }}
          >
            {countdownTimer > 0 ? Math.ceil(countdownTimer) : 'GO!'}
          </div>
        </div>
      )}

      {/* Carry indicators */}
      <div style={{
        position: 'absolute', bottom: 20, left: 20,
        display: 'flex', gap: 20,
      }}>
        <CarryIndicator label="P1" carry={p1Carry} color="#4488ff" />
        <CarryIndicator label="P2" carry={p2Carry} color="#ff6644" />
      </div>

      {/* Controls hint */}
      <div style={{
        position: 'absolute', bottom: 20, right: 20,
        fontSize: 12, color: '#888',
        textAlign: 'right', lineHeight: 1.5,
      }}>
        <div>P1: Arrows + Space</div>
        <div>P2: IJKL + Semicolon</div>
      </div>
    </div>
  )
}

function CarryIndicator({ label, carry, color }: {
  label: string; carry: any; color: string
}) {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.5)', borderRadius: 8,
      padding: '6px 12px', border: `2px solid ${color}`,
      minWidth: 80, textAlign: 'center',
    }}>
      <div style={{ fontSize: 12, color, fontWeight: 700 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 28, marginTop: 2 }}>
        {carry && CARRY_SPRITES[carry.t] ? (
          <img src={CARRY_SPRITES[carry.t]} alt={carry.t} style={{ height: 26, width: 26, objectFit: 'contain' }} />
        ) : (
          <span style={{ fontSize: 18 }}>{carry ? (ITEMS[carry.t]?.sym || carry.t) : '—'}</span>
        )}
      </div>
      {carry?.t === 'DONE' && carry.recipe && (
        <div style={{ fontSize: 10, color: '#4f4' }}>
          {RECIPES[carry.recipe]?.name}
        </div>
      )}
    </div>
  )
}
