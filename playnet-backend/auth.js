const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    // 1. Ambil header 'Authorization'
    const authHeader = req.headers['authorization'];
    // 2. Ambil token (format: "Bearer TOKEN_ANDA")
    const token = authHeader && authHeader.split(' ')[1];

    // 3. Jika tidak ada token, tolak
    if (token == null) {
        return res.status(401).json({ message: 'Unauthorized: Token tidak ditemukan.' });
    }

    // 4. Verifikasi token
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Forbidden: Token tidak valid.' });
        }
        
        // 5. Jika valid, simpan data user di request untuk dipakai di rute
        req.user = user;
        next(); // Lanjutkan ke rute yang dituju
    });
};

const authenticateAdmin = (req, res, next) => {
    // Pertama, cek apakah tokennya valid
    authenticateToken(req, res, () => {
        // Jika token valid, cek apakah user adalah admin
        if (req.user.is_admin === 1) {
            next(); // Lanjutkan, dia adalah admin
        } else {
            res.status(403).json({ message: 'Forbidden: Anda bukan admin.' });
        }
    });
};

module.exports = { authenticateToken, authenticateAdmin };
