// planner.js — multimodal point-to-point routing + full-day optimiser.
(function () {
  const { haversine, walkMinutes, walkRoadKm, taxi, P } = window.GEO;

  // ---- Rail graph (built once from TRANSIT) --------------------------------
  let RAIL = null;
  function buildRail() {
    if (RAIL) return RAIL;
    const nodes = {};   // id -> {id, line, name, lonlat}
    const adj = {};     // id -> [{to, w}]
    const stationsByName = {};
    const addNode = (line, name, lonlat) => {
      const id = line + ":" + name;
      if (!nodes[id]) {
        nodes[id] = { id, line, name, lonlat };
        adj[id] = [];
        (stationsByName[name] ||= []).push(id);
      }
      return id;
    };
    const link = (a, b, w) => { adj[a].push({ to: b, w }); adj[b].push({ to: a, w }); };
    for (const ln of TRANSIT.lines) {
      let prev = null;
      for (const [name, lon, lat] of ln.stations) {
        const id = addNode(ln.id, name, [lon, lat]);
        if (prev) link(prev, id, P.RAIL_PER_STATION_MIN);
        prev = id;
      }
    }
    // same-name interchanges (e.g. Siam on both BTS lines)
    for (const name in stationsByName) {
      const ids = stationsByName[name];
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++)
          link(ids[i], ids[j], P.RAIL_SAMESTATION_MIN);
    }
    // explicit cross-line interchanges (different names, same place)
    const IX = [
      ["BTS-Sukhumvit:Asok", "MRT-Blue:Sukhumvit"],
      ["BTS-Silom:Sala Daeng", "MRT-Blue:Si Lom"],
      ["BTS-Sukhumvit:Mo Chit", "MRT-Blue:Chatuchak Park"]
    ];
    for (const [a, b] of IX) if (nodes[a] && nodes[b]) link(a, b, P.RAIL_TRANSFER_MIN);
    RAIL = { nodes, adj, list: Object.values(nodes) };
    return RAIL;
  }

  function nearestNode(list, lonlat, maxM) {
    let best = null, bd = Infinity;
    for (const n of list) {
      const d = haversine(lonlat, n.lonlat);
      if (d < bd) { bd = d; best = n; }
    }
    return bd <= maxM ? { node: best, dist: bd } : null;
  }

  // Dijkstra over the rail graph; returns {min, path:[node]} or null.
  function railPath(srcId, dstId) {
    const g = buildRail();
    const dist = {}, prev = {}, seen = {};
    for (const id in g.nodes) dist[id] = Infinity;
    dist[srcId] = 0;
    const pq = [[0, srcId]];
    while (pq.length) {
      pq.sort((a, b) => a[0] - b[0]);
      const [d, u] = pq.shift();
      if (seen[u]) continue; seen[u] = true;
      if (u === dstId) break;
      for (const e of g.adj[u]) {
        const nd = d + e.w;
        if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; pq.push([nd, e.to]); }
      }
    }
    if (dist[dstId] === Infinity) return null;
    const path = []; let cur = dstId;
    while (cur !== undefined) { path.unshift(g.nodes[cur]); cur = prev[cur]; }
    return { min: dist[dstId], path };
  }

  function nearestPierIndex(lonlat, maxM) {
    let bi = -1, bd = Infinity;
    TRANSIT.piers.forEach((p, i) => {
      const d = haversine(lonlat, [p[1], p[2]]);
      if (d < bd) { bd = d; bi = i; }
    });
    return bd <= maxM ? { i: bi, dist: bd } : null;
  }

  // ---- Multimodal route between two [lon,lat] points -----------------------
  // Returns { best, options:[{mode,min,fare,legs,geometry,label}] }
  function route(a, b) {
    const straight = haversine(a, b);
    const options = [];

    // WALK
    {
      const min = walkMinutes(straight);
      options.push({
        mode: "walk", min, fare: 0, km: walkRoadKm(straight),
        label: "Пешком", geometry: [a, b], legs: [{ t: "walk", min }]
      });
    }
    // RAIL
    {
      const g = buildRail();
      const sA = nearestNode(g.list, a, P.RAIL_SNAP_M);
      const sB = nearestNode(g.list, b, P.RAIL_SNAP_M);
      if (sA && sB && sA.node.id !== sB.node.id) {
        const rp = railPath(sA.node.id, sB.node.id);
        if (rp) {
          const wA = walkMinutes(sA.dist), wB = walkMinutes(sB.dist);
          const min = wA + P.RAIL_WAIT_MIN + rp.min + wB;
          const hops = rp.path.length - 1;
          const fare = Math.min(P.RAIL_FARE_MAX,
            P.RAIL_FARE_BASE + hops * P.RAIL_FARE_PER_STATION);
          const geom = [a, sA.node.lonlat, ...rp.path.map(n => n.lonlat), b];
          options.push({
            mode: "rail", min, fare, geometry: geom,
            label: "Метро (BTS/MRT)",
            legs: [
              { t: "walk", min: wA, to: sA.node.name },
              { t: "rail", min: rp.min + P.RAIL_WAIT_MIN, from: sA.node.name, to: sB.node.name, hops },
              { t: "walk", min: wB }
            ]
          });
        }
      }
    }
    // BOAT
    {
      const pA = nearestPierIndex(a, P.BOAT_SNAP_M);
      const pB = nearestPierIndex(b, P.BOAT_SNAP_M);
      if (pA && pB && pA.i !== pB.i) {
        const hops = Math.abs(pA.i - pB.i);
        const wA = walkMinutes(pA.dist), wB = walkMinutes(pB.dist);
        const min = wA + P.BOAT_WAIT_MIN + hops * P.BOAT_PER_PIER_MIN + wB;
        const lo = Math.min(pA.i, pB.i), hi = Math.max(pA.i, pB.i);
        const pierPts = TRANSIT.piers.slice(lo, hi + 1).map(p => [p[1], p[2]]);
        const geom = [a, [TRANSIT.piers[pA.i][1], TRANSIT.piers[pA.i][2]],
          ...pierPts, [TRANSIT.piers[pB.i][1], TRANSIT.piers[pB.i][2]], b];
        options.push({
          mode: "boat", min, fare: P.BOAT_FARE, geometry: geom,
          label: "Катер по реке",
          legs: [{ t: "walk", min: wA, to: TRANSIT.piers[pA.i][0] },
                 { t: "boat", min: hops * P.BOAT_PER_PIER_MIN + P.BOAT_WAIT_MIN },
                 { t: "walk", min: wB }]
        });
      }
    }
    // TAXI / GRAB
    {
      const tx = taxi(straight);
      options.push({
        mode: "taxi", min: tx.min, fare: tx.fare, km: tx.km,
        label: "Такси / Grab", geometry: [a, b], legs: [{ t: "taxi", min: tx.min }]
      });
    }

    // choose best: prefer walk when short & pleasant, else min time
    let best;
    const walk = options.find(o => o.mode === "walk");
    if (straight * P.DETOUR <= P.WALK_PREFER_M) best = walk;
    else best = options.slice().sort((x, y) => x.min - y.min)[0];
    return { best, options, straight };
  }

  // ---- Day optimiser -------------------------------------------------------
  const DWELL = { // minutes on-site by category
    temple: 60, sight: 75, mall: 90, market: 75, district: 50,
    rooftop: 90, bar: 90, cafe: 55, shop: 30, floating: 90, river: 45
  };
  const DAYPART_RANK = { morning: 0, day: 1, any: 1, evening: 2 };

  function tspOrder(items, startLonLat) {
    // nearest-neighbour chain by travel time, then 2-opt on straight distance
    if (items.length <= 2) return items.slice();
    const pts = items.map(p => [p.lon, p.lat]);
    const used = new Array(items.length).fill(false);
    const order = [];
    // start from item nearest to startLonLat (or first)
    let cur = 0, bd = Infinity;
    pts.forEach((p, i) => { const d = haversine(startLonLat || pts[0], p); if (d < bd) { bd = d; cur = i; } });
    used[cur] = true; order.push(cur);
    for (let k = 1; k < items.length; k++) {
      let nb = -1, best = Infinity;
      for (let j = 0; j < items.length; j++) if (!used[j]) {
        const d = haversine(pts[order[order.length - 1]], pts[j]);
        if (d < best) { best = d; nb = j; }
      }
      used[nb] = true; order.push(nb);
    }
    // 2-opt
    const dist = (i, j) => haversine(pts[i], pts[j]);
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < order.length - 1; i++) {
        for (let j = i + 1; j < order.length; j++) {
          const a = order[i - 1] ?? order[i], b = order[i];
          const c = order[j], d = order[j + 1] ?? order[j];
          const before = dist(a, b) + dist(c, d);
          const after = dist(a, c) + dist(b, d);
          if (after + 1e-6 < before) {
            const seg = order.slice(i, j + 1).reverse();
            order.splice(i, seg.length, ...seg);
            improved = true;
          }
        }
      }
    }
    return order.map(i => items[i]);
  }

  // Build a timed itinerary for a date (11..15) starting at startMin (minutes).
  // date -> weekday index Mon..Sun
  const DATE_WD = { 11: 6, 12: 0, 13: 1, 14: 2, 15: 3 };

  function planDay(placeIds, dateNum, startMin, startLonLat) {
    const all = placeIds.map(id => PLACES.find(p => p.id === id)).filter(Boolean);
    const wd = DATE_WD[dateNum];
    const excluded = [];
    const usable = all.filter(p => {
      const st = p.trip[String(dateNum)];
      if (st === "closed") { excluded.push({ p, reason: "закрыто в этот день" }); return false; }
      return true;
    });
    // bucket by daypart, TSP within each, concatenate morning->day->evening
    const buckets = { 0: [], 1: [], 2: [] };
    for (const p of usable) buckets[DAYPART_RANK[p.daypart] ?? 1].push(p);
    let ordered = [];
    let anchor = startLonLat;
    for (const b of [0, 1, 2]) {
      if (!buckets[b].length) continue;
      const seg = tspOrder(buckets[b], anchor);
      ordered = ordered.concat(seg);
      anchor = [seg[seg.length - 1].lon, seg[seg.length - 1].lat];
    }
    // schedule
    const steps = [];
    let t = startMin;
    let prev = startLonLat;
    let totalWalkKm = 0, totalCost = 0, totalTravelMin = 0;
    for (const p of ordered) {
      let leg = null;
      if (prev) {
        const r = route(prev, [p.lon, p.lat]);
        leg = r.best;
        t += leg.min;
        totalTravelMin += leg.min;
        if (leg.mode === "walk") {
          totalWalkKm += leg.km || 0;
        } else {
          // sum the on-foot access/egress sub-legs: km = (min/60)·v_eff
          const wmin = (leg.legs || []).filter(x => x.t === "walk")
            .reduce((s, x) => s + x.min, 0);
          totalWalkKm += wmin / 60 * window.GEO.effWalkKmh();
        }
      }
      // opening-hours check
      const oh = p.hours[wd];
      let warn = null;
      if (!oh) warn = "закрыто в этот день недели";
      else {
        if (t < oh[0]) { t = oh[0]; } // wait until opening
        if (t >= oh[1]) warn = "приход после закрытия";
      }
      const arrive = t;
      const dwell = DWELL[p.cat] ?? 60;
      t += dwell;
      const depart = t;
      if (p.price && p.price.baht) totalCost += p.price.baht;
      steps.push({ place: p, leg, arrive, depart, dwell, warn });
      prev = [p.lon, p.lat];
    }
    return {
      dateNum, wd, startMin, steps, excluded,
      totalTravelMin, totalWalkKm, totalCost,
      endMin: t
    };
  }

  window.PLANNER = { route, planDay, buildRail, DWELL };
})();
