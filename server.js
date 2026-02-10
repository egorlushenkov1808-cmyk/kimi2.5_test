const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
app.use(bodyParser.json());
app.use(express.static('public'));

const DB_FILE = './data.json';
const ADMIN_IDS = [971440476];

function initDB() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({
            tournaments: [],
            registrations: [],
            users: []
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

function getOrCreateUser(userId, username) {
    const db = readDB();
    let user = db.users.find(u => u.id === userId);
    
    if (!user) {
        user = {
            id: userId,
            username: username || 'unknown',
            nickname: username || 'Player',
            phone: '',
            stats: {
                totalGames: 0,
                wins: 0,
                cashes: 0,
                profit: 0,
                rating: 1000
            },
            history: [],
            achievements: [],
            isAdmin: ADMIN_IDS.includes(userId)
        };
        db.users.push(user);
        writeDB(db);
    }
    
    return user;
}

// Routes
app.get('/api/check-admin/:userId', (req, res) => {
    const isAdmin = ADMIN_IDS.includes(parseInt(req.params.userId));
    res.json({ isAdmin });
});

app.get('/api/user/:userId', (req, res) => {
    try {
        const db = readDB();
        const user = db.users.find(u => u.id == req.params.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/user/:userId', (req, res) => {
    try {
        const { nickname, phone } = req.body;
        const db = readDB();
        const user = db.users.find(u => u.id == req.params.userId);
        
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        if (nickname) user.nickname = nickname;
        if (phone) user.phone = phone;
        
        writeDB(db);
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/tournaments', (req, res) => {
    try {
        const db = readDB();
        res.json(db.tournaments);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/tournaments', (req, res) => {
    try {
        const { title, date, buyin, prize, maxPlayers, userId } = req.body;
        
        if (!ADMIN_IDS.includes(parseInt(userId))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        if (!title || !date || !buyin || !prize || !maxPlayers) {
            return res.status(400).json({ error: 'Fill all fields' });
        }
        
        const db = readDB();
        const tournament = {
            id: Date.now(),
            title,
            date,
            buyin,
            prize,
            maxPlayers: parseInt(maxPlayers),
            players: [],
            status: 'open',
            results: []
        };
        
        db.tournaments.push(tournament);
        writeDB(db);
        
        res.json({ success: true, tournament });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/tournaments/:id', (req, res) => {
    try {
        const userId = parseInt(req.headers['user-id']);
        
        if (!ADMIN_IDS.includes(userId)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const db = readDB();
        db.tournaments = db.tournaments.filter(t => t.id !== parseInt(req.params.id));
        db.registrations = db.registrations.filter(r => r.tournamentId !== parseInt(req.params.id));
        
        writeDB(db);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
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
        
        const db = readDB();
        const tournament = db.tournaments.find(t => t.id === tournamentId);
        
        if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
        if (tournament.players.length >= tournament.maxPlayers) {
            return res.status(400).json({ error: 'No seats available' });
        }
        
        const existing = db.registrations.find(r => 
            r.tournamentId === tournamentId && r.userId === userId
        );
        if (existing) return res.status(400).json({ error: 'Already registered' });
        
        const user = getOrCreateUser(userId, username);
        if (nickname) user.nickname = nickname;
        if (phone) user.phone = phone;
        
        const registration = {
            id: Date.now(),
            tournamentId,
            userId,
            nickname: user.nickname,
            phone: user.phone,
            registeredAt: new Date().toISOString()
        };
        
        db.registrations.push(registration);
        tournament.players.push({ userId, nickname: user.nickname, phone: user.phone });
        
        writeDB(db);
        
        res.json({ success: true, message: 'Registration confirmed!' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
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
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/tournaments/:id/results', (req, res) => {
    try {
        const { userId, results } = req.body;
        
        if (!ADMIN_IDS.includes(parseInt(userId))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const db = readDB();
        const tournament = db.tournaments.find(t => t.id === parseInt(req.params.id));
        
        if (!tournament) return res.status(404).json({ error: 'Not found' });
        
        tournament.results = results;
        tournament.status = 'finished';
        
        results.forEach(result => {
            const user = db.users.find(u => u.id === result.userId);
            if (user) {
                user.stats.totalGames++;
                user.history.push({
                    tournamentId: tournament.id,
                    tournamentName: tournament.title,
                    date: new Date().toISOString().split('T')[0],
                    place: result.place,
                    prize: result.prize || 0,
                    buyin: parseInt(tournament.buyin.replace(/\D/g, '')) || 0
                });
                
                if (result.place === 1) user.stats.wins++;
                if (result.prize > 0) {
                    user.stats.cashes++;
                    user.stats.profit += result.prize - (parseInt(tournament.buyin.replace(/\D/g, '')) || 0);
                }
                
                const ratingChange = result.place <= 3 ? 50 - (result.place - 1) * 10 : -10;
                user.stats.rating += ratingChange;
            }
        });
        
        writeDB(db);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/stats/:userId', (req, res) => {
    try {
        const db = readDB();
        const user = db.users.find(u => u.id == req.params.userId);
        
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        res.json({
            stats: user.stats,
            history: user.history,
            achievements: user.achievements
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/leaderboard', (req, res) => {
    try {
        const db = readDB();
        const leaderboard = db.users
            .sort((a, b) => b.stats.rating - a.stats.rating)
            .slice(0, 50)
            .map((u, index) => ({
                place: index + 1,
                nickname: u.nickname,
                rating: u.stats.rating,
                totalGames: u.stats.totalGames,
                wins: u.stats.wins,
                profit: u.stats.profit
            }));
        
        res.json(leaderboard);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});