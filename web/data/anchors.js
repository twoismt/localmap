// anchors.js — опорные точки поездки (аэропорт, отель, стадион).
// Их нет в таблице мест, поэтому они живут отдельным модулем и добавляются
// к window.PLACES после загрузки данных. На карте показываются эмодзи-пинами.
(function () {
  const ANCHORS = [
    {
      id: 201, cat: "base", catName: "Опорные точки", emoji: "✈️",
      district: "Аэропорт", districtSub: null,
      nameEn: "Suvarnabhumi Airport (BKK)", nameRu: "Аэропорт Суварнабхуми (BKK)",
      nameTh: "ท่าอากาศยานสุวรรณภูมิ",
      address: "999 Nong Prue, Bang Phli, Samut Prakan",
      desc: "Главный аэропорт Бангкока. Прилёт 11 окт в 09:45 (Gulf Air GF152). Паспортный контроль и багаж — около часа после посадки.",
      priceText: "Grab до отеля ~400 ฿ + платные дороги ~75 ฿",
      hoursText: "Круглосуточно",
      features: "Airport Rail Link до города; с чемоданом Grab (30–50 мин) удобнее поезда.",
      availabilityText: "Все дни", daypart: "any",
      lon: 100.7501, lat: 13.6900
    },
    {
      id: 202, cat: "base", catName: "Опорные точки", emoji: "🏨",
      district: "РАЙОН ОТЕЛЯ · Сукхумвит", districtSub: null,
      nameEn: "Travelodge Sukhumvit 11", nameRu: "Отель Travelodge Sukhumvit 11",
      nameTh: "โรงแรมทราเวลลอดจ์ สุขุมวิท 11",
      address: "30, 9-10 Soi Sukhumvit 11, Khlong Toei Nuea, Watthana",
      desc: "База на 11–15 октября, 4 ночи. Заезд с 14:00, выезд до 12:00. Вещи можно оставить на ресепшн.",
      priceText: "—", hoursText: "Круглосуточно",
      features: "BTS Nana рядом. 12 мин пешком до Terminal 21.",
      availabilityText: "11–15 окт", daypart: "any",
      lon: 100.5556, lat: 13.7436
    },
    {
      id: 203, cat: "base", catName: "Опорные точки", emoji: "🎤",
      district: "РАЙОН СТАДИОНА · Рамкхамхэнг / Хуа Мак", districtSub: null,
      nameEn: "Rajamangala National Stadium", nameRu: "Стадион Раджамангала (The Weeknd)",
      nameTh: "สนามราชมังคลากีฬาสถาน",
      address: "286 Ramkhamhaeng Rd, Hua Mak, Bang Kapi",
      desc: "Концерт The Weeknd 13 окт, 19:50, зона E1J. Сначала бумажный билет, потом мерч, потом на место. Нужны карта …8326, паспорт и Purchasing Confirmation.",
      priceText: "—", hoursText: "13 окт: вход с 18:00",
      features: "После концерта Grab у стадиона ждать 30+ мин — отойти 10–15 мин пешком или дойти до Hua Mak.",
      availabilityText: "Концерт 13 окт", daypart: "evening",
      lon: 100.6222, lat: 13.7553
    }
  ];
  const DEFAULTS = {
    price: { baht: null, rub: null, free: false, byMenu: false },
    hours: [[0, 1440], [0, 1440], [0, 1440], [0, 1440], [0, 1440], [0, 1440], [0, 1440]],
    trip: { "11": "open", "12": "open", "13": "open", "14": "open", "15": "open" },
    flags: { dress: false, cash: false, book: false, far: false, glutenfree: false, reservation: false }
  };
  window.PLACES = window.PLACES || [];
  ANCHORS.forEach(a => {
    if (window.PLACES.some(p => p.id === a.id)) return; // idempotent
    window.PLACES.push(Object.assign({}, DEFAULTS, a));
  });
})();
