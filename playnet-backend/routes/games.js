const express = require('express');
const { db } = require('../database');
const router = express.Router();

// GET /api/games - Dapatkan semua game
router.get('/', (req, res) => {
    const sql = `SELECT id, title, genre, icon FROM games ORDER BY title ASC`;
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ message: 'Database error.', error: err.message });
        }
        res.json(rows);
    });
});

module.exports = router;