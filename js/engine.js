// Talks to Stockfish. Stockfish runs in a Web Worker (a separate thread), so the
// page never freezes while it thinks. We talk to it with plain text commands
// called the UCI protocol, for example "position fen ..." and "go movetime 700".

let worker = null;
let ready = null;   // a promise that resolves once the engine is loaded

function send(command) {
  worker.postMessage(command);
}

// Wait for one line of engine output that passes `test`. Gives up after `ms`.
function waitFor(test, ms = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.removeEventListener("message", onMessage);
      reject(new Error("Stockfish did not answer in time"));
    }, ms);

    function onMessage(e) {
      const line = typeof e.data === "string" ? e.data : "";
      if (test(line)) {
        clearTimeout(timer);
        worker.removeEventListener("message", onMessage);
        resolve(line);
      }
    }
    worker.addEventListener("message", onMessage);
  });
}

// Load the engine once, the first time it is needed.
function start() {
  if (!ready) {
    ready = (async () => {
      // The download script saved the engine's file name in this text file.
      const res = await fetch("js/stockfish/engine-file.txt");
      if (!res.ok) throw new Error("js/stockfish/engine-file.txt not found");
      const file = (await res.text()).trim();

      worker = new Worker("js/stockfish/" + file);

      const uciOk = waitFor(line => line === "uciok");
      send("uci");
      await uciOk;

      const readyOk = waitFor(line => line === "readyok");
      send("isready");
      await readyOk;
    })().catch(err => {
      ready = null;     // allow a retry next time
      throw err;
    });
  }
  return ready;
}

// Ask Stockfish for a move in position `fen`, playing at about `elo` strength.
// Returns { from, to, promotion } which chess.js accepts directly.
export async function engineMove(fen, elo, movetime = 700) {
  await start();

  // Stockfish can limit its own strength: it plays like a player of this Elo.
  // The lowest it supports is about 1320 and the highest about 3190.
  const clamped = Math.max(1320, Math.min(3190, Math.round(elo)));
  send("setoption name UCI_LimitStrength value true");
  send("setoption name UCI_Elo value " + clamped);

  const readyOk = waitFor(line => line === "readyok");
  send("isready");
  await readyOk;

  send("position fen " + fen);
  const best = waitFor(line => line.startsWith("bestmove"), movetime + 30000);
  send("go movetime " + movetime);
  const line = await best;          // for example: "bestmove e2e4 ponder e7e5"

  const uci = line.split(" ")[1];   // "e2e4", or "e7e8q" for a promotion
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}