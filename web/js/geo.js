// geo.js — geometry + travel-time formulas (all documented).
// Everything here is deterministic and offline.
(function () {
  const EARTH_R = 6371000; // metres
  const toRad = d => d * Math.PI / 180;

  // Haversine great-circle distance between [lon,lat] points, in metres.
  // a2 = sin²(Δφ/2) + cosφ1·cosφ2·sin²(Δλ/2);  d = 2R·atan2(√a2, √(1−a2))
  function haversine(a, b) {
    const dLat = toRad(b[1] - a[1]);
    const dLon = toRad(b[0] - a[0]);
    const lat1 = toRad(a[1]), lat2 = toRad(b[1]);
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  // Tunable model constants (exposed so the UI can show them / tweak).
  const P = {
    WALK_KMH: 4.5,      // base pedestrian speed
    HEAT_FACTOR: 0.90,  // Bangkok heat/humidity/crowds slowdown
    DETOUR: 1.30,       // straight-line -> street-network path multiplier
    RAIL_PER_STATION_MIN: 2.0,  // BTS/MRT time per station hop
    RAIL_WAIT_MIN: 4.0,         // average platform wait
    RAIL_TRANSFER_MIN: 5.0,     // line change (walk between platforms + wait)
    RAIL_SAMESTATION_MIN: 2.0,  // interchange that shares a station name
    RAIL_SNAP_M: 1100,          // max walk to reach a station
    RAIL_FARE_BASE: 17, RAIL_FARE_PER_STATION: 3, RAIL_FARE_MAX: 62, // ฿
    BOAT_PER_PIER_MIN: 3.0, BOAT_WAIT_MIN: 8.0, BOAT_SNAP_M: 900, BOAT_FARE: 20, // ฿
    TAXI_SPEED_KMH: 16, // effective incl. traffic
    TAXI_BASE_FARE: 35, // ฿ first km
    TAXI_PER_KM: 6.5,   // ฿/km after
    // Motorbike taxi / GrabBike — fastest for short hops, weaves through traffic
    BIKE_SPEED_KMH: 23, BIKE_BASE_FARE: 20, BIKE_PER_KM: 14, // ฿
    // Khlong Saen Saep canal boat (Golden Mount ↔ Pratunam ↔ Sukhumvit)
    CANAL_PER_STOP_MIN: 2.5, CANAL_WAIT_MIN: 8, CANAL_SNAP_M: 750, CANAL_FARE: 20, // ฿
    // Cross-river ferry (e.g. Tha Tien ↔ Wat Arun) — 5 ฿, every 10–15 min
    FERRY_CROSS_MIN: 5, FERRY_WAIT_MIN: 6, FERRY_SNAP_M: 550, FERRY_FARE: 5, // ฿
    WALK_PREFER_M: 1200 // below this, walking is preferred even if rail is faster
  };

  const effWalkKmh = () => P.WALK_KMH * P.HEAT_FACTOR;      // ≈ 4.05 km/h
  const walkMPerMin = () => effWalkKmh() * 1000 / 60;        // ≈ 67.5 m/min

  // Walking time (minutes) for a straight-line distance in metres.
  // roadDist = d · DETOUR ;  t = roadDist / (v_eff)
  function walkMinutes(straightM) {
    return (straightM * P.DETOUR) / walkMPerMin();
  }
  function walkRoadKm(straightM) { return straightM * P.DETOUR / 1000; }

  // Taxi/Grab estimate: time = roadDist / speed ; fare = base + max(0, km−1)·perKm
  function taxi(straightM) {
    const km = walkRoadKm(straightM);
    const min = km / P.TAXI_SPEED_KMH * 60;
    const fare = P.TAXI_BASE_FARE + Math.max(0, km - 1) * P.TAXI_PER_KM;
    return { min, fare, km };
  }

  // Motorbike taxi / GrabBike estimate.
  function bike(straightM) {
    const km = walkRoadKm(straightM);
    const min = km / P.BIKE_SPEED_KMH * 60 + 1; // +1 min hail
    const fare = P.BIKE_BASE_FARE + Math.max(0, km - 0.5) * P.BIKE_PER_KM;
    return { min, fare, km };
  }

  window.GEO = { haversine, walkMinutes, walkRoadKm, taxi, bike, P, effWalkKmh };
})();
