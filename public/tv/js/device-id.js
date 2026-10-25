/**
 * device-id.js
 * قراءة وتوليد عنوان الماك آدرس وكود الجهاز لشاشات سامسونج الذكية
 * يدعم كلاً من نظام Samsung Tizen الرسمي والمتصفح
 */

(function (window) {
    'use strict';

    var DEVICE_STORAGE_KEY = 'samsung_tv_device_id';

    var DeviceID = {
        mac: '',
        deviceKey: '',

        init: function () {
            this.loadOrGenerate();
            console.log('[DeviceID] Initialized Device MAC:', this.mac, 'Key:', this.deviceKey);
        },

        loadOrGenerate: function () {
            // محاولة القراءة من ذاكرة التخزين المحلية أولاً
            try {
                var saved = localStorage.getItem(DEVICE_STORAGE_KEY);
                if (saved) {
                    var parsed = JSON.parse(saved);
                    if (parsed.mac && parsed.key) {
                        this.mac = parsed.mac;
                        this.deviceKey = parsed.key;
                        return;
                    }
                }
            } catch (e) {}

            // محاولة جلب الماك آدرس الحقيقي من نظام سامسونج تايزن
            var realMac = this.getTizenHardwareMac();

            if (realMac) {
                this.mac = realMac;
            } else {
                // توليد ماك آدرس قياسي مخصص لشاشات التلفزيون (يبدأ بـ 00:1A:79 الشهير لأجهزة الاستقبال)
                this.mac = this.generateRandomMac();
            }

            this.deviceKey = Math.floor(100000 + Math.random() * 900000).toString();

            // حفظ المعرف بشكل دائم في ذاكرة الجهاز
            try {
                localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify({
                    mac: this.mac,
                    key: this.deviceKey,
                    createdAt: new Date().toISOString()
                }));
            } catch (e) {}
        },

        getTizenHardwareMac: function () {
            try {
                // الطريقة 1: عبر واجهة webapis لسامسونج
                if (typeof window.webapis !== 'undefined' && window.webapis.network && window.webapis.network.getMac) {
                    var m = window.webapis.network.getMac();
                    if (m && m.length >= 12) {
                        return this.formatMac(m);
                    }
                }
            } catch (e) {
                console.warn('[DeviceID] webapis.network.getMac error:', e);
            }

            try {
                // الطريقة 2: عبر نظام tizen.systeminfo
                if (typeof window.tizen !== 'undefined' && window.tizen.systeminfo) {
                    // تايزن يوفر خاصية NETWORK بشكل غير تزامني
                }
            } catch (e) {}

            return null;
        },

        generateRandomMac: function () {
            var hex = '0123456789ABCDEF';
            var mac = '00:1A:79'; // بادئة الماك الشهيرة لأجهزة البث STB
            for (var i = 0; i < 3; i++) {
                mac += ':' + hex.charAt(Math.floor(Math.random() * 16)) + hex.charAt(Math.floor(Math.random() * 16));
            }
            return mac;
        },

        formatMac: function (str) {
            var clean = str.replace(/[^A-Fa-f0-9]/g, '').toUpperCase();
            if (clean.length === 12) {
                return clean.match(/.{1,2}/g).join(':');
            }
            return clean;
        },

        getInfo: function () {
            return {
                mac: this.mac,
                deviceKey: this.deviceKey
            };
        }
    };

    window.DeviceID = DeviceID;

})(window);
