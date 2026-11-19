(function () {
    'use strict';

    const viewport = document.querySelector('.overhead-viewport');
    if (!viewport) return;

    function fitOverhead() {
        const width = window.innerWidth || document.documentElement.clientWidth;
        const height = window.innerHeight || document.documentElement.clientHeight;
        document.documentElement.style.setProperty('--viewport-width', String(width) + 'px');
        document.documentElement.style.setProperty('--viewport-height', String(height) + 'px');
    }

    window.addEventListener('resize', fitOverhead, { passive: true });
    window.addEventListener('orientationchange', fitOverhead, { passive: true });
    fitOverhead();
})();
