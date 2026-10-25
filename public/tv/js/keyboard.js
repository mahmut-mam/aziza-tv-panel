/**
 * keyboard.js
 * لوحة مفاتيح افتراضية للشاشات الذكية (TV Virtual On-Screen Keyboard)
 * تتيح إدخال السيرفر واسم المستخدم وكلمة المرور بالريموت بكل سهولة وسرعة
 */

(function (window) {
    'use strict';

    var TVKeyboard = {
        targetInput: null,
        isOpen: false,
        layout: 'en', // 'en', 'ar', 'sym'
        previousScope: null,

        keysConfig: {
            en: [
                ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'],
                ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '_'],
                ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ':', '@'],
                ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '/', '?'],
                [
                    { label: 'http://', value: 'http://', span: 2 },
                    { label: 'مسافة', value: ' ', span: 3 },
                    { label: ':8080', value: ':8080', span: 2 },
                    { label: '.com', value: '.com', span: 2 },
                    { label: 'حذف ⌫', action: 'backspace', span: 2, className: 'btn-action-del' },
                    { label: 'تم ✓', action: 'done', span: 2, className: 'btn-action-done' }
                ]
            ],
            sym: [
                ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'],
                ['~', '`', '+', '=', '[', ']', '{', '}', '\\', '|'],
                [';', ':', '\'', '"', ',', '<', '>', '/', '?', '_'],
                [
                    { label: 'مسافة', value: ' ', span: 3 },
                    { label: 'حذف ⌫', action: 'backspace', span: 2, className: 'btn-action-del' },
                    { label: 'تم ✓', action: 'done', span: 2, className: 'btn-action-done' }
                ]
            ]
        },

        init: function () {
            this.container = document.getElementById('tv-keyboard-overlay');
            this.keysWrapper = document.getElementById('tv-keyboard-grid');
            this.inputDisplay = document.getElementById('tv-keyboard-preview');
            this.render();
            this.bindEvents();
            console.log('[TVKeyboard] Initialized virtual TV keyboard.');
        },

        bindEvents: function () {
            var self = this;
            if (window.TizenKeys) {
                window.TizenKeys.on('BACK', function () {
                    if (self.isOpen) {
                        self.close();
                        return true;
                    }
                });
            }
        },

        render: function () {
            var self = this;
            if (!this.keysWrapper) return;
            this.keysWrapper.innerHTML = '';

            var currentRows = this.keysConfig[this.layout] || this.keysConfig.en;

            currentRows.forEach(function (row, rIdx) {
                var rowDiv = document.createElement('div');
                rowDiv.className = 'keyboard-row';

                row.forEach(function (k, cIdx) {
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'nav-item key-btn';

                    var label = typeof k === 'object' ? k.label : k;
                    var val = typeof k === 'object' ? k.value : k;

                    btn.textContent = label;

                    if (typeof k === 'object') {
                        if (k.span) btn.style.flex = k.span;
                        if (k.className) btn.classList.add(k.className);
                    }

                    btn.addEventListener('click', function () {
                        if (typeof k === 'object' && k.action) {
                            self.handleAction(k.action);
                        } else {
                            self.insertChar(val);
                        }
                    });

                    rowDiv.appendChild(btn);
                });

                self.keysWrapper.appendChild(rowDiv);
            });
        },

        handleAction: function (action) {
            if (!this.targetInput) return;

            if (action === 'backspace') {
                var cur = this.targetInput.value;
                if (cur.length > 0) {
                    this.targetInput.value = cur.slice(0, -1);
                    this.updatePreview();
                }
            } else if (action === 'done') {
                this.close();
            } else if (action === 'clear') {
                this.targetInput.value = '';
                this.updatePreview();
            }
        },

        insertChar: function (char) {
            if (!this.targetInput) return;
            this.targetInput.value += char;
            this.updatePreview();
        },

        updatePreview: function () {
            if (this.inputDisplay && this.targetInput) {
                this.inputDisplay.textContent = this.targetInput.value || '...';
            }
        },

        open: function (inputElement) {
            this.targetInput = inputElement;
            this.isOpen = true;
            this.previousScope = window.SpatialNav ? window.SpatialNav.activeScope : null;

            if (this.container) {
                this.container.classList.remove('hidden');
            }

            this.updatePreview();

            if (window.SpatialNav) {
                window.SpatialNav.setScope('#tv-keyboard-overlay');
                var firstKey = this.keysWrapper.querySelector('.key-btn');
                if (firstKey) {
                    window.SpatialNav.setFocus(firstKey);
                }
            }
        },

        close: function () {
            this.isOpen = false;
            if (this.container) {
                this.container.classList.add('hidden');
            }

            if (window.SpatialNav) {
                if (this.previousScope) {
                    window.SpatialNav.setScope(this.previousScope);
                }
                if (this.targetInput) {
                    window.SpatialNav.setFocus(this.targetInput);
                }
            }
            this.targetInput = null;
        }
    };

    window.TVKeyboard = TVKeyboard;

})(window);
