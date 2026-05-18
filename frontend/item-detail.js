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

    const TAG_TYPES = [
        'T-Shirt', 'Shirt', 'Sweater', 'Jacket', 'Coat', 'Pants', 'Jeans', 'Shorts', 'Skirt',
        'Dress', 'Shoes', 'Sneakers', 'Boots', 'Sandals', 'Accessories', 'Hat', 'Scarf', 'Belt',
    ];
    const TAG_GROUPS = ['Top', 'Bottom', 'Dress', 'Footwear', 'Accessory', 'Other'];
    const TAG_STYLES = ['Casual', 'Formal', 'Athletic', 'Streetwear', 'Business'];
    const TAG_SEASONS = ['Winter', 'Summer', 'All-Season'];
    const TAG_COLORS = [
        'Black', 'White', 'Gray', 'Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Purple', 'Pink',
        'Brown', 'Beige', 'Navy', 'Teal',
    ];
    const LAUNDRY_STATES = ['clean', 'worn', 'in_hamper', 'washing', 'drying'];

    let carouselIndex = 0;
    let tagsDraft = null;

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

    function galleryUrls(item) {
        const a = app();
        if (!a || !item) return [];
        const paths =
            item.image_paths && item.image_paths.length
                ? item.image_paths
                : item.image_path
                  ? [item.image_path]
                  : [];
        return paths.map((p) => a.safeUrl(p)).filter(Boolean);
    }

    async function api(path, options) {
        const a = app();
        if (!a) throw new Error('App is not ready yet');
        return a.apiFetch(path, options);
    }

    let state = { item: null, locations: [], history: [], wornPosts: [], mount: 'modal' };

    function modalEls() {
        if (state.mount === 'pane') {
            return {
                modal: document.getElementById('closet-detail-pane'),
                body: document.getElementById('closet-detail-body'),
            };
        }
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

    function currentLaundryState(item) {
        return item.laundry_state || (item.washed ? 'clean' : 'worn');
    }

    function renderImageCarousel(item) {
        const urls = galleryUrls(item);
        carouselIndex = 0;
        if (!urls.length) {
            return '<div class="modal-image modal-image--empty" aria-hidden="true"></div>';
        }
        if (urls.length === 1) {
            return `<img src="${urls[0]}" alt="${esc(item.subcategory)}" class="modal-image">`;
        }
        const slides = urls
            .map(
                (u, i) =>
                    `<img src="${u}" alt="${esc(item.subcategory)}" class="item-carousel-slide${i === 0 ? ' active' : ''}" data-slide="${i}">`
            )
            .join('');
        const dots = urls
            .map(
                (_, i) =>
                    `<span class="item-carousel-dot${i === 0 ? ' active' : ''}" data-dot="${i}" role="button" tabindex="0" aria-label="Image ${i + 1}"></span>`
            )
            .join('');
        return `<div class="item-image-carousel" data-carousel-count="${urls.length}">
            <button type="button" class="item-carousel-nav item-carousel-prev" aria-label="Previous image">‹</button>
            <div class="item-carousel-track">${slides}</div>
            <button type="button" class="item-carousel-nav item-carousel-next" aria-label="Next image">›</button>
            <div class="item-carousel-dots">${dots}</div>
        </div>`;
    }

    function bindImageCarousel() {
        const root = modalEls().body?.querySelector('.item-image-carousel');
        if (!root) return;
        const count = Number(root.dataset.carouselCount) || 1;
        const show = (idx) => {
            carouselIndex = ((idx % count) + count) % count;
            root.querySelectorAll('.item-carousel-slide').forEach((el, i) => {
                el.classList.toggle('active', i === carouselIndex);
            });
            root.querySelectorAll('.item-carousel-dot').forEach((el, i) => {
                el.classList.toggle('active', i === carouselIndex);
            });
        };
        root.querySelector('.item-carousel-prev')?.addEventListener('click', () => show(carouselIndex - 1));
        root.querySelector('.item-carousel-next')?.addEventListener('click', () => show(carouselIndex + 1));
        root.querySelectorAll('.item-carousel-dot').forEach((dot) => {
            dot.addEventListener('click', () => show(Number(dot.dataset.dot)));
        });
    }

    function renderLaundrySection(item) {
        const current = currentLaundryState(item);
        const chips = LAUNDRY_STATES.map((s) => {
            const label = s.replace(/_/g, ' ');
            const active = current === s ? ' chip-active' : '';
            return `<button type="button" class="chip laundry-state-chip${active}" data-laundry-state="${esc(s)}">${esc(label)}</button>`;
        }).join('');
        return `<div class="modal-section glass-card">
            <h3>Lifecycle</h3>
            <p class="hint-text">Laundry state: <strong>${esc(current.replace(/_/g, ' '))}</strong></p>
            <div class="chip-row">${chips}</div>
        </div>`;
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

    function parseWearDateKey(raw) {
        if (!raw) return null;
        const s = String(raw).includes('T') ? String(raw) : String(raw).replace(' ', 'T');
        const slice = s.slice(0, 10);
        return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null;
    }

    function monthMatrix(year, monthZero) {
        const first = new Date(year, monthZero, 1);
        const last = new Date(year, monthZero + 1, 0);
        const startPad = first.getDay();
        const daysInMonth = last.getDate();
        const cells = [];
        for (let i = 0; i < startPad; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);
        while (cells.length % 7 !== 0) cells.push(null);
        const rows = [];
        for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
        return rows;
    }

    function renderWearCalendar(entries, cursor) {
        const counts = new Map();
        for (const e of entries) {
            const k = parseWearDateKey(e.worn_at || e.date || e.worn_date || '');
            if (!k) continue;
            counts.set(k, (counts.get(k) || 0) + 1);
        }
        let y = cursor.getFullYear();
        let m0 = cursor.getMonth();
        const matrix = monthMatrix(y, m0);
        const label = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' });
        const rows = matrix
            .map((week) => {
                const cells = week
                    .map((day) => {
                        if (day == null) return '<span class="wear-cal-cell wear-cal-empty"></span>';
                        const key = `${y}-${String(m0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const n = counts.get(key) || 0;
                        const cls = n > 0 ? 'wear-cal-worn' : '';
                        return `<span class="wear-cal-cell ${cls}" title="${n ? `${n} wear(s)` : ''}">${day}</span>`;
                    })
                    .join('');
                return `<div class="wear-cal-week">${cells}</div>`;
            })
            .join('');
        return `<div class="wear-calendar glass-card" data-cal-y="${y}" data-cal-m="${m0}">
            <div class="wear-cal-toolbar">
                <button type="button" class="btn btn-secondary btn-sm" data-cal-prev aria-label="Previous month">‹</button>
                <span class="wear-cal-label">${esc(label)}</span>
                <button type="button" class="btn btn-secondary btn-sm" data-cal-next aria-label="Next month">›</button>
            </div>
            <div class="wear-cal-dow"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>
            ${rows}
        </div>`;
    }

    function bindWearCalendar() {
        const cal = document.querySelector('.wear-calendar');
        if (!cal) return;
        cal.querySelector('[data-cal-prev]')?.addEventListener('click', () => {
            const y = Number(cal.dataset.calY);
            const m = Number(cal.dataset.calM);
            const next = new Date(y, m - 1, 1);
            const slot = document.getElementById('wear-calendar-slot');
            if (slot) {
                slot.innerHTML = renderWearCalendar(state.history, next);
                bindWearCalendar();
            }
        });
        cal.querySelector('[data-cal-next]')?.addEventListener('click', () => {
            const y = Number(cal.dataset.calY);
            const m = Number(cal.dataset.calM);
            const next = new Date(y, m + 1, 1);
            const slot = document.getElementById('wear-calendar-slot');
            if (slot) {
                slot.innerHTML = renderWearCalendar(state.history, next);
                bindWearCalendar();
            }
        });
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

        const wornBlock =
            item.washed && wearCount === 0
                ? `<div class="worn-occasion-row">
                    <input type="text" id="item-worn-occasion" class="form-input" placeholder="Occasion (optional)" maxlength="120">
                    <button type="button" class="btn btn-success btn-sm" data-action="worn">Mark worn today</button>
                   </div>`
                : '';

        return `
            ${renderImageCarousel(item)}
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
            ${item.care_summary ? `<p class="hint-text item-care-summary">${esc(item.care_summary)}</p>` : ''}
            <div class="item-detail-metrics">
                <span>Freshness ${freshness}%</span>
                <span>Worn ${Number(item.times_worn) || 0}×</span>
                <span>CPW ${esc(cpw)}</span>
                <span>Last worn: ${item.days_since_worn != null ? esc(item.days_since_worn) + 'd ago' : 'never'}</span>
            </div>
            ${renderLaundrySection(item)}
            <div id="item-edit-slot"></div>
            ${renderBulkBlock(item)}
            <div class="modal-actions item-detail-actions">
                <button type="button" class="btn btn-secondary btn-sm" data-action="toggle-edit">Edit details</button>
                <button type="button" class="btn btn-secondary btn-sm" data-action="edit-tags">Edit tags</button>
                <button type="button" class="btn btn-secondary btn-sm" data-action="outfits">Outfits with this</button>
                <button type="button" class="btn btn-secondary btn-sm" data-action="pack">${item.packed_for_trip ? 'Unpack' : 'Pack for trip'}</button>
                ${item.lent_to
                    ? `<button type="button" class="btn btn-secondary btn-sm" data-action="return">Mark returned</button>`
                    : `<button type="button" class="btn btn-secondary btn-sm" data-action="lend">Lend item</button>`}
                ${wearCount > 0
                    ? `<button type="button" class="btn btn-success btn-sm" data-action="wear-again-yes">Wear again</button>
                       <button type="button" class="btn btn-secondary btn-sm" data-action="wear-again-no">To laundry</button>`
                    : wornBlock}
                ${!item.washed || wearCount >= maxWear
                    ? `<button type="button" class="btn btn-primary btn-sm" data-action="washed">Mark washed</button>`
                    : ''}
                <button type="button" class="btn btn-secondary btn-sm" data-action="laundry">Add to laundry</button>
                <button type="button" class="btn btn-secondary btn-sm" data-action="care-scan">Scan care label</button>
                <button type="button" class="btn btn-danger btn-sm" data-action="delete">Delete</button>
            </div>
            <div class="modal-section">
                <h3>Wear calendar</h3>
                <div id="wear-calendar-slot">${renderWearCalendar(state.history, new Date())}</div>
            </div>
            <div class="modal-section">
                <h3>Wear history</h3>
                ${historyHtml}
            </div>
            ${renderWornFits()}
            <div id="item-outfits-slot" class="hidden"></div>
        `;
    }

    function renderWornFits() {
        if (!state.wornPosts.length) return '';
        const tiles = state.wornPosts
            .slice(0, 12)
            .map((p) => {
                const src = app().safeUrl(p.image_path || p.thumbnail_path);
                const id = Number(p.id);
                return src
                    ? `<button type="button" class="fits-grid-item" data-worn-post="${id}"><img src="${src}" alt=""></button>`
                    : '';
            })
            .join('');
        return `<div class="modal-section"><h3>Worn in fits</h3><div class="fits-grid">${tiles || '<p class="hint-text">No fit photos yet.</p>'}</div></div>`;
    }

    function renderBulkBlock(item) {
        if (!item.is_bulk) return '';
        const clean = item.clean_count ?? 0;
        return `<div class="glass-card modal-section">
            <h3>Bulk inventory</h3>
            <p class="hint-text">${clean} clean on hand</p>
            <div class="hub-row-actions">
                <button type="button" class="btn btn-secondary btn-sm" data-action="promote-bulk">Add clean copies</button>
            </div>
        </div>`;
    }

    function renderTagChip(label, active, group, value) {
        return `<button type="button" class="chip${active ? ' chip-active' : ''}" data-tag-group="${esc(group)}" data-tag-value="${esc(value)}">${esc(label)}</button>`;
    }

    function renderEditTagsBody(draft) {
        const typeRow = TAG_TYPES.map((c) =>
            renderTagChip(c, draft.category === c, 'category', c)
        ).join('');
        const groupRow = TAG_GROUPS.map((s) =>
            renderTagChip(s, draft.subcategory === s, 'subcategory', s)
        ).join('');
        const styleRow =
            renderTagChip('None', !draft.style, 'style', '') +
            TAG_STYLES.map((s) => renderTagChip(s, draft.style === s, 'style', s)).join('');
        const seasonRow =
            renderTagChip('None', !draft.season, 'season', '') +
            TAG_SEASONS.map((s) => renderTagChip(s, draft.season === s, 'season', s)).join('');
        const colorRow = TAG_COLORS.map((c) =>
            renderTagChip(c, draft.colors.has(c), 'color', c)
        ).join('');
        const userTags = draft.userTags
            .map(
                (t) =>
                    `<button type="button" class="chip chip-active" data-remove-tag="${esc(t)}">${esc(t)} ×</button>`
            )
            .join('');
        return `
            <p class="field-label">Type</p>
            <div class="chip-row" data-tags-section="category">${typeRow}</div>
            <p class="field-label">Group</p>
            <div class="chip-row" data-tags-section="subcategory">${groupRow}</div>
            <p class="field-label">Style</p>
            <div class="chip-row" data-tags-section="style">${styleRow}</div>
            <p class="field-label">Season</p>
            <div class="chip-row" data-tags-section="season">${seasonRow}</div>
            <p class="field-label">Colors</p>
            <div class="chip-row" data-tags-section="color">${colorRow}</div>
            <p class="field-label">Your tags</p>
            <p class="hint-text">Add labels like work, vintage, or gift — up to 20.</p>
            <div class="worn-occasion-row">
                <input type="text" id="item-new-user-tag" class="form-input" placeholder="New tag" maxlength="40">
                <button type="button" class="btn btn-secondary btn-sm" id="item-add-user-tag">Add</button>
            </div>
            <div class="chip-row" id="item-user-tags-row">${userTags || '<span class="hint-text">No custom tags yet.</span>'}</div>
        `;
    }

    function openEditTagsModal() {
        const item = state.item;
        if (!item) return;
        tagsDraft = {
            category: item.category || '',
            subcategory: item.subcategory || '',
            style: item.style || '',
            season: item.season || '',
            colors: new Set(item.colors || []),
            userTags: [...(item.user_tags || [])],
        };
        const body = document.getElementById('item-edit-tags-body');
        if (body) body.innerHTML = renderEditTagsBody(tagsDraft);
        bindEditTagsModal();
        app()?.openAppModal?.('item-edit-tags-modal');
    }

    function closeEditTagsModal() {
        app()?.closeAppModal?.('item-edit-tags-modal');
        tagsDraft = null;
    }

    function bindEditTagsModal() {
        const body = document.getElementById('item-edit-tags-body');
        if (!body || !tagsDraft) return;

        body.querySelectorAll('[data-tag-group]').forEach((chip) => {
            chip.addEventListener('click', () => {
                const group = chip.dataset.tagGroup;
                const value = chip.dataset.tagValue;
                if (group === 'color') {
                    if (tagsDraft.colors.has(value)) {
                        if (tagsDraft.colors.size <= 1) {
                            app().showToast('Pick at least one color');
                            return;
                        }
                        tagsDraft.colors.delete(value);
                    } else {
                        tagsDraft.colors.add(value);
                    }
                } else if (group === 'category') tagsDraft.category = value;
                else if (group === 'subcategory') tagsDraft.subcategory = value;
                else if (group === 'style') tagsDraft.style = value;
                else if (group === 'season') tagsDraft.season = value;
                body.innerHTML = renderEditTagsBody(tagsDraft);
                bindEditTagsModal();
            });
        });

        body.querySelectorAll('[data-remove-tag]').forEach((chip) => {
            chip.addEventListener('click', () => {
                const t = chip.dataset.removeTag;
                tagsDraft.userTags = tagsDraft.userTags.filter((x) => x !== t);
                body.innerHTML = renderEditTagsBody(tagsDraft);
                bindEditTagsModal();
            });
        });

        document.getElementById('item-add-user-tag')?.addEventListener('click', () => {
            const input = document.getElementById('item-new-user-tag');
            const val = input?.value.trim();
            if (!val) return;
            if (tagsDraft.userTags.includes(val)) return;
            if (tagsDraft.userTags.length >= 20) {
                app().showToast('Maximum 20 tags');
                return;
            }
            tagsDraft.userTags.push(val);
            if (input) input.value = '';
            body.innerHTML = renderEditTagsBody(tagsDraft);
            bindEditTagsModal();
        });
    }

    async function saveEditTags() {
        if (!tagsDraft || !state.item) return;
        if (!tagsDraft.category?.trim() || !tagsDraft.subcategory?.trim()) {
            app().showToast('Pick a type and group');
            return;
        }
        if (!tagsDraft.colors.size) {
            app().showToast('Pick at least one color');
            return;
        }
        const id = Number(state.item.id);
        const patch = {
            category: tagsDraft.category.trim(),
            subcategory: tagsDraft.subcategory.trim(),
            style: tagsDraft.style || null,
            season: tagsDraft.season || null,
            colors: [...tagsDraft.colors],
            user_tags: tagsDraft.userTags,
        };
        try {
            await api(`/item/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
            });
            await api(`/item/${id}/classification-correction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ corrected_data: patch }),
            });
            app().showToast('Tags updated');
            closeEditTagsModal();
            await refresh();
            app().loadCloset();
        } catch (e) {
            app().showToast(e.message);
        }
    }

    function openLendModal() {
        const nameInput = document.getElementById('item-lend-name');
        const untilInput = document.getElementById('item-lend-until');
        if (nameInput) nameInput.value = '';
        if (untilInput) untilInput.value = '';
        app()?.openAppModal?.('item-lend-modal');
        nameInput?.focus();
    }

    function closeLendModal() {
        app()?.closeAppModal?.('item-lend-modal');
    }

    async function submitLendForm(ev) {
        ev.preventDefault();
        const id = Number(state.item?.id);
        const name = document.getElementById('item-lend-name')?.value.trim();
        const until = document.getElementById('item-lend-until')?.value.trim() || '';
        if (!name) {
            app().showToast('Borrower name is required');
            return;
        }
        if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
            app().showToast('Use YYYY-MM-DD for return date');
            return;
        }
        try {
            await api(`/item/${id}/lend`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lent_to: name, lent_until: until || null }),
            });
            closeLendModal();
            await refresh();
        } catch (e) {
            app().showToast(e.message);
        }
    }

    function openPromoteModal() {
        const item = state.item;
        if (!item?.is_bulk) return;
        const maxPull = Math.min(item.quantity ?? 1, item.clean_count ?? 0);
        const hint = document.getElementById('item-promote-hint');
        const countInput = document.getElementById('item-promote-count');
        if (hint) {
            hint.textContent = `Pulls from your clean count (max ${maxPull}). Each new row is a normal item you can track separately.`;
        }
        if (countInput) {
            countInput.value = '1';
            countInput.max = String(maxPull);
        }
        app()?.openAppModal?.('item-promote-modal');
        countInput?.focus();
    }

    function closePromoteModal() {
        app()?.closeAppModal?.('item-promote-modal');
    }

    async function submitPromoteForm(ev) {
        ev.preventDefault();
        const id = Number(state.item?.id);
        const item = state.item;
        const maxPull = Math.min(item.quantity ?? 1, item.clean_count ?? 0);
        const count = Number(document.getElementById('item-promote-count')?.value);
        if (!count || count < 1) {
            app().showToast('Enter a positive number');
            return;
        }
        if (count > maxPull) {
            app().showToast(`You can promote at most ${maxPull} clean units right now`);
            return;
        }
        try {
            const res = await api(`/item/${id}/promote-bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ count }),
            });
            closePromoteModal();
            app().showToast(`Created ${(res.created_ids || []).length} individual item(s)`);
            if (res.bulk_removed) {
                app().closeModal?.();
                app().loadCloset();
                return;
            }
            await refresh();
            app().loadCloset();
        } catch (e) {
            app().showToast(e.message);
        }
    }

    async function setLaundryState(laundryState) {
        const id = Number(state.item?.id);
        if (!id) return;
        try {
            if (laundryState === 'clean' || laundryState === 'in_hamper') {
                await api(`/item/${id}/status`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ washed: laundryState === 'clean' }),
                });
            }
            await api(`/item/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ laundry_state: laundryState }),
            });
            await refresh();
            app().loadCloset();
        } catch (e) {
            app().showToast(e.message);
        }
    }

    function initAuxModals() {
        document.querySelectorAll('.item-lend-close').forEach((el) => {
            el.addEventListener('click', closeLendModal);
        });
        document.getElementById('item-lend-form')?.addEventListener('submit', submitLendForm);
        document.getElementById('item-lend-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'item-lend-modal') closeLendModal();
        });

        document.querySelectorAll('.item-promote-close').forEach((el) => {
            el.addEventListener('click', closePromoteModal);
        });
        document.getElementById('item-promote-form')?.addEventListener('submit', submitPromoteForm);
        document.getElementById('item-promote-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'item-promote-modal') closePromoteModal();
        });

        document.querySelectorAll('.item-edit-tags-close').forEach((el) => {
            el.addEventListener('click', closeEditTagsModal);
        });
        document.getElementById('item-edit-tags-save')?.addEventListener('click', saveEditTags);
        document.getElementById('item-edit-tags-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'item-edit-tags-modal') closeEditTagsModal();
        });
    }

    function bindActions() {
        const { body } = modalEls();
        if (!body || !state.item) return;
        const id = Number(state.item.id);

        body.querySelector('[data-action="favorite"]')?.addEventListener('click', async () => {
            await api(`/item/${id}/favorite`, { method: 'PUT' });
            await refresh();
            app().loadCloset();
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

        body.querySelectorAll('[data-action="edit-tags"]').forEach((btn) => {
            btn.addEventListener('click', openEditTagsModal);
        });

        body.querySelectorAll('[data-laundry-state]').forEach((chip) => {
            chip.addEventListener('click', () => setLaundryState(chip.dataset.laundryState));
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

        body.querySelector('[data-action="lend"]')?.addEventListener('click', openLendModal);

        body.querySelector('[data-action="return"]')?.addEventListener('click', async () => {
            await api(`/item/${id}/return`, { method: 'PUT' });
            await refresh();
        });

        body.querySelector('[data-action="worn"]')?.addEventListener('click', async () => {
            const occasion = document.getElementById('item-worn-occasion')?.value.trim() || '';
            await api(`/item/${id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ worn: true, occasion: occasion || undefined }),
            });
            await refresh();
            app().loadCloset();
        });

        body.querySelector('[data-action="washed"]')?.addEventListener('click', async () => {
            await setLaundryState('clean');
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

        body.querySelectorAll('[data-worn-post]').forEach((btn) => {
            btn.addEventListener('click', () => {
                window.ClosetFeatures?.openFitModal?.(Number(btn.dataset.wornPost));
            });
        });

        body.querySelector('[data-action="promote-bulk"]')?.addEventListener('click', openPromoteModal);

        bindImageCarousel();
        bindWearCalendar();
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
            app().showToast(e.message);
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

    async function open(itemId, options = {}) {
        state.mount = options.mount === 'pane' ? 'pane' : 'modal';
        const { modal, body } = modalEls();
        if (!modal || !body) return;
        body.innerHTML = '<div class="loading">Loading item…</div>';
        modal.classList.remove('hidden');
        if (state.mount === 'modal') {
            modal.classList.add('active');
        }
        try {
            const [full, locs, hist, posts] = await Promise.all([
                api(`/item/${itemId}`),
                api('/closet/locations'),
                api(`/item/${itemId}/wear-history`),
                api(`/item/${itemId}/worn-outfits`),
            ]);
            state = {
                item: full,
                locations: locs.locations || [],
                history: hist.history || [],
                wornPosts: posts.posts || [],
                mount: state.mount,
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
                app().showToast(e.message);
            }
        };
    }

    initAuxModals();
    window.ClosetItemDetail = { open, refresh };
})();
