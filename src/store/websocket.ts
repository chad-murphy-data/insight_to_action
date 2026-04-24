import { useGameStore } from './gameStore'
import { keys, justPressed } from './input'

const RELAY_URL = 'wss://insight-to-action.onrender.com'

let ws: WebSocket | null = null

// Guest input received from relay (used by host)
export const guestInput = { up: false, down: false, left: false, right: false, act: false }

export function getWs() { return ws }

export function connectWS(onStatus: (msg: string) => void): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(RELAY_URL)
    ws.onopen = () => { onStatus('Connected to server'); resolve(ws!) }
    ws.onerror = () => { onStatus('Cannot reach server'); reject() }
    ws.onclose = () => { onStatus('Disconnected'); useGameStore.getState().actions.setConnected(false) }
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      const actions = useGameStore.getState().actions
      switch (msg.type) {
        case 'created':
          actions.setRoomCode(msg.code)
          onStatus('Waiting for player 2... Share the code!')
          break
        case 'guest_joined':
          onStatus('Player 2 connected! Starting...')
          actions.setConnected(true)
          setTimeout(() => actions.resetGame(useGameStore.getState().currentLevel), 500)
          break
        case 'joined':
          onStatus('Joined! Waiting for host...')
          actions.setConnected(true)
          actions.setRole('guest')
          break
        case 'state':
          if (useGameStore.getState().role === 'guest') {
            actions.applyRemoteState(msg.data)
          }
          break
        case 'input':
          if (useGameStore.getState().role === 'host') {
            Object.assign(guestInput, msg.data)
          }
          break
        case 'peer_left':
          onStatus('Other player disconnected!')
          actions.setConnected(false)
          break
        case 'error':
          onStatus('Error: ' + msg.msg)
          break
      }
    }
  })
}

// Called every frame by host to broadcast state
export function sendState() {
  if (!ws || ws.readyState !== 1) return
  const state = useGameStore.getState()
  if (state.role !== 'host' || !state.connected) return
  ws.send(JSON.stringify({ type: 'state', data: state.actions.getSerializedState() }))
}

// Called every frame by guest to send input
export function sendInput() {
  if (!ws || ws.readyState !== 1) return
  const state = useGameStore.getState()
  if (state.role !== 'guest' || !state.connected) return
  const up = keys['w'] || keys['arrowup']
  const down = keys['s'] || keys['arrowdown']
  const left = keys['a'] || keys['arrowleft']
  const right = keys['d'] || keys['arrowright']
  const act = !!justPressed[' ']
  ws.send(JSON.stringify({ type: 'input', data: { up, down, left, right, act } }))
}
