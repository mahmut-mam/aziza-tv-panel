/**
 * player.js
 * مشغل الفيديو الاحترافي لشاشة سامسونج (Samsung TV Video Player)
 * يدعم Hls.js، ملفات mp4/mkv، مسارات الصوت والدبلجة، وخيارات الترجمة الكاملة (حجم، لون، خلفية، وتحميل SRT)
 */

(function (window) {
    'use strict';

    var SUB_STORAGE_KEY = 'tv_subtitle_preferences';

    var VideoPlayer = {
        videoElement: null,
        hlsInstance: null,
        osdTimeout: null,
        currentItem: null,
        currentType: 'live', // 'live', 'vod', 'series'
        playlist: [],
        currentIndex: -1,
        isPlaying: false,
        aspectRatios: ['contain', 'cover', 'fill'],
        currentAspectIndex: 0,

        // إعدادات ومسارات الترجمة والصوت
        audioTracks: [],
        currentAudioTrack: 0,
        subtitleTracks: [],
        currentSubtitleTrack: -1, // -1 تعني إيقاف الترجمة
        externalCues: [],
        activeExternalCue: null,

        subSettings: {
            size: 'large',     // 'normal', 'large', 'xl'
            color: 'yellow',   // 'yellow', 'white', 'cyan'
            bg: 'dark'         // 'dark', 'none'
        },

        init: function () {
            this.videoElement = document.getElementById('main-video-player');
            this.loadSubtitlePreferences();
            this.bindEvents();
            this.setupRemoteControls();
            this.setupSubtitlesAndAudioControls();
            this.applySubtitleStyles();
            console.log('[VideoPlayer] Initialized video player engine with Subtitle & Audio support.');
        },

        loadSubtitlePreferences: function () {
            try {
                var saved = localStorage.getItem(SUB_STORAGE_KEY);
                if (saved) {
                    var parsed = JSON.parse(saved);
                    if (parsed.size) this.subSettings.size = parsed.size;
                    if (parsed.color) this.subSettings.color = parsed.color;
                    if (parsed.bg) this.subSettings.bg = parsed.bg;
                }
            } catch (e) {
                console.warn('[VideoPlayer] Failed to load subtitle preferences:', e);
            }
        },

        saveSubtitlePreferences: function () {
            try {
                localStorage.setItem(SUB_STORAGE_KEY, JSON.stringify(this.subSettings));
            } catch (e) {}
        },

        applySubtitleStyles: function () {
            var textEl = document.getElementById('custom-subtitles-text');
            if (!textEl) return;

            // إزالة الكلاسات السابقة
            textEl.className = 'custom-subtitle-text';
            textEl.classList.add('sub-size-' + this.subSettings.size);
            textEl.classList.add('sub-color-' + this.subSettings.color);
            textEl.classList.add('sub-bg-' + this.subSettings.bg);

            // تحديث الأزرار النشطة في المودال
            this.updateStyleButtonsUI();
        },

        updateStyleButtonsUI: function () {
            var self = this;
            document.querySelectorAll('[data-sub-size]').forEach(function (btn) {
                btn.classList.toggle('active', btn.getAttribute('data-sub-size') === self.subSettings.size);
            });
            document.querySelectorAll('[data-sub-color]').forEach(function (btn) {
                btn.classList.toggle('active', btn.getAttribute('data-sub-color') === self.subSettings.color);
            });
            document.querySelectorAll('[data-sub-bg]').forEach(function (btn) {
                btn.classList.toggle('active', btn.getAttribute('data-sub-bg') === self.subSettings.bg);
            });
        },

        bindEvents: function () {
            var self = this;
            if (!this.videoElement) return;

            this.videoElement.addEventListener('playing', function () {
                self.isPlaying = true;
                self.hideLoader();
                self.updatePlayPauseUI();
            });

            this.videoElement.addEventListener('pause', function () {
                self.isPlaying = false;
                self.updatePlayPauseUI();
                self.showOSD(true);
            });

            this.videoElement.addEventListener('waiting', function () {
                self.showLoader();
            });

            this.videoElement.addEventListener('timeupdate', function () {
                self.updateTimeline();
                self.updateExternalSubtitles();
            });

            this.videoElement.addEventListener('error', function (e) {
                console.error('[VideoPlayer] Media error:', e);
                self.showError('تعذر تشغيل هذا البث، قد يكون السيرفر مشغولاً أو الرابط غير متاح حالياً.');
            });

            this.videoElement.addEventListener('ended', function () {
                if (self.currentType === 'vod' || self.currentType === 'series') {
                    self.showOSD(true);
                }
            });
        },

        setupRemoteControls: function () {
            var self = this;
            if (!window.TizenKeys) return;

            window.TizenKeys.on('PLAY_PAUSE', function () {
                if (self.isPlayerActive()) {
                    self.togglePlayPause();
                    return true;
                }
            });

            window.TizenKeys.on('CHANNEL_UP', function () {
                if (self.isPlayerActive() && self.currentType === 'live') {
                    self.playNext();
                    return true;
                }
            });

            window.TizenKeys.on('CHANNEL_DOWN', function () {
                if (self.isPlayerActive() && self.currentType === 'live') {
                    self.playPrevious();
                    return true;
                }
            });

            window.TizenKeys.on('FAST_FORWARD', function () {
                if (self.isPlayerActive() && self.currentType !== 'live') {
                    self.seek(10);
                    return true;
                }
            });

            window.TizenKeys.on('REWIND', function () {
                if (self.isPlayerActive() && self.currentType !== 'live') {
                    self.seek(-10);
                    return true;
                }
            });

            window.TizenKeys.on('INFO', function () {
                if (self.isPlayerActive()) {
                    self.toggleOSD();
                    return true;
                }
            });
        },

        setupSubtitlesAndAudioControls: function () {
            var self = this;

            // فتح نافذة الترجمة
            var btnSub = document.getElementById('btn-player-subtitles');
            if (btnSub) {
                btnSub.addEventListener('click', function () {
                    self.openSubtitlesModal();
                });
            }

            // فتح نافذة مسارات الصوت
            var btnAudio = document.getElementById('btn-player-audio');
            if (btnAudio) {
                btnAudio.addEventListener('click', function () {
                    self.openAudioModal();
                });
            }

            // أزرار إغلاق المودالات
            var btnCloseSub = document.getElementById('btn-close-subtitles-modal');
            if (btnCloseSub) {
                btnCloseSub.addEventListener('click', function () {
                    self.closeSubtitlesModal();
                });
            }

            var btnCloseAudio = document.getElementById('btn-close-audio-modal');
            if (btnCloseAudio) {
                btnCloseAudio.addEventListener('click', function () {
                    self.closeAudioModal();
                });
            }

            // أزرار تغيير حجم الخط
            document.querySelectorAll('[data-sub-size]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    self.subSettings.size = btn.getAttribute('data-sub-size');
                    self.saveSubtitlePreferences();
                    self.applySubtitleStyles();
                    self.showToast('حجم خط الترجمة: ' + btn.textContent);
                });
            });

            // أزرار تغيير لون الخط
            document.querySelectorAll('[data-sub-color]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    self.subSettings.color = btn.getAttribute('data-sub-color');
                    self.saveSubtitlePreferences();
                    self.applySubtitleStyles();
                    self.showToast('لون خط الترجمة: ' + btn.textContent);
                });
            });

            // أزرار خلفية الخط
            document.querySelectorAll('[data-sub-bg]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    self.subSettings.bg = btn.getAttribute('data-sub-bg');
                    self.saveSubtitlePreferences();
                    self.applySubtitleStyles();
                    self.showToast('خلفية الترجمة: ' + btn.textContent);
                });
            });

            // زر تطبيق رابط ترجمة مخصص
            var btnApplyCustomSub = document.getElementById('btn-apply-custom-sub');
            if (btnApplyCustomSub) {
                btnApplyCustomSub.addEventListener('click', function () {
                    var input = document.getElementById('input-custom-sub-url');
                    if (input && input.value.trim()) {
                        self.loadExternalSubtitle(input.value.trim());
                        self.closeSubtitlesModal();
                    } else {
                        self.showToast('يرجى كتابة رابط ملف الترجمة');
                    }
                });
            }
        },

        isPlayerActive: function () {
            var playerScreen = document.getElementById('screen-player');
            return playerScreen && !playerScreen.classList.contains('hidden');
        },

        play: function (item, type, playlist, index) {
            var self = this;
            this.currentItem = item;
            this.currentType = type || 'live';
            this.playlist = playlist || [item];
            this.currentIndex = typeof index === 'number' ? index : 0;

            // تفريغ المسارات السابقة
            this.externalCues = [];
            this.activeExternalCue = null;
            this.hideSubtitleDisplay();

            var url = window.XtreamAPI ? window.XtreamAPI.getPlaybackUrl(item, this.currentType) : (item.direct_source || '');

            console.log('[VideoPlayer] Playing:', item.name || item.title, 'URL:', url);

            var playerScreen = document.getElementById('screen-player');
            if (playerScreen) {
                playerScreen.classList.remove('hidden');
            }

            this.updateMetadataUI(item);
            this.showLoader();
            this.showOSD(true);
            this.stopPlayback();

            if (!url) {
                this.showError('رابط البث غير متاح.');
                return;
            }

            var isHls = url.indexOf('.m3u8') !== -1;

            if (isHls && window.Hls && window.Hls.isSupported()) {
                this.hlsInstance = new window.Hls({
                    enableWorker: true,
                    lowLatencyMode: true,
                    backBufferLength: 60,
                    subtitleDisplay: false // نتحكم بالعرض عبر طبقتنا المخصصة فائقة الجودة
                });

                this.hlsInstance.loadSource(url);
                this.hlsInstance.attachMedia(this.videoElement);

                this.hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, function () {
                    self.detectTracks();
                    self.videoElement.play().catch(function (err) {
                        console.warn('[VideoPlayer] Autoplay prevented:', err);
                    });
                });

                // رصد مسارات الصوت والترجمة عند تحديثها
                this.hlsInstance.on(window.Hls.Events.AUDIO_TRACKS_UPDATED, function () {
                    self.detectTracks();
                });

                this.hlsInstance.on(window.Hls.Events.SUBTITLE_TRACKS_UPDATED, function () {
                    self.detectTracks();
                });

                this.hlsInstance.on(window.Hls.Events.SUBTITLE_TRACK_LOADED, function (event, data) {
                    console.log('[VideoPlayer] Subtitle track loaded:', data);
                });

                this.hlsInstance.on(window.Hls.Events.ERROR, function (event, data) {
                    if (data.fatal) {
                        switch (data.type) {
                            case window.Hls.ErrorTypes.NETWORK_ERROR:
                                console.warn('[VideoPlayer] Network error, recovering...');
                                self.hlsInstance.startLoad();
                                break;
                            case window.Hls.ErrorTypes.MEDIA_ERROR:
                                console.warn('[VideoPlayer] Media error, recovering...');
                                self.hlsInstance.recoverMediaError();
                                break;
                            default:
                                self.hlsInstance.destroy();
                                self.showError('تعذر فك تشفير هذا البث.');
                                break;
                        }
                    }
                });
            } else {
                this.videoElement.src = url;
                this.videoElement.load();
                this.videoElement.play().catch(function (e) {
                    console.warn('[VideoPlayer] Direct play catch:', e);
                });

                this.videoElement.onloadedmetadata = function () {
                    self.detectTracks();
                };
            }

            if (window.SpatialNav) {
                window.SpatialNav.setScope('#player-controls-container');
            }
        },

        // اكتشاف مسارات الصوت والترجمة المتوفرة
        detectTracks: function () {
            var self = this;
            this.audioTracks = [];
            this.subtitleTracks = [];

            // 1. مسارات Hls.js
            if (this.hlsInstance) {
                if (this.hlsInstance.audioTracks && this.hlsInstance.audioTracks.length > 0) {
                    this.audioTracks = this.hlsInstance.audioTracks.map(function (t, idx) {
                        return {
                            id: idx,
                            name: t.name || t.lang || ('المسار الصوتي ' + (idx + 1)),
                            lang: t.lang || ''
                        };
                    });
                    this.currentAudioTrack = this.hlsInstance.audioTrack >= 0 ? this.hlsInstance.audioTrack : 0;
                }

                if (this.hlsInstance.subtitleTracks && this.hlsInstance.subtitleTracks.length > 0) {
                    this.subtitleTracks = this.hlsInstance.subtitleTracks.map(function (t, idx) {
                        return {
                            id: idx,
                            name: t.name || t.lang || ('ترجمة ' + (idx + 1)),
                            lang: t.lang || ''
                        };
                    });
                    this.currentSubtitleTrack = this.hlsInstance.subtitleTrack;

                    // تشغيل تلقائي للترجمة العربية إن وجدت
                    if (this.currentSubtitleTrack === -1) {
                        var arIdx = this.subtitleTracks.findIndex(function (s) {
                            var l = (s.lang || s.name || '').toLowerCase();
                            return l.indexOf('ar') !== -1 || l.indexOf('عرب') !== -1;
                        });
                        if (arIdx >= 0) {
                            this.setSubtitleTrack(arIdx);
                        }
                    }
                }
            }

            // 2. مسارات HTML5 Native
            if (this.videoElement && this.videoElement.textTracks && this.videoElement.textTracks.length > 0) {
                for (var i = 0; i < this.videoElement.textTracks.length; i++) {
                    var tt = this.videoElement.textTracks[i];
                    if (tt.kind === 'subtitles' || tt.kind === 'captions') {
                        this.subtitleTracks.push({
                            id: i,
                            name: tt.label || tt.language || ('ترجمة ' + (i + 1)),
                            lang: tt.language || ''
                        });
                    }
                }
            }

            console.log('[VideoPlayer] Detected audio tracks:', this.audioTracks.length, 'subtitles:', this.subtitleTracks.length);
        },

        // فتح وإدارة نافذة الترجمة
        openSubtitlesModal: function () {
            var modal = document.getElementById('subtitles-modal');
            if (!modal) return;

            this.renderSubtitlesTracksList();
            this.applySubtitleStyles();
            modal.classList.remove('hidden');

            if (window.SpatialNav) {
                window.SpatialNav.setScope(modal);
            }
        },

        closeSubtitlesModal: function () {
            var modal = document.getElementById('subtitles-modal');
            if (modal) modal.classList.add('hidden');

            if (window.SpatialNav) {
                window.SpatialNav.setScope('#player-controls-container');
            }
        },

        renderSubtitlesTracksList: function () {
            var container = document.getElementById('subtitles-tracks-list');
            if (!container) return;
            container.innerHTML = '';

            var self = this;

            // خيار إيقاف الترجمة
            var offBtn = document.createElement('button');
            offBtn.type = 'button';
            offBtn.className = 'nav-item track-option-btn ' + (this.currentSubtitleTrack === -1 ? 'active' : '');
            offBtn.innerHTML = '🚫 إيقاف الترجمة';
            offBtn.addEventListener('click', function () {
                self.setSubtitleTrack(-1);
                self.renderSubtitlesTracksList();
                self.showToast('تم إيقاف الترجمة');
            });
            container.appendChild(offBtn);

            // مسارات الترجمة المكتشفة
            this.subtitleTracks.forEach(function (track) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'nav-item track-option-btn ' + (self.currentSubtitleTrack === track.id ? 'active' : '');
                btn.innerHTML = '💬 ' + track.name;
                btn.addEventListener('click', function () {
                    self.setSubtitleTrack(track.id);
                    self.renderSubtitlesTracksList();
                    self.showToast('تم تفعيل الترجمة: ' + track.name);
                });
                container.appendChild(btn);
            });

            if (this.externalCues.length > 0) {
                var extBtn = document.createElement('button');
                extBtn.type = 'button';
                extBtn.className = 'nav-item track-option-btn ' + (self.currentSubtitleTrack === 'ext' ? 'active' : '');
                extBtn.innerHTML = '📂 ترجمة خارجية مفعلة (' + this.externalCues.length + ' سطر)';
                extBtn.addEventListener('click', function () {
                    self.currentSubtitleTrack = 'ext';
                    self.renderSubtitlesTracksList();
                    self.showToast('تم تفعيل الترجمة الخارجية');
                });
                container.appendChild(extBtn);
            }
        },

        setSubtitleTrack: function (trackId) {
            this.currentSubtitleTrack = trackId;

            if (trackId === -1) {
                this.hideSubtitleDisplay();
                if (this.hlsInstance) this.hlsInstance.subtitleTrack = -1;
                if (this.videoElement && this.videoElement.textTracks) {
                    for (var i = 0; i < this.videoElement.textTracks.length; i++) {
                        this.videoElement.textTracks[i].mode = 'disabled';
                    }
                }
                return;
            }

            if (this.hlsInstance && typeof trackId === 'number') {
                this.hlsInstance.subtitleTrack = trackId;
            }

            if (this.videoElement && this.videoElement.textTracks && typeof trackId === 'number' && this.videoElement.textTracks[trackId]) {
                var track = this.videoElement.textTracks[trackId];
                track.mode = 'hidden'; // نستخدم hidden ونعرض عبر طبقتنا المخصصة
                var self = this;
                track.oncuechange = function () {
                    if (track.activeCues && track.activeCues.length > 0) {
                        self.renderSubtitleText(track.activeCues[0].text);
                    } else {
                        self.hideSubtitleDisplay();
                    }
                };
            }
        },

        // فتح وإدارة نافذة الصوت واللغة
        openAudioModal: function () {
            var modal = document.getElementById('audio-modal');
            if (!modal) return;

            this.renderAudioTracksList();
            modal.classList.remove('hidden');

            if (window.SpatialNav) {
                window.SpatialNav.setScope(modal);
            }
        },

        closeAudioModal: function () {
            var modal = document.getElementById('audio-modal');
            if (modal) modal.classList.add('hidden');

            if (window.SpatialNav) {
                window.SpatialNav.setScope('#player-controls-container');
            }
        },

        renderAudioTracksList: function () {
            var container = document.getElementById('audio-tracks-list');
            if (!container) return;
            container.innerHTML = '';

            var self = this;

            if (this.audioTracks.length === 0) {
                container.innerHTML = '<div class="empty-state" style="font-size: 18px; padding: 20px;">المسار الصوتي الافتراضي مفعّل (لا توجد لغات إضافية مسجلة في هذا البث)</div>';
                return;
            }

            this.audioTracks.forEach(function (track) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'nav-item track-option-btn ' + (self.currentAudioTrack === track.id ? 'active' : '');
                btn.innerHTML = '🔊 ' + track.name;
                btn.addEventListener('click', function () {
                    self.setAudioTrack(track.id);
                    self.renderAudioTracksList();
                    self.showToast('تم تبديل الصوت إلى: ' + track.name);
                });
                container.appendChild(btn);
            });
        },

        setAudioTrack: function (trackId) {
            this.currentAudioTrack = trackId;
            if (this.hlsInstance) {
                this.hlsInstance.audioTrack = trackId;
            }
        },

        // تحميل وتحليل ملف ترجمة خارجي (SRT أو VTT)
        loadExternalSubtitle: function (url) {
            var self = this;
            this.showToast('جاري تحميل ملف الترجمة...');

            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.onload = function () {
                if (xhr.status >= 200 && xhr.status < 300) {
                    var parsed = self.parseSRTorVTT(xhr.responseText);
                    if (parsed.length > 0) {
                        self.externalCues = parsed;
                        self.currentSubtitleTrack = 'ext';
                        self.showToast('تم تحميل ' + parsed.length + ' سطر ترجمة بنجاح ⭐');
                    } else {
                        self.showToast('لم يتم العثور على أسطر صالحة في ملف الترجمة');
                    }
                } else {
                    self.showToast('فشل تحميل ملف الترجمة من الرابط');
                }
            };
            xhr.onerror = function () {
                self.showToast('خطأ شبكة أثناء تحميل ملف الترجمة');
            };
            xhr.send();
        },

        parseSRTorVTT: function (text) {
            var cues = [];
            // توحيد فواصل الأسطر
            var normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            var blocks = normalized.split(/\n\s*\n/);

            function timeToSeconds(timeStr) {
                var parts = timeStr.trim().replace(',', '.').split(':');
                if (parts.length === 3) {
                    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
                } else if (parts.length === 2) {
                    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
                }
                return 0;
            }

            blocks.forEach(function (block) {
                var lines = block.trim().split('\n');
                var timeLineIndex = -1;

                for (var i = 0; i < lines.length; i++) {
                    if (lines[i].indexOf('-->') !== -1) {
                        timeLineIndex = i;
                        break;
                    }
                }

                if (timeLineIndex !== -1) {
                    var times = lines[timeLineIndex].split('-->');
                    var start = timeToSeconds(times[0]);
                    var end = timeToSeconds(times[1]);
                    var cueText = lines.slice(timeLineIndex + 1).join('\n').replace(/<[^>]+>/g, '').trim();

                    if (cueText && !isNaN(start) && !isNaN(end)) {
                        cues.push({ start: start, end: end, text: cueText });
                    }
                }
            });

            return cues;
        },

        updateExternalSubtitles: function () {
            if (this.currentSubtitleTrack !== 'ext' || this.externalCues.length === 0) return;

            var currentTime = this.videoElement.currentTime || 0;
            var active = null;

            for (var i = 0; i < this.externalCues.length; i++) {
                var cue = this.externalCues[i];
                if (currentTime >= cue.start && currentTime <= cue.end) {
                    active = cue;
                    break;
                }
            }

            if (active) {
                this.renderSubtitleText(active.text);
            } else {
                this.hideSubtitleDisplay();
            }
        },

        renderSubtitleText: function (text) {
            var box = document.getElementById('custom-subtitles-container');
            var span = document.getElementById('custom-subtitles-text');
            if (box && span) {
                span.textContent = text;
                box.classList.remove('hidden');
            }
        },

        hideSubtitleDisplay: function () {
            var box = document.getElementById('custom-subtitles-container');
            if (box) box.classList.add('hidden');
        },

        stopPlayback: function () {
            if (this.hlsInstance) {
                this.hlsInstance.destroy();
                this.hlsInstance = null;
            }
            if (this.videoElement) {
                this.videoElement.pause();
                this.videoElement.removeAttribute('src');
                this.videoElement.load();
            }
            this.isPlaying = false;
            this.hideSubtitleDisplay();
        },

        close: function () {
            this.stopPlayback();
            var playerScreen = document.getElementById('screen-player');
            if (playerScreen) {
                playerScreen.classList.add('hidden');
            }
            this.closeSubtitlesModal();
            this.closeAudioModal();
            this.clearOSDTimeout();
        },

        togglePlayPause: function () {
            if (!this.videoElement) return;
            if (this.videoElement.paused) {
                this.videoElement.play();
            } else {
                this.videoElement.pause();
            }
        },

        seek: function (seconds) {
            if (!this.videoElement || isNaN(this.videoElement.duration)) return;
            var target = this.videoElement.currentTime + seconds;
            if (target < 0) target = 0;
            if (target > this.videoElement.duration) target = this.videoElement.duration;
            this.videoElement.currentTime = target;
            this.showOSD(true);
        },

        playNext: function () {
            if (this.playlist.length === 0) return;
            var nextIndex = (this.currentIndex + 1) % this.playlist.length;
            var item = this.playlist[nextIndex];
            this.play(item, this.currentType, this.playlist, nextIndex);
        },

        playPrevious: function () {
            if (this.playlist.length === 0) return;
            var prevIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
            var item = this.playlist[prevIndex];
            this.play(item, this.currentType, this.playlist, prevIndex);
        },

        toggleAspectRatio: function () {
            this.currentAspectIndex = (this.currentAspectIndex + 1) % this.aspectRatios.length;
            var mode = this.aspectRatios[this.currentAspectIndex];
            this.videoElement.style.objectFit = mode;

            var labels = { contain: '16:9 القياسي', cover: 'ملء الشاشة (تكبير)', fill: 'تمدد كامل (Stretch)' };
            this.showToast('نسبة العرض: ' + labels[mode]);
        },

        // واجهة OSD
        showOSD: function (autoHide) {
            var osd = document.getElementById('player-osd');
            if (!osd) return;

            osd.classList.remove('hidden-osd');
            this.clearOSDTimeout();

            if (autoHide !== false) {
                var self = this;
                this.osdTimeout = setTimeout(function () {
                    self.hideOSD();
                }, 5000);
            }
        },

        hideOSD: function () {
            var osd = document.getElementById('player-osd');
            if (osd && this.isPlaying) {
                osd.classList.add('hidden-osd');
            }
        },

        toggleOSD: function () {
            var osd = document.getElementById('player-osd');
            if (osd && osd.classList.contains('hidden-osd')) {
                this.showOSD(true);
            } else {
                this.hideOSD();
            }
        },

        clearOSDTimeout: function () {
            if (this.osdTimeout) {
                clearTimeout(this.osdTimeout);
                this.osdTimeout = null;
            }
        },

        updateMetadataUI: function (item) {
            var titleEl = document.getElementById('player-title');
            var catEl = document.getElementById('player-category');
            var iconEl = document.getElementById('player-channel-logo');
            var liveBadge = document.getElementById('player-live-badge');
            var timelineBox = document.getElementById('player-timeline-box');

            var name = item.name || item.title || 'قناة غير معروفة';
            if (titleEl) titleEl.textContent = name;

            if (catEl) {
                catEl.textContent = item.category_name || (this.currentType === 'live' ? 'بث حي ومباشر' : 'فيديو حسب الطلب');
            }

            if (iconEl) {
                if (item.stream_icon) {
                    iconEl.src = item.stream_icon;
                    iconEl.style.display = 'block';
                } else {
                    iconEl.style.display = 'none';
                }
            }

            if (this.currentType === 'live') {
                if (liveBadge) liveBadge.style.display = 'inline-block';
                if (timelineBox) timelineBox.style.display = 'none';
            } else {
                if (liveBadge) liveBadge.style.display = 'none';
                if (timelineBox) timelineBox.style.display = 'flex';
            }

            var errorBox = document.getElementById('player-error-box');
            if (errorBox) errorBox.classList.add('hidden');
        },

        updateTimeline: function () {
            if (this.currentType === 'live') return;
            var current = this.videoElement.currentTime || 0;
            var total = this.videoElement.duration || 0;

            var timeCurrentEl = document.getElementById('player-time-current');
            var timeTotalEl = document.getElementById('player-time-total');
            var progressFill = document.getElementById('player-progress-fill');

            if (timeCurrentEl) timeCurrentEl.textContent = this.formatTime(current);
            if (timeTotalEl) timeTotalEl.textContent = this.formatTime(total);

            if (progressFill && total > 0) {
                var pct = (current / total) * 100;
                progressFill.style.width = pct + '%';
            }
        },

        formatTime: function (secs) {
            if (isNaN(secs) || secs < 0) return '00:00';
            var h = Math.floor(secs / 3600);
            var m = Math.floor((secs % 3600) / 60);
            var s = Math.floor(secs % 60);

            if (h > 0) {
                return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
            }
            return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
        },

        updatePlayPauseUI: function () {
            var icon = document.getElementById('btn-play-pause-icon');
            if (icon) {
                icon.className = this.isPlaying ? 'icon-pause' : 'icon-play';
            }
        },

        showLoader: function () {
            var loader = document.getElementById('player-loader');
            if (loader) loader.classList.remove('hidden');
        },

        hideLoader: function () {
            var loader = document.getElementById('player-loader');
            if (loader) loader.classList.add('hidden');
        },

        showError: function (message) {
            this.hideLoader();
            var errorBox = document.getElementById('player-error-box');
            var errorMsg = document.getElementById('player-error-msg');
            if (errorBox && errorMsg) {
                errorMsg.textContent = message;
                errorBox.classList.remove('hidden');
                this.showOSD(false);
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

    window.VideoPlayer = VideoPlayer;

})(window);
