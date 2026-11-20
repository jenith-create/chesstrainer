import { engineMove } from "./engine.js";

// A bot is just a function: give it the game, it returns a move.
// Every bot below has the same shape, so the app can swap them freely.
// Later, Stockfish will be one more bot in this list.

// How much each piece is worth (in "centipawns": 100 = one pawn)
const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Add up material. Positive = good for `color`, negative = bad.
function evaluate(game, color) {
  let score = 0;
  for (const row of game.board()) {
    for (const cell of row) {
      if (cell) score += (cell.color === color ? 1 : -1) * VALUE[cell.type];
    }
  }
  return score;
}

function randomOf(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Look at captures first: it helps the search skip bad branches sooner.
function orderedMoves(game) {
  const moves = game.moves();
  return moves.sort((a, b) => Number(b.includes("x")) - Number(a.includes("x")));
}

// ---------- Bot 1: Random ----------
// Plays any legal move. Easy to beat, great for testing.
function randomBot(game) {
  return randomOf(game.moves());
}

// ---------- Bot 2: Greedy ----------
// Tries every move, looks at the board after it, picks the one that leaves
// it with the most material. It grabs free pieces but ignores the reply.
function greedyBot(game) {
  const color = game.turn();
  let best = -Infinity;
  let bestMoves = [];

  for (const move of game.moves()) {
    game.move(move);
    const score = game.isCheckmate() ? 100000 : evaluate(game, color);
    game.undo();

    if (score > best) { best = score; bestMoves = [move]; }
    else if (score === best) bestMoves.push(move);
  }
  return randomOf(bestMoves);   // choose randomly among equal moves
}

// ---------- Bot 3: Thinker ----------
// Minimax with alpha-beta pruning. It imagines: "if I play this, the opponent
// will play their best reply, then I play my best..." and looks `depth` moves ahead.
function search(game, depth, alpha, beta, color) {
  if (game.isCheckmate()) {
    // The side to move is mated. Faster mates score higher (bigger `depth` left).
    return game.turn() === color ? -100000 - depth : 100000 + depth;
  }
  if (game.isDraw()) return 0;
  if (depth === 0) return evaluate(game, color);

  const maximizing = game.turn() === color;   // is it the bot's turn in this position?
  let best = maximizing ? -Infinity : Infinity;

  for (const move of orderedMoves(game)) {
    game.move(move);
    const score = search(game, depth - 1, alpha, beta, color);
    game.undo();

    if (maximizing) { best = Math.max(best, score); alpha = Math.max(alpha, best); }
    else            { best = Math.min(best, score); beta  = Math.min(beta,  best); }
    if (beta <= alpha) break;   // pruning: this branch can't change the result
  }
  return best;
}

function thinkerBot(game, depth = 2) {
  const color = game.turn();
  let best = -Infinity;
  let bestMoves = [];

  for (const move of orderedMoves(game)) {
    game.move(move);
    const score = search(game, depth - 1, -Infinity, Infinity, color);
    game.undo();

    if (score > best) { best = score; bestMoves = [move]; }
    else if (score === best) bestMoves.push(move);
  }
  return randomOf(bestMoves);
}

// ---------- The list the app uses ----------
// `elo` tells players how hard a bot is.
// - Rookie, Greedy, Thinker are our own simple bots: their Elo is an ESTIMATE.
// - The Stockfish bots limit the real engine to that Elo, which is much more reliable.
//   (Stockfish's lowest setting is about 1320.)
// A bot's `pick` can return a move right away, or a promise (Stockfish does).
const stockfishBot = (id, name, elo) => ({
  id, name, elo,
  pick: g => engineMove(g.fen(), bot_elo(id))
});

// Look up the current Elo of a Stockfish bot (the custom one can change).
function bot_elo(id) {
  return BOTS.find(b => b.id === id).elo;
}

export const BOTS = [
  { id: "random",  name: "Rookie",  elo: 250, pick: randomBot },
  { id: "greedy",  name: "Greedy",  elo: 600, pick: greedyBot },
  { id: "thinker", name: "Thinker", elo: 900, pick: g => thinkerBot(g, 2) },
  stockfishBot("sf1400", "Club Player",  1400),
  stockfishBot("sf1800", "Advanced",     1800),
  stockfishBot("sf2200", "Expert",       2200),
  stockfishBot("sf2800", "Master",       2800),
  { ...stockfishBot("custom", "Custom Stockfish", 1500), custom: true }
];

// Turn a number into words that anyone understands.
export function levelName(elo) {
  if (elo < 600)  return "Beginner";
  if (elo < 1000) return "Novice";
  if (elo < 1400) return "Intermediate";
  if (elo < 1800) return "Club player";
  if (elo < 2200) return "Advanced";
  if (elo < 2600) return "Expert";
  return "Master level";
}