const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initDb } = require('./database');
const { authenticateToken } = require('./auth'); // Kita perlu auth

// Impor Rute
const userRoutes = require('./routes/users');
const pcRoutes = require('./routes/pcs');
const gameRoutes = require('./routes/games');
const bookingRoutes = require('./routes/booking');
const foodRoutes = require('./routes/food'); 
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
initDb();

// --- Rute API ---
app.get('/api', (req, res) => {
    res.send('Selamat datang di Playnet Backend API!');
});

// Rute Publik (siapa saja bisa akses)
app.use('/api/users', userRoutes); // (Login/Register ada di sini)
app.use('/api/pcs', pcRoutes);
app.use('/api/games', gameRoutes);
app.get('/api/food/menu', foodRoutes.getMenu); // <-- PANGGIL FUNGSI getMenu

// Rute Terlindungi (Harus login)
app.use('/api/booking', authenticateToken, bookingRoutes); 
app.use('/api/admin', authenticateToken, adminRoutes); // (Admin juga harus login)
app.post('/api/food/order', authenticateToken, foodRoutes.postOrder); // <-- PANGGIL FUNGSI postOrder

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});