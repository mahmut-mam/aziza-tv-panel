/**
 * ui.js
 * مدير واجهات المستخدم لشاشة التلفزيون (TV UI & Screen Manager)
 * يدير التنقل بين الشاشات، عرض القنوات، الأفلام، المسلسلات، وقوائم المفضلة
 */

(function (window) {
    'use strict';

    var UI = {
        currentScreen: 'screen-login',
        activeCategory: 'all',
        loadedChannels: [],
        loadedVOD: [],
        loadedSeries: [],
        currentSeriesInfo: null,
        clockInterval: null,

        init: function () {
            this.bindEvents();
            this.startLiveClock();
            console.log('[UI] Initialized TV User Interface Manager.');
        },

        startLiveClock: function () {
            var clockEl = document.getElementById('tv-live-clock');
            function update() {
                var now = new Date();
                var h = now.getHours();
                var m = now.getMinutes();
                var ampm = h >= 12 ? 'م' : 'ص';
                h = h % 12;
                h = h ? h : 12;
                var str = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
                if (clockEl) clockEl.textContent = str;
            }
            update();
            this.clockInterval = setInterval(update, 10000);
        },

        bindEvents: function () {
            var self = this;

            // أزرار شاشة تسجيل الدخول
            var btnConnect = document.getElementById('btn-connect');
            if (btnConnect) {
                btnConnect.addEventListener('click', function () {
                    self.handleLogin();
                });
            }

            var btnDemo = document.getElementById('btn-demo');
            if (btnDemo) {
                btnDemo.addEventListener('click', function () {
                    self.handleDemoLogin();
                });
            }

            // فتح لوحة المفاتيح عند النقر على حقول الإدخال
            var inputs = document.querySelectorAll('.tv-input');
            inputs.forEach(function (inp) {
                inp.addEventListener('click', function () {
                    if (window.TVKeyboard) {
                        window.TVKeyboard.open(inp);
                    }
                });
            });

            // كروت الشاشة الرئيسية
            var cardLive = document.getElementById('card-hub-live');
            if (cardLive) {
                cardLive.addEventListener('click', function () {
                    self.showScreen('screen-live');
                    self.loadLiveContent();
                });
            }

            var cardVod = document.getElementById('card-hub-vod');
            if (cardVod) {
                cardVod.addEventListener('click', function () {
                    self.showScreen('screen-vod');
                    self.loadVodContent();
                });
            }

            var cardSeries = document.getElementById('card-hub-series');
            if (cardSeries) {
                cardSeries.addEventListener('click', function () {
                    self.showScreen('screen-series');
                    self.loadSeriesContent();
                });
            }

            var cardFavs = document.getElementById('card-hub-favorites');
            if (cardFavs) {
                cardFavs.addEventListener('click', function () {
                    self.showScreen('screen-favorites');
                    self.loadFavoritesContent();
                });
            }

            // زر معلومات الحساب في الهيدر
            var btnAccount = document.getElementById('btn-header-account');
            if (btnAccount) {
                btnAccount.addEventListener('click', function () {
                    self.openAccountModal();
                });
            }

            // زر تسجيل الخروج
            var btnLogout = document.getElementById('btn-logout-confirm');
            if (btnLogout) {
                btnLogout.addEventListener('click', function () {
                    self.handleLogout();
                });
            }

            // زر إغلاق مودال الحساب
            var btnCloseModal = document.getElementById('btn-close-account-modal');
            if (btnCloseModal) {
                btnCloseModal.addEventListener('click', function () {
                    self.closeModal('account-modal');
                });
            }

            // زر إغلاق مودال تفاصيل الفيلم
            var btnCloseVodModal = document.getElementById('btn-close-vod-modal');
            if (btnCloseVodModal) {
                btnCloseVodModal.addEventListener('click', function () {
                    self.closeModal('vod-details-modal');
                });
            }

            // زر إغلاق مودال تفاصيل المسلسل
            var btnCloseSeriesModal = document.getElementById('btn-close-series-modal');
            if (btnCloseSeriesModal) {
                btnCloseSeriesModal.addEventListener('click', function () {
                    self.closeModal('series-details-modal');
                });
            }

            // زر إغلاق المشغل
            var btnClosePlayer = document.getElementById('btn-player-close');
            if (btnClosePlayer) {
                btnClosePlayer.addEventListener('click', function () {
                    if (window.VideoPlayer) window.VideoPlayer.close();
                    self.restoreAfterPlayer();
                });
            }

            // زر تشغيل/إيقاف في المشغل
            var btnPlayPause = document.getElementById('btn-player-playpause');
            if (btnPlayPause) {
                btnPlayPause.addEventListener('click', function () {
                    if (window.VideoPlayer) window.VideoPlayer.togglePlayPause();
                });
            }

            // زر نسبة العرض في المشغل
            var btnAspect = document.getElementById('btn-player-aspect');
            if (btnAspect) {
                btnAspect.addEventListener('click', function () {
                    if (window.VideoPlayer) window.VideoPlayer.toggleAspectRatio();
                });
            }

            // زر القناة التالية والسابقة
            var btnNext = document.getElementById('btn-player-next');
            if (btnNext) {
                btnNext.addEventListener('click', function () {
                    if (window.VideoPlayer) window.VideoPlayer.playNext();
                });
            }
            var btnPrev = document.getElementById('btn-player-prev');
            if (btnPrev) {
                btnPrev.addEventListener('click', function () {
                    if (window.VideoPlayer) window.VideoPlayer.playPrevious();
                });
            }

            // زر المفضلة في المشغل
            var btnPlayerFav = document.getElementById('btn-player-favorite');
            if (btnPlayerFav) {
                btnPlayerFav.addEventListener('click', function () {
                    if (window.VideoPlayer && window.VideoPlayer.currentItem && window.XtreamAPI) {
                        var isFav = window.XtreamAPI.toggleFavorite(window.VideoPlayer.currentItem, window.VideoPlayer.currentType);
                        self.showToast(isFav ? 'تمت إضافة القناة إلى المفضلة ⭐' : 'تمت الإزالة من المفضلة');
                    }
                });
            }

            // مفتاح الرجوع والتحكم العام عبر TizenKeys
            if (window.TizenKeys) {
                window.TizenKeys.on('BACK', function () {
                    return self.handleBackKey();
                });

                window.TizenKeys.on('YELLOW', function () {
                    // المفتاح الأصفر للمفضلة السريعة
                    if (window.SpatialNav && window.SpatialNav.currentFocus) {
                        var el = window.SpatialNav.currentFocus;
                        var favBtn = el.querySelector('.btn-item-fav') || el.closest('.channel-row')?.querySelector('.btn-item-fav');
                        if (favBtn) {
                            favBtn.click();
                            return true;
                        }
                    }
                });

                window.TizenKeys.on('RED', function () {
                    // المفتاح الأحمر للعودة أو الخروج
                    return self.handleBackKey();
                });
            }
        },

        showScreen: function (screenId) {
            var screens = document.querySelectorAll('.app-screen');
            screens.forEach(function (s) {
                s.classList.add('hidden');
            });

            var target = document.getElementById(screenId);
            if (target) {
                target.classList.remove('hidden');
                this.currentScreen = screenId;
                if (window.SpatialNav) {
                    window.SpatialNav.setScope(target);
                }
            }
        },

        handleBackKey: function () {
            // فحص إذا كان كيبورد التلفزيون مفتوحاً
            if (window.TVKeyboard && window.TVKeyboard.isOpen) {
                window.TVKeyboard.close();
                return true;
            }

            // فحص المودالات
            var modals = ['account-modal', 'vod-details-modal', 'series-details-modal', 'subtitles-modal', 'audio-modal'];
            for (var i = 0; i < modals.length; i++) {
                var m = document.getElementById(modals[i]);
                if (m && !m.classList.contains('hidden')) {
                    this.closeModal(modals[i]);
                    if (window.VideoPlayer && window.VideoPlayer.isPlayerActive() && window.SpatialNav) {
                        window.SpatialNav.setScope('#player-controls-container');
                    }
                    return true;
                }
            }

            // فحص مشغل الفيديو
            var playerScreen = document.getElementById('screen-player');
            if (playerScreen && !playerScreen.classList.contains('hidden')) {
                if (window.VideoPlayer) window.VideoPlayer.close();
                this.restoreAfterPlayer();
                return true;
            }

            // التنقل بين الشاشات
            if (this.currentScreen !== 'screen-home' && this.currentScreen !== 'screen-login') {
                this.showScreen('screen-home');
                return true;
            }

            // الخروج من التطبيق إذا كان في الشاشة الرئيسية
            if (this.currentScreen === 'screen-home') {
                if (confirm('هل ترغب بالخروج من تطبيق التلفزيون؟')) {
                    if (window.TizenKeys) window.TizenKeys.exitApp();
                }
                return true;
            }

            return false;
        },

        restoreAfterPlayer: function () {
            var target = document.getElementById(this.currentScreen);
            if (target && window.SpatialNav) {
                window.SpatialNav.setScope(target);
            }
        },

        closeModal: function (modalId) {
            var m = document.getElementById(modalId);
            if (m) m.classList.add('hidden');
            var screen = document.getElementById(this.currentScreen);
            if (screen && window.SpatialNav) {
                window.SpatialNav.setScope(screen);
            }
        },

        handleLogin: function () {
            var self = this;
            var server = document.getElementById('login-server').value;
            var user = document.getElementById('login-username').value;
            var pass = document.getElementById('login-password').value;
            var errEl = document.getElementById('login-error');

            if (errEl) errEl.classList.add('hidden');
            this.setLoading(true, 'جاري التحقق من السيرفر وتسجيل الدخول...');

            window.XtreamAPI.authenticate(server, user, pass)
                .then(function (data) {
                    self.setLoading(false);
                    self.updateHeaderUserInfo(data.user_info);
                    self.showScreen('screen-home');
                    self.showToast('مرحباً بك! تم الاتصال بنجاح.');
                })
                .catch(function (err) {
                    self.setLoading(false);
                    if (errEl) {
                        errEl.textContent = err.message || 'فشل الاتصال.';
                        errEl.classList.remove('hidden');
                    }
                });
        },

        handleDemoLogin: function () {
            document.getElementById('login-server').value = 'http://demo.tv.local:8080';
            document.getElementById('login-username').value = 'demo';
            document.getElementById('login-password').value = 'demo';
            this.handleLogin();
        },

        handleLogout: function () {
            if (window.XtreamAPI) window.XtreamAPI.clearSession();
            this.closeModal('account-modal');
            this.showScreen('screen-login');
            this.showToast('تم تسجيل الخروج.');
        },

        updateHeaderUserInfo: function (userInfo) {
            var userBadge = document.getElementById('header-user-name');
            var expiryBadge = document.getElementById('header-expiry-date');

            if (userBadge && userInfo) {
                userBadge.textContent = userInfo.username || 'مستخدم نشط';
            }

            if (expiryBadge && userInfo && userInfo.exp_date) {
                var expTimestamp = parseInt(userInfo.exp_date, 10);
                if (!isNaN(expTimestamp) && expTimestamp > 0) {
                    var expDate = new Date(expTimestamp * 1000);
                    var dStr = expDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
                    expiryBadge.textContent = 'ينتهي: ' + dStr;
                } else {
                    expiryBadge.textContent = 'اشتراك مفتوح';
                }
            }
        },

        openAccountModal: function () {
            var modal = document.getElementById('account-modal');
            if (!modal) return;

            var sess = window.XtreamAPI ? window.XtreamAPI.session : null;
            if (sess && sess.userInfo) {
                var u = sess.userInfo;
                document.getElementById('acc-username').textContent = u.username || '-';
                document.getElementById('acc-status').textContent = u.status || 'Active';
                document.getElementById('acc-max-cons').textContent = u.max_connections || '1';
                document.getElementById('acc-server-url').textContent = sess.server || '-';

                var expTimestamp = parseInt(u.exp_date, 10);
                if (!isNaN(expTimestamp) && expTimestamp > 0) {
                    document.getElementById('acc-expiry').textContent = new Date(expTimestamp * 1000).toLocaleString('ar-EG');
                } else {
                    document.getElementById('acc-expiry').textContent = 'غير محدد';
                }
            }

            if (window.DeviceID) {
                var macEl = document.getElementById('acc-mac-address');
                var keyEl = document.getElementById('acc-device-key');
                if (macEl) macEl.textContent = window.DeviceID.mac || '-';
                if (keyEl) keyEl.textContent = window.DeviceID.deviceKey || '-';
            }

            modal.classList.remove('hidden');
            if (window.SpatialNav) {
                window.SpatialNav.setScope(modal);
            }
        },

        // 1. تحميل محتوى البث المباشر Live TV
        loadLiveContent: function () {
            var self = this;
            this.setLoading(true, 'جاري جلب باقات وقنوات البث المباشر...');

            window.XtreamAPI.getLiveCategories()
                .then(function (categories) {
                    self.renderCategoriesSidebar('live-categories-list', categories, function (catId) {
                        self.loadLiveStreamsByCategory(catId);
                    });
                    return window.XtreamAPI.getLiveStreams('all');
                })
                .then(function (streams) {
                    self.setLoading(false);
                    self.loadedChannels = streams || [];
                    self.renderLiveChannels(self.loadedChannels);
                })
                .catch(function (err) {
                    self.setLoading(false);
                    self.showToast('تعذر تحميل القنوات: ' + err.message);
                });
        },

        loadLiveStreamsByCategory: function (catId) {
            var self = this;
            this.setLoading(true, 'جاري تحديث القنوات...');
            window.XtreamAPI.getLiveStreams(catId)
                .then(function (streams) {
                    self.setLoading(false);
                    self.loadedChannels = streams || [];
                    self.renderLiveChannels(self.loadedChannels);
                })
                .catch(function (err) {
                    self.setLoading(false);
                    self.showToast(err.message);
                });
        },

        renderLiveChannels: function (channels) {
            var container = document.getElementById('live-channels-grid');
            if (!container) return;
            container.innerHTML = '';

            var countEl = document.getElementById('live-channel-count');
            if (countEl) countEl.textContent = channels.length + ' قناة';

            if (channels.length === 0) {
                container.innerHTML = '<div class="empty-state">لا توجد قنوات متوفرة في هذه الباقة</div>';
                return;
            }

            var self = this;
            var BATCH_SIZE = 100;
            var renderedCount = 0;

            function renderBatch() {
                var fragment = document.createDocumentFragment();
                var nextLimit = Math.min(renderedCount + BATCH_SIZE, channels.length);

                for (var idx = renderedCount; idx < nextLimit; idx++) {
                    (function (i) {
                        var ch = channels[i];
                        var row = document.createElement('div');
                        row.className = 'nav-item channel-row';
                        row.tabIndex = 0;

                        var isFav = window.XtreamAPI.isFavorite(ch.stream_id, 'live');

                        row.innerHTML = 
                            '<span class="channel-num">' + (i + 1) + '</span>' +
                            '<div class="channel-logo-wrap">' +
                                (ch.stream_icon ? '<img src="' + ch.stream_icon + '" class="channel-logo" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '<div class="channel-logo-placeholder">📺</div>') +
                            '</div>' +
                            '<div class="channel-info">' +
                                '<div class="channel-name">' + (ch.name || 'قناة') + '</div>' +
                                '<div class="channel-stream-badge">LIVE HD</div>' +
                            '</div>' +
                            '<button type="button" class="btn-item-fav ' + (isFav ? 'is-fav' : '') + '">' + (isFav ? '★' : '☆') + '</button>';

                        var favBtn = row.querySelector('.btn-item-fav');
                        favBtn.addEventListener('click', function (e) {
                            e.stopPropagation();
                            var newFav = window.XtreamAPI.toggleFavorite(ch, 'live');
                            favBtn.className = 'btn-item-fav ' + (newFav ? 'is-fav' : '');
                            favBtn.textContent = newFav ? '★' : '☆';
                            self.showToast(newFav ? 'أضيفت للمفضلة ⭐' : 'أزيلت من المفضلة');
                        });

                        row.addEventListener('click', function () {
                            if (window.VideoPlayer) {
                                window.VideoPlayer.play(ch, 'live', channels, i);
                            }
                        });

                        fragment.appendChild(row);
                    })(idx);
                }

                renderedCount = nextLimit;
                container.appendChild(fragment);

                // إزالة زر المزيد القديم إن وجد
                var oldMoreBtn = document.getElementById('btn-load-more-channels');
                if (oldMoreBtn) oldMoreBtn.remove();

                // إضافة زر تحميل المزيد إذا كان هناك بقية
                if (renderedCount < channels.length) {
                    var remaining = channels.length - renderedCount;
                    var moreBtn = document.createElement('button');
                    moreBtn.id = 'btn-load-more-channels';
                    moreBtn.type = 'button';
                    moreBtn.className = 'nav-item btn-secondary';
                    moreBtn.style.margin = '20px auto';
                    moreBtn.style.width = '100%';
                    moreBtn.style.height = '60px';
                    moreBtn.style.fontSize = '20px';
                    moreBtn.textContent = '▼ عرض المزيد من القنوات (المتبقي: ' + remaining + ')';
                    moreBtn.addEventListener('click', function () {
                        renderBatch();
                    });
                    container.appendChild(moreBtn);
                }
            }

            renderBatch();

            // إعادة توجيه الفوكس
            if (window.SpatialNav) {
                var first = container.querySelector('.channel-row');
                if (first) window.SpatialNav.setFocus(first);
            }
        },

        // 2. تحميل محتوى الأفلام VOD
        loadVodContent: function () {
            var self = this;
            this.setLoading(true, 'جاري جلب تصنيفات الأفلام...');

            window.XtreamAPI.getVodCategories()
                .then(function (categories) {
                    self.renderCategoriesSidebar('vod-categories-list', categories, function (catId) {
                        self.loadVodStreamsByCategory(catId);
                    });
                    return window.XtreamAPI.getVodStreams('all');
                })
                .then(function (movies) {
                    self.setLoading(false);
                    self.loadedVOD = movies || [];
                    self.renderVodGrid(self.loadedVOD);
                })
                .catch(function (err) {
                    self.setLoading(false);
                    self.showToast('تعذر تحميل الأفلام: ' + err.message);
                });
        },

        loadVodStreamsByCategory: function (catId) {
            var self = this;
            this.setLoading(true, 'جاري تحديث قائمة الأفلام...');
            window.XtreamAPI.getVodStreams(catId)
                .then(function (movies) {
                    self.setLoading(false);
                    self.loadedVOD = movies || [];
                    self.renderVodGrid(self.loadedVOD);
                })
                .catch(function (err) {
                    self.setLoading(false);
                    self.showToast(err.message);
                });
        },

        renderVodGrid: function (movies) {
            var container = document.getElementById('vod-movies-grid');
            if (!container) return;
            container.innerHTML = '';

            var countEl = document.getElementById('vod-count');
            if (countEl) countEl.textContent = movies.length + ' فيلم';

            if (movies.length === 0) {
                container.innerHTML = '<div class="empty-state">لا توجد أفلام في هذا التصنيف</div>';
                return;
            }

            var self = this;
            var BATCH_SIZE = 50;
            var renderedCount = 0;

            function renderBatch() {
                var fragment = document.createDocumentFragment();
                var nextLimit = Math.min(renderedCount + BATCH_SIZE, movies.length);

                for (var idx = renderedCount; idx < nextLimit; idx++) {
                    (function (i) {
                        var movie = movies[i];
                        var card = document.createElement('div');
                        card.className = 'nav-item media-card';
                        card.tabIndex = 0;

                        var poster = movie.stream_icon || 'assets/poster-placeholder.png';
                        var rating = movie.rating ? '★ ' + movie.rating : 'HD';

                        card.innerHTML = 
                            '<div class="media-poster-wrap">' +
                                '<img src="' + poster + '" class="media-poster" alt="" loading="lazy" onerror="this.src=\'data:image/svg+xml;utf8,<svg xmlns=\\\'http://www.w3.org/2000/svg\\\' width=\\\'100\\\' height=\\\'150\\\'><rect width=\\\'100%\\\' height=\\\'100%\\\' fill=\\\'%231a233a\\\' /><text x=\\\'50%\\\' y=\\\'50%\\\' fill=\\\'%23718096\\\' dominant-baseline=\\\'middle\\\' text-anchor=\\\'middle\\\'>FILM</text></svg>\'">' +
                                '<span class="rating-badge">' + rating + '</span>' +
                            '</div>' +
                            '<div class="media-title">' + (movie.name || 'فيلم') + '</div>';

                        card.addEventListener('click', function () {
                            self.openVodModal(movie, movies, i);
                        });

                        fragment.appendChild(card);
                    })(idx);
                }

                renderedCount = nextLimit;
                container.appendChild(fragment);

                var oldMoreBtn = document.getElementById('btn-load-more-vod');
                if (oldMoreBtn) oldMoreBtn.remove();

                if (renderedCount < movies.length) {
                    var remaining = movies.length - renderedCount;
                    var moreBtn = document.createElement('button');
                    moreBtn.id = 'btn-load-more-vod';
                    moreBtn.type = 'button';
                    moreBtn.className = 'nav-item btn-secondary';
                    moreBtn.style.gridColumn = '1 / -1';
                    moreBtn.style.margin = '20px auto';
                    moreBtn.style.width = '100%';
                    moreBtn.style.height = '60px';
                    moreBtn.style.fontSize = '20px';
                    moreBtn.textContent = '▼ عرض المزيد من الأفلام (المتبقي: ' + remaining + ')';
                    moreBtn.addEventListener('click', function () {
                        renderBatch();
                    });
                    container.appendChild(moreBtn);
                }
            }

            renderBatch();

            if (window.SpatialNav) {
                var first = container.querySelector('.media-card');
                if (first) window.SpatialNav.setFocus(first);
            }
        },

        openVodModal: function (movie, playlist, index) {
            var modal = document.getElementById('vod-details-modal');
            if (!modal) return;

            document.getElementById('vod-modal-title').textContent = movie.name || 'تفاصيل الفيلم';
            document.getElementById('vod-modal-rating').textContent = movie.rating ? 'تقييم: ★ ' + movie.rating : 'جودة فائقة HD';
            document.getElementById('vod-modal-desc').textContent = movie.plot || movie.description || 'استمتع بمشاهدة هذا الفيلم بجودة سينمائية فائقة بدقة عالية مع ترجمة مدمجة.';

            var posterImg = document.getElementById('vod-modal-poster');
            if (posterImg && movie.stream_icon) {
                posterImg.src = movie.stream_icon;
            }

            var btnPlay = document.getElementById('btn-play-movie');
            var btnFav = document.getElementById('btn-fav-movie');

            var isFav = window.XtreamAPI.isFavorite(movie.stream_id, 'vod');
            btnFav.textContent = isFav ? 'إزالة من المفضلة ★' : 'إضافة للمفضلة ☆';

            btnPlay.onclick = function () {
                modal.classList.add('hidden');
                if (window.VideoPlayer) {
                    window.VideoPlayer.play(movie, 'vod', playlist, index);
                }
            };

            btnFav.onclick = function () {
                var newFav = window.XtreamAPI.toggleFavorite(movie, 'vod');
                btnFav.textContent = newFav ? 'إزالة من المفضلة ★' : 'إضافة للمفضلة ☆';
            };

            modal.classList.remove('hidden');
            if (window.SpatialNav) {
                window.SpatialNav.setScope(modal);
                window.SpatialNav.setFocus(btnPlay);
            }
        },

        // 3. تحميل محتوى المسلسلات Series
        loadSeriesContent: function () {
            var self = this;
            this.setLoading(true, 'جاري جلب تصنيفات المسلسلات...');

            window.XtreamAPI.getSeriesCategories()
                .then(function (categories) {
                    self.renderCategoriesSidebar('series-categories-list', categories, function (catId) {
                        self.loadSeriesByCategory(catId);
                    });
                    return window.XtreamAPI.getSeries('all');
                })
                .then(function (seriesList) {
                    self.setLoading(false);
                    self.loadedSeries = seriesList || [];
                    self.renderSeriesGrid(self.loadedSeries);
                })
                .catch(function (err) {
                    self.setLoading(false);
                    self.showToast('تعذر تحميل المسلسلات: ' + err.message);
                });
        },

        loadSeriesByCategory: function (catId) {
            var self = this;
            this.setLoading(true, 'جاري تحديث المسلسلات...');
            window.XtreamAPI.getSeries(catId)
                .then(function (list) {
                    self.setLoading(false);
                    self.loadedSeries = list || [];
                    self.renderSeriesGrid(self.loadedSeries);
                })
                .catch(function (err) {
                    self.setLoading(false);
                    self.showToast(err.message);
                });
        },

        renderSeriesGrid: function (seriesList) {
            var container = document.getElementById('series-grid');
            if (!container) return;
            container.innerHTML = '';

            var countEl = document.getElementById('series-count');
            if (countEl) countEl.textContent = seriesList.length + ' مسلسل';

            if (seriesList.length === 0) {
                container.innerHTML = '<div class="empty-state">لا توجد مسلسلات في هذا التصنيف</div>';
                return;
            }

            var self = this;
            seriesList.forEach(function (item) {
                var card = document.createElement('div');
                card.className = 'nav-item media-card';
                card.tabIndex = 0;

                var poster = item.cover || 'assets/poster-placeholder.png';
                var rating = item.rating ? '★ ' + item.rating : 'مسلسل';

                card.innerHTML = 
                    '<div class="media-poster-wrap">' +
                        '<img src="' + poster + '" class="media-poster" alt="" onerror="this.src=\'data:image/svg+xml;utf8,<svg xmlns=\\\'http://www.w3.org/2000/svg\\\' width=\\\'100\\\' height=\\\'150\\\'><rect width=\\\'100%\\\' height=\\\'100%\\\' fill=\\\'%231a233a\\\'/><text x=\\\'50%\\\' y=\\\'50%\\\' fill=\\\'%23718096\\\' dominant-baseline=\\\'middle\\\' text-anchor=\\\'middle\\\'>SERIES</text></svg>\'">' +
                        '<span class="rating-badge">' + rating + '</span>' +
                    '</div>' +
                    '<div class="media-title">' + (item.name || 'مسلسل') + '</div>';

                card.addEventListener('click', function () {
                    self.openSeriesModal(item);
                });

                container.appendChild(card);
            });

            if (window.SpatialNav) {
                var first = container.querySelector('.media-card');
                if (first) window.SpatialNav.setFocus(first);
            }
        },

        openSeriesModal: function (series) {
            var self = this;
            var modal = document.getElementById('series-details-modal');
            if (!modal) return;

            document.getElementById('series-modal-title').textContent = series.name || 'تفاصيل المسلسل';
            document.getElementById('series-modal-desc').textContent = series.plot || 'مواسم وحلقات متعددة متاحة بجودة عالية.';

            this.setLoading(true, 'جاري جلب الحلقات والمواسم...');

            window.XtreamAPI.getSeriesInfo(series.series_id)
                .then(function (info) {
                    self.setLoading(false);
                    self.currentSeriesInfo = info;
                    self.renderSeasonsAndEpisodes(info);
                    modal.classList.remove('hidden');
                    if (window.SpatialNav) {
                        window.SpatialNav.setScope(modal);
                    }
                })
                .catch(function (err) {
                    self.setLoading(false);
                    self.showToast('تعذر جلب تفاصيل الحلقات: ' + err.message);
                });
        },

        renderSeasonsAndEpisodes: function (info) {
            var seasonsTabs = document.getElementById('series-seasons-tabs');
            var episodesList = document.getElementById('series-episodes-list');
            if (!seasonsTabs || !episodesList) return;

            seasonsTabs.innerHTML = '';
            episodesList.innerHTML = '';

            var seasons = info.seasons || [];
            var episodes = info.episodes || {};

            if (seasons.length === 0) {
                // إذا لم توجد بيانات مواسم محددة نأخذ مفاتيح الحلقات
                var sKeys = Object.keys(episodes);
                seasons = sKeys.map(function (k) { return { season_number: k, name: 'الموسم ' + k }; });
            }

            var self = this;
            seasons.forEach(function (s, sIdx) {
                var tabBtn = document.createElement('button');
                tabBtn.type = 'button';
                tabBtn.className = 'nav-item season-tab ' + (sIdx === 0 ? 'active' : '');
                tabBtn.textContent = s.name || ('الموسم ' + s.season_number);

                tabBtn.addEventListener('click', function () {
                    seasonsTabs.querySelectorAll('.season-tab').forEach(function (t) { t.classList.remove('active'); });
                    tabBtn.classList.add('active');
                    self.renderEpisodesForSeason(episodes[s.season_number] || episodes[String(s.season_number)] || []);
                });

                seasonsTabs.appendChild(tabBtn);
            });

            // عرض حلقات الموسم الأول تلقائياً
            var firstSeasonNum = seasons.length > 0 ? seasons[0].season_number : 1;
            this.renderEpisodesForSeason(episodes[firstSeasonNum] || episodes[String(firstSeasonNum)] || []);
        },

        renderEpisodesForSeason: function (epList) {
            var container = document.getElementById('series-episodes-list');
            if (!container) return;
            container.innerHTML = '';

            if (epList.length === 0) {
                container.innerHTML = '<div class="empty-state">لا توجد حلقات مدرجة لهذا الموسم</div>';
                return;
            }

            var self = this;
            epList.forEach(function (ep, idx) {
                var row = document.createElement('div');
                row.className = 'nav-item episode-row';
                row.tabIndex = 0;

                var title = ep.title || ('الحلقة ' + (ep.episode_num || idx + 1));

                row.innerHTML = 
                    '<div class="ep-num">' + (ep.episode_num || idx + 1) + '</div>' +
                    '<div class="ep-title">' + title + '</div>' +
                    '<div class="ep-play-btn">▶ تشغيل</div>';

                row.addEventListener('click', function () {
                    document.getElementById('series-details-modal').classList.add('hidden');
                    if (window.VideoPlayer) {
                        window.VideoPlayer.play(ep, 'series', epList, idx);
                    }
                });

                container.appendChild(row);
            });
        },

        // 4. تحميل المفضلة Favorites
        loadFavoritesContent: function () {
            var container = document.getElementById('fav-channels-list');
            if (!container) return;
            container.innerHTML = '';

            var liveFavs = window.XtreamAPI.getFavoritesList('live');
            var vodFavs = window.XtreamAPI.getFavoritesList('vod');

            var totalCount = liveFavs.length + vodFavs.length;
            var countEl = document.getElementById('fav-count');
            if (countEl) countEl.textContent = totalCount + ' عنصر';

            if (totalCount === 0) {
                container.innerHTML = '<div class="empty-state">لم تقم بإضافة أي قنوات أو أفلام إلى المفضلة بعد.<br>أثناء تصفح القنوات، اضغط الزر الأصفر بالريموت لإضافتها هنا.</div>';
                return;
            }

            var self = this;
            liveFavs.forEach(function (ch, idx) {
                var row = document.createElement('div');
                row.className = 'nav-item channel-row';
                row.tabIndex = 0;

                row.innerHTML = 
                    '<span class="channel-num">' + (idx + 1) + '</span>' +
                    '<div class="channel-logo-wrap">' +
                        (ch.stream_icon ? '<img src="' + ch.stream_icon + '" class="channel-logo" alt="">' : '<div class="channel-logo-placeholder">📺</div>') +
                    '</div>' +
                    '<div class="channel-info">' +
                        '<div class="channel-name">' + (ch.name || 'قناة مفضلة') + '</div>' +
                        '<div class="channel-stream-badge">LIVE</div>' +
                    '</div>' +
                    '<button type="button" class="btn-item-fav is-fav">★</button>';

                row.addEventListener('click', function () {
                    if (window.VideoPlayer) {
                        window.VideoPlayer.play(ch, 'live', liveFavs, idx);
                    }
                });

                container.appendChild(row);
            });

            if (window.SpatialNav) {
                var first = container.querySelector('.channel-row');
                if (first) window.SpatialNav.setFocus(first);
            }
        },

        renderCategoriesSidebar: function (elementId, categories, onSelect) {
            var sidebar = document.getElementById(elementId);
            if (!sidebar) return;
            sidebar.innerHTML = '';

            // زر الكل
            var allBtn = document.createElement('button');
            allBtn.type = 'button';
            allBtn.className = 'nav-item cat-item active';
            allBtn.textContent = '🌟 جميع الباقات';
            allBtn.addEventListener('click', function () {
                sidebar.querySelectorAll('.cat-item').forEach(function (c) { c.classList.remove('active'); });
                allBtn.classList.add('active');
                onSelect('all');
            });
            sidebar.appendChild(allBtn);

            // بقية التصنيفات
            categories.forEach(function (cat) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'nav-item cat-item';
                btn.textContent = cat.category_name;

                btn.addEventListener('click', function () {
                    sidebar.querySelectorAll('.cat-item').forEach(function (c) { c.classList.remove('active'); });
                    btn.classList.add('active');
                    onSelect(cat.category_id);
                });

                sidebar.appendChild(btn);
            });
        },

        setLoading: function (show, text) {
            var loader = document.getElementById('app-global-loader');
            var txt = document.getElementById('app-loader-text');
            if (loader) {
                if (show) {
                    if (txt && text) txt.textContent = text;
                    loader.classList.remove('hidden');
                } else {
                    loader.classList.add('hidden');
                }
            }
        },

        showToast: function (msg) {
            var toast = document.getElementById('tv-toast');
            if (!toast) return;
            toast.textContent = msg;
            toast.classList.remove('hidden');
            setTimeout(function () {
                toast.classList.add('hidden');
            }, 3000);
        }
    };

    window.UI = UI;

})(window);
