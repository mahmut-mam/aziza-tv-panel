/**
 * server.js
 * خادم لوحة التحكم وإدارة تراخيص أجهزة التلفزيون الذكية عبر MAC Address
 * مبرمج بـ Node.js خالص (بدون أي مكتبات خارجية إضافية) ليعمل مباشرة وبأقصى سرعة
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const sessions = new Map();
const loginAttempts = new Map();
const deviceAttempts = new Map();
const SESSION_MS = 8 * 60 * 60 * 1000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const AUTH_FILE = path.join(__dirname, 'admin-auth.json');
let adminCredential = null;
if (fs.existsSync(AUTH_FILE)) {
    adminCredential = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    if (adminCredential.algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/.test(adminCredential.salt) || !/^[a-f0-9]{128}$/.test(adminCredential.hash)) throw new Error('Invalid admin credential file');
} else if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) throw new Error('Set ADMIN_PASSWORD to at least 12 characters for initial setup');
function verifyAdminPassword(password) {
    if (typeof password !== 'string' || password.length > 1024) return false;
    const supplied = adminCredential ? crypto.scryptSync(password, adminCredential.salt, 64) : crypto.createHash('sha256').update(password).digest();
    const expected = adminCredential ? Buffer.from(adminCredential.hash, 'hex') : crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
    return crypto.timingSafeEqual(supplied, expected);
}


// قراءة قاعدة البيانات
function readDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            var initial = {
                
                settings: { appName: 'aziza tv', trialDays: 7, whatsappContact: '+966500000000' },
                devices: []
            };
            if (!saveDB(initial)) throw new Error('Database initialization failed');
            return initial;
        }
        var data = fs.readFileSync(DB_FILE, 'utf8');
        const db = JSON.parse(data);
        if (!db || !db.settings || !Array.isArray(db.devices)) throw new Error('Invalid database');
        return db;
    } catch (e) {
        console.error('Error reading database:', e);
        throw new Error('Database unavailable');
    }
}

// حفظ قاعدة البيانات
function saveDB(data) {
    try {
        const tempFile = DB_FILE + '.tmp';
        fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
        fs.renameSync(tempFile, DB_FILE);
        return true;
    } catch (e) {
        console.error('Error saving database:', e);
        return false;
    }
}

// تنظيف وتوحيد صيغة الماك آدرس
function normalizeMac(mac) {
    if (typeof mac !== 'string') return '';
    const clean = mac.trim().replace(/[:-]/g, '').toUpperCase();
    return /^[A-F0-9]{12}$/.test(clean) ? clean.match(/.{2}/g).join(':') : '';
}

function validateDeviceBody(body) {
    const fields = ['mac', 'deviceKey', 'customerName', 'phone', 'notes', 'server', 'username', 'password'];
    if (fields.some(key => body[key] !== undefined && (typeof body[key] !== 'string' || body[key].length > 2048))) return false;
    if (body.deviceKey && !/^\d{6}$/.test(body.deviceKey)) return false;
    if (body.licenseType !== undefined && !['trial', 'monthly', 'yearly', 'lifetime'].includes(body.licenseType)) return false;
    if (body.status !== undefined && !['active', 'trial', 'suspended', 'expired'].includes(body.status)) return false;
    if (body.extendYears !== undefined && (!Number.isInteger(body.extendYears) || body.extendYears < 1 || body.extendYears > 70)) return false;
    if (body.expireDate !== undefined && (typeof body.expireDate !== 'string' || !Number.isFinite(Date.parse(body.expireDate)))) return false;
    if (body.playlist !== undefined && (!body.playlist || typeof body.playlist !== 'object' || Array.isArray(body.playlist) || ['server', 'username', 'password'].some(key => typeof body.playlist[key] !== 'string'))) return false;
    return true;
}

// إعداد خادم HTTP
const server = http.createServer((req, res) => {
    try {
    // إتاحة CORS لجميع الأجهزة والشاشات
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.url.startsWith('/api/check') || req.url.startsWith('/api/portal/lookup')) res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    function getRequestBody(callback) {
        let body = '', size = 0, rejected = false;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > 65536) {
                if (!rejected) sendJson(413, { message: 'Request too large' });
                rejected = true;
                return;
            }
            if (!rejected) body += chunk.toString();
        });
        req.on('end', () => {
            if (rejected) return;
            let parsed;
            try {
                parsed = body ? JSON.parse(body) : {};
                if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Invalid JSON object');
            } catch (err) { return sendJson(400, { message: 'Invalid JSON object' }); }
            try { callback(null, parsed); }
            catch (err) { console.error(err.message); sendJson(500, { message: 'Operation failed' }); }
        });
    }

    function sendJson(status, data) {
        if (res.writableEnded) return;
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(data));
    }

    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (pathname === '/api/check' || pathname === '/api/portal/lookup') {
        const now = Date.now();
        for (const [key, value] of deviceAttempts) if (value.until <= now) deviceAttempts.delete(key);
        const address = req.socket.remoteAddress;
        const attempt = deviceAttempts.get(address) || { count: 0, until: now + 60000 };
        if (attempt.count >= 120) return sendJson(429, { message: 'Too many device checks' });
        attempt.count++;
        deviceAttempts.set(address, attempt);
    }
    const sessionExpiry = sessions.get(token);
    if (pathname === '/api/logout' && req.method === 'POST') {
        sessions.delete(token);
        return sendJson(200, { success: true });
    }
    if (pathname === '/api/devices' || pathname.startsWith('/api/devices/') || pathname === '/api/admin/password') {
        if (!sessionExpiry || sessionExpiry <= Date.now()) {
            sessions.delete(token);
            return sendJson(401, { success: false, message: 'Authentication required' });
        }
    }

    // =========================================================================
    // 1. واجهات برمجة التطبيقات (REST API)
    // =========================================================================

    // فحص الصحة لخوادم الاستضافة (Render / Cloud Health Check)
    if (pathname === '/healthz' || pathname === '/health') {
        return sendJson(200, { status: 'ok', time: new Date().toISOString() });
    }

    // أ) فحص تفعيل جهاز التلفزيون (يتم استدعاؤها من شاشة سامسونج تلقائياً)
    if (pathname === '/api/check' && req.method === 'GET') {
        const queryMac = normalizeMac(parsedUrl.query.mac);
        const queryKey = typeof parsedUrl.query.key === 'string' ? parsedUrl.query.key.trim() : '';

        if (!queryMac || !/^\d{6}$/.test(queryKey)) {
            return sendJson(400, { success: false, message: 'MAC Address مطلوب' });
        }

        const db = readDB();
        let device = db.devices.find(d => normalizeMac(d.mac) === queryMac);

        // إذا لم يكن مسجلاً، نسجله كفترة تجريبية تلقائية (Trial) إذا كانت مفعلة
        if (!device) {
            const trialDays = Number(db.settings.trialDays ?? 7);
            if (!Number.isFinite(trialDays) || trialDays <= 0) return sendJson(403, { valid: false, message: 'Trial disabled' });
            const now = new Date();
            const exp = new Date(now.getTime() + (trialDays * 24 * 60 * 60 * 1000));
            
            device = {
                id: 'dev_' + crypto.randomUUID(),
                mac: queryMac,
                deviceKey: queryKey || crypto.randomInt(100000, 1000000).toString(),
                customerName: 'مستخدم تجريبي جديد',
                phone: '',
                licenseType: 'trial',
                status: 'trial',
                createdAt: now.toISOString(),
                expireDate: exp.toISOString(),
                notes: 'فترة تجريبية مجانية تلقائية',
                playlist: { server: '', username: '', password: '' }
            };
            db.devices.push(device);
            if (!saveDB(db)) return sendJson(500, { success: false, message: 'Database save failed' });
        }

        if (String(device.deviceKey) !== queryKey) return sendJson(403, { valid: false, message: 'Invalid device credentials' });

        // فحص صلاحية التاريخ
        const expDate = new Date(device.expireDate);
        const now = new Date();
        const isExpired = !Number.isFinite(expDate.getTime()) || expDate.getTime() <= now.getTime();
        const daysRemaining = Math.max(0, Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

        if (device.status === 'suspended') {
            return sendJson(200, {
                success: true,
                valid: false,
                status: 'suspended',
                message: 'تم إيقاف تفعيل هذا الجهاز من الإدارة.'
            });
        }

        if (isExpired) {
            device.status = 'expired';
            if (!saveDB(db)) return sendJson(500, { success: false, message: 'Database save failed' });
            return sendJson(200, {
                success: true,
                valid: false,
                status: 'expired',
                mac: device.mac,
                expireDate: device.expireDate,
                message: 'انتهت فترة اشتراك وتفعيل هذا الجهاز. يرجى التجديد للمتابعة.'
            });
        }

        return sendJson(200, {
            success: true,
            valid: true,
            status: device.status,
            mac: device.mac,
            customerName: device.customerName,
            licenseType: device.licenseType,
            expireDate: device.expireDate,
            daysRemaining: daysRemaining,
            playlist: device.playlist || {}
        });
    }

    // ب) تسجيل دخول المدير للوحة التحكم
    if (pathname === '/api/login' && req.method === 'POST') {
        getRequestBody((err, body) => {
            if (err) return sendJson(400, { error: 'Invalid JSON' });
            const db = readDB();
            const address = req.socket.remoteAddress;
            const now = Date.now();
            for (const [key, value] of loginAttempts) if (value.until <= now) loginAttempts.delete(key);
            const attempt = loginAttempts.get(address) || { count: 0, until: now + 900000 };
            if (attempt.count >= 10) return sendJson(429, { message: 'Too many login attempts' });
            if (body.username === ADMIN_USERNAME && verifyAdminPassword(body.password)) {
                loginAttempts.delete(address);
                for (const [key, expiry] of sessions) if (expiry <= now) sessions.delete(key);
                const token = crypto.randomBytes(32).toString('hex');
                sessions.set(token, now + SESSION_MS);
                return sendJson(200, { success: true, token, appName: db.settings.appName });
            } else {
                attempt.count++;
                loginAttempts.set(address, attempt);
                return sendJson(401, { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
            }
        });
        return;
    }

    if (pathname === '/api/admin/password' && req.method === 'POST') {
        getRequestBody((err, body) => {
            if (!sessions.get(token) || sessions.get(token) <= Date.now()) return sendJson(401, { message: 'Authentication required' });
            const address = req.socket.remoteAddress, now = Date.now();
            const attempt = loginAttempts.get(address) || { count: 0, until: now + 900000 };
            if (attempt.until > now && attempt.count >= 10) return sendJson(429, { message: 'محاولات كثيرة، حاول لاحقاً' });
            if (!verifyAdminPassword(body.currentPassword)) {
                if (attempt.until <= now) { attempt.count = 0; attempt.until = now + 900000; }
                attempt.count++; loginAttempts.set(address, attempt);
                return sendJson(400, { message: 'كلمة المرور الحالية غير صحيحة' });
            }
            if (typeof body.newPassword !== 'string' || body.newPassword.length < 12 || body.newPassword.length > 1024 || body.newPassword !== body.confirmPassword || body.newPassword === body.currentPassword) return sendJson(400, { message: 'اختر كلمة جديدة من 12 إلى 1024 محرفاً وأكّدها بشكل مطابق' });
            const salt = crypto.randomBytes(16).toString('hex');
            const credential = { algorithm: 'scrypt', salt, hash: crypto.scryptSync(body.newPassword, salt, 64).toString('hex') };
            try {
                fs.writeFileSync(AUTH_FILE + '.tmp', JSON.stringify(credential), { encoding: 'utf8', mode: 0o600 });
                fs.renameSync(AUTH_FILE + '.tmp', AUTH_FILE);
            } catch (error) { return sendJson(500, { message: 'تعذر حفظ كلمة المرور؛ لم يتم تغييرها' }); }
            adminCredential = credential;
            sessions.clear(); loginAttempts.delete(address);
            return sendJson(200, { success: true, message: 'تم تغيير كلمة المرور. سجّل الدخول بالكلمة الجديدة' });
        });
        return;
    }

    // ج) جلب قائمة الأجهزة والإحصائيات
    if (pathname === '/api/devices' && req.method === 'GET') {
        const db = readDB();
        const now = new Date().getTime();

        let stats = { total: db.devices.length, active: 0, trial: 0, expired: 0 };
        db.devices.forEach(d => {
            const exp = new Date(d.expireDate).getTime();
            if (d.status === 'suspended') {
                stats.expired++;
            } else if (exp < now) {
                stats.expired++;
            } else if (d.licenseType === 'trial') {
                stats.trial++;
            } else {
                stats.active++;
            }
        });

        return sendJson(200, { devices: db.devices, stats: stats, settings: db.settings });
    }

    // د) إضافة جهاز ماك جديد من لوحة التحكم
    if (pathname === '/api/devices' && req.method === 'POST') {
        getRequestBody((err, body) => {
            if (err) return sendJson(400, { error: 'Invalid JSON' });
            const db = readDB();

            if (!validateDeviceBody(body)) return sendJson(400, { message: 'Invalid device fields' });
            body.licenseType = body.licenseType || 'yearly';
            const mac = normalizeMac(body.mac);
            if (!mac) return sendJson(400, { message: 'يجب كتابة عنوان MAC صالح' });

            // التحقق من عدم التكرار
            if (db.devices.some(d => normalizeMac(d.mac) === mac)) {
                return sendJson(400, { message: 'هذا الماك آدرس مسجل بالفعل في النظام!' });
            }

            const now = new Date();
            let expireDate = new Date();

            if (body.licenseType === 'lifetime') {
                expireDate.setFullYear(expireDate.getFullYear() + 70);
            } else if (body.licenseType === 'yearly') {
                expireDate.setFullYear(expireDate.getFullYear() + 1);
            } else if (body.licenseType === 'monthly') {
                expireDate.setMonth(expireDate.getMonth() + 1);
            } else {
                expireDate.setDate(expireDate.getDate() + (db.settings.trialDays || 7));
            }

            const newDevice = {
                id: 'dev_' + crypto.randomUUID(),
                mac: mac,
                deviceKey: (body.deviceKey || crypto.randomInt(100000, 1000000)).toString(),
                customerName: body.customerName || 'عميل جديد',
                phone: body.phone || '',
                licenseType: body.licenseType || 'yearly',
                status: 'active',
                createdAt: now.toISOString(),
                expireDate: expireDate.toISOString(),
                notes: body.notes || '',
                playlist: {
                    server: body.server || '',
                    username: body.username || '',
                    password: body.password || ''
                }
            };

            db.devices.unshift(newDevice);
            if (!saveDB(db)) return sendJson(500, { success: false, message: 'Database save failed' });
            return sendJson(201, { success: true, device: newDevice });
        });
        return;
    }

    // د-2) التفعيل الجماعي لعدة أجهزة ماك بنقرة واحدة (Bulk Activation)
    if (pathname === '/api/devices/bulk' && req.method === 'POST') {
        getRequestBody((err, body) => {
            if (err) return sendJson(400, { error: 'Invalid JSON' });
            const db = readDB();
            if (!validateDeviceBody(body) || !Array.isArray(body.macList) || body.macList.length > 500 || body.macList.some(item => !normalizeMac(typeof item === 'string' ? item : item && item.mac))) return sendJson(400, { message: 'Invalid device list' });
            const rawList = body.macList;
            const licenseType = body.licenseType || 'yearly';
            const now = new Date();

            let addedCount = 0;
            let updatedCount = 0;

            rawList.forEach(item => {
                const macStr = typeof item === 'string' ? item : item.mac;
                const mac = normalizeMac(macStr);
                if (!mac) return;

                let expireDate = new Date();
                if (licenseType === 'lifetime') {
                    expireDate.setFullYear(expireDate.getFullYear() + 70);
                } else if (licenseType === 'yearly') {
                    expireDate.setFullYear(expireDate.getFullYear() + 1);
                } else if (licenseType === 'monthly') {
                    expireDate.setMonth(expireDate.getMonth() + 1);
                } else {
                    expireDate.setDate(expireDate.getDate() + (db.settings.trialDays || 7));
                }

                const existingIdx = db.devices.findIndex(d => normalizeMac(d.mac) === mac);
                if (existingIdx !== -1) {
                    db.devices[existingIdx].status = 'active';
                    db.devices[existingIdx].expireDate = expireDate.toISOString();
                    db.devices[existingIdx].licenseType = licenseType;
                    if (body.server) db.devices[existingIdx].playlist = { server: body.server, username: body.username, password: body.password };
                    updatedCount++;
                } else {
                    db.devices.unshift({
                        id: 'dev_' + crypto.randomUUID(),
                        mac: mac,
                        deviceKey: crypto.randomInt(100000, 1000000).toString(),
                        customerName: (typeof item === 'object' && item.name) ? item.name : 'عميل جديد',
                        phone: (typeof item === 'object' && item.phone) ? item.phone : '',
                        licenseType: licenseType,
                        status: 'active',
                        createdAt: now.toISOString(),
                        expireDate: expireDate.toISOString(),
                        notes: 'تفعيل جماعي',
                        playlist: {
                            server: body.server || '',
                            username: body.username || '',
                            password: body.password || ''
                        }
                    });
                    addedCount++;
                }
            });

            if (!saveDB(db)) return sendJson(500, { success: false, message: 'Database save failed' });
            return sendJson(200, { success: true, added: addedCount, updated: updatedCount });
        });
        return;
    }

    // هـ) تعديل أو تمديد جهاز
    if (pathname.startsWith('/api/devices/') && req.method === 'PUT') {
        const id = pathname.replace('/api/devices/', '');
        getRequestBody((err, body) => {
            if (err) return sendJson(400, { error: 'Invalid JSON' });
            const db = readDB();
            const idx = db.devices.findIndex(d => d.id === id);

            if (idx === -1) return sendJson(404, { message: 'الجهاز غير موجود' });

            if (!validateDeviceBody(body)) return sendJson(400, { message: 'Invalid device fields' });
            const current = db.devices[idx];
            if (body.licenseType !== undefined) current.licenseType = body.licenseType;
            if (body.customerName !== undefined) current.customerName = body.customerName;
            if (body.phone !== undefined) current.phone = body.phone;
            if (body.status !== undefined) current.status = body.status;
            if (body.notes !== undefined) current.notes = body.notes;
            if (body.deviceKey !== undefined) current.deviceKey = body.deviceKey;

            // تمديد المدة
            if (body.extendYears) {
                const exp = new Date(Math.max(Date.now(), new Date(current.expireDate).getTime() || 0));
                exp.setFullYear(exp.getFullYear() + parseInt(body.extendYears, 10));
                current.expireDate = exp.toISOString();
                current.status = 'active';
            } else if (body.expireDate) {
                current.expireDate = body.expireDate;
            }

            // تحديث بيانات الاشتراك Xtream
            if (body.playlist) {
                current.playlist = body.playlist;
            } else if (body.server !== undefined) {
                current.playlist = {
                    server: body.server,
                    username: body.username,
                    password: body.password
                };
            }

            if (!saveDB(db)) return sendJson(500, { success: false, message: 'Database save failed' });
            return sendJson(200, { success: true, device: current });
        });
        return;
    }

    // و) حذف جهاز
    if (pathname.startsWith('/api/devices/') && req.method === 'DELETE') {
        const id = pathname.replace('/api/devices/', '');
        const db = readDB();
        const initialLen = db.devices.length;
        db.devices = db.devices.filter(d => d.id !== id);

        if (db.devices.length === initialLen) {
            return sendJson(404, { message: 'الجهاز غير موجود' });
        }

        if (!saveDB(db)) return sendJson(500, { success: false, message: 'Database save failed' });
        return sendJson(200, { success: true });
    }

    // ز) بوابة الخدمة الذاتية للعميل (Portal Lookup)
    if (pathname === '/api/portal/lookup' && req.method === 'GET') {
        const queryMac = normalizeMac(parsedUrl.query.mac);
        const queryKey = typeof parsedUrl.query.key === 'string' ? parsedUrl.query.key.trim() : '';

        const db = readDB();
        const device = db.devices.find(d => normalizeMac(d.mac) === queryMac && String(d.deviceKey) === queryKey);

        if (!device) {
            return sendJson(404, { message: 'بيانات الماك آدرس أو كود الجهاز غير صحيحة.' });
        }

        return sendJson(200, {
            mac: device.mac,
            customerName: device.customerName,
            status: device.status,
            expireDate: device.expireDate,
            playlist: {
                server: device.playlist?.server || '',
                username: device.playlist?.username || ''
            }
        });
    }

    // =========================================================================
    // 2. تقديم صفحات الويب الثابتة (Dashboard & Portal)
    // =========================================================================
    let filePath = '';
    if (pathname === '/' || pathname === '/index.html') {
        filePath = path.join(PUBLIC_DIR, 'index.html');
    } else if (pathname === '/portal' || pathname === '/portal.html') {
        filePath = path.join(PUBLIC_DIR, 'portal.html');
    } else if (pathname === '/tv' || pathname === '/tv/') {
        filePath = path.join(PUBLIC_DIR, 'tv', 'index.html');
    } else {
        filePath = path.join(PUBLIC_DIR, pathname);
    }

    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch (_) { return sendJson(400, { message: 'Invalid path' }); }
    if (decoded.includes('\\') || decoded.split('/').includes('..') || decoded.includes('\0')) return sendJson(403, { message: 'Forbidden' });
    if (filePath === path.join(PUBLIC_DIR, pathname)) filePath = path.resolve(PUBLIC_DIR, '.' + decoded);
    const relative = path.relative(PUBLIC_DIR, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return sendJson(403, { message: 'Forbidden' });
    try {
        const real = fs.realpathSync(filePath);
        if (!real.startsWith(fs.realpathSync(PUBLIC_DIR) + path.sep)) return sendJson(403, { message: 'Forbidden' });
    } catch (_) { return sendJson(404, { message: 'Not found' }); }

    const extname = path.extname(filePath);
    let contentType = 'text/html; charset=utf-8';
    if (extname === '.js') contentType = 'text/javascript; charset=utf-8';
    if (extname === '.css') contentType = 'text/css; charset=utf-8';
    if (extname === '.json') contentType = 'application/json; charset=utf-8';
    if (extname === '.png') contentType = 'image/png';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('404 Page Not Found');
            } else {
                res.writeHead(500);
                res.end('Server Error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
    } catch (err) {
        console.error(err.message);
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
        if (!res.writableEnded) res.end(JSON.stringify({ success: false, message: 'Server error' }));
    }
});

server.listen(PORT, () => {
    console.log(`[IPTV Control Panel] Running at http://localhost:${PORT}`);
    console.log(`[Customer Portal] Running at http://localhost:${PORT}/portal`);
});
