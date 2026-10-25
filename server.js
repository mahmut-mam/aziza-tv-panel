/**
 * server.js
 * خادم لوحة التحكم وإدارة تراخيص أجهزة التلفزيون الذكية عبر MAC Address
 * مبرمج بـ Node.js خالص (بدون أي مكتبات خارجية إضافية) ليعمل مباشرة وبأقصى سرعة
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// قراءة قاعدة البيانات
function readDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            var initial = {
                admin: { username: 'admin', password: 'admin123' },
                settings: { appName: 'aziza tv', trialDays: 7, whatsappContact: '+966500000000' },
                devices: []
            };
            fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
            return initial;
        }
        var data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error('Error reading database:', e);
        return { admin: { username: 'admin', password: 'admin123' }, settings: {}, devices: [] };
    }
}

// حفظ قاعدة البيانات
function saveDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('Error saving database:', e);
        return false;
    }
}

// تنظيف وتوحيد صيغة الماك آدرس
function normalizeMac(mac) {
    if (!mac) return '';
    return mac.trim().toUpperCase().replace(/[^A-F0-9]/g, '').replace(/(.{2})(?=.)/g, '$1:');
}

// إعداد خادم HTTP
const server = http.createServer((req, res) => {
    // إتاحة CORS لجميع الأجهزة والشاشات
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // استلام بيانات POST/PUT كـ JSON
    function getRequestBody(callback) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                callback(null, body ? JSON.parse(body) : {});
            } catch (err) {
                callback(err, null);
            }
        });
    }

    function sendJson(status, data) {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
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
        const queryKey = (parsedUrl.query.key || '').trim();

        if (!queryMac) {
            return sendJson(400, { success: false, message: 'MAC Address مطلوب' });
        }

        const db = readDB();
        let device = db.devices.find(d => normalizeMac(d.mac) === queryMac);

        // إذا لم يكن مسجلاً، نسجله كفترة تجريبية تلقائية (Trial) إذا كانت مفعلة
        if (!device) {
            const trialDays = db.settings.trialDays || 7;
            const now = new Date();
            const exp = new Date(now.getTime() + (trialDays * 24 * 60 * 60 * 1000));
            
            device = {
                id: 'dev_' + Date.now(),
                mac: queryMac,
                deviceKey: queryKey || Math.floor(100000 + Math.random() * 900000).toString(),
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
            saveDB(db);
        }

        // فحص صلاحية التاريخ
        const expDate = new Date(device.expireDate);
        const now = new Date();
        const isExpired = expDate.getTime() < now.getTime();
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
            saveDB(db);
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
            deviceKey: device.deviceKey,
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
            if (body.username === db.admin.username && body.password === db.admin.password) {
                return sendJson(200, { success: true, token: 'admin_session_token_' + Date.now(), appName: db.settings.appName });
            } else {
                return sendJson(401, { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
            }
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
                id: 'dev_' + Date.now(),
                mac: mac,
                deviceKey: (body.deviceKey || Math.floor(100000 + Math.random() * 900000)).toString(),
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
            saveDB(db);
            return sendJson(201, { success: true, device: newDevice });
        });
        return;
    }

    // د-2) التفعيل الجماعي لعدة أجهزة ماك بنقرة واحدة (Bulk Activation)
    if (pathname === '/api/devices/bulk' && req.method === 'POST') {
        getRequestBody((err, body) => {
            if (err) return sendJson(400, { error: 'Invalid JSON' });
            const db = readDB();
            const rawList = body.macList || [];
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
                        id: 'dev_' + (Date.now() + Math.floor(Math.random() * 1000)),
                        mac: mac,
                        deviceKey: Math.floor(100000 + Math.random() * 900000).toString(),
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

            saveDB(db);
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

            const current = db.devices[idx];
            if (body.customerName !== undefined) current.customerName = body.customerName;
            if (body.phone !== undefined) current.phone = body.phone;
            if (body.status !== undefined) current.status = body.status;
            if (body.notes !== undefined) current.notes = body.notes;
            if (body.deviceKey !== undefined) current.deviceKey = body.deviceKey;

            // تمديد المدة
            if (body.extendYears) {
                const exp = new Date(current.expireDate);
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

            saveDB(db);
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

        saveDB(db);
        return sendJson(200, { success: true });
    }

    // ز) بوابة الخدمة الذاتية للعميل (Portal Lookup)
    if (pathname === '/api/portal/lookup' && req.method === 'GET') {
        const queryMac = normalizeMac(parsedUrl.query.mac);
        const queryKey = (parsedUrl.query.key || '').trim();

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
});

server.listen(PORT, () => {
    console.log(`[IPTV Control Panel] Running at http://localhost:${PORT}`);
    console.log(`[Customer Portal] Running at http://localhost:${PORT}/portal`);
});
