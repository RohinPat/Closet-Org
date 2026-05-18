THEME = """    <script>
        (function () {
            var pref = 'light';
            try {
                var u = JSON.parse(localStorage.getItem('user') || '{}');
                pref = u.theme_preference || localStorage.getItem('closet_theme') || 'light';
            } catch (e) {}
            if (pref === 'system') {
                pref = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            }
            document.documentElement.setAttribute('data-theme', pref === 'dark' ? 'dark' : 'light');
        })();
    </script>
"""

from pathlib import Path

d = "d" + "iv"

for name in ("register.html", "forgot-password.html"):
    p = Path(__file__).parent / name
    t = p.read_text(encoding="utf-8")
    if "data-theme" not in t:
        t = t.replace("</head>", THEME + "</head>", 1)
    if 'class="auth-page"' not in t:
        t = t.replace("<body>", '<body class="auth-page">', 1)
    t = t.replace(f'        <{d} class="bg-gradient"></{d}>\n', "")
    for i in (1, 2, 3):
        t = t.replace(f'        <{d} class="bg-circle circle-{i}"></{d}>\n', "")
    p.write_text(t, encoding="utf-8")
    print(name, "ok")

Path(__file__).unlink(missing_ok=True)
