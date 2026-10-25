/**
 * activation.js
 * نظام فحص وتفعيل ترخيص شاشة التلفزيون بواسطة الماك آدرس (MAC Address Activation)
 * يتصل بلوحة التحكم للتحقق من صلاحية الجهاز وجلب باقة الاشتراك تلقائياً
 */

(function (window) {
    'use strict';

    var ACTIVATION_STORAGE_KEY = 'tv_activation_cache';

    var Activation = {
        // رابط سيرفر لوحة التحكم السحابي المباشر الدائم
        panelUrl: (function () {
            try {
                return localStorage.getItem('tv_panel_url') || 'https://aziza-tv-panel.onrender.com';
            } catch (e) {
                return 'https://aziza-tv-panel.onrender.com';
            }
        })(),
        licenseInfo: null,
        isActivated: false,

        init: function () {
            this.loadCachedStatus();
            this.bindEvents();
            console.log('[Activation] Initialized TV MAC Activation System.');
        },

        loadCachedStatus: function () {
            try {
                var saved = localStorage.getItem(ACTIVATION_STORAGE_KEY);
                if (saved) {
                    this.licenseInfo = JSON.parse(saved);
                    var now = new Date().getTime();
                    var exp = new Date(this.licenseInfo.expireDate).getTime();
                    this.isActivated = this.licenseInfo.valid && (exp > now);
                }
            } catch (e) {}
        },

        saveStatus: function (info) {
            this.licenseInfo = info;
            try {
                localStorage.setItem(ACTIVATION_STORAGE_KEY, JSON.stringify(info));
            } catch (e) {}
        },

        bindEvents: function () {
            var self = this;

            // زر إعادة فحص التفعيل في شاشة التفعيل
            var btnRecheck = document.getElementById('btn-recheck-activation');
            if (btnRecheck) {
                btnRecheck.addEventListener('click', function () {
                    self.verifyWithPanel(true);
                });
            }

            // زر المتابعة اليدوية (إذا كان مسموحاً)
            var btnManual = document.getElementById('btn-activation-manual');
            if (btnManual) {
                btnManual.addEventListener('click', function () {
                    if (window.UI) {
                        window.UI.showScreen('screen-login');
                    }
                });
            }
        },

        verifyWithPanel: function (isManualCheck) {
            var self = this;
            if (!window.DeviceID) return Promise.reject(new Error('DeviceID not ready'));

            var mac = window.DeviceID.mac;
            var key = window.DeviceID.deviceKey;

            this.updateActivationScreenUI(mac, key, 'جاري فحص حالة التفعيل مع السيرفر...', 'checking');

            var checkUrl = this.panelUrl + '/api/check?mac=' + encodeURIComponent(mac) + '&key=' + encodeURIComponent(key);

            return new Promise(function (resolve, reject) {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', checkUrl, true);
                xhr.timeout = 8000;

                xhr.onload = function () {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            var data = JSON.parse(xhr.responseText);
                            self.saveStatus(data);
                            self.handleCheckResponse(data, isManualCheck);
                            resolve(data);
                        } catch (e) {
                            self.handleOfflineOrError('تنسيق رد الخادم غير صالح', isManualCheck);
                            reject(e);
                        }
                    } else {
                        self.handleOfflineOrError('تعذر التحقق من خادم التفعيل (Status ' + xhr.status + ')', isManualCheck);
                        reject(new Error('Status ' + xhr.status));
                    }
                };

                xhr.onerror = function () {
                    self.handleOfflineOrError('خادم لوحة التحكم غير متصل حالياً', isManualCheck);
                    reject(new Error('Network error'));
                };

                xhr.ontimeout = function () {
                    self.handleOfflineOrError('انتهت مهلة الاتصال بخادم التفعيل', isManualCheck);
                    reject(new Error('Timeout'));
                };

                xhr.send();
            });
        },

        handleCheckResponse: function (data, isManualCheck) {
            var mac = window.DeviceID ? window.DeviceID.mac : '';
            var key = window.DeviceID ? window.DeviceID.deviceKey : '';

            if (data.valid) {
                this.isActivated = true;
                var statusText = data.licenseType === 'trial' ? 
                    'فترة تجريبية مجانية (متبقي: ' + data.daysRemaining + ' يوم)' :
                    'الجهاز مفعل بنجاح (متبقي: ' + data.daysRemaining + ' يوم)';

                this.updateActivationScreenUI(mac, key, statusText, 'active');

                // تحديث بيانات الهيدر
                var userBadge = document.getElementById('header-user-name');
                if (userBadge) userBadge.textContent = data.customerName || 'عميل مفعل';

                // إذا قامت لوحة التحكم بربط باقة اشتراك Xtream Codes مع الماك آدرس
                if (data.playlist && data.playlist.server && data.playlist.username && data.playlist.password) {
                    console.log('[Activation] Auto-loading linked Xtream playlist from control panel...');
                    if (window.XtreamAPI && window.UI) {
                        window.UI.setLoading(true, 'تم التعرف على اشتراكك المربوط بالماك، جاري تسجيل الدخول...');
                        window.XtreamAPI.authenticate(data.playlist.server, data.playlist.username, data.playlist.password)
                            .then(function (res) {
                                window.UI.setLoading(false);
                                window.UI.updateHeaderUserInfo(res.user_info);
                                window.UI.showScreen('screen-home');
                                window.UI.showToast('تم تسجيل الدخول وتفعيل القنوات تلقائياً 🎉');
                            })
                            .catch(function (err) {
                                window.UI.setLoading(false);
                                window.UI.showScreen('screen-home');
                            });
                    }
                } else {
                    // لا يوجد اشتراك مرتبط، إما استعادة الجلسة السابقة أو شاشة الدخول
                    if (window.XtreamAPI && window.XtreamAPI.session) {
                        window.UI.showScreen('screen-home');
                    } else {
                        window.UI.showScreen('screen-login');
                    }
                }

                if (isManualCheck && window.UI) {
                    window.UI.showToast('حالة التفعيل: نشط ✔');
                }
            } else {
                this.isActivated = false;
                var msg = data.message || 'انتهت صلاحية تفعيل هذا الجهاز.';
                this.updateActivationScreenUI(mac, key, msg, 'expired');
                if (window.UI) {
                    window.UI.showScreen('screen-activation');
                }
            }
        },

        handleOfflineOrError: function (errMsg, isManualCheck) {
            var mac = window.DeviceID ? window.DeviceID.mac : '';
            var key = window.DeviceID ? window.DeviceID.deviceKey : '';

            // إذا كان هناك ترخيص مخزن مؤقتاً وما زال صالحاً نعتبره مفعلاً
            if (this.isActivated) {
                console.log('[Activation] Offline mode: continuing with valid cached license.');
                if (window.UI && window.XtreamAPI && window.XtreamAPI.session) {
                    window.UI.showScreen('screen-home');
                }
                return;
            }

            this.updateActivationScreenUI(mac, key, errMsg + ' (وضع التجربة غير مفعل)', 'offline');
            if (window.UI) {
                window.UI.showScreen('screen-activation');
            }
        },

        updateActivationScreenUI: function (mac, key, statusMsg, stateClass) {
            var macEl = document.getElementById('act-mac-address');
            var keyEl = document.getElementById('act-device-key');
            var statusEl = document.getElementById('act-status-msg');

            if (macEl) macEl.textContent = mac || '00:1A:79:00:00:00';
            if (keyEl) keyEl.textContent = key || '123456';
            if (statusEl) {
                statusEl.textContent = statusMsg;
                statusEl.className = 'activation-status-badge ' + (stateClass || '');
            }
        }
    };

    window.Activation = Activation;

})(window);
