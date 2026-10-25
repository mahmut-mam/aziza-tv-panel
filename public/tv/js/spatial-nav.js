/**
 * spatial-nav.js
 * محرك التنقل الفضائي لريموت التلفزيون (TV Spatial Navigation Engine)
 * يحسب أقرب عنصر قابل للتركيز بدقة هندسية سلسة لجميع زوايا الشاشة
 */

(function (window) {
    'use strict';

    var SpatialNav = {
        currentFocus: null,
        activeScope: null,
        historyByScope: {},
        navItemSelector: '.nav-item:not([disabled]):not(.disabled):not(.hidden)',

        init: function () {
            var self = this;

            // الاستماع لحركات الأسهم ومفتاح الإدخال عبر TizenKeys
            if (window.TizenKeys) {
                window.TizenKeys.on('UP', function () { return self.move('UP'); });
                window.TizenKeys.on('DOWN', function () { return self.move('DOWN'); });
                window.TizenKeys.on('LEFT', function () { return self.move('LEFT'); });
                window.TizenKeys.on('RIGHT', function () { return self.move('RIGHT'); });
                window.TizenKeys.on('ENTER', function () { return self.triggerEnter(); });
            }

            // دعم نقر الماوس للتجربة على الحاسوب أيضاً
            document.addEventListener('mouseover', function (e) {
                var target = e.target.closest(self.navItemSelector);
                if (target && target !== self.currentFocus) {
                    self.setFocus(target, false);
                }
            });

            console.log('[SpatialNav] Initialized spatial navigation.');
        },

        setScope: function (scopeElement) {
            if (typeof scopeElement === 'string') {
                this.activeScope = document.querySelector(scopeElement);
            } else {
                this.activeScope = scopeElement;
            }

            // استعادة آخر عنصر كان محدداً في هذا النطاق إن وجد
            var last = null;
            if (this.activeScope && this.activeScope.id && this.historyByScope[this.activeScope.id]) {
                var candidate = this.historyByScope[this.activeScope.id];
                if (document.contains(candidate) && this.isVisible(candidate)) {
                    last = candidate;
                }
            }

            if (!last && this.activeScope) {
                last = this.activeScope.querySelector(this.navItemSelector);
            }

            if (last) {
                this.setFocus(last, true);
            }
        },

        getFocusableElements: function () {
            var root = this.activeScope || document.body;
            var elements = Array.prototype.slice.call(root.querySelectorAll(this.navItemSelector));
            var self = this;
            return elements.filter(function (el) {
                return self.isVisible(el);
            });
        },

        isVisible: function (el) {
            if (!el) return false;
            var style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                return false;
            }
            var rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        },

        setFocus: function (el, shouldScroll) {
            if (!el) return;

            if (this.currentFocus) {
                this.currentFocus.classList.remove('focused');
                this.currentFocus.blur();
            }

            this.currentFocus = el;
            el.classList.add('focused');
            el.focus({ preventScroll: true });

            // حفظ في تاريخ النطاق
            if (this.activeScope && this.activeScope.id) {
                this.historyByScope[this.activeScope.id] = el;
            }

            if (shouldScroll !== false) {
                this.scrollToElement(el);
            }

            // إرسال حدث مخصص
            var event = new CustomEvent('nav-focus', { detail: { element: el }, bubbles: true });
            el.dispatchEvent(event);
        },

        scrollToElement: function (el) {
            if (!el) return;
            try {
                el.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'center'
                });
            } catch (e) {
                // قديم على بعض متصفحات تايزن
                el.scrollIntoView(false);
            }
        },

        triggerEnter: function () {
            if (this.currentFocus) {
                this.currentFocus.classList.add('active-press');
                var self = this;
                setTimeout(function () {
                    if (self.currentFocus) {
                        self.currentFocus.classList.remove('active-press');
                    }
                }, 150);

                this.currentFocus.click();
                return true;
            }
            return false;
        },

        move: function (direction) {
            if (!this.currentFocus || !this.isVisible(this.currentFocus)) {
                var first = this.getFocusableElements()[0];
                if (first) {
                    this.setFocus(first);
                    return true;
                }
                return false;
            }

            // فحص التحويل اليدوي المخصص بواسطة data-nav-*
            var manualAttr = 'data-nav-' + direction.toLowerCase();
            var manualTargetId = this.currentFocus.getAttribute(manualAttr);
            if (manualTargetId) {
                var manualEl = document.querySelector(manualTargetId);
                if (manualEl && this.isVisible(manualEl)) {
                    this.setFocus(manualEl);
                    return true;
                }
            }

            var candidates = this.getFocusableElements();
            var currentRect = this.currentFocus.getBoundingClientRect();
            var currentCenter = {
                x: currentRect.left + currentRect.width / 2,
                y: currentRect.top + currentRect.height / 2
            };

            var bestCandidate = null;
            var minDistance = Infinity;

            for (var i = 0; i < candidates.length; i++) {
                var el = candidates[i];
                if (el === this.currentFocus) continue;

                var rect = el.getBoundingClientRect();
                var center = {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                };

                var dx = center.x - currentCenter.x;
                var dy = center.y - currentCenter.y;

                // التحقق من توافق الاتجاه
                var isValidDirection = false;
                switch (direction) {
                    case 'UP':
                        isValidDirection = dy < -5;
                        break;
                    case 'DOWN':
                        isValidDirection = dy > 5;
                        break;
                    case 'LEFT':
                        isValidDirection = dx < -5;
                        break;
                    case 'RIGHT':
                        isValidDirection = dx > 5;
                        break;
                }

                if (!isValidDirection) continue;

                // حساب المسافة الإقليدية مع إعطاء وزن للمحاذاة المستقيمة
                var primaryDist = 0;
                var secondaryDist = 0;

                if (direction === 'UP' || direction === 'DOWN') {
                    primaryDist = Math.abs(dy);
                    secondaryDist = Math.abs(dx);
                } else {
                    primaryDist = Math.abs(dx);
                    secondaryDist = Math.abs(dy);
                }

                // تفضيل العناصر المصطفة على نفس الخط
                var distance = primaryDist + (secondaryDist * 1.8);

                if (distance < minDistance) {
                    minDistance = distance;
                    bestCandidate = el;
                }
            }

            if (bestCandidate) {
                this.setFocus(bestCandidate);
                return true;
            }

            return false;
        }
    };

    window.SpatialNav = SpatialNav;

})(window);
