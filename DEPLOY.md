# دليل رفع لوحة تحكم aziza tv على استضافة مجانية 24/7 🚀

تم تجهيز لوحة التحكم لتعمل على أشهر وأفضل منصات الاستضافة المجانية السحابية دون الحاجة لدفع أي رسوم أو إدخال بطاقة بنكية.

---

## 🌟 الخيار 1: الاستضافة على Render.com (موصى به - مجاني 100% ودائم)

منصة **Render** تمنحك استضافة مجانية دائمة مع رابط HTTPS آمن (مثل: `https://aziza-tv.onrender.com`).

### خطوات الرفع خلال دقيقتين:
1. أنشئ حساباً مجانياً على [GitHub.com](https://github.com) إذا لم يكن لديك حساب.
2. أنشئ مستودعاً جديداً (New Repository) باسم `aziza-tv-panel`.
3. ارفع ملفات مجلد `panel` إلى هذا المستودع.
4. اذهب إلى [Render.com](https://render.com) وسجّل الدخول عبر حساب GitHub.
5. اضغط على **New + ◄ Web Service**.
6. اختر مستودعك `aziza-tv-panel`:
   - **Name:** `aziza-tv`
   - **Runtime:** `Node`
   - **Build Command:** اتركه فارغاً أو `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** اختر **Free**.
7. اضغط **Create Web Service**.
8. خلال دقيقة سيعطيك الرابط العام المجاني المباشر (مثل: `https://aziza-tv.onrender.com`).

---

## ⚡ الخيار 2: الاستضافة الفورية على Glitch.com (أسهل خيار بدون أوامر)

1. ادخل إلى [Glitch.com](https://glitch.com) وسجّل دخول مجاني.
2. اضغط على **New Project ◄ hello-node**.
3. اسحب وأفلت ملفات مجلد `panel` (الملفات: `server.js`, `database.json`, `package.json`, ومجلد `public`).
4. اضغط **Share** وسيظهر لك الرابط العام المباشر فوراً (مثل: `https://aziza-tv.glitch.me`)!

---

## 📺 الخطوة الأخيرة: ربط الرابط الجديد مع شاشات التلفزيون

بعد حصولك على الرابط المجاني (مثلاً: `https://aziza-tv.onrender.com`):
1. افتح ملف `js/activation.js` في تطبيق التلفزيون.
2. في السطر 14، غيّر الرابط:
   ```javascript
   // استبدل الرابط برابطك المجاني الجديد
   panelUrl: 'https://aziza-tv.onrender.com',
   ```
3. الآن، أي شاشة تلفزيون تفتح التطبيق في أي مكان في العالم ستتصل بلوحة تحكمك السحابية فوراً!
