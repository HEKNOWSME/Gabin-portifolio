/* Ndi Artwork gallery. No framework or runtime CDN required. */
(() => {
    'use strict';
    document.documentElement.classList.add('js');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const byId = id => document.getElementById(id);

    // A small, non-blocking notice: only the featured image matters at startup.
    const heroImage = byId('hero-image');
    const notice = byId('loading');
    let loadingFinished = false;
    let noticeDelay;
    let noticeLimit;
    const finishLoading = () => {
        loadingFinished = true;
        notice.hidden = true;
        clearTimeout(noticeDelay);
        clearTimeout(noticeLimit);
        heroImage.removeEventListener('load', finishLoading);
        heroImage.removeEventListener('error', finishLoading);
    };
    if (!heroImage.complete) {
        heroImage.addEventListener('load', finishLoading, { once: true });
        heroImage.addEventListener('error', finishLoading, { once: true });
        noticeDelay = setTimeout(() => { if (!loadingFinished) notice.hidden = false; }, 150);
        noticeLimit = setTimeout(finishLoading, 2200);
    }
    window.addEventListener('pageshow', event => { if (event.persisted) finishLoading(); });

    // Mobile navigation keeps its visual and accessible states in sync.
    const menuButton = byId('mobile-menu-btn');
    const navigation = byId('site-nav');
    const mobile = window.matchMedia('(max-width: 600px)');
    const setMenu = open => {
        navigation.classList.toggle('is-open', open);
        menuButton.setAttribute('aria-expanded', String(open));
        menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    };
    menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
    navigation.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
    document.addEventListener('click', event => {
        if (!event.target.closest('.site-header')) setMenu(false);
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
            setMenu(false);
            menuButton.focus();
        }
    });
    navigation.addEventListener('focusout', event => {
        if (!navigation.contains(event.relatedTarget) && event.relatedTarget !== menuButton) setMenu(false);
    });
    mobile.addEventListener('change', () => setMenu(false));

    const navLinks = [...navigation.querySelectorAll('a[href^="#"]')];
    const sections = navLinks.map(link => document.querySelector(link.getAttribute('href')));
    const progress = document.querySelector('.scroll-progress');
    let scrollPending = false;
    function updateScroll() {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.transform = 'scaleX(' + (maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0) + ')';
        let current = -1;
        sections.forEach((section, index) => { if (section.getBoundingClientRect().top <= 160) current = index; });
        navLinks.forEach((link, index) => {
            if (index === current) link.setAttribute('aria-current', 'location');
            else link.removeAttribute('aria-current');
        });
        scrollPending = false;
    }
    function queueScroll() {
        if (!scrollPending) {
            scrollPending = true;
            requestAnimationFrame(updateScroll);
        }
    }
    window.addEventListener('scroll', queueScroll, { passive: true });
    window.addEventListener('resize', queueScroll);
    window.addEventListener('load', queueScroll, { once: true });
    updateScroll();

    // Search and category filters share one synchronous render path.
    const cards = [...document.querySelectorAll('.art-card')];
    const filterButtons = [...document.querySelectorAll('[data-filter]')];
    const search = byId('gallery-search');
    const loadMore = byId('load-more');
    const categoryLabels = { portraits: 'Portraits', posters: 'Posters & design', experimental: 'Experimental' };
    const collection = cards.map(card => {
        const img = card.querySelector('img');
        return { card, src: img.getAttribute('src'), alt: img.alt, title: card.dataset.title, category: categoryLabels[card.dataset.category] };
    });
    let activeFilter = 'all';
    let limit = 6;
    let matches = collection;
    function renderGallery() {
        const query = search.value.trim().toLocaleLowerCase();
        matches = collection.filter(work =>
            (activeFilter === 'all' || work.card.dataset.category === activeFilter) &&
            (work.title + ' ' + work.alt + ' ' + work.category).toLocaleLowerCase().includes(query)
        );
        const visible = new Set(matches.slice(0, limit).map(work => work.card));
        cards.forEach(card => { card.hidden = !visible.has(card); });
        filterButtons.forEach(button => {
            const active = button.dataset.filter === activeFilter;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        loadMore.hidden = matches.length <= limit;
        byId('gallery-empty').hidden = matches.length !== 0;
        byId('gallery-status').textContent = matches.length
            ? 'Showing ' + Math.min(limit, matches.length) + ' of ' + matches.length + ' pieces' + (activeFilter === 'all' && !query ? ' in the collection' : '')
            : 'No matching Ndi Artwork';
        queueScroll();
    }
    filterButtons.forEach(button => button.addEventListener('click', () => {
        activeFilter = button.dataset.filter;
        limit = 6;
        renderGallery();
    }));
    search.addEventListener('input', () => { limit = 6; renderGallery(); });
    loadMore.addEventListener('click', () => {
        const firstNew = matches[limit];
        limit += 6;
        renderGallery();
        if (firstNew) {
            firstNew.card.querySelector('[data-Ndi Artwork]').focus({ preventScroll: true });
            firstNew.card.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'nearest' });
        }
    });
    byId('reset-gallery').addEventListener('click', () => {
        activeFilter = 'all';
        search.value = '';
        limit = 6;
        renderGallery();
        filterButtons[0].focus();
    });
    renderGallery();

    // Native dialog provides focus trapping and Escape support.
    const dialog = byId('lightbox');
    const stage = byId('lightbox-stage');
    const preview = byId('lightbox-img');
    const artLoading = byId('art-loading');
    const artError = byId('art-error');
    const zoomButton = byId('art-zoom');
    const previous = byId('art-prev');
    const next = byId('art-next');
    let viewing = [];
    let currentIndex = 0;
    let opener = null;
    let imageTimer;
    let imageVersion = 0;
    let pendingImage = null;
    function setZoom(zoomed) {
        stage.classList.toggle('zoomed', zoomed);
        zoomButton.setAttribute('aria-pressed', String(zoomed));
        zoomButton.innerHTML = zoomed ? 'Zoom out <span aria-hidden="true">−</span>' : 'Zoom in <span aria-hidden="true">+</span>';
        stage.scrollTop = 0;
        stage.scrollLeft = 0;
    }
    function renderNdi Artwork() {
        const work = viewing[currentIndex];
        const version = ++imageVersion;
        clearTimeout(imageTimer);
        if (pendingImage) { pendingImage.onload = null; pendingImage.onerror = null; }
        setZoom(false);
        preview.hidden = true;
        preview.alt = work.alt;
        artLoading.hidden = false;
        artError.hidden = true;
        zoomButton.disabled = true;
        byId('lightbox-title').textContent = work.title;
        byId('lightbox-category').textContent = work.category;
        byId('art-position').textContent = (currentIndex + 1) + ' / ' + viewing.length;
        byId('art-original').href = work.src;
        previous.disabled = next.disabled = viewing.length < 2;
        const source = new Image();
        pendingImage = source;
        const finish = success => {
            if (version !== imageVersion) return;
            clearTimeout(imageTimer);
            artLoading.hidden = true;
            artError.hidden = success;
            preview.hidden = !success;
            zoomButton.disabled = !success;
            if (success) preview.src = work.src;
        };
        source.onload = () => finish(true);
        source.onerror = () => finish(false);
        imageTimer = setTimeout(() => finish(false), 12000);
        source.src = work.src;
    }
    function openNdi Artwork(works, index, trigger) {
        viewing = works;
        currentIndex = index;
        opener = trigger;
        dialog.showModal();
        document.body.classList.add('modal-open');
        renderNdi Artwork();
    }
    function stepNdi Artwork(direction) {
        if (viewing.length < 2) return;
        currentIndex = (currentIndex + direction + viewing.length) % viewing.length;
        renderNdi Artwork();
    }
    cards.forEach(card => card.querySelector('[data-Ndi Artwork]').addEventListener('click', event => {
        event.preventDefault();
        const index = matches.findIndex(work => work.card === card);
        openNdi Artwork([...matches], index, event.currentTarget);
    }));
    document.querySelector('[data-hero-art]').addEventListener('click', event => {
        event.preventDefault();
        openNdi Artwork([{ src: heroImage.getAttribute('src'), alt: heroImage.alt, title: 'Portrait study', category: 'Featured Ndi Artwork' }], 0, event.currentTarget);
    });
    byId('lightbox-close').addEventListener('click', () => dialog.close());
    previous.addEventListener('click', () => stepNdi Artwork(-1));
    next.addEventListener('click', () => stepNdi Artwork(1));
    zoomButton.addEventListener('click', () => setZoom(!stage.classList.contains('zoomed')));
    preview.addEventListener('click', () => setZoom(!stage.classList.contains('zoomed')));
    dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            dialog.close();
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            stepNdi Artwork(event.key === 'ArrowLeft' ? -1 : 1);
        }
    });
    dialog.addEventListener('click', event => {
        const bounds = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
    });
    dialog.addEventListener('close', () => {
        imageVersion++;
        clearTimeout(imageTimer);
        if (pendingImage) { pendingImage.onload = null; pendingImage.onerror = null; }
        document.body.classList.remove('modal-open');
        setZoom(false);
        if (opener?.isConnected) opener.focus({ preventScroll: true });
    });
    let touchStart = null;
    stage.addEventListener('touchstart', event => {
        touchStart = event.touches.length === 1 && !stage.classList.contains('zoomed')
            ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    }, { passive: true });
    stage.addEventListener('touchend', event => {
        if (!touchStart || !event.changedTouches.length) return;
        const dx = event.changedTouches[0].clientX - touchStart.x;
        const dy = event.changedTouches[0].clientY - touchStart.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) stepNdi Artwork(dx < 0 ? 1 : -1);
        touchStart = null;
    }, { passive: true });
    stage.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });

    // The static site prepares an email; it never claims a message was sent.
    const form = byId('contact-form');
    document.querySelectorAll('[data-service]').forEach(link => link.addEventListener('click', () => {
        byId('service').value = link.dataset.service;
    }));
    form.addEventListener('submit', event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const data = new FormData(form);
        const subject = 'Ndi Artwork enquiry: ' + data.get('service');
        const body = 'Hello Ndi Artwork,\r\n\r\n' + data.get('message').trim() +
            '\r\n\r\nName: ' + data.get('name').trim() + '\r\nEmail: ' + data.get('email').trim();
        const mailto = 'mailto:info@ndiNdi Artwork.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
        window.location.href = mailto;
        byId('form-status').textContent = 'Your email draft is ready to open. Send it from your email app. If it did not open, use the email address beside this form.';
    });
    byId('year').textContent = new Date().getFullYear();
})();
