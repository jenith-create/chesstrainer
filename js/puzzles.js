import { Chess } from "./chess.js";

export async function loadPuzzles() {
  const res = await fetch("data/puzzles.json");
  if (!res.ok) throw new Error("data/puzzles.json not found");
  return res.json();
}

export function parseUci(uci) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}

export function isValidPuzzle(p) {
  try {
    const scratch = new Chess(p.fen);
    for (const uci of p.moves) scratch.move(parseUci(uci));
    return p.moves.length >= 2;
  } catch (err) {
    return false;
  }
}

export function pickPuzzle(puzzles, playerRating, seen) {
  const unseen = puzzles.filter(p => !seen.has(p.id));
  const pool = unseen.length ? unseen : puzzles;
  const near = pool.filter(p => Math.abs(p.rating - playerRating) <= 250);
  if (near.length) return near[Math.floor(Math.random() * near.length)];
  return pool.reduce((best, p) =>
    Math.abs(p.rating - playerRating) < Math.abs(best.rating - playerRating) ? p : best
  );
}

export function newRating(playerRating, puzzleRating, solved) {
  const expected = 1 / (1 + Math.pow(10, (puzzleRating - playerRating) / 400));
  const K = 32;
  const score = solved ? 1 : 0;
  return Math.max(100, Math.round(playerRating + K * (score - expected)));
}
