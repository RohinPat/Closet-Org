/**
 * Guided product tour — full-screen overlay, spotlights nav, jump links + close.
 */
(function () {
    const STORAGE_KEY = 'onboarding_carousel_v1';

    let index = 0;
    let steps = [];
    let targetEl = null;

    function status() {
        return localStorage.getItem(STORAGE_KEY) || 'pending';
    }

    function setStatus(value) {
        localStorage.setItem(STORAGE_KEY, value);
    }

    function shouldShow() {
        if (new URLSearchParams(window.location.search).has('onboarding')) return true;
        return status() === 'pending';
    }

    function escape(s) {
        return window.ClosetApp?.escapeHtml(s) ?? String(s);
    }

    function socialEnabled() {
        return window.ClosetApp?.currentUser?.social_enabled !== false;
    }

    function buildSteps() {
        const list = [
            {
                kind: 'center',
                kicker: 'Welcome',
                title: 'Quick tour of your closet app',
                body: 'We will point out where everything lives. You can jump ahead or close anytime.',
                primaryLabel: 'Show me around',
            },
            {
                kind: 'spot',
                tab: 'closet',
                kicker: 'Step 1',
                title: 'Your closet',
                body: 'Search, filter, and browse every piece you have added.',
                primaryLabel: 'Next',
            },
            {
                kind: 'spot',
                tab: 'upload',
                kicker: 'Step 2',
                title: 'Add items',
                body: 'Upload photos here. AI helps tag brand, color, and category.',
                primaryLabel: 'Next',
            },
            {
                kind: 'spot',
                tab: 'outfits',
                kicker: 'Step 3',
                title: 'Outfits & stylist',
                body: 'Generate looks from clean items or ask the AI stylist for ideas.',
                primaryLabel: 'Next',
            },
        ];
        if (socialEnabled()) {
            list.push({
                kind: 'spot',
                tab: 'feed',
                kicker: 'Step 4',
                title: 'Feed',
                body: 'See fits from people you follow and post when you are ready.',
                primaryLabel: 'Next',
            });
        }
        list.push({
            kind: 'spot',
            tab: 'profile',
            kicker: socialEnabled() ? 'Step 5' : 'Step 4',
            title: 'Profile & settings',
            body: 'Theme, laundry, wishlist, friends, and account preferences live here.',
            primaryLabel: 'Next',
        });
        list.push({
            kind: 'center',
            kicker: 'Done',
            title: 'You are all set',
            body: 'Start in your closet, or add your first piece whenever you are ready.',
            primaryLabel: 'Start using Closet',
        });
        return list;
    }

    function rootEl() {
        return document.getElementById('onboarding-carousel');
    }

    function ensureMounted() {
        const root = rootEl();
        if (!root) return null;
        if (root.parentElement !== document.body) {
            document.body.appendChild(root);
        }
        return root;
    }

    function isVisible(el) {
        if (!el || el.classList.contains('hidden')) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        return el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
    }

    function navTarget(tab) {
        const selectors = [
            `.app-sidebar .sidebar-nav-btn[data-tab="${tab}"]`,
            `.mobile-tab-bar .nav-btn[data-tab="${tab}"]`,
            `.header .nav-btn[data-tab="${tab}"]`,
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (isVisible(el)) return el;
        }
        return document.querySelector(`[data-tab="${tab}"]`);
    }

    function clearTarget() {
        if (targetEl) {
            targetEl.classList.remove('onboarding-tour-target');
            targetEl = null;
        }
    }

    function positionSpotlight(el) {
        const spot = document.getElementById('onboarding-tour-spotlight');
        const scrim = document.getElementById('onboarding-tour-scrim');
        if (!spot || !scrim) return;
        const pad = 10;
        const r = el.getBoundingClientRect();
        scrim.hidden = true;
        spot.hidden = false;
        spot.style.top = `${Math.max(8, r.top - pad)}px`;
        spot.style.left = `${Math.max(8, r.left - pad)}px`;
        spot.style.width = `${r.width + pad * 2}px`;
        spot.style.height = `${r.height + pad * 2}px`;
    }

    function positionCardNear(el) {
        const card = document.getElementById('onboarding-tour-card');
        if (!card) return;
        const pad = 14;
        const r = el.getBoundingClientRect();
        card.classList.add('is-docked');
        card.style.transform = 'none';
        const cardW = card.offsetWidth;
        const cardH = card.offsetHeight;
        let top = r.bottom + pad;
        let left = r.left + r.width / 2 - cardW / 2;
        if (top + cardH > window.innerHeight - pad) {
            top = r.top - cardH - pad;
        }
        if (left + cardW > window.innerWidth - pad) {
            left = window.innerWidth - cardW - pad;
        }
        if (left < pad) left = pad;
        if (top < pad) top = pad;
        card.style.top = `${top}px`;
        card.style.left = `${left}px`;
    }

    function positionCardCenter() {
        const card = document.getElementById('onboarding-tour-card');
        const spot = document.getElementById('onboarding-tour-spotlight');
        const scrim = document.getElementById('onboarding-tour-scrim');
        if (!card || !spot || !scrim) return;
        spot.hidden = true;
        scrim.hidden = false;
        card.classList.remove('is-docked');
        card.style.top = '50%';
        card.style.left = '50%';
        card.style.transform = 'translate(-50%, -50%)';
    }

    function renderGotoRow() {
        const row = document.getElementById('onboarding-tour-goto-row');
        if (!row) return;
        const spotSteps = steps.filter((s) => s.kind === 'spot');
        if (!spotSteps.length) {
            row.innerHTML = '';
            row.hidden = true;
            return;
        }
        row.hidden = false;
        row.innerHTML = spotSteps
            .map((s) => {
                const i = steps.indexOf(s);
                const label =
                    s.tab === 'closet'
                        ? 'Closet'
                        : s.tab === 'upload'
                          ? 'Add'
                          : s.tab === 'outfits'
                            ? 'Outfits'
                            : s.tab === 'feed'
                              ? 'Feed'
                              : 'Profile';
                const current = i === index ? ' is-current' : '';
                return `<button type="button" class="onboarding-tour-goto${current}" data-tour-goto="${i}">${escape(label)}</button>`;
            })
            .join('');
        row.querySelectorAll('[data-tour-goto]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const i = Number(btn.dataset.tourGoto);
                if (!Number.isNaN(i)) goToStep(i);
            });
        });
    }

    function updateChrome() {
        const step = steps[index];
        if (!step) return;
        const kicker = document.getElementById('onboarding-tour-kicker');
        const title = document.getElementById('onboarding-tour-title');
        const body = document.getElementById('onboarding-tour-body');
        const stepEl = document.getElementById('onboarding-tour-step');
        const nextBtn = document.getElementById('onboarding-carousel-next');
        if (kicker) kicker.textContent = step.kicker || '';
        if (title) title.textContent = step.title || '';
        if (body) body.textContent = step.body || '';
        if (stepEl) stepEl.textContent = `Step ${index + 1} of ${steps.length}`;
        if (nextBtn) nextBtn.textContent = step.primaryLabel || 'Next';
        renderGotoRow();
    }

    function applyStep() {
        const step = steps[index];
        if (!step) return;
        clearTarget();
        if (step.tab && step.kind === 'spot') {
            window.ClosetApp?.showTab?.(step.tab);
        }
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (step.kind === 'center') {
                    positionCardCenter();
                    updateChrome();
                    return;
                }
                const el = navTarget(step.tab);
                if (!el) {
                    positionCardCenter();
                    updateChrome();
                    return;
                }
                targetEl = el;
                el.classList.add('onboarding-tour-target');
                try {
                    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
                } catch {
                    el.scrollIntoView();
                }
                setTimeout(() => {
                    positionSpotlight(el);
                    positionCardNear(el);
                    updateChrome();
                }, 320);
            });
        });
    }

    function goToStep(i) {
        if (i < 0 || i >= steps.length) return;
        index = i;
        applyStep();
    }

    function open() {
        const root = ensureMounted();
        if (!root) return;
        root.removeAttribute('hidden');
        root.classList.remove('hidden');
        root.setAttribute('aria-hidden', 'false');
        document.body.classList.add('onboarding-tour-open');
        requestAnimationFrame(() => root.classList.add('is-active'));
    }

    function close() {
        const root = rootEl();
        clearTarget();
        if (root) {
            root.classList.remove('is-active');
            root.setAttribute('aria-hidden', 'true');
            root.setAttribute('hidden', '');
            root.classList.add('hidden');
        }
        document.body.classList.remove('onboarding-tour-open');
    }

    function skip() {
        if (!new URLSearchParams(window.location.search).has('onboarding')) {
            setStatus('skipped');
        }
        close();
    }

    function finish() {
        setStatus('done');
        close();
    }

    function next() {
        if (index >= steps.length - 1) {
            finish();
            return;
        }
        goToStep(index + 1);
    }

    function bind() {
        const root = rootEl();
        if (!root || root.dataset.bound) return;
        root.dataset.bound = '1';
        ensureMounted();
        document.getElementById('onboarding-carousel-skip')?.addEventListener('click', skip);
        document.getElementById('onboarding-carousel-close')?.addEventListener('click', skip);
        document.getElementById('onboarding-carousel-next')?.addEventListener('click', next);
        root.addEventListener('keydown', (ev) => {
            if (!root.classList.contains('is-active')) return;
            if (ev.key === 'Escape') skip();
        });
        window.addEventListener('resize', () => {
            if (!root.classList.contains('is-active')) return;
            const step = steps[index];
            if (!step) return;
            if (step.kind === 'center') {
                positionCardCenter();
            } else if (targetEl) {
                positionSpotlight(targetEl);
                positionCardNear(targetEl);
            }
        });
    }

    function maybeShow() {
        if (!shouldShow()) return;
        const root = ensureMounted();
        if (!root) return;
        steps = buildSteps();
        index = 0;
        bind();
        open();
        applyStep();
    }

    window.ClosetOnboarding = {
        maybeShow,
        finish,
        close,
        open,
        reset: () => localStorage.removeItem(STORAGE_KEY),
    };
})();
