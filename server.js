ws.on('message', (message) => {
    try {
        const data = JSON.parse(message);
    } catch (e) {
        console.error('Fehler:', e);
    }
});

ws.on('close', () => {
    console.log('Spieler getrennt');
});
