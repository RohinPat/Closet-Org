/**
 * Web app features aligned with mobile (feed, wishlist, trips, planning, etc.)
 */
(function () {
    const WEATHER_KEY = 'closet_web_weather_sync';

    function app() {
        return window.ClosetApp;
    }

    function esc(s) {
        const a = app();
        return a ? a.escapeHtml(s) : String(s ?? '');
    }

    function img(item) {
        const a = app();
        return a ? a.closetItemImageUrl(item) : '';
    }

    async function api(path, options) {
        const a = app();
        if (!a) throw new Error('App is not ready yet');
        return a.apiFetch(path, options);
    }

    function socialEnabled() {
        const u = app()?.currentUser;
        return Boolean(u && u.social_enabled !== false);
    }

    function emptyState(variant, title, message, ctaTab, ctaLabel) {
        return ClosetWebUtils.emptyStateMarkup({ variant, title, message, ctaTab, ctaLabel });
    }

    function bindEmptyCtas(root) {
        ClosetWebUtils.bindEmptyStateCtas(root, (tab) => app().showTab(tab));
    }

    function toastError(err) {
        const msg = err instanceof Error ? err.message : String(err ?? 'Something went wrong');
        app().showToast(msg, 'error');
    }

    async function uploadWishlistPhotos(files, body) {
        const list = Array.from(files || []).slice(0, 4);
        if (!list.length) throw new Error('Select at least one photo');
        const form = new FormData();
        list.forEach((f) => form.append('files', f));
        const uploaded = await api('/upload-clothing', { method: 'POST', body: form });
        await api(`/item/${uploaded.item_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'wishlist',
                wishlist_name: body.name,
                wishlist_intent: body.intent ?? null,
                wishlist_url: body.url ?? null,
                purchase_price: body.price ?? null,
                notes: body.notes?.trim() || null,
                category: body.category || 'Other',
                subcategory: body.subcategory || 'Wishlist',
            }),
        });
        return uploaded;
    }

    async function createWishlistItem(body) {
        const payload = {
            name: body.name,
            category: body.category || 'Other',
            subcategory: body.subcategory || 'Wishlist',
            intent: body.intent || 'want',
            url: body.url ?? null,
        };
        if (body.price != null && body.price !== '') payload.price = Number(body.price);
        const res = await api('/wishlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (body.notes?.trim()) {
            await api(`/wishlist/${res.item_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes: body.notes.trim() }),
            });
        }
        return res;
    }

    function applyWishlistPrefill(prefill) {
        if (!prefill) return;
        document.getElementById('wishlist-add-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        const setVal = (id, value) => {
            const el = document.getElementById(id);
            if (el && value != null && value !== '') el.value = value;
        };
        setVal('wishlist-name-input', prefill.name);
        setVal('wishlist-notes-input', prefill.notes);
        setVal('wishlist-url-input', prefill.url);
        setVal('wishlist-price-input', prefill.price);
        if (prefill.category) setVal('wishlist-category-input', prefill.category);
        if (prefill.intent) setVal('wishlist-intent-input', prefill.intent);
        if (prefill.openAdd) document.getElementById('wishlist-name-input')?.focus();
    }

    async function enrichFeedError(message) {
        if (!/not\s*found/i.test(message)) return message;
        const origin = window.location.origin;
        try {
            const r = await fetch(`${origin}/healthz`, {
                method: 'GET',
                headers: { Accept: 'application/json' },
            });
            if (r.ok) {
                return (
                    `${message}\n\nDiagnostic: /healthz succeeded — this host is your Closet-Org server, but GET /api/feed returned 404. Fix a double /api in your API URL, or restart uvicorn from the current backend (old processes may lack /api/feed).`
                );
            }
            return `${message}\n\nDiagnostic: /healthz returned HTTP ${r.status} — ${origin} may not be this API (wrong host/port).`;
        } catch {
            return `${message}\n\nDiagnostic: no response from ${origin}/healthz — API not running, wrong IP, or firewall.`;
        }
    }

    function initWishlistPhotoPreview(inputId, previewId) {
        const input = document.getElementById(inputId);
        const preview = document.getElementById(previewId);
        if (!input || !preview || input.dataset.bound) return;
        input.dataset.bound = '1';
        input.addEventListener('change', () => {
            const files = [...(input.files || [])].slice(0, 4);
            if (!files.length) {
                preview.classList.add('hidden');
                preview.innerHTML = '';
                return;
            }
            preview.innerHTML = files
                .map((f) => `<img src="${URL.createObjectURL(f)}" alt="" class="wishlist-photo-thumb">`)
                .join('');
            preview.classList.remove('hidden');
        });
    }

    function openLocationFormModal() {
        const modal = document.getElementById('location-form-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.classList.add('active');
        document.getElementById('location-form-name')?.focus();
    }

    function closeLocationFormModal() {
        const modal = document.getElementById('location-form-modal');
        const form = document.getElementById('location-form');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('active');
        }
        form?.reset();
    }

    function initLocationFormModal() {
        const form = document.getElementById('location-form');
        if (!form || form.dataset.bound) return;
        form.dataset.bound = '1';
        document.querySelectorAll('.location-form-close').forEach((el) => {
            el.addEventListener('click', closeLocationFormModal);
        });
        document.getElementById('location-form-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'location-form-modal') closeLocationFormModal();
        });
        form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const name = document.getElementById('location-form-name')?.value.trim();
            const kind = document.getElementById('location-form-kind')?.value || 'other';
            if (!name) return;
            try {
                await api('/closet/locations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, kind }),
                });
                app().showToast('Location added');
                closeLocationFormModal();
                loadSettings();
            } catch (e) {
                toastError(e);
            }
        });
    }

    let confirmModalResolver = null;

    function showConfirmModal({ title, message, confirmLabel = 'Confirm', danger = true }) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirm-modal');
            const titleEl = document.getElementById('confirm-modal-title');
            const msgEl = document.getElementById('confirm-modal-message');
            const okBtn = document.getElementById('confirm-modal-ok');
            if (!modal || !titleEl || !msgEl || !okBtn) {
                resolve(window.confirm(message || title || 'Are you sure?'));
                return;
            }
            confirmModalResolver = resolve;
            titleEl.textContent = title || 'Confirm';
            msgEl.textContent = message || '';
            okBtn.textContent = confirmLabel;
            okBtn.classList.toggle('btn-danger', danger);
            okBtn.classList.toggle('btn-primary', !danger);
            modal.classList.remove('hidden');
            modal.classList.add('active');
        });
    }

    function closeConfirmModal(result) {
        const modal = document.getElementById('confirm-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('active');
        }
        if (confirmModalResolver) {
            confirmModalResolver(result);
            confirmModalResolver = null;
        }
    }

    function initConfirmModal() {
        document.getElementById('confirm-modal-cancel')?.addEventListener('click', () => closeConfirmModal(false));
        document.getElementById('confirm-modal-ok')?.addEventListener('click', () => closeConfirmModal(true));
        document.getElementById('confirm-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'confirm-modal') closeConfirmModal(false);
        });
    }

    function weatherHeadline(w) {
        if (typeof window.formatWeatherHeadline === 'function') return window.formatWeatherHeadline(w);
        if (!w) return 'Weather not synced';
        const temp = w.temperature_c != null ? `${Math.round(w.temperature_c)}°C` : '—';
        const place = w.location_name ? `${w.location_name} · ` : '';
        return `${place}${temp} · ${w.condition || w.summary || ''}`.trim();
    }

    function weatherDetail(w) {
        if (typeof window.formatWeatherDetail === 'function') return window.formatWeatherDetail(w);
        if (!w) return 'Search a destination to sync forecast-aware pack ideas.';
        const pieces = [
            w.min_temp_c != null && w.max_temp_c != null
                ? `${Math.round(w.min_temp_c)}–${Math.round(w.max_temp_c)}°C`
                : null,
            `${w.precipitation_probability ?? 0}% rain`,
            `${Math.round(w.wind_speed_kmh ?? 0)} km/h wind`,
            w.derived_season,
        ].filter(Boolean);
        return pieces.join(' · ');
    }

    function forecastSummary(days) {
        if (!days?.length) return 'No forecast loaded yet.';
        const first = days[0];
        const last = days[days.length - 1];
        const range = first.date === last.date ? first.date : `${first.date} to ${last.date}`;
        const avgRain =
            days.reduce((sum, day) => sum + (day.precipitation_probability ?? 0), 0) / days.length;
        const minT = first.min_temp_c != null ? Math.round(first.min_temp_c) : '—';
        const maxT = first.max_temp_c != null ? Math.round(first.max_temp_c) : '—';
        return `${range} · ${minT}–${maxT}°C · ${Math.round(avgRain)}% avg rain`;
    }

    const PACK_VIEW_MODES = [
        { key: 'all', label: 'All' },
        { key: 'packed', label: 'Packed' },
        { key: 'unpacked', label: 'Not packed' },
    ];

    const TRIP_ACTIVITIES = [
        { key: 'casual', label: 'Casual days', occasion: 'casual', vibe: 'clean_prep' },
        { key: 'work', label: 'Work', occasion: 'work', vibe: 'clean_prep' },
        { key: 'dinner', label: 'Dinner', occasion: 'dinner', vibe: 'clean_prep' },
        { key: 'active', label: 'Active', occasion: 'active' },
        { key: 'night', label: 'Night out', occasion: 'night out', vibe: 'streetwear' },
        { key: 'cozy', label: 'Cozy', occasion: 'cozy', vibe: 'cozy' },
    ];

    const PLAN_STATUS_OPTIONS = [
        { label: 'Draft', value: 'draft' },
        { label: 'Confirmed', value: 'confirmed' },
        { label: 'Worn', value: 'worn' },
        { label: 'Skipped', value: 'skipped' },
    ];

    const PREP_ITEMS = [
        { key: 'prep_clean', label: 'Clean' },
        { key: 'prep_packed', label: 'Packed' },
        { key: 'prep_steamed', label: 'Steamed' },
        { key: 'prep_accessories', label: 'Accessories' },
    ];

    const packState = {
        activeTripId: null,
        viewMode: 'all',
        selectedIds: new Set(),
        suggestions: [],
        selectedSuggestion: null,
        packPlan: null,
        tripLocation: null,
        tripWeather: null,
        forecastDays: [],
        plannedActivities: new Set(['casual']),
        destination: '',
        tripStart: '',
        tripEnd: '',
        desiredOutfits: '',
    };

    let tripFormEditingId = null;
    let tripFormActivityKeys = new Set(['casual']);
    let tripsLogExpandedKey = null;

    function parseTripDate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim())) return null;
        const date = new Date(`${String(value).trim()}T00:00:00`);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function getTripDayCount(start, end) {
        const startDate = parseTripDate(start);
        const endDate = parseTripDate(end);
        if (!startDate || !endDate || endDate < startDate) return null;
        const dayMs = 24 * 60 * 60 * 1000;
        return Math.floor((endDate.getTime() - startDate.getTime()) / dayMs) + 1;
    }

    function defaultOutfitTarget(days) {
        if (!days) return 3;
        if (days <= 3) return days;
        return Math.min(10, Math.max(1, Math.ceil(days * 0.75)));
    }

    function outfitSignature(outfit) {
        return (outfit.items || [])
            .map((item) => item.id)
            .sort((a, b) => a - b)
            .join(',');
    }

    function selectCoveragePlan(candidates, targetOutfits) {
        const unique = new Map();
        for (const candidate of candidates) {
            const signature = outfitSignature(candidate.outfit);
            if (!signature) continue;
            const existing = unique.get(signature);
            if (!existing || candidate.outfit.score > existing.outfit.score) {
                unique.set(signature, candidate);
            }
        }
        const pool = [...unique.values()];
        const selected = [];
        const usedItemIds = new Set();
        while (pool.length > 0 && selected.length < targetOutfits) {
            let bestIndex = 0;
            let bestScore = Number.NEGATIVE_INFINITY;
            for (let i = 0; i < pool.length; i += 1) {
                const itemIds = pool[i].outfit.items.map((item) => item.id);
                const shared = itemIds.filter((id) => usedItemIds.has(id)).length;
                const newItems = itemIds.length - shared;
                const score =
                    pool[i].outfit.score + shared * 0.6 - Math.max(0, newItems - 1) * 0.12;
                if (score > bestScore) {
                    bestScore = score;
                    bestIndex = i;
                }
            }
            const [next] = pool.splice(bestIndex, 1);
            selected.push(next);
            next.outfit.items.forEach((item) => usedItemIds.add(item.id));
        }
        if (selected.length === 0) return null;
        const totalSlots = selected.reduce((sum, entry) => sum + entry.outfit.items.length, 0);
        const uniqueItemIds = [...usedItemIds];
        return {
            outfits: selected,
            uniqueItemIds,
            totalSlots,
            overlapCount: Math.max(0, totalSlots - uniqueItemIds.length),
            targetOutfits,
        };
    }

    function selectedTripActivities() {
        const chosen = TRIP_ACTIVITIES.filter((a) => packState.plannedActivities.has(a.key));
        return chosen.length ? chosen : [TRIP_ACTIVITIES[0]];
    }

    function coverageTarget() {
        const parsed = Number.parseInt(packState.desiredOutfits, 10);
        if (Number.isFinite(parsed) && parsed > 0) return Math.min(14, parsed);
        return defaultOutfitTarget(getTripDayCount(packState.tripStart, packState.tripEnd));
    }

    function syncPackStateFromTrip(trip, { resetPlan = true } = {}) {
        if (!trip) return;
        packState.destination = trip.destination || '';
        packState.tripStart = trip.start_date || '';
        packState.tripEnd = trip.end_date || '';
        if (trip.activities?.length) {
            packState.plannedActivities = new Set();
            for (const label of trip.activities) {
                const match = TRIP_ACTIVITIES.find((a) => a.label === label);
                if (match) packState.plannedActivities.add(match.key);
            }
            if (!packState.plannedActivities.size) packState.plannedActivities.add('casual');
        }
        if (resetPlan) {
            packState.packPlan = null;
            packState.suggestions = [];
            packState.selectedSuggestion = null;
        }
    }

    async function fetchOutfitRecommendations(opts = {}) {
        const params = new URLSearchParams();
        if (opts.occasion) params.append('occasion', opts.occasion);
        if (opts.vibe) params.append('vibe', opts.vibe);
        if (opts.season) params.append('season', opts.season);
        if (opts.seed != null) params.append('seed', String(opts.seed));
        if (opts.lat != null) params.append('lat', String(opts.lat));
        if (opts.lon != null) params.append('lon', String(opts.lon));
        if (opts.weatherDate) params.append('date', opts.weatherDate);
        if (opts.locationName) params.append('location_name', opts.locationName);
        if (opts.excludeItemIds?.length) params.append('exclude_item_ids', opts.excludeItemIds.join(','));
        return api(`/outfits/recommend?${params}`);
    }

    function renderActivityChips(container, selectedSet, onToggle) {
        if (!container) return;
        container.innerHTML = TRIP_ACTIVITIES.map((activity) => {
            const active = selectedSet.has(activity.key) ? ' active' : '';
            return `<button type="button" class="chip-btn${active}" data-activity-key="${activity.key}">${esc(activity.label)}</button>`;
        }).join('');
        container.querySelectorAll('[data-activity-key]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.activityKey;
                const next = new Set(selectedSet);
                if (next.has(key) && next.size > 1) next.delete(key);
                else next.add(key);
                onToggle(next);
            });
        });
    }

    function openTripFormModal(trip) {
        const modal = document.getElementById('trip-form-modal');
        if (!modal) return;
        tripFormEditingId = trip ? Number(trip.id) : null;
        tripFormActivityKeys = new Set(['casual']);
        if (trip?.activities?.length) {
            tripFormActivityKeys = new Set();
            for (const label of trip.activities) {
                const match = TRIP_ACTIVITIES.find((a) => a.label === label);
                if (match) tripFormActivityKeys.add(match.key);
            }
            if (!tripFormActivityKeys.size) tripFormActivityKeys.add('casual');
        }
        document.getElementById('trip-form-modal-title').textContent = tripFormEditingId
            ? 'Edit trip'
            : 'New trip';
        document.getElementById('trip-form-name').value = trip?.name || '';
        document.getElementById('trip-form-destination').value = trip?.destination || '';
        document.getElementById('trip-form-start').value = trip?.start_date || '';
        document.getElementById('trip-form-end').value = trip?.end_date || '';
        const actContainer = document.getElementById('trip-form-activities');
        const bindActChips = () => {
            renderActivityChips(actContainer, tripFormActivityKeys, (next) => {
                tripFormActivityKeys = next;
                bindActChips();
            });
        };
        bindActChips();
        modal.classList.remove('hidden');
        modal.classList.add('active');
    }

    function closeTripFormModal() {
        const modal = document.getElementById('trip-form-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('active');
        }
        tripFormEditingId = null;
    }

    async function submitTripFormModal(ev) {
        ev.preventDefault();
        const name = document.getElementById('trip-form-name')?.value.trim();
        if (!name) return;
        const destination = document.getElementById('trip-form-destination')?.value.trim() || null;
        const start_date = document.getElementById('trip-form-start')?.value || null;
        const end_date = document.getElementById('trip-form-end')?.value || null;
        const activities = TRIP_ACTIVITIES.filter((a) => tripFormActivityKeys.has(a.key)).map((a) => a.label);
        const body = { name, destination, start_date, end_date, activities };
        try {
            if (tripFormEditingId) {
                await api(`/trips/${tripFormEditingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                app().showToast('Trip updated');
            } else {
                const res = await api('/trips', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                packState.activeTripId = Number(res.trip?.id) || null;
                app().showToast('Trip created');
            }
            closeTripFormModal();
            loadPackMode();
        } catch (e) {
            toastError(e);
        }
    }

    function openCreateFitWithTrip({ tripName, tripDestination, tripStart, tripEnd, packedOnly = true }) {
        app().showTab('create-fit', { packedOnly, tripName, tripDestination, tripStart, tripEnd });
    }

    function prefillCreateFitTripFields(opts = {}) {
        const nameEl = document.getElementById('fit-trip-name');
        const destEl = document.getElementById('fit-trip-destination');
        const startEl = document.getElementById('fit-trip-start');
        const endEl = document.getElementById('fit-trip-end');
        if (opts.tripName != null && nameEl) nameEl.value = opts.tripName;
        if (opts.tripDestination != null && destEl) destEl.value = opts.tripDestination;
        if (opts.tripStart != null && startEl) startEl.value = opts.tripStart;
        if (opts.tripEnd != null && endEl) endEl.value = opts.tripEnd;
        document.querySelector('.trip-details')?.setAttribute('open', '');
    }

    function bindHubNavigation() {
        document.querySelectorAll('.hub-card[data-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                const carePane = btn.dataset.carePane;
                if (carePane) app().activeCarePane = carePane;
                app().showTab(tab, { fromHub: true });
                if (carePane) app().showCarePane(carePane);
            });
        });

        document.querySelectorAll('.btn-back[data-back-tab]').forEach((btn) => {
            btn.addEventListener('click', () => app().showTab(btn.dataset.backTab));
        });

        const planningQuick = document.getElementById('planning-quick-btn');
        if (planningQuick) {
            planningQuick.addEventListener('click', () => app().showTab('planning'));
        }

        const feedCreate = document.getElementById('feed-create-fit-btn');
        if (feedCreate) {
            feedCreate.addEventListener('click', () => app().showTab('create-fit'));
        }
    }

    function applySocialNav() {
        const on = socialEnabled();
        document.querySelectorAll('.nav-btn--feed').forEach((feedBtn) => {
            feedBtn.classList.toggle('hidden', !on);
        });
        const socialSection = document.getElementById('profile-social-section');
        if (socialSection) socialSection.classList.toggle('hidden', !on);
    }

    async function loadProfileHub() {
        applySocialNav();
        const u = app()?.currentUser;
        if (!u) return;

        const statsLine = document.getElementById('profile-stats-line');
        if (statsLine) {
            try {
                const profile = await api(`/users/${u.id}`);
                statsLine.textContent = `${profile.item_count ?? 0} items · ${profile.post_count ?? 0} fits`;
                if (socialEnabled()) {
                    statsLine.textContent += ` · ${profile.friend_count ?? 0} friends`;
                }
            } catch {
                statsLine.textContent = '';
            }
        }

        try {
            const { cards } = await api('/reminders');
            const box = document.getElementById('profile-reminders');
            if (box && cards && cards.length) {
                box.classList.remove('hidden');
                box.innerHTML = cards.slice(0, 4).map((c) => `
                    <div class="reminder-row glass-card">
                        <strong>${esc(c.title)}</strong>
                        <span class="hint-text">${esc([c.detail, c.due_date ? `Due ${c.due_date}` : ''].filter(Boolean).join(' · '))}</span>
                    </div>
                `).join('');
            }
        } catch {
            /* optional */
        }

        if (!socialEnabled()) return;

        const grid = document.getElementById('profile-fits-grid');
        if (!grid) return;
        try {
            const { posts } = await api(`/users/${u.id}/posts`);
            if (!posts.length) {
                grid.innerHTML = '<p class="hint-text">No fits yet. Post one from the hub.</p>';
                return;
            }
            grid.innerHTML = posts.map((p) => {
                const src = app().safeUrl(p.image_path);
                return `<button type="button" class="fits-grid-item" data-post-id="${Number(p.id)}">
                    ${src ? `<img src="${src}" alt="">` : '<span class="fits-grid-placeholder"></span>'}
                </button>`;
            }).join('');
            grid.querySelectorAll('[data-post-id]').forEach((el) => {
                el.addEventListener('click', () => openFitModal(Number(el.dataset.postId)));
            });
        } catch {
            grid.innerHTML = '<p class="hint-text">Could not load your fits.</p>';
        }
    }

    async function loadWishlist() {
        const el = document.getElementById('wishlist-container');
        if (!el) return;
        el.innerHTML = '<div class="loading">Loading…</div>';
        try {
            const { items } = await api('/wishlist');
            if (!items.length) {
                el.innerHTML = emptyState(
                    'wishlist',
                    'Wishlist is empty',
                    'Save pieces you are eyeing before you buy.',
                    'upload',
                    'Add an item'
                );
                bindEmptyCtas(el);
                return;
            }
            el.innerHTML = items.map((item) => {
                const id = Number(item.id);
                const thumb = img(item);
                const displayName = item.wishlist_name || item.subcategory || item.name || 'Item';
                const notesBlock = item.notes
                    ? `<p class="hint-text wishlist-notes-display">${esc(item.notes)}</p>`
                    : '';
                const notesVal = esc(item.notes || '');
                return `<article class="hub-row glass-card wishlist-row" data-wish-id="${id}">
                    ${thumb ? `<img class="hub-row-thumb" src="${thumb}" alt="">` : ''}
                    <div class="hub-row-body">
                        <h4>${esc(displayName)}</h4>
                        <p class="hint-text">${esc(item.category || '')}${item.wishlist_intent ? ` · ${esc(item.wishlist_intent)}` : ''}${item.purchase_price != null ? ` · $${esc(item.purchase_price)}` : ''}</p>
                        ${notesBlock}
                        ${item.wishlist_url ? `<a class="hint-text wishlist-link" href="${app().safeUrl(item.wishlist_url)}" target="_blank" rel="noopener noreferrer">View link</a>` : ''}
                        <label class="form-group wishlist-notes-edit">Notes
                            <textarea class="form-input wishlist-notes-input" data-wish-notes="${id}" rows="2" maxlength="500">${notesVal}</textarea>
                        </label>
                        <div class="hub-row-actions">
                            <button type="button" class="btn btn-secondary btn-sm" data-save-wish-notes="${id}">Save notes</button>
                            <button type="button" class="btn btn-primary btn-sm" data-promote="${id}">Promote to closet</button>
                            <button type="button" class="btn btn-secondary btn-sm" data-delete-wish="${id}">Remove</button>
                        </div>
                    </div>
                </article>`;
            }).join('');
            el.querySelectorAll('[data-save-wish-notes]').forEach((b) => {
                b.addEventListener('click', async () => {
                    const id = b.dataset.saveWishNotes;
                    const textarea = el.querySelector(`[data-wish-notes="${id}"]`);
                    const notes = textarea?.value.trim() || null;
                    try {
                        await api(`/wishlist/${id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ notes }),
                        });
                        app().showToast('Notes saved');
                        loadWishlist();
                    } catch (e) {
                        toastError(e);
                    }
                });
            });
            el.querySelectorAll('[data-promote]').forEach((b) => {
                b.addEventListener('click', async () => {
                    try {
                        await api(`/item/${b.dataset.promote}/promote`, { method: 'PUT' });
                        app().showToast('Added to your closet');
                        loadWishlist();
                        app().loadCloset();
                    } catch (e) {
                        toastError(e);
                    }
                });
            });
            el.querySelectorAll('[data-delete-wish]').forEach((b) => {
                b.addEventListener('click', async () => {
                    const ok = await showConfirmModal({
                        title: 'Remove from wishlist?',
                        message: 'This item will be deleted from your wishlist.',
                        confirmLabel: 'Remove',
                        danger: true,
                    });
                    if (!ok) return;
                    try {
                        await api(`/item/${b.dataset.deleteWish}`, { method: 'DELETE' });
                        loadWishlist();
                    } catch (e) {
                        toastError(e);
                    }
                });
            });
        } catch (e) {
            el.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`;
        }
    }

    function initWishlistForm() {
        const form = document.getElementById('wishlist-add-form');
        if (!form || form.dataset.bound) return;
        form.dataset.bound = '1';
        form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const name = document.getElementById('wishlist-name-input')?.value.trim();
            if (!name) return;
            const category = document.getElementById('wishlist-category-input')?.value || 'Other';
            const intent = document.getElementById('wishlist-intent-input')?.value || 'want';
            const priceRaw = document.getElementById('wishlist-price-input')?.value;
            const url = document.getElementById('wishlist-url-input')?.value.trim() || null;
            const notes = document.getElementById('wishlist-notes-input')?.value.trim() || null;
            const photoInput = document.getElementById('wishlist-photos-input');
            const photoFiles = photoInput?.files?.length ? [...photoInput.files].slice(0, 4) : [];
            const body = {
                name,
                category,
                subcategory: 'Wishlist',
                intent,
                url,
                notes,
                price: priceRaw ? Number(priceRaw) : null,
            };
            try {
                if (photoFiles.length) {
                    await uploadWishlistPhotos(photoFiles, body);
                } else {
                    await createWishlistItem(body);
                }
                app().showToast('Added to wishlist');
                form.reset();
                if (photoInput) photoInput.value = '';
                document.getElementById('wishlist-photo-preview')?.classList.add('hidden');
                loadWishlist();
            } catch (e) {
                toastError(e);
            }
        });
    }

    const FEED_REACTIONS = ['🔥', '❤️', '👏', '🧊', '✨', '👀'];
    const FEED_PAGE_SIZE = 30;
    let feedCursor = null;
    let feedReachedEnd = false;
    const createFitTagged = new Set();
    let createFitClosetLoaded = false;

    async function loadFeed(append) {
        const el = document.getElementById('feed-container');
        if (!el) return;
        if (!append) {
            feedCursor = null;
            feedReachedEnd = false;
            el.innerHTML = '<div class="feed-skeleton" aria-busy="true" aria-label="Loading feed">' + '<div class="feed-skeleton-card"></div>'.repeat(3) + '</div>';
            document.getElementById('feed-load-more')?.remove();
        }
        try {
            const path = feedCursor ? `/feed?before=${encodeURIComponent(feedCursor)}` : '/feed';
            const data = await api(path);
            const posts = Array.isArray(data?.posts) ? data.posts : [];
            if (!append && posts.length === 0) {
                el.innerHTML = emptyState(
                    'feed',
                    'Your feed is quiet',
                    'Follow friends to see their fits here.',
                    socialEnabled() ? 'friends' : 'profile',
                    socialEnabled() ? 'Find friends' : 'Open profile'
                );
                bindEmptyCtas(el);
                return;
            }
            if (!posts.length) {
                feedReachedEnd = true;
                document.getElementById('feed-load-more')?.classList.add('hidden');
                return;
            }
            const html = posts.map((p) => renderFitCard(p)).join('');
            if (append) {
                el.insertAdjacentHTML('beforeend', html);
            } else {
                el.innerHTML = html;
            }
            bindFeedCards(el);
            feedCursor = posts[posts.length - 1].created_at;
            if (posts.length < FEED_PAGE_SIZE) feedReachedEnd = true;
            let loadMoreBtn = document.getElementById('feed-load-more');
            if (!feedReachedEnd) {
                if (!loadMoreBtn) {
                    loadMoreBtn = document.createElement('button');
                    loadMoreBtn.type = 'button';
                    loadMoreBtn.id = 'feed-load-more';
                    loadMoreBtn.className = 'btn btn-secondary feed-load-more';
                    loadMoreBtn.textContent = 'Load more';
                    el.appendChild(loadMoreBtn);
                    loadMoreBtn.addEventListener('click', () => loadFeed(true));
                }
                loadMoreBtn.classList.remove('hidden');
            } else if (loadMoreBtn) {
                loadMoreBtn.classList.add('hidden');
            }
        } catch (e) {
            let msg = e instanceof Error ? e.message : 'Could not load feed';
            msg = await enrichFeedError(msg);
            if (!append) {
                const parts = String(msg).split('\n\n').filter(Boolean);
                el.innerHTML = `<div class="empty-state feed-error-state"><h3>Could not load feed</h3>${parts.map((p) => `<p class="hint-text feed-error-detail">${esc(p)}</p>`).join('')}<button type="button" class="btn btn-secondary btn-sm" id="feed-retry-btn">Retry</button></div>`;
                document.getElementById('feed-retry-btn')?.addEventListener('click', () => loadFeed(false));
            }
        }
    }

    function bindFeedCards(root) {
        const scope = root || document;
        scope.querySelectorAll('.fit-card[data-post-id]').forEach((card) => {
            if (card.dataset.bound) return;
            card.dataset.bound = '1';
            card.querySelectorAll('.fit-card-tap').forEach((tap) => {
                tap.addEventListener('click', () => openFitModal(Number(card.dataset.postId)));
            });
            card.querySelectorAll('[data-profile-id]').forEach((btn) => {
                btn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    openPublicProfile(Number(btn.dataset.profileId));
                });
            });
            card.querySelectorAll('[data-feed-react]').forEach((btn) => {
                btn.addEventListener('click', async (ev) => {
                    ev.stopPropagation();
                    try {
                        await api(`/fits/${card.dataset.postId}/react`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ emoji: btn.dataset.feedReact }),
                        });
                        loadFeed();
                    } catch (err) {
                        toastError(err);
                    }
                });
            });
        });
    }

    function renderFitCard(post) {
        const src = app().safeUrl(post.image_path);
        const authorId = post.author?.id ? Number(post.author.id) : 0;
        const author = post.author
            ? `<button type="button" class="fit-author-btn" data-profile-id="${authorId}">@${esc(post.author.username)}</button>`
            : '';
        const caption = post.caption ? `<p>${esc(post.caption)}</p>` : '';
        const reactions = FEED_REACTIONS.map((emoji) => {
            const r = (post.reactions || []).find((x) => x.emoji === emoji);
            const count = r?.count || 0;
            const mine = r?.mine ? ' reaction-mine' : '';
            return `<button type="button" class="reaction-btn${mine}" data-feed-react="${esc(emoji)}">${esc(emoji)}${count ? ` ${count}` : ''}</button>`;
        }).join('');
        return `<article class="fit-card glass-card" data-post-id="${Number(post.id)}">
            <header class="fit-card-header fit-card-tap">${author}</header>
            ${src ? `<img class="fit-card-image fit-card-tap" src="${src}" alt="">` : ''}
            ${caption}
            <div class="reaction-bar feed-reaction-bar">${reactions}</div>
            <p class="hint-text">${esc(post.created_at || '')}</p>
        </article>`;
    }

    async function openFitModal(postId) {
        const modal = document.getElementById('fit-modal');
        const body = document.getElementById('fit-modal-body');
        if (!modal || !body) return;
        body.innerHTML = '<div class="loading">Loading…</div>';
        modal.classList.remove('hidden');
        modal.classList.add('active');
        try {
            const postRes = await api(`/fits/${postId}`);
            const post = postRes.post || postRes;
            const src = app().safeUrl(post.image_path);
            const items = (post.items || [])
                .map((i) => `<span class="badge">${esc(i.subcategory)}</span>`)
                .join('');
            body.innerHTML = `
                ${src ? `<img class="modal-image" src="${src}" alt="">` : ''}
                ${post.caption ? `<p>${esc(post.caption)}</p>` : ''}
                <div class="clothing-card-meta">${items}</div>
                <p class="hint-text">${esc(post.created_at || '')}</p>
            `;
        } catch (e) {
            body.innerHTML = `<p>${esc(e.message)}</p>`;
        }
    }

    function closeFitModal() {
        const modal = document.getElementById('fit-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.classList.add('hidden');
        }
    }

    function closePublicProfileModal() {
        const modal = document.getElementById('public-profile-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.classList.add('hidden');
        }
    }

    async function openPublicProfile(userId) {
        const modal = document.getElementById('public-profile-modal');
        const body = document.getElementById('public-profile-body');
        if (!modal || !body) return;
        body.innerHTML = '<div class="loading">Loading profile…</div>';
        modal.classList.remove('hidden');
        modal.classList.add('active');
        try {
            const profile = await api(`/users/${userId}`);
            const rel = profile.relationship || 'none';
            let postsHtml = '';
            if (rel === 'self' || rel === 'friends') {
                const { posts } = await api(`/users/${userId}/posts`);
                postsHtml = posts.length
                    ? `<div class="fits-grid">${posts
                          .map((p) => {
                              const src = app().safeUrl(p.image_path);
                              const id = Number(p.id);
                              return src
                                  ? `<button type="button" class="fits-grid-item" data-post-id="${id}"><img src="${src}" alt=""></button>`
                                  : '';
                          })
                          .join('')}</div>`
                    : '<p class="hint-text">No fits yet.</p>';
            } else {
                postsHtml = '<p class="hint-text">Add as a friend to see their fits.</p>';
            }
            body.innerHTML = `
                <h2>@${esc(profile.username)}</h2>
                ${profile.full_name ? `<p>${esc(profile.full_name)}</p>` : ''}
                ${profile.bio ? `<p class="hint-text">${esc(profile.bio)}</p>` : ''}
                <p class="hint-text">${Number(profile.item_count) || 0} items · ${Number(profile.post_count) || 0} fits</p>
                <h3>Fits</h3>
                ${postsHtml}
            `;
            body.querySelectorAll('[data-post-id]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    closePublicProfileModal();
                    openFitModal(Number(btn.dataset.postId));
                });
            });
        } catch (e) {
            body.innerHTML = `<p>${esc(e.message)}</p>`;
        }
    }

    async function loadPackMode() {
        const el = document.getElementById('pack-container');
        if (!el) return;
        el.innerHTML = '<div class="loading">Loading trips…</div>';
        try {
            const [{ trips }, { items }] = await Promise.all([
                api('/trips'),
                api('/closet?status=clean'),
            ]);
            if (trips.length && packState.activeTripId == null) {
                packState.activeTripId = Number(trips[0].id);
            }
            const activeTrip = trips.find((t) => Number(t.id) === packState.activeTripId) || null;
            if (activeTrip && !packState.destination) {
                syncPackStateFromTrip(activeTrip, { resetPlan: false });
            }

            const packedCount = items.filter((i) => i.packed_for_trip).length;
            const visibleItems = items.filter((item) => {
                if (packState.viewMode === 'packed') return item.packed_for_trip;
                if (packState.viewMode === 'unpacked') return !item.packed_for_trip;
                return true;
            });
            const target = coverageTarget();
            const tripDayCount = getTripDayCount(packState.tripStart, packState.tripEnd);

            let html = `<div class="glass-card pack-mode-card">
                <div class="pack-summary-row">
                    <div>
                        <h3>Travel bag</h3>
                        <p class="hint-text">${packedCount} of ${items.length} items packed</p>
                    </div>
                </div>`;
            if (activeTrip) {
                const pct = Math.min(100, Math.round((activeTrip.progress || 0) * 100));
                html += `<div class="pack-progress-track"><div class="pack-progress-fill" style="width:${pct}%"></div></div>
                    <p class="hint-text">${esc(activeTrip.name)}: ${activeTrip.packed_count || 0}/${activeTrip.item_count || 0} checklist items packed</p>`;
            }
            html += `<div class="pack-bulk-actions">
                    <button type="button" class="btn btn-secondary btn-sm" id="pack-suggest-btn">Suggest fits</button>
                    <button type="button" class="btn btn-secondary btn-sm" id="pack-unpack-all-btn">Unpack all</button>
                </div>
            </div>`;

            html += `<div class="glass-card pack-mode-card">
                <label class="form-group">Active trip
                    <select id="pack-trip-select" class="form-input">
                        ${trips.length
                            ? trips
                                  .map(
                                      (t) =>
                                          `<option value="${Number(t.id)}" ${packState.activeTripId === Number(t.id) ? 'selected' : ''}>${esc(t.name)}</option>`
                                  )
                                  .join('')
                            : '<option value="">No trips yet</option>'}
                    </select>
                </label>
                <h3>Trip weather</h3>
                <p class="hint-text">${packState.tripWeather ? esc(weatherHeadline(packState.tripWeather)) : 'Search a destination to sync forecast-aware pack ideas.'}</p>
                <input type="text" id="pack-destination" class="form-input" placeholder="Destination city" value="${esc(packState.destination)}">
                <div class="trip-date-row">
                    <input type="date" id="pack-trip-start" class="form-input" value="${esc(packState.tripStart)}" aria-label="Trip start">
                    <input type="date" id="pack-trip-end" class="form-input" value="${esc(packState.tripEnd)}" aria-label="Trip end">
                </div>
                <p class="hint-text">${tripDayCount ? `${tripDayCount} trip days; suggested target is ${defaultOutfitTarget(tripDayCount)} outfits with rewear.` : 'Add dates to estimate outfit coverage.'}</p>
                <label class="form-group">Coverage goal
                    <input type="number" id="pack-desired-outfits" class="form-input" min="1" max="14" placeholder="${target}" value="${esc(packState.desiredOutfits)}">
                </label>
                <p class="section-label">Planned activities</p>
                <div id="pack-activities" class="chip-row"></div>
                <p class="hint-text">${packState.tripWeather ? esc(weatherDetail(packState.tripWeather)) : esc(forecastSummary(packState.forecastDays))}</p>
                <div class="pack-bulk-actions">
                    <button type="button" class="btn btn-secondary btn-sm" id="pack-sync-weather-btn">Sync weather</button>
                    <button type="button" class="btn btn-secondary btn-sm" id="pack-build-list-btn">Build list</button>
                    <button type="button" class="btn btn-primary btn-sm" id="pack-save-trip-btn">${activeTrip ? 'Save trip' : 'Create trip'}</button>
                </div>
            </div>`;

            if (packState.packPlan) {
                html += `<div class="glass-card pack-mode-card">
                    <h3>Pack list ready</h3>
                    <p class="hint-text">${packState.packPlan.outfits.length} outfits, ${packState.packPlan.uniqueItemIds.length} pieces selected</p>
                    <p class="hint-text">Reusing ${packState.packPlan.overlapCount} pieces across ${packState.packPlan.totalSlots} outfit slots keeps the bag lighter.</p>
                    <div class="chip-row">${packState.packPlan.outfits
                        .map(
                            (entry, index) =>
                                `<span class="chip-btn active">Fit ${index + 1}: ${esc(entry.activityLabel)}</span>`
                        )
                        .join('')}</div>
                    <button type="button" class="btn btn-primary btn-sm" id="pack-apply-list-btn">Pack selected items</button>
                </div>`;
            }

            if (packState.suggestions.length) {
                html += `<div class="pack-mode-card"><h3 class="section-label">Suggested fit bundles</h3>`;
                html += packState.suggestions
                    .map((outfit, idx) => {
                        const selected = packState.selectedSuggestion === idx;
                        const thumbs = (outfit.items || [])
                            .map((i) => {
                                const s = img(i);
                                return s ? `<img class="plan-thumb" src="${s}" alt="">` : '';
                            })
                            .join('');
                        return `<article class="pack-suggestion-card glass-card${selected ? ' selected' : ''}" data-suggestion-idx="${idx}">
                            <strong>Fit ${idx + 1}</strong> · ${(outfit.items || []).length} pieces
                            <div class="plan-thumbs">${thumbs}</div>
                        </article>`;
                    })
                    .join('');
                html += `<button type="button" class="btn btn-secondary btn-sm" id="pack-suggestion-pack-btn">Pack selected fit</button></div>`;
            }

            html += `<div class="chip-row pack-view-modes">${PACK_VIEW_MODES.map(
                (m) =>
                    `<button type="button" class="chip-btn${packState.viewMode === m.key ? ' active' : ''}" data-pack-view="${m.key}">${esc(m.label)}</button>`
            ).join('')}</div>`;

            html += `<div class="pack-bulk-actions">
                <button type="button" class="btn btn-secondary btn-sm" id="pack-all-btn">Pack all shown</button>
                <button type="button" class="btn btn-secondary btn-sm" id="pack-selected-btn">Pack ${packState.selectedIds.size || 'selected'}</button>
            </div>`;
            html += `<div class="pack-grid">`;
            html += visibleItems.slice(0, 120).map((item) => {
                const id = Number(item.id);
                const checked = item.packed_for_trip ? 'checked' : '';
                const selected = packState.selectedIds.has(id) ? ' selected' : '';
                const thumb = img(item);
                return `<label class="pack-item${selected}">
                    <input type="checkbox" data-pack-item="${id}" ${checked}>
                    ${thumb ? `<img src="${thumb}" alt="">` : ''}
                    <span>${esc(item.subcategory)}</span>
                </label>`;
            }).join('');
            html += '</div>';
            el.innerHTML = html;

            const bindPackActivities = () => {
                renderActivityChips(document.getElementById('pack-activities'), packState.plannedActivities, (next) => {
                    packState.plannedActivities = next;
                    bindPackActivities();
                });
            };
            bindPackActivities();

            document.getElementById('pack-destination')?.addEventListener('input', (e) => {
                packState.destination = e.target.value;
            });
            document.getElementById('pack-trip-start')?.addEventListener('change', (e) => {
                packState.tripStart = e.target.value;
            });
            document.getElementById('pack-trip-end')?.addEventListener('change', (e) => {
                packState.tripEnd = e.target.value;
            });
            document.getElementById('pack-desired-outfits')?.addEventListener('input', (e) => {
                packState.desiredOutfits = e.target.value;
            });

            document.getElementById('pack-trip-select')?.addEventListener('change', (e) => {
                packState.activeTripId = Number(e.target.value) || null;
                const trip = trips.find((t) => Number(t.id) === packState.activeTripId);
                if (trip) syncPackStateFromTrip(trip);
                loadPackMode();
            });

            el.querySelectorAll('[data-pack-view]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    packState.viewMode = btn.dataset.packView;
                    loadPackMode();
                });
            });

            el.querySelectorAll('[data-pack-item]').forEach((cb) => {
                cb.addEventListener('change', async () => {
                    const tripId = packState.activeTripId;
                    if (!tripId) {
                        app().showToast('Create or select a trip first', 'warning');
                        cb.checked = !cb.checked;
                        return;
                    }
                    try {
                        await api(`/trips/${tripId}/packed`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ item_id: Number(cb.dataset.packItem), packed: cb.checked }),
                        });
                    } catch (e) {
                        toastError(e);
                        cb.checked = !cb.checked;
                    }
                });
            });

            el.querySelectorAll('.pack-item').forEach((label) => {
                label.addEventListener('click', (ev) => {
                    if (ev.target.matches('[data-pack-item]')) return;
                    const id = Number(label.querySelector('[data-pack-item]')?.dataset.packItem);
                    if (!id) return;
                    if (packState.selectedIds.has(id)) packState.selectedIds.delete(id);
                    else packState.selectedIds.add(id);
                    packState.selectedSuggestion = null;
                    packState.packPlan = null;
                    loadPackMode();
                });
            });

            el.querySelectorAll('[data-suggestion-idx]').forEach((card) => {
                card.addEventListener('click', () => {
                    const idx = Number(card.dataset.suggestionIdx);
                    packState.selectedSuggestion = idx;
                    const outfit = packState.suggestions[idx];
                    if (outfit) {
                        packState.selectedIds = new Set((outfit.items || []).map((i) => Number(i.id)));
                        packState.packPlan = null;
                    }
                    loadPackMode();
                });
            });

            document.getElementById('pack-suggest-btn')?.addEventListener('click', async () => {
                try {
                    const packedIds = items.filter((i) => i.packed_for_trip).map((i) => i.id);
                    const data = await fetchOutfitRecommendations({
                        seed: Date.now(),
                        excludeItemIds: packedIds,
                        lat: packState.tripLocation?.latitude,
                        lon: packState.tripLocation?.longitude,
                        weatherDate: packState.tripWeather?.date,
                        locationName: packState.tripLocation?.label,
                    });
                    packState.suggestions = data.outfits || [];
                    if (data.weather) packState.tripWeather = data.weather;
                    packState.selectedSuggestion = null;
                    packState.packPlan = null;
                    if (!packState.suggestions.length) {
                        app().showToast('No outfit bundles yet', 'warning');
                    }
                    loadPackMode();
                } catch (e) {
                    toastError(e);
                }
            });

            document.getElementById('pack-sync-weather-btn')?.addEventListener('click', async () => {
                const q = packState.destination.trim();
                if (q.length < 2) {
                    app().showToast('Enter a destination first', 'warning');
                    return;
                }
                try {
                    const geo = await api(`/weather/geocode?q=${encodeURIComponent(q)}`);
                    const place = geo.results?.[0];
                    if (!place) {
                        app().showToast('No matching destination found', 'warning');
                        return;
                    }
                    const forecast = await api(
                        `/weather/forecast?lat=${place.latitude}&lon=${place.longitude}` +
                            (packState.tripStart ? `&start_date=${encodeURIComponent(packState.tripStart)}` : '') +
                            (packState.tripEnd ? `&end_date=${encodeURIComponent(packState.tripEnd)}` : '') +
                            (place.label ? `&location_name=${encodeURIComponent(place.label)}` : '')
                    );
                    packState.tripLocation = place;
                    packState.tripWeather = forecast.context || null;
                    packState.forecastDays = forecast.days || [];
                    loadPackMode();
                } catch (e) {
                    toastError(e);
                }
            });

            document.getElementById('pack-build-list-btn')?.addEventListener('click', async () => {
                try {
                    const packedIds = items.filter((i) => i.packed_for_trip).map((i) => i.id);
                    const activities = selectedTripActivities();
                    const requestCount = Math.min(8, Math.max(target, activities.length));
                    const seedBase = Date.now();
                    const responses = await Promise.all(
                        Array.from({ length: requestCount }, (_, index) => {
                            const activity = activities[index % activities.length];
                            return fetchOutfitRecommendations({
                                occasion: activity.occasion,
                                vibe: activity.vibe,
                                seed: seedBase + index,
                                excludeItemIds: packedIds,
                                lat: packState.tripLocation?.latitude,
                                lon: packState.tripLocation?.longitude,
                                weatherDate: packState.tripWeather?.date,
                                locationName: packState.tripLocation?.label,
                                season: packState.tripWeather?.derived_season,
                            }).then((data) => ({ data, activity }));
                        })
                    );
                    const candidates = responses.flatMap(({ data, activity }) =>
                        (data.outfits || []).map((outfit) => ({
                            outfit,
                            activityLabel: activity.label,
                        }))
                    );
                    const weatherHit = responses.find(({ data }) => data.weather);
                    if (weatherHit?.data.weather) packState.tripWeather = weatherHit.data.weather;
                    const plan = selectCoveragePlan(candidates, target);
                    if (!plan) {
                        packState.packPlan = null;
                        packState.suggestions = [];
                        packState.selectedIds = new Set();
                        app().showToast('No pack list yet — try different activities', 'warning');
                    } else {
                        packState.packPlan = plan;
                        packState.suggestions = plan.outfits.map((entry) => entry.outfit);
                        packState.selectedIds = new Set(plan.uniqueItemIds);
                        packState.selectedSuggestion = null;
                    }
                    loadPackMode();
                } catch (e) {
                    toastError(e);
                }
            });

            async function applyPackedIds(ids) {
                if (!ids.length) return;
                await api('/closet/packed', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ packed_for_trip: true, item_ids: ids }),
                });
                const tripId = packState.activeTripId;
                if (tripId) {
                    for (const itemId of ids) {
                        await api(`/trips/${tripId}/packed`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ item_id: itemId, packed: true }),
                        });
                    }
                }
                app().showToast(`Packed ${ids.length} item(s)`);
                packState.selectedIds = new Set();
                packState.selectedSuggestion = null;
                packState.packPlan = null;
                app().loadCloset?.();
                loadPackMode();
            }

            document.getElementById('pack-apply-list-btn')?.addEventListener('click', () => {
                applyPackedIds(packState.packPlan?.uniqueItemIds || []);
            });
            document.getElementById('pack-suggestion-pack-btn')?.addEventListener('click', () => {
                applyPackedIds([...packState.selectedIds]);
            });
            document.getElementById('pack-selected-btn')?.addEventListener('click', () => {
                applyPackedIds([...packState.selectedIds]);
            });

            document.getElementById('pack-all-btn')?.addEventListener('click', async () => {
                const ids = [...el.querySelectorAll('[data-pack-item]')].map((c) => Number(c.dataset.packItem));
                await applyPackedIds(ids);
            });

            document.getElementById('pack-unpack-all-btn')?.addEventListener('click', async () => {
                const ids = items.filter((i) => i.packed_for_trip).map((i) => i.id);
                if (!ids.length) return;
                await api('/closet/packed', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ packed_for_trip: false, item_ids: ids }),
                });
                const tripId = packState.activeTripId;
                if (tripId) {
                    for (const itemId of ids) {
                        await api(`/trips/${tripId}/packed`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ item_id: itemId, packed: false }),
                        });
                    }
                }
                app().showToast('All items unpacked');
                app().loadCloset?.();
                loadPackMode();
            });

            document.getElementById('pack-save-trip-btn')?.addEventListener('click', async () => {
                const activities = selectedTripActivities().map((a) => a.label);
                const body = {
                    name: packState.destination.trim() || activeTrip?.name || 'Upcoming trip',
                    destination: packState.destination.trim() || null,
                    start_date: packState.tripStart || null,
                    end_date: packState.tripEnd || null,
                    activities,
                    item_ids: [...packState.selectedIds],
                };
                try {
                    if (activeTrip) {
                        await api(`/trips/${activeTrip.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body),
                        });
                        app().showToast('Trip saved');
                    } else {
                        const res = await api('/trips', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body),
                        });
                        packState.activeTripId = Number(res.trip?.id) || null;
                        app().showToast('Trip created');
                    }
                    loadPackMode();
                } catch (e) {
                    toastError(e);
                }
            });
        } catch (e) {
            el.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`;
        }
    }

    function editActiveTrip() {
        api('/trips')
            .then(({ trips }) => {
                const trip = trips.find((t) => Number(t.id) === packState.activeTripId);
                if (trip) openTripFormModal(trip);
                else app().showToast('Select a trip to edit', 'warning');
            })
            .catch(toastError);
    }

    function normalizePinIds(pinItemIdOrIds) {
        if (Array.isArray(pinItemIdOrIds)) {
            return pinItemIdOrIds.map(Number).filter(Boolean);
        }
        if (pinItemIdOrIds) return [Number(pinItemIdOrIds)].filter(Boolean);
        return [];
    }

    async function loadPlanning(pinItemIdOrIds) {
        const pinIds = normalizePinIds(pinItemIdOrIds);
        const el = document.getElementById('planning-container');
        if (!el) return;
        el.innerHTML = '<div class="loading">Loading plans…</div>';
        try {
            const [{ plans }, { items }] = await Promise.all([
                api('/planned-outfits?include_past=false'),
                api('/closet'),
            ]);
            const today = new Date().toISOString().slice(0, 10);
            let html = `<form id="plan-form" class="glass-card plan-form">
                <h3>New plan</h3>
                <input type="text" id="plan-title" class="form-input" placeholder="Title" required maxlength="120" value="${pinIds.length ? esc(`Outfit for ${today}`) : ''}">
                <input type="date" id="plan-date" class="form-input" value="${today}" required>
                <input type="text" id="plan-occasion" class="form-input" placeholder="Occasion (optional)">
                <textarea id="plan-notes" class="form-input" placeholder="Prep notes (optional)" maxlength="500" rows="3"></textarea>
                <p class="section-label">Status</p>
                <div id="plan-create-status" class="chip-row"></div>
                <select id="plan-items" class="form-input" multiple size="6" aria-label="Items">
                    ${items.map((i) => `<option value="${Number(i.id)}" ${pinIds.includes(Number(i.id)) ? 'selected' : ''}>${esc(i.subcategory)} (${esc(i.category)})</option>`).join('')}
                </select>
                <p class="hint-text">Hold Ctrl/Cmd to select multiple items.</p>
                <button type="submit" class="btn btn-primary">Save plan</button>
            </form>`;

            if (!plans.length) {
                html += emptyState(
                    'planning',
                    'No upcoming plans',
                    'Reserve outfits by date so nothing sneaks up on you.',
                    null,
                    null
                );
            } else {
                html += plans
                    .map((p) => {
                        const thumbs = (p.items || [])
                            .map((i) => {
                                const s = img(i);
                                return s ? `<img class="plan-thumb" src="${s}" alt="">` : '';
                            })
                            .join('');
                        const conflicts =
                            p.conflicts && p.conflicts.length
                                ? `<p class="warn-text">${esc(p.conflicts.map((c) => c.message).join('; '))}</p>`
                                : '';
                        return `<article class="glass-card hub-row" data-plan-row="${Number(p.id)}">
                            <h4>${esc(p.title)} · ${esc(p.planned_for)}</h4>
                            <p class="hint-text">${esc(p.occasion || 'Any occasion')}</p>
                            <label class="section-label" for="plan-notes-${Number(p.id)}">Notes</label>
                            <textarea id="plan-notes-${Number(p.id)}" class="form-input plan-notes-input" data-plan-notes="${Number(p.id)}" maxlength="500" rows="2" placeholder="Prep notes (optional)">${esc(p.notes || '')}</textarea>
                            <div class="plan-thumbs">${thumbs}</div>
                            ${conflicts}
                            <p class="section-label">Prep checklist</p>
                            <div class="chip-row plan-prep-row" data-plan-prep="${Number(p.id)}">${PREP_ITEMS.map((prep) => {
                                const active = p[prep.key] ? ' active' : '';
                                return `<button type="button" class="chip-btn${active}" data-prep-key="${prep.key}">${esc(prep.label)}</button>`;
                            }).join('')}</div>
                            <p class="section-label">Status</p>
                            <div class="chip-row plan-status-row" data-plan-status="${Number(p.id)}">${PLAN_STATUS_OPTIONS.map((opt) => {
                                const active = p.status === opt.value ? ' active' : '';
                                return `<button type="button" class="chip-btn${active}" data-status-value="${opt.value}">${esc(opt.label)}</button>`;
                            }).join('')}</div>
                            <button type="button" class="btn btn-secondary btn-sm" data-delete-plan="${Number(p.id)}">Delete</button>
                        </article>`;
                    })
                    .join('');
            }
            el.innerHTML = html;

            let createPlanStatus = 'draft';
            const statusContainer = document.getElementById('plan-create-status');
            const bindCreateStatus = () => {
                statusContainer.innerHTML = PLAN_STATUS_OPTIONS.slice(0, 2)
                    .map((opt) => {
                        const active = createPlanStatus === opt.value ? ' active' : '';
                        return `<button type="button" class="chip-btn${active}" data-create-status="${opt.value}">${esc(opt.label)}</button>`;
                    })
                    .join('');
                statusContainer.querySelectorAll('[data-create-status]').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        createPlanStatus = btn.dataset.createStatus;
                        bindCreateStatus();
                    });
                });
            };
            bindCreateStatus();

            document.getElementById('plan-form').addEventListener('submit', async (ev) => {
                ev.preventDefault();
                const title = document.getElementById('plan-title').value.trim();
                const planned_for = document.getElementById('plan-date').value;
                const occasion = document.getElementById('plan-occasion').value.trim();
                const notes = document.getElementById('plan-notes').value.trim();
                const sel = document.getElementById('plan-items');
                const item_ids = Array.from(sel.selectedOptions).map((o) => Number(o.value));
                try {
                    await api('/planned-outfits', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            title,
                            planned_for,
                            occasion: occasion || null,
                            notes: notes || null,
                            status: createPlanStatus,
                            item_ids,
                        }),
                    });
                    app().showToast('Plan saved');
                    loadPlanning();
                    app().loadOutfitsPlannedPreview();
                } catch (e) {
                    toastError(e);
                }
            });

            el.querySelectorAll('[data-plan-prep]').forEach((row) => {
                const planId = Number(row.dataset.planPrep);
                row.querySelectorAll('[data-prep-key]').forEach((btn) => {
                    btn.addEventListener('click', async () => {
                        const key = btn.dataset.prepKey;
                        const plan = plans.find((p) => Number(p.id) === planId);
                        if (!plan) return;
                        try {
                            await api(`/planned-outfits/${planId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ [key]: !plan[key] }),
                            });
                            loadPlanning();
                            app().loadOutfitsPlannedPreview();
                        } catch (e) {
                            toastError(e);
                        }
                    });
                });
            });

            el.querySelectorAll('[data-plan-status]').forEach((row) => {
                const planId = Number(row.dataset.planStatus);
                row.querySelectorAll('[data-status-value]').forEach((btn) => {
                    btn.addEventListener('click', async () => {
                        try {
                            await api(`/planned-outfits/${planId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status: btn.dataset.statusValue }),
                            });
                            loadPlanning();
                            app().loadOutfitsPlannedPreview();
                        } catch (e) {
                            toastError(e);
                        }
                    });
                });
            });

            el.querySelectorAll('[data-plan-notes]').forEach((ta) => {
                ta.addEventListener('blur', async () => {
                    const planId = Number(ta.dataset.planNotes);
                    const plan = plans.find((p) => Number(p.id) === planId);
                    const notes = ta.value.trim() || null;
                    const prev = (plan?.notes || '').trim() || null;
                    if (notes === prev) return;
                    try {
                        await api(`/planned-outfits/${planId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ notes }),
                        });
                        loadPlanning();
                        app().loadOutfitsPlannedPreview();
                    } catch (e) {
                        toastError(e);
                    }
                });
            });

            el.querySelectorAll('[data-delete-plan]').forEach((b) => {
                b.addEventListener('click', async () => {
                    const ok = await showConfirmModal({
                        title: 'Delete plan?',
                        message: 'This planned outfit will be removed.',
                        confirmLabel: 'Delete',
                        danger: true,
                    });
                    if (!ok) return;
                    try {
                        await api(`/planned-outfits/${b.dataset.deletePlan}`, { method: 'DELETE' });
                        loadPlanning();
                        app().loadOutfitsPlannedPreview();
                    } catch (e) {
                        toastError(e);
                    }
                });
            });
        } catch (e) {
            el.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`;
        }
    }

    function defaultTripName(destination) {
        const trimmed = String(destination || '').trim();
        const month = new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' });
        return trimmed ? `${trimmed}, ${month}` : '';
    }

    function tripDateLabel(log) {
        if (log.start_date && log.end_date && log.start_date !== log.end_date) {
            return `${log.start_date} to ${log.end_date}`;
        }
        return log.start_date || log.end_date || 'No dates';
    }

    async function loadTripsLog() {
        const el = document.getElementById('trips-container');
        if (!el) return;
        el.innerHTML = '<div class="loading">Loading…</div>';
        try {
            const { trips } = await api('/trips/logs');
            let html = `<div class="glass-card trip-start-form">
                <h3>Start or continue a trip</h3>
                <p class="hint-text">Reuse the same trip name to add photos to that album. Packed items appear first when tagging.</p>
                <input type="text" id="trip-log-name" class="form-input" placeholder="Trip name, e.g. Lisbon, April 2026">
                <input type="text" id="trip-log-destination" class="form-input" placeholder="Destination">
                <div class="trip-date-row">
                    <input type="date" id="trip-log-start" class="form-input" aria-label="Trip start">
                    <input type="date" id="trip-log-end" class="form-input" aria-label="Trip end">
                </div>
                <button type="button" class="btn btn-primary btn-sm" id="trip-log-start-btn">Add trip fit pic</button>
            </div>`;

            if (!trips.length) {
                html += '<div class="empty-state"><p>No trip albums yet. Add your first trip fit pic above.</p></div>';
            } else {
                html += trips
                    .map((t, tripIndex) => {
                        const key = String(tripIndex);
                        const isExpanded = tripsLogExpandedKey === key;
                        const cover = app().safeUrl(t.cover_image_path);
                        const postsHtml = isExpanded
                            ? `<div class="trip-album-posts">
                                <button type="button" class="btn btn-secondary btn-sm" data-trip-add-fit="${key}">Add another fit</button>
                                ${(t.posts || [])
                                    .map((post) => {
                                        const src = app().safeUrl(post.image_path);
                                        const id = Number(post.id);
                                        return `<button type="button" class="hub-row glass-card trip-album-post" data-trip-post="${id}">
                                            ${src ? `<img class="trip-fit-thumb" src="${src}" alt="">` : ''}
                                            <span class="hint-text">${esc(post.caption || post.created_at || 'Fit')}</span>
                                        </button>`;
                                    })
                                    .join('')}
                            </div>`
                            : '';
                        return `<article class="glass-card hub-row trip-album-card" data-trip-album-key="${key}">
                            <div class="trip-album-row">
                                ${cover ? `<img class="trip-cover trip-fit-thumb" src="${cover}" alt="">` : '<span class="trip-fit-thumb fits-grid-placeholder"></span>'}
                                <div style="flex:1">
                                    <h4>${esc(t.name)}</h4>
                                    <p class="hint-text">${esc([t.destination, tripDateLabel(t)].filter(Boolean).join(' · '))}</p>
                                    <p class="hint-text">${Number(t.post_count) || 0} fit pic${Number(t.post_count) === 1 ? '' : 's'}</p>
                                </div>
                                <span aria-hidden="true">${isExpanded ? '▲' : '▼'}</span>
                            </div>
                            ${postsHtml}
                        </article>`;
                    })
                    .join('');
            }
            el.innerHTML = html;

            document.getElementById('trip-log-start-btn')?.addEventListener('click', () => {
                const tripName =
                    document.getElementById('trip-log-name')?.value.trim() ||
                    defaultTripName(document.getElementById('trip-log-destination')?.value);
                if (!tripName) {
                    app().showToast('Name the trip or add a destination first', 'warning');
                    return;
                }
                openCreateFitWithTrip({
                    tripName,
                    tripDestination: document.getElementById('trip-log-destination')?.value.trim() || '',
                    tripStart: document.getElementById('trip-log-start')?.value || '',
                    tripEnd: document.getElementById('trip-log-end')?.value || '',
                    packedOnly: true,
                });
            });

            el.querySelectorAll('[data-trip-album-key]').forEach((card) => {
                card.addEventListener('click', (ev) => {
                    if (ev.target.closest('[data-trip-post]') || ev.target.closest('[data-trip-add-fit]')) return;
                    const key = card.dataset.tripAlbumKey;
                    tripsLogExpandedKey = tripsLogExpandedKey === key ? null : key;
                    loadTripsLog();
                });
            });

            el.querySelectorAll('[data-trip-post]').forEach((btn) => {
                btn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    openFitModal(Number(btn.dataset.tripPost));
                });
            });

            el.querySelectorAll('[data-trip-add-fit]').forEach((btn) => {
                btn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const log = trips[Number(btn.dataset.tripAddFit)];
                    if (!log) return;
                    openCreateFitWithTrip({
                        tripName: log.name,
                        tripDestination: log.destination || '',
                        tripStart: log.start_date || '',
                        tripEnd: log.end_date || '',
                        packedOnly: true,
                    });
                });
            });
        } catch (e) {
            el.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`;
        }
    }

    async function loadFriends() {
        const el = document.getElementById('friends-container');
        if (!el) return;
        el.innerHTML = '<div class="loading">Loading…</div>';
        try {
            const [{ friends }, reqData] = await Promise.all([
                api('/friends'),
                api('/friends/requests'),
            ]);
            const incoming = reqData.incoming || [];
            const outgoing = reqData.outgoing || [];
            let html = '<h3>Requests</h3>';
            if (!incoming.length && !outgoing.length) {
                html += '<p class="hint-text">No pending requests.</p>';
            } else {
                html += incoming
                    .map(
                        (r) => `<div class="hub-row glass-card">
                        <span>@${esc(r.user.username)} (incoming)</span>
                        <button type="button" class="btn btn-primary btn-sm" data-accept="${Number(r.friendship_id)}">Accept</button>
                        <button type="button" class="btn btn-secondary btn-sm" data-reject="${Number(r.friendship_id)}">Decline</button>
                    </div>`
                    )
                    .join('');
                html += outgoing
                    .map(
                        (r) => `<div class="hub-row glass-card"><span>@${esc(r.user.username)} (sent)</span></div>`
                    )
                    .join('');
            }
            html += '<h3>Friends</h3>';
            if (!friends.length) html += '<p class="hint-text">No friends yet. Search below to add someone.</p>';
            else {
                html += friends
                    .map(
                        (f) => `<div class="hub-row glass-card">
                        <span>${esc(f.full_name || f.username)} @${esc(f.username)}</span>
                        <div class="hub-row-actions">
                            <button type="button" class="btn btn-primary btn-sm" data-view-profile="${Number(f.id)}">View</button>
                            <button type="button" class="btn btn-secondary btn-sm" data-remove-friend="${Number(f.id)}">Remove</button>
                        </div>
                    </div>`
                    )
                    .join('');
            }
            html += `<div class="glass-card" style="margin-top:1rem">
                <label>Find user <input type="text" id="friend-search" class="form-input" placeholder="username"></label>
                <button type="button" class="btn btn-primary btn-sm" id="friend-search-btn">Search</button>
                <div id="friend-search-results"></div>
            </div>`;
            el.innerHTML = html;

            el.querySelectorAll('[data-accept]').forEach((b) => {
                b.addEventListener('click', async () => {
                    try {
                        await api(`/friends/requests/${b.dataset.accept}/accept`, { method: 'POST' });
                        app().showToast('Friend request accepted', 'success');
                        loadFriends();
                    } catch (e) {
                        toastError(e);
                    }
                });
            });
            el.querySelectorAll('[data-reject]').forEach((b) => {
                b.addEventListener('click', async () => {
                    try {
                        await api(`/friends/requests/${b.dataset.reject}/reject`, { method: 'POST' });
                        app().showToast('Request declined');
                        loadFriends();
                    } catch (e) {
                        toastError(e);
                    }
                });
            });
            el.querySelectorAll('[data-view-profile]').forEach((b) => {
                b.addEventListener('click', () => openPublicProfile(Number(b.dataset.viewProfile)));
            });
            el.querySelectorAll('[data-remove-friend]').forEach((b) => {
                b.addEventListener('click', async () => {
                    const ok = await showConfirmModal({
                        title: 'Remove friend?',
                        message: 'They will no longer appear in your friends list.',
                        confirmLabel: 'Remove',
                        danger: true,
                    });
                    if (!ok) return;
                    await api(`/friends/${b.dataset.removeFriend}`, { method: 'DELETE' });
                    loadFriends();
                });
            });
            document.getElementById('friend-search-btn').addEventListener('click', async () => {
                const q = document.getElementById('friend-search').value.trim();
                const box = document.getElementById('friend-search-results');
                if (!q) return;
                try {
                    const { users } = await api(`/users/search?q=${encodeURIComponent(q)}`);
                    box.innerHTML = users
                        .map(
                            (u) => `<div class="hub-row">
                            <span>@${esc(u.username)}</span>
                            <button type="button" class="btn btn-primary btn-sm" data-request="${Number(u.id)}">Add</button>
                        </div>`
                        )
                        .join('');
                    box.querySelectorAll('[data-request]').forEach((btn) => {
                        btn.addEventListener('click', async () => {
                            await api('/friends/requests', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ user_id: Number(btn.dataset.request) }),
                            });
                            app().showToast('Request sent');
                        });
                    });
                } catch (e) {
                    box.innerHTML = `<p>${esc(e.message)}</p>`;
                }
            });
        } catch (e) {
            el.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`;
        }
    }

    async function loadSettings() {
        const el = document.getElementById('settings-container');
        if (!el) return;
        try {
            const settings = await api('/settings');
            const weatherOn = localStorage.getItem(WEATHER_KEY) === '1';
            const socialOn = settings.social_enabled !== false;
            const theme = settings.theme_preference || 'light';
            el.innerHTML = `
                <div class="glass-card settings-block">
                    <h3>Appearance</h3>
                    <label class="form-group">Theme
                        <select id="settings-theme" class="form-input">
                            <option value="light" ${theme === 'light' ? 'selected' : ''}>Light</option>
                            <option value="dark" ${theme === 'dark' ? 'selected' : ''}>Dark</option>
                            <option value="system" ${theme === 'system' ? 'selected' : ''}>System</option>
                        </select>
                    </label>
                </div>
                <div class="glass-card settings-block">
                    <h3>Social features</h3>
                    <label class="toggle-row"><input type="checkbox" id="settings-social" ${socialOn ? 'checked' : ''}><span>Show feed, friends, and fits</span></label>
                </div>
                <div class="glass-card settings-block">
                    <h3>Weather for outfits</h3>
                    <label class="toggle-row"><input type="checkbox" id="settings-weather" ${weatherOn ? 'checked' : ''}><span>Use my location for weather-aware outfits</span></label>
                </div>
                <div class="glass-card settings-block">
                    <h3>Closet browsing</h3>
                    <p class="hint-text">Density: <strong id="settings-density-label">${esc(DENSITY_LABELS[readClosetDensity()] || 'Comfy')}</strong></p>
                    <button type="button" class="btn btn-secondary btn-sm" id="settings-cycle-density">Cycle density</button>
                    <p class="hint-text" style="margin-top:0.75rem">Layout: <strong id="settings-layout-label">${readClosetLayout() === 'rails' ? 'Rails' : 'Grid'}</strong></p>
                    <button type="button" class="btn btn-secondary btn-sm" id="settings-toggle-layout">Toggle layout</button>
                </div>
                <div class="glass-card settings-block">
                    <h3>Default closet location</h3>
                    <select id="settings-default-location" class="form-input">
                        <option value="">None</option>
                        ${(settings.closet_locations || [])
                            .map(
                                (l) =>
                                    `<option value="${Number(l.id)}" ${settings.default_closet_location_id === l.id ? 'selected' : ''}>${esc(l.name)}</option>`
                            )
                            .join('')}
                    </select>
                </div>
                <div class="glass-card settings-block">
                    <h3>Closet locations</h3>
                    <div id="locations-list"></div>
                    <button type="button" class="btn btn-secondary btn-sm" id="location-add-btn">Add location</button>
                </div>
                <div class="glass-card settings-block">
                    <h3>Account</h3>
                    <p class="hint-text">Mode: ${esc(settings.app_mode || 'normal')}</p>
                    <form id="change-password-form" class="change-password-form">
                        <label class="form-group">Current password<input type="password" id="change-password-current" class="form-input" autocomplete="current-password" required></label>
                        <label class="form-group">New password<input type="password" id="change-password-new" class="form-input" autocomplete="new-password" required minlength="10"></label>
                        <label class="form-group">Confirm new password<input type="password" id="change-password-confirm" class="form-input" autocomplete="new-password" required minlength="10"></label>
                        <button type="submit" class="btn btn-secondary btn-sm">Change password</button>
                    </form>
                    <button type="button" class="btn btn-danger btn-sm" id="logout-all-btn">Sign out everywhere</button>
                </div>
            `;
            document.getElementById('settings-theme')?.addEventListener('change', async (e) => {
                const theme_preference = e.target.value;
                try {
                    await api('/settings', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ theme_preference }),
                    });
                    app().applyThemePreference(theme_preference);
                    app().showToast('Theme saved');
                } catch (err) {
                    toastError(err);
                }
            });
            document.getElementById('settings-social').addEventListener('change', async (e) => {
                try {
                    await api('/settings', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ social_enabled: e.target.checked }),
                    });
                    await app().refreshCurrentUser();
                    app().updateUserDisplay();
                    applySocialNav();
                    app().showToast('Settings saved');
                } catch (err) {
                    toastError(err);
                    e.target.checked = !e.target.checked;
                }
            });
            document.getElementById('settings-weather').addEventListener('change', (e) => {
                localStorage.setItem(WEATHER_KEY, e.target.checked ? '1' : '0');
                const toggle = document.getElementById('weather-sync-toggle');
                if (toggle) toggle.checked = e.target.checked;
            });
            document.getElementById('settings-default-location').addEventListener('change', async (e) => {
                const val = e.target.value ? Number(e.target.value) : null;
                try {
                    await api('/settings', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ default_closet_location_id: val }),
                    });
                    app().showToast('Default location saved');
                } catch (err) {
                    toastError(err);
                }
            });
            document.getElementById('settings-cycle-density')?.addEventListener('click', () => {
                if (typeof cycleClosetDensity === 'function') cycleClosetDensity();
                const label = document.getElementById('settings-density-label');
                if (label && typeof readClosetDensity === 'function') {
                    label.textContent = DENSITY_LABELS[readClosetDensity()] || 'Comfy';
                }
            });
            document.getElementById('settings-toggle-layout')?.addEventListener('click', () => {
                if (typeof toggleClosetLayout === 'function') toggleClosetLayout();
                const label = document.getElementById('settings-layout-label');
                if (label && typeof readClosetLayout === 'function') {
                    label.textContent = readClosetLayout() === 'rails' ? 'Rails' : 'Grid';
                }
            });
            document.getElementById('logout-all-btn').addEventListener('click', async () => {
                const ok = await showConfirmModal({
                    title: 'Sign out everywhere?',
                    message: 'This will revoke sessions on all devices.',
                    confirmLabel: 'Sign out',
                    danger: true,
                });
                if (!ok) return;
                await api('/auth/logout-all', { method: 'POST' });
                localStorage.removeItem('access_token');
                window.location.href = '/frontend/login.html';
            });
            document.getElementById('change-password-form')?.addEventListener('submit', async (ev) => {
                ev.preventDefault();
                const current = document.getElementById('change-password-current')?.value || '';
                const next = document.getElementById('change-password-new')?.value || '';
                const confirmPw = document.getElementById('change-password-confirm')?.value || '';
                if (next !== confirmPw) {
                    app().showToast('New passwords do not match', 'error');
                    return;
                }
                try {
                    const data = await api('/auth/change-password', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ current_password: current, new_password: next }),
                    });
                    if (data.access_token) {
                        localStorage.setItem('access_token', data.access_token);
                        await app().refreshCurrentUser();
                    }
                    ev.target.reset();
                    app().showToast('Password updated');
                } catch (err) {
                    toastError(err);
                }
            });
            await renderLocations(settings.closet_locations || [], settings.default_closet_location_id);
            const addLoc = document.getElementById('location-add-btn');
            if (addLoc && !addLoc.dataset.bound) {
                addLoc.dataset.bound = '1';
                addLoc.addEventListener('click', () => {
                    document.getElementById('location-form-name').value = '';
                    document.getElementById('location-form-kind').value = 'other';
                    app().openAppModal('location-form-modal');
                });
            }
            if (!document.getElementById('location-form')?.dataset.bound) {
                const locForm = document.getElementById('location-form');
                if (locForm) {
                    locForm.dataset.bound = '1';
                    locForm.addEventListener('submit', async (ev) => {
                        ev.preventDefault();
                        const name = document.getElementById('location-form-name')?.value.trim();
                        if (!name) return;
                        const kind = document.getElementById('location-form-kind')?.value || 'other';
                        try {
                            await api('/closet/locations', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name, kind }),
                            });
                            app().closeAppModal('location-form-modal');
                            app().showToast('Location added');
                            loadSettings();
                        } catch (err) {
                            toastError(err);
                        }
                    });
                    document.querySelectorAll('.location-form-close').forEach((el) => {
                        el.addEventListener('click', () => app().closeAppModal('location-form-modal'));
                    });
                }
            }
        } catch (e) {
            el.innerHTML = `<p>${esc(e.message)}</p>`;
        }
    }

    async function renderLocations(locations, defaultId) {
        const list = document.getElementById('locations-list');
        if (!list) return;
        if (!locations.length) {
            list.innerHTML = '<p class="hint-text">No extra locations.</p>';
            return;
        }
        list.innerHTML = locations
            .map((loc) => {
                const id = Number(loc.id);
                const isDefault = defaultId === id;
                return `<div class="hub-row">
                <span>${esc(loc.name)}${loc.kind ? ` <span class="hint-text">(${esc(loc.kind)})</span>` : ''}${isDefault ? ' · default' : ''}</span>
                <div class="hub-row-actions">
                    ${isDefault ? '' : `<button type="button" class="btn btn-secondary btn-sm" data-default-loc="${id}">Set default</button>`}
                    <button type="button" class="btn btn-secondary btn-sm" data-del-loc="${id}">Delete</button>
                </div>
            </div>`;
            })
            .join('');
        list.querySelectorAll('[data-default-loc]').forEach((b) => {
            b.addEventListener('click', async () => {
                await api('/settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ default_closet_location_id: Number(b.dataset.defaultLoc) }),
                });
                loadSettings();
            });
        });
        list.querySelectorAll('[data-del-loc]').forEach((b) => {
            b.addEventListener('click', async () => {
                const ok = await showConfirmModal({
                    title: 'Delete location?',
                    message: 'Items in this location will keep their data but lose this label.',
                    confirmLabel: 'Delete',
                    danger: true,
                });
                if (!ok) return;
                await api(`/closet/locations/${b.dataset.delLoc}`, { method: 'DELETE' });
                loadSettings();
            });
        });
    }

    async function initCreateFit(opts = {}) {
        const picker = document.getElementById('create-fit-picker');
        if (!picker) return;
        if (opts.tripName != null || opts.tripDestination != null) {
            prefillCreateFitTripFields(opts);
        }
        createFitTagged.clear();
        picker.innerHTML = '<div class="loading">Loading closet…</div>';
        try {
            const { items } = await api('/closet');
            let owned = items.filter((i) => i.status !== 'wishlist');
            if (opts.packedOnly) {
                owned = owned.slice().sort((a, b) => {
                    const ap = a.packed_for_trip ? 1 : 0;
                    const bp = b.packed_for_trip ? 1 : 0;
                    return bp - ap;
                });
            }
            if (!owned.length) {
                picker.innerHTML = '<p class="hint-text">Add items to your closet first.</p>';
                return;
            }
            picker.innerHTML = owned
                .map((item) => {
                    const id = Number(item.id);
                    const thumb = img(item);
                    const packedBadge = item.packed_for_trip ? ' · packed' : '';
                    return `<button type="button" class="fit-tag-chip" data-fit-tag="${id}">
                        ${thumb ? `<img src="${thumb}" alt="">` : ''}
                        <span>${esc(item.subcategory)}${packedBadge}</span>
                    </button>`;
                })
                .join('');
            picker.querySelectorAll('[data-fit-tag]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const id = Number(btn.dataset.fitTag);
                    if (createFitTagged.has(id)) {
                        createFitTagged.delete(id);
                        btn.classList.remove('active');
                    } else {
                        createFitTagged.add(id);
                        btn.classList.add('active');
                    }
                });
            });
            createFitClosetLoaded = true;
        } catch (e) {
            picker.innerHTML = `<p class="hint-text">${esc(e.message)}</p>`;
        }
    }

    function initCreateFitPhotoPreview() {
        const input = document.getElementById('fit-photo-input');
        const preview = document.getElementById('fit-photo-preview');
        if (!input || !preview) return;
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (!file) {
                preview.classList.add('hidden');
                preview.innerHTML = '';
                return;
            }
            const url = URL.createObjectURL(file);
            preview.innerHTML = `<img src="${url}" alt="Preview">`;
            preview.classList.remove('hidden');
        });
    }

    async function submitCreateFit(ev) {
        ev.preventDefault();
        const fileInput = document.getElementById('fit-photo-input');
        const caption = document.getElementById('fit-caption-input').value.trim();
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        const form = new FormData();
        form.append('file', file);
        if (caption) form.append('caption', caption);
        if (createFitTagged.size) {
            form.append('item_ids', [...createFitTagged].join(','));
        }
        const tripName = document.getElementById('fit-trip-name')?.value.trim();
        const tripDest = document.getElementById('fit-trip-destination')?.value.trim();
        const tripStart = document.getElementById('fit-trip-start')?.value.trim();
        const tripEnd = document.getElementById('fit-trip-end')?.value.trim();
        if (tripName) form.append('trip_name', tripName);
        if (tripDest) form.append('trip_destination', tripDest);
        if (tripStart) form.append('trip_start', tripStart);
        if (tripEnd) form.append('trip_end', tripEnd);
        try {
            await api('/fits', { method: 'POST', body: form });
            app().showToast('Fit posted');
            ev.target.reset();
            createFitTagged.clear();
            document.getElementById('fit-photo-preview')?.classList.add('hidden');
            document.querySelectorAll('.fit-tag-chip.active').forEach((c) => c.classList.remove('active'));
            app().showTab(socialEnabled() ? 'feed' : 'profile');
            loadFeed();
            loadProfileHub();
            loadOnboardingBanner();
        } catch (e) {
            toastError(e);
        }
    }

    async function loadOnboardingBanner() {
        const banner = document.getElementById('onboarding-banner');
        if (!banner || localStorage.getItem('closet_web_onboarding_dismissed') === '1') return;
        const u = app()?.currentUser;
        if (!u) return;
        try {
            const [stats, postsRes] = await Promise.all([
                api('/stats'),
                api(`/users/${u.id}/posts`),
            ]);
            const check = {
                hasItem: (stats.total_items || 0) >= 1,
                openedDetail: localStorage.getItem('closet_web_item_detail_visited') === '1',
                hasSavedFit: (postsRes.posts || []).length >= 1,
            };
            const steps = [
                { label: 'Add your first item', done: check.hasItem, tab: 'upload' },
                { label: 'Open an item', done: check.openedDetail, tab: 'closet' },
                { label: 'Post your first fit', done: check.hasSavedFit, tab: 'create-fit' },
            ];
            const doneCount = steps.filter((s) => s.done).length;
            if (doneCount >= steps.length) {
                banner.classList.add('hidden');
                return;
            }
            banner.classList.remove('hidden');
            banner.innerHTML = `
                <div class="onboarding-banner-inner glass-card">
                    <div class="onboarding-banner-head">
                        <strong>Get started (${doneCount}/${steps.length})</strong>
                        <button type="button" class="btn btn-secondary btn-sm" id="onboarding-dismiss">Dismiss</button>
                    </div>
                    <ul class="onboarding-steps">
                        ${steps
                            .map(
                                (s) =>
                                    `<li class="${s.done ? 'done' : ''}"><button type="button" class="onboarding-step-btn" data-onboard-tab="${esc(s.tab)}" ${s.done ? 'disabled' : ''}>${s.done ? '✓' : '○'} ${esc(s.label)}</button></li>`
                            )
                            .join('')}
                    </ul>
                </div>`;
            document.getElementById('onboarding-dismiss')?.addEventListener('click', () => {
                localStorage.setItem('closet_web_onboarding_dismissed', '1');
                banner.classList.add('hidden');
            });
            banner.querySelectorAll('[data-onboard-tab]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    if (btn.disabled) return;
                    app().showTab(btn.dataset.onboardTab);
                });
            });
        } catch {
            banner.classList.add('hidden');
        }
    }

    function initFitCheck() {
        const btn = document.getElementById('fit-check-btn');
        const input = document.getElementById('fit-check-input');
        const results = document.getElementById('fit-check-results');
        if (!btn || !input) return;
        btn.addEventListener('click', () => input.click());
        input.addEventListener('change', async () => {
            const file = input.files && input.files[0];
            input.value = '';
            if (!file) return;
            const form = new FormData();
            form.append('file', file);
            if (results) {
                results.classList.remove('hidden');
                results.innerHTML = '<p class="hint-text">Analyzing pairings…</p>';
            }
            try {
                const data = await api('/closet/fit-check', { method: 'POST', body: form });
                const pairs = data.pairings || [];
                if (!pairs.length) {
                    if (results) results.innerHTML = '<p class="hint-text">No strong pairings found.</p>';
                    return;
                }
                const html =
                    '<h3>Fit check results</h3>' +
                    pairs
                        .slice(0, 8)
                        .map((p) => {
                            const it = p.item;
                            const thumb = it ? img(it) : '';
                            const hints = (p.hints || []).join(', ');
                            return `<article class="hub-row glass-card fit-check-row">
                                ${thumb ? `<img class="hub-row-thumb" src="${thumb}" alt="">` : ''}
                                <div><strong>${esc(it?.subcategory || 'Item')}</strong><p class="hint-text">${esc(hints)}</p></div>
                            </article>`;
                        })
                        .join('');
                if (results) results.innerHTML = html;
            } catch (e) {
                if (results) results.innerHTML = `<p class="warn-text">${esc(e.message)}</p>`;
            }
        });
    }

    function initAvatarUpload() {
        const btn = document.getElementById('profile-avatar-btn');
        const input = document.getElementById('avatar-input');
        if (!btn || !input) return;
        btn.addEventListener('click', () => input.click());
        input.addEventListener('change', async () => {
            const file = input.files && input.files[0];
            input.value = '';
            if (!file) return;
            const form = new FormData();
            form.append('file', file);
            try {
                await api('/auth/avatar', { method: 'POST', body: form });
                app().showToast('Avatar updated');
                await app().refreshCurrentUser();
                app().updateUserDisplay();
                loadProfileHub();
            } catch (e) {
                toastError(e);
            }
        });
    }

    function initProfileEditToggle() {
        const toggle = document.getElementById('profile-edit-toggle');
        const form = document.getElementById('profile-form');
        if (!toggle || !form) return;
        toggle.addEventListener('click', () => {
            form.classList.toggle('hidden');
        });
    }

    function openShortcutsModal() {
        const modal = document.getElementById('shortcuts-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.classList.add('active');
    }

    function closeShortcutsModal() {
        const modal = document.getElementById('shortcuts-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('active');
    }

    function isTypingTarget(target) {
        const tag = target?.tagName || '';
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;
    }

    function initKeyboardShortcuts() {
        document.getElementById('shortcuts-help-btn')?.addEventListener('click', openShortcutsModal);
        document.querySelectorAll('.shortcuts-modal-close').forEach((el) => {
            el.addEventListener('click', closeShortcutsModal);
        });
        document.getElementById('shortcuts-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'shortcuts-modal') closeShortcutsModal();
        });
        document.addEventListener('keydown', (ev) => {
            if (isTypingTarget(ev.target)) return;
            if (ev.key === '?' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
                ev.preventDefault();
                const modal = document.getElementById('shortcuts-modal');
                if (modal?.classList.contains('hidden')) openShortcutsModal();
                else closeShortcutsModal();
            }
            if (ev.key === '/' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
                const search = document.getElementById('closet-search');
                if (search) {
                    ev.preventDefault();
                    app().showTab('closet');
                    search.focus();
                }
            }
        });
    }

    const TAB_LOADERS = {
        feed: loadFeed,
        wishlist: loadWishlist,
        pack: loadPackMode,
        planning: () => loadPlanning(),
        trips: loadTripsLog,
        friends: loadFriends,
        settings: loadSettings,
        'create-fit': (opts) => initCreateFit(opts || {}),
        profile: loadProfileHub,
    };

    window.ClosetFeatures = {
        applySocialNav,
        openFitModal,
        openPublicProfile,
        loadFeed,
        loadOnboardingBanner,
        init() {
            bindHubNavigation();
            initFitCheck();
            initAvatarUpload();
            initProfileEditToggle();
            initCreateFitPhotoPreview();
            initWishlistForm();
            initWishlistPhotoPreview('wishlist-photos-input', 'wishlist-photo-preview');
            initWishlistPhotoPreview('upload-wish-photos', 'upload-wish-photo-preview');
            initConfirmModal();
            initKeyboardShortcuts();
            applySocialNav();

            document.getElementById('pack-new-trip-btn')?.addEventListener('click', () => openTripFormModal(null));
            document.getElementById('pack-edit-trip-btn')?.addEventListener('click', editActiveTrip);
            document.getElementById('trip-form-modal-form')?.addEventListener('submit', submitTripFormModal);
            document.querySelectorAll('.trip-form-modal-close').forEach((el) => {
                el.addEventListener('click', closeTripFormModal);
            });
            document.getElementById('trip-form-modal')?.addEventListener('click', (e) => {
                if (e.target.id === 'trip-form-modal') closeTripFormModal();
            });
            const fitForm = document.getElementById('create-fit-form');
            if (fitForm) fitForm.addEventListener('submit', submitCreateFit);

            document.querySelectorAll('.fit-modal-close').forEach((el) => {
                el.addEventListener('click', closeFitModal);
            });
            document.getElementById('fit-modal')?.addEventListener('click', (e) => {
                if (e.target.id === 'fit-modal') closeFitModal();
            });

            const weatherSaved = localStorage.getItem(WEATHER_KEY) === '1';
            const wToggle = document.getElementById('weather-sync-toggle');
            if (wToggle) {
                wToggle.checked = weatherSaved;
                wToggle.addEventListener('change', () => {
                    localStorage.setItem(WEATHER_KEY, wToggle.checked ? '1' : '0');
                    window.ClosetUpgrade?.updateOutfitsOptionsCaptions?.();
                });
            }

            document.querySelectorAll('.public-profile-close').forEach((el) => {
                el.addEventListener('click', closePublicProfileModal);
            });
            document.getElementById('public-profile-modal')?.addEventListener('click', (e) => {
                if (e.target.id === 'public-profile-modal') closePublicProfileModal();
            });
        },
        onTabShown(tab, options) {
            if (tab === 'wishlist') {
                if (options?.wishlistPrefill) applyWishlistPrefill(options.wishlistPrefill);
                loadWishlist();
            } else if (TAB_LOADERS[tab]) {
                TAB_LOADERS[tab](options?.pinItemId ?? options);
            }
        },
        applyWishlistPrefill,
        uploadWishlistPhotos,
        createWishlistItem,
        loadPackMode,
        loadPlanning,
        loadProfileHub,
        openTripFormModal,
        editActiveTrip,
        loadOutfitsPlannedPreview: async function loadOutfitsPlannedPreview() {
            const el = document.getElementById('outfits-planned-list');
            if (!el) return;
            try {
                const { plans } = await api('/planned-outfits?include_past=false');
                if (!plans.length) {
                    el.innerHTML =
                        '<div class="empty-state empty-state--compact"><p>No upcoming plans.</p><button type="button" class="btn btn-secondary btn-sm" data-goto-planning>Plan your first look</button></div>';
                    el.querySelector('[data-goto-planning]')?.addEventListener('click', () =>
                        app().showTab('planning')
                    );
                    return;
                }
                el.innerHTML = plans
                    .slice(0, 8)
                    .map((p) => {
                        const id = Number(p.id);
                        const thumbs = (p.items || [])
                            .map((i) => {
                                const s = img(i);
                                return s ? `<img class="plan-thumb" src="${s}" alt="">` : '';
                            })
                            .join('');
                        const conflicts =
                            p.conflicts?.length
                                ? `<p class="warn-text planned-conflict">${esc(p.conflicts.map((c) => c.message).join('; '))}</p>`
                                : '';
                        return `<article class="planned-card glass-card" data-plan-id="${id}">
                            <div class="planned-card-head">
                                <input type="text" class="form-input planned-title-input" value="${esc(p.title)}" maxlength="120" aria-label="Plan title">
                                <input type="date" class="form-input planned-date-input" value="${esc(p.planned_for)}" aria-label="Plan date">
                            </div>
                            <p class="hint-text">${esc(p.status)}${p.occasion ? ` · ${esc(p.occasion)}` : ''}</p>
                            <TAGX class="plan-thumbs">${thumbs}</TAGX>
                            ${conflicts}
                            <div class="planned-card-actions">
                                <button type="button" class="btn btn-primary btn-sm" data-save-plan="${id}">Save</button>
                                <button type="button" class="btn btn-secondary btn-sm" data-edit-plan-items="${id}">Edit items</button>
                                <button type="button" class="btn btn-secondary btn-sm" data-delete-plan="${id}">Delete</button>
                            </div>
                        </article>`;
                    })
                    .join('')
                    .replace(/TAGX/g, 'div');
                el.querySelectorAll('[data-save-plan]').forEach((btn) => {
                    btn.addEventListener('click', async () => {
                        const card = btn.closest('.planned-card');
                        const planId = Number(btn.dataset.savePlan);
                        const title = card?.querySelector('.planned-title-input')?.value.trim();
                        const planned_for = card?.querySelector('.planned-date-input')?.value;
                        if (!title || !planned_for) {
                            app().showToast('Title and date are required');
                            return;
                        }
                        try {
                            await api(`/planned-outfits/${planId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ title, planned_for }),
                            });
                            app().showToast('Plan updated');
                            window.ClosetFeatures.loadOutfitsPlannedPreview();
                        } catch (e) {
                            app().showToast(e.message || 'Could not save plan');
                        }
                    });
                });
                el.querySelectorAll('[data-edit-plan-items]').forEach((btn) => {
                    btn.addEventListener('click', async () => {
                        const planId = Number(btn.dataset.editPlanItems);
                        try {
                            const plan = await api(`/planned-outfits/${planId}`);
                            const ids = (plan.items || []).map((i) => Number(i.id)).filter(Boolean);
                            app().showTab('planning');
                            loadPlanning(ids);
                        } catch (e) {
                            app().showToast(e.message || 'Could not open plan');
                        }
                    });
                });
                el.querySelectorAll('[data-delete-plan]').forEach((btn) => {
                    btn.addEventListener('click', async () => {
                        const ok = await showConfirmModal({
                            title: 'Delete plan?',
                            message: 'This planned outfit will be removed.',
                            confirmLabel: 'Delete',
                            danger: true,
                        });
                        if (!ok) return;
                        try {
                            await api(`/planned-outfits/${btn.dataset.deletePlan}`, { method: 'DELETE' });
                            app().showToast('Plan deleted');
                            window.ClosetFeatures.loadOutfitsPlannedPreview();
                        } catch (e) {
                            app().showToast(e.message || 'Could not delete plan');
                        }
                    });
                });
            } catch {
                el.innerHTML = '<p class="hint-text">Could not load plans.</p>';
            }
        },
        planWithItem(itemId) {
            app().showTab('planning');
            loadPlanning(itemId);
        },
        planWithOutfitItems(itemIds) {
            app().showTab('planning');
            loadPlanning(itemIds);
        },
        getWeatherCoords() {
            return new Promise((resolve, reject) => {
                if (!navigator.geolocation) {
                    reject(new Error('Geolocation not supported'));
                    return;
                }
                navigator.geolocation.getCurrentPosition(
                    (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
                    () => reject(new Error('Location permission denied')),
                    { timeout: 12000 }
                );
            });
        },
        isWeatherSyncEnabled() {
            const el = document.getElementById('weather-sync-toggle');
            return el ? el.checked : localStorage.getItem(WEATHER_KEY) === '1';
        },
    };
})();
