(function () {
    'use strict';

    const STATE_FILE = 'overheadstate.json';
    const STATE_STORAGE_KEY = 'overheadstate';
    const CONNECTION_STORAGE_KEY = 'overheadConnectionSettings';
    const CONTROL_SELECTOR = [
        '.butomkey',
        '.push-button',
        '.round-button',
        '.airbus-knob',
        '.fault-indicator',
        '.overhead-display'
    ].join(',');

    function controlKey(control) {
        if (control.id) return control.id;

        const slot = control.closest('.overhead-slice');
        const slice = slot && slot.dataset.slice;
        const name = control.dataset.controlName;

        return slice && name ? 'slice-' + slice + '-' + name : null;
    }

    function controls() {
        return Array.from(document.querySelectorAll(CONTROL_SELECTOR))
            .filter(function (control) { return Boolean(controlKey(control)); });
    }

    function numberInRange(value, minimum, maximum, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed)
            ? Math.max(minimum, Math.min(maximum, parsed))
            : fallback;
    }

    function validDirection(value) {
        return Number(value) === -1 ? -1 : 1;
    }

    function controlType(control) {
        if (control.matches('.butomkey')) return 'switch';
        if (control.matches('.push-button')) return 'push';
        if (control.matches('.round-button')) return 'round';
        if (control.matches('.airbus-knob')) return 'knob';
        if (control.matches('.fault-indicator')) return 'warning';
        if (control.matches('.overhead-display')) return 'display';
        return 'unknown';
    }

    function readControl(control) {
        const type = controlType(control);
        const result = { type: type };

        if (type === 'switch') {
            const positions = Number(control.dataset.positions) === 2 ? 2 : 3;
            const fallback = Number(control.dataset.state) || 0;
            let state = numberInRange(control.dataset.state, 0, 2, fallback);
            if (positions === 2) state = state === 0 ? 0 : 2;
            result.positions = positions;
            result.state = state;
            result.position = positions === 2 ? (state === 0 ? 1 : 2) : state + 1;
            result.direction = validDirection(control.dataset.direction);
        } else if (type === 'push') {
            if (control.classList.contains('push-button-status')) {
                result.state = ['off', 'on', 'avail'].includes(control.dataset.state)
                    ? control.dataset.state
                    : 'off';
            } else {
                result.state = control.dataset.state === 'on' ? 'on' : 'off';
            }
            result.fault = control.dataset.fault === 'true';
        } else if (type === 'round') {
            result.state = 'off';
            result.fault = control.dataset.fault === 'true';
        } else if (type === 'knob') {
            result.position = numberInRange(control.dataset.position, 1, 3, 1);
            result.direction = validDirection(control.dataset.direction);
        } else if (type === 'warning') {
            result.state = control.dataset.state === 'on' ? 'on' : 'off';
            result.statusState = control.dataset.statusState === 'on' ? 'on' : 'off';
            result.statusText = control.dataset.statusText || '';
        } else if (type === 'display') {
            const value = control.querySelector('.display-value');
            const unit = control.querySelector('.display-unit');
            result.value = value ? value.textContent : '';
            result.unit = unit ? unit.textContent : '';
        }

        if (type !== 'warning') result.fault = control.dataset.fault === 'true';
        return result;
    }

    function connectionSettings(value) {
        const settings = value && typeof value === 'object' ? value : {};
        return {
            ip: typeof settings.ip === 'string' ? settings.ip : '',
            port: typeof settings.port === 'string' ? settings.port : String(settings.port || '')
        };
    }

    function defaultState(connection) {
        const controlStates = {};
        controls().forEach(function (control) {
            controlStates[controlKey(control)] = readControl(control);
        });

        return {
            version: 1,
            savedAt: null,
            connection: connectionSettings(connection),
            controls: controlStates
        };
    }

    function mergeState(savedState) {
        const current = defaultState();
        if (!savedState || typeof savedState !== 'object') return current;

        current.savedAt = typeof savedState.savedAt === 'string' ? savedState.savedAt : null;
        current.connection = connectionSettings(savedState.connection);

        const savedControls = savedState.controls && typeof savedState.controls === 'object'
            ? savedState.controls
            : {};
        Object.keys(current.controls).forEach(function (id) {
            const saved = savedControls[id];
            if (saved && saved.type === current.controls[id].type) {
                current.controls[id] = Object.assign({}, current.controls[id], saved);
            }
        });

        return current;
    }

    function applyControlState(control, value) {
        if (!value) return;
        if (control.dataset.batteryId || control.hasAttribute('data-battery-display')) return;
        const type = controlType(control);

        if (type === 'switch') {
            const positions = Number(control.dataset.positions) === 2 ? 2 : 3;
            let state = numberInRange(value.state, 0, 2, 0);
            if (positions === 2) state = state === 0 ? 0 : 2;
            control.dataset.state = String(state);
            control.dataset.direction = String(validDirection(value.direction));
            const sprite = control.querySelector('img');
            if (sprite) sprite.style.left = String(-state * 100) + '%';
        } else if (type === 'push') {
            if (control.classList.contains('push-button-status') &&
                typeof window.setPushButtonStatus === 'function') {
                window.setPushButtonStatus(control, value.state || 'off');
            } else {
                control.dataset.state = value.state === 'on' ? 'on' : 'off';
            }

            if (typeof window.setPushButtonFault === 'function') {
                window.setPushButtonFault(control, value.fault === true);
            } else {
                control.dataset.fault = value.fault === true ? 'true' : 'false';
            }
        } else if (type === 'round') {
            control.dataset.fault = value.fault === true ? 'true' : 'false';
        } else if (type === 'knob') {
            control.dataset.position = String(numberInRange(value.position, 1, 3, 1));
            control.dataset.direction = String(validDirection(value.direction));
        } else if (type === 'warning') {
            window.setFaultLight(control, value.state === 'on');
            if (value.statusState !== undefined && typeof window.setOhFaultStatus === 'function') {
                window.setOhFaultStatus(control, value.statusState === 'on'
                    ? (value.statusText || 'ON')
                    : '');
            }
        } else if (type === 'display') {
            window.setOhDisp(control, value.value === undefined ? '' : value.value,
                value.unit === undefined ? '' : value.unit);
        }

        if (type !== 'push' && type !== 'round') {
            if (control.dataset.fault !== undefined) {
                control.dataset.fault = value.fault === true ? 'true' : 'false';
            }
        }
    }

    function applyState(state) {
        const ipInput = document.getElementById('serverIp');
        const portInput = document.getElementById('serverPort');
        const connection = connectionSettings(state.connection);

        if (ipInput) ipInput.value = connection.ip;
        if (portInput) portInput.value = connection.port;

        try {
            localStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify(connection));
        } catch (error) {}

        controls().forEach(function (control) {
            applyControlState(control, state.controls[controlKey(control)]);
        });
    }

    function readBrowserState() {
        try {
            const raw = localStorage.getItem(STATE_STORAGE_KEY);
            if (raw) return JSON.parse(raw);

            const oldConnection = localStorage.getItem(CONNECTION_STORAGE_KEY);
            return oldConnection
                ? { version: 1, connection: JSON.parse(oldConnection), controls: {} }
                : null;
        } catch (error) {
            return null;
        }
    }

    function isCordovaBrowser() {
        return Boolean(window.cordova && window.cordova.platformId === 'browser');
    }

    function cordovaFilesAvailable() {
        return Boolean(window.cordova && !isCordovaBrowser() && window.cordova.file &&
            window.cordova.file.dataDirectory && window.resolveLocalFileSystemURL);
    }

    function readCordovaState() {
        return new Promise(function (resolve, reject) {
            window.resolveLocalFileSystemURL(window.cordova.file.dataDirectory, function (directory) {
                directory.getFile(STATE_FILE, { create: false }, function (entry) {
                    entry.file(function (file) {
                        const reader = new FileReader();
                        reader.onloadend = function () {
                            try {
                                resolve(JSON.parse(reader.result));
                            } catch (error) {
                                reject(error);
                            }
                        };
                        reader.onerror = function () { reject(reader.error || new Error('Falha ao ler overheadstate.json.')); };
                        reader.readAsText(file);
                    }, reject);
                }, reject);
            }, reject);
        });
    }

    function writeCordovaState(serializedState) {
        return new Promise(function (resolve, reject) {
            window.resolveLocalFileSystemURL(window.cordova.file.dataDirectory, function (directory) {
                directory.getFile(STATE_FILE, { create: true }, function (entry) {
                    entry.createWriter(function (writer) {
                        writer.onerror = function () {
                            reject(writer.error || new Error('Falha ao gravar overheadstate.json.'));
                        };
                        writer.onwriteend = function () {
                            writer.onwriteend = resolve;
                            writer.write(new Blob([serializedState], { type: 'application/json' }));
                        };
                        writer.truncate(0);
                    }, reject);
                }, reject);
            }, reject);
        });
    }

    function readBundledInitialState() {
        if (typeof window.fetch !== 'function') return Promise.resolve(defaultState());
        return window.fetch('overheadstate.json', { cache: 'no-store' })
            .then(function (response) {
                if (!response.ok) throw new Error('JSON inicial indisponível.');
                return response.json();
            })
            .catch(function () { return defaultState(); });
    }

    async function restoreOverheadState() {
        let saved = null;
        let fileExists = false;

        if (cordovaFilesAvailable()) {
            try {
                saved = await readCordovaState();
                fileExists = true;
            } catch (error) {
                if (!error || error.code !== 1) {
                    console.warn('Não foi possível ler o overheadstate.json do Cordova.', error);
                }
            }
        }

        if (!saved) saved = readBrowserState();
        if (!saved) saved = await readBundledInitialState();

        const state = mergeState(saved);
        applyState(state);
        window.dispatchEvent(new CustomEvent('overhead:state-restored', { detail: state }));

        if (cordovaFilesAvailable() && !fileExists) {
            try {
                await writeCordovaState(JSON.stringify(state, null, 2));
            } catch (error) {
                console.error('Não foi possível criar o overheadstate.json inicial.', error);
            }
        }
    }

    async function saveOverheadState(connection) {
        const state = defaultState(connection);
        state.savedAt = new Date().toISOString();
        const serializedState = JSON.stringify(state, null, 2);

        try {
            localStorage.setItem(STATE_STORAGE_KEY, serializedState);
            localStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify(state.connection));
        } catch (error) {}

        if (window.cordova && !isCordovaBrowser()) {
            if (!cordovaFilesAvailable()) {
                throw new Error('O armazenamento de arquivos do Cordova ainda não está disponível.');
            }
            await writeCordovaState(serializedState);
        }

        return state;
    }

    window.saveOverheadState = saveOverheadState;
    window.restoreOverheadState = restoreOverheadState;

    function startRestore() {
        restoreOverheadState().catch(function (error) {
            console.error('Não foi possível restaurar o overheadstate.json.', error);
        });
    }

    if (window.cordova && !isCordovaBrowser()) {
        document.addEventListener('deviceready', startRestore, { once: true });
    } else {
        startRestore();
    }
})();
