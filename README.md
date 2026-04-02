# Insight Kitchen 🍳📊

A BeSci-themed Overcooked clone for virtual onsites. 

## How to Play
1. Open the game URL
2. Player 1 clicks "Create Room" — gets a room code (e.g., BIAS-4271)
3. Share the code over Zoom chat
4. Player 2 enters the code and clicks "Join"
5. Slide around the slippery office delivering insights!

## Pipeline
**Inbox** → **Analysis** → **Deck Builder** → **Delivery** 🎉

## Deploy

### Game (GitHub Pages)
Push this repo, enable Pages in Settings → Pages → Deploy from main branch.

### Server (Render.com)
1. Create a new Web Service on render.com
2. Connect this repo
3. Render will auto-detect the `render.yaml` config
4. The server URL will be something like `https://insight-kitchen.onrender.com`
5. Update `RELAY_URL` in `index.html` to match

## Controls
- **P1 (Owner):** WASD + SPACE
- **P2 (Employee):** IJKL + ENTER (or arrow keys + ENTER on their machine)
