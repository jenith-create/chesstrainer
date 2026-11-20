"""
Builds data/puzzles.json from the free Lichess puzzle database (CC0 licence).

Python 3.14 can read .zst files by itself, so nothing needs installing.
(On older Python versions: pip install zstandard, inside a virtual environment.)

Run from the chess-trainer folder:
    python3 make_puzzles.py

It streams the database, reads the first rows only (not the whole 250 MB+ file),
keeps popular puzzles, and picks some from each rating band.
"""
import csv
import io
import json
import os
import random
import urllib.request

try:
    from compression import zstd            # built into Python 3.14 and newer
    def open_zst(stream):
        return zstd.ZstdFile(stream)
except ImportError:
    try:
        import zstandard                    # older Python: pip install zstandard
        def open_zst(stream):
            return zstandard.ZstdDecompressor().stream_reader(stream)
    except ImportError:
        raise SystemExit("Need Python 3.14+ or the zstandard package. Run: python3 --version")

URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst"
ROWS_TO_READ = 150000          # how many rows to look at
PER_BAND = 40                  # puzzles to keep per rating band
BANDS = [(400, 800), (800, 1200), (1200, 1600), (1600, 2000), (2000, 2400), (2400, 3000)]

pool = {band: [] for band in BANDS}

request = urllib.request.Request(URL, headers={"User-Agent": "chess-trainer-learning-project"})
with urllib.request.urlopen(request) as response:
    reader = open_zst(response)
    text = io.TextIOWrapper(reader, encoding="utf-8")
    for i, row in enumerate(csv.DictReader(text)):
        if i >= ROWS_TO_READ:
            break
        rating = int(row["Rating"])
        if int(row["Popularity"]) < 90:         # skip unpopular or odd puzzles
            continue
        for low, high in BANDS:
            if low <= rating < high:
                pool[(low, high)].append(row)

puzzles = []
for band, rows in pool.items():
    print(f"{band[0]}-{band[1]}: {len(rows)} candidates")
    random.shuffle(rows)
    for row in rows[:PER_BAND]:
        puzzles.append({
            "id": row["PuzzleId"],
            "fen": row["FEN"],
            "moves": row["Moves"].split(),
            "rating": int(row["Rating"]),
            "themes": row["Themes"].split(),
        })

os.makedirs("data", exist_ok=True)
with open("data/puzzles.json", "w") as f:
    json.dump(puzzles, f, separators=(",", ":"))

print(f"Saved {len(puzzles)} puzzles to data/puzzles.json")
