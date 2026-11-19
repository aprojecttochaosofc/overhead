(function (window, document) {
    'use strict';

    const momentaryPressSlices = new Set(['018', '019', '020', '088']);
    const protectedExistingSlices = new Set(['070', '072', '074']);
    const pressedPointers = new Map();
    const apuPulseRepeatMs = 1500;
    const apuPulseDurationMs = 160;
    const apuMasterUnlockDelayMs = 2000;
    let bridgeConnected = false;
    let apuRequestedState = null;
    let apuRetryTimer = null;
    let apuReleaseTimer = null;
    let activeApuPulseId = null;
    let apuPulseSequence = 0;
    let apuMasterConfirmedOn = null;
    let apuMasterUnlockTimer = null;
    let apuMasterReady = false;

    function clearApuMasterUnlockTimer() {
        if (apuMasterUnlockTimer) window.clearTimeout(apuMasterUnlockTimer);
        apuMasterUnlockTimer = null;
    }

    function masterStateFromReadback(state) {
        if (!state || typeof state !== 'object') return null;
        if (typeof state.state === 'boolean') return state.state;
        if (state.enabled === true || state.on === true || state.powered === true) return true;
        if (state.enabled === false || state.on === false || state.powered === false) return false;

        const values = [state.state, state.status, state.statusText]
            .filter(function (value) { return typeof value === 'string'; })
            .map(function (value) { return value.trim().toLowerCase(); });
        if (values.some(function (value) {
            return ['on', 'enabled', 'active', 'running', 'starting', 'powered', 'true', '1'].includes(value);
        })) return true;
        if (values.some(function (value) {
            return ['off', 'disabled', 'inactive', 'stopped', 'unpowered', 'false', '0'].includes(value);
        })) return false;
        return null;
    }

    function applyApuMasterReadback(state) {
        const masterOn = masterStateFromReadback(state);
        if (masterOn === null || masterOn === apuMasterConfirmedOn) return;

        apuMasterConfirmedOn = masterOn;
        apuMasterReady = false;
        clearApuMasterUnlockTimer();

        if (!masterOn) {
            if (apuRequestedState === 'on' || apuRequestedState === 'starting') {
                apuRequestedState = null;
                setApuRequestedState(null);
                stopApuStartRetries();
                if (activeApuPulseId) finishApuPulse(activeApuPulseId);
            }
            return;
        }

        apuMasterUnlockTimer = window.setTimeout(function () {
            apuMasterUnlockTimer = null;
            if (apuMasterConfirmedOn !== true) return;
            apuMasterReady = true;
        }, apuMasterUnlockDelayMs);
    }

    function lockApuButtonUntilMasterReadback() {
        clearApuMasterUnlockTimer();
        apuMasterConfirmedOn = null;
        apuMasterReady = false;
        if (apuRequestedState === 'on' || apuRequestedState === 'starting') {
            apuRequestedState = null;
            setApuRequestedState(null);
            stopApuStartRetries();
            if (activeApuPulseId) finishApuPulse(activeApuPulseId);
        }
    }

    function send(message) {
        return bridgeConnected && typeof window.sendOverheadBridgeMessage === 'function' &&
            window.sendOverheadBridgeMessage(message);
    }

    function sendControlAction(detail) {
        const slice = String(detail.slice || '').padStart(3, '0');
        // These controls already have dedicated, working handlers in battery.js
        // and external-power.js. Do not send them a second time through the
        // generic ToLiss route.
        if (!slice || momentaryPressSlices.has(slice) || protectedExistingSlices.has(slice) ||
            detail.action === 'battery.set' || detail.action === 'externalPower.set') return;
        if (slice === '148') {
            if (!apuMasterReady || apuMasterConfirmedOn !== true) return;
            requestApuState(detail.state === 'off' ? 'off' : 'on');
            return;
        }
        const commandSlice = swapBeaconStrobeSlices(slice);
        let position = Number.isInteger(detail.position) ? detail.position : null;
        if (slice === '152' && position >= 1 && position <= 3) {
            setEmergencyExitFault(swapEmergencyExitPositions(position));
            position = swapEmergencyExitPositions(position);
        }
        if (!send({
            type: 'control.action',
            requestId: 'oh-' + commandSlice + '-' + Date.now(),
            slice: commandSlice,
            position: position,
            state: ['on', 'off', 'avail'].includes(detail.state) ? detail.state : null
        })) {
            console.warn('O comando do overhead não foi enviado. Verifique a conexão e as baterias.');
        }
    }

    function sendMomentaryPress(slice, pressed) {
        send({
            type: 'control.press',
            requestId: 'momentary-' + slice + '-' + (pressed ? 'down-' : 'up-') + Date.now(),
            slice: slice,
            pressed: pressed
        });
    }

    function setApuRequestedState(value) {
        const button = findControl('148');
        if (!button) return;
        if (value) {
            button.dataset.apuRequestedState = value;
        } else {
            delete button.dataset.apuRequestedState;
        }
    }

    function finishApuPulse(pulseId) {
        if (activeApuPulseId !== pulseId) return;
        activeApuPulseId = null;
        if (apuReleaseTimer) window.clearTimeout(apuReleaseTimer);
        apuReleaseTimer = null;
        send({
            type: 'control.press',
            requestId: 'apu-' + pulseId + '-up',
            slice: '148',
            pressed: false
        });
    }

    function sendApuPulse() {
        if (activeApuPulseId) finishApuPulse(activeApuPulseId);
        const pulseId = Date.now() + '-' + (++apuPulseSequence);
        activeApuPulseId = pulseId;
        const requestedState = apuRequestedState === 'off' ? 'off' : 'on';
        const sent = send({
            type: 'control.press',
            requestId: 'apu-' + pulseId + '-down',
            slice: '148',
            pressed: true,
            state: requestedState
        });
        apuReleaseTimer = window.setTimeout(function () {
            finishApuPulse(pulseId);
        }, apuPulseDurationMs);
        return sent;
    }

    function stopApuStartRetries() {
        if (apuRetryTimer) window.clearInterval(apuRetryTimer);
        apuRetryTimer = null;
    }

    function requestApuState(targetState) {
        apuRequestedState = targetState === 'off' ? 'off' : 'on';
        setApuRequestedState(apuRequestedState);
        stopApuStartRetries();
        sendApuPulse();
        if (apuRequestedState === 'on') {
            apuRetryTimer = window.setInterval(function () {
                if (apuRequestedState === 'on') sendApuPulse();
            }, apuPulseRepeatMs);
        }
    }

    function readApuState(state) {
        if (!state) return null;
        const values = [state.state, state.status, state.statusText, state.apuState]
            .filter(function (value) { return typeof value === 'string'; })
            .map(function (value) { return value.trim().toLowerCase(); });

        if (state.available === true || state.aligned === true ||
            values.some(function (value) {
                return ['avail', 'available', 'aligned', 'running', 'started', 'ready'].includes(value);
            })) return 'avail';
        if (state.aligning === true || state.starting === true ||
            values.some(function (value) {
                return ['on', 'starting', 'align', 'aligning', 'igniting', 'start'].includes(value);
            })) return 'on';
        if (state.available === false || state.aligned === false ||
            values.some(function (value) {
                return ['off', 'stopped', 'shutdown', 'disabled'].includes(value);
            })) return 'off';
        return null;
    }

    function findControl(slice) {
        const slot = document.querySelector('.overhead-slice[data-slice="' + slice + '"]');
        return slot ? slot.querySelector('.butomkey, .push-button, .round-button, .airbus-knob') : null;
    }

    function setEmergencyExitFault(position) {
        if (![1, 2, 3].includes(position)) return;
        const slot = document.querySelector('.overhead-slice[data-slice="151"]');
        const indicator = slot && slot.querySelector('.fault-indicator');
        if (!indicator) return;

        if (typeof window.setFaultLight === 'function') {
            window.setFaultLight(indicator, position === 3);
        }
        if (typeof window.setOhFaultStatus === 'function') {
            window.setOhFaultStatus(indicator, '');
        }
    }

    function swapEmergencyExitPositions(position) {
        if (position === 1) return 3;
        if (position === 3) return 1;
        return position;
    }

    function swapBeaconStrobeSlices(slice) {
        if (slice === '109') return '126';
        if (slice === '126') return '109';
        return slice;
    }

    function updateDirectionFromReadback(control, position, positions) {
        const previousPosition = control.classList.contains('butomkey')
            ? (positions === 2
                ? (Number(control.dataset.state) === 0 ? 1 : 2)
                : Number(control.dataset.state || 0) + 1)
            : Number(control.dataset.position || 1);

        if (position <= 1) {
            control.dataset.direction = '1';
        } else if (position >= positions) {
            control.dataset.direction = '-1';
        } else if (previousPosition === 1) {
            control.dataset.direction = '1';
        } else if (previousPosition === positions) {
            control.dataset.direction = '-1';
        }
    }

    function readFaultState(state) {
        if (!state) return null;

        const faultValues = ['fault', 'fail', 'failed', 'failure']
            .map(function (field) { return state[field]; })
            .filter(function (value) { return value !== undefined && value !== null; });
        const faultWords = ['fault', 'faulted', 'fail', 'failed'];
        const hasFault = faultValues.some(function (value) {
            return value === true || value === 1 ||
                (typeof value === 'string' && ['true', '1'].concat(faultWords).includes(value.trim().toLowerCase()));
        }) || [state.status, state.state].some(function (value) {
            return typeof value === 'string' && faultWords.includes(value.trim().toLowerCase());
        });
        const healthyWords = ['ok', 'normal', 'clear', 'none'];
        const hasClearStatus = [state.status, state.state].some(function (value) {
            return typeof value === 'string' && healthyWords.includes(value.trim().toLowerCase());
        });

        return hasFault ? true : (faultValues.length > 0 || hasClearStatus ? false : null);
    }

    function applyControlState(slice, state) {
        const controlSlice = swapBeaconStrobeSlices(String(slice).padStart(3, '0'));
        const control = findControl(controlSlice);
        if (!control || !state) return;

        if (String(slice).padStart(3, '0') === '117') {
            applyApuMasterReadback(state);
        }

        if (Number.isInteger(state.position)) {
            const positions = Number(control.dataset.positions || (control.classList.contains('airbus-knob') ? 3 : 2));
            const reportedPosition = slice === '152'
                ? swapEmergencyExitPositions(state.position)
                : state.position;
            const position = Math.max(1, Math.min(positions, reportedPosition));
            updateDirectionFromReadback(control, position, positions);
            if (control.classList.contains('butomkey')) {
                const spriteState = positions === 2 ? (position === 1 ? 0 : 2) : position - 1;
                control.dataset.state = String(spriteState);
                const sprite = control.querySelector('img');
                if (sprite) sprite.style.left = String(-spriteState * 100) + '%';
            } else if (control.classList.contains('airbus-knob')) {
                control.dataset.position = String(position);
            }
            if (slice === '152') setEmergencyExitFault(swapEmergencyExitPositions(position));
        }

        let reportedState = state.state;
        let ignoreApuReadback = false;
        if (slice === '148') {
            reportedState = readApuState(state);
            if (reportedState && ['on', 'starting'].includes(apuRequestedState) && reportedState === 'off') {
                ignoreApuReadback = true;
            } else if (reportedState && apuRequestedState === 'off' && reportedState !== 'off') {
                ignoreApuReadback = true;
            } else if (reportedState === 'on' && apuRequestedState === 'on') {
                apuRequestedState = 'starting';
                setApuRequestedState(apuRequestedState);
                stopApuStartRetries();
            } else if (reportedState === 'avail' && ['on', 'starting'].includes(apuRequestedState)) {
                apuRequestedState = null;
                setApuRequestedState(null);
                stopApuStartRetries();
            } else if (reportedState === 'off' && apuRequestedState === 'off') {
                apuRequestedState = null;
                setApuRequestedState(null);
                stopApuStartRetries();
            }
        }

        if (!ignoreApuReadback && ['off', 'on', 'avail'].includes(reportedState)) {
            if (control.classList.contains('push-button-status') && typeof window.setPushButtonStatus === 'function') {
                window.setPushButtonStatus(control, reportedState);
            } else {
                control.dataset.state = reportedState;
            }
        }

        const faultState = readFaultState(state);
        if (faultState !== null) {
            if (control.classList.contains('push-button') && typeof window.setPushButtonFault === 'function') {
                window.setPushButtonFault(control, faultState);
            } else if (control.dataset.fault !== undefined) {
                control.dataset.fault = faultState ? 'true' : 'false';
            }
        }
    }

    function applyIndicatorState(slice, state) {
        const slot = document.querySelector('.overhead-slice[data-slice="' + slice + '"]');
        if (!slot) return;
        const indicator = slot.querySelector('.fault-indicator');
        const normalizedSlice = String(slice).padStart(3, '0');
        if (indicator && ['002', '003', '004'].includes(normalizedSlice)) {
            applyAdirsIndicatorState(indicator, state || { fault: false, statusState: 'off', statusText: '' });
            return;
        }
        if (!state) return;
        if (!indicator) {
            const button = slot.querySelector('.push-button');
            if (button) {
                const faultState = readFaultState(state);
                const isFault = faultState === null ? state.state === 'on' : faultState;
                if (typeof window.setPushButtonFault === 'function') {
                    window.setPushButtonFault(button, isFault);
                } else {
                    button.dataset.fault = isFault ? 'true' : 'false';
                }
            }
            return;
        }

        if (typeof state.fault === 'boolean' && typeof window.setFaultLight === 'function') {
            window.setFaultLight(indicator, state.fault);
        }
        if (typeof window.setOhFaultStatus === 'function') {
            window.setOhFaultStatus(indicator, state.status || '');
        }
    }

    function applyAdirsIndicatorState(indicator, state) {
        const textValues = [state.status, state.statusText, state.alignment, state.alignmentStatus]
            .filter(function (value) { return typeof value === 'string'; })
            .map(function (value) { return value.trim(); })
            .filter(Boolean);
        const normalizedValues = textValues.map(function (value) { return value.toLowerCase(); });
        const statusIsOff = state.statusState === 'off';
        const reportsAligned = state.aligned === true || state.aligning === false ||
            normalizedValues.some(function (value) {
                return ['aligned', 'complete', 'completed', 'ready', 'normal', 'none', 'clear', 'off']
                    .includes(value);
            });
        const reportsAligning = state.aligning === true || state.aligned === false ||
            (!statusIsOff && normalizedValues.some(function (value) {
                return ['align', 'aligning'].includes(value);
            }));
        const faultState = readFaultState(state);

        if (reportsAligned) {
            if (typeof window.setFaultLight === 'function') window.setFaultLight(indicator, false);
            if (typeof window.setOhFaultStatus === 'function') window.setOhFaultStatus(indicator, '');
            return;
        }

        if (faultState !== null && typeof window.setFaultLight === 'function') {
            window.setFaultLight(indicator, faultState);
        }

        let statusText = '';
        if (reportsAligning) {
            statusText = 'ALIGN';
        } else if (state.statusState !== 'off') {
            statusText = typeof state.statusText === 'string' && state.statusText.trim()
                ? state.statusText.trim()
                : (typeof state.status === 'string' ? state.status.trim() : '');
        }

        if (typeof window.setOhFaultStatus === 'function') {
            window.setOhFaultStatus(indicator, statusText);
        }
    }

    function applyLightState(slice, state) {
        const slot = document.querySelector('.overhead-slice[data-slice="' + slice + '"]');
        const light = slot && slot.querySelector('.connection-light');
        if (!light || !state || typeof window.setOhLightState !== 'function') return;
        window.setOhLightState(light, state.state || 'off');
    }

    function applyBridgeStatus(message) {
        bridgeConnected = Boolean(message && message.plugin && message.plugin.connected);
        const overhead = message && message.overhead;
        if (!overhead) return;
        Object.keys(overhead.controls || {}).forEach(function (slice) {
            applyControlState(slice, overhead.controls[slice]);
        });
        Object.keys(overhead.indicators || {}).forEach(function (slice) {
            applyIndicatorState(slice, overhead.indicators[slice]);
        });
        ['002', '003', '004'].forEach(function (slice) {
            const hasIndicatorState = Object.keys(overhead.indicators || {}).some(function (key) {
                return String(key).padStart(3, '0') === slice;
            });
            if (!hasIndicatorState) {
                applyAdirsIndicatorState(
                    document.querySelector('.overhead-slice[data-slice="' + slice + '"] .fault-indicator'),
                    { fault: false, statusState: 'off', statusText: '' }
                );
            }
        });
        Object.keys(overhead.lights || {}).forEach(function (slice) {
            applyLightState(slice, overhead.lights[slice]);
        });
        const emergencyExitSwitch = findControl('152');
        if (emergencyExitSwitch && emergencyExitSwitch.classList.contains('butomkey')) {
            setEmergencyExitFault(swapEmergencyExitPositions(Number(emergencyExitSwitch.dataset.state) + 1));
        }
    }

    window.addEventListener('overhead:control-action', function (event) {
        sendControlAction(event.detail || {});
    });

    window.addEventListener('overhead:bridge-message', function (event) {
        const message = event.detail || {};
        if (message.type === 'control.command.rejected') {
            console.warn('O servidor recusou o comando do overhead.', {
                slice: message.slice,
                reason: message.reason || 'motivo não informado'
            });
        }
    });

    document.addEventListener('pointerdown', function (event) {
        if (!(event.target instanceof Element) || event.isPrimary === false) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const button = event.target.closest('.round-button');
        if (!button || button.disabled) return;
        const slot = button.closest('.overhead-slice');
        const slice = slot && slot.dataset.slice;
        if (!momentaryPressSlices.has(slice)) return;
        if (typeof window.batteryControlAllows === 'function' && !window.batteryControlAllows(button)) return;
        pressedPointers.set(event.pointerId, { slice: slice, button: button });
        sendMomentaryPress(slice, true);
    });

    function releasePointer(pointerId) {
        if (!pressedPointers.has(pointerId)) return;
        const momentary = pressedPointers.get(pointerId);
        pressedPointers.delete(pointerId);
        sendMomentaryPress(momentary.slice, false);
    }

    document.addEventListener('pointerup', function (event) { releasePointer(event.pointerId); });
    document.addEventListener('pointercancel', function (event) { releasePointer(event.pointerId); });
    document.addEventListener('lostpointercapture', function (event) { releasePointer(event.pointerId); });
    window.addEventListener('blur', function () {
        Array.from(pressedPointers.keys()).forEach(releasePointer);
    });

    window.addEventListener('overhead:bridge-status', function (event) {
        applyBridgeStatus(event.detail || {});
    });
    window.addEventListener('overhead:bridge-disconnected', function () {
        bridgeConnected = false;
        lockApuButtonUntilMasterReadback();
        Array.from(pressedPointers.keys()).forEach(releasePointer);
        ['006', '008', '010'].forEach(function (slice) {
            applyLightState(slice, { state: 'off' });
        });
    });
})(window, document);
