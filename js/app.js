// chess.js knows the rules of chess. We only draw the board and handle clicks.
import { Chess } from "./chess.js";
import { BOTS, levelName } from "./bot.js";

// ---------- State (the things that change) ----------
const game = new Chess();   // the game: pieces, whose turn, move history
let selected = null;        // the square the player tapped first, like "e2"
let lastMove = null;        // the last move made, so we can highlight it
let flipped = false;        // false = white at the bottom
let playerColor = "w";      // which side the human plays: "w" or "b"
let bot = BOTS[0];          // the opponent
let thinking = false;       // true while the bot is "thinking"

// ---------- Page elements ----------
const boardEl  = document.getElementById("board");
const statusEl = document.getElementById("status");
const movesEl  = document.getElementById("moves");
const botSel   = document.getElementById("botSel");
const sideSel  = document.getElementById("sideSel");
const botInfo  = document.getElementById("botInfo");

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
  // Ignore clicks if the game is over, the bot is thinking, or it's not our turn.
  if (game.isGameOver() || thinking || game.turn() !== playerColor) return;

  // If a piece is already selected, this click might be its move.
  if (selected) {
    if (selected === square) {            // tapped the same piece: deselect
      selected = null;
      return render();
    }
    try {
      // chess.js throws an error if the move is illegal
      lastMove = game.move({ from: selected, to: square, promotion: "q" });
      selected = null;
      render();
      return maybeBotMove();              // now it's the bot's turn
    } catch (err) {
      // Not a legal move. Fall through: maybe the player is picking another piece.
    }
  }

  const piece = game.get(square);
  selected = piece && piece.color === game.turn() ? square : null;
  render();
}

// ---------- The bot's turn ----------
function maybeBotMove() {
  if (game.isGameOver() || game.turn() === playerColor) return;

  thinking = true;
  renderStatus();

  // setTimeout lets the browser redraw first, so "thinking..." shows up,
  // and gives the bot's reply a natural short pause.
  setTimeout(() => {
    const move = bot.pick(game);       // ask the bot for a move (like "Nf6")
    lastMove = game.move(move);        // play it
    thinking = false;
    render();
  }, 400);
}

// ---------- Starting a game ----------
function newGame() {
  game.reset();
  selected = null;
  lastMove = null;
  thinking = false;
  playerColor = sideSel.value;
  bot = BOTS.find(b => b.id === botSel.value);
  botInfo.textContent = `Elo ~${bot.elo} · ${levelName(bot.elo)}`;
  flipped = playerColor === "b";       // show the board from the player's side
  render();
  maybeBotMove();                      // if the player is Black, the bot moves first
}

// ---------- Buttons and dropdowns ----------
for (const b of BOTS) {
  const opt = document.createElement("option");
  opt.value = b.id;
  opt.textContent = `${b.name} (Elo ~${b.elo})`;
  botSel.appendChild(opt);
}

document.getElementById("newBtn").addEventListener("click", newGame);
botSel.addEventListener("change", newGame);
sideSel.addEventListener("change", newGame);

document.getElementById("undoBtn").addEventListener("click", () => {
  if (thinking) return;
  game.undo();                                                    // undo the last move
  if (game.turn() !== playerColor && game.history().length > 0) game.undo();   // and the one before, so it's our turn
  selected = null;
  const history = game.history({ verbose: true });
  lastMove = history.length ? history[history.length - 1] : null;
  render();
  maybeBotMove();   // only does something if it's the bot's turn (for example, an empty board as Black)
});

document.getElementById("flipBtn").addEventListener("click", () => {
  flipped = !flipped;
  render();
});

// ---------- Start ----------
newGame();