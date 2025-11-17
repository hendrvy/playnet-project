const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../database');
const { authenticateToken } = require('../auth');

const router = express.Router();

// --- 1. Register User Baru ---
router.post('/register', async (req, res) => {
    try {
        const { name, username, email, password } = req.body;
        if (!name || !username || !email || !password) {
            return res.status(400).json({ message: 'Semua field harus diisi.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const sql = `INSERT INTO users (name, username, email, password_hash) 
                     VALUES (?, ?, ?, ?)`;
        
        db.run(sql, [name, username, email, hashedPassword], function(err) {
            if (err) {
                return res.status(400).json({ message: 'Username atau email sudah terdaftar.', error: err.message });
            }
            res.status(201).json({ message: 'Registrasi berhasil!', userId: this.lastID });
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error.', error: error.message });
    }
});

// --- 2. Login User ---
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username dan password harus diisi.' });
    }

    const sql = `SELECT * FROM users WHERE username = ?`;
    
    db.get(sql, [username], async (err, user) => {
        if (err) {
            return res.status(500).json({ message: 'Database error.', error: err.message });
        }
        if (!user) {
            return res.status(400).json({ message: 'Username atau password salah.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Username atau password salah.' });
        }

        const tokenPayload = { 
            id: user.id, 
            username: user.username ,
            is_admin: user.is_admin
        };
        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '8h' });

        res.json({
            message: 'Login berhasil!',
            token: token,
            user: {
                id: user.id,
                name: user.name,
                username: user.username,
                email: user.email,
                remainingTime: user.remaining_time_minutes,
                is_admin: user.is_admin
            }
        });
    });
});

// --- 3. Get Profil User (DIPERBAIKI) ---
router.get('/profile', authenticateToken, (req, res) => {
    // PERBAIKAN: Tambahkan 'is_admin' ke SELECT
    const sql = `
        SELECT id, name, username, email, remaining_time_minutes, is_admin 
        FROM users WHERE id = ?
    `;

    db.get(sql, [req.user.id], (err, row) => {
        if (err) {
            return res.status(500).json({ message: 'Database error.', error: err.message });
        }
        if (!row) {
            return res.status(404).json({ message: 'User tidak ditemukan.' });
        }
        res.json(row);
    });
});

// --- 4. Update Profil User (Fitur #2) ---
router.put('/profile', authenticateToken, (req, res) => {
    // ... (Fungsi Update Profil Anda - tidak berubah)
    const { name, email } = req.body;
    const sql = `UPDATE users SET name = ?, email = ? WHERE id = ?`;
    db.run(sql, [name, email, req.user.id], function(err) {
        if (err) {
            return res.status(500).json({ message: 'Gagal update profil.', error: err.message });
        }
        res.json({ message: 'Profil berhasil diupdate.' });
    });
});

module.exports = router;