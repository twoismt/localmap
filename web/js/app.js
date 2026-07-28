// app.js — UI, map, and glue.
(function () {
  const CAT = {
    temple:   { ru: "Храмы",        icon: "🛕", color: "#C1440E" },
    sight:    { ru: "Музеи и парки",icon: "🏛️", color: "#7B4FB0" },
    mall:     { ru: "ТЦ",           icon: "🛍️", color: "#E0699F" },
    market:   { ru: "Рынки",        icon: "🧺", color: "#E0913A" },
    district: { ru: "Районы",       icon: "🚶", color: "#5A7D5A" },
    rooftop:  { ru: "Руфтопы",      icon: "🍸", color: "#2E7BB5" },
    bar:      { ru: "Бары/клубы",   icon: "🍹", color: "#8E44AD" },
    cafe:     { ru: "Кафе",         icon: "☕", color: "#A9744F" },
    shop:     { ru: "Магазины",     icon: "🎁", color: "#D6455F" },
    floating: { ru: "Плавучие рынки",icon: "🛶", color: "#1B998B" },
    river:    { ru: "Река",         icon: "🌊", color: "#2389C6" }
  };
  const DATES = [
    { d: 11, wd: "вс" }, { d: 12, wd: "пн" }, { d: 13, wd: "вт" },
    { d: 14, wd: "ср" }, { d: 15, wd: "чт" }
  ];
  const WD_FULL = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
  const DATE_WD = { 11: 6, 12: 0, 13: 1, 14: 2, 15: 3 };

  const store = {
    date: 14,
    fav: new Set(JSON.parse(localStorage.getItem("bkk_fav") || "[]")),
    plan: JSON.parse(localStorage.getItem("bkk_plan") || "[]"),
    filter: new Set(),
    search: "",
    userLoc: null,
    routeOrigin: null,
    realMap: localStorage.getItem("bkk_realmap") !== "0" // default on (needs internet)
  };
  const saveFav = () => localStorage.setItem("bkk_fav", JSON.stringify([...store.fav]));
  const savePlan = () => localStorage.setItem("bkk_plan", JSON.stringify(store.plan));

  // ---------- helpers ----------
  const $ = s => document.querySelector(s);
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const fmtMin = m => { m = Math.round(m); const h = Math.floor(m / 60) % 24, mm = m % 60; return h + ":" + String(mm).padStart(2, "0"); };
  const hhmm = m => { m = Math.round(m); const h = Math.floor(m / 60) % 24, mm = m % 60; return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0"); };
  const fmtDur = m => { m = Math.round(m); return m < 60 ? m + " мин" : Math.floor(m / 60) + " ч " + (m % 60 ? (m % 60) + " м" : ""); };
  const hoursStr = h => h ? fmtMin(h[0]) + "–" + fmtMin(h[1]) : "закрыто";
  const placeById = id => PLACES.find(p => p.id === id);

  function statusForDate(p, date) {
    const st = p.trip[String(date)];
    const wd = DATE_WD[date];
    const oh = p.hours[wd];
    if (st === "closed" || !oh) return { cls: "bad", label: "Закрыто" };
    if (st === "crowded") return { cls: "warn", label: "Открыто · многолюдно" };
    if (st === "limited") return { cls: "warn", label: "Открыто · ограниченно" };
    return { cls: "ok", label: "Открыто " + hoursStr(oh) };
  }
  function priceStr(p) {
    if (p.price.free) return "Бесплатно";
    if (p.price.baht != null) return p.price.baht + " ฿" + (p.price.rub ? " · " + p.price.rub + " ₽" : "");
    if (p.price.byMenu) return "По меню";
    return "—";
  }

  // ---------- map ----------
  let map;
  function initMap() {
    map = new maplibregl.Map({
      container: "map",
      style: baseStyle(),
      center: [100.510, 13.742], zoom: 12.2, attributionControl: false,
      maxBounds: [[100.05, 13.30], [100.95, 14.05]], maxZoom: 19
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => { addDataLayers(); wireMap(); });
  }

  function baseStyle() {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return {
      version: 8,
      glyphs: "glyphs/{fontstack}/{range}.pbf",
      sources: {},
      layers: [{
        id: "bg", type: "background",
        paint: { "background-color": dark ? "#191a1d" : "#e9ece9" }
      }]
    };
  }

  function railGeoJSON() {
    return {
      type: "FeatureCollection",
      features: TRANSIT.lines.map(l => ({
        type: "Feature", properties: { color: l.color },
        geometry: { type: "LineString", coordinates: l.stations.map(s => [s[1], s[2]]) }
      }))
    };
  }
  function stationsGeoJSON() {
    const feats = [];
    TRANSIT.lines.forEach(l => l.stations.forEach(s =>
      feats.push({ type: "Feature", properties: { name: s[0], color: l.color },
        geometry: { type: "Point", coordinates: [s[1], s[2]] } })));
    return { type: "FeatureCollection", features: feats };
  }
  function centroidGeoJSON(polys) {
    return { type: "FeatureCollection", features: polys.map(p => {
      let x = 0, y = 0, n = p.coords.length - 1;
      for (let i = 0; i < n; i++) { x += p.coords[i][0]; y += p.coords[i][1]; }
      return { type: "Feature", properties: { name: p.name },
        geometry: { type: "Point", coordinates: [x / n, y / n] } };
    }) };
  }
  function placesGeoJSON() {
    return {
      type: "FeatureCollection",
      features: PLACES.map(p => ({
        type: "Feature",
        properties: { id: p.id, color: CAT[p.cat].color, name: p.nameRu, cat: p.cat },
        geometry: { type: "Point", coordinates: [p.lon, p.lat] }
      }))
    };
  }

  function addDataLayers() {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    // river
    map.addSource("river", { type: "geojson", data: BASEMAP.river });
    map.addLayer({ id: "river", type: "line", source: "river",
      paint: { "line-color": dark ? "#274156" : "#a9d3ef", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 6, 15, 26], "line-opacity": .9 } });
    // parks
    map.addSource("parks", { type: "geojson", data: {
      type: "FeatureCollection", features: BASEMAP.parks.map(p => ({
        type: "Feature", properties: { name: p.name },
        geometry: { type: "Polygon", coordinates: [p.coords] } })) } });
    map.addLayer({ id: "parks", type: "fill", source: "parks",
      paint: { "fill-color": dark ? "#1e3324" : "#cdeccf", "fill-opacity": .8 } });
    // canals
    map.addSource("canals", { type: "geojson", data: {
      type: "FeatureCollection", features: BASEMAP.canals.map(c => ({
        type: "Feature", properties: { name: c.name },
        geometry: { type: "LineString", coordinates: c.coords } })) } });
    map.addLayer({ id: "canals", type: "line", source: "canals",
      paint: { "line-color": dark ? "#274156" : "#bcdcf0",
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.5, 16, 6], "line-opacity": .85 } });
    // roads (casing under, fill over) — width by class
    map.addSource("roads", { type: "geojson", data: {
      type: "FeatureCollection", features: BASEMAP.roads.map(r => ({
        type: "Feature", properties: { name: r.name, class: r.class || "street" },
        geometry: { type: "LineString", coordinates: r.coords } })) } });
    const wByClass = (m = 1) => ["interpolate", ["linear"], ["zoom"],
      11, ["match", ["get", "class"], "primary", 3 * m, "secondary", 2 * m, 1 * m],
      14, ["match", ["get", "class"], "primary", 8 * m, "secondary", 5 * m, 2.5 * m],
      17, ["match", ["get", "class"], "primary", 18 * m, "secondary", 12 * m, 6 * m]];
    map.addLayer({ id: "roads-case", type: "line", source: "roads",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": dark ? "#0f1012" : "#d7dbd7", "line-width": wByClass(1.35) } });
    map.addLayer({ id: "roads", type: "line", source: "roads",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": dark ? "#3c4046" : "#ffffff", "line-width": wByClass(1) } });
    // REAL street map (OpenStreetMap via CARTO) — loads with internet on the
    // device and shows every street exactly; when offline the tiles simply
    // don't load and the schematic base below shows through as a fallback.
    const sub = dark ? "dark_all" : "voyager";
    map.addSource("osm", {
      type: "raster", tileSize: 256, maxzoom: 20,
      attribution: '© OpenStreetMap · © CARTO',
      tiles: ["a", "b", "c", "d"].map(s => `https://${s}.basemaps.cartocdn.com/rastertiles/${sub}/{z}/{x}/{y}.png`)
    });
    map.addLayer({ id: "osm", type: "raster", source: "osm",
      layout: { visibility: store.realMap ? "visible" : "none" },
      paint: { "raster-fade-duration": 200 } });
    // rail lines
    map.addSource("rail", { type: "geojson", data: railGeoJSON() });
    map.addLayer({ id: "rail", type: "line", source: "rail",
      paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2, 16, 4], "line-opacity": .9, "line-dasharray": [2, 1.2] } });
    // rail stations
    map.addSource("stations", { type: "geojson", data: stationsGeoJSON() });
    map.addLayer({ id: "stations", type: "circle", source: "stations",
      minzoom: 12.5,
      paint: { "circle-radius": 3.2, "circle-color": "#fff", "circle-stroke-width": 2, "circle-stroke-color": ["get", "color"] } });
    // canal boat line (Saen Saep)
    map.addSource("canalboat", { type: "geojson", data: {
      type: "Feature", properties: {},
      geometry: { type: "LineString", coordinates: TRANSIT.canal.stops.map(s => [s[1], s[2]]) } } });
    map.addLayer({ id: "canalboat", type: "line", source: "canalboat",
      paint: { "line-color": TRANSIT.canal.color, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2, 16, 4], "line-dasharray": [3, 1.5], "line-opacity": .9 } });
    map.addSource("canalstops", { type: "geojson", data: {
      type: "FeatureCollection", features: TRANSIT.canal.stops.map(s => ({
        type: "Feature", properties: { name: s[0] }, geometry: { type: "Point", coordinates: [s[1], s[2]] } })) } });
    map.addLayer({ id: "canalstops", type: "circle", source: "canalstops", minzoom: 12.5,
      paint: { "circle-radius": 3, "circle-color": "#fff", "circle-stroke-width": 2, "circle-stroke-color": TRANSIT.canal.color } });
    // route (dynamic)
    map.addSource("route", { type: "geojson", data: empty() });
    map.addLayer({ id: "route", type: "line", source: "route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#1a73e8", "line-width": 5, "line-opacity": .9, "line-dasharray": [1, 0] } });
    // places
    map.addSource("places", { type: "geojson", data: placesGeoJSON() });
    map.addLayer({ id: "places", type: "circle", source: "places",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4, 14, 7, 16, 9],
        "circle-color": ["get", "color"], "circle-stroke-width": 2, "circle-stroke-color": "#fff"
      } });

    // ---- LABELS ----
    const halo = dark ? "#191a1d" : "#ffffff";
    const inkC = dark ? "#e8eaed" : "#3c4043";
    // river
    map.addLayer({ id: "river-label", type: "symbol", source: "river",
      layout: { "symbol-placement": "line", "text-field": "Чао Прайя", "text-font": ["DejaVu Sans"],
        "text-size": 13, "text-letter-spacing": 0.1 },
      paint: { "text-color": dark ? "#6ba3c9" : "#4a90c2", "text-halo-color": halo, "text-halo-width": 1.4 } });
    // canals
    map.addLayer({ id: "canal-label", type: "symbol", source: "canals", minzoom: 13,
      layout: { "symbol-placement": "line", "text-field": ["get", "name"], "text-font": ["DejaVu Sans"], "text-size": 10.5 },
      paint: { "text-color": dark ? "#6ba3c9" : "#5b9bc7", "text-halo-color": halo, "text-halo-width": 1.2 } });
    // roads
    map.addLayer({ id: "road-label", type: "symbol", source: "roads", minzoom: 12.5,
      layout: { "symbol-placement": "line", "text-field": ["get", "name"], "text-font": ["DejaVu Sans"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 12.5, 9, 16, ["match", ["get", "class"], "primary", 14, "secondary", 12, 11]],
        "symbol-spacing": 260 },
      paint: { "text-color": inkC, "text-halo-color": halo, "text-halo-width": 1.6 } });
    // parks (centroid points)
    map.addSource("parkLabels", { type: "geojson", data: centroidGeoJSON(BASEMAP.parks) });
    map.addLayer({ id: "park-label", type: "symbol", source: "parkLabels", minzoom: 12.5,
      layout: { "text-field": ["get", "name"], "text-font": ["DejaVu Sans"], "text-size": 11, "text-max-width": 8 },
      paint: { "text-color": dark ? "#7ba76f" : "#3f7a3a", "text-halo-color": halo, "text-halo-width": 1.2 } });
    // districts
    map.addSource("districts", { type: "geojson", data: {
      type: "FeatureCollection", features: BASEMAP.districts.map(d => ({
        type: "Feature", properties: { name: d.name }, geometry: { type: "Point", coordinates: [d.lon, d.lat] } })) } });
    map.addLayer({ id: "district-label", type: "symbol", source: "districts", maxzoom: 15.5,
      layout: { "text-field": ["get", "name"], "text-font": ["DejaVu Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10, 14, 13.5],
        "text-letter-spacing": 0.05, "text-transform": "uppercase" },
      paint: { "text-color": dark ? "#9aa0a6" : "#8a9099", "text-halo-color": halo, "text-halo-width": 1.6 } });
    // stations
    map.addLayer({ id: "station-label", type: "symbol", source: "stations", minzoom: 13.8,
      layout: { "text-field": ["get", "name"], "text-font": ["DejaVu Sans"], "text-size": 9.5,
        "text-offset": [0, 0.9], "text-anchor": "top", "text-optional": true },
      paint: { "text-color": ["get", "color"], "text-halo-color": halo, "text-halo-width": 1.3 } });
    // canal boat line + stops
    map.addLayer({ id: "canalboat-label", type: "symbol", source: "canalboat", minzoom: 12.5,
      layout: { "symbol-placement": "line", "text-field": "Лодка Саенсэп", "text-font": ["DejaVu Sans"], "text-size": 10.5 },
      paint: { "text-color": TRANSIT.canal.color, "text-halo-color": halo, "text-halo-width": 1.3 } });
    map.addLayer({ id: "canalstop-label", type: "symbol", source: "canalstops", minzoom: 14,
      layout: { "text-field": ["get", "name"], "text-font": ["DejaVu Sans"], "text-size": 9,
        "text-offset": [0, 0.9], "text-anchor": "top", "text-optional": true },
      paint: { "text-color": TRANSIT.canal.color, "text-halo-color": halo, "text-halo-width": 1.2 } });
    // place names
    map.addLayer({ id: "place-label", type: "symbol", source: "places", minzoom: 13.5,
      layout: { "text-field": ["get", "name"], "text-font": ["DejaVu Sans"], "text-size": 11,
        "text-offset": [0, 1.1], "text-anchor": "top", "text-max-width": 9, "text-optional": true },
      paint: { "text-color": inkC, "text-halo-color": halo, "text-halo-width": 1.5 } });
    // highlight source
    map.addSource("hi", { type: "geojson", data: empty() });
    map.addLayer({ id: "hi", type: "circle", source: "hi",
      paint: { "circle-radius": 11, "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 3, "circle-stroke-color": "#1a73e8" } });
    // user location
    map.addSource("me", { type: "geojson", data: empty() });
    map.addLayer({ id: "me", type: "circle", source: "me",
      paint: { "circle-radius": 8, "circle-color": "#1a73e8", "circle-stroke-width": 3, "circle-stroke-color": "#fff" } });
    // Put the schematic base labels BELOW the real map so, online, OSM's own
    // street names show (no duplicates); offline they reappear as fallback.
    ["river-label", "canal-label", "road-label", "park-label", "district-label"]
      .forEach(id => { if (map.getLayer(id)) map.moveLayer(id, "osm"); });
  }
  const empty = () => ({ type: "FeatureCollection", features: [] });

  function wireMap() {
    map.on("click", "places", e => { const id = e.features[0].properties.id; openPlace(+id); });
    map.on("mouseenter", "places", () => map.getCanvas().style.cursor = "pointer");
    map.on("mouseleave", "places", () => map.getCanvas().style.cursor = "");
    refreshMapFilter();
  }
  function refreshMapFilter() {
    if (!map || !map.getLayer("places")) return;
    const cats = store.filter.size ? [...store.filter] : null;
    const f = cats ? ["in", ["get", "cat"], ["literal", cats]] : null;
    map.setFilter("places", f);
    if (map.getLayer("place-label")) map.setFilter("place-label", f);
  }
  function highlight(p) {
    map.getSource("hi").setData({ type: "FeatureCollection",
      features: p ? [{ type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat] } }] : [] });
  }
  function drawRoute(geometry) {
    map.getSource("route").setData(geometry ? { type: "Feature", geometry: { type: "LineString", coordinates: geometry } } : empty());
  }

  // ---------- top bar ----------
  function buildDateChips() {
    const c = $("#dateChips"); c.innerHTML = "";
    DATES.forEach(x => {
      const b = el("button", "date-chip" + (x.d === store.date ? " active" : ""),
        `${x.d} окт<small>${x.wd}${x.d === 13 ? " · праздник" : ""}</small>`);
      b.onclick = () => { store.date = x.d; buildDateChips(); renderAll(); };
      c.appendChild(b);
    });
  }

  // ---------- places tab ----------
  function buildCatFilters() {
    const c = $("#catFilters"); c.innerHTML = "";
    Object.entries(CAT).forEach(([k, v]) => {
      const on = store.filter.has(k);
      const b = el("button", "cat-pill" + (on ? " on" : ""),
        `<span class="cat-dot" style="background:${on ? "#fff" : v.color}"></span>${v.icon} ${v.ru}`);
      if (on) b.style.background = v.color;
      b.onclick = () => { store.filter.has(k) ? store.filter.delete(k) : store.filter.add(k); buildCatFilters(); renderPlaceList(); refreshMapFilter(); };
      c.appendChild(b);
    });
  }
  function filteredPlaces() {
    const q = store.search.trim().toLowerCase();
    return PLACES.filter(p => {
      if (store.filter.size && !store.filter.has(p.cat)) return false;
      if (q) {
        const hay = (p.nameRu + " " + p.nameEn + " " + p.address + " " + p.desc).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }
  function placeCard(p) {
    const v = CAT[p.cat]; const st = statusForDate(p, store.date);
    const card = el("div", "card");
    card.innerHTML =
      `<div class="ic" style="background:${v.color}">${v.icon}</div>
       <div class="body">
         <div class="t">${p.nameRu}</div>
         <div class="sub">${v.ru} · ${p.address}</div>
         <div class="meta">
           <span class="badge ${st.cls}">${st.label}</span>
           <span class="badge">${priceStr(p)}</span>
         </div>
       </div>
       <button class="fav-star ${store.fav.has(p.id) ? "on" : ""}">${store.fav.has(p.id) ? "★" : "☆"}</button>`;
    card.querySelector(".body").onclick = () => openPlace(p.id);
    card.querySelector(".ic").onclick = () => flyTo(p);
    card.querySelector(".fav-star").onclick = e => { e.stopPropagation(); toggleFav(p.id); };
    return card;
  }
  function renderPlaceList() {
    const list = $("#placeList"); list.innerHTML = "";
    const items = filteredPlaces();
    if (!items.length) { list.appendChild(el("div", "empty", "Ничего не найдено")); return; }
    const order = { temple:1,sight:2,mall:3,market:4,district:5,rooftop:6,bar:7,cafe:8,shop:9,floating:10,river:11 };
    items.sort((a, b) => (order[a.cat] - order[b.cat]) || a.id - b.id);
    items.forEach(p => list.appendChild(placeCard(p)));
  }

  // ---------- routes (themes) tab ----------
  function renderThemes() {
    const c = $("#tab-routes"); c.innerHTML = "";
    c.appendChild(el("div", "hint-bar",
      "Готовые маршруты на день (составлены по реальному опыту путешественников). Нажмите «Построить план» — приложение оптимизирует порядок под выбранную дату и уберёт закрытые места."));
    c.appendChild(el("div", "hint-bar",
      "🚇 Как перемещаться: <b>BTS/MRT</b> — быстро и без пробок; <b>речной экспресс</b> и <b>паром</b> (5 ฿) вдоль/через Чао Прайю; <b>лодка по каналу Саенсэп</b> (12–20 ฿) в обход пробок Старый город↔Сиам↔Сукхумвит; <b>мотобайк/GrabBike</b> — самый быстрый на короткие концы (20–60 ฿). Маршрутизатор сам подбирает лучший способ между точками."));
    THEMES.forEach(t => {
      const openCount = t.places.map(placeById).filter(p => p && p.trip[String(store.date)] !== "closed").length;
      const rec = t.recDates.includes(store.date);
      const div = el("div", "theme");
      div.innerHTML =
        `<h3>${t.icon} ${t.title}</h3>
         <div class="blurb">${t.blurb}</div>
         ${t.transport ? `<div class="note" style="color:var(--muted)">🚇 ${t.transport}</div>` : ""}
         <div class="note">⚠ ${t.note}</div>
         <div class="meta" style="margin-bottom:8px">
           <span class="badge">${t.area}</span>
           <span class="badge">старт ${t.start}</span>
           <span class="badge ${rec ? "ok" : "warn"}">${rec ? "хорошо на " + store.date + " окт" : "лучше: " + t.recDates.map(d => d + "").join(", ") + " окт"}</span>
           <span class="badge">${openCount}/${t.places.length} открыто</span>
         </div>
         <div class="row">
           <button class="btn build">🧭 Построить план</button>
           <button class="btn ghost show">Показать на карте</button>
         </div>`;
      div.querySelector(".build").onclick = () => buildThemePlan(t);
      div.querySelector(".show").onclick = () => showThemeOnMap(t);
      c.appendChild(div);
    });
  }
  function showThemeOnMap(t) {
    const pts = t.places.map(placeById).filter(Boolean);
    const b = new maplibregl.LngLatBounds();
    pts.forEach(p => b.extend([p.lon, p.lat]));
    map.fitBounds(b, { padding: 70, maxZoom: 15 });
    collapseSheet();
  }
  function buildThemePlan(t) {
    const [h, m] = t.start.split(":").map(Number);
    const startPlace = placeById(t.places[0]);
    const res = window.PLANNER.planDay(t.places, store.date, h * 60 + m, [startPlace.lon, startPlace.lat]);
    store.plan = res.steps.map(s => s.place.id);
    savePlan();
    lastPlanMeta = { start: h * 60 + m, title: t.title };
    switchTab("plan");
    renderPlan();
  }

  // ---------- plan tab ----------
  let lastPlanMeta = { start: 9 * 60, title: "" };
  function renderPlan() {
    const c = $("#tab-plan"); c.innerHTML = "";
    if (!store.plan.length) {
      c.appendChild(el("div", "empty", "План пуст. Откройте «Маршруты» и постройте план, или добавляйте места кнопкой «В план»."));
      return;
    }
    const res = window.PLANNER.planDay(store.plan, store.date, lastPlanMeta.start, null);
    // head stats
    const head = el("div", "plan-head");
    head.innerHTML =
      `<div class="plan-stat"><b>${res.steps.length}</b> мест</div>
       <div class="plan-stat"><b>${fmtDur(res.totalTravelMin)}</b> в пути</div>
       <div class="plan-stat"><b>${res.totalWalkKm.toFixed(1)} км</b> пешком</div>
       <div class="plan-stat"><b>${res.totalCost} ฿</b> билеты</div>
       <div class="plan-stat"><b>${fmtMin(res.startMin)}–${fmtMin(res.endMin)}</b></div>`;
    c.appendChild(head);
    const bar = el("div", "row"); bar.style.margin = "0 0 12px";
    const startInput = el("input"); startInput.type = "time"; startInput.value = hhmm(lastPlanMeta.start);
    startInput.style.cssText = "padding:7px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink)";
    startInput.onchange = () => { const [h, m] = startInput.value.split(":").map(Number); lastPlanMeta.start = h * 60 + m; renderPlan(); };
    bar.append(el("span", "", "Старт: "), startInput);
    const exp = el("button", "btn ghost sm", "🖨 Экспорт");
    exp.onclick = () => window.print();
    const clr = el("button", "btn ghost sm", "Очистить");
    clr.onclick = () => { store.plan = []; savePlan(); renderPlan(); };
    bar.append(exp, clr);
    c.appendChild(bar);

    if (res.excluded.length)
      c.appendChild(el("div", "hint-bar", "⚠ Убрано (закрыто " + store.date + " окт): " +
        res.excluded.map(e => e.p.nameRu).join(", ")));

    const routeGeom = [];
    res.steps.forEach((s, i) => {
      const step = el("div", "step");
      if (s.leg) {
        step.appendChild(el("div", "leg", legIcon(s.leg.mode) + " " + s.leg.label +
          " · " + fmtDur(s.leg.min) + (s.leg.fare ? " · " + Math.round(s.leg.fare) + " ฿" : "")));
        (s.leg.geometry || []).forEach(pt => routeGeom.push(pt));
      }
      const v = CAT[s.place.cat];
      const pl = el("div", "step-inner");
      pl.innerHTML =
        `<span class="dot" style="background:${v.color}"></span>
         <div class="pl">
           <span class="time">${fmtMin(s.arrive)}–${fmtMin(s.depart)}</span> · ${v.icon} <b>${s.place.nameRu}</b>
           ${s.warn ? `<div class="badge bad" style="margin-top:4px">${s.warn}</div>` : ""}
           <div class="sub" style="color:var(--muted);font-size:12px;margin-top:3px">${priceStr(s.place)} · ${s.place.address}</div>
         </div>`;
      pl.querySelector(".pl").onclick = () => openPlace(s.place.id);
      step.appendChild(pl);
      c.appendChild(step);
    });
    drawRoute(routeGeom);
    drawPlanDetailed(res.steps);
    fitTo(res.steps.map(s => s.place));
  }
  async function drawPlanDetailed(steps) {
    const parts = [];
    for (const s of steps) {
      if (!s.leg) continue;
      try { const g = await window.PLANNER.buildDetailed(s.leg); if (g) parts.push(...g); }
      catch (e) { parts.push(...(s.leg.geometry || [])); }
    }
    if (parts.length >= 2) drawRoute(parts);
  }
  function legIcon(m) { return { walk: "🚶", rail: "🚆", boat: "🚤", canal: "🛶", ferry: "⛴️", bike: "🏍️", taxi: "🚕" }[m] || "→"; }

  // ---------- favorites ----------
  function renderFav() {
    const c = $("#tab-fav"); c.innerHTML = "";
    const items = [...store.fav].map(placeById).filter(Boolean);
    if (!items.length) { c.appendChild(el("div", "empty", "Нет избранного. Нажмите ☆ у любого места.")); return; }
    const list = el("div", "list");
    items.forEach(p => list.appendChild(placeCard(p)));
    c.appendChild(list);
    const b = el("button", "btn", "Все избранные → в план");
    b.style.marginTop = "12px";
    b.onclick = () => { store.plan = items.map(p => p.id); savePlan(); switchTab("plan"); renderPlan(); };
    c.appendChild(b);
  }
  function toggleFav(id) {
    store.fav.has(id) ? store.fav.delete(id) : store.fav.add(id);
    saveFav(); renderPlaceList(); renderFav();
    if (curPlace === id) openPlace(id);
  }

  // ---------- place detail overlay ----------
  let curPlace = null;
  function openPlace(id) {
    curPlace = id;
    const p = placeById(id); if (!p) return;
    const v = CAT[p.cat]; const st = statusForDate(p, store.date);
    const wd = DATE_WD[store.date];
    const flags = [];
    if (p.flags.dress) flags.push("👕 Дресс-код");
    if (p.flags.cash) flags.push("💵 Наличные");
    if (p.flags.book) flags.push("📱 Бронь онлайн");
    if (p.flags.far) flags.push("🚗 Далеко");
    if (p.flags.glutenfree) flags.push("🌾 Есть безглютен");
    if (p.flags.reservation) flags.push("💳 Мин. счёт/депозит");
    const card = $("#overlayCard");
    card.innerHTML =
      `<button class="close-x">✕</button>
       <div class="ic" style="background:${v.color};width:40px;height:40px;border-radius:10px;display:grid;place-items:center;font-size:20px;color:#fff">${v.icon}</div>
       <h2>${p.nameRu}</h2>
       <div class="en">${p.nameEn}${p.nameTh ? " · " + p.nameTh : ""}</div>
       <div class="meta" style="margin-top:8px"><span class="badge ${st.cls}">${st.label}</span><span class="badge">${v.ru}</span></div>
       <div class="kv">${p.desc}</div>
       <div class="kv"><b>Часы (${WD_FULL[wd]}):</b> ${hoursStr(p.hours[wd])} · <span style="color:var(--muted)">${p.hoursText}</span></div>
       <div class="kv"><b>Цена:</b> ${priceStr(p)} <span style="color:var(--muted)">(${p.priceText})</span></div>
       <div class="kv"><b>Адрес:</b> ${p.address}</div>
       ${p.features ? `<div class="kv"><b>Особенности:</b> ${p.features}</div>` : ""}
       ${p.availabilityText ? `<div class="kv"><b>Даты:</b> ${p.availabilityText}</div>` : ""}
       ${flags.length ? `<div class="flagrow">${flags.map(f => `<span class="flag">${f}</span>`).join("")}</div>` : ""}
       <div class="actions">
         <button class="btn" data-a="map">На карте</button>
         <button class="btn ghost" data-a="plan">${store.plan.includes(id) ? "✓ В плане" : "+ В план"}</button>
         <button class="btn ghost" data-a="fav">${store.fav.has(id) ? "★ В избранном" : "☆ В избранное"}</button>
         <button class="btn ghost" data-a="route">🧭 Маршрут сюда</button>
         <button class="btn ghost" data-a="from">➡ Отсюда</button>
         <button class="btn ghost" data-a="taxi">🚕 Таксисту</button>
       </div>`;
    card.querySelector(".close-x").onclick = closeOverlay;
    card.querySelectorAll("[data-a]").forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      if (a === "map") { flyTo(p); closeOverlay(); }
      if (a === "plan") { if (!store.plan.includes(id)) store.plan.push(id); savePlan(); openPlace(id); }
      if (a === "fav") toggleFav(id);
      if (a === "route") openRoute(p);
      if (a === "from") { store.routeOrigin = { lonlat: [p.lon, p.lat], label: p.nameRu }; b.textContent = "✓ Точка старта"; }
      if (a === "taxi") openTaxi(p);
    });
    $("#overlay").classList.remove("hidden");
    highlight(p);
  }
  function closeOverlay() { $("#overlay").classList.add("hidden"); curPlace = null; }

  function openTaxi(p) {
    const card = $("#overlayCard");
    card.innerHTML =
      `<button class="close-x">✕</button>
       <div class="taxi-card">
         <div style="color:var(--muted);font-size:13px">Покажите водителю Grab / такси</div>
         <div class="th">${p.nameTh || p.nameEn}</div>
         <div class="addr">📍 ${p.address}, กรุงเทพฯ</div>
         <div class="addr" style="font-size:13px;color:var(--muted)">${p.nameRu}</div>
         <div class="hint">Координаты: ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</div>
       </div>`;
    card.querySelector(".close-x").onclick = () => openPlace(p.id);
    $("#overlay").classList.remove("hidden");
  }

  function openRoute(dest) {
    const card = $("#overlayCard");
    const origins = [];
    if (store.userLoc) origins.push({ id: "me", label: "📍 Моё местоположение", lonlat: store.userLoc });
    // also allow choosing from plan's places / any place could be added; keep simple: me or pick on prompt
    const from = store.routeOrigin || (store.userLoc ? { lonlat: store.userLoc, label: "Моё местоположение" } : null);
    let html = `<button class="close-x">✕</button><h2>🧭 Маршрут</h2>`;
    if (!from) {
      html += `<div class="kv">Откуда строить маршрут? Включите геолокацию (📍 вверху) или выберите отправную точку из списка мест (кнопка появится).</div>
               <div class="actions"><button class="btn" data-a="loc">📍 Определить меня</button></div>`;
      card.innerHTML = html;
      card.querySelector(".close-x").onclick = () => openPlace(dest.id);
      card.querySelector("[data-a=loc]").onclick = () => locate(() => openRoute(dest));
      $("#overlay").classList.remove("hidden");
      return;
    }
    const r = window.PLANNER.route(from.lonlat, [dest.lon, dest.lat]);
    html += `<div class="en">${from.label} → ${dest.nameRu}</div>`;
    r.options.sort((a, b) => (a === r.best ? -1 : b === r.best ? 1 : a.min - b.min));
    r.options.forEach(o => {
      html += `<div class="ropt ${o === r.best ? "best" : ""}" data-mode="${o.mode}">
        <div class="m">${legIcon(o.mode)}</div>
        <div class="info"><b>${o.label}${o === r.best ? " · рекомендуется" : ""}</b>
          <small>${o.fare ? Math.round(o.fare) + " ฿" : "бесплатно"}${o.km ? " · " + o.km.toFixed(1) + " км" : ""}</small></div>
        <div class="time">${fmtDur(o.min)}</div></div>`;
    });
    card.innerHTML = html;
    card.querySelector(".close-x").onclick = () => openPlace(dest.id);
    card.querySelectorAll(".ropt").forEach(row => row.onclick = () => {
      const o = r.options.find(x => x.mode === row.dataset.mode);
      drawRoute(o.geometry);
      window.PLANNER.buildDetailed(o).then(g => { if (g) drawRoute(g); });
      closeOverlay(); fitTo([{ lon: from.lonlat[0], lat: from.lonlat[1] }, dest]);
    });
    drawRoute(r.best.geometry);
    window.PLANNER.buildDetailed(r.best).then(g => { if (g) drawRoute(g); });
    $("#overlay").classList.remove("hidden");
  }

  // ---------- geolocation ----------
  function locate(cb) {
    if (!navigator.geolocation) { alert("Геолокация недоступна"); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      store.userLoc = [pos.coords.longitude, pos.coords.latitude];
      store.routeOrigin = { lonlat: store.userLoc, label: "Моё местоположение" };
      map.getSource("me").setData({ type: "FeatureCollection",
        features: [{ type: "Feature", geometry: { type: "Point", coordinates: store.userLoc } }] });
      map.flyTo({ center: store.userLoc, zoom: 14 });
      if (cb) cb();
    }, () => alert("Не удалось определить местоположение. GPS работает офлайн — проверьте разрешение."), { enableHighAccuracy: true, timeout: 8000 });
  }

  // ---------- misc ----------
  function flyTo(p) { map.flyTo({ center: [p.lon, p.lat], zoom: 15.5 }); highlight(p); collapseSheet(); }
  function fitTo(places) {
    if (!places.length) return;
    const b = new maplibregl.LngLatBounds();
    places.forEach(p => b.extend([p.lon, p.lat]));
    map.fitBounds(b, { padding: { top: 90, left: 40, right: 40, bottom: window.innerHeight * 0.5 }, maxZoom: 15 });
  }

  // ---------- sheet / tabs ----------
  function switchTab(name) {
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".tabpane").forEach(p => p.classList.toggle("active", p.id === "tab-" + name));
    expandSheet();
  }
  function expandSheet() { $("#sheet").classList.remove("collapsed"); }
  function collapseSheet() { $("#sheet").classList.add("collapsed"); }

  function renderAll() { buildCatFilters(); renderPlaceList(); renderThemes(); renderPlan(); renderFav(); }

  // ---------- init ----------
  function init() {
    initMap();
    buildDateChips();
    renderAll();
    document.querySelectorAll(".tab").forEach(t => t.onclick = () => switchTab(t.dataset.tab));
    $("#search").oninput = e => { store.search = e.target.value; renderPlaceList(); if (store.search) switchTab("places"); };
    $("#locateBtn").onclick = () => locate();
    $("#fitBtn").onclick = () => fitTo(PLACES.filter(p => !p.flags.far));
    const mapBtn = $("#mapBtn");
    mapBtn.classList.toggle("on", store.realMap);
    mapBtn.onclick = () => {
      store.realMap = !store.realMap;
      localStorage.setItem("bkk_realmap", store.realMap ? "1" : "0");
      mapBtn.classList.toggle("on", store.realMap);
      if (map.getLayer("osm")) map.setLayoutProperty("osm", "visibility", store.realMap ? "visible" : "none");
    };
    $("#overlay").onclick = e => { if (e.target.id === "overlay") closeOverlay(); };
    // grip toggles sheet size
    let gripStart = null;
    const sheet = $("#sheet");
    $("#grip").addEventListener("click", () => {
      sheet.classList.toggle("expanded");
      sheet.classList.remove("collapsed");
    });
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  document.addEventListener("DOMContentLoaded", init);
})();
