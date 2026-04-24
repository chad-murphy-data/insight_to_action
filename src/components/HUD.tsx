import { useState, useEffect, useRef } from 'react'
import { useGameStore } from '../store/gameStore'
import { RECIPES } from '../data/recipes'
import { ITEMS } from '../data/items'
import { LEVELS } from '../data/levels'
import { tutorial, TUTORIAL_PROMPTS } from '../store/tutorial'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function OrderCard({ recipe, elapsed, timeLimit }: { recipe: string; elapsed: number; timeLimit: number }) {
  const rc = RECIPES[recipe]
  if (!rc) return null
  const remaining = timeLimit - elapsed
  const pct = remaining / timeLimit
  const urgent = pct < 0.25
  const ingredients = ['TMPL', ...rc.requires]

  return (
    <div style={{
      background: urgent ? '#ffe0e0' : '#f5f0e8',
      border: `2px solid ${urgent ? '#f44' : rc.color}`,
      borderRadius: 10,
      padding: '10px 14px',
      minWidth: 140,
      textAlign: 'center',
      transition: 'border-color 0.3s',
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: rc.color }}>
        {rc.emoji} {rc.name}
      </div>
      <div style={{ fontSize: 14, color: '#666', marginTop: 3 }}>
        {ingredients.map(i => ITEMS[i]?.sym || i).join(' + ')}
      </div>
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
      position: 'absolute', top: 110, left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.85)', border: '2px solid #4488ff', borderRadius: 12,
      padding: '12px 24px', textAlign: 'center', zIndex: 30,
      pointerEvents: 'none', minWidth: 250,
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{prompt.both}</div>
      {prompt.p1 && <div style={{ fontSize: 14, color: '#4488ff', marginTop: 4 }}>{prompt.p1}</div>}
      {prompt.p2 && <div style={{ fontSize: 14, color: '#ff6644', marginTop: 4 }}>{prompt.p2}</div>}
      {prompt.solo && <div style={{ fontSize: 14, color: '#aaa', marginTop: 4 }}>{prompt.solo}</div>}
    </div>
  )
}

function DeliveryFlash() {
  const deliveries = useGameStore(s => s.deliveries)
  const [flash, setFlash] = useState(false)
  const prevRef = useRef(0)

  useEffect(() => {
    if (deliveries > prevRef.current) {
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 500)
      prevRef.current = deliveries
      return () => clearTimeout(t)
    }
    prevRef.current = deliveries
  }, [deliveries])

  if (!flash) return null
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(80, 255, 100, 0.15)',
      pointerEvents: 'none', zIndex: 35,
    }} />
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
  const isHurry = gamePhase === 'playing' && roundTimer < 30 && roundTimer > 0
  const timerPulse = roundTimer < 10 && roundTimer > 0

  return (
    <div style={{
      position: 'absolute', inset: 0,
      pointerEvents: 'none',
      fontFamily: "'Fredoka', 'Comic Sans MS', cursive",
      color: 'white',
      zIndex: 10,
    }}>
      {/* Hurry-up vignette — pulsing red edge when <30s */}
      {isHurry && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5,
          boxShadow: 'inset 0 0 120px 40px rgba(255,60,40,0.55)',
          animation: 'hurryPulse 0.8s ease-in-out infinite',
        }} />
      )}

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
          fontSize: timerPulse ? 34 : 28, fontWeight: 700,
          color: roundTimer < 30 ? '#f44' : roundTimer < 60 ? '#f0c040' : '#fff',
          transition: 'font-size 0.2s',
          textShadow: timerPulse ? '0 0 20px rgba(255,60,40,0.9)' : 'none',
          animation: timerPulse ? 'timerBeat 0.6s ease-in-out infinite' : 'none',
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
          <OrderCard key={o.id} recipe={o.recipe} elapsed={o.elapsed} timeLimit={o.timeLimit} />
        ))}
        {orders.length === 0 && gamePhase === 'playing' && (
          <div style={{ color: '#888', fontSize: 14, fontStyle: 'italic' }}>
            Waiting for orders...
          </div>
        )}
      </div>

      {/* Tutorial banner */}
      <TutorialBanner />

      {/* Delivery flash */}
      <DeliveryFlash />

      {/* Countdown overlay */}
      {gamePhase === 'countdown' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          background: 'rgba(0,0,0,0.4)',
          zIndex: 50,
        }}>
          <div
            key={countdownTimer > 0 ? Math.ceil(countdownTimer) : 'GO'}
            style={{
              fontSize: countdownTimer > 0 ? 140 : 170,
              fontWeight: 900,
              textShadow: '0 0 30px rgba(255,200,80,0.75), 0 0 60px rgba(255,120,40,0.5)',
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
        <div>P1: WASD + Space</div>
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
      <div style={{ fontSize: 18, marginTop: 2 }}>
        {carry ? (ITEMS[carry.t]?.sym || carry.t) : '—'}
      </div>
      {carry?.t === 'DONE' && carry.recipe && (
        <div style={{ fontSize: 10, color: '#4f4' }}>
          {RECIPES[carry.recipe]?.name}
        </div>
      )}
    </div>
  )
}
