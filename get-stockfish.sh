#!/usr/bin/env bash
# Downloads the single-thread Stockfish (WebAssembly) into js/stockfish/
# Run it from the chess-trainer folder:  bash get-stockfish.sh

set -e
VERSION="16.0.0"
BASE="https://cdn.jsdelivr.net/npm/stockfish@$VERSION"

mkdir -p js/stockfish
cd js/stockfish

echo "Listing files in stockfish@$VERSION ..."
LIST=$(curl -s "https://data.jsdelivr.com/v1/package/npm/stockfish@$VERSION/flat" \
  | grep -o '"name": *"[^"]*"' | sed 's/"name": *"//; s/"$//')

echo "$LIST"
echo "-----"

JS=$(echo "$LIST" | grep 'single\.js$' | head -1)
WASM=$(echo "$LIST" | grep 'single\.wasm$' | head -1)

if [ -z "$JS" ] || [ -z "$WASM" ]; then
  echo "Could not find the single-thread files in the list above."
  echo "Copy the list above and send it to Claude."
  exit 1
fi

echo "Engine script: $JS"
echo "Engine data:   $WASM"

curl -L -o "$(basename "$JS")"   "$BASE$JS"
curl -L -o "$(basename "$WASM")" "$BASE$WASM"

# The page reads this file to know which script to load.
basename "$JS" > engine-file.txt

echo "-----"
ls -lh
echo "engine-file.txt says: $(cat engine-file.txt)"