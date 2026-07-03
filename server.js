// STURMFELD Multiplayer Server
// Node.js + WebSocket (Bibliothek: ws)
// Aufgaben: Spieler verbinden, Positionen/Schüsse/Treffer synchronisieren,
// Sturmzone serverseitig verwalten, WebRTC-Signaling für Voice-Chat weiterleiten.

const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('STURMFELD Multiplayer Server läuft. Verbinde dich per WebSocket (wss://...).');
});

const wss = new WebSocket.Server({ server });

let players = {};          // id -> { ws, id, name, x, y, angle, hp, weapon, alive, kills, primary, secondary }
let lootTaken = new Set(); // Indizes von bereits eingesammeltem Loot (deterministische Loot-Liste per Seed)
let nextId = 1;
const matchSeed = Math.floor(Math.random() * 1e9);

let zone = { x: 0, y: 0, r: 2100, targetR: 2100, startR: 2100, shrinking: false, timer: 40, shrinkSteps: 40, stepCount: 0, phase: 0 };

function strip(p) {
  return { id: p.id, name: p.name, x: p.x, y: p.y, angle: p.angle, hp: p.hp, weapon: p.weapon, alive: p.alive, kills: p.kills, primary: p.primary, secondary: p.secondary };
}
function broadcast(msg, exceptId) {
  const data = JSON.stringify(msg);
  for (const id in players) {
    if (id === exceptId) continue;
    const p = players[id];
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(data);
  }
}
function sendTo(id, msg) {
  const p = players[id];
  if (p && p.ws.readyState === WebSocket.OPEN) p.ws.send(JSON.stringify(msg));
}

wss.on('connection', (ws) => {
  const id = 'p' + (nextId++);
  let joined = false;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    if (msg.type === 'join') {
      joined = true;
      players[id] = {
        ws, id,
        name: String(msg.name || 'Spieler').slice(0, 16),
        x: (Math.random() - 0.5) * 1600,
        y: (Math.random() - 0.5) * 1600,
        angle: 0, hp: 100, weapon: 'pistol', alive: true, kills: 0,
        primary: msg.primary || '#7fffd4',
        secondary: msg.secondary || '#215048'
      };
      sendTo(id, {
        type: 'init', id, seed: matchSeed,
        players: Object.values(players).map(strip),
        zone, lootTaken: [...lootTaken]
      });
      broadcast({ type: 'player-join', player: strip(players[id]) }, id);
      console.log(`[+] ${players[id].name} (${id}) ist beigetreten. Spieler online: ${Object.keys(players).length}`);
    }
    else if (msg.type === 'state' && players[id]) {
      const p = players[id];
      if (typeof msg.x === 'number') p.x = msg.x;
      if (typeof msg.y === 'number') p.y = msg.y;
      if (typeof msg.angle === 'number') p.angle = msg.angle;
      if (msg.weapon) p.weapon = msg.weapon;
    }
    else if (msg.type === 'shoot' && players[id]) {
      broadcast({ type: 'shoot', id, x: msg.x, y: msg.y, angle: msg.angle, weapon: msg.weapon }, id);
    }
    else if (msg.type === 'hit' && players[id]) {
      const target = players[msg.targetId];
      if (target && target.alive) {
        target.hp -= Math.max(0, Math.min(100, msg.dmg || 0));
        if (target.hp <= 0) {
          target.hp = 0; target.alive = false;
          const shooter = players[id];
          if (shooter && shooter.id !== target.id) shooter.kills++;
          broadcast({ type: 'death', id: msg.targetId, killerId: id, killerName: shooter ? shooter.name : 'Sturm' });
        } else {
          broadcast({ type: 'hp-update', id: msg.targetId, hp: target.hp });
        }
      }
    }
    else if (msg.type === 'loot-take') {
      if (!lootTaken.has(msg.lootId)) {
        lootTaken.add(msg.lootId);
        broadcast({ type: 'loot-taken', lootId: msg.lootId, by: id });
      }
    }
    else if (msg.type === 'rtc-offer' || msg.type === 'rtc-answer' || msg.type === 'rtc-ice') {
      // WebRTC-Signaling einfach an den Zielspieler weiterreichen (Voice-Chat)
      sendTo(msg.to, Object.assign({}, msg, { from: id }));
    }
    else if (msg.type === 'chat' && players[id]) {
      broadcast({ type: 'chat', id, name: players[id].name, text: String(msg.text || '').slice(0, 140) });
    }
  });

  ws.on('close', () => {
    if (joined) {
      console.log(`[-] ${players[id] ? players[id].name : id} hat die Verbindung getrennt.`);
      delete players[id];
      broadcast({ type: 'player-leave', id });
    }
  });
});

// Serverseitige Sturmzone + Tick-Broadcast (2x pro Sekunde)
setInterval(() => {
  if (zone.timer > 0) {
    zone.timer--;
  } else if (!zone.shrinking && zone.r > 220) {
    zone.shrinking = true;
    zone.startR = zone.r;
    zone.targetR = Math.max(180, zone.r * 0.55);
    zone.stepCount = 0;
    zone.phase++;
  }
  if (zone.shrinking) {
    zone.stepCount++;
    const t = Math.min(1, zone.stepCount / zone.shrinkSteps);
    zone.r = zone.startR + (zone.targetR - zone.startR) * t;
    if (t >= 1) { zone.shrinking = false; zone.timer = 40; }
  }
  for (const id in players) {
    const p = players[id];
    if (!p.alive) continue;
    const d = Math.hypot(p.x - zone.x, p.y - zone.y);
    if (d > zone.r) {
      p.hp -= 1;
      if (p.hp <= 0) {
        p.hp = 0; p.alive = false;
        broadcast({ type: 'death', id, killerId: null, killerName: 'Der Sturm' });
      }
    }
  }
  if (Object.keys(players).length > 0) {
    broadcast({ type: 'tick', players: Object.values(players).map(strip), zone });
  }
}, 500);

server.listen(PORT, () => console.log('STURMFELD-Server läuft auf Port ' + PORT));
      
