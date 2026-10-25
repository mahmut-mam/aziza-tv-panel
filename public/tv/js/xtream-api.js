/**
 * xtream-api.js
 * عميل بروتوكول Xtream Codes API المتكامل للتلفزيون
 * يدعم المصادقة، جلب البث المباشر، الأفلام، المسلسلات، وقوائم المفضلة
 */

(function (window) {
    'use strict';

    var STORAGE_KEY = 'xtream_tv_session';
    var FAVORITES_KEY = 'xtream_tv_favorites';

    var XtreamAPI = {
        session: null,
        favorites: {
            live: [],
            vod: [],
            series: []
        },

        init: function () {
            this.loadSession();
            this.loadFavorites();
        },

        loadSession: function () {
            try {
                var saved = localStorage.getItem(STORAGE_KEY);
                if (saved) {
                    this.session = JSON.parse(saved);
                }
            } catch (e) {
                console.error('[XtreamAPI] Error loading session:', e);
            }
        },

        saveSession: function (server, username, password, userInfo, serverInfo) {
            this.session = {
                server: this.cleanServerUrl(server),
                username: username.trim(),
                password: password.trim(),
                userInfo: userInfo,
                serverInfo: serverInfo,
                savedAt: new Date().getTime()
            };
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.session));
            } catch (e) {
                console.error('[XtreamAPI] Failed to store session:', e);
            }
        },

        clearSession: function () {
            this.session = null;
            try {
                localStorage.removeItem(STORAGE_KEY);
            } catch (e) {
                console.error(e);
            }
        },

        cleanServerUrl: function (url) {
            if (!url) return '';
            var cleaned = url.trim();
            // إضافة بروتوكول إذا لم يكن موجوداً
            if (!cleaned.match(/^https?:\/\//i)) {
                cleaned = 'http://' + cleaned;
            }
            // إزالة السلاش في النهاية
            return cleaned.replace(/\/+$/, '');
        },

        /**
         * تسجيل الدخول والتحقق من حساب Xtream Codes
         */
        authenticate: function (server, username, password) {
            var self = this;
            return new Promise(function (resolve, reject) {
                var cleanServer = self.cleanServerUrl(server);
                var u = encodeURIComponent(username.trim());
                var p = encodeURIComponent(password.trim());

                if (!cleanServer || !u || !p) {
                    return reject(new Error('يرجى إدخال عنوان السيرفر واسم المستخدم وكلمة المرور كاملة.'));
                }

                // دعم وضع التجربة المحلي السريع
                if (username.trim().toLowerCase() === 'demo' && password.trim().toLowerCase() === 'demo') {
                    var demoData = self.getMockDemoData();
                    self.saveSession(cleanServer, 'demo', 'demo', demoData.user_info, demoData.server_info);
                    return resolve(demoData);
                }

                var url = cleanServer + '/player_api.php?username=' + u + '&password=' + p;

                self.fetchJson(url, 15000)
                    .then(function (data) {
                        if (!data) {
                            return reject(new Error('لم يتم استلام رد من السيرفر.'));
                        }

                        if (data.user_info && (data.user_info.auth === 1 || data.user_info.status === 'Active')) {
                            self.saveSession(cleanServer, username, password, data.user_info, data.server_info);
                            resolve(data);
                        } else {
                            var msg = (data.user_info && data.user_info.message) ? data.user_info.message : 'بيانات الاشتراك غير صحيحة أو منتهية الصلاحية.';
                            reject(new Error(msg));
                        }
                    })
                    .catch(function (err) {
                        reject(new Error('تعذر الاتصال بالسيرفر. تأكد من صحة الرابط والاتصال بالإنترنت: ' + (err.message || 'خطأ شبكة')));
                    });
            });
        },

        fetchJson: function (url, timeoutMs) {
            return new Promise(function (resolve, reject) {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.timeout = timeoutMs || 15000;

                xhr.onload = function () {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            var parsed = JSON.parse(xhr.responseText);
                            resolve(parsed);
                        } catch (e) {
                            reject(new Error('تنسيق الرد غير صالح (JSON Parse Error)'));
                        }
                    } else {
                        reject(new Error('HTTP Status ' + xhr.status));
                    }
                };

                xhr.onerror = function () {
                    reject(new Error('فشل الاتصال بالشبكة (Network Error/CORS)'));
                };

                xhr.ontimeout = function () {
                    reject(new Error('انتهت مهلة الاتصال بالسيرفر (Timeout)'));
                };

                xhr.send();
            });
        },

        /**
         * جلب فئات البث المباشر
         */
        getLiveCategories: function () {
            if (this.isDemo()) {
                return Promise.resolve(this.getMockDemoData().live_categories);
            }
            var url = this.buildApiUrl('get_live_categories');
            return this.fetchJson(url);
        },

        /**
         * جلب قنوات البث المباشر
         */
        getLiveStreams: function (categoryId) {
            if (this.isDemo()) {
                var all = this.getMockDemoData().live_streams;
                if (!categoryId || categoryId === 'all') return Promise.resolve(all);
                return Promise.resolve(all.filter(function (s) { return String(s.category_id) === String(categoryId); }));
            }
            var action = 'get_live_streams';
            if (categoryId && categoryId !== 'all') {
                action += '&category_id=' + encodeURIComponent(categoryId);
            }
            var url = this.buildApiUrl(action);
            return this.fetchJson(url);
        },

        /**
         * جلب فئات الأفلام (VOD)
         */
        getVodCategories: function () {
            if (this.isDemo()) {
                return Promise.resolve(this.getMockDemoData().vod_categories);
            }
            var url = this.buildApiUrl('get_vod_categories');
            return this.fetchJson(url);
        },

        /**
         * جلب قائمة الأفلام
         */
        getVodStreams: function (categoryId) {
            if (this.isDemo()) {
                var all = this.getMockDemoData().vod_streams;
                if (!categoryId || categoryId === 'all') return Promise.resolve(all);
                return Promise.resolve(all.filter(function (s) { return String(s.category_id) === String(categoryId); }));
            }
            var action = 'get_vod_streams';
            if (categoryId && categoryId !== 'all') {
                action += '&category_id=' + encodeURIComponent(categoryId);
            }
            var url = this.buildApiUrl(action);
            return this.fetchJson(url);
        },

        /**
         * جلب فئات المسلسلات
         */
        getSeriesCategories: function () {
            if (this.isDemo()) {
                return Promise.resolve(this.getMockDemoData().series_categories);
            }
            var url = this.buildApiUrl('get_series_categories');
            return this.fetchJson(url);
        },

        /**
         * جلب قائمة المسلسلات
         */
        getSeries: function (categoryId) {
            if (this.isDemo()) {
                var all = this.getMockDemoData().series;
                if (!categoryId || categoryId === 'all') return Promise.resolve(all);
                return Promise.resolve(all.filter(function (s) { return String(s.category_id) === String(categoryId); }));
            }
            var action = 'get_series';
            if (categoryId && categoryId !== 'all') {
                action += '&category_id=' + encodeURIComponent(categoryId);
            }
            var url = this.buildApiUrl(action);
            return this.fetchJson(url);
        },

        /**
         * جلب تفاصيل المسلسل ومواسمه وحلقاته
         */
        getSeriesInfo: function (seriesId) {
            if (this.isDemo()) {
                return Promise.resolve(this.getMockDemoData().series_info[seriesId] || { seasons: [], episodes: {} });
            }
            var url = this.buildApiUrl('get_series_info&series_id=' + encodeURIComponent(seriesId));
            return this.fetchJson(url);
        },

        /**
         * جلب الدليل الإلكتروني المصغر للقناة EPG
         */
        getShortEPG: function (streamId) {
            if (this.isDemo()) {
                return Promise.resolve({ epg_listings: [] });
            }
            var url = this.buildApiUrl('get_short_epg&stream_id=' + encodeURIComponent(streamId) + '&limit=4');
            return this.fetchJson(url).catch(function () { return { epg_listings: [] }; });
        },

        /**
         * بناء رابط تشغيل البث
         */
        getPlaybackUrl: function (item, type) {
            if (!this.session) return '';

            // إذا كان تجريبي أو يحوي رابط مباشر
            if (item.direct_source) {
                return item.direct_source;
            }

            var server = this.session.server;
            var user = encodeURIComponent(this.session.username);
            var pass = encodeURIComponent(this.session.password);
            var id = item.stream_id || item.id;

            if (type === 'live') {
                // روابط البث المباشر
                return server + '/live/' + user + '/' + pass + '/' + id + '.m3u8';
            } else if (type === 'vod' || type === 'movie') {
                // رابط الفيلم
                var ext = item.container_extension || 'mp4';
                return server + '/movie/' + user + '/' + pass + '/' + id + '.' + ext;
            } else if (type === 'series' || type === 'episode') {
                // رابط حلقة المسلسل
                var seriesExt = item.container_extension || 'mp4';
                return server + '/series/' + user + '/' + pass + '/' + id + '.' + seriesExt;
            }

            return '';
        },

        buildApiUrl: function (actionString) {
            if (!this.session) return '';
            var u = encodeURIComponent(this.session.username);
            var p = encodeURIComponent(this.session.password);
            return this.session.server + '/player_api.php?username=' + u + '&password=' + p + '&action=' + actionString;
        },

        isDemo: function () {
            return this.session && this.session.username === 'demo';
        },

        // إدارة المفضلة
        loadFavorites: function () {
            try {
                var data = localStorage.getItem(FAVORITES_KEY);
                if (data) {
                    this.favorites = JSON.parse(data);
                }
            } catch (e) {
                this.favorites = { live: [], vod: [], series: [] };
            }
        },

        saveFavorites: function () {
            try {
                localStorage.setItem(FAVORITES_KEY, JSON.stringify(this.favorites));
            } catch (e) {}
        },

        isFavorite: function (id, type) {
            type = type || 'live';
            if (!this.favorites[type]) return false;
            return this.favorites[type].some(function (item) {
                return String(item.stream_id || item.id) === String(id);
            });
        },

        toggleFavorite: function (item, type) {
            type = type || 'live';
            if (!this.favorites[type]) {
                this.favorites[type] = [];
            }
            var id = item.stream_id || item.id;
            var idx = this.favorites[type].findIndex(function (fav) {
                return String(fav.stream_id || fav.id) === String(id);
            });

            var isFav = false;
            if (idx >= 0) {
                this.favorites[type].splice(idx, 1);
                isFav = false;
            } else {
                this.favorites[type].push(item);
                isFav = true;
            }
            this.saveFavorites();
            return isFav;
        },

        getFavoritesList: function (type) {
            type = type || 'live';
            return this.favorites[type] || [];
        },

        // بيانات تجريبية مدمجة للتجربة الفورية والمجانية
        getMockDemoData: function () {
            return {
                user_info: {
                    username: 'Demo VIP User',
                    auth: 1,
                    status: 'Active',
                    exp_date: '1798761600',
                    is_trial: '0',
                    active_cons: '1',
                    max_connections: '5',
                    message: 'تم تفعيل الحساب التجريبي بنجاح'
                },
                server_info: {
                    url: 'demo.tv.local',
                    port: '8080',
                    server_protocol: 'http',
                    timezone: 'Asia/Riyadh',
                    time_now: new Date().toISOString()
                },
                live_categories: [
                    { category_id: '1', category_name: 'قنوات الأخبار العالمية' },
                    { category_id: '2', category_name: 'باقات الرياضة والترفيه' },
                    { category_id: '3', category_name: 'قنوات الطبيعة والوثائقي' }
                ],
                live_streams: [
                    {
                        stream_id: 101,
                        name: 'Al Jazeera Arabic - الجزيرة الإخبارية',
                        category_id: '1',
                        stream_icon: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f2/Aljazeera_eng.svg/200px-Aljazeera_eng.svg.png',
                        direct_source: 'https://live-hls-web-aje.getaj.net/AJE/03.m3u8'
                    },
                    {
                        stream_id: 102,
                        name: 'France 24 Arabic - فرانس 24',
                        category_id: '1',
                        stream_icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Logo_France_24_2013.svg/200px-Logo_France_24_2013.svg.png',
                        direct_source: 'https://f24hls-i.akamaihd.net/hls/live/221193/F24_AR_HLS/master_1500.m3u8'
                    },
                    {
                        stream_id: 103,
                        name: 'TRT World Live HD',
                        category_id: '1',
                        stream_icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/TRT_World_logo.svg/200px-TRT_World_logo.svg.png',
                        direct_source: 'https://tv-trtworld.medya.trt.com.tr/master.m3u8'
                    },
                    {
                        stream_id: 104,
                        name: 'Red Bull TV - رياضة ومغامرات',
                        category_id: '2',
                        stream_icon: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f5/Red_Bull_TV_logo.svg/200px-Red_Bull_TV_logo.svg.png',
                        direct_source: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8'
                    },
                    {
                        stream_id: 105,
                        name: 'NASA TV - الفضاء والعلوم',
                        category_id: '3',
                        stream_icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/NASA_logo.svg/200px-NASA_logo.svg.png',
                        direct_source: 'https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8'
                    }
                ],
                vod_categories: [
                    { category_id: '10', category_name: 'أفلام الحركة والأكشن' },
                    { category_id: '11', category_name: 'أفلام وثائقية وطبيعة' },
                    { category_id: '12', category_name: 'أفلام الخيال العلمي' }
                ],
                vod_streams: [
                    {
                        stream_id: 201,
                        name: 'Big Buck Bunny (4K Ultra HD)',
                        category_id: '10',
                        rating: '8.4',
                        container_extension: 'mp4',
                        stream_icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/300px-Big_buck_bunny_poster_big.jpg',
                        direct_source: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
                    },
                    {
                        stream_id: 202,
                        name: 'Tears of Steel (Sci-Fi Experience)',
                        category_id: '12',
                        rating: '8.9',
                        container_extension: 'mp4',
                        stream_icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Tears_of_Steel_poster.jpg/300px-Tears_of_Steel_poster.jpg',
                        direct_source: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4'
                    },
                    {
                        stream_id: 203,
                        name: 'Sintel (Fantasy Adventure)',
                        category_id: '10',
                        rating: '8.6',
                        container_extension: 'mp4',
                        stream_icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Sintel_poster.jpg/300px-Sintel_poster.jpg',
                        direct_source: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4'
                    }
                ],
                series_categories: [
                    { category_id: '20', category_name: 'مسلسلات درامية وترفيهية' }
                ],
                series: [
                    {
                        series_id: 301,
                        name: 'كوكب الأرض - وثائقيات الطبيعة',
                        category_id: '20',
                        rating: '9.5',
                        cover: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/NASA_logo.svg/300px-NASA_logo.svg.png',
                        plot: 'سلسلة وثائقية استكشافية مذهلة عن الطبيعة والحياة البرية حول العالم.'
                    }
                ],
                series_info: {
                    '301': {
                        seasons: [
                            { air_date: '2024', name: 'الموسم الأول', season_number: 1, episode_count: 2 }
                        ],
                        episodes: {
                            '1': [
                                {
                                    id: 30101,
                                    episode_num: 1,
                                    title: 'الحلقة 1: أسرار الغابات والأنهار',
                                    container_extension: 'mp4',
                                    direct_source: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
                                },
                                {
                                    id: 30102,
                                    episode_num: 2,
                                    title: 'الحلقة 2: قمم الجبال الجليدية',
                                    container_extension: 'mp4',
                                    direct_source: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4'
                                }
                            ]
                        }
                    }
                }
            };
        }
    };

    window.XtreamAPI = XtreamAPI;

})(window);
