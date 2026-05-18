/**
 * Item detail modal — parity with mobile ItemDetailScreen (core flows).
 */
(function () {
    const EDIT_FIELDS = [
        { key: 'brand', label: 'Brand', type: 'text' },
        { key: 'size', label: 'Size', type: 'text' },
        { key: 'purchase_price', label: 'Price', type: 'number' },
        { key: 'purchase_date', label: 'Purchased', type: 'text', placeholder: 'YYYY-MM-DD' },
        { key: 'purchase_location', label: 'Where bought', type: 'text' },
        { key: 'storage_location', label: 'Storage spot', type: 'text' },
        { key: 'care_summary', label: 'Care notes', type: 'textarea' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
    ];

    const CATEGORIES = ['Top', 'Bottom', 'Dress', 'Footwear', 'Accessory', 'Jacket', 'Other'];
    const SEASONS = ['Spring', 'Summer', 'Fall', 'Winter', 'All-Season'];
    const STYLES = ['Casual', 'Formal', 'Athletic', 'Business', 'Streetwear', 'Bohemian'];

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

    let state = { item: null, locations: [], history: [], wornPosts: [] };

    function modalEls() {
        return {
            modal: document.getElementById('item-modal'),
            body: document.getElementById('modal-body'),
        };
    }

    function fieldValue(item, key) {
        const v = item[key];
        if (v === null || v === undefined) return '';
        return String(v);
    }

    function renderEditForm(item) {
        const locOpts = state.locations
            .map(
                (l) =>
                    `<option value="${Number(l.id)}" ${item.closet_location_id === l.id ? 'selected' : ''}>${esc(l.name)}</option>`
            )
            .join('');
        const fields = EDIT_FIELDS.map((f) => {
            const val = esc(fieldValue(item, f.key));
            if (f.type === 'textarea') {
                return `<label class="form-group">${f.label}<textarea class="form-input" data-field="${f.key}" rows="2">${val}</textarea></label>`;
            }
            return `<label class="form-group">${f.label}<input class="form-input" data-field="${f.key}" type="${f.type === 'number' ? 'number' : 'text'}" value="${val}" placeholder="${esc(f.placeholder || '')}"></label>`;
        }).join('');
        return `
            <form id="item-edit-form" class="item-edit-form glass-card">
                <h3>Edit details</h3>
                ${fields}
                <label class="form-group">Closet location
                    <select class="form-input" id="item-closet-location">
                        <option value="">Default</option>
                        ${locOpts}
                    </select>
                </label>
                <label class="form-group">Category
                    <select class="form-input" id="item-category">${CATEGORIES.map((c) => `<option value="${esc(c)}" ${item.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
                </label>
                <label class="form-group">Season
                    <select class="form-input" id="item-season">${SEASONS.map((s) => `<option value="${esc(s)}" ${item.season === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
                </label>
                <label class="form-group">Style
                    <select class="form-input" id="item-style">${STYLES.map((s) => `<option value="${esc(s)}" ${item.style === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
                </label>
                <label class="form-group">Tags <span class="hint-text">(comma-separated)</span>
                    <input class="form-input" id="item-tags" value="${esc((item.user_tags || []).join(', '))}">
                </label>
                <button type="submit" class="btn btn-primary">Save changes</button>
            </form>
        `;
    }

    function renderBody() {
        const item = state.item;
        if (!item) return;
        const id = Number(item.id);
        const wearCount = item.wear_again_count || 0;
        const maxWear = item.max_wear_before_wash || 1;
        const freshness = Math.round((item.freshness_score || 1) * 100);
        const cpw =
            item.cost_per_wear != null ? `$${Number(item.cost_per_wear).toFixed(2)}` : '—';
        const colors = (item.colors || [])
            .map((c) => `<div class="color-swatch" style="background-color:${esc(c)}"></div>`)
            .join('');
        const tags = (item.user_tags || [])
            .map((t) => `<span class="badge">${esc(t)}</span>`)
            .join(' ');
        const lentBlock = item.lent_to
            ? `<p class="warn-text">On loan to ${esc(item.lent_to)}${item.lent_until ? ` until ${esc(item.lent_until)}` : ''}</p>`
            : '';

        const historyHtml = state.history.length
            ? `<ul class="wear-history-list">${state.history
                  .slice(0, 12)
                  .map(
                      (h) =>
                          `<li>${esc(h.worn_at || h.date || '')}${h.occasion ? ` · ${esc(h.occasion)}` : ''}</li>`
                  )
                  .join('')}</ul>`
            : '<p class="hint-text">No wear history yet.</p>';

        return `
            <img src="${img(item)}" alt="${esc(item.subcategory)}" class="modal-image">
            <div class="modal-header-section">
                <h2>${esc(item.subcategory)}</h2>
                <button type="button" class="btn-favorite ${item.is_favorite ? 'active' : ''}" data-action="favorite">${item.is_favorite ? '⭐ Favorite' : '☆ Favorite'}</button>
            </div>
            ${item.brand ? `<p class="item-brand-modal">${esc(item.brand)}</p>` : ''}
            <div class="clothing-card-meta">
                <span class="badge badge-category">${esc(item.category)}</span>
                <span class="badge badge-season">${esc(item.season || '')}</span>
                <span class="badge badge-style">${esc(item.style || '')}</span>
                ${item.size ? `<span class="badge">Size ${esc(item.size)}</span>` : ''}
                ${item.packed_for_trip ? '<span class="badge">Packed</span>' : ''}
            </div>
            <div class="color-swatches">${colors}</div>
            ${tags ? `<div class="clothing-card-meta">${tags}</div>` : ''}
            ${lentBlock}
            <div class="item-detail-metrics">
                <span>Freshness ${freshness}%</span>
                <span>Worn ${Number(item.times_worn) || 0}×</span>
                <span>CPW ${esc(cpw)}</span>
                <span>Last worn: ${item.days_since_worn != null ? esc(item.days_since_worn) + 'd ago' : 'never'}</span>
            </div>
            <div id="item-edit-slot"></div>
            <div class="modal-actions item-detail-actions">
                <button type="button" class="btn btn-secondary btn-sm" data-action="toggle-edit">Edit details</button>
                <button type="button" class="btn btn-secondary btn-sm" data-action="outfits">Outfits with this</button>
                <button type="button" class="btn btn-secondary btn-sm" data-action="pack">${item.packed_for_trip ? 'Unpack' : 'Pack for trip'}</button>
                ${item.lent_to
                    ? `<button type="button" class="btn btn-secondary btn-sm" data-action="return">Mark returned</button>`
                    : `<button type="button" class="btn btn-secondary btn-sm" data-action="lend">Lend item</button>`}
                ${wearCount > 0
                    ? `<button type="button" class="btn btn-success btn-sm" data-action="wear-again-yes">Wear again</button>
                       <button type="button" class="btn btn-secondary btn-sm" data-action="wear-again-no">To laundry</button>`
                    : item.washed
                      ? `<button type="button" class="btn btn-success btn-sm" data-action="worn">Mark worn today</button>`
                      : ''}
                ${!item.washed || wearCount >= maxWear
                    ? `<button type="button" class="btn btn-primary btn-sm" data-action="washed">Mark washed</button>`
                    : ''}
                <button type="button" class="btn btn-secondary btn-sm" data-action="laundry">Add to laundry</button>
                <button type="button" class="btn btn-secondary btn-sm" data-action="care-scan">Scan care label</button>
                <button type="button" class="btn btn-danger btn-sm" data-action="delete">Delete</button>
            </div>
            <div class="modal-section">
                <h3>Wear history</h3>
                ${historyHtml}
            </div>
            <div id="item-outfits-slot" class="hidden"></div>
        `;
    }

    function bindActions() {
        const { body } = modalEls();
        if (!body || !state.item) return;
        const id = Number(state.item.id);

        body.querySelector('[data-action="favorite"]')?.addEventListener('click', async () => {
            await api(`/item/${id}/favorite`, { method: 'PUT' });
            await refresh();
        });

        body.querySelector('[data-action="toggle-edit"]')?.addEventListener('click', () => {
            const slot = document.getElementById('item-edit-slot');
            if (!slot) return;
            if (slot.innerHTML.trim()) {
                slot.innerHTML = '';
                return;
            }
            slot.innerHTML = renderEditForm(state.item);
            document.getElementById('item-edit-form')?.addEventListener('submit', saveEdit);
        });

        body.querySelector('[data-action="pack"]')?.addEventListener('click', async () => {
            await api(`/item/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ packed_for_trip: !state.item.packed_for_trip }),
            });
            await refresh();
            app().loadCloset();
        });

        body.querySelector('[data-action="lend"]')?.addEventListener('click', async () => {
            const name = prompt('Lent to (name)?');
            if (!name?.trim()) return;
            const until = prompt('Return by (YYYY-MM-DD, optional)') || '';
            await api(`/item/${id}/lend`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lent_to: name.trim(), lent_until: until.trim() || null }),
            });
            await refresh();
        });

        body.querySelector('[data-action="return"]')?.addEventListener('click', async () => {
            await api(`/item/${id}/return`, { method: 'PUT' });
            await refresh();
        });

        body.querySelector('[data-action="worn"]')?.addEventListener('click', async () => {
            const occasion = prompt('Occasion (optional)') || '';
            await api(`/item/${id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ worn: true, occasion: occasion || undefined }),
            });
            await refresh();
            app().loadCloset();
        });

        body.querySelector('[data-action="washed"]')?.addEventListener('click', async () => {
            await api(`/item/${id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ washed: true }),
            });
            await refresh();
            app().loadCloset();
        });

        body.querySelector('[data-action="wear-again-yes"]')?.addEventListener('click', () =>
            window.handleWearAgainDecision(id, true)
        );
        body.querySelector('[data-action="wear-again-no"]')?.addEventListener('click', () =>
            window.handleWearAgainDecision(id, false)
        );

        body.querySelector('[data-action="laundry"]')?.addEventListener('click', () =>
            window.addToLaundry(id)
        );

        body.querySelector('[data-action="delete"]')?.addEventListener('click', () =>
            window.deleteItem(id)
        );

        body.querySelector('[data-action="care-scan"]')?.addEventListener('click', () => {
            const input = document.getElementById('care-label-input');
            if (input) input.click();
        });

        body.querySelector('[data-action="outfits"]')?.addEventListener('click', loadItemOutfits);
    }

    async function saveEdit(ev) {
        ev.preventDefault();
        const item = state.item;
        const patch = {};
        document.querySelectorAll('#item-edit-form [data-field]').forEach((el) => {
            const key = el.dataset.field;
            let val = el.value.trim();
            if (key === 'purchase_price') {
                patch[key] = val ? parseFloat(val) : null;
            } else {
                patch[key] = val || null;
            }
        });
        const locSel = document.getElementById('item-closet-location');
        if (locSel) {
            patch.closet_location_id = locSel.value ? Number(locSel.value) : null;
        }
        patch.category = document.getElementById('item-category')?.value;
        patch.season = document.getElementById('item-season')?.value;
        patch.style = document.getElementById('item-style')?.value;
        const tagsRaw = document.getElementById('item-tags')?.value || '';
        patch.user_tags = tagsRaw
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 20);
        try {
            await api(`/item/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
            });
            app().showToast('Saved');
            await refresh();
        } catch (e) {
            alert(e.message);
        }
    }

    async function loadItemOutfits() {
        const slot = document.getElementById('item-outfits-slot');
        if (!slot) return;
        slot.classList.remove('hidden');
        slot.innerHTML = '<div class="loading">Loading outfits…</div>';
        try {
            const data = await api(`/item/${state.item.id}/outfits?seed=${Date.now()}`);
            if (!data.outfits?.length) {
                slot.innerHTML = '<p class="hint-text">No outfit ideas for this item right now.</p>';
                return;
            }
            slot.innerHTML =
                '<h3>Outfits featuring this item</h3>' +
                data.outfits
                    .map((o, i) => {
                        const thumbs = (o.items || [])
                            .map((it) => {
                                const s = img(it);
                                return s ? `<img class="plan-thumb" src="${s}" alt="">` : '';
                            })
                            .join('');
                        return `<article class="glass-card hub-row"><strong>Look ${i + 1}</strong> · score ${Number(o.score) || 0}<div class="plan-thumbs">${thumbs}</div></article>`;
                    })
                    .join('');
        } catch (e) {
            slot.innerHTML = `<p>${esc(e.message)}</p>`;
        }
    }

    async function refresh() {
        const id = state.item.id;
        const [full, locs, hist, posts] = await Promise.all([
            api(`/item/${id}`),
            api('/closet/locations'),
            api(`/item/${id}/wear-history`),
            api(`/item/${id}/worn-outfits`),
        ]);
        state.item = full;
        state.locations = locs.locations || [];
        state.history = hist.history || [];
        state.wornPosts = posts.posts || [];
        const { body } = modalEls();
        body.innerHTML = renderBody();
        bindActions();
    }

    async function open(itemId) {
        const { modal, body } = modalEls();
        if (!modal || !body) return;
        body.innerHTML = '<div class="loading">Loading item…</div>';
        modal.classList.remove('hidden');
        modal.classList.add('active');
        try {
            const [full, locs, hist] = await Promise.all([
                api(`/item/${itemId}`),
                api('/closet/locations'),
                api(`/item/${itemId}/wear-history`),
            ]);
            state = {
                item: full,
                locations: locs.locations || [],
                history: hist.history || [],
                wornPosts: [],
            };
            body.innerHTML = renderBody();
            bindActions();
            initCareLabelInput(itemId);
        } catch (e) {
            body.innerHTML = `<p>${esc(e.message)}</p>`;
        }
    }

    function initCareLabelInput(itemId) {
        let input = document.getElementById('care-label-input');
        if (!input) {
            input = document.createElement('input');
            input.type = 'file';
            input.id = 'care-label-input';
            input.accept = 'image/*';
            input.hidden = true;
            document.body.appendChild(input);
        }
        input.onchange = async () => {
            const file = input.files?.[0];
            input.value = '';
            if (!file) return;
            const form = new FormData();
            form.append('file', file);
            try {
                await api(`/item/${itemId}/care-label`, { method: 'POST', body: form });
                app().showToast('Care label scanned');
                await refresh();
            } catch (e) {
                alert(e.message);
            }
        };
    }

    window.ClosetItemDetail = { open, refresh };
})();
