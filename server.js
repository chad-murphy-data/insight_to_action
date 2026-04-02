// Insight Kitchen - WebSocket Relay Server
// Deploy to Render.com as a Web Service (Node.js)

const { WebSocketServer } = require('ws');
const http = require('http');

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  // Health check endpoint for Render
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Insight Kitchen relay server. Connect via WebSocket.');
});

const wss = new WebSocketServer({ server });
const rooms = new Map(); // roomCode -> { host: ws, guest: ws }

function generateCode() {
  const words = ['INSIGHT', 'NUDGE', 'ANCHOR', 'BIAS', 'PRIME', 'FRAME', 'HEURISTIC', 'DEFAULT'];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${word}-${num}`;
}

wss.on('connection', (ws) => {
  let myRoom = null;
  let myRole = null;

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    switch (msg.type) {
      case 'create': {
        const code = generateCode();
        rooms.set(code, { host: ws, guest: null });
        myRoom = code;
        myRole = 'host';
        ws.send(JSON.stringify({ type: 'created', code }));
        console.log(`Room created: ${code}`);
        break;
      }

      case 'join': {
        const room = rooms.get(msg.code);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', msg: 'Room not found' }));
        } else if (room.guest) {
          ws.send(JSON.stringify({ type: 'error', msg: 'Room full' }));
        } else {
          room.guest = ws;
          myRoom = msg.code;
          myRole = 'guest';
          ws.send(JSON.stringify({ type: 'joined', code: msg.code }));
          room.host.send(JSON.stringify({ type: 'guest_joined' }));
          console.log(`Guest joined: ${msg.code}`);
        }
        break;
      }

      case 'state': {
        // Host sends game state to guest
        if (myRole === 'host' && myRoom) {
          const room = rooms.get(myRoom);
          if (room?.guest?.readyState === 1) {
            room.guest.send(JSON.stringify({ type: 'state', data: msg.data }));
          }
        }
        break;
      }

      case 'input': {
        // Guest sends input to host
        if (myRole === 'guest' && myRoom) {
          const room = rooms.get(myRoom);
          if (room?.host?.readyState === 1) {
            room.host.send(JSON.stringify({ type: 'input', data: msg.data }));
          }
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (myRoom) {
      const room = rooms.get(myRoom);
      if (room) {
        const other = myRole === 'host' ? room.guest : room.host;
        if (other?.readyState === 1) {
          other.send(JSON.stringify({ type: 'peer_left' }));
        }
        rooms.delete(myRoom);
        console.log(`Room closed: ${myRoom}`);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Insight Kitchen relay on port ${PORT}`);
});
