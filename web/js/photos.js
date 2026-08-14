// photos.js — up to 3 photos per place, fetched at runtime from Wikipedia and
// Wikimedia Commons (freely licensed, credited). Landmarks resolve by name;
// smaller venues fall back to geotagged Commons photos near the coordinates.
// Results are cached in localStorage so a place is fetched only once, and the
// cache keeps working offline afterwards.
(function () {
  const CACHE_KEY = "bkk_photos_v1";
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch (e) { cache = {}; }
  const saveCache = () => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) {} };

  const WIKI = "https://en.wikipedia.org/w/api.php";
  const COMMONS = "https://commons.wikimedia.org/w/api.php";

  function jsonp(base, params) {
    // Wikimedia APIs allow CORS via origin=* — plain fetch works in a browser.
    const url = base + "?" + new URLSearchParams(
      Object.assign({ format: "json", origin: "*" }, params)).toString();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    return fetch(url, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : Promise.reject(0))
      .finally(() => clearTimeout(t));
  }

  const thumb = (title, w) => "https://commons.wikimedia.org/wiki/Special:FilePath/" +
    encodeURIComponent(title.replace(/^File:/, "")) + "?width=" + (w || 640);

  const isPhoto = t => /\.(jpe?g|png)$/i.test(t) &&
    !/(logo|icon|map|flag|seal|coat|svg|banner|diagram)/i.test(t);

  // 1) Images used on the place's English Wikipedia article
  async function byArticle(query) {
    const s = await jsonp(WIKI, { action: "query", list: "search", srsearch: query, srlimit: 1 });
    const hit = s && s.query && s.query.search && s.query.search[0];
    if (!hit) return [];
    const r = await jsonp(WIKI, { action: "query", titles: hit.title, prop: "images", imlimit: 20 });
    const pages = r && r.query && r.query.pages ? Object.values(r.query.pages) : [];
    const imgs = (pages[0] && pages[0].images ? pages[0].images : [])
      .map(i => i.title).filter(isPhoto).slice(0, 3);
    return imgs.map(t => ({ src: thumb(t), title: t.replace(/^File:/, ""), from: "Wikipedia" }));
  }

  // 2) Geotagged photos on Commons within a radius of the coordinates
  async function byGeo(lat, lon, radius) {
    const r = await jsonp(COMMONS, {
      action: "query", generator: "geosearch", ggsnamespace: 6,
      ggscoord: lat + "|" + lon, ggsradius: radius || 400, ggslimit: 12
    });
    const pages = r && r.query && r.query.pages ? Object.values(r.query.pages) : [];
    return pages.map(p => p.title).filter(isPhoto).slice(0, 3)
      .map(t => ({ src: thumb(t), title: t.replace(/^File:/, ""), from: "Wikimedia Commons" }));
  }

  // Public: resolve up to 3 photos for a place (cached).
  async function forPlace(place) {
    const key = String(place.id);
    if (cache[key]) return cache[key];
    let out = [];
    try {
      out = await byArticle(place.nameEn + " Bangkok");
      if (out.length < 3) {
        const extra = await byGeo(place.lat, place.lon, 350);
        const seen = new Set(out.map(p => p.title));
        for (const e of extra) { if (out.length >= 3) break; if (!seen.has(e.title)) out.push(e); }
      }
      if (!out.length) out = await byGeo(place.lat, place.lon, 900);
    } catch (e) { /* offline or blocked — cache nothing, retry next time */ }
    if (out.length) { cache[key] = out.slice(0, 3); saveCache(); }
    return out.slice(0, 3);
  }

  window.PHOTOS = { forPlace, cached: id => cache[String(id)] || null };
})();
