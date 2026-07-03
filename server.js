const WebSocket = require('ws');
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

let players = {};

wss.on('connection', (ws) => {
    console.log('Spieler verbunden');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            // Hier kommt deine Nachrichtenverarbeitung rein
        } catch (e) {
            console.error('Fehler:', e);
        }
    });

    ws.on('close', () => {
        console.log('Spieler getrennt');
    });
});
