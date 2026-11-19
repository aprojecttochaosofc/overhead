(function (window, document) {
    'use strict';

    const configs = window.overheadBatteryConfig || {};
    const batteries = [configs.battery1, configs.battery2].filter(Boolean);
    const controlsById = new Map();
    let connected = false;
    let stateAvailable = false;
    let canControl = false;
    let observed = { battery1: null, battery2: null };

    function findSlice(slice) {
        return document.querySelector('.overhead-slice[data-slice="' + slice + '"]');
    }

    function findControl(slice, selector) {
        const slot = findSlice(slice);
        return slot ? slot.querySelector(selector) : null;
    }

    batteries.forEach(function (config) {
        const button = findControl(config.buttonSlice, '.push-button');
        const display = findControl(config.displaySlice, '.overhead-display');
        if (button) {
            button.dataset.batteryId = config.id;
            button.dataset.state = 'off';
            button.disabled = true;
            controlsById.set(config.id, button);
        }
        if (display) {
            display.setAttribute('data-battery-display', config.id);
            if (typeof window.setOhDisp === 'function') window.setOhDisp(display, '', '');
        }
    });

    function hasBothStates() {
        return stateAvailable && observed.battery1 && observed.battery2 &&
            typeof observed.battery1.on === 'boolean' &&
            typeof observed.battery2.on === 'boolean';
    }

    function bothBatteriesOn() {
        return hasBothStates() && observed.battery1.on && observed.battery2.on;
    }

    function updateDisplay(config, state) {
        const display = findControl(config.displaySlice, '.overhead-display');
        if (!display || typeof window.setOhDisp !== 'function') return;

        const battery = state && state[config.id];
        const voltage = battery && battery.voltage;
        if (typeof voltage !== 'number' || !Number.isFinite(voltage) || voltage < 0) {
            window.setOhDisp(display, '', '');
            return;
        }

        window.setOhDisp(display, voltage.toFixed(1), 'V');
    }

    function updateControls() {
        const ready = hasBothStates();
        const powered = bothBatteriesOn();
        document.documentElement.dataset.aircraftPowered = powered ? 'true' : 'false';

        batteries.forEach(function (config) {
            const button = controlsById.get(config.id);
            const battery = observed[config.id];
            if (button) {
                if (ready && battery) button.dataset.state = battery.on ? 'on' : 'off';
                button.disabled = !(connected && ready && canControl);
                button.setAttribute('aria-pressed', ready && battery && battery.on ? 'true' : 'false');
            }
            updateDisplay(config, observed);
        });

        document.querySelectorAll('.butomkey, .push-button, .round-button, .airbus-knob')
            .forEach(function (control) {
                if (control.dataset.batteryId || control.dataset.externalPower === 'true') return;
                control.disabled = !powered;
            });
    }

    function clearState() {
        connected = false;
        stateAvailable = false;
        canControl = false;
        observed = { battery1: null, battery2: null };
        batteries.forEach(function (config) {
            const button = controlsById.get(config.id);
            if (button) button.dataset.state = 'off';
        });
        updateControls();
    }

    function applyBridgeStatus(message) {
        const plugin = message && message.plugin;
        connected = Boolean(plugin && plugin.connected);
        const state = message && message.batteries;
        stateAvailable = Boolean(connected && state && state.available === true);
        canControl = Boolean(stateAvailable && state.canControl === true);
        observed = stateAvailable
            ? { battery1: state.battery1 || null, battery2: state.battery2 || null }
            : { battery1: null, battery2: null };
        updateControls();
    }

    function sendBatteryAction(event) {
        const detail = event.detail || {};
        if (detail.action !== 'battery.set' || !controlsById.has(detail.batteryId)) return;
        if (!connected || !hasBothStates() || !canControl || typeof detail.enabled !== 'boolean') return;

        const sent = typeof window.sendOverheadBridgeMessage === 'function' &&
            window.sendOverheadBridgeMessage({
                type: 'battery.set',
                requestId: 'bat-' + detail.batteryId + '-' + Date.now(),
                batteryId: detail.batteryId,
                enabled: detail.enabled
            });

        if (!sent) console.warn('A ação da bateria não foi enviada: ponte desconectada.');
    }

    window.batteryControlAllows = function (control) {
        if (control && control.dataset && control.dataset.batteryId) {
            return Boolean(connected && hasBothStates() && canControl);
        }
        if (control && control.dataset && control.dataset.externalPower === 'true') {
            return typeof window.canControlExternalPower === 'function' &&
                window.canControlExternalPower();
        }
        return bothBatteriesOn();
    };

    window.addEventListener('overhead:control-action', sendBatteryAction);
    window.addEventListener('overhead:bridge-status', function (event) {
        applyBridgeStatus(event.detail || {});
    });
    window.addEventListener('overhead:bridge-disconnected', clearState);
    window.addEventListener('overhead:bridge-message', function (event) {
        const message = event.detail || {};
        if (message.type === 'battery.command.rejected') {
            console.warn('O plugin rejeitou o comando da bateria.', message.reason || '');
        }
    });

    updateControls();
})(window, document);
