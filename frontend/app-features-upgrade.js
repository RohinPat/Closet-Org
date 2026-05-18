/**
 * Second-wave web parity: AI stylist, visual search, rich fits, insights, pack/planning.
 */
(function () {
    const REACTIONS = ['🔥', '❤️', '👏', '🧊', '✨', '👀'];
    const AI_STYLIST_KEY = 'closet_web_ai_stylist';
    let packActiveTripId = null;

    function app() {
        return window.ClosetApp;
    }

    function esc(s) {
        return app().escapeHtml(s);
    }

    function img(item) {
        return app().closetItemImageUrl(item);
    }

    async function api(path, options) {
        return app().apiFetch(path, options);
    }

    function initAiStylist() {
        const panel = document.getElementById('ai-stylist-panel');
        if (!panel) return;
        const enabled = localStorage.getItem(AI_STYLIST_KEY) !== '0';
        panel.innerHTML = `
            <label class="toggle-row">
                <input type="checkbox" id="ai-stylist-enabled" ${enabled ? 'checked' : ''}>
                <span>AI stylist</span>
            </label>
            <div id="ai-stylist-body" class="${enabled ? '' : 'hidden'}">
                <textarea id="ai-stylist-input" class="form-input" rows="2" maxlength="500" placeholder="e.g. Something polished for a rainy work day"></textarea>
                <button type="button" class="btn btn-primary btn-sm" id="ai-stylist-submit">Ask stylist</button>
                <div id="ai-stylist-results"></div>
            </div>
        `;
        const toggle = document.getElementById('ai-stylist-enabled');
        const body = document.getElementById('ai-stylist-body');
        toggle?.addEventListener('change', () => {
            const on = toggle.checked;
            localStorage.setItem(AI_STYLIST_KEY, on ? '1' : '0');
            body?.classList.toggle('hidden', !on);
        });
        document.getElementById('ai-stylist-submit')?.addEventListener('click', runAiStylist);
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
            include_packed: document.getElementById('include-packed-toggle')?.checked || false,
        };
        const locSel = document.getElementById('closet-location-filter');
        if (locSel?.value) payload.closet_location_id = Number(locSel.value);
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
                        alert(e.message);
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
            try {
                const data = await api('/closet/visual-search?limit=24', {
                    method: 'POST',
                    body: form,
                });
                const matches = data.matches || [];
                if (!matches.length) {
                    grid.innerHTML = '<div class="empty-state"><p>No close matches in your closet.</p></div>';
                    return;
                }
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
                html += '<h3>Wardrobe gaps</h3><ul class="stat-list">';
                html += insights.gaps
                    .map(
                        (g) =>
                            `<li><span>${esc(g.title)}</span><span class="hint-text">${esc(g.detail)}</span></li>`
                    )
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
        } catch (e) {
            container.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`;
        }
    }

    async function initClosetLocationFilter() {
        const sel = document.getElementById('closet-location-filter');
        if (!sel) return;
        try {
            const { locations } = await api('/closet/locations');
            sel.innerHTML =
                '<option value="">All locations</option>' +
                (locations || [])
                    .map((l) => `<option value="${Number(l.id)}">${esc(l.name)}</option>`)
                    .join('');
            sel.addEventListener('change', () => app().loadCloset());
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
                const [{ post }, commentsRes] = await Promise.all([
                    api(`/fits/${postId}`),
                    api(`/fits/${postId}/comments`),
                ]);
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
                body.innerHTML = `
                    ${src ? `<img class="modal-image" src="${src}" alt="">` : ''}
                    ${post.caption ? `<p>${esc(post.caption)}</p>` : ''}
                    <div class="clothing-card-meta">${items}</div>
                    <div class="reaction-bar">${reactions}</div>
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

    function patchPackMode() {
        const orig = window.ClosetFeatures?.loadPackMode;
        if (!orig) return;
        window.ClosetFeatures.loadPackMode = async function () {
            const el = document.getElementById('pack-container');
            if (!el) return;
            el.innerHTML = '<div class="loading">Loading…</div>';
            try {
                const [{ trips }, { items }] = await Promise.all([
                    api('/trips'),
                    api('/closet?status=clean'),
                ]);
                if (trips.length && packActiveTripId == null) {
                    packActiveTripId = Number(trips[0].id);
                }
                const tripOpts = trips
                    .map(
                        (t) =>
                            `<option value="${Number(t.id)}" ${packActiveTripId === Number(t.id) ? 'selected' : ''}>${esc(t.name)}</option>`
                    )
                    .join('');
                let html = `<label class="form-group">Active trip<select id="pack-trip-select" class="form-input">${tripOpts || '<option value="">No trips</option>'}</select></label>`;
                html += `<div class="pack-bulk-actions">
                    <button type="button" class="btn btn-secondary btn-sm" id="pack-all-btn">Pack all shown</button>
                    <button type="button" class="btn btn-secondary btn-sm" id="unpack-all-btn">Unpack all</button>
                </div>`;
                const packed = items.filter((i) => i.packed_for_trip);
                html += `<p class="hint-text">${packed.length} packed.</p>`;
                html += '<div class="pack-grid">';
                html += items
                    .slice(0, 100)
                    .map((item) => {
                        const id = Number(item.id);
                        const checked = item.packed_for_trip ? 'checked' : '';
                        const thumb = img(item);
                        return `<label class="pack-item"><input type="checkbox" data-pack-item="${id}" ${checked}>${thumb ? `<img src="${thumb}" alt="">` : ''}<span>${esc(item.subcategory)}</span></label>`;
                    })
                    .join('');
                html += '</div>';
                el.innerHTML = html;
                document.getElementById('pack-trip-select')?.addEventListener('change', (e) => {
                    packActiveTripId = Number(e.target.value) || null;
                });
                el.querySelectorAll('[data-pack-item]').forEach((cb) => {
                    cb.addEventListener('change', async () => {
                        const tripId = packActiveTripId || Number(document.getElementById('pack-trip-select')?.value);
                        if (!tripId) {
                            alert('Select a trip first');
                            cb.checked = !cb.checked;
                            return;
                        }
                        await api(`/trips/${tripId}/packed`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                item_id: Number(cb.dataset.packItem),
                                packed: cb.checked,
                            }),
                        });
                    });
                });
                document.getElementById('pack-all-btn')?.addEventListener('click', async () => {
                    const ids = [...el.querySelectorAll('[data-pack-item]')].map((c) =>
                        Number(c.dataset.packItem)
                    );
                    await api('/closet/packed', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ packed_for_trip: true, item_ids: ids }),
                    });
                    patchPackMode();
                    app().loadCloset();
                });
                document.getElementById('unpack-all-btn')?.addEventListener('click', async () => {
                    const ids = [...el.querySelectorAll('[data-pack-item]')].map((c) =>
                        Number(c.dataset.packItem)
                    );
                    await api('/closet/packed', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ packed_for_trip: false, item_ids: ids }),
                    });
                    patchPackMode();
                    app().loadCloset();
                });
            } catch (e) {
                el.innerHTML = `<p>${esc(e.message)}</p>`;
            }
        };
    }

    window.ClosetUpgrade = {
        init() {
            initAiStylist();
            initVisualSearch();
            initClosetLocationFilter();
            patchFitModal();
            patchPackMode();
            if (window.ClosetFeatures) {
                window.ClosetFeatures.loadFullInsights = loadFullInsights;
            }
        },
        loadFullInsights,
    };
})();
