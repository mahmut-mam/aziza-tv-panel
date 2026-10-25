/**
 * tizen-keys.js
 * إدارة مفاتيح ريموت شاشة سامسونج (Tizen Remote Controller)
 * يدعم كلاً من نظام Tizen على الشاشة والمتصفح للكمبيوتر
 */

(function (window) {
    'use strict';

    var TizenKeys = {
        // مفاتيح التحكم والأرقام
        KEYS: {
            ENTER: 13,
            UP: 38,
            DOWN: 40,
            LEFT: 37,
            RIGHT: 39,
            BACK_TIZEN: 10009,
            BACK_BROWSER: 27, // Escape
            BACK_BACKSPACE: 8,
            
            // مفاتيح الوسائط
            PLAY: 415,
            PAUSE: 19,
            PLAY_PAUSE: 10252,
            STOP: 413,
            FAST_FORWARD: 417,
            REWIND: 412,
            
            // المفاتيح الملونة في ريموت سامسونج
            RED: 403,
            GREEN: 404,
            YELLOW: 405,
            BLUE: 406,
            
            // قنوات
            CHANNEL_UP: 427,
            CHANNEL_DOWN: 428,
            INFO: 457,
            
            // أرقام
            NUM_0: 48,
            NUM_1: 49,
            NUM_2: 50,
            NUM_3: 51,
            NUM_4: 52,
            NUM_5: 53,
            NUM_6: 54,
            NUM_7: 55,
            NUM_8: 56,
            NUM_9: 57
        },

        callbacks: {},

        init: function () {
            this.registerTizenHardwareKeys();
            this.bindGlobalKeyEvents();
            console.log('[TizenKeys] Initialized remote key system.');
        },

        /**
         * تسجيل مفاتيح الريموت الخاصة بنظام Tizen
         */
        registerTizenHardwareKeys: function () {
            if (typeof window.tizen !== 'undefined' && window.tizen.tvinputdevice) {
                var keysToRegister = [
                    'MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop',
                    'MediaFastForward', 'MediaRewind',
                    'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
                    'ChannelUp', 'ChannelDown', 'Info',
                    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
                ];

                for (var i = 0; i < keysToRegister.length; i++) {
                    try {
                        window.tizen.tvinputdevice.registerKey(keysToRegister[i]);
                    } catch (e) {
                        console.warn('[TizenKeys] Failed to register key: ' + keysToRegister[i], e);
                    }
                }
            } else {
                console.log('[TizenKeys] Running in standard browser / emulator mode.');
            }
        },

        /**
         * ربط حدث الضغط على الأزرار
         */
        bindGlobalKeyEvents: function () {
            var self = this;
            window.addEventListener('keydown', function (e) {
                var code = e.keyCode;

                // تحويل مفاتيح الرجوع في المتصفح إلى الرمز الموحد
                var action = self.mapKeyCodeToAction(code);

                if (action) {
                    var handled = self.trigger(action, e);
                    if (handled) {
                        e.preventDefault();
                    }
                }
            });
        },

        mapKeyCodeToAction: function (code) {
            switch (code) {
                case this.KEYS.UP:
                    return 'UP';
                case this.KEYS.DOWN:
                    return 'DOWN';
                case this.KEYS.LEFT:
                    return 'LEFT';
                case this.KEYS.RIGHT:
                    return 'RIGHT';
                case this.KEYS.ENTER:
                    return 'ENTER';
                case this.KEYS.BACK_TIZEN:
                case this.KEYS.BACK_BROWSER:
                case this.KEYS.BACK_BACKSPACE:
                    return 'BACK';
                case this.KEYS.PLAY:
                case this.KEYS.PAUSE:
                case this.KEYS.PLAY_PAUSE:
                    return 'PLAY_PAUSE';
                case this.KEYS.STOP:
                    return 'STOP';
                case this.KEYS.FAST_FORWARD:
                    return 'FAST_FORWARD';
                case this.KEYS.REWIND:
                    return 'REWIND';
                case this.KEYS.RED:
                    return 'RED';
                case this.KEYS.GREEN:
                    return 'GREEN';
                case this.KEYS.YELLOW:
                    return 'YELLOW';
                case this.KEYS.BLUE:
                    return 'BLUE';
                case this.KEYS.CHANNEL_UP:
                    return 'CHANNEL_UP';
                case this.KEYS.CHANNEL_DOWN:
                    return 'CHANNEL_DOWN';
                case this.KEYS.INFO:
                    return 'INFO';
                default:
                    if (code >= 48 && code <= 57) {
                        return 'NUM_' + (code - 48);
                    }
                    return null;
            }
        },

        on: function (action, callback) {
            if (!this.callbacks[action]) {
                this.callbacks[action] = [];
            }
            this.callbacks[action].push(callback);
        },

        off: function (action, callback) {
            if (!this.callbacks[action]) return;
            this.callbacks[action] = this.callbacks[action].filter(function (cb) {
                return cb !== callback;
            });
        },

        trigger: function (action, event) {
            var handled = false;
            if (this.callbacks[action]) {
                for (var i = 0; i < this.callbacks[action].length; i++) {
                    var result = this.callbacks[action][i](event);
                    if (result === true || result === undefined) {
                        handled = true;
                    }
                }
            }
            return handled;
        },

        exitApp: function () {
            if (typeof window.tizen !== 'undefined' && window.tizen.application) {
                try {
                    window.tizen.application.getCurrentApplication().exit();
                } catch (e) {
                    console.error('[TizenKeys] Exit error:', e);
                }
            } else {
                console.log('[TizenKeys] Exit requested (Browser environment)');
            }
        }
    };

    window.TizenKeys = TizenKeys;

})(window);
