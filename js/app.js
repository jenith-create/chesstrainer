// chess.js knows the rules of chess. We only draw the board and handle clicks.
import { Chess } from "./chess.js";
import { BOTS, levelName } from "./bot.js";
import { loadPuzzles, parseUci, isValidPuzzle, pickPuzzle, newRating } from "./puzzles.js";

// ---------- State (the things that change) ----------
const game = new Chess();   // the game: pieces, whose turn, move history
let selected = null;        // the square the player tapped first, like "e2"
let lastMove = null;        // the last move made, so we can highlight it
let flipped = false;        // false = white at the bottom
let playerColor = "w";      // which side the human plays: "w" or "b"
let thinking = false;       // true while the bot (or the puzzle opponent) is moving
let mode = "play";          // "play" (against a bot) or "puzzle"
let session = 0;            // goes up on every new game or puzzle, so old timers can be ignored

// Play mode
let bot = BOTS[0];

// Puzzle mode
let puzzles = [];           // all puzzles loaded from data/puzzles.json
let puzzle = null;          // the current puzzle
let step = 0;               // which move of puzzle.moves the player must find next
let failed = false;         // made a wrong move on this puzzle
let usedHelp = false;       // used the hint on this puzzle
let solved = false;         // finished this puzzle
let puzzleMessage = "";     // text shown in the status line in puzzle mode
let puzzleRating = 1000;    // the player's puzzle rating
let streak = 0;             // puzzles solved in a row
const seen = new Set();     // puzzle ids already shown

// ---------- Page elements ----------
const $ = id => document.getElementById(id);
const boardEl = $("board"), statusEl = $("status"), movesEl = $("moves");
const botSel = $("botSel"), sideSel = $("sideSel"), botInfo = $("botInfo");
const customBox = $("customBox"), eloSlider = $("eloSlider"), eloVal = $("eloVal");
const playBox = $("playBox"), puzzleBox = $("puzzleBox");
const playButtons = $("playButtons"), puzzleButtons = $("puzzleButtons");
const tabPlay = $("tabPlay"), tabPuzzle = $("tabPuzzle");
const pRating = $("pRating"), pStreak = $("pStreak"), puzzleInfo = $("puzzleInfo");

// The "\uFE0E" after the pawn stops phones from turning it into an emoji
const GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟\uFE0E" };

// ---------- Drawing ----------
function render() {
  boardEl.innerHTML = "";

  // Legal destination squares for the selected piece (empty if nothing selected)
  const legal = selected ? game.moves({ square: selected, verbose: true }) : [];
  const targets = new Map(legal.map(m => [m.to, m]));

  // Where is the king that is in check, if any?
  const checkedKing = game.inCheck() ? findKing(game.turn()) : null;

  // game.board() is an 8x8 grid. Row 0 is rank 8 (black's side), column 0 is file a.
  const order = [0, 1, 2, 3, 4, 5, 6, 7];
  const rows = flipped ? [...order].reverse() : order;
  const cols = flipped ? [...order].reverse() : order;
  const board = game.board();

  for (const r of rows) {
    for (const c of cols) {
      const square = "abcdefgh"[c] + (8 - r);   // for example r=6, c=4 -> "e2"
      const cell = board[r][c];                  // null or { type, color }

      const el = document.createElement("div");
      el.className = "sq " + ((r + c) % 2 === 0 ? "light" : "dark");
      el.dataset.square = square;

      if (lastMove && (square === lastMove.from || square === lastMove.to)) el.classList.add("last");
      if (square === selected) el.classList.add("sel");
      if (square === checkedKing) el.classList.add("incheck");
      if (targets.has(square)) {
        el.classList.add("target");
        if (cell) el.classList.add("capture");   // a piece is there: it's a capture
      }

      if (cell) {
        const p = document.createElement("span");
        p.className = "piece " + cell.color;
        p.textContent = GLYPH[cell.type];
        el.appendChild(p);
      }

      // Small coordinates on the edge squares (a-h along the bottom, 1-8 on the left)
      const bottomRow = r === (flipped ? 0 : 7);
      const leftCol   = c === (flipped ? 7 : 0);
      if (bottomRow) el.appendChild(coord("file", "abcdefgh"[c]));
      if (leftCol)   el.appendChild(coord("rank", String(8 - r)));

      el.addEventListener("click", () => onSquareClick(square));
      boardEl.appendChild(el);
    }
  }

  renderStatus();
  renderMoves();
}

function coord(kind, text) {
  const s = document.createElement("span");
  s.className = "coord " + kind;
  s.textContent = text;
  return s;
}

function findKing(color) {
  const board = game.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (cell && cell.type === "k" && cell.color === color) {
        return "abcdefgh"[c] + (8 - r);
      }
    }
  }
  return null;
}

function renderStatus() {
  if (mode === "puzzle") {          // puzzle mode has its own messages
    statusEl.textContent = puzzleMessage;
    return;
  }
  if (game.isCheckmate()) {
    // The side to move has been mated, so the other side won.
    const winner = game.turn() === "w" ? "b" : "w";
    statusEl.textContent = winner === playerColor ? "Checkmate. You win!" : "Checkmate. The bot wins.";
  }
  else if (game.isStalemate())            statusEl.textContent = "Draw by stalemate.";
  else if (game.isThreefoldRepetition())  statusEl.textContent = "Draw by repetition.";
  else if (game.isInsufficientMaterial()) statusEl.textContent = "Draw: not enough pieces to mate.";
  else if (game.isDraw())                 statusEl.textContent = "Draw.";
  else if (thinking)                      statusEl.textContent = "The bot is thinking...";
  else statusEl.textContent = "Your move" + (game.inCheck() ? " (check!)" : "");
}

function renderMoves() {
  const history = game.history();   // list of moves in standard notation, like "Nf3"
  movesEl.innerHTML = "";
  for (let i = 0; i < history.length; i += 2) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${history[i]}</span><span>${history[i + 1] || ""}</span>`;
    movesEl.appendChild(li);
  }
  movesEl.scrollTop = movesEl.scrollHeight;
}

// ---------- Handling clicks and taps ----------
function onSquareClick(square) {
  // Ignore clicks when it is not the player's turn.
  if (thinking || game.turn() !== playerColor) return;
  if (mode === "play" && game.isGameOver()) return;
  if (mode === "puzzle" && solved) return;

  // If a piece is already selected, this click might be its move.
  if (selected) {
    if (selected === square) {            // tapped the same piece: deselect
      selected = null;
      return render();
    }

    if (mode === "puzzle") {
      if (tryPuzzleMove(selected, square)) return;   // it was a legal move: handled
    } else {
      try {
        // chess.js throws an error if the move is illegal
        lastMove = game.move({ from: selected, to: square, promotion: "q" });
        selected = null;
        render();
        return maybeBotMove();            // now it's the bot's turn
      } catch (err) {
        // Not a legal move. Fall through: maybe the player is picking another piece.
      }
    }
  }

  const piece = game.get(square);
  selected = piece && piece.color === game.turn() ? square : null;
  render();
}

// =====================================================================
//  PLAY MODE: the bot's turn and starting a game
// =====================================================================
function maybeBotMove() {
  if (mode !== "play" || game.isGameOver() || game.turn() === playerColor) return;

  thinking = true;
  renderStatus();
  const mine = session;

  // setTimeout lets the browser redraw first, so "thinking..." shows up,
  // and gives the bot's reply a natural short pause.
  setTimeout(async () => {
    try {
      const move = await bot.pick(game);   // a move like "Nf6", or { from, to } from Stockfish
      if (mine !== session) return;        // the player started something new meanwhile
      lastMove = game.move(move);          // play it
      thinking = false;
      render();
    } catch (err) {
      console.log(err);
      if (mine !== session) return;
      thinking = false;
      render();
      statusEl.textContent = "This bot could not move. Check the console (F12), or pick another bot.";
    }
  }, 400);
}

function updateBotInfo() {
  botInfo.textContent = `Elo ~${bot.elo} · ${levelName(bot.elo)}`;
}

function newGame() {
  session++;
  game.reset();
  selected = null;
  lastMove = null;
  thinking = false;
  playerColor = sideSel.value;
  bot = BOTS.find(b => b.id === botSel.value);
  customBox.hidden = !bot.custom;          // show the slider only for the custom bot
  if (bot.custom) { eloSlider.value = bot.elo; eloVal.textContent = bot.elo; }
  updateBotInfo();
  flipped = playerColor === "b";       // show the board from the player's side
  render();
  maybeBotMove();                      // if the player is Black, the bot moves first
}

// =====================================================================
//  PUZZLE MODE
// =====================================================================
function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem("chessTrainer") || "{}");
    if (saved.rating) puzzleRating = saved.rating;
  } catch (err) { /* storage can be unavailable: ignore */ }
}

function saveProgress() {
  try { localStorage.setItem("chessTrainer", JSON.stringify({ rating: puzzleRating })); }
  catch (err) { /* ignore */ }
}

function updatePuzzleStats() {
  pRating.textContent = puzzleRating;
  pStreak.textContent = streak;
}

async function startPuzzle() {
  session++;
  const mine = session;

  if (!puzzles.length) {
    try {
      puzzles = (await loadPuzzles()).filter(isValidPuzzle);   // drop broken puzzles
    } catch (err) {
      console.log(err);
      puzzleMessage = "Could not load data/puzzles.json.";
      return render();
    }
    if (!puzzles.length) {
      puzzleMessage = "No valid puzzles found in data/puzzles.json.";
      return render();
    }
  }
  if (mine !== session) return;

  puzzle = pickPuzzle(puzzles, puzzleRating, seen);
  seen.add(puzzle.id);
  if (seen.size >= puzzles.length) seen.clear();   // seen everything: start over

  game.load(puzzle.fen);
  selected = null;
  lastMove = null;
  failed = false;
  usedHelp = false;
  solved = false;
  step = 1;
  playerColor = game.turn() === "w" ? "b" : "w";   // FEN has the OPPONENT to move first
  flipped = playerColor === "b";
  puzzleInfo.textContent = `Puzzle rating ${puzzle.rating}`;
  puzzleMessage = "Watch the opponent's move...";
  thinking = true;
  updatePuzzleStats();
  render();

  // The first move in the data is the opponent's. We play it for the player.
  setTimeout(() => {
    if (mine !== session) return;
    lastMove = game.move(parseUci(puzzle.moves[0]));
    thinking = false;
    const side = playerColor === "w" ? "White" : "Black";
    puzzleMessage = `${side} to move. Find the best move.`;
    render();
  }, 700);
}

// Called when the player drags/taps a move. Returns true if it was a legal move.
function tryPuzzleMove(from, to) {
  let move;
  try {
    move = game.move({ from, to, promotion: "q" });
  } catch (err) {
    return false;                                  // illegal: let the click select another piece
  }

  const expected = puzzle.moves[step];
  const played = move.from + move.to + (move.promotion || "");
  // The right move, or any move that checkmates (many puzzles have several mates).
  const correct = played === expected || game.isCheckmate();

  selected = null;

  if (!correct) {
    game.undo();                                   // take the wrong move back
    if (!failed) {                                 // only lose rating once per puzzle
      failed = true;
      streak = 0;
      puzzleRating = newRating(puzzleRating, puzzle.rating, false);
      saveProgress();
      updatePuzzleStats();
    }
    puzzleMessage = "Not the best move. Try again, or tap Hint.";
    render();
    return true;
  }

  lastMove = move;
  step++;

  if (step >= puzzle.moves.length || game.isCheckmate()) {
    finishPuzzle();
    return true;
  }

  // Correct, and the puzzle goes on: the opponent replies automatically.
  const mine = session;
  thinking = true;
  puzzleMessage = "Correct! Keep going...";
  render();
  setTimeout(() => {
    if (mine !== session) return;
    lastMove = game.move(parseUci(puzzle.moves[step]));
    step++;
    thinking = false;
    puzzleMessage = "Your move.";
    render();
  }, 500);
  return true;
}

function finishPuzzle() {
  solved = true;
  if (!failed && !usedHelp) {
    streak++;
    puzzleRating = newRating(puzzleRating, puzzle.rating, true);
    saveProgress();
    puzzleMessage = "Correct! Puzzle solved.";
  } else {
    puzzleMessage = "Solved, but with help or a mistake, so no rating gain.";
  }
  puzzleInfo.textContent = `Puzzle rating ${puzzle.rating} · Themes: ${puzzle.themes.join(", ")}`;
  updatePuzzleStats();
  render();
}

function showHint() {
  if (!puzzle || solved || thinking) return;
  usedHelp = true;
  selected = parseUci(puzzle.moves[step]).from;   // highlight the piece to move
  puzzleMessage = "Hint: move the highlighted piece.";
  render();
}

function nextPuzzle() {
  if (puzzle && !solved && !failed) {              // skipping counts as a miss
    failed = true;
    streak = 0;
    puzzleRating = newRating(puzzleRating, puzzle.rating, false);
    saveProgress();
  }
  startPuzzle();
}

// =====================================================================
//  Tabs, buttons and dropdowns
// =====================================================================
function setMode(newMode) {
  mode = newMode;
  const puzzleOn = mode === "puzzle";
  tabPlay.classList.toggle("on", !puzzleOn);
  tabPuzzle.classList.toggle("on", puzzleOn);
  playBox.hidden = puzzleOn;
  playButtons.hidden = puzzleOn;
  puzzleBox.hidden = !puzzleOn;
  puzzleButtons.hidden = !puzzleOn;
  if (puzzleOn) startPuzzle(); else newGame();
}

for (const b of BOTS) {
  const opt = document.createElement("option");
  opt.value = b.id;
  opt.textContent = b.custom ? `${b.name} (you choose the Elo)` : `${b.name} (Elo ~${b.elo})`;
  botSel.appendChild(opt);
}

tabPlay.addEventListener("click", () => setMode("play"));
tabPuzzle.addEventListener("click", () => setMode("puzzle"));

$("newBtn").addEventListener("click", newGame);
botSel.addEventListener("change", newGame);
sideSel.addEventListener("change", newGame);

// Moving the slider changes the custom bot's Elo from its next move onwards.
eloSlider.addEventListener("input", () => {
  bot.elo = Number(eloSlider.value);
  eloVal.textContent = bot.elo;
  updateBotInfo();
});

$("undoBtn").addEventListener("click", () => {
  if (thinking) return;
  game.undo();                                                    // undo the last move
  if (game.turn() !== playerColor && game.history().length > 0) game.undo();   // and the one before, so it's our turn
  selected = null;
  const history = game.history({ verbose: true });
  lastMove = history.length ? history[history.length - 1] : null;
  render();
  maybeBotMove();   // only does something if it's the bot's turn (for example, an empty board as Black)
});

function flip() { flipped = !flipped; render(); }
$("flipBtn").addEventListener("click", flip);
$("flipBtn2").addEventListener("click", flip);

$("hintBtn").addEventListener("click", showHint);
$("nextBtn").addEventListener("click", nextPuzzle);

// ---------- Start ----------
loadProgress();
updatePuzzleStats();
setMode("play");