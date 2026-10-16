'use strict';

/**
 * Landing page demo: the phone shows the app's Today screen picking outfits
 * from the little closet beside it. Static data, no network calls.
 */
(function () {
    const OUTFITS = [
        {
            weather: '54°F · Light rain',
            pieces: ['jacket-olive', 'jeans-black', 'boot-brown'],
            reasons: ['Rain-ready', '3 weeks since your jacket'],
        },
        {
            weather: '68°F · Sunny',
            pieces: ['tee-white', 'jeans-blue', 'sneaker-white'],
            reasons: ['Includes a favorite', '2 weeks since your jeans'],
        },
        {
            weather: '61°F · Cloudy',
            pieces: ['sweater-oat', 'chinos', 'sneaker-white'],
            reasons: ['4 weeks since your sweater'],
        },
        {
            weather: '47°F · Windy',
            pieces: ['sweater-green', 'skirt-rust', 'boot-brown'],
            reasons: ['Warm layer for the cold', 'First wear for your skirt'],
        },
    ];
    const INTERVAL_MS = 3400;
    const FADE_MS = 300;

    const closet = document.querySelector('.closet');
    const phone = document.querySelector('.phone');
    const q = (name) => document.querySelector(`[data-demo="${name}"]`);
    const tiles = q('tiles');
    const reasons = q('reasons');
    const weather = q('weather');
    const dots = q('dots');
    if (!closet || !phone || !tiles || !reasons || !weather || !dots) return;

    const now = new Date();
    q('date').textContent = now
        .toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
        .toUpperCase();
    const h = now.getHours();
    document.querySelector('.ph-hello').textContent =
        h < 5 || h >= 17 ? 'Good evening' : h < 12 ? 'Good morning' : 'Good afternoon';

    OUTFITS.forEach(() => dots.appendChild(document.createElement('i')));

    function pieceTile(id) {
        const source = closet.querySelector(`[data-id="${id}"]`);
        const tile = document.createElement('div');
        tile.className = 'ph-tile' + (source.classList.contains('wide') ? ' wide' : '');
        tile.appendChild(source.querySelector('svg').cloneNode(true));
        return tile;
    }

    function show(i) {
        const outfit = OUTFITS[i];
        tiles.replaceChildren(...outfit.pieces.map(pieceTile));
        reasons.replaceChildren(
            ...outfit.reasons.map((text) => {
                const chip = document.createElement('span');
                chip.textContent = text;
                return chip;
            })
        );
        weather.textContent = outfit.weather;
        closet.classList.add('picking');
        closet.querySelectorAll('li').forEach((li) => {
            li.classList.toggle('picked', outfit.pieces.includes(li.dataset.id));
        });
        dots.querySelectorAll('i').forEach((dot, k) => dot.classList.toggle('on', k === i));
    }

    let index = 0;
    show(index);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    let paused = false;
    phone.addEventListener('mouseenter', () => { paused = true; });
    phone.addEventListener('mouseleave', () => { paused = false; });

    setInterval(() => {
        if (paused || document.hidden) return;
        tiles.classList.add('fading');
        reasons.classList.add('fading');
        setTimeout(() => {
            index = (index + 1) % OUTFITS.length;
            show(index);
            tiles.classList.remove('fading');
            reasons.classList.remove('fading');
        }, FADE_MS);
    }, INTERVAL_MS);
})();
