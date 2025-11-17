const express = require('express');
const { db } = require('../database');
const router = express.Router();

// GET /api/pcs - Dapatkan status semua PC
router.get('/', (req, res) => {
    const sql = `SELECT id, is_booked FROM pcs ORDER BY id ASC`;
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ message: 'Database error.', error: err.message });
        }
        
        // Ubah 0/1 dari SQLite menjadi true/false untuk JavaScript
        const pcs = rows.map(pc => ({
            id: pc.id,
            isBooked: !!pc.is_booked // 0 -> false, 1 -> true
        }));
        
        res.json(pcs);
    });
});

module.exports = router;