# Live Rooms (iOS-style streaming)

WebRTC streaming with a Node.js signaling server. Host streams camera/screen; any number of users join the room and watch + chat.

## Run
    npm install
    npm start          # http://localhost:3000

## Test with two users
1. Open http://localhost:3000 in one tab -> **Go Live**.
2. Open it in another tab/browser/device -> tap the stream (or Join tab + room code).

## Real devices (iPhone etc.)
Camera access requires **HTTPS** (localhost is exempt). Easy options:
- `npx cloudflared tunnel --url http://localhost:3000`  or  `ngrok http 3000`
- Or deploy to Render / Railway / Fly.io (they provide HTTPS + WebSockets).

## Notes
- Mesh topology: the host uploads one stream per viewer. Good for ~5-8 viewers.
  For larger audiences, swap in an SFU (LiveKit, mediasoup, Janus).
- For users behind strict NATs add a TURN server in `ICE` in `public/index.html`.
