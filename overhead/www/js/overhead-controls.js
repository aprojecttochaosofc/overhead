(function (window, $) {
    'use strict';

    const builders = {
        config: function () {
            return $('<button>', {
                id: 'gear',
                class: 'config-button',
                type: 'button',
                'aria-label': 'Abrir configurações'
            }).append(
                '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
                    '<path d="M19.14 12.94a7.43 7.43 0 0 0 .05-.94 7.43 7.43 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.1 7.1 0 0 0-1.63-.94l-.36-2.54A.49.49 0 0 0 13.9 2h-3.8a.49.49 0 0 0-.49.42l-.36 2.54a7.1 7.1 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7.43 7.43 0 0 0-.05.94c0 .32.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.12.21.37.3.6.22l2.39-.96c.5.39 1.05.71 1.63.94l.36 2.54c.03.24.24.42.49.42h3.8c.25 0 .46-.18.49-.42l.36-2.54c.58-.23 1.13-.55 1.63-.94l2.39.96c.23.09.48-.01.6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"/>' +
                '</svg>'
            );
        },
        luzcon: function () {
            return $('<span>', {
                class: 'connection-light',
                'data-state': 'off',
                role: 'status',
                'aria-label': 'Luz apagada'
            });
        },
        ohSw2: function () {
            return $('<button>', {
                class: 'butomkey',
                type: 'button',
                'data-positions': '2',
                'data-actions': 'twoOff,twoOn',
                'data-state': '0',
                'aria-label': 'Chavinha de duas posições'
            }).append('<img src="assets/keysbuttom.png" alt="">');
        },
        ohSw3: function () {
            return $('<button>', {
                class: 'butomkey',
                type: 'button',
                'data-positions': '3',
                'data-direction': '1',
                'data-actions': 'threeOff,threeCenter,threeOn',
                'data-state': '0',
                'aria-label': 'Chavinha de três posições'
            }).append('<img src="assets/keysbuttom.png" alt="">');
        },
        ohPbSq: function () {
            return $('<button>', {
                class: 'push-button',
                type: 'button',
                'data-state': 'off',
                'data-fault': 'false',
                'data-actions': 'pushOff,pushOn',
                'aria-label': 'Botão quadrado'
            }).append('<span class="fault-text">FAULT</span><span class="off-text">OFF</span>');
        },
        ohPbSq3: function () {
            return $('<button>', {
                class: 'push-button push-button-status',
                type: 'button',
                'data-state': 'off',
                'data-fault': 'false',
                'data-callback': 'pushButtonPulse',
                'aria-label': 'Botão quadrado: OFF'
            }).append(
                '<span class="fault-text">FAULT</span>' +
                '<span class="off-text">OFF</span>' +
                '<span class="on-text">ON</span>' +
                '<span class="avail-text">AVAIL</span>'
            );
        },
        ohFault: function () {
            return $('<div>', {
                class: 'fault-indicator',
                'data-state': 'off',
                'data-status-state': 'off',
                'data-status-text': '',
                role: 'status',
                'aria-label': 'FAULT apagada'
            }).append(
                '<span class="fault-text">FAULT</span>' +
                '<span class="status-text"></span>'
            );
        },
        ohPbRd: function () {
            return $('<button>', {
                class: 'round-button',
                type: 'button',
                'data-fault': 'false',
                'data-callback': 'roundButtonCallback',
                'aria-label': 'Botão redondo momentâneo'
            });
        },
        ohDisp: function () {
            return $('<output>', {
                class: 'overhead-display',
                'aria-label': '26.5 V'
            }).append('<span class="display-value">26.5</span><span class="display-unit">V</span>');
        },
        ohKnV: function () {
            return $('<button>', {
                class: 'airbus-knob knob-vertical',
                type: 'button',
                'data-position': '1',
                'data-direction': '1',
                'data-actions': 'knobVertical',
                'aria-label': 'Seletor vertical de três posições'
            }).append(
                '<span class="knob-body">' +
                    '<span class="knob-pointer"></span>' +
                    '<span class="knob-center"></span>' +
                '</span>'
            );
        },
        ohKnH: function () {
            return $('<button>', {
                class: 'airbus-knob knob-horizontal',
                type: 'button',
                'data-position': '1',
                'data-direction': '1',
                'data-actions': 'knobHorizontal',
                'aria-label': 'Seletor horizontal de três posições'
            }).append(
                '<span class="knob-body">' +
                    '<span class="knob-pointer"></span>' +
                    '<span class="knob-center"></span>' +
                '</span>'
            );
        }
    };

    function createOverheadControl(name, target, onState) {
        const builder = builders[name];
        if (!builder) return $();

        if (typeof target === 'function' && onState === undefined) {
            onState = target;
            target = null;
        }

        if (!target && document.currentScript) {
            target = document.currentScript.parentElement;
        }
        if (!target) return $();

        const $slots = target && target.jquery ? target : $(target);
        const controls = [];

        $slots.each(function () {
            const $slot = $(this);
            let $control = $slot.children().filter(function () {
                return this.dataset.controlName === name;
            }).first();

            if (!$control.length) {
                $control = builder();
                $control.attr('data-control-name', name);
                $slot.empty().append($control);
            }

            if (name === 'ohPbSq' && $slot.attr('data-on-indication') === 'true') {
                $control.attr('data-on-indication', 'true');
                if (!$control.children('.on-text').length) {
                    $control.append('<span class="on-text">ON</span>');
                }
            }

            const callback = onState || $slot.attr('data-callback');
            if (typeof callback === 'function' || typeof callback === 'string') {
                $control[0].overheadOnPositionChange = callback;
            }

            const lightId = $slot.attr('data-light-id');
            if (name === 'luzcon' && lightId) {
                $control.attr('id', lightId.replace(/^#/, ''));
            }

            const lightTarget = $slot.attr('data-light-target');
            if (name === 'ohPbRd' && lightTarget) {
                $control.attr('data-light-target', lightTarget.replace(/^#/, ''));
            }

            controls.push($control[0]);
        });

        return $(controls);
    }

    Object.keys(builders).forEach(function (name) {
        window[name] = function (target, onState) {
            return createOverheadControl(name, target, onState);
        };
    });
    window.createOverheadControl = createOverheadControl;

    if (typeof window.pushButtonPulse !== 'function') {
        window.pushButtonPulse = function (button, position, requestedState) {
            const slot = button && button.closest('.overhead-slice');
            if (slot && slot.dataset.slice === '148') {
                if (button._ohPbSq3Timer) window.clearTimeout(button._ohPbSq3Timer);
                button._ohPbSq3Timer = null;
                return;
            }

            if (typeof window.setPushButtonStatus === 'function') {
                window.setPushButtonStatus(button, 'on');
            }

            if (button._ohPbSq3Timer) window.clearTimeout(button._ohPbSq3Timer);
            button._ohPbSq3Timer = window.setTimeout(function () {
                window.setPushButtonStatus(button, 'avail');
                button._ohPbSq3Timer = null;
            }, 1400);

            return 'on';
        };
    }

    $('.overhead-slice').each(function () {
        const $slot = $(this);
        const name = $slot.attr('data-control') || $slot.text().trim();

        if (builders[name]) {
            createOverheadControl(name, this);
        }
    });

    const pressedRoundPointers = new Map();

    function setLinkedRoundLight(button, state) {
        const lightId = button && button.dataset.lightTarget;
        if (lightId && typeof window.setOhLightState === 'function') {
            window.setOhLightState(lightId, state);
        }
    }

    function releaseRoundPointer(pointerId) {
        if (!pressedRoundPointers.has(pointerId)) return;

        const button = pressedRoundPointers.get(pointerId);
        pressedRoundPointers.delete(pointerId);
        if (!Array.from(pressedRoundPointers.values()).includes(button)) {
            setLinkedRoundLight(button, 'off');
        }
    }

    document.addEventListener('pointerdown', function (event) {
        if (!(event.target instanceof Element) || event.isPrimary === false) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        const button = event.target.closest('.round-button');
        if (!button || button.disabled || button.dataset.fault === 'true') return;

        pressedRoundPointers.set(event.pointerId, button);
        setLinkedRoundLight(button, 'red');

        if (typeof button.setPointerCapture === 'function') {
            try { button.setPointerCapture(event.pointerId); } catch (error) {}
        }
    });

    document.addEventListener('pointerup', function (event) {
        releaseRoundPointer(event.pointerId);
    });

    document.addEventListener('pointercancel', function (event) {
        releaseRoundPointer(event.pointerId);
    });

    document.addEventListener('lostpointercapture', function (event) {
        releaseRoundPointer(event.pointerId);
    });

    window.addEventListener('blur', function () {
        const heldButtons = new Set(pressedRoundPointers.values());
        pressedRoundPointers.clear();
        heldButtons.forEach(function (button) {
            setLinkedRoundLight(button, 'off');
        });
    });
})(window, window.jQuery);
