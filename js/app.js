// chess.js knows the rules of chess. We only draw the board and handle clicks.
import { Chess } from "./chess.js";

// ---------- State (the things that change) ----------
const game = new Chess();   // the game: pieces, whose turn, move history
let selected = null;        // the square the player tapped first, like "e2"
let lastMove = null;        // the last move made, so we can highlight it
let flipped = false;        // false = white at the bottom

// ---------- Page elements ----------
const boardEl  = document.getElementById("board");
const statusEl = document.getElementById("status");
const movesEl  = document.getElementById("moves");

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
  const side = game.turn() === "w" ? "White" : "Black";
  const other = game.turn() === "w" ? "Black" : "White";

  if (game.isCheckmate())            statusEl.textContent = `Checkmate. ${other} wins.`;
  else if (game.isStalemate())       statusEl.textContent = "Draw by stalemate.";
  else if (game.isThreefoldRepetition()) statusEl.textContent = "Draw by repetition.";
  else if (game.isInsufficientMaterial()) statusEl.textContent = "Draw: not enough pieces to mate.";
  else if (game.isDraw())            statusEl.textContent = "Draw.";
  else statusEl.textContent = `${side} to move` + (game.inCheck() ? " (check!)" : "");
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
  if (game.isGameOver()) return;

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
      return render();
    } catch (err) {
      // Not a legal move. Fall through: maybe the player is picking another piece.
    }
  }

  const piece = game.get(square);
  selected = piece && piece.color === game.turn() ? square : null;
  render();
}

// ---------- Buttons ----------
document.getElementById("newBtn").addEventListener("click", () => {
  game.reset();
  selected = null;
  lastMove = null;
  render();
});

document.getElementById("undoBtn").addEventListener("click", () => {
  game.undo();
  selected = null;
  const history = game.history({ verbose: true });
  lastMove = history.length ? history[history.length - 1] : null;
  render();
});

document.getElementById("flipBtn").addEventListener("click", () => {
  flipped = !flipped;
  render();
});

// ---------- Start ----------
render();