(function (window, document) {
    'use strict';

    const config = window.overheadExternalPowerConfig || {};
    const slot = config.buttonSlice
        ? document.querySelector('.overhead-slice[data-slice="' + config.buttonSlice + '"]')
        : null;
    const button = slot && slot.querySelector('.push-button-status');
    let connected = false;
    let available = false;
    let canControl = false;
    let state = 'off';

    if (button) {
        button.dataset.externalPower = 'true';
        button.disabled = true;
        if (typeof window.setPushButtonStatus === 'function') {
            window.setPushButtonStatus(button, 'off');
        }
    }

    function render() {
        if (!button) return;
        if (typeof window.setPushButtonStatus === 'function') {
            window.setPushButtonStatus(button, state);
        } else {
            button.dataset.state = state;
        }
        button.disabled = !(connected && available && canControl && state !== 'off');
        button.setAttribute('aria-label', 'EXT PWR: ' + state.toUpperCase());
    }

    function applyBridgeStatus(message) {
        const plugin = message && message.plugin;
        const externalPower = message && message.externalPower;
        connected = Boolean(plugin && plugin.connected);
        available = Boolean(connected && externalPower && externalPower.available === true);
        canControl = Boolean(externalPower && externalPower.canControl === true);
        state = available && ['off', 'on', 'avail'].includes(externalPower.state)
            ? externalPower.state
            : 'off';
        render();
    }

    function sendAction(event) {
        const detail = event.detail || {};
        if (!button || detail.slice !== config.buttonSlice || !connected || !available || !canControl) return;

        const enabled = state === 'avail';
        const sent = typeof window.sendOverheadBridgeMessage === 'function' &&
            window.sendOverheadBridgeMessage({
                type: 'externalPower.set',
                requestId: 'ext-pwr-' + Date.now(),
                enabled: enabled
            });
        if (!sent) console.warn('A ação do EXT PWR não foi enviada: ponte desconectada.');
    }

    function clearState() {
        connected = false;
        available = false;
        canControl = false;
        state = 'off';
        render();
    }

    window.canControlExternalPower = function () {
        return Boolean(connected && available && canControl && state !== 'off');
    };
    window.addEventListener('overhead:bridge-status', function (event) {
        applyBridgeStatus(event.detail || {});
    });
    window.addEventListener('overhead:bridge-disconnected', clearState);
    window.addEventListener('overhead:control-action', sendAction);
    window.addEventListener('overhead:bridge-message', function (event) {
        const message = event.detail || {};
        if (message.type === 'externalPower.command.rejected') {
            console.warn('O EXT PWR não foi acionado pelo plugin.', message.reason || '');
        }
    });

    render();
})(window, document);
