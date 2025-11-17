const express = require('express');
const { db } = require('../database');
const { authenticateAdmin } = require('../auth');
const router = express.Router();

// --- FUNGSI HELPER: PENCATATAN LOG ---
const logAdminAction = (adminUsername, actionType, details) => {
    const sql = `
        INSERT INTO admin_audit_log (admin_username, action_type, details) 
        VALUES (?, ?, ?)
    `;
    db.run(sql, [adminUsername, actionType, details], (err) => {
        if (err) {
            console.error('FATAL: Gagal mencatat log admin!', err.message);
        }
    });
};

// --- RUTE ADMIN ---

/**
 * BARU: GET /api/admin/active-sessions
 * Mengambil daftar PC yang sedang 'booked' dan user yang memesannya
 */
router.get('/active-sessions', authenticateAdmin, (req, res) => {
    // Query ini mengambil PC yang is_booked = 1, lalu mencari
    // booking TERAKHIR yang terkait dengan PC itu, dan mengambil nama user-nya.
    const sql = `
        SELECT 
            pcs.id AS pc_id,
            u.username,
            b.created_at,
            b.duration_hours
        FROM pcs
        JOIN bookings b ON b.pc_id = pcs.id
        JOIN users u ON b.user_id = u.id
        WHERE pcs.is_booked = 1
        AND b.id IN (
            -- Subquery untuk menemukan HANYA booking ID terakhir untuk setiap PC
            SELECT MAX(id) 
            FROM bookings 
            GROUP BY pc_id
        )
        ORDER BY pcs.id ASC
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ message: 'Gagal mengambil sesi aktif.', error: err.message });
        }
        res.json(rows);
    });
});


// Batalkan Booking (Force Unbook)
router.post('/force-unbook', authenticateAdmin, (req, res) => {
    const { pc_id } = req.body;
    if (!pc_id) {
        return res.status(400).json({ message: 'PC ID diperlukan.' });
    }

    const sql = `UPDATE pcs SET is_booked = 0 WHERE id = ?`;
    db.run(sql, [pc_id], function(err) {
        if (err) {
            return res.status(500).json({ message: 'Gagal update status PC.', error: err.message });
        }
        if (this.changes === 0) {
            // Bisa jadi PC ada tapi sudah unbooked, atau PC tidak ada
            return res.status(404).json({ message: `PC ${pc_id} tidak ditemukan atau sudah 'Tersedia'.` });
        }
        
        logAdminAction(req.user.username, 'FORCE_UNBOOK', `PC ${pc_id} di-reset menjadi 'Tersedia'.`);
        res.json({ message: `PC ${pc_id} berhasil di-reset menjadi 'Tersedia'.` });
    });
});

// Sesuaikan Waktu User
router.post('/adjust-time', authenticateAdmin, (req, res) => {
    // ... (Fungsi /adjust-time Anda yang sudah ada)
    const { username, minutes } = req.body;
    if (!username || minutes === undefined) {
        return res.status(400).json({ message: 'Username dan Menit diperlukan.' });
    }
    const minutesToAdd = parseInt(minutes, 10);
    if (isNaN(minutesToAdd)) {
        return res.status(400).json({ message: 'Menit harus berupa angka.' });
    }

    const sql = `
        UPDATE users 
        SET remaining_time_minutes = MAX(0, remaining_time_minutes + ?) 
        WHERE username = ?
    `;
    db.run(sql, [minutesToAdd, username], function(err) {
        if (err) {
            return res.status(500).json({ message: 'Gagal update waktu user.', error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: `User '${username}' tidak ditemukan.` });
        }
        
        db.get("SELECT username, remaining_time_minutes FROM users WHERE username = ?", [username], (err, row) => {
            const logDetails = `Waktu user '${username}' diubah ${minutesToAdd} menit. Sisa waktu baru: ${row.remaining_time_minutes} menit.`;
            logAdminAction(req.user.username, 'ADJUST_TIME', logDetails);
             
            res.json({ 
                message: `Waktu user '${username}' berhasil diubah.`,
                newTime: row.remaining_time_minutes
            });
        });
    });
});

// --- RUTE ADMIN (Log & Manajemen Menu) ---

// Ambil Log Audit
router.get('/audit-log', authenticateAdmin, (req, res) => {
    // ... (Fungsi /audit-log Anda yang sudah ada)
    const sql = `SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT 50`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ message: 'Gagal mengambil log.', error: err.message });
        }
        res.json(rows);
    });
});

// Ambil Daftar Menu (untuk diedit)
router.get('/menu', authenticateAdmin, (req, res) => {
    // ... (Fungsi /menu Anda yang sudah ada)
    const sql = `SELECT * FROM menu_items ORDER BY category, name`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ message: 'Gagal mengambil menu.', error: err.message });
        }
        res.json(rows);
    });
});

// Tambah Item Menu Baru
router.post('/menu', authenticateAdmin, (req, res) => {
    // ... (Fungsi POST /menu Anda yang sudah ada)
    const { id, name, price, icon, category } = req.body;
    if (!id || !name || !price || !category) {
        return res.status(400).json({ message: 'ID, Nama, Harga, dan Kategori diperlukan.' });
    }
    const sql = `INSERT INTO menu_items (id, name, price, icon, category) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [id, name, price, icon || '🍽️', category], function(err) {
        if (err) {
            return res.status(400).json({ message: 'Gagal menambah item. ID mungkin sudah ada.', error: err.message });
        }
        logAdminAction(req.user.username, 'CREATE_MENU', `Item baru ditambahkan: ${name} (ID: ${id})`);
        res.status(201).json({ message: 'Item menu berhasil ditambahkan.' });
    });
});

// Update Item Menu
router.put('/menu/:id', authenticateAdmin, (req, res) => {
    // ... (Fungsi PUT /menu/:id Anda yang sudah ada)
    const { id } = req.params;
    const { name, price, icon, category } = req.body;
    if (!name || !price || !category) {
        return res.status(400).json({ message: 'Nama, Harga, dan Kategori diperlukan.' });
    }
    const sql = `UPDATE menu_items SET name = ?, price = ?, icon = ?, category = ? WHERE id = ?`;
    db.run(sql, [name, price, icon, category, id], function(err) {
        if (err) {
            return res.status(500).json({ message: 'Gagal update item.', error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Item menu tidak ditemukan.' });
        }
        logAdminAction(req.user.username, 'UPDATE_MENU', `Item menu diupdate: ${name} (ID: ${id})`);
        res.json({ message: 'Item menu berhasil diupdate.' });
    });
});

// Hapus Item Menu
router.delete('/menu/:id', authenticateAdmin, (req, res) => {
    // ... (Fungsi DELETE /menu/:id Anda yang sudah ada)
    const { id } = req.params;
    db.get("SELECT name FROM menu_items WHERE id = ?", [id], (err, row) => {
        if (!row) {
            return res.status(404).json({ message: 'Item menu tidak ditemukan.' });
        }
        const itemName = row.name;
        const sql = `DELETE FROM menu_items WHERE id = ?`;
        db.run(sql, [id], function(err) {
            if (err) {
                return res.status(500).json({ message: 'Gagal menghapus item.', error: err.message });
            }
            logAdminAction(req.user.username, 'DELETE_MENU', `Item menu dihapus: ${itemName} (ID: ${id})`);
            res.json({ message: 'Item menu berhasil dihapus.' });
        });
    });
});

module.exports = router;