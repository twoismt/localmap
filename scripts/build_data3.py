# -*- coding: utf-8 -*-
"""Rebuild web/data/places.js from the CORRECTED workbook (117 places).

Workbook "Бангкок 11-15 окт (исправленная)" has three sheets:
  1 "Бангкок 11-15 окт"    — place details, now with a "Сверка 27.09.2026" column
  2 "Изменения 27.09.2026" — changelog of the Google Places reconciliation
  3 "Маршрут по дням"      — the day-by-day plan

The numbering is unchanged for the first 112 places, so coordinates, Thai
names and district grouping are carried over from the current dataset by
English name; places 113–117 are new and get curated coordinates here.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
XLSX = ("/root/.claude/uploads/21e2b459-7194-5ed7-9d02-84c3d141cbe9/"
        "c5bf6dd7-______________11-15_______________.xlsx")
PLACES_JS = os.path.join(HERE, "..", "web", "data", "places.js")

import openpyxl

sys.path.insert(0, HERE)
from build_data import (parse_hours, parse_trip_dates, parse_price, parse_flags,
                        CAT_KEY, CAT_DAYPART)

# Curated coordinates for the places added in this revision (by EN name).
NEW_COORDS = {
    # 119 Soi Tha Suphan, right by Wat Pho / Tha Tien pier
    "Mitr Street by Ruay Mitr / ThaiKi Rooftop": [100.4918, 13.7440],
    # 222 Ratchaprarop Rd, Ratchathewi
    "Baiyoke Observation Deck (Baiyoke Tower II)": [100.5403, 13.7540],
    # Ratchaprarop Rd / Phaya Thai, Pratunam
    "Pratunam Night Market": [100.5400, 13.7513],
    # inside Asiatique (place 28) — same riverside site
    "SkyFlyers: Wings of Garudapterus": [100.5027, 13.7043],
    # The Storeys / Carnival, One Bangkok, Witthayu
    "AFTER HOURS TIL DAWN Pop-up Store (Carnival, One Bangkok)": [100.5455, 13.7268],
}
# District grouping for the new places (mirrors an existing place's district).
NEW_DISTRICT_LIKE = {
    "Mitr Street by Ruay Mitr / ThaiKi Rooftop": 2,    # Старый город
    "Baiyoke Observation Deck (Baiyoke Tower II)": 21,  # Сиам · Ратчапрасонг
    "Pratunam Night Market": 21,
    "SkyFlyers: Wings of Garudapterus": 28,            # Чайнатаун / у реки
    "AFTER HOURS TIL DAWN Pop-up Store (Carnival, One Bangkok)": 29,  # Силом · Сатон
}
# Sheet 1 files the new rows under a provenance heading ("Новое — со
# скриншотов…"), so give them real categories.
NEW_CATS = {
    "Mitr Street by Ruay Mitr / ThaiKi Rooftop": ("cafe", "Кафе и рестораны"),
    "Baiyoke Observation Deck (Baiyoke Tower II)": ("sight", "Достопримечательности, музеи и парки"),
    "Pratunam Night Market": ("market", "Рынки"),
    "SkyFlyers: Wings of Garudapterus": ("sight", "Достопримечательности, музеи и парки"),
    "AFTER HOURS TIL DAWN Pop-up Store (Carnival, One Bangkok)": ("shop", "Магазины и поп-апы"),
}


def load_current():
    txt = open(PLACES_JS, encoding="utf-8").read()
    return json.loads(txt.split("window.PLACES = ", 1)[1].rsplit(";", 1)[0])


cur = load_current()
by_name = {p["nameEn"]: p for p in cur}
by_id = {p["id"]: p for p in cur}

wb = openpyxl.load_workbook(XLSX, data_only=True)
ws = wb["Бангкок 11-15 окт"]

places, missing = [], []
cat = None
for row in ws.iter_rows(values_only=True):
    first = (str(row[0]).strip() if row[0] is not None else "")
    if not first:
        continue
    if first.startswith("▍"):
        cat = first.replace("▍", "").strip()
        continue
    if not first.isdigit():
        continue
    i = int(first)
    name_en = (row[1] or "").strip()
    prev = by_name.get(name_en)

    lonlat = ([prev["lon"], prev["lat"]] if prev else NEW_COORDS.get(name_en))
    if not lonlat:
        missing.append((i, name_en))
        continue

    if prev:
        district, sub = prev.get("district"), prev.get("districtSub")
        name_th = prev.get("nameTh", "")
    else:
        ref = by_id.get(NEW_DISTRICT_LIKE.get(name_en))
        district = ref.get("district") if ref else None
        sub = None
        name_th = ""

    # "Новое — со скриншотов…" is a provenance marker, not a real category
    cat_name = cat
    if name_en in NEW_CATS:
        catk, cat_name = NEW_CATS[name_en]
    else:
        catk = CAT_KEY.get(cat, "sight")
    hours_txt = (row[6] or "").strip()
    avail_txt = (row[8] or "").strip()
    places.append({
        "id": i, "cat": catk, "catName": cat_name,
        "district": district, "districtSub": sub,
        "nameEn": name_en, "nameRu": (row[2] or "").strip(), "nameTh": name_th,
        "address": (row[3] or "").strip(), "desc": (row[4] or "").strip(),
        "priceText": (row[5] or "").strip(), "price": parse_price(row[5] or ""),
        "hoursText": hours_txt, "hours": parse_hours(hours_txt, catk),
        "features": (row[7] or "").strip(),
        "availabilityText": avail_txt,
        "trip": parse_trip_dates(avail_txt, hours_txt),
        "daypart": CAT_DAYPART.get(catk, "any"),
        "flags": parse_flags(row[7] or "", avail_txt, row[5] or "", name_en),
        "verified": (str(row[9]).strip() if len(row) > 9 and row[9] else ""),
        "lon": lonlat[0], "lat": lonlat[1],
    })

print("parsed:", len(places), "places")
if missing:
    print("MISSING COORDS:")
    for m in missing:
        print("   ", m)
    raise SystemExit(1)

for p in places:
    if p["id"] >= 113:
        print("  new:", p["id"], p["nameEn"][:46], "->", p["cat"],
              "| trip", ",".join(str(k) for k, v in sorted(p["trip"].items()) if v != "closed"))

with open(PLACES_JS, "w", encoding="utf-8") as f:
    f.write("// Auto-generated by scripts/build_data3.py — corrected workbook (117 places).\n")
    f.write("window.PLACES = ")
    json.dump(places, f, ensure_ascii=False, indent=0)
    f.write(";\n")
print("wrote", PLACES_JS)
