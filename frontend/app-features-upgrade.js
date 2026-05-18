/**
 * Second-wave web parity: AI stylist, visual search, rich fits, insights, pack/planning.
 */
(function () {
    const REACTIONS = ['🔥', '❤️', '👏', '🧊', '✨', '👀'];
    const AI_STYLIST_KEY = 'closet_web_ai_stylist';
    let stylistPinItemId = null;
    let stylistGroundingItems = [];

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

    function syncOutfitsAiFilterMode() {
        const enabled = localStorage.getItem(AI_STYLIST_KEY) !== '0';
        const filtersPanel = document.getElementById('outfit-filters-panel');
        const tab = document.getElementById('outfits-tab');
        if (filtersPanel) {
            filtersPanel.classList.toggle('outfit-filters-panel--hidden', enabled);
        }
        tab?.classList.toggle('outfits-tab--ai-mode', enabled);
    }

    function renderStylistPinChips() {
        const row = document.getElementById('ai-stylist-pin-chips');
        if (!row) return;
        if (!stylistGroundingItems.length) {
            row.innerHTML = '';
            row.classList.add('hidden');
            return;
        }
        row.classList.remove('hidden');
        const chips = [
            `<button type="button" class="stylist-pin-chip${stylistPinItemId == null ? ' active' : ''}" data-pin-id="">No specific item</button>`,
            ...stylistGroundingItems.map((item) => {
                const id = Number(item.id);
                const u = img(item);
                const active = stylistPinItemId === id ? ' active' : '';
                const thumb = u
                    ? `<img class="stylist-pin-thumb" src="${u}" alt="">`
                    : '<span class="stylist-pin-thumb stylist-pin-thumb--empty"></span>';
                return `<button type="button" class="stylist-pin-chip${active}" data-pin-id="${id}" title="${esc(item.subcategory)}">${thumb}<span>${esc(item.subcategory)}</span></button>`;
            }),
        ];
        row.innerHTML = chips.join('');
        row.querySelectorAll('.stylist-pin-chip').forEach((btn) => {
            btn.addEventListener('click', () => {
                const raw = btn.dataset.pinId;
                stylistPinItemId = raw ? Number(raw) : null;
                renderStylistPinChips();
            });
        });
    }

    function updateOutfitsOptionsCaptions() {
        const weatherCaption = document.getElementById('outfits-options-weather-caption');
        const aiCaption = document.getElementById('outfits-options-ai-caption');
        const weatherOn = document.getElementById('weather-sync-toggle')?.checked;
        const aiOn = document.getElementById('ai-stylist-enabled')?.checked;
        if (weatherCaption) {
            weatherCaption.textContent = weatherOn
                ? 'On — forecast loads with your next suggestion.'
                : 'Off — suggestions ignore the forecast.';
        }
        if (aiCaption) {
            aiCaption.textContent = aiOn
                ? 'Stylist replaces occasion / season / vibe filters on the main screen.'
                : 'Classic filters and scored outfits on the main screen.';
        }
    }

    function syncOutfitsOptionsFromSidebar() {
        const weatherMain = document.getElementById('weather-sync-toggle');
        const weatherSheet = document.getElementById('outfits-options-weather');
        const aiMain = document.getElementById('ai-stylist-enabled');
        const aiSheet = document.getElementById('outfits-options-ai');
        if (weatherSheet && weatherMain) weatherSheet.checked = weatherMain.checked;
        if (aiSheet && aiMain) aiSheet.checked = aiMain.checked;
        updateOutfitsOptionsCaptions();
    }

    function openOutfitsOptionsSheet() {
        const sheet = document.getElementById('outfits-options-sheet');
        if (!sheet) return;
        syncOutfitsOptionsFromSidebar();
        sheet.classList.remove('hidden');
        sheet.classList.add('active');
        sheet.setAttribute('aria-hidden', 'false');
        document.body.classList.add('bottom-sheet-open');
    }

    function closeOutfitsOptionsSheet() {
        const sheet = document.getElementById('outfits-options-sheet');
        if (!sheet) return;
        sheet.classList.add('hidden');
        sheet.classList.remove('active');
        sheet.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('bottom-sheet-open');
    }

    function initOutfitsOptionsSheet() {
        const openBtn = document.getElementById('outfits-options-open');
        if (!openBtn || openBtn.dataset.bound) return;
        openBtn.dataset.bound = '1';

        document.getElementById('outfits-options-close')?.addEventListener('click', closeOutfitsOptionsSheet);
        document.getElementById('outfits-options-backdrop')?.addEventListener('click', closeOutfitsOptionsSheet);

        document.getElementById('outfits-options-weather')?.addEventListener('change', (e) => {
            const on = e.target.checked;
            const main = document.getElementById('weather-sync-toggle');
            if (main) {
                main.checked = on;
                main.dispatchEvent(new Event('change', { bubbles: true }));
            }
            updateOutfitsOptionsCaptions();
        });

        document.getElementById('outfits-options-ai')?.addEventListener('change', (e) => {
            const on = e.target.checked;
            const main = document.getElementById('ai-stylist-enabled');
            if (main) {
                main.checked = on;
                main.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                localStorage.setItem(AI_STYLIST_KEY, on ? '1' : '0');
                syncOutfitsAiFilterMode();
            }
            updateOutfitsOptionsCaptions();
        });

        openBtn.addEventListener('click', openOutfitsOptionsSheet);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.getElementById('outfits-options-sheet')?.classList.contains('active')) {
                closeOutfitsOptionsSheet();
            }
        });
    }

    function initAiStylist() {
        const panel = document.getElementById('ai-stylist-panel');
        if (!panel) return;
        const enabled = localStorage.getItem(AI_STYLIST_KEY) !== '0';
        panel.innerHTML = `
            <div class="ai-stylist-card-head">
                <h3>AI Stylist</h3>
                <p>Describe the occasion, weather, or mood — we only use items in your closet.</p>
            </div>
            <label class="toggle-row ai-stylist-toggle-row ai-stylist-toggle">
                <input type="checkbox" id="ai-stylist-enabled" ${enabled ? 'checked' : ''}>
                <span>Enable stylist</span>
            </label>
            <div id="ai-stylist-body" class="ai-stylist-compose-wrap ai-stylist-body ${enabled ? '' : 'hidden'}">
                <textarea id="ai-stylist-input" class="form-input" rows="3" maxlength="500" placeholder="e.g. Casual Friday in the office, rainy and cool…"></textarea>
                <p class="ai-stylist-pin-label">Optional: pin one item</p>
                <div id="ai-stylist-pin-chips" class="stylist-pin-chips hidden" role="group" aria-label="Pin item for stylist"></div>
                <button type="button" class="btn btn-primary" id="ai-stylist-submit">Get outfit ideas</button>
                <div id="ai-stylist-results" class="ai-stylist-results"></div>
            </div>
        `.replace(/div/g, 'div');
        const toggle = document.getElementById('ai-stylist-enabled');
        const body = document.getElementById('ai-stylist-body');
        toggle?.addEventListener('change', () => {
            const on = toggle.checked;
            localStorage.setItem(AI_STYLIST_KEY, on ? '1' : '0');
            body?.classList.toggle('hidden', !on);
            syncOutfitsAiFilterMode();
            const sheetAi = document.getElementById('outfits-options-ai');
            if (sheetAi) sheetAi.checked = on;
            updateOutfitsOptionsCaptions();
        });
        document.getElementById('ai-stylist-submit')?.addEventListener('click', runAiStylist);
        document.getElementById('ai-stylist-input')?.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                runAiStylist();
            }
        });
        syncOutfitsAiFilterMode();
        populateAiStylistPinOptions();
    }

    async function populateAiStylistPinOptions() {
        try {
            const { items } = await api('/closet');
            stylistGroundingItems = items
                .filter((i) => i.status !== 'wishlist' && !i.lent_to && i.washed !== false)
                .slice(0, 16);
            renderStylistPinChips();
        } catch {
            stylistGroundingItems = [];
        }
    }

    async function runAiStylist() {
        const input = document.getElementById('ai-stylist-input');
        const out = document.getElementById('ai-stylist-results');
        if (!input || !out) return;
        const message = input.value.trim();
        if (!message) return;
        out.innerHTML = '<p class="hint-text">Thinking…</p>';
        const payload = {
            message,
        };
        const locSel = document.getElementById('outfits-location-filter') || document.getElementById('closet-location-filter');
        if (locSel?.value) payload.closet_location_id = Number(locSel.value);
        if (stylistPinItemId) payload.pin_item_ids = [stylistPinItemId];
        const outfitSource =
            document.querySelector('input[name="outfit-source"]:checked')?.value || 'home';
        try {
            const closetData = await api('/closet');
            let scoped = (closetData.items || []).filter(
                (item) => !item.lent_to && item.washed !== false && item.status !== 'wishlist'
            );
            const locId = payload.closet_location_id;
            if (locId) scoped = scoped.filter((item) => item.closet_location_id === locId);
            const packedIds = scoped.filter((item) => item.packed_for_trip).map((item) => item.id);
            const homeIds = scoped.filter((item) => !item.packed_for_trip).map((item) => item.id);
            if (outfitSource === 'packed') {
                payload.include_packed = true;
                if (homeIds.length) payload.exclude_item_ids = homeIds;
            } else if (packedIds.length) {
                payload.exclude_item_ids = packedIds;
            }
        } catch {
            /* optional pool split */
        }
        if (window.ClosetFeatures?.isWeatherSyncEnabled?.()) {
            try {
                const { lat, lon } = await window.ClosetFeatures.getWeatherCoords();
                payload.lat = lat;
                payload.lon = lon;
            } catch {
                /* optional */
            }
        }
        try {
            const data = await api('/ai-stylist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!data.suggestions?.length) {
                out.innerHTML = '<p class="hint-text">No suggestions — try rephrasing.</p>';
                return;
            }
            out.innerHTML = data.suggestions
                .map((s, i) => {
                    const thumbs = (s.outfit?.items || [])
                        .map((it) => {
                            const u = img(it);
                            return u ? `<img class="plan-thumb" src="${u}" alt="">` : '';
                        })
                        .join('');
                    return `<article class="glass-card hub-row ai-suggestion" data-sig="${esc(s.signature)}">
                        <h4>${esc(s.title || `Look ${i + 1}`)}</h4>
                        <p class="hint-text">${esc(s.rationale || '')}</p>
                        <div class="plan-thumbs">${thumbs}</div>
                        <div class="hub-row-actions">
                            <button type="button" class="btn btn-secondary btn-sm" data-feedback="up" data-sig="${esc(s.signature)}">Helpful</button>
                            <button type="button" class="btn btn-secondary btn-sm" data-feedback="down" data-sig="${esc(s.signature)}">Not for me</button>
                        </div>
                    </article>`;
                })
                .join('');
            out.querySelectorAll('[data-feedback]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    try {
                        await api('/ai-stylist/feedback', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                item_signature: btn.dataset.sig,
                                useful: btn.dataset.feedback === 'up',
                                message,
                            }),
                        });
                        app().showToast('Thanks for the feedback');
                    } catch (e) {
                        app().showToast(e.message || 'Feedback failed');
                    }
                });
            });
        } catch (e) {
            out.innerHTML = `<p class="warn-text">${esc(e.message)}</p>`;
        }
    }

    function initVisualSearch() {
        const btn = document.getElementById('visual-search-btn');
        const input = document.getElementById('visual-search-input');
        if (!btn || !input) return;
        btn.addEventListener('click', () => input.click());
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            input.value = '';
            if (!file) return;
            const form = new FormData();
            form.append('file', file);
            app().showTab('closet');
            const grid = document.getElementById('closet-grid');
            if (grid) grid.innerHTML = '<div class="loading">Visual search…</div>';
            app().setVisualSearchMode?.(true, 'Visual search — loading matches…');
            try {
                const data = await api('/closet/visual-search?limit=24', {
                    method: 'POST',
                    body: form,
                });
                const matches = data.matches || [];
                if (!matches.length) {
                    grid.innerHTML = '<div class="empty-state"><p>No close matches in your closet.</p></div>';
                    app().setVisualSearchMode?.(true, 'Visual search — no matches');
                    return;
                }
                app().setVisualSearchMode?.(
                    true,
                    `Visual search — ${matches.length} match${matches.length === 1 ? '' : 'es'}`
                );
                grid.innerHTML = matches
                    .map((m) => {
                        const it = m.item;
                        const id = Number(it.id);
                        const score = Math.round((m.score || 0) * 100);
                        return `<div class="clothing-card visual-match-card" data-item-id="${id}">
                            <span class="visual-match-score">${score}% match</span>
                            <img src="${img(it)}" alt="" class="clothing-card-image">
                            <h3>${esc(it.subcategory)}</h3>
                        </div>`;
                    })
                    .join('');
                grid.querySelectorAll('.clothing-card').forEach((card) => {
                    card.addEventListener('click', () =>
                        window.showItemModal(Number(card.dataset.itemId))
                    );
                });
            } catch (e) {
                grid.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`;
            }
        });
    }

    async function loadFullInsights() {
        const container = document.getElementById('insights-container');
        const days = document.getElementById('neglect-days-filter')?.value || '30';
        if (!container) return;
        container.innerHTML = '<div class="loading">Loading insights…</div>';
        try {
            const [insights, neglected] = await Promise.all([
                api('/closet/insights'),
                api(`/neglected-items?days=${days}`),
            ]);
            let html = '';
            if (insights.gaps?.length) {
                html += '<h3>Capsule gaps</h3><ul class="stat-list stat-list--gaps">';
                html += insights.gaps
                    .map((g) => {
                        const seed = ClosetWebUtils.gapWishlistSeed(g.id);
                        const title = g.title || g.label || g.id;
                        return `<li class="gap-row">
                            <div class="gap-row-text"><strong>${esc(title)}</strong><span class="hint-text">${esc(g.detail || '')}</span></div>
                            <button type="button" class="btn btn-secondary btn-sm" data-gap-wishlist="1" data-gap-title="${esc(title)}" data-gap-detail="${esc(g.detail || '')}" data-gap-category="${esc(seed.category)}" data-gap-subcategory="${esc(seed.subcategory)}">Add wishlist target</button>
                        </li>`;
                    })
                    .join('');
                html += '</ul>';
            }
            if (insights.retirement_candidates?.length) {
                html += '<h3>Retirement candidates</h3><div class="insights-grid">';
                html += insights.retirement_candidates
                    .slice(0, 8)
                    .map((item) => window.createInsightCard?.(item) || '')
                    .join('');
                html += '</div>';
            }
            if (insights.duplicate_candidates?.length) {
                html += '<h3>Possible duplicates</h3><div class="insights-grid">';
                html += insights.duplicate_candidates
                    .slice(0, 6)
                    .map((pair) => {
                        const items = pair.items || [];
                        const a = items[0];
                        const b = items[1];
                        if (!a || !b) return '';
                        return `<div class="glass-card hub-row">
                            <span>${esc(a.subcategory)} ↔ ${esc(b.subcategory)}</span>
                            <span class="hint-text">${Math.round((pair.score || 0) * 100)}% similar</span>
                        </div>`;
                    })
                    .join('');
                html += '</div>';
            }
            const comp = insights.composition;
            if (comp) {
                html += `<p class="hint-text">${comp.item_count || 0} items in closet.</p>`;
            }
            if (neglected.items?.length) {
                html += `<h3>Unworn ${days}+ days (${neglected.items.length})</h3><div class="insights-grid">`;
                html += neglected.items.map((item) => window.createInsightCard(item)).join('');
                html += '</div>';
            } else if (!html) {
                html = '<div class="empty-state"><p>Your wardrobe looks balanced.</p></div>';
            }
            container.innerHTML = html;
            container.querySelectorAll('[data-gap-wishlist]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    app()?.navigateToWishlistPrefill?.({
                        openAdd: true,
                        name: btn.dataset.gapTitle || '',
                        category: btn.dataset.gapCategory || 'Other',
                        subcategory: btn.dataset.gapSubcategory || 'Wishlist',
                        intent: 'want',
                        notes: btn.dataset.gapDetail || '',
                    });
                });
            });
        } catch (e) {
            container.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`;
        }
    }

    async function initOutfitsLocationFilter() {
        const selectors = [
            document.getElementById('closet-location-filter'),
            document.getElementById('closet-location-filter-rail'),
            document.getElementById('outfits-location-filter'),
        ].filter(Boolean);
        if (!selectors.length) return;
        try {
            const [{ locations }, settings] = await Promise.all([
                api('/closet/locations'),
                api('/settings'),
            ]);
            const opts =
                '<option value="">All locations</option>' +
                (locations || [])
                    .map((l) => `<option value="${Number(l.id)}">${esc(l.name)}</option>`)
                    .join('');
            const defaultId = settings.default_closet_location_id;
            selectors.forEach((sel) => {
                sel.innerHTML = opts;
                if (defaultId && sel.id === 'outfits-location-filter') {
                    sel.value = String(defaultId);
                }
                if (!sel.dataset.bound) {
                    sel.dataset.bound = '1';
                    sel.addEventListener('change', () => {
                        if (sel.id === 'closet-location-filter') app().loadCloset();
                    });
                }
            });
        } catch {
            /* optional */
        }
    }

    function patchFitModal() {
        if (!window.ClosetFeatures) return;
        window.ClosetFeatures.openFitModal = async function enhancedFitModal(postId) {
            const modal = document.getElementById('fit-modal');
            const body = document.getElementById('fit-modal-body');
            if (!modal || !body) return;
            body.innerHTML = '<div class="loading">Loading…</div>';
            modal.classList.remove('hidden');
            modal.classList.add('active');
            try {
                const [postRes, commentsRes] = await Promise.all([
                    api(`/fits/${postId}`),
                    api(`/fits/${postId}/comments`),
                ]);
                const post = postRes.post || postRes;
                const src = app().safeUrl(post.image_path);
                const items = (post.items || [])
                    .map((i) => `<span class="badge">${esc(i.subcategory)}</span>`)
                    .join('');
                const reactions = REACTIONS.map((emoji) => {
                    const r = (post.reactions || []).find((x) => x.emoji === emoji);
                    const count = r?.count || 0;
                    const mine = r?.mine ? ' reaction-mine' : '';
                    return `<button type="button" class="reaction-btn${mine}" data-react="${esc(emoji)}">${esc(emoji)} ${count || ''}</button>`;
                }).join('');
                const comments = (commentsRes.comments || [])
                    .map(
                        (c) => `<div class="comment-row"><strong>@${esc(c.author?.username || '')}</strong> ${esc(c.body)}</div>`
                    )
                    .join('');
                const isOwn = post.user_id === app()?.currentUser?.id;
                body.innerHTML = `
                    ${src ? `<img class="modal-image" src="${src}" alt="">` : ''}
                    ${post.caption ? `<p>${esc(post.caption)}</p>` : ''}
                    <div class="clothing-card-meta">${items}</div>
                    <div class="reaction-bar">${reactions}</div>
                    ${isOwn ? '<button type="button" class="btn btn-danger btn-sm" id="fit-delete-btn">Delete fit</button>' : ''}
                    <form id="fit-comment-form" class="fit-comment-form">
                        <input class="form-input" id="fit-comment-input" placeholder="Comment" maxlength="500">
                        <button type="submit" class="btn btn-primary btn-sm">Post</button>
                    </form>
                    <div class="comments-list">${comments || '<p class="hint-text">No comments</p>'}</div>
                `;
                body.querySelectorAll('[data-react]').forEach((btn) => {
                    btn.addEventListener('click', async () => {
                        await api(`/fits/${postId}/react`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ emoji: btn.dataset.react }),
                        });
                        enhancedFitModal(postId);
                    });
                });
                document.getElementById('fit-delete-btn')?.addEventListener('click', async () => {
                    const ok = app()?.showConfirmDialog
                        ? await app().showConfirmDialog({
                              title: 'Delete fit',
                              message: 'Remove this post from your profile and the feed?',
                              confirmText: 'Delete',
                              cancelText: 'Cancel',
                              danger: true,
                          })
                        : window.confirm('Delete this fit?');
                    if (!ok) return;
                    await api(`/fits/${postId}`, { method: 'DELETE' });
                    modal.classList.add('hidden');
                    modal.classList.remove('active');
                    window.ClosetFeatures?.loadFeed?.();
                    window.ClosetFeatures?.loadProfileHub?.();
                    app().showToast('Fit deleted');
                });
                document.getElementById('fit-comment-form')?.addEventListener('submit', async (ev) => {
                    ev.preventDefault();
                    const text = document.getElementById('fit-comment-input')?.value.trim();
                    if (!text) return;
                    await api(`/fits/${postId}/comments`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ body: text }),
                    });
                    enhancedFitModal(postId);
                });
            } catch (e) {
                body.innerHTML = `<p>${esc(e.message)}</p>`;
            }
        };
    }

    window.ClosetUpgrade = {
        syncOutfitsAiFilterMode,
        updateOutfitsOptionsCaptions,
        populateAiStylistPins: populateAiStylistPinOptions,
        init() {
            initAiStylist();
            initOutfitsOptionsSheet();
            initVisualSearch();
            initOutfitsLocationFilter();
            patchFitModal();
            if (window.ClosetFeatures) {
                window.ClosetFeatures.loadFullInsights = loadFullInsights;
            }
        },
        loadFullInsights,
    };
})();
