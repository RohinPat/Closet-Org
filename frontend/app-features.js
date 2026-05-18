/**
 * Web app features aligned with mobile (feed, wishlist, trips, planning, etc.)
 */
(function () {
    const WEATHER_KEY = 'closet_web_weather_sync';

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

    function socialEnabled() {
        const u = app().currentUser;
        return u && u.social_enabled !== false;
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
        const feedBtn = document.getElementById('nav-feed');
        const socialSection = document.getElementById('profile-social-section');
        const on = socialEnabled();
        if (feedBtn) feedBtn.classList.toggle('hidden', !on);
        if (socialSection) socialSection.classList.toggle('hidden', !on);
    }

    async function loadProfileHub() {
        applySocialNav();
        const u = app().currentUser;
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
                el.innerHTML = '<div class="empty-state"><p>Your wishlist is empty.</p></div>';
                return;
            }
            el.innerHTML = items.map((item) => {
                const id = Number(item.id);
                const thumb = img(item);
                return `<article class="hub-row glass-card">
                    ${thumb ? `<img class="hub-row-thumb" src="${thumb}" alt="">` : ''}
                    <div class="hub-row-body">
                        <h4>${esc(item.subcategory || item.name || 'Item')}</h4>
                        <p class="hint-text">${esc(item.category || '')}${item.wishlist_intent ? ` · ${esc(item.wishlist_intent)}` : ''}</p>
                        <div class="hub-row-actions">
                            <button type="button" class="btn btn-primary btn-sm" data-promote="${id}">Promote to closet</button>
                            <button type="button" class="btn btn-secondary btn-sm" data-delete-wish="${id}">Remove</button>
                        </div>
                    </div>
                </article>`;
            }).join('');
            el.querySelectorAll('[data-promote]').forEach((b) => {
                b.addEventListener('click', async () => {
                    try {
                        await api(`/item/${b.dataset.promote}/promote`, { method: 'PUT' });
                        app().showToast('Added to your closet');
                        loadWishlist();
                        app().loadCloset();
                    } catch (e) {
                        alert(e.message);
                    }
                });
            });
            el.querySelectorAll('[data-delete-wish]').forEach((b) => {
                b.addEventListener('click', async () => {
                    if (!confirm('Remove from wishlist?')) return;
                    try {
                        await api(`/item/${b.dataset.deleteWish}`, { method: 'DELETE' });
                        loadWishlist();
                    } catch (e) {
                        alert(e.message);
                    }
                });
            });
        } catch (e) {
            el.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`;
        }
    }

    function promptWishlistAdd() {
        const name = prompt('Item name');
        if (!name || !name.trim()) return;
        const category = prompt('Category (Top, Bottom, Dress, Footwear, Accessory, Other)', 'Other') || 'Other';
        api('/wishlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim(), category, subcategory: 'Wishlist' }),
        })
            .then(() => {
                app().showToast('Added to wishlist');
                loadWishlist();
            })
            .catch((e) => alert(e.message));
    }

    const FEED_REACTIONS = ['🔥', '❤️', '👏', '🧊', '✨', '👀'];
    let feedCursor = null;

    async function loadFeed(append) {
        const el = document.getElementById('feed-container');
        if (!el) return;
        if (!append) {
            feedCursor = null;
            el.innerHTML = '<div class="loading">Loading feed…</div>';
        }
        try {
            const path = feedCursor ? `/feed?before=${encodeURIComponent(feedCursor)}` : '/feed';
            const { posts } = await api(path);
            if (!posts.length) {
                el.innerHTML = '<div class="empty-state"><p>Follow friends to see their fits here.</p></div>';
                return;
            }
            el.innerHTML = posts.map((p) => renderFitCard(p)).join('');
            el.querySelectorAll('[data-post-id]').forEach((card) => {
                card.addEventListener('click', () => openFitModal(Number(card.dataset.postId)));
            });
        } catch (e) {
            el.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`;
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
                        alert(err.message);
                    }
                });
            });
        });
    }

    function renderFitCard(post) {
        const src = app().safeUrl(post.image_path);
        const author = post.author ? `@${esc(post.author.username)}` : '';
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
            const { post } = await api(`/fits/${postId}`);
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

    async function loadPackMode() {
        const el = document.getElementById('pack-container');
        if (!el) return;
        el.innerHTML = '<div class="loading">Loading trips…</div>';
        try {
            const [{ trips }, { items }] = await Promise.all([
                api('/trips'),
                api('/closet?status=clean'),
            ]);
            const packed = items.filter((i) => i.packed_for_trip);
            let html = `<p class="hint-text">${packed.length} item(s) packed for travel.</p>`;
            if (!trips.length) {
                html += '<div class="empty-state"><p>No trips yet. Create one to start packing.</p></div>';
            } else {
                html += trips
                    .map((t) => {
                        const id = Number(t.id);
                        return `<article class="glass-card hub-row" data-trip-id="${id}">
                            <h4>${esc(t.name)}</h4>
                            <p class="hint-text">${esc(t.destination || '')} ${esc(t.start_date || '')} – ${esc(t.end_date || '')}</p>
                            <button type="button" class="btn btn-secondary btn-sm" data-pack-outfits="${id}">Outfit ideas (packed)</button>
                        </article>`;
                    })
                    .join('');
            }
            html += `<h3 class="section-label">Closet — toggle packed</h3><div class="pack-grid">`;
            html += items
                .slice(0, 80)
                .map((item) => {
                    const id = Number(item.id);
                    const checked = item.packed_for_trip ? 'checked' : '';
                    const thumb = img(item);
                    return `<label class="pack-item">
                        <input type="checkbox" data-pack-item="${id}" ${checked}>
                        ${thumb ? `<img src="${thumb}" alt="">` : ''}
                        <span>${esc(item.subcategory)}</span>
                    </label>`;
                })
                .join('');
            html += '</div>';
            el.innerHTML = html;

            el.querySelectorAll('[data-pack-item]').forEach((cb) => {
                cb.addEventListener('change', async () => {
                    const itemId = Number(cb.dataset.packItem);
                    const tripId = trips[0] ? Number(trips[0].id) : null;
                    if (!tripId) {
                        alert('Create a trip first.');
                        cb.checked = false;
                        return;
                    }
                    try {
                        await api(`/trips/${tripId}/packed`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ item_id: itemId, packed: cb.checked }),
                        });
                    } catch (e) {
                        alert(e.message);
                        cb.checked = !cb.checked;
                    }
                });
            });

            el.querySelectorAll('[data-pack-outfits]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    app().showTab('outfits');
                    document.getElementById('include-packed-toggle').checked = true;
                    await app().generateOutfits({ forceSeed: true });
                });
            });
        } catch (e) {
            el.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`;
        }
    }

    function promptNewTrip() {
        const name = prompt('Trip name');
        if (!name || !name.trim()) return;
        const destination = prompt('Destination (optional)') || '';
        const start = prompt('Start date YYYY-MM-DD') || '';
        const end = prompt('End date YYYY-MM-DD') || '';
        api('/trips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim(), destination, start_date: start, end_date: end }),
        })
            .then(() => {
                app().showToast('Trip created');
                loadPackMode();
            })
            .catch((e) => alert(e.message));
    }

    async function loadPlanning(pinItemId) {
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
                <input type="text" id="plan-title" class="form-input" placeholder="Title" required maxlength="120">
                <input type="date" id="plan-date" class="form-input" value="${today}" required>
                <input type="text" id="plan-occasion" class="form-input" placeholder="Occasion (optional)">
                <select id="plan-items" class="form-input" multiple size="6" aria-label="Items">
                    ${items.map((i) => `<option value="${Number(i.id)}" ${pinItemId === Number(i.id) ? 'selected' : ''}>${esc(i.subcategory)} (${esc(i.category)})</option>`).join('')}
                </select>
                <p class="hint-text">Hold Ctrl/Cmd to select multiple items.</p>
                <button type="submit" class="btn btn-primary">Save plan</button>
            </form>`;

            if (!plans.length) {
                html += '<p class="hint-text">No upcoming plans.</p>';
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
                        return `<article class="glass-card hub-row">
                            <h4>${esc(p.title)} · ${esc(p.planned_for)}</h4>
                            <p class="hint-text">${esc(p.status)} ${p.occasion ? `· ${esc(p.occasion)}` : ''}</p>
                            <div class="plan-thumbs">${thumbs}</div>
                            ${conflicts}
                            <button type="button" class="btn btn-secondary btn-sm" data-delete-plan="${Number(p.id)}">Delete</button>
                        </article>`;
                    })
                    .join('');
            }
            el.innerHTML = html;

            document.getElementById('plan-form').addEventListener('submit', async (ev) => {
                ev.preventDefault();
                const title = document.getElementById('plan-title').value.trim();
                const planned_for = document.getElementById('plan-date').value;
                const occasion = document.getElementById('plan-occasion').value.trim();
                const sel = document.getElementById('plan-items');
                const item_ids = Array.from(sel.selectedOptions).map((o) => Number(o.value));
                try {
                    await api('/planned-outfits', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title, planned_for, occasion: occasion || null, item_ids }),
                    });
                    app().showToast('Plan saved');
                    loadPlanning();
                    app().loadOutfitsPlannedPreview();
                } catch (e) {
                    alert(e.message);
                }
            });

            el.querySelectorAll('[data-delete-plan]').forEach((b) => {
                b.addEventListener('click', async () => {
                    if (!confirm('Delete this plan?')) return;
                    try {
                        await api(`/planned-outfits/${b.dataset.deletePlan}`, { method: 'DELETE' });
                        loadPlanning();
                        app().loadOutfitsPlannedPreview();
                    } catch (e) {
                        alert(e.message);
                    }
                });
            });
        } catch (e) {
            el.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`;
        }
    }

    async function loadTripsLog() {
        const el = document.getElementById('trips-container');
        if (!el) return;
        el.innerHTML = '<div class="loading">Loading…</div>';
        try {
            const { trips } = await api('/trips/logs');
            if (!trips.length) {
                el.innerHTML = '<div class="empty-state"><p>No trip albums yet. Post fits with trip tags.</p></div>';
                return;
            }
            el.innerHTML = trips
                .map((t) => {
                    const cover = app().safeUrl(t.cover_image_path);
                    return `<article class="glass-card hub-row">
                        <h4>${esc(t.name)}</h4>
                        <p class="hint-text">${esc(t.destination || '')} · ${Number(t.post_count) || 0} fits</p>
                        ${cover ? `<img class="trip-cover" src="${cover}" alt="">` : ''}
                    </article>`;
                })
                .join('');
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
            if (!friends.length) html += '<p class="hint-text">No friends yet. Search by username on mobile or add via API.</p>';
            else {
                html += friends
                    .map(
                        (f) => `<div class="hub-row glass-card">
                        <span>${esc(f.full_name || f.username)} @${esc(f.username)}</span>
                        <button type="button" class="btn btn-secondary btn-sm" data-remove-friend="${Number(f.id)}">Remove</button>
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
                    await api(`/friends/requests/${b.dataset.accept}/accept`, { method: 'POST' });
                    loadFriends();
                });
            });
            el.querySelectorAll('[data-remove-friend]').forEach((b) => {
                b.addEventListener('click', async () => {
                    if (!confirm('Remove friend?')) return;
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
            el.innerHTML = `
                <div class="glass-card settings-block">
                    <h3>Weather for outfits</h3>
                    <label class="toggle-row"><input type="checkbox" id="settings-weather" ${weatherOn ? 'checked' : ''}><span>Use my location for weather-aware outfits</span></label>
                </div>
                <div class="glass-card settings-block">
                    <h3>Closet locations</h3>
                    <div id="locations-list"></div>
                    <button type="button" class="btn btn-secondary btn-sm" id="location-add-btn">Add location</button>
                </div>
                <div class="glass-card settings-block">
                    <h3>Account</h3>
                    <p class="hint-text">Mode: ${esc(settings.app_mode || 'normal')}</p>
                    <button type="button" class="btn btn-danger btn-sm" id="logout-all-btn">Sign out everywhere</button>
                </div>
            `;
            document.getElementById('settings-weather').addEventListener('change', (e) => {
                localStorage.setItem(WEATHER_KEY, e.target.checked ? '1' : '0');
                const toggle = document.getElementById('weather-sync-toggle');
                if (toggle) toggle.checked = e.target.checked;
            });
            document.getElementById('logout-all-btn').addEventListener('click', async () => {
                if (!confirm('Sign out on all devices?')) return;
                await api('/auth/logout-all', { method: 'POST' });
                localStorage.removeItem('access_token');
                window.location.href = '/frontend/login.html';
            });
            await renderLocations(settings.closet_locations || []);
            const addLoc = document.getElementById('location-add-btn');
            if (addLoc && !addLoc.dataset.bound) {
                addLoc.dataset.bound = '1';
                addLoc.addEventListener('click', async () => {
                    const name = prompt('Location name');
                    if (!name) return;
                    await api('/closet/locations', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: name.trim() }),
                    });
                    loadSettings();
                });
            }
        } catch (e) {
            el.innerHTML = `<p>${esc(e.message)}</p>`;
        }
    }

    async function renderLocations(locations) {
        const list = document.getElementById('locations-list');
        if (!list) return;
        if (!locations.length) {
            list.innerHTML = '<p class="hint-text">No extra locations.</p>';
            return;
        }
        list.innerHTML = locations
            .map(
                (loc) => `<div class="hub-row">
                <span>${esc(loc.name)}</span>
                <button type="button" class="btn btn-secondary btn-sm" data-del-loc="${Number(loc.id)}">Delete</button>
            </div>`
            )
            .join('');
        list.querySelectorAll('[data-del-loc]').forEach((b) => {
            b.addEventListener('click', async () => {
                await api(`/closet/locations/${b.dataset.delLoc}`, { method: 'DELETE' });
                loadSettings();
            });
        });
    }

    async function submitCreateFit(ev) {
        ev.preventDefault();
        const fileInput = document.getElementById('fit-photo-input');
        const caption = document.getElementById('fit-caption-input').value.trim();
        const idsRaw = document.getElementById('fit-item-ids-input').value.trim();
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        const form = new FormData();
        form.append('file', file);
        if (caption) form.append('caption', caption);
        if (idsRaw) form.append('item_ids', idsRaw);
        try {
            await api('/fits', { method: 'POST', body: form });
            app().showToast('Fit posted');
            ev.target.reset();
            app().showTab(socialEnabled() ? 'feed' : 'profile');
            loadFeed();
            loadProfileHub();
        } catch (e) {
            alert(e.message);
        }
    }

    function initFitCheck() {
        const btn = document.getElementById('fit-check-btn');
        const input = document.getElementById('fit-check-input');
        if (!btn || !input) return;
        btn.addEventListener('click', () => input.click());
        input.addEventListener('change', async () => {
            const file = input.files && input.files[0];
            input.value = '';
            if (!file) return;
            const form = new FormData();
            form.append('file', file);
            try {
                const data = await api('/closet/fit-check', { method: 'POST', body: form });
                const pairs = data.pairings || [];
                if (!pairs.length) {
                    alert('No strong pairings found.');
                    return;
                }
                const msg = pairs
                    .slice(0, 5)
                    .map((p) => `${p.item.subcategory}: ${(p.hints || []).join(', ')}`)
                    .join('\n');
                alert(`Top pairings:\n${msg}`);
            } catch (e) {
                alert(e.message);
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
                alert(e.message);
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

    const TAB_LOADERS = {
        feed: loadFeed,
        wishlist: loadWishlist,
        pack: loadPackMode,
        planning: () => loadPlanning(),
        trips: loadTripsLog,
        friends: loadFriends,
        settings: loadSettings,
        'create-fit': () => {},
        profile: loadProfileHub,
    };

    window.ClosetFeatures = {
        applySocialNav,
        openFitModal,
        loadFeed,
        init() {
            bindHubNavigation();
            initFitCheck();
            initAvatarUpload();
            initProfileEditToggle();
            applySocialNav();

            const wishlistAdd = document.getElementById('wishlist-add-btn');
            if (wishlistAdd) wishlistAdd.addEventListener('click', promptWishlistAdd);
            const packNew = document.getElementById('pack-new-trip-btn');
            if (packNew) packNew.addEventListener('click', promptNewTrip);
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
            if (wToggle) wToggle.checked = weatherSaved;
        },
        onTabShown(tab, options) {
            if (TAB_LOADERS[tab]) TAB_LOADERS[tab](options?.pinItemId);
        },
        loadPlanning,
        loadProfileHub,
        loadOutfitsPlannedPreview: async function loadOutfitsPlannedPreview() {
            const el = document.getElementById('outfits-planned-list');
            if (!el) return;
            try {
                const { plans } = await api('/planned-outfits?include_past=false');
                if (!plans.length) {
                    el.innerHTML = '<p class="hint-text">No upcoming plans.</p>';
                    return;
                }
                el.innerHTML = plans
                    .slice(0, 5)
                    .map(
                        (p) => `<button type="button" class="hub-row glass-card hub-row-btn" data-goto-planning="1">
                        <strong>${esc(p.title)}</strong>
                        <span class="hint-text">${esc(p.planned_for)} · ${esc(p.status)}</span>
                    </button>`
                    )
                    .join('');
                el.querySelectorAll('[data-goto-planning]').forEach((b) => {
                    b.addEventListener('click', () => app().showTab('planning'));
                });
            } catch {
                el.innerHTML = '<p class="hint-text">Could not load plans.</p>';
            }
        },
        planWithItem(itemId) {
            app().showTab('planning');
            loadPlanning(itemId);
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
