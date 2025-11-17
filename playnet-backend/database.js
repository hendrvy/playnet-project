const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./playnet.db');

// --- DATA MENU AWAL ---
const initialMenu = [
    { id: 'f1', name: 'Indomie Goreng', price: 8000, icon: '🍜', category: 'food' },
    { id: 'f2', name: 'Nasi Goreng', price: 15000, icon: '🍚', category: 'food' },
    { id: 'f3', name: 'Kentang Goreng', price: 12000, icon: '🍟', category: 'food' },
    { id: 'm1', name: 'Kopi Susu', price: 7000, icon: '☕', category: 'drink' },
    { id: 'm2', name: 'Es Teh Manis', price: 5000, icon: '🥤', category: 'drink' },
    { id: 'm3', name: 'Air Mineral', price: 4000, icon: '💧', category: 'drink' },
];

// --- DATA GAME AWAL ---
const initialGames = [
    { title: 'Valorant', genre: 'fps', icon: '🎯' },
    { title: 'Dota 2', genre: 'moba', icon: '⚔️' },
    { title: 'Genshin Impact', genre: 'rpg', icon: '✨' },
    { title: 'League of Legends', genre: 'moba', icon: '🏆' },
    { title: 'Counter-Strike 2', genre: 'fps', icon: '💣' },
    { title: 'Apex Legends', genre: 'fps', icon: '🏃‍♂️' },
    { title: 'Forza Horizon 5', genre: 'racing', icon: '🏎️' },
    { title: 'Elden Ring', genre: 'rpg', icon: '🔥' },
];

const initDb = () => {
    db.serialize(() => {
        // --- Tabel Inti ---
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                username TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                remaining_time_minutes INTEGER DEFAULT 0,
                is_admin INTEGER DEFAULT 0
            )
        `);
        db.run(`
            CREATE TABLE IF NOT EXISTS pcs (
                id INTEGER PRIMARY KEY,
                is_booked INTEGER DEFAULT 0 CHECK(is_booked IN (0, 1))
            )
        `);
        db.run(`
            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                genre TEXT NOT NULL,
                icon TEXT
            )
        `);
        db.run(`
            CREATE TABLE IF NOT EXISTS bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                pc_id INTEGER,
                duration_hours INTEGER NOT NULL,
                pc_price INTEGER NOT NULL,
                payment_method TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (pc_id) REFERENCES pcs (id)
            )
        `);
        db.run(`
            CREATE TABLE IF NOT EXISTS menu_items (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                price INTEGER NOT NULL,
                icon TEXT,
                category TEXT NOT NULL
            )
        `);
        db.run(`
            CREATE TABLE IF NOT EXISTS booking_addons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                booking_id INTEGER NOT NULL,
                menu_item_id TEXT NOT NULL,
                qty INTEGER NOT NULL,
                price_per_item INTEGER NOT NULL,
                FOREIGN KEY (booking_id) REFERENCES bookings (id),
                FOREIGN KEY (menu_item_id) REFERENCES menu_items (id)
            )
        `);
        db.run(`
            CREATE TABLE IF NOT EXISTS food_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pc_number INTEGER NOT NULL,
                total_price INTEGER NOT NULL,
                is_paid INTEGER DEFAULT 0,
                user_id INTEGER, 
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) 
            )
        `);
        db.run(`
            CREATE TABLE IF NOT EXISTS food_order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                menu_item_id TEXT NOT NULL,
                qty INTEGER NOT NULL,
                price_per_item INTEGER NOT NULL,
                FOREIGN KEY (order_id) REFERENCES food_orders (id),
                FOREIGN KEY (menu_item_id) REFERENCES menu_items (id)
            )
        `);

        // --- TABEL BARU UNTUK AUDIT LOG ADMIN ---
        db.run(`
            CREATE TABLE IF NOT EXISTS admin_audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_username TEXT NOT NULL,
                action_type TEXT NOT NULL,
                details TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // --- Isi Data Awal ---
        db.get("SELECT COUNT(*) as count FROM pcs", (err, row) => {
            if (row.count === 0) {
                const stmt = db.prepare("INSERT INTO pcs (id, is_booked) VALUES (?, ?)");
                for (let i = 1; i <= 25; i++) {
                    stmt.run(i, 0); // Mulai dengan semua 0 (tersedia)
                }
                stmt.finalize();
                console.log('Database: 25 PCs diinisialisasi.');
            }
        });
        
        db.get("SELECT COUNT(*) as count FROM games", (err, row) => {
            if (row.count === 0) {
                const stmt = db.prepare("INSERT INTO games (title, genre, icon) VALUES (?, ?, ?)");
                initialGames.forEach(g => stmt.run(g.title, g.genre, g.icon));
                stmt.finalize();
                console.log('Database: Daftar game diinisialisasi.');
            }
        });

        db.get("SELECT COUNT(*) as count FROM menu_items", (err, row) => {
            if (row.count === 0) {
                const stmt = db.prepare("INSERT INTO menu_items (id, name, price, icon, category) VALUES (?, ?, ?, ?, ?)");
                initialMenu.forEach(item => {
                    stmt.run(item.id, item.name, item.price, item.icon, item.category);
                });
                stmt.finalize();
                console.log('Database: Menu makanan diinisialisasi.');
            }
        });
    });
};

module.exports = { db, initDb };