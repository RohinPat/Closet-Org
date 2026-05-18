/**
 * Upload tab parity: bulk basics, CSV/manual import, wishlist quick-add.
 */
(function () {
    function app() {
        return window.ClosetApp;
    }

    function esc(s) {
        const a = app();
        return a ? a.escapeHtml(s) : String(s ?? '');
    }

    async function api(path, options) {
        const a = app();
        if (!a) throw new Error('App is not ready yet');
        return a.apiFetch(path, options);
    }

    function showUploadMode(mode) {
        document.querySelectorAll('.upload-mode-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.uploadMode === mode);
        });
        document.querySelectorAll('.upload-mode-pane').forEach((pane) => {
            pane.classList.toggle('hidden', pane.id !== `upload-mode-${mode}`);
            pane.classList.toggle('active', pane.id === `upload-mode-${mode}`);
        });
    }

    function showResult(el, html) {
        if (!el) return;
        el.innerHTML = html;
        el.classList.remove('hidden');
    }

    async function submitBulk(ev) {
        ev.preventDefault();
        const name = document.getElementById('bulk-name')?.value.trim();
        const subcategory = document.getElementById('bulk-subcategory')?.value || 'Other';
        const qty = Number(document.getElementById('bulk-qty')?.value);
        const photoInput = document.getElementById('bulk-photo-input');
        const resultEl = document.getElementById('bulk-result');
        if (!name || !Number.isFinite(qty) || qty < 1) {
            app().showToast('Enter a name and quantity between 1 and 999.');
            return;
        }
        try {
            let data;
            const file = photoInput?.files?.[0];
            if (file) {
                const form = new FormData();
                form.append('name', name);
                form.append('subcategory', subcategory);
                form.append('quantity', String(qty));
                form.append('photo', file);
                data = await api('/closet/bulk-item/upload', { method: 'POST', body: form });
            } else {
                data = await api('/closet/bulk-item', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, subcategory, quantity: qty }),
                });
            }
            showResult(
                resultEl,
                `<p class="hint-text">Saved bulk item #${Number(data.item_id)} — ${esc(name)} ×${qty}</p>`
            );
            ev.target.reset();
            if (photoInput) photoInput.value = '';
            document.getElementById('bulk-qty').value = String(qty);
            app().loadCloset();
            app().showToast('Bulk item saved');
        } catch (e) {
            app().showToast(e.message);
        }
    }

    async function importCsv() {
        const text = document.getElementById('csv-import-text')?.value.trim();
        const resultEl = document.getElementById('csv-import-result');
        if (!text) return;
        try {
            const data = await api('/closet/import-csv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csv_text: text }),
            });
            showResult(
                resultEl,
                `<p class="hint-text">Created ${Number(data.created) || 0}, skipped ${Array.isArray(data.skipped) ? data.skipped.length : Number(data.skipped) || 0}</p>`
            );
            app().loadCloset();
            app().showToast('Import complete');
        } catch (e) {
            app().showToast(e.message);
        }
    }

    async function submitManualImport(ev) {
        ev.preventDefault();
        const title = document.getElementById('manual-title')?.value.trim();
        if (!title) return;
        const subcategory = document.getElementById('manual-subcategory')?.value.trim() || 'Other';
        const colorsRaw = document.getElementById('manual-colors')?.value.trim() || '';
        const description = document.getElementById('manual-description')?.value.trim() || '';
        const tagsRaw = document.getElementById('manual-tags')?.value.trim() || '';
        const payload = {
            title,
            subcategory,
            description: description || null,
            colors: colorsRaw
                ? colorsRaw.split(',').map((c) => c.trim()).filter(Boolean).slice(0, 24)
                : null,
            tags: tagsRaw
                ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 48)
                : null,
        };
        try {
            const data = await api('/closet/import-manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const resultEl = document.getElementById('manual-import-result');
            showResult(
                resultEl,
                `<p class="hint-text">Added ${esc(title)} as item #${Number(data.item_id)}</p>`
            );
            ev.target.reset();
            document.getElementById('manual-subcategory').value = 'Other';
            app().loadCloset();
            app().showToast('Item added');
        } catch (e) {
            app().showToast(e.message);
        }
    }

    async function submitUploadWishlist(ev) {
        ev.preventDefault();
        const name = document.getElementById('upload-wish-name')?.value.trim();
        if (!name) return;
        const intent = document.getElementById('upload-wish-intent')?.value || 'want';
        const priceRaw = document.getElementById('upload-wish-price')?.value;
        const url = document.getElementById('upload-wish-url')?.value.trim() || null;
        const notes = document.getElementById('upload-wish-notes')?.value.trim() || null;
        const photoInput = document.getElementById('upload-wish-photos');
        const photoFiles = photoInput?.files?.length ? [...photoInput.files].slice(0, 4) : [];
        const body = { name, category: 'Other', subcategory: 'Wishlist', intent, url, notes, price: priceRaw ? Number(priceRaw) : null };
        try {
            if (photoFiles.length && window.ClosetFeatures?.uploadWishlistPhotos) {
                await window.ClosetFeatures.uploadWishlistPhotos(photoFiles, body);
            } else if (window.ClosetFeatures?.createWishlistItem) {
                await window.ClosetFeatures.createWishlistItem(body);
            } else {
                const created = await api('/wishlist', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, category: body.category, subcategory: body.subcategory, intent, url, price: body.price }),
                });
                if (notes && created?.item_id) {
                    await api(`/wishlist/${created.item_id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ notes }),
                    });
                }
            }
            const resultEl = document.getElementById('upload-wishlist-result');
            showResult(resultEl, `<p class="hint-text">${esc(name)} added to wishlist.</p>`);
            ev.target.reset();
            if (photoInput) photoInput.value = '';
            document.getElementById('upload-wish-photo-preview')?.classList.add('hidden');
            app().showToast('Added to wishlist');
        } catch (e) {
            app().showToast(e.message);
        }
    }

    function initPhotoWishlistFlow() {
        const toggleBtn = document.getElementById('upload-wishlist-toggle-btn');
        const panel = document.getElementById('upload-photo-wishlist-panel');
        const saveBtn = document.getElementById('photo-wish-save-btn');
        if (!toggleBtn || !panel || !saveBtn) return;

        toggleBtn.addEventListener('click', () => {
            const opening = panel.classList.contains('hidden');
            panel.classList.toggle('hidden', !opening);
            if (opening) {
                const file = app()?.getSelectedUploadFile?.();
                const nameInput = document.getElementById('photo-wish-name');
                if (nameInput && !nameInput.value.trim() && file?.name) {
                    nameInput.value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
                }
            }
        });

        saveBtn.addEventListener('click', async () => {
            const file = app()?.getSelectedUploadFile?.();
            if (!file) {
                app().showToast('Choose a photo first');
                return;
            }
            const name = document.getElementById('photo-wish-name')?.value.trim();
            if (!name) {
                app().showToast('Add a wishlist name first');
                return;
            }
            const intent = document.getElementById('photo-wish-intent')?.value || 'want';
            const priceRaw = document.getElementById('photo-wish-price')?.value;
            const url = document.getElementById('photo-wish-url')?.value.trim() || null;
            const notes = document.getElementById('photo-wish-notes')?.value.trim() || null;
            const body = {
                name,
                category: 'Other',
                subcategory: 'Wishlist',
                intent,
                url,
                notes,
                price: priceRaw ? Number(priceRaw) : null,
            };
            try {
                saveBtn.disabled = true;
                if (window.ClosetFeatures?.uploadWishlistPhotos) {
                    await window.ClosetFeatures.uploadWishlistPhotos([file], body);
                } else {
                    throw new Error('Wishlist upload is not ready yet');
                }
                app().showToast('Saved to wishlist');
                panel.classList.add('hidden');
                document.getElementById('upload-preview')?.classList.add('hidden');
                document.getElementById('upload-area')?.classList.remove('hidden');
                app().showTab('wishlist');
            } catch (e) {
                app().showToast(e.message || 'Could not save wishlist item');
            } finally {
                saveBtn.disabled = false;
            }
        });
    }

    function applyBulkPreset(kind) {
        if (kind === 'socks') {
            document.getElementById('bulk-subcategory').value = 'Footwear';
            document.getElementById('bulk-name').value = 'Crew socks';
            document.getElementById('bulk-qty').value = '6';
        } else if (kind === 'underwear') {
            document.getElementById('bulk-subcategory').value = 'Other';
            document.getElementById('bulk-name').value = 'Underwear';
            document.getElementById('bulk-qty').value = '5';
        }
    }

    function showBulkSuggestion(classification) {
        const banner = document.getElementById('bulk-suggest-banner');
        if (!banner || !classification) return;
        const text = `${classification.category || ''} ${classification.subcategory || ''}`.toLowerCase();
        let suggestion = null;
        if (text.includes('sock')) {
            suggestion = { name: 'Crew socks', subcategory: 'Footwear', quantity: 6 };
        } else if (text.includes('underwear') || text.includes('boxer') || text.includes('brief')) {
            suggestion = { name: 'Underwear', subcategory: 'Other', quantity: 5 };
        } else if (text.includes('undershirt')) {
            suggestion = { name: 'Undershirts', subcategory: 'Top', quantity: 4 };
        }
        if (!suggestion) {
            banner.classList.add('hidden');
            return;
        }
        banner.classList.remove('hidden');
        banner.innerHTML = `
            <p>Similar items are often tracked as bulk basics.</p>
            <button type="button" class="btn btn-secondary btn-sm" id="bulk-suggest-btn">Save as bulk (${esc(suggestion.name)} ×${suggestion.quantity})</button>`;
        document.getElementById('bulk-suggest-btn')?.addEventListener('click', async () => {
            try {
                await api('/closet/bulk-item', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: suggestion.name,
                        subcategory: suggestion.subcategory,
                        quantity: suggestion.quantity,
                    }),
                });
                app().showToast('Bulk item saved');
                app().loadCloset();
                banner.classList.add('hidden');
            } catch (e) {
                app().showToast(e.message);
            }
        });
    }

    window.ClosetUpload = {
        init() {
            document.querySelectorAll('.upload-mode-btn').forEach((btn) => {
                btn.addEventListener('click', () => showUploadMode(btn.dataset.uploadMode));
            });

            document.getElementById('bulk-item-form')?.addEventListener('submit', submitBulk);
            document.getElementById('csv-import-btn')?.addEventListener('click', importCsv);
            document.getElementById('manual-import-form')?.addEventListener('submit', submitManualImport);
            document.getElementById('upload-wishlist-form')?.addEventListener('submit', submitUploadWishlist);
            initPhotoWishlistFlow();

            document.querySelectorAll('[data-bulk-preset]').forEach((btn) => {
                btn.addEventListener('click', () => applyBulkPreset(btn.dataset.bulkPreset));
            });

            document.querySelectorAll('.import-subnav-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const pane = btn.dataset.importPane;
                    document.querySelectorAll('.import-subnav-btn').forEach((b) => {
                        b.classList.toggle('active', b === btn);
                    });
                    document.querySelectorAll('.import-pane').forEach((p) => {
                        p.classList.toggle('hidden', p.id !== `import-pane-${pane}`);
                        p.classList.toggle('active', p.id === `import-pane-${pane}`);
                    });
                });
            });
        },
        showBulkSuggestion,
    };
})();
