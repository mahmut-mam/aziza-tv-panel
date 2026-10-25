/**
 * panel.js
 * منطق إدارة لوحة تحكم التراخيص وحفظ واسترجاع بيانات الأجهزة
 */

(function () {
    'use strict';

    var allDevices = [];
    var currentFilter = 'all';
    var searchQuery = '';

    // عناصر DOM
    var loginModal = document.getElementById('login-modal');
    var loginForm = document.getElementById('admin-login-form');
    var loginErrMsg = document.getElementById('login-err-msg');
    var devicesTbody = document.getElementById('devices-tbody');
    var searchInput = document.getElementById('search-input');
    var deviceModal = document.getElementById('device-modal');
    var deviceForm = document.getElementById('device-form');

    // فحص تسجيل الدخول
    function checkAuth() {
        var token = sessionStorage.getItem('admin_token');
        if (token) {
            loginModal.classList.add('hidden');
            loadDevices();
        } else {
            loginModal.classList.remove('hidden');
        }
    }

    loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var u = document.getElementById('admin-user').value.trim();
        var p = document.getElementById('admin-pass').value.trim();

        fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                sessionStorage.setItem('admin_token', data.token);
                loginModal.classList.add('hidden');
                loadDevices();
                showToast('مرحباً بك! تم تسجيل الدخول بنجاح');
            } else {
                loginErrMsg.textContent = data.message || 'بيانات الدخول غير صحيحة';
                loginErrMsg.style.display = 'block';
            }
        })
        .catch(err => {
            loginErrMsg.textContent = 'خطأ اتصال بالخادم: ' + err.message;
            loginErrMsg.style.display = 'block';
        });
    });

    document.getElementById('btn-logout').addEventListener('click', function () {
        sessionStorage.removeItem('admin_token');
        loginModal.classList.remove('hidden');
    });

    // جلب قائمة الأجهزة
    function loadDevices() {
        fetch('/api/devices')
            .then(res => res.json())
            .then(data => {
                allDevices = data.devices || [];
                updateStats(data.stats);
                renderTable();
            })
            .catch(err => {
                showToast('تعذر تحميل بيانات الأجهزة: ' + err.message);
            });
    }

    function updateStats(stats) {
        if (!stats) return;
        document.getElementById('stat-total').textContent = stats.total || 0;
        document.getElementById('stat-active').textContent = stats.active || 0;
        document.getElementById('stat-trial').textContent = stats.trial || 0;
        document.getElementById('stat-expired').textContent = stats.expired || 0;
    }

    function renderTable() {
        if (!devicesTbody) return;
        devicesTbody.innerHTML = '';

        var filtered = allDevices.filter(function (dev) {
            // فلتر الحالة
            var now = new Date().getTime();
            var exp = new Date(dev.expireDate).getTime();
            var isExpired = exp < now || dev.status === 'suspended';

            if (currentFilter === 'active' && (isExpired || dev.licenseType === 'trial')) return false;
            if (currentFilter === 'trial' && dev.licenseType !== 'trial') return false;
            if (currentFilter === 'expired' && !isExpired) return false;

            // فلتر البحث
            if (searchQuery) {
                var q = searchQuery.toLowerCase();
                var matchMac = (dev.mac || '').toLowerCase().indexOf(q) !== -1;
                var matchName = (dev.customerName || '').toLowerCase().indexOf(q) !== -1;
                var matchPhone = (dev.phone || '').toLowerCase().indexOf(q) !== -1;
                return matchMac || matchName || matchPhone;
            }

            return true;
        });

        if (filtered.length === 0) {
            devicesTbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 40px; color: var(--text-muted);">لا توجد أجهزة مطابقة للبحث أو الفلتر المختار</td></tr>';
            return;
        }

        filtered.forEach(function (dev) {
            var tr = document.createElement('tr');

            var now = new Date().getTime();
            var expTime = new Date(dev.expireDate).getTime();
            var isExpired = expTime < now;
            var daysRemaining = Math.max(0, Math.ceil((expTime - now) / (1000 * 60 * 60 * 24)));

            var statusHtml = '';
            if (dev.status === 'suspended') {
                statusHtml = '<span class="badge-status status-expired">⛔ موقوف</span>';
            } else if (isExpired) {
                statusHtml = '<span class="badge-status status-expired">منتهي الصلاحية</span>';
            } else if (dev.licenseType === 'trial') {
                statusHtml = '<span class="badge-status status-trial">تجريبي (' + daysRemaining + ' يوم)</span>';
            } else {
                statusHtml = '<span class="badge-status status-active">مفعل (' + daysRemaining + ' يوم)</span>';
            }

            var licenseNames = {
                yearly: 'اشتراك سنوي',
                lifetime: 'مدى الحياة',
                monthly: 'شهري',
                trial: 'تجريبي'
            };

            var dStr = new Date(dev.expireDate).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });

            var playlistInfo = dev.playlist && dev.playlist.server ? 
                '<span style="color: var(--accent-green); font-size: 13px;">🔗 مـربـوط (' + (dev.playlist.username || 'مستخدم') + ')</span>' :
                '<span style="color: var(--text-muted); font-size: 13px;">غير مرتبط</span>';

            tr.innerHTML = 
                '<td><span class="mac-code">' + dev.mac + '</span></td>' +
                '<td><span style="font-family: monospace; font-weight: 700;">' + (dev.deviceKey || '-') + '</span></td>' +
                '<td><strong>' + (dev.customerName || 'بدون اسم') + '</strong></td>' +
                '<td>' + (dev.phone || '-') + '</td>' +
                '<td>' + (licenseNames[dev.licenseType] || dev.licenseType) + '</td>' +
                '<td>' + dStr + '</td>' +
                '<td>' + playlistInfo + '</td>' +
                '<td>' + statusHtml + '</td>' +
                '<td style="text-align: center;">' +
                    '<div class="table-actions" style="justify-content: center;">' +
                        '<button class="btn-action-sm btn-extend" title="تمديد 1 سنة إضافية">⚡ +سنة</button>' +
                        '<button class="btn-action-sm btn-edit" title="تعديل أو ربط اشتراك">✏️ تعديل</button>' +
                        '<button class="btn-action-sm btn-delete" title="حذف الجهاز">🗑️</button>' +
                    '</div>' +
                '</td>';

            // أحداث الأزرار
            var btnExt = tr.querySelector('.btn-extend');
            btnExt.addEventListener('click', function () {
                extendDevice(dev.id);
            });

            var btnEdit = tr.querySelector('.btn-edit');
            btnEdit.addEventListener('click', function () {
                openEditModal(dev);
            });

            var btnDel = tr.querySelector('.btn-delete');
            btnDel.addEventListener('click', function () {
                deleteDevice(dev.id, dev.mac);
            });

            devicesTbody.appendChild(tr);
        });
    }

    // تمديد الجهاز سنة
    function extendDevice(id) {
        if (!confirm('هل تريد تمديد ترخيص هذا الجهاز لمدة سنة كاملة وتفعيله؟')) return;

        fetch('/api/devices/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ extendYears: 1 })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast('تم تمديد الترخيص لسنة إضافية بنجاح ⚡');
                loadDevices();
            }
        });
    }

    // حذف جهاز
    function deleteDevice(id, mac) {
        if (!confirm('هل أنت متأكد من حذف الجهاز صاحب الماك: ' + mac + ' نهائياً؟')) return;

        fetch('/api/devices/' + id, { method: 'DELETE' })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    showToast('تم حذف الجهاز');
                    loadDevices();
                }
            });
    }

    // فتح مودال الإضافة
    document.getElementById('btn-add-device').addEventListener('click', function () {
        document.getElementById('modal-device-title').textContent = 'إضافة جهاز ماك جديد';
        document.getElementById('edit-device-id').value = '';
        document.getElementById('device-mac').value = '';
        document.getElementById('device-key').value = '';
        document.getElementById('device-customer').value = '';
        document.getElementById('device-phone').value = '';
        document.getElementById('device-license').value = 'yearly';
        document.getElementById('device-server').value = '';
        document.getElementById('device-user').value = '';
        document.getElementById('device-pass').value = '';
        document.getElementById('device-notes').value = '';

        deviceModal.classList.remove('hidden');
    });

    // فتح مودال التعديل
    function openEditModal(dev) {
        document.getElementById('modal-device-title').textContent = 'تعديل الجهاز وباقة الاشتراك: ' + dev.mac;
        document.getElementById('edit-device-id').value = dev.id;
        document.getElementById('device-mac').value = dev.mac;
        document.getElementById('device-key').value = dev.deviceKey || '';
        document.getElementById('device-customer').value = dev.customerName || '';
        document.getElementById('device-phone').value = dev.phone || '';
        document.getElementById('device-license').value = dev.licenseType || 'yearly';
        document.getElementById('device-server').value = dev.playlist?.server || '';
        document.getElementById('device-user').value = dev.playlist?.username || '';
        document.getElementById('device-pass').value = dev.playlist?.password || '';
        document.getElementById('device-notes').value = dev.notes || '';

        deviceModal.classList.remove('hidden');
    }

    document.getElementById('btn-close-device-modal').addEventListener('click', function () {
        deviceModal.classList.add('hidden');
    });
    document.getElementById('btn-cancel-device-modal').addEventListener('click', function () {
        deviceModal.classList.add('hidden');
    });

    // حفظ الجهاز (إضافة أو تعديل)
    deviceForm.addEventListener('submit', function (e) {
        e.preventDefault();

        var editId = document.getElementById('edit-device-id').value;
        var payload = {
            mac: document.getElementById('device-mac').value.trim(),
            deviceKey: document.getElementById('device-key').value.trim(),
            customerName: document.getElementById('device-customer').value.trim(),
            phone: document.getElementById('device-phone').value.trim(),
            licenseType: document.getElementById('device-license').value,
            server: document.getElementById('device-server').value.trim(),
            username: document.getElementById('device-user').value.trim(),
            password: document.getElementById('device-pass').value.trim(),
            notes: document.getElementById('device-notes').value.trim()
        };

        var method = editId ? 'PUT' : 'POST';
        var endpoint = editId ? ('/api/devices/' + editId) : '/api/devices';

        fetch(endpoint, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                deviceModal.classList.add('hidden');
                showToast(editId ? 'تم تحديث بيانات الجهاز بنجاح' : 'تمت إضافة الجهاز وتفعيله بنجاح 🎉');
                loadDevices();
            } else {
                alert(data.message || 'فشلت العملية');
            }
        })
        .catch(err => {
            alert('حدث خطأ: ' + err.message);
        });
    });

    // أحداث الفلاتر والبحث
    document.querySelectorAll('.filter-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilter = tab.getAttribute('data-filter');
            renderTable();
        });
    });

    searchInput.addEventListener('input', function (e) {
        searchQuery = e.target.value.trim();
        renderTable();
    });

    function showToast(msg) {
        var t = document.getElementById('toast-msg');
        if (!t) return;
        t.textContent = msg;
        t.style.display = 'block';
        setTimeout(function () {
            t.style.display = 'none';
        }, 3000);
    }

    // بدء التشغيل
    checkAuth();

})();
