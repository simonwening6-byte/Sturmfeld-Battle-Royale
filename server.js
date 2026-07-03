tion des Spielers
                players[playerId] = {
                    id: playerId,
                    x: data.x,
                    y: data.y,
                    angle: data.angle,
                    skin: data.skin
                };

                // Sende die neuen Positionen an ALLE verbundenen Spieler
                broadcast({ type: 'update', players: players });
            }

            if (data.type === 'shoot') {
                // Leite den Schuss an alle anderen Spieler weiter
                broadcast({
                    type: 'bullet',
                    id: playerId,
                    x: data.x,
                    y: data.y,
                    angle: data.angle
                });
            }
        } catch (e) {
            console.error("Fehler beim Verarbeiten der Nachricht", e);
        }
    });

    // Wenn ein Spieler das Spiel verlässt
    ws.on('close', () => {
        console.log(`Spieler getrennt: ${playerId}`);
        delete players[playerId];
        broadcast({ type: 'player_disconnected', id: playerId });
    });
});

// Hilfsfunktion: Nachricht an alle senden
function broadcast(data) {
    const msg = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}const WebSocket = require('ws');

// Render weist automatisch einen PORT über die Umgebungsvariablen zu
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

// Speicher für alle aktiven Spieler auf dem Server
let players = {};

console.log(`Sturmfeld-Server läuft auf Port ${PORT}`);

wss.on('connection', (ws) => {
    // Generiere eine einzigartige ID für jeden Spieler, der connectet
    const playerId = Math.random().toString(36).substr(2, 9);
    console.log(`Spieler verbunden: ${playerId}`);

    // Schicke dem Spieler seine ID
    ws.send(JSON.stringify({ type: 'init', id: playerId }));

    // Wenn Nachrichten vom Spieler reinkommen
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'move') {
                // Aktualisiere Posi
