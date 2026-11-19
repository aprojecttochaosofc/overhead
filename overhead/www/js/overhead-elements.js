(function () {
    'use strict';

    function applyPushButtonStatusResult(control, result) {
        if (!control.classList.contains('push-button-status') || result === undefined || result === null) {
            return;
        }

        function apply(value) {
            if (typeof window.setPushButtonStatus === 'function') {
                window.setPushButtonStatus(control, value);
            }
        }

        if (result && typeof result.then === 'function') {
            result.then(apply).catch(function (error) {
                console.error('Não foi possível atualizar o estado do ohPbSq3.', error);
            });
        } else {
            apply(result);
        }
    }

    function emit(control, action, position, state, extra) {
        const isPulseButton = control.classList.contains('push-button-status');
        const slot = control.closest('.overhead-slice');
        const detail = {
            id: control.id || null,
            slice: slot ? slot.dataset.slice : null,
            action: action,
            position: position,
            state: state,
            pulse: isPulseButton
        };
        if (extra && typeof extra === 'object') Object.assign(detail, extra);

        window.dispatchEvent(new CustomEvent('overhead:control-action', {
            detail: detail
        }));

        let result;
        let onPositionChange = control.overheadOnPositionChange;
        if (typeof onPositionChange === 'string') {
            onPositionChange = window[onPositionChange];
        }

        if (typeof onPositionChange === 'function') {
            result = isPulseButton
                ? onPositionChange(state, control, detail)
                : onPositionChange(position, control, detail);
        } else {
            const callback = window[action];
            if (typeof callback === 'function') {
                result = callback(control, position, state, detail);
            }
        }

        applyPushButtonStatusResult(control, result);
    }
    function actionsFor(control) {
        return (control.dataset.actions || '')
            .split(',')
            .map(function (name) { return name.trim(); });
    }

    function switchClick(control) {
        if (control.dataset.fault === 'true' || control.disabled) return;

        const count = Number(control.dataset.positions);
        const actions = actionsFor(control);
        let state = Number(control.dataset.state) || 0;
        let position;

        if (count === 2) {
            state = state === 0 ? 2 : 0;
            position = state === 0 ? 1 : 2;
        } else {
            let direction = Number(control.dataset.direction || '1');
            state += direction;

            if (state >= 2) {
                state = 2;
                direction = -1;
            }

            if (state <= 0) {
                state = 0;
                direction = 1;
            }

            position = state + 1;
        }

        const actionIndex = count === 2 ? (state === 0 ? 0 : 1) : state;
        emit(control, actions[actionIndex], position, state);
    }

    function pushClick(control) {
        if (control.dataset.fault === 'true' || control.disabled) return;

        if (control.dataset.batteryId) {
            const enabled = control.dataset.state !== 'on';
            emit(control, 'battery.set', null, enabled ? 'on' : 'off', {
                batteryId: control.dataset.batteryId,
                enabled: enabled
            });
            return;
        }

        const state = control.dataset.state === 'off' ? 'on' : 'off';
        control.dataset.state = state;
        const actions = actionsFor(control);
        emit(control, actions[state === 'off' ? 0 : 1], state === 'off' ? 1 : 2, state);
    }

    function pulsePushButton(control) {
        if (control.dataset.fault === 'true' || control.disabled) return;

        const slot = control.closest('.overhead-slice');
        const currentApuRequest = control.dataset.apuRequestedState || control.dataset.state || 'off';
        const state = slot && slot.dataset.slice === '148'
            ? (currentApuRequest === 'off' ? 'on' : 'off')
            : (control.dataset.state || 'off');
        const action = control.dataset.callback || 'pushButtonPulse';
        emit(control, action, null, state);
    }

    function knobClick(control) {
        if (control.dataset.fault === 'true' || control.disabled) return;

        let position = Number(control.dataset.position || '1');
        let direction = Number(control.dataset.direction || '1');

        if (position >= 3) direction = -1;
        else if (position <= 1) direction = 1;

        position = Math.max(1, Math.min(3, position + direction));
        control.dataset.position = String(position);
        control.dataset.direction = String(direction);

        const actions = actionsFor(control);
        emit(control, actions[0], position, position);
    }

    document.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const control = target.closest('.butomkey, .push-button, .round-button, .airbus-knob');
        if (!control) return;

        if (typeof window.batteryControlAllows === 'function' &&
            !window.batteryControlAllows(control)) return;

        if (control.matches('.butomkey')) {
            switchClick(control);
        } else if (control.matches('.push-button-status')) {
            pulsePushButton(control);
        } else if (control.matches('.push-button')) {
            pushClick(control);
        } else if (control.matches('.round-button')) {
            if (control.dataset.fault === 'true' || control.disabled) return;
            const actions = actionsFor(control);
            const action = control.dataset.callback || actions[0];
            emit(control, action, null, null);
        } else if (control.matches('.airbus-knob')) {
            knobClick(control);
        }
    });
    function resolveControl(target) {
        if (typeof target !== 'string') return target || null;

        const byId = document.getElementById(target);
        if (byId) return byId;

        try {
            const bySelector = document.querySelector(target);
            if (bySelector) return bySelector;
        } catch (error) {}

        return Array.from(document.querySelectorAll('[data-control-name]'))
            .find(function (control) { return control.dataset.controlName === target; }) || null;
    }

    function resolveLightTargets(target) {
        if (!target) return [];
        if (target.jquery) return Array.from(target).filter(function (element) {
            return element.classList && element.classList.contains('connection-light');
        });
        if (target instanceof Element) {
            return target.classList.contains('connection-light') ? [target] :
                Array.from(target.querySelectorAll('.connection-light'));
        }
        if (typeof target !== 'string') return [];

        const byId = document.getElementById(target);
        if (byId) return byId.classList.contains('connection-light') ? [byId] :
            Array.from(byId.querySelectorAll('.connection-light'));

        try {
            const matches = Array.from(document.querySelectorAll(target));
            if (matches.length) {
                return matches.reduce(function (lights, element) {
                    if (element.classList.contains('connection-light')) {
                        lights.push(element);
                    } else {
                        lights.push.apply(lights, element.querySelectorAll('.connection-light'));
                    }
                    return lights;
                }, []);
            }
        } catch (error) {}

        return Array.from(document.querySelectorAll('[data-control-name="luzcon"]'))
            .filter(function (light) { return light.dataset.controlName === target; });
    }

    function setOhLightState(target, value, label) {
        const requested = value && typeof value === 'object' ? value.state : value;
        const rawState = String(requested === undefined || requested === null ? '' : requested)
            .trim()
            .toLowerCase();
        const aliases = {
            apagada: 'off',
            apagado: 'off',
            desligada: 'off',
            desligado: 'off',
            off: 'off',
            vermelha: 'red',
            vermelho: 'red',
            disconnected: 'red',
            fault: 'red',
            red: 'red',
            verde: 'green',
            ligado: 'green',
            ligada: 'green',
            on: 'green',
            connected: 'green',
            green: 'green'
        };
        const state = aliases[rawState];
        if (!state) return false;

        const lights = resolveLightTargets(target);
        if (!lights.length) return false;

        lights.forEach(function (light) {
            light.dataset.state = state;
            light.classList.toggle('connected', state === 'green');
            light.classList.toggle('disconnected', state === 'red');
            const stateLabel = label || (state === 'green'
                ? 'Luz verde'
                : (state === 'red' ? 'Luz vermelha' : 'Luz apagada'));
            light.title = stateLabel;
            light.setAttribute('aria-label', stateLabel);
        });
        return true;
    }

    window.setOhLightState = setOhLightState;
    window.setLightState = setOhLightState;
    window.setLuzcon = setOhLightState;

    function setPushButtonStatus(target, value) {
        const button = resolveControl(target);
        if (!button || !button.classList.contains('push-button-status')) return false;

        const rawState = value && typeof value === 'object' ? value.state : value;
        const requested = String(rawState === undefined || rawState === null ? '' : rawState)
            .trim()
            .toLowerCase();
        const state = requested === 'available' ? 'avail' : requested;
        if (!['off', 'on', 'avail'].includes(state)) return false;

        button.dataset.state = state;
        button.setAttribute('aria-label', button.dataset.fault === 'true'
            ? 'FAULT ativa'
            : 'Botão quadrado: ' + state.toUpperCase());
        return true;
    }

    window.setPushButtonStatus = setPushButtonStatus;
    window.setOhPbSq3State = setPushButtonStatus;

    function setPushButtonFault(target, active) {
        const button = resolveControl(target);
        if (!button || !button.classList.contains('push-button')) return false;

        const isActive = active === true || active === 'true' || active === 1;
        button.dataset.fault = isActive ? 'true' : 'false';
        button.setAttribute('aria-label', isActive ? 'FAULT ativa' : (button.classList.contains('push-button-status') ? 'Botão quadrado: ' + button.dataset.state.toUpperCase() : 'Botão quadrado'));
        return true;
    }

    window.setPushButtonFault = setPushButtonFault;
    window.setOhPbSqFault = setPushButtonFault;

    function updateFaultIndicatorLabel(indicator) {
        const faultActive = indicator.dataset.state === 'on';
        const statusText = indicator.dataset.statusState === 'on'
            ? indicator.dataset.statusText
            : '';
        const parts = [faultActive ? 'FAULT ativa' : 'FAULT apagada'];

        if (statusText) parts.push(statusText);
        indicator.setAttribute('aria-label', parts.join('; '));
    }

    window.setFaultLight = function (target, active) {
        const indicator = resolveControl(target);
        if (!indicator) return;

        if (indicator.classList.contains('push-button')) {
            setPushButtonFault(indicator, active);
            return;
        }

        const isActive = active === true || active === 'true' || active === 1;
        indicator.dataset.state = isActive ? 'on' : 'off';
        updateFaultIndicatorLabel(indicator);
    };

    window.setOhFaultStatus = function (target, value) {
        const indicator = resolveControl(target);
        if (!indicator || !indicator.classList.contains('fault-indicator')) return false;

        const statusText = value === true
            ? 'ON'
            : (value === false || value === null || value === undefined
                ? ''
                : String(value).trim());
        const statusElement = indicator.querySelector('.status-text');

        indicator.dataset.statusState = statusText ? 'on' : 'off';
        indicator.dataset.statusText = statusText;
        if (statusElement) statusElement.textContent = statusText;
        updateFaultIndicatorLabel(indicator);
        return true;
    };

    window.setFaultStatus = window.setOhFaultStatus;

    window.setOhDisp = function (target, value, unit) {
        const display = resolveControl(target);
        if (!display) return;

        const valueElement = display.querySelector('.display-value');
        const unitElement = display.querySelector('.display-unit');
        if (valueElement) valueElement.textContent = String(value);
        if (unit !== undefined && unitElement) unitElement.textContent = String(unit);

        const shownUnit = unitElement ? unitElement.textContent : '';
        display.setAttribute('aria-label', String(value) + (shownUnit ? ' ' + shownUnit : ''));
    };
    function setConnectionStatus(connected, message) {
        const statusMessage = document.getElementById('connectionMessage');
        const rawStatus = String(connected === undefined || connected === null ? '' : connected)
            .trim()
            .toLowerCase();
        const state = connected === true || connected === 1 ||
            ['connected', 'green', 'on', 'true'].includes(rawStatus)
            ? 'green'
            : (['off', 'apagado', 'apagada', 'desligado', 'desligada'].includes(rawStatus)
                ? 'off'
                : 'red');
        const isConnected = state === 'green';
        const displayMessage = message || (isConnected
            ? 'Conectado ao servidor do PC.'
            : (state === 'off' ? 'Luz de conexão apagada.' : 'Desconectado do servidor do PC.'));
        const connectionLight = document.querySelector('[data-slice="017"] .connection-light');

        if (connectionLight) {
            setOhLightState(connectionLight, state, displayMessage);
        }

        if (statusMessage) {
            statusMessage.classList.toggle('connected', isConnected);
            statusMessage.textContent = displayMessage;
        }
    }

    window.setConnectionStatus = setConnectionStatus;
    window.setOverheadConnectionStatus = setConnectionStatus;

    window.addEventListener('overhead:connection-status', function (event) {
        const detail = event.detail;
        const connected = typeof detail === 'object' && detail !== null
            ? detail.connected
            : detail;
        setConnectionStatus(connected, detail && detail.message);
    });

    const gearButton = document.getElementById('gear');
    const settingsShade = document.getElementById('settingsShade');
    const serverIp = document.getElementById('serverIp');
    const serverPort = document.getElementById('serverPort');
    const connectionMessage = document.getElementById('connectionMessage');

    function readConnectionSettings() {
        try {
            return JSON.parse(localStorage.getItem('overheadConnectionSettings') || '{}');
        } catch (error) {
            return {};
        }
    }

    function saveConnectionSettings() {
        const settings = {
            ip: serverIp.value.trim(),
            port: serverPort.value.trim()
        };

        try {
            localStorage.setItem('overheadConnectionSettings', JSON.stringify(settings));
        } catch (error) {}

        return settings;
    }

    function openSettings() {
        const saved = readConnectionSettings();
        serverIp.value = saved.ip || '';
        serverPort.value = saved.port || '';
        settingsShade.hidden = false;
        serverIp.focus();
    }

    function closeSettings() {
        settingsShade.hidden = true;
        gearButton.focus();
    }

    gearButton.addEventListener('click', openSettings);
    document.getElementById('closeSettings').addEventListener('click', closeSettings);
    settingsShade.addEventListener('click', function (event) {
        if (event.target === settingsShade) closeSettings();
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !settingsShade.hidden) closeSettings();
    });

    document.getElementById('saveSettings').addEventListener('click', async function () {
        const settings = saveConnectionSettings();

        try {
            if (typeof window.saveOverheadState === 'function') {
                await window.saveOverheadState(settings);
            }
        } catch (error) {
            connectionMessage.textContent = 'Falha ao salvar overheadstate.json: ' + (error && error.message ? error.message : 'erro de gravação');
            connectionMessage.classList.remove('connected');
            return;
        }

        connectionMessage.textContent = window.cordova && window.cordova.platformId === 'browser'
            ? 'Configurações e estados salvos no navegador.'
            : 'Configurações e estados salvos.';
        connectionMessage.classList.remove('connected');
        closeSettings();
    });

    document.getElementById('connectButton').addEventListener('click', function () {
        const settings = saveConnectionSettings();

        if (!settings.ip || !settings.port) {
            connectionMessage.textContent = 'Informe o IP e a porta do servidor.';
            connectionMessage.classList.remove('connected');
            serverIp.focus();
            return;
        }

        setConnectionStatus(false, 'Aguardando resposta da ponte do X-Plane...');
        window.dispatchEvent(new CustomEvent('overhead:connect-request', {
            detail: settings
        }));
    });

    document.getElementById('disconnectExitButton').addEventListener('click', function () {
        const button = this;
        button.disabled = true;
        connectionMessage.classList.remove('connected');
        connectionMessage.textContent = 'Desconectando do servidor…';

        const disconnect = typeof window.disconnectOverheadBridge === 'function'
            ? window.disconnectOverheadBridge()
            : Promise.resolve();

        Promise.resolve(disconnect).then(function () {
            const isAndroid = window.cordova && window.cordova.platformId === 'android';
            const exitApp = navigator.app && navigator.app.exitApp;

            if (isAndroid && typeof exitApp === 'function') {
                connectionMessage.textContent = 'Desconectado. Fechando o app…';
                window.setTimeout(function () { exitApp.call(navigator.app); }, 100);
                return;
            }

            button.disabled = false;
            connectionMessage.textContent = window.cordova && window.cordova.platformId === 'ios'
                ? 'Conexão encerrada. O iOS não permite fechar o app por um botão; feche-o pelo seletor de apps.'
                : 'Conexão encerrada. Pode fechar esta janela pelo sistema.';
        }).catch(function () {
            button.disabled = false;
            connectionMessage.textContent = 'A conexão foi encerrada. Feche o app pelo sistema.';
        });
    });

    setConnectionStatus(false);
})();

