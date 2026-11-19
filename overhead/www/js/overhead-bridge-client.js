(function () {
    'use strict';

    const PROTOCOL_VERSION = 1;
    const HEARTBEAT_INTERVAL_MS = 5000;
    const HEARTBEAT_TIMEOUT_MS = 12000;
    const RETRY_INTERVAL_MS = 2000;

    let activeSocket = null;
    let retryTimer = null;
    let heartbeatTimer = null;
    let heartbeatWatchdogTimer = null;
    let handshakeTimer = null;
    let manualReconnectTimer = null;
    let activeGeneration = 0;
    let desiredSettings = null;
    let shouldReconnect = false;
    let accepted = false;
    let helloSent = false;
    let licenseActivated = false;
    let retryAttempts = 0;
    let lastPongAt = 0;

    const connectionLostNotice = document.getElementById('connectionLostNotice');
    const connectionLostMessage = document.getElementById('connectionLostMessage');
    const reconnectConnectionButton = document.getElementById('reconnectConnectionButton');

    function setConnectionLostNotice(visible, message) {
        if (!connectionLostNotice) return;
        if (!licenseActivated) visible = false;
        connectionLostNotice.hidden = !visible;
        if (visible && connectionLostMessage && message) {
            connectionLostMessage.textContent = message;
        }
        if (!visible) {
            if (manualReconnectTimer) window.clearTimeout(manualReconnectTimer);
            manualReconnectTimer = null;
            if (reconnectConnectionButton) {
                reconnectConnectionButton.disabled = false;
                reconnectConnectionButton.textContent = 'Reconectar';
            }
        }
    }

    function setStatus(connected, message) {
        if (typeof window.setConnectionStatus === 'function') {
            window.setConnectionStatus(connected, message);
        }
    }

    function normalizeEndpoint(settings) {
        let host = String(settings && settings.ip || '').trim();
        const port = Number(String(settings && settings.port || '').trim());
        host = host.replace(/^wss?:\/\//i, '').replace(/^https?:\/\//i, '').split('/')[0];
        host = host.replace(/;/g, '.');

        if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
            throw new Error('Informe um IP válido do PC e a porta do servidor.');
        }

        if (host.includes(':') && !host.startsWith('[')) host = '[' + host + ']';
        return { host: host, port: port };
    }

    function clearTimers() {
        if (retryTimer) window.clearTimeout(retryTimer);
        if (heartbeatTimer) window.clearInterval(heartbeatTimer);
        if (heartbeatWatchdogTimer) window.clearInterval(heartbeatWatchdogTimer);
        if (handshakeTimer) window.clearTimeout(handshakeTimer);
        retryTimer = null;
        heartbeatTimer = null;
        heartbeatWatchdogTimer = null;
        handshakeTimer = null;
        lastPongAt = 0;
    }

    function closeCurrentSocket() {
        const socket = activeSocket;
        activeSocket = null;
        if (socket && socket.readyState < WebSocket.CLOSING) {
            try { socket.close(1000, 'Nova tentativa de conexão'); } catch (error) {}
        }
    }

    function scheduleRetry(generation) {
        if (!shouldReconnect || generation !== activeGeneration || retryTimer) return;
        retryTimer = window.setTimeout(function () {
            retryTimer = null;
            retryAttempts += 1;
            if (retryAttempts >= 3) {
                setConnectionLostNotice(true, 'A reconexão automática ainda não conseguiu restabelecer a conexão. Toque em Reconectar para forçar uma nova tentativa; o Cordova continuará tentando sozinho também.');
            }
            openSocket(generation);
        }, RETRY_INTERVAL_MS);
    }

    function announceLicense(activated, message) {
        licenseActivated = activated === true;
        window.dispatchEvent(new CustomEvent('overhead:license-status', {
            detail: { activated: licenseActivated, message: message || '' }
        }));
        if (!licenseActivated) {
            accepted = false;
            helloSent = false;
            if (heartbeatTimer) window.clearInterval(heartbeatTimer);
            heartbeatTimer = null;
            if (heartbeatWatchdogTimer) window.clearInterval(heartbeatWatchdogTimer);
            heartbeatWatchdogTimer = null;
            setConnectionLostNotice(false);
            window.dispatchEvent(new CustomEvent('overhead:bridge-disconnected'));
            setStatus(false, 'Skyforge Overhead não ativado. Ative pelo ícone do servidor no computador.');
            return;
        }
        setStatus(false, 'Ativação confirmada. Conectando ao servidor…');
        if (activeSocket && activeSocket.readyState === WebSocket.OPEN && !helloSent) {
            helloSent = true;
            activeSocket.send(JSON.stringify({
                type: 'client.hello', role: 'cordova', protocolVersion: PROTOCOL_VERSION, appVersion: '1.0.0'
            }));
        }
    }

    function onBridgeStatus(message) {
        const pluginConnected = Boolean(message.plugin && message.plugin.connected);
        if (message.license && message.license.activated !== true) {
            announceLicense(false, message.license.message);
            return;
        }
        window.dispatchEvent(new CustomEvent('overhead:bridge-status', { detail: message }));
        setStatus(true, pluginConnected
            ? 'Conectado ao servidor e ao plugin do X-Plane.'
            : 'Conectado ao servidor do PC; aguardando o plugin do X-Plane.');
    }

    function openSocket(generation) {
        if (!desiredSettings || generation !== activeGeneration || !shouldReconnect) return;

        let endpoint;
        try {
            endpoint = normalizeEndpoint(desiredSettings);
        } catch (error) {
            shouldReconnect = false;
            setStatus(false, error.message);
            return;
        }

        const socketUrl = 'ws://' + endpoint.host + ':' + endpoint.port + '/ws/cordova';
        setStatus(false, 'Conectando ao servidor do PC…');

        let socket;
        try {
            socket = new WebSocket(socketUrl);
        } catch (error) {
            setStatus(false, 'Não foi possível abrir a conexão com o servidor do PC.');
            setConnectionLostNotice(true, 'Não foi possível conectar. O Cordova continuará tentando automaticamente; você também pode tocar em Reconectar.');
            scheduleRetry(generation);
            return;
        }

        activeSocket = socket;
        accepted = false;

        socket.addEventListener('open', function () {
            if (generation !== activeGeneration) return;
            helloSent = true;
            socket.send(JSON.stringify({
                type: 'client.hello',
                role: 'cordova',
                protocolVersion: PROTOCOL_VERSION,
                appVersion: '1.0.0'
            }));
            handshakeTimer = window.setTimeout(function () {
                if (!accepted && generation === activeGeneration) {
                    setStatus(false, 'O servidor não confirmou a conexão.');
                    socket.close();
                }
            }, 5000);
        });

        socket.addEventListener('message', function (event) {
            if (generation !== activeGeneration) return;
            let message;
            try { message = JSON.parse(event.data); } catch (error) { return; }

            if (message.type === 'license.status') {
                announceLicense(message.activated === true, message.message);
                return;
            }

            if (message.type === 'license.required') {
                announceLicense(false, message.message);
                return;
            }

            if (message.type === 'connection.accepted') {
                accepted = true;
                helloSent = true;
                licenseActivated = true;
                retryAttempts = 0;
                lastPongAt = Date.now();
                if (handshakeTimer) window.clearTimeout(handshakeTimer);
                handshakeTimer = null;
                setConnectionLostNotice(false);
                setStatus(true, message.pluginConnected
                    ? 'Conectado ao servidor e ao plugin do X-Plane.'
                    : 'Conectado ao servidor do PC; aguardando o plugin do X-Plane.');
                if (heartbeatTimer) window.clearInterval(heartbeatTimer);
                heartbeatTimer = window.setInterval(function () {
                    if (generation !== activeGeneration || !accepted || socket.readyState !== WebSocket.OPEN) return;
                    try {
                        socket.send(JSON.stringify({ type: 'client.ping' }));
                    } catch (error) {
                        accepted = false;
                        setStatus(false, 'Falha ao verificar a conexão com o servidor.');
                        setConnectionLostNotice(true, 'A conexão com o servidor falhou. O Cordova tentará reconectar automaticamente.');
                        try { socket.close(4000, 'Falha ao enviar heartbeat'); } catch (closeError) {}
                    }
                }, HEARTBEAT_INTERVAL_MS);
                heartbeatWatchdogTimer = window.setInterval(function () {
                    if (generation !== activeGeneration || !accepted || socket.readyState !== WebSocket.OPEN) return;
                    if (Date.now() - lastPongAt <= HEARTBEAT_TIMEOUT_MS) return;
                    accepted = false;
                    setStatus(false, 'O servidor parou de responder; tentando reconectar…');
                    setConnectionLostNotice(true, 'O servidor parou de responder. O Cordova tentará reconectar automaticamente; se as tentativas falharem, toque em Reconectar.');
                    try { socket.close(4000, 'Tempo esgotado aguardando server.pong'); } catch (error) {}
                }, 1000);
                return;
            }

            if (message.type === 'server.pong') {
                if (accepted) lastPongAt = Date.now();
                return;
            }

            if (message.type === 'bridge.status' && accepted) onBridgeStatus(message);
            else if (accepted) {
                window.dispatchEvent(new CustomEvent('overhead:bridge-message', { detail: message }));
            }
            if (message.type === 'server.error') {
                setStatus(false, 'O servidor rejeitou o protocolo do app.');
            }
        });

        socket.addEventListener('error', function () {
            if (generation === activeGeneration && !accepted) {
                setStatus(false, 'Não foi possível alcançar o servidor do PC.');
            }
        });

        socket.addEventListener('close', function () {
            if (generation !== activeGeneration) return;
            clearTimers();
            activeSocket = null;
            accepted = false;
            helloSent = false;
            window.dispatchEvent(new CustomEvent('overhead:bridge-disconnected'));
            setStatus(false, shouldReconnect
                ? 'Conexão com o servidor perdida; tentando novamente…'
                : 'Desconectado do servidor do PC.');
            if (shouldReconnect) {
                setConnectionLostNotice(true, 'A conexão com o servidor foi perdida. O Cordova está tentando reconectar automaticamente; se não conseguir, toque em Reconectar.');
            } else {
                setConnectionLostNotice(false);
            }
            scheduleRetry(generation);
        });
    }

    function connect(settings) {
        desiredSettings = {
            ip: settings && settings.ip,
            port: settings && settings.port
        };
        shouldReconnect = true;
        retryAttempts = 0;
        activeGeneration += 1;
        const generation = activeGeneration;
        window.dispatchEvent(new CustomEvent('overhead:bridge-disconnected'));
        clearTimers();
        closeCurrentSocket();
        openSocket(generation);
    }

    function disconnect() {
        shouldReconnect = false;
        desiredSettings = null;
        activeGeneration += 1;
        clearTimers();
        setConnectionLostNotice(false);

        const socket = activeSocket;
        activeSocket = null;
        accepted = false;
        helloSent = false;
        window.dispatchEvent(new CustomEvent('overhead:bridge-disconnected'));
        setStatus(false, 'Desconectado do servidor do PC.');

        if (!socket || socket.readyState === WebSocket.CLOSED) return Promise.resolve();

        return new Promise(function (resolve) {
            let finished = false;
            const finish = function () {
                if (finished) return;
                finished = true;
                resolve();
            };

            socket.addEventListener('close', finish, { once: true });
            window.setTimeout(finish, 500);

            if (socket.readyState < WebSocket.CLOSING) {
                try { socket.close(1000, 'Desconexão solicitada pelo usuário'); }
                catch (error) { finish(); }
            } else {
                finish();
            }
        });
    }

    window.disconnectOverheadBridge = disconnect;
    window.isOverheadLicensed = function () { return licenseActivated; };

    window.addEventListener('overhead:license-status', function (event) {
        const notice = document.getElementById('activationNotice');
        if (!notice) return;
        const active = event.detail && event.detail.activated === true;
        notice.hidden = active;
        document.body.classList.toggle('license-blocked', !active);
    });

    window.addEventListener('overhead:connect-request', function (event) {
        connect(event.detail || {});
    });

    if (reconnectConnectionButton) {
        reconnectConnectionButton.addEventListener('click', function () {
            if (!desiredSettings || !desiredSettings.ip || !desiredSettings.port) {
                try {
                    const saved = JSON.parse(localStorage.getItem('overheadConnectionSettings') || '{}');
                    if (saved.ip && saved.port) desiredSettings = { ip: saved.ip, port: saved.port };
                } catch (error) {}
            }

            if (!desiredSettings || !desiredSettings.ip || !desiredSettings.port) {
                setConnectionLostNotice(false);
                const gearButton = document.getElementById('gear');
                if (gearButton) gearButton.click();
                return;
            }

            if (reconnectConnectionButton) {
                reconnectConnectionButton.disabled = true;
                reconnectConnectionButton.textContent = 'Reconectando…';
            }
            if (connectionLostMessage) {
                connectionLostMessage.textContent = 'Reconexão manual iniciada. O Cordova continuará tentando automaticamente se esta tentativa falhar.';
            }
            connect(desiredSettings);
            if (manualReconnectTimer) window.clearTimeout(manualReconnectTimer);
            manualReconnectTimer = window.setTimeout(function () {
                manualReconnectTimer = null;
                if (!accepted && reconnectConnectionButton) {
                    reconnectConnectionButton.disabled = false;
                    reconnectConnectionButton.textContent = 'Reconectar';
                }
            }, 2500);
        });
    }

    window.sendOverheadBridgeMessage = function (message) {
        if (!accepted || !activeSocket || activeSocket.readyState !== WebSocket.OPEN) return false;
        try {
            activeSocket.send(JSON.stringify(message));
            return true;
        } catch (error) {
            return false;
        }
    };

    window.addEventListener('online', function () {
        if (!shouldReconnect || !desiredSettings) return;
        const socketUnavailable = !activeSocket || activeSocket.readyState !== WebSocket.OPEN;
        const heartbeatExpired = accepted && lastPongAt && Date.now() - lastPongAt > HEARTBEAT_INTERVAL_MS * 2;
        if (socketUnavailable || !accepted || heartbeatExpired) connect(desiredSettings);
    });

    try {
        const saved = JSON.parse(localStorage.getItem('overheadConnectionSettings') || '{}');
        if (saved.ip && saved.port) window.setTimeout(function () { connect(saved); }, 250);
    } catch (error) {}
})();
