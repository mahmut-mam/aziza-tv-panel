/**
 * app.js
 * نقطة البداية لتشغيل تطبيق aziza tv لشاشات سامسونج الذكية
 * يقوم بتهيئة كافة الأنظمة، فحص ترخيص الماك آدرس مع لوحة التحكم، والتأكد من جلسة المستخدم
 */

(function (window) {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        console.log('[App] aziza tv Smart TV App Booting...');

        // 1. تهيئة أزرار ريموت سامسونج تايزن
        if (window.TizenKeys) {
            window.TizenKeys.init();
        }

        // 2. تهيئة محرك التنقل بالريموت (D-Pad Spatial Navigation)
        if (window.SpatialNav) {
            window.SpatialNav.init();
        }

        // 3. تهيئة هوية الجهاز وعنوان الماك آدرس (MAC & Device Key)
        if (window.DeviceID) {
            window.DeviceID.init();
        }

        // 4. تهيئة عميل Xtream Codes API
        if (window.XtreamAPI) {
            window.XtreamAPI.init();
        }

        // 5. تهيئة مشغل الفيديو وقائمة OSD
        if (window.VideoPlayer) {
            window.VideoPlayer.init();
        }

        // 6. تهيئة كيبورد التلفزيون الافتراضي
        if (window.TVKeyboard) {
            window.TVKeyboard.init();
        }

        // 7. تهيئة مدير الواجهات والشاشات
        if (window.UI) {
            window.UI.init();
        }

        // 8. فحص ترخيص الجهاز بالماك آدرس مع لوحة التحكم (Activation Check)
        if (window.Activation) {
            window.Activation.init();
            window.Activation.verifyWithPanel(false)
                .catch(function (err) {
                    console.warn('[App] Initial activation verification fallback:', err);
                    // في حال كان السيرفر غير متصل، وكان هناك جلسة سابقة صالحة
                    if (window.XtreamAPI && window.XtreamAPI.session && window.XtreamAPI.session.userInfo) {
                        window.UI.updateHeaderUserInfo(window.XtreamAPI.session.userInfo);
                        window.UI.showScreen('screen-home');
                    } else {
                        // إظهار شاشة التفعيل لعرض الماك آدرس
                        window.UI.showScreen('screen-activation');
                    }
                });
        } else {
            if (window.XtreamAPI && window.XtreamAPI.session && window.XtreamAPI.session.userInfo) {
                window.UI.updateHeaderUserInfo(window.XtreamAPI.session.userInfo);
                window.UI.showScreen('screen-home');
            } else {
                window.UI.showScreen('screen-login');
            }
        }

        console.log('[App] Ready for TV interaction.');
    });

})(window);
