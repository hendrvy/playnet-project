const express = require('express');
const { db } = require('../database');
const router = express.Router();

// --- 1. POST /api/booking/ ---
router.post('/', async (req, res) => {
    // total_price di sini adalah pc_price
    const { pc_id, duration_hours, total_price, payment_method, addons } = req.body; 
    const user_id = req.user.id;

    if (!pc_id || !duration_hours || !total_price || !payment_method) {
        return res.status(400).json({ message: 'Data booking PC tidak lengkap.' });
    }

    const duration_minutes = duration_hours * 60;

    // --- Dapatkan harga Addon dari DB (jika ada) ---
    let processedAddons = [];
    let addonTotal = 0;
    
    if (addons && addons.length > 0) {
        try {
            const itemIds = addons.map(i => i.id);
            const placeholders = itemIds.map(() => '?').join(',');
            const sqlPrices = `SELECT id, price FROM menu_items WHERE id IN (${placeholders})`;
            
            const menuItems = await new Promise((resolve, reject) => {
                db.all(sqlPrices, itemIds, (err, rows) => {
                    if (err) reject(err);
                    resolve(rows);
                });
            });

            for (const item of addons) {
                const menuItem = menuItems.find(m => m.id === item.id);
                if (!menuItem) {
                    throw new Error(`Addon ID ${item.id} tidak valid.`);
                }
                addonTotal += (menuItem.price * item.qty);
                processedAddons.push({
                    ...item,
                    price_per_item: menuItem.price
                });
            }
        } catch (error) {
            return res.status(500).json({ message: 'Gagal validasi addons.', error: error.message });
        }
    }

    // --- Simpan Semua ke DB (Transaksi) ---
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        // 1. Catat booking utama
        const sqlBooking = `
            INSERT INTO bookings (user_id, pc_id, duration_hours, pc_price, payment_method)
            VALUES (?, ?, ?, ?, ?)
        `;
        // PERBAIKAN DARI SEBELUMNYA: Pastikan 5 parameter ada di sini
        db.run(sqlBooking, [user_id, pc_id, duration_hours, total_price, payment_method], function(err) {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({ message: 'Gagal mencatat booking.', error: err.message });
            }
            
            const booking_id = this.lastID;

            // 2. Update status PC
            const sqlUpdatePC = `UPDATE pcs SET is_booked = 1 WHERE id = ?`;
            db.run(sqlUpdatePC, [pc_id]);

            // 3. Tambah sisa waktu user
            const sqlUpdateUser = `UPDATE users SET remaining_time_minutes = remaining_time_minutes + ? WHERE id = ?`;
            db.run(sqlUpdateUser, [duration_minutes, user_id]);

            // 4. Simpan Add-ons (jika ada)
            if (processedAddons.length > 0) {
                const sqlAddon = `INSERT INTO booking_addons (booking_id, menu_item_id, qty, price_per_item) 
                                  VALUES (?, ?, ?, ?)`;
                const stmt = db.prepare(sqlAddon);
                processedAddons.forEach(pa => {
                    stmt.run(booking_id, pa.id, pa.qty, pa.price_per_item);
                });
                stmt.finalize();
            }

            // Selesaikan transaksi
            db.run("COMMIT", (err) => {
                if (err) {
                    return res.status(500).json({ message: 'Gagal commit transaksi.', error: err.message });
                }
                const grandTotal = total_price + addonTotal;
                res.status(201).json({ 
                    message: `Booking berhasil! Total: Rp ${grandTotal.toLocaleString('id-ID')}`,
                    newRemainingTime: duration_minutes 
                });
            });
        });
    });
});
module.exports = router;

// --- 2. GET /api/booking/history ---
// (FUNGSI INI DIUBAH TOTAL)
router.get('/history', (req, res) => {
    const user_id = req.user.id;
    let combinedHistory = [];

    // --- Promise 1: Ambil Riwayat Booking (PC + Addons) ---
    const getBookings = new Promise((resolve, reject) => {
        const bookingsSql = `
            SELECT id, pc_id, duration_hours, pc_price, payment_method, created_at 
            FROM bookings 
            WHERE user_id = ? 
            ORDER BY created_at DESC
        `;
        db.all(bookingsSql, [user_id], (err, bookings) => {
            if (err) return reject(err);
            if (bookings.length === 0) return resolve([]);

            const addonsSql = `
                SELECT ba.qty, ba.price_per_item, mi.name 
                FROM booking_addons ba
                JOIN menu_items mi ON ba.menu_item_id = mi.id
                WHERE ba.booking_id = ?
            `;
            const bookingPromises = bookings.map(booking => {
                return new Promise((res, rej) => {
                    db.all(addonsSql, [booking.id], (err, addons) => {
                        if (err) return rej(err);
                        let addonsTotal = 0;
                        addons.forEach(a => { addonsTotal += (a.qty * a.price_per_item); });
                        res({
                            ...booking,
                            type: 'booking', // Tipe untuk frontend
                            addons: addons,
                            total_price: booking.pc_price + addonsTotal
                        });
                    });
                });
            });
            Promise.all(bookingPromises).then(resolve).catch(reject);
        });
    });

    // --- Promise 2: Ambil Riwayat Pesanan Makanan Terpisah ---
    const getFoodOrders = new Promise((resolve, reject) => {
        const ordersSql = `
            SELECT id, pc_number, total_price, created_at
            FROM food_orders 
            WHERE user_id = ? 
            ORDER BY created_at DESC
            LIMIT 10
        `;
        db.all(ordersSql, [user_id], (err, orders) => {
            if (err) return reject(err);
            if (orders.length === 0) return resolve([]);

            const itemsSql = `
                SELECT foi.qty, foi.price_per_item, mi.name 
                FROM food_order_items foi
                JOIN menu_items mi ON foi.menu_item_id = mi.id
                WHERE foi.order_id = ?
            `;
            const orderPromises = orders.map(order => {
                return new Promise((res, rej) => {
                    db.all(itemsSql, [order.id], (err, items) => {
                        if (err) return rej(err);
                        res({
                            ...order,
                            type: 'food_order', // Tipe untuk frontend
                            items: items
                        });
                    });
                });
            });
            Promise.all(orderPromises).then(resolve).catch(reject);
        });
    });

    // --- Jalankan kedua promise dan gabungkan hasilnya ---
    Promise.all([getBookings, getFoodOrders])
        .then(([bookingHistory, foodOrderHistory]) => {
            // Gabungkan kedua array
            const combinedHistory = [...bookingHistory, ...foodOrderHistory];
            // Urutkan berdasarkan tanggal (terbaru dulu)
            combinedHistory.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            res.json(combinedHistory);
        })
        .catch(error => {
            console.error("Error fetching combined history:", error);
            res.status(500).json({ message: 'Gagal mengambil detail riwayat.', error: error.message });
        });
});

module.exports = router;