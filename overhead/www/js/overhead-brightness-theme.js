(function (window, document) {
    'use strict';

    const themeLink = document.getElementById('overheadBrightnessTheme');
    const knobSlotSelector = '.overhead-slice[data-slice="119"]';

    if (!themeLink) return;

    function applyPosition(position) {
        const numericPosition = Number(position);
        const safePosition = Number.isFinite(numericPosition)
            ? Math.max(1, Math.min(3, numericPosition))
            : 1;
        const theme = safePosition >= 2 ? 'brilho-off' : 'brilho-on';
        const background = safePosition === 1
            ? '#506879'
            : (safePosition === 2 ? '#303e48' : '#1b2328');
        const href = 'css/' + theme + '.css';
        if (themeLink.getAttribute('href') !== href) {
            themeLink.setAttribute('href', href);
        }
        document.documentElement.style.setProperty('--overhead-brightness-background', background);
        document.documentElement.dataset.overheadBrightness = theme;
    }

    function applyBridgeStatus(message) {
        const controls = message && message.overhead && message.overhead.controls;
        if (!controls) return;
        const state = controls['119'] || controls['0119'];
        if (state && Number.isInteger(state.position)) applyPosition(state.position);
    }

    const knob = document.querySelector(knobSlotSelector + ' .airbus-knob');
    applyPosition(knob ? knob.dataset.position || 1 : 1);

    window.addEventListener('overhead:control-action', function (event) {
        const detail = event.detail || {};
        if (String(detail.slice || '').padStart(3, '0') === '119' && Number.isInteger(detail.position)) {
            applyPosition(detail.position);
        }
    });

    window.addEventListener('overhead:bridge-status', function (event) {
        applyBridgeStatus(event.detail || {});
    });

    window.addEventListener('overhead:state-restored', function (event) {
        const controls = event.detail && event.detail.controls;
        const state = controls && controls['slice-119-ohKnV'];
        if (state && Number.isInteger(state.position)) applyPosition(state.position);
    });
})(window, document);
