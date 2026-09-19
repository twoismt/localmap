# -*- coding: utf-8 -*-
"""Build web/data/places.js from the extracted spreadsheet rows.

Adds: curated coordinates, structured opening hours (per weekday),
trip-date availability, price (baht/rub), feature flags, Thai names.
Coordinates are curated from geographic knowledge of Bangkok; landmark
coordinates are exact, smaller venues are neighbourhood-accurate and easy
to correct by editing this table.
"""
import json, re, os

HERE = os.path.dirname(__file__)
RAW = "/tmp/claude-0/-home-user-localmap/21e2b459-7194-5ed7-9d02-84c3d141cbe9/scratchpad/places_raw.json"
OUT = os.path.join(HERE, "..", "web", "data", "places.js")

# id -> [lon, lat]
COORDS = {
 1:[100.4889,13.7437], 2:[100.4927,13.7465], 3:[100.4914,13.7500], 4:[100.4667,13.7159],
 5:[100.2158,13.8069], 6:[100.5069,13.7539], 7:[100.5040,13.7546], 8:[100.5140,13.7376],
 9:[100.5106,13.7437], 10:[100.5285,13.7492], 11:[100.5490,13.8339], 12:[100.5285,13.7223],
 13:[100.5077,13.7616], 14:[100.5027,13.7043], 15:[100.5405,13.7443], 16:[100.5300,13.7466],
 17:[100.4939,13.7438], 18:[100.5418,13.7311], 19:[100.5602,13.7237], 20:[100.5100,13.7266],
 21:[100.5347,13.7462], 22:[100.5300,13.7447], 23:[100.5601,13.7375], 24:[100.5697,13.7297],
 25:[100.6790,13.6470], 26:[100.5027,13.7043], 27:[100.5450,13.7258], 28:[100.5375,13.8036],
 29:[100.5502,13.7999], 30:[100.5115,13.7415], 31:[100.4966,13.7405], 32:[100.5493,13.8039],
 33:[100.5690,13.7648], 34:[100.5090,13.7404], 35:[100.4977,13.7589], 36:[100.5075,13.7378],
 37:[100.5235,13.7415], 38:[100.5340,13.7447], 39:[100.5445,13.7797], 40:[100.4573,13.7178],
 41:[100.5720,13.7200], 42:[100.5163,13.7205], 43:[100.5396,13.7466], 44:[100.5560,13.7430],
 45:[100.5697,13.7297], 46:[100.5855,13.7188], 47:[100.5570,13.7420], 48:[100.5470,13.7430],
 49:[100.5555,13.7420], 50:[100.5085,13.7190], 51:[100.5290,13.7240], 52:[100.5475,13.7425],
 53:[100.4915,13.7433], 54:[100.5558,13.7430], 55:[100.5120,13.7420], 56:[100.5121,13.7421],
 57:[100.5122,13.7419], 58:[100.5240,13.7267], 59:[100.5850,13.7250], 60:[100.5660,13.7330],
 61:[100.5460,13.7428], 62:[100.5115,13.7360], 63:[100.5116,13.7361], 64:[100.5290,13.7120],
 65:[100.5290,13.7220], 66:[100.5330,13.7565], 67:[100.5165,13.7250], 68:[100.4970,13.7480],
 69:[100.2300,13.7900], 70:[100.5100,13.7370], 71:[100.5125,13.7355], 72:[100.5080,13.7375],
 73:[100.5235,13.7415], 74:[100.5095,13.7400], 75:[100.5420,13.7440], 76:[100.5095,13.7403],
 77:[100.5420,13.7245], 78:[100.5250,13.7215], 79:[100.5600,13.7370], 80:[100.5680,13.7325],
 81:[100.5750,13.7300], 82:[100.5440,13.7795], 83:[100.4850,13.7250], 84:[100.5830,13.7280],
 85:[100.5620,13.7370], 86:[100.5820,13.7330], 87:[100.5810,13.7320], 88:[100.5100,13.7266],
 89:[100.5335,13.7448], 90:[100.5347,13.7462], 91:[100.5078,13.7377], 92:[100.5396,13.7466],
 93:[100.5720,13.7255], 94:[100.5150,13.7265], 95:[99.9560,13.5200], 96:[99.9550,13.4258],
 97:[100.4090,13.7767], 98:[100.4560,13.7793], 99:[100.5110,13.7210],
}

# Thai names for the taxi card (well-known places; others fall back to EN+address).
THAI = {
 1:"วัดอรุณราชวราราม", 2:"วัดโพธิ์ (วัดพระเชตุพน)", 3:"พระบรมมหาราชวัง",
 4:"วัดปากน้ำ ภาษีเจริญ", 5:"วัดสามพราน (วัดมังกร)", 6:"วัดสระเกศ (ภูเขาทอง)",
 7:"โลหะปราสาท วัดราชนัดดาราม", 8:"วัดไตรมิตรวิทยาราม", 9:"วัดมังกรกมลาวาส (เล่งเน่ยยี่)",
 10:"พิพิธภัณฑ์บ้านจิม ทอมป์สัน", 11:"MOCA พิพิธภัณฑ์ศิลปะไทยร่วมสมัย",
 12:"คิง เพาเวอร์ มหานคร (สกายวอล์ค)", 13:"สนามมวยราชดำเนิน", 15:"ศาลท้าวมหาพรหม เอราวัณ",
 16:"หอศิลปวัฒนธรรมแห่งกรุงเทพมหานคร (BACC)", 17:"มิวเซียมสยาม", 18:"สวนลุมพินี",
 19:"สวนเบญจกิติ", 20:"ไอคอนสยาม", 21:"สยามพารากอน", 22:"เอ็มบีเค เซ็นเตอร์",
 23:"เทอร์มินอล 21 อโศก", 24:"เอ็มสเฟียร์", 25:"เมกาบางนา", 26:"เอเชียทีค เดอะ ริเวอร์ฟร้อนท์",
 27:"เซ็นทรัล พาร์ค (วัน แบงค็อก)", 28:"บางซื่อจังชั่น", 29:"ตลาดนัดจตุจักร",
 30:"ตลาดกลางคืนเยาวราช", 31:"ปากคลองตลาด", 32:"ตลาด อ.ต.ก.", 33:"จ๊อดแฟร์ส",
 34:"เยาวราช (ไชน่าทาวน์)", 35:"ถนนข้าวสาร", 36:"ถนนทรงวาด", 37:"ถนนบรรทัดทอง",
 38:"สยามสแควร์", 39:"อารีย์", 40:"บ้านศิลปิน คลองบางหลวง", 42:"สกายบาร์ (เลอบัว)",
 43:"เรดสกาย เซ็นทรัลเวิลด์", 95:"ตลาดน้ำดำเนินสะดวก", 96:"ตลาดน้ำอัมพวา",
 97:"ตลาดน้ำคลองลัดมะยม", 98:"ตลาดน้ำตลิ่งชัน", 99:"แม่น้ำเจ้าพระยา",
}

CAT_KEY = {
 "Храмы":"temple",
 "Достопримечательности, музеи и парки":"sight",
 "Торговые центры":"mall",
 "Рынки":"market",
 "Районы, улицы и кварталы":"district",
 "Руфтоп-бары":"rooftop",
 "Бары и клубы":"bar",
 "Кафе и рестораны":"cafe",
 "Магазины и поп-апы":"shop",
 "Плавучие рынки":"floating",
 "Река":"river",
}

# Day-part heuristic per category for scheduling (morning/day/evening/any).
CAT_DAYPART = {
 "temple":"morning", "sight":"day", "mall":"day", "market":"day",
 "district":"any", "rooftop":"evening", "bar":"evening", "cafe":"morning",
 "shop":"day", "floating":"morning", "river":"any",
}

WD = {"пн":0,"вт":1,"ср":2,"чт":3,"пт":4,"сб":5,"вс":6}
WD_ORDER = ["пн","вт","ср","чт","пт","сб","вс"]

def to_min(h, m):
    return h*60+m

def parse_time_range(s):
    """Return (start,end) minutes from a 'HH:MM–HH:MM' fragment, else None."""
    m = re.search(r'(\d{1,2})[:.](\d{2})\s*[–\-—]\s*(\d{1,2})[:.](\d{2})', s)
    if not m:
        return None
    a = to_min(int(m.group(1)), int(m.group(2)))
    b = to_min(int(m.group(3)), int(m.group(4)))
    if b <= a:  # crosses midnight
        b += 24*60
    return [a, b]

def expand_days(frag):
    """Given a fragment like 'Вт–Вс' or 'Пн–Пт' or 'Сб–Вс', return weekday idx list."""
    frag = frag.lower()
    m = re.search(r'(пн|вт|ср|чт|пт|сб|вс)\s*[–\-—]\s*(пн|вт|ср|чт|пт|сб|вс)', frag)
    if m:
        a, b = WD[m.group(1)], WD[m.group(2)]
        if a <= b:
            return list(range(a, b+1))
        return list(range(a,7)) + list(range(0,b+1))
    days = []
    for d in WD_ORDER:
        if re.search(r'\b'+d+r'\b', frag):
            days.append(WD[d])
    return days

def parse_hours(hours, cat_default):
    """Return open[7] list (Mon..Sun) of [start,end] or null."""
    h = (hours or "").lower()
    week = [None]*7
    if not h or "уточн" in h or "зависят" in h or "вечером" in h and "–" not in h:
        pass
    if "круглосуточно" in h:
        return [[0,1440]]*7
    # closed-day markers
    closed = set()
    for d in WD_ORDER:
        if re.search(d+r'\s*[—-]\s*закрыт', h):
            closed.add(WD[d])
    # default range = last time range in string
    ranges = re.findall(r'\d{1,2}[:.]\d{2}\s*[–\-—]\s*\d{1,2}[:.]\d{2}', h)
    # Common: "Ежедневно 8:00–18:00"
    if "ежедневно" in h and ranges:
        r = parse_time_range(ranges[0])
        week = [list(r) for _ in range(7)]
    # Segment by ';' and ',' to catch per-day-group ranges
    segs = re.split(r'[;,]', h)
    for seg in segs:
        r = parse_time_range(seg)
        if not r:
            continue
        days = expand_days(seg)
        if not days and ("ежедневно" in seg or seg is segs[0] and not any(d in seg for d in WD_ORDER)):
            days = list(range(7))
        for d in days:
            week[d] = list(r)
    # If nothing parsed but a range exists, apply to all days
    if all(x is None for x in week) and ranges:
        r = parse_time_range(ranges[0])
        if r:
            week = [list(r) for _ in range(7)]
    # apply explicit closed days
    for d in closed:
        week[d] = None
    return week

def parse_trip_dates(avail, hours):
    """Trip is 11..15 Oct: 11=Sun,12=Mon,13=Tue,14=Wed,15=Thu.
    Return dict date->status ('open'/'closed'/'limited'/'crowded')."""
    a = (avail or "").lower()
    trip = {11:"open",12:"open",13:"open",14:"open",15:"open"}
    date_wd = {11:6,12:0,13:1,14:2,15:3}
    # explicit closures like 'закрыто пн 12', 'закрыто вт 13 и ср 14'
    for m in re.finditer(r'закрыт[оа]?[^\.]*?(1[1-5])', a):
        # collect all day numbers in this closure clause
        clause = a[m.start():m.start()+60]
        for num in re.findall(r'\b(1[1-5])\b', clause):
            trip[int(num)] = "closed"
    # 'только вс 11', 'только чт 15 (чт–сб)' -> others closed
    only = re.search(r'только[^\.]*', a)
    if only:
        keep = set(int(x) for x in re.findall(r'\b(1[1-5])\b', only.group(0)))
        if keep:
            for d in trip:
                if d not in keep:
                    trip[d] = "closed"
    # weekday closures from hours (e.g. Mon closed) propagate to trip dates
    week = parse_hours(hours, None)
    for d, wd in date_wd.items():
        if week[wd] is None and trip[d] == "open":
            trip[d] = "closed"
    # holiday crowding 13 Oct
    if "13 окт" in a and trip[13] != "closed":
        trip[13] = "crowded"
    if "будни" in a and "час" in a:  # reduced on weekdays (Chatuchak)
        for d in (12,13,14,15):
            if trip[d] == "open":
                trip[d] = "limited"
    return trip

def parse_price(price):
    """Return {baht:int|null, rub:int|null, free:bool, byMenu:bool}."""
    p = (price or "")
    low = p.lower()
    free = ("бесплатно" in low) or ("free" in low)
    by_menu = ("по меню" in low) or ("дёшево" in low) or ("дешево" in low)
    baht = None; rub = None
    mb = re.search(r'(\d[\d\s]*)\s*฿', p)
    if mb:
        baht = int(re.sub(r'\s','', mb.group(1)))
    mr = re.search(r'(\d[\d\s]*)\s*₽', p)
    if mr:
        rub = int(re.sub(r'\s','', mr.group(1)))
    if free:
        baht = 0 if baht is None else baht
        rub = 0 if rub is None else rub
    return {"baht":baht, "rub":rub, "free":free, "byMenu":by_menu}

def parse_flags(feat, avail, price, name):
    t = (feat+" "+avail+" "+price+" "+name).lower()
    return {
        "dress": ("дресс-код" in t or "дресс код" in t),
        "cash": ("наличны" in t),
        "book": ("брон" in t or "по записи" in t or "онлайн деше" in t or "по брони" in t),
        "far": bool(re.search(r'\bкм\b', t) or "далеко" in t or "далеки" in t),
        "glutenfree": ("безглютен" in t or "глютен" in t),
        "reservation": ("депозит" in t or "мин. счёт" in t or "мин. заказ" in t),
    }

if __name__ == "__main__":
    raw = json.load(open(RAW, encoding="utf-8"))
    out = []
    for r in raw:
        i = r["id"]
        cat = CAT_KEY.get(r["category"], "sight")
        lonlat = COORDS.get(i)
        price = parse_price(r["price"])
        out.append({
            "id": i,
            "cat": cat,
            "catName": r["category"],
            "nameEn": r["name_en"],
            "nameRu": r["name_ru"],
            "nameTh": THAI.get(i, ""),
            "address": r["address"],
            "desc": r["desc"],
            "priceText": r["price"],
            "price": price,
            "hoursText": r["hours"],
            "hours": parse_hours(r["hours"], cat),
            "features": r["features"],
            "availabilityText": r["availability"],
            "trip": parse_trip_dates(r["availability"], r["hours"]),
            "daypart": CAT_DAYPART.get(cat, "any"),
            "flags": parse_flags(r["features"], r["availability"], r["price"], r["name_en"]),
            "lon": lonlat[0],
            "lat": lonlat[1],
        })

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// Auto-generated by scripts/build_data.py — Bangkok places dataset.\n")
        f.write("// Coordinates curated from geographic knowledge; edit here to refine.\n")
        f.write("window.PLACES = ")
        json.dump(out, f, ensure_ascii=False, indent=0)
        f.write(";\n")

    print("wrote", OUT, "places:", len(out))
    # quick sanity
    miss = [p["id"] for p in out if p["lon"] is None]
    print("missing coords:", miss)
    print("sample:", json.dumps(out[0], ensure_ascii=False)[:400])
