# -*- coding: utf-8 -*-
"""Produce a body-only HTML fragment (no doctype/html/head/body) for
publishing as a self-contained Claude Artifact. Everything inlined."""
import base64, os, re, glob

ROOT = os.path.join(os.path.dirname(__file__), "..")
WEB = os.path.join(ROOT, "web")
OUT = os.path.join(ROOT, "dist", "artifact.html")

def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()

maplibre_js = read(os.path.join(WEB, "vendor", "maplibre-gl.js"))
maplibre_css = read(os.path.join(WEB, "vendor", "maplibre-gl.css"))
styles_css = read(os.path.join(WEB, "styles.css"))
data_js = "\n".join(read(os.path.join(WEB, "data", f))
                    for f in ["places.js", "anchors.js", "transit.js", "basemap.js", "themes.js"])
geo_js = read(os.path.join(WEB, "js", "geo.js"))
planner_js = read(os.path.join(WEB, "js", "planner.js"))
photos_js = read(os.path.join(WEB, "js", "photos.js"))
app_js = read(os.path.join(WEB, "js", "app.js"))

glyphs = {}
for pbf in glob.glob(os.path.join(WEB, "glyphs", "*", "*.pbf")):
    font = os.path.basename(os.path.dirname(pbf))
    rng = os.path.splitext(os.path.basename(pbf))[0]
    with open(pbf, "rb") as f:
        glyphs[f"{font}/{rng}"] = base64.b64encode(f.read()).decode("ascii")
glyph_json = "{" + ",".join(f'"{k}":"{v}"' for k, v in glyphs.items()) + "}"

app_js = app_js.replace('glyphs: "glyphs/{fontstack}/{range}.pbf"',
                        'glyphs: "bkk://{fontstack}/{range}.pbf"')
app_js = re.sub(
    r'if \("serviceWorker" in navigator\)\s*\n\s*navigator\.serviceWorker\.register\("sw\.js"\)\.catch\(\(\) => \{\}\);',
    '/* no service worker */', app_js)

glyph_boot = """
(function () {
  var GLYPHS = __GLYPH_JSON__;
  function b64(s){var bin=atob(s),n=bin.length,u=new Uint8Array(n);for(var i=0;i<n;i++)u[i]=bin.charCodeAt(i);return u;}
  maplibregl.addProtocol('bkk', function (params) {
    var url = params.url.replace('bkk://', ''); var i = url.lastIndexOf('/');
    var font = decodeURIComponent(url.slice(0, i)); var range = url.slice(i + 1).replace('.pbf', '');
    var key = font + '/' + range;
    var data = GLYPHS[key] ? b64(GLYPHS[key]).buffer : new Uint8Array(0).buffer;
    return Promise.resolve({ data: data });
  });
})();
""".replace("__GLYPH_JSON__", glyph_json)

index = read(os.path.join(WEB, "index.html"))
body = re.search(r"<body>(.*)</body>", index, re.S).group(1)
body = re.sub(r"<script[^>]*>.*?</script>", "", body, flags=re.S)

frag = f"""<style>
{maplibre_css}
{styles_css}
html,body{{margin:0;height:100%;overflow:hidden;}}
</style>
{body}
<script>{maplibre_js}</script>
<script>{data_js}</script>
<script>{geo_js}</script>
<script>{planner_js}</script>
<script>{photos_js}</script>
<script>{glyph_boot}</script>
<script>{app_js}</script>
"""

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(frag)
print("wrote", OUT, "%.2f MB" % (len(frag.encode()) / 1e6))
