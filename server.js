// Signaling + room server. Video itself flows peer-to-peer via WebRTC.
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const app = express();
app.use(express.static(__dirname + '/public'));

const rooms = new Map(); // id -> { id, title, host, viewers:Map(peerId->ws) , chat:[] }

const id = (n = 4) => crypto.randomBytes(n).toString('hex');
const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
const roomInfo = r => ({ id: r.id, title: r.title, hostName: r.host.name, viewers: r.viewers.size });

app.get('/api/rooms', (_req, res) => res.json([...rooms.values()].map(roomInfo)));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function closeRoom(room, reason) {
  for (const v of room.viewers.values()) send(v, { type: 'room-closed', reason });
  rooms.delete(room.id);
}
function broadcastCount(room) {
  const msg = { type: 'viewers', count: room.viewers.size };
  send(room.host, msg);
  for (const v of room.viewers.values()) send(v, msg);
}
function broadcastChat(room, msg) {
  send(room.host, msg);
  for (const v of room.viewers.values()) send(v, msg);
}

wss.on('connection', ws => {
  ws.peerId = id();
  ws.room = null;
  ws.role = null;
  ws.name = 'Guest';
  send(ws, { type: 'hello', peerId: ws.peerId });

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const room = ws.room;

    switch (m.type) {
      case 'create-room': {
        if (ws.room) return;
        ws.name = String(m.name || 'Host').slice(0, 24);
        const r = { id: id(3).toUpperCase(), title: String(m.title || 'Untitled stream').slice(0, 60),
                    host: ws, viewers: new Map() };
        rooms.set(r.id, r);
        ws.room = r; ws.role = 'host';
        send(ws, { type: 'room-created', room: roomInfo(r) });
        break;
      }
      case 'join-room': {
        if (ws.room) return;
        const r = rooms.get(String(m.roomId || '').toUpperCase());
        if (!r) return send(ws, { type: 'error', message: 'Room not found. Check the code and try again.' });
        ws.name = String(m.name || 'Guest').slice(0, 24);
        ws.room = r; ws.role = 'viewer';
        r.viewers.set(ws.peerId, ws);
        send(ws, { type: 'joined', room: roomInfo(r) });
        // Tell the host to start a WebRTC connection to this viewer
        send(r.host, { type: 'viewer-joined', peerId: ws.peerId, name: ws.name });
        broadcastCount(r);
        broadcastChat(r, { type: 'system', text: `${ws.name} joined` });
        break;
      }
      // WebRTC signaling relay: host <-> viewer
      case 'offer': case 'answer': case 'candidate': {
        if (!room) return;
        const target = ws.role === 'host' ? room.viewers.get(m.to) : room.host;
        if (target) send(target, { type: m.type, from: ws.peerId, data: m.data });
        break;
      }
      case 'chat': {
        if (!room) return;
        const text = String(m.text || '').slice(0, 300).trim();
        if (text) broadcastChat(room, { type: 'chat', name: ws.name, text, host: ws.role === 'host' });
        break;
      }
      case 'end': if (room && ws.role === 'host') closeRoom(room, 'The host ended the stream.'); break;
    }
  });

  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    if (ws.role === 'host') return closeRoom(room, 'The host ended the stream.');
    room.viewers.delete(ws.peerId);
    send(room.host, { type: 'viewer-left', peerId: ws.peerId });
    broadcastCount(room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Live rooms running on http://localhost:${PORT}`));
