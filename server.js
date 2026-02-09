const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'DELETE'] }));
app.use(bodyParser.json());
app.use(express.static('public'));

const DB_FILE = './data.json';

function initDB() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({
            tournaments: [],
            registrations: []
        }, null, 2));
    }
}

initDB();

function readDB() {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

app.get('/api/tournaments', (req, res) => {
    try {
        const db = readDB();
        res.json(db.tournaments);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/tournaments', (req, res) => {
    try {
        const { title, date, buyin, prize, maxPlayers, status } = req.body;
        
        if (!title || !date || !buyin || !prize || !maxPlayers) {
            return res.status(400).json({ error: 'Заполните все поля' });
        }
        
        const db = readDB();
        
        const newTournament = {
            id: Date.now(),
            title,
            date,
            buyin,
            prize,
            maxPlayers: parseInt(maxPlayers),
            players: [],
            status: status || 'open'
        };
        
        db.tournaments.push(newTournament);
        writeDB(db);
        
        res.json({ success: true, tournament: newTournament });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка создания' });
    }
});

app.delete('/api/tournaments/:id', (req, res) => {
    try {
        const db = readDB();
        const id = parseInt(req.params.id);
        
        db.tournaments = db.tournaments.filter(t => t.id !== id);
        db.registrations = db.registrations.filter(r => r.tournamentId !== id);
        
        writeDB(db);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка удаления' });
    }
});

app.get('/api/check/:userId', (req, res) => {
    try {
        const db = readDB();
        const userRegs = db.registrations.filter(r => r.userId == req.params.userId);
        res.json(userRegs);
    } catch (error) {
        res.json([]);
    }
});

app.post('/api/register', (req, res) => {
    try {
        const { tournamentId, userId, username, nickname, phone } = req.body;
        
        if (!tournamentId || !userId || !nickname || !phone) {
            return res.status(400).json({ error: 'Не все поля заполнены' });
        }
        
        const db = readDB();
        
        const tournament = db.tournaments.find(t => t.id === tournamentId);
        if (!tournament) {
            return res.status(404).json({ error: 'Турнир не найден' });
        }
        
        if (tournament.players.length >= tournament.maxPlayers) {
            return res.status(400).json({ error: 'Нет мест' });
        }
        
        const existing = db.registrations.find(r => 
            r.tournamentId === tournamentId && r.userId === userId
        );
        
        if (existing) {
            return res.status(400).json({ error: 'Уже записаны' });
        }
        
        const registration = {
            id: Date.now(),
            tournamentId,
            userId,
            username: username || 'unknown',
            nickname,
            phone,
            registeredAt: new Date().toISOString()
        };
        
        db.registrations.push(registration);
        tournament.players.push({ userId, nickname });
        
        writeDB(db);
        
        res.json({ success: true, message: 'Запись подтверждена!' });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/cancel', (req, res) => {
    try {
        const { tournamentId, userId } = req.body;
        const db = readDB();
        
        const tournament = db.tournaments.find(t => t.id === tournamentId);
        if (tournament) {
            tournament.players = tournament.players.filter(p => p.userId !== userId);
        }
        
        db.registrations = db.registrations.filter(r => 
            !(r.tournamentId === tournamentId && r.userId === userId)
        );
        
        writeDB(db);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});