const express = require('express');
const { db } = require('../database');
const router = express.Router();

// --- 1. GET /api/food/menu ---
const getMenu = (req, res) => {
    const sql = `SELECT * FROM menu_items ORDER BY category, price`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ message: 'Database error.', error: err.message });
        }
        res.json(rows);
    });
};

// --- 2. POST /api/food/order ---
const postOrder = async (req, res) => {
    // Sekarang kita bisa dapat user_id dari token
    const user_id = req.user.id; 
    const { pcNumber, items } = req.body;

    if (!pcNumber || !items || items.length === 0) {
        return res.status(400).json({ message: 'Data pesanan tidak lengkap.' });
    }
    
    // ... (Validasi harga sisi server) ...
    const itemIds = items.map(i => i.id);
    const placeholders = itemIds.map(() => '?').join(',');
    const sqlPrices = `SELECT id, price FROM menu_items WHERE id IN (${placeholders})`;

    db.all(sqlPrices, itemIds, (err, menuItems) => {
        if (err) { /* ... (error handling) ... */ }
        let grandTotal = 0;
        const processedItems = [];
        for (const item of items) {
            const menuItem = menuItems.find(m => m.id === item.id);
            if (!menuItem) { /* ... (error handling) ... */ }
            grandTotal += (menuItem.price * item.qty);
            processedItems.push({
                ...item,
                price_per_item: menuItem.price
            });
        }

        // ... (Simpan ke Database) ...
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            // TAMBAHKAN user_id ke query
            const sqlOrder = `INSERT INTO food_orders (pc_number, total_price, user_id) VALUES (?, ?, ?)`;
            db.run(sqlOrder, [pcNumber, grandTotal, user_id], function(err) {
                if (err) { /* ... (error handling rollback) ... */ }
                
                const order_id = this.lastID;
                const sqlItem = `INSERT INTO food_order_items (order_id, menu_item_id, qty, price_per_item) 
                                 VALUES (?, ?, ?, ?)`;
                const stmt = db.prepare(sqlItem);
                processedItems.forEach(pi => {
                    stmt.run(order_id, pi.id, pi.qty, pi.price_per_item);
                });
                stmt.finalize((err) => {
                    if (err) { /* ... (error handling rollback) ... */ }
                    db.run("COMMIT");
                    res.status(201).json({ 
                        message: `Pesanan untuk PC ${pcNumber} terkirim ke kasir!`, 
                        total: grandTotal 
                    });
                });
            });
        });
    });
};

// --- 3. GET /api/food/history/:pcNumber ---
// RUTE INI SUDAH TIDAK DIPAKAI DAN DIHAPUS

// Ekspor fungsi-fungsi
module.exports = {
    getMenu,
    postOrder
};