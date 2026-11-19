(function (window, document) {
    'use strict';

    const viewport = document.querySelector('.overhead-viewport');
    const stage = document.getElementById('overheadStage');
    const canvas = stage && stage.querySelector('.overhead-canvas');
    if (!viewport || !stage || !canvas) return;

    const minimumZoom = 1;
    const maximumZoom = 3;
    const panStartThreshold = 10;
    let zoom = minimumZoom;
    let gesture = null;
    let panGesture = null;
    let suppressClickTimer = 0;
    let suppressClicks = false;

    function pointBetween(touches) {
        return {
            x: ((touches[0].clientX + touches[1].clientX) / 2) - viewport.getBoundingClientRect().left,
            y: ((touches[0].clientY + touches[1].clientY) / 2) - viewport.getBoundingClientRect().top
        };
    }

    function distanceBetween(touches) {
        return Math.hypot(
            touches[0].clientX - touches[1].clientX,
            touches[0].clientY - touches[1].clientY
        );
    }

    function baseSize() {
        const rect = viewport.getBoundingClientRect();
        return {
            width: rect.width || window.innerWidth,
            height: rect.height || window.innerHeight
        };
    }

    function resizeStage() {
        const base = baseSize();
        viewport.style.overflow = zoom > minimumZoom ? 'auto' : 'hidden';
        stage.style.width = (base.width * zoom) + 'px';
        stage.style.height = (base.height * zoom) + 'px';
        canvas.style.width = base.width + 'px';
        canvas.style.height = base.height + 'px';
        canvas.style.transformOrigin = 'top left';
        canvas.style.transform = zoom === minimumZoom ? '' : 'scale(' + zoom + ')';
    }

    function armClickSuppression() {
        suppressClicks = true;
        window.clearTimeout(suppressClickTimer);
        suppressClickTimer = window.setTimeout(function () {
            suppressClicks = false;
        }, 250);
    }

    viewport.addEventListener('touchstart', function (event) {
        if (event.touches.length === 2) {
            event.preventDefault();
            panGesture = null;
            armClickSuppression();
            gesture = {
                distance: Math.max(1, distanceBetween(event.touches)),
                midpoint: pointBetween(event.touches)
            };
            return;
        }

        if (event.touches.length !== 1 || zoom <= minimumZoom) return;
        const target = event.target instanceof Element ? event.target : null;
        if (target && target.closest('.round-button, input, select, textarea, a, #gear')) return;

        panGesture = {
            x: event.touches[0].clientX,
            y: event.touches[0].clientY,
            scrollLeft: viewport.scrollLeft,
            scrollTop: viewport.scrollTop,
            moved: false
        };
    }, { passive: false });

    viewport.addEventListener('touchmove', function (event) {
        if (event.touches.length === 1 && panGesture) {
            const touch = event.touches[0];
            const deltaX = touch.clientX - panGesture.x;
            const deltaY = touch.clientY - panGesture.y;

            if (!panGesture.moved && Math.hypot(deltaX, deltaY) < panStartThreshold) return;
            panGesture.moved = true;
            event.preventDefault();
            armClickSuppression();
            viewport.scrollLeft = panGesture.scrollLeft - deltaX;
            viewport.scrollTop = panGesture.scrollTop - deltaY;
            return;
        }

        if (event.touches.length !== 2 || !gesture) return;
        event.preventDefault();

        const nextDistance = Math.max(1, distanceBetween(event.touches));
        const nextMidpoint = pointBetween(event.touches);
        const nextZoom = Math.max(minimumZoom, Math.min(maximumZoom,
            zoom * (nextDistance / gesture.distance)));
        const contentX = (viewport.scrollLeft + gesture.midpoint.x) / zoom;
        const contentY = (viewport.scrollTop + gesture.midpoint.y) / zoom;

        zoom = nextZoom;
        resizeStage();
        if (zoom === minimumZoom) {
            viewport.scrollLeft = 0;
            viewport.scrollTop = 0;
        } else {
            viewport.scrollLeft = contentX * zoom - nextMidpoint.x;
            viewport.scrollTop = contentY * zoom - nextMidpoint.y;
        }

        gesture = { distance: nextDistance, midpoint: nextMidpoint };
    }, { passive: false });

    function finishGesture(event) {
        if (!event.touches || event.touches.length < 2) {
            gesture = null;
        }
        if (!event.touches || event.touches.length === 0) panGesture = null;
        if (suppressClicks) armClickSuppression();
    }

    viewport.addEventListener('touchend', finishGesture, { passive: true });
    viewport.addEventListener('touchcancel', finishGesture, { passive: true });

    document.addEventListener('click', function (event) {
        if (!suppressClicks) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressClicks = false;
        window.clearTimeout(suppressClickTimer);
    }, true);

    window.addEventListener('resize', resizeStage, { passive: true });
    window.addEventListener('orientationchange', resizeStage, { passive: true });
    resizeStage();
})(window, document);
