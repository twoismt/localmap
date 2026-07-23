# -*- coding: utf-8 -*-
"""Assemble the whole web app into ONE self-contained offline HTML file.
Everything (MapLibre engine, data, fonts) is inlined — no network, no server,
no service worker. Output: dist/bangkok-app.html
"""
import base64, os, re, glob

ROOT = os.path.join(os.path.dirname(__file__), "..")
WEB = os.path.join(ROOT, "web")
OUT_DIR = os.path.join(ROOT, "dist")
OUT = os.path.join(OUT_DIR, "bangkok-app.html")

def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()

# 1. assets
maplibre_js = read(os.path.join(WEB, "vendor", "maplibre-gl.js"))
maplibre_css = read(os.path.join(WEB, "vendor", "maplibre-gl.css"))
styles_css = read(os.path.join(WEB, "styles.css"))

data_js = "\n".join(read(os.path.join(WEB, "data", f))
                    for f in ["places.js", "transit.js", "basemap.js", "themes.js"])
geo_js = read(os.path.join(WEB, "js", "geo.js"))
planner_js = read(os.path.join(WEB, "js", "planner.js"))
app_js = read(os.path.join(WEB, "js", "app.js"))

# 2. glyphs -> base64 map keyed by "<fontstack>/<range>"
glyphs = {}
for pbf in glob.glob(os.path.join(WEB, "glyphs", "*", "*.pbf")):
    font = os.path.basename(os.path.dirname(pbf))
    rng = os.path.splitext(os.path.basename(pbf))[0]
    with open(pbf, "rb") as f:
        glyphs[f"{font}/{rng}"] = base64.b64encode(f.read()).decode("ascii")

glyph_json = "{" + ",".join(f'"{k}":"{v}"' for k, v in glyphs.items()) + "}"

# 3. rewire app.js for single-file: local glyph protocol, no service worker
app_js = app_js.replace(
    'glyphs: "glyphs/{fontstack}/{range}.pbf"',
    'glyphs: "bkk://{fontstack}/{range}.pbf"')
app_js = re.sub(
    r'if \("serviceWorker" in navigator\)\s*\n\s*navigator\.serviceWorker\.register\("sw\.js"\)\.catch\(\(\) => \{\}\);',
    '/* service worker disabled in single-file build */', app_js)

# 4. glyph protocol bootstrap (runs after maplibre loads, before app.js)
glyph_boot = """
(function () {
  var GLYPHS = __GLYPH_JSON__;
  function b64(s){var bin=atob(s),n=bin.length,u=new Uint8Array(n);for(var i=0;i<n;i++)u[i]=bin.charCodeAt(i);return u;}
  maplibregl.addProtocol('bkk', function (params) {
    var url = params.url.replace('bkk://', '');
    var i = url.lastIndexOf('/');
    var font = decodeURIComponent(url.slice(0, i));
    var range = url.slice(i + 1).replace('.pbf', '');
    var key = font + '/' + range;
    var data = GLYPHS[key] ? b64(GLYPHS[key]).buffer : new Uint8Array(0).buffer;
    return Promise.resolve({ data: data });
  });
})();
""".replace("__GLYPH_JSON__", glyph_json)

# 5. body markup from index.html (strip scripts + external links)
index = read(os.path.join(WEB, "index.html"))
body = re.search(r"<body>(.*)</body>", index, re.S).group(1)
body = re.sub(r"<script[^>]*>.*?</script>", "", body, flags=re.S)

html = f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Бангкок" />
<meta name="theme-color" content="#1a73e8" />
<title>Карта Бангкока · офлайн</title>
<style>
{maplibre_css}
{styles_css}
</style>
</head>
<body>
{body}
<script>{maplibre_js}</script>
<script>{data_js}</script>
<script>{geo_js}</script>
<script>{planner_js}</script>
<script>{glyph_boot}</script>
<script>{app_js}</script>
</body>
</html>
"""

os.makedirs(OUT_DIR, exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)

print("wrote", OUT)
print("size: %.2f MB" % (len(html.encode("utf-8")) / 1e6))
print("glyph ranges embedded:", len(glyphs))
