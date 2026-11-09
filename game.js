// Maze Escape - JavaScript version of the Python/pygame game.
// Controls: Arrows / WASD to move, P or Esc to pause, Enter to play.
// On phones: drag your finger to move (like a joystick), tap the top bar to pause.

// ---------------------------------------------------------------- settings
const CELL = 20;              // size of one square in pixels
const COLS = 60;              // board size in squares
const ROWS = 40;
const TOP_BAR = 50;           // height of the timer bar
const WIDTH = COLS * CELL;
const HEIGHT = ROWS * CELL + TOP_BAR;
const STEP = 1 / 30;          // the game logic runs 30 times per second, like the Python version

const PLAYER_SPEED = 0.5;     // squares per step
const ENEMY_SPEED = 0.25;
const ENEMY_MIN_X = 10;       // enemies bounce between these columns
const ENEMY_MAX_X = 50;
const DEVIL_SPEED = 0.15;     // slower than the player, so you can run away
const DEVIL_SIZE = 2;

// ---------------------------------------------------------------- the level
// all positions are in squares: [x, y, width, height]
const PLAYER_START = [1, 3];
const KEY_POS = [9, 27.5];
const GATE = [1, 1, 1, 5];    // appears at the start after you pick up the key

const WALLS = [
  [0, 0, 60, 1], [0, 0, 1, 40], [0, 39, 60, 1], [59, 0, 1, 40],   // border
  [0, 6, 55, 1],
  [5, 12, 55, 1],
  [0, 18, 55, 1],
  [5, 24, 55, 1],
  [5, 24, 1, 8],
  [5, 31, 50, 1],
];

// checkpoint area + where you come back after dying
const CHECKPOINTS = [
  { area: [55, 6, 4, 1], respawn: [57, 6] },
  { area: [1, 12, 4, 1], respawn: [2, 12] },
  { area: [55, 18, 4, 1], respawn: [57, 18] },
  { area: [1, 24, 4, 1], respawn: [2, 24] },
  { area: [55, 31, 4, 1], respawn: [57, 31] },
];

// two groups of enemies moving left and right; each number is the row of one enemy
const ENEMY_ROWS_A = [1, 3, 5, 8, 10, 13, 15, 17, 20, 22];   // start on the left
const ENEMY_ROWS_B = [2, 4, 7, 9, 11, 14, 16, 19, 21, 23];   // start on the right

const DEVIL_HOME = [30, 35];
const DEVIL_ZONE = [1, 32, 58, 7];          // the bottom corridor, where the devil hunts
const DEVIL_MIN = [1, 32];                  // the devil can't leave the corridor
const DEVIL_MAX = [59 - DEVIL_SIZE, 39 - DEVIL_SIZE];

// event.code is the physical key, so WASD works on any keyboard layout
const MOVE_KEYS = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
};

const IS_TOUCH = window.matchMedia("(pointer: coarse)").matches;   // phone or tablet

// ---------------------------------------------------------------- colors (dark theme, same as my portfolio)
const COLORS = {
  background: "#12021A",
  wall: "rgb(58, 14, 80)",
  panel: "#2E073F",
  purple: "#AD49E1",
  lightPurple: "#C77DFF",
  text: "#EBD3F8",
  muted: "rgb(150, 120, 170)",
  checkpoint: "rgb(80, 40, 110)",
  player: "#EBD3F8",
  enemy: "rgb(255, 77, 141)",
  devil: "rgb(255, 140, 66)",
  gold: "rgb(255, 209, 102)",
  button: "rgb(88, 28, 120)",
  buttonHover: "rgb(120, 45, 165)",
};
const GOLD_RGB = [255, 209, 102];

const FONT_FAMILY = "Poppins, 'Segoe UI', Arial, sans-serif";
const FONTS = {
  title: `bold 56px ${FONT_FAMILY}`,
  mid: `bold 21px ${FONT_FAMILY}`,
  small: `19px ${FONT_FAMILY}`,
};

// ---------------------------------------------------------------- best time
// websites can't write files, so the best time is kept in the browser's localStorage
const STORAGE_KEY = "maze_best_time";

function loadBestTime() {
  try {
    const value = parseFloat(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(value) ? value : null;
  } catch (error) {
    return null;   // storage is blocked - no best time
  }
}

function saveBestTime(seconds) {
  try {
    localStorage.setItem(STORAGE_KEY, seconds.toFixed(2));
  } catch (error) {
    // if saving fails, the game still works
  }
}

// ---------------------------------------------------------------- small helpers
// 75.3 -> "1:15.3" (minutes:seconds.tenths)
function formatTime(seconds) {
  const tenths = Math.round(seconds * 10);   // round first, so 59.96 doesn't become "0:60.0"
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths % 600) / 10;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}

// do two boxes [x, y, w, h] overlap? Touching edges don't count
function overlaps(a, b) {
  return a[0] < b[0] + b[2] && a[0] + a[2] > b[0] &&
         a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
}

// move a number one step towards the target, without jumping past it
function stepTowards(current, target, speed) {
  if (Math.abs(target - current) <= speed) return target;
  return target > current ? current + speed : current - speed;
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(value, high));
}

// change a box in squares into pixels (below the top bar)
function cellRect(box) {
  return { x: box[0] * CELL, y: box[1] * CELL + TOP_BAR, w: box[2] * CELL, h: box[3] * CELL };
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillRoundRect(ctx, rect, r, color) {
  roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeRoundRect(ctx, rect, r, color, lineWidth) {
  // the line is drawn half inside, half outside - move it inside like pygame does
  const half = lineWidth / 2;
  roundRectPath(ctx, rect.x + half, rect.y + half, rect.w - lineWidth, rect.h - lineWidth, r);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawText(ctx, text, x, y, font, color, align = "center") {
  ctx.font = font;
  ctx.textAlign = align;          // "center", "left" or "right"
  ctx.textBaseline = "middle";    // y is the middle of the text
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  return ctx.measureText(text).width;
}

// ---------------------------------------------------------------- button
class Button {
  constructor(text, centerX, centerY, width = 220, height = 50) {
    this.text = text;
    this.rect = { x: centerX - width / 2, y: centerY - height / 2, w: width, h: height };
  }

  contains(px, py) {
    const r = this.rect;
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  draw(ctx, mouse) {
    const color = this.contains(mouse.x, mouse.y) ? COLORS.buttonHover : COLORS.button;
    fillRoundRect(ctx, this.rect, 12, color);
    strokeRoundRect(ctx, this.rect, 12, COLORS.purple, 2);
    drawText(ctx, this.text, this.rect.x + this.rect.w / 2, this.rect.y + this.rect.h / 2, FONTS.mid, COLORS.text);
  }
}

// ---------------------------------------------------------------- game
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    // draw at the screen's real pixel density, so it stays sharp on phones and retina screens
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    this.ctx.scale(dpr, dpr);

    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    this.playButton = new Button("Play", cx, cy + 150);
    this.resumeButton = new Button("Resume", cx, cy + 10);
    this.pauseMenuButton = new Button("Menu", cx, cy + 75);
    this.againButton = new Button("Play again", cx - 120, cy + 110);
    this.wonMenuButton = new Button("Menu", cx + 120, cy + 110);

    this.bestTime = loadBestTime();
    this.state = "menu";        // "menu", "playing", "paused" or "won"

    // enemies keep moving in every state, so the menu has a moving background
    this.enemyAX = ENEMY_MIN_X;
    this.enemyADir = 1;
    this.enemyBX = ENEMY_MAX_X;
    this.enemyBDir = -1;

    this.keysDown = new Set();             // keys that are held right now
    this.touchMove = { x: 0, y: 0 };       // direction from the touch "joystick"
    this.joystick = null;                  // where the finger started, while touching
    this.mouse = { x: -1, y: -1 };

    this.newGame();
    this.addInput();

    this.lastTime = null;
    this.timeBank = 0;                     // time waiting to be turned into game steps
    requestAnimationFrame((t) => this.loop(t));
  }

  newGame() {
    [this.playerX, this.playerY] = PLAYER_START;
    this.respawn = PLAYER_START;
    [this.devilX, this.devilY] = DEVIL_HOME;
    this.hasKey = false;
    this.elapsed = 0;
    this.newRecord = false;
  }

  start() {
    this.newGame();
    this.state = "playing";
  }

  pause() {
    if (this.state === "playing") this.state = "paused";
  }

  goToMenu() {
    this.newGame();
    this.state = "menu";
  }

  // ---------------------------------------------------------------- positions as boxes [x, y, w, h]
  playerBox(dx = 0, dy = 0) {
    return [this.playerX + dx, this.playerY + dy, 1, 1];
  }

  enemyBoxes() {
    return [
      ...ENEMY_ROWS_A.map((row) => [this.enemyAX, row, 1, 1]),
      ...ENEMY_ROWS_B.map((row) => [this.enemyBX, row, 1, 1]),
    ];
  }

  devilBox() {
    return [this.devilX, this.devilY, DEVIL_SIZE, DEVIL_SIZE];
  }

  keyBox() {
    return [KEY_POS[0], KEY_POS[1], 1, 1];
  }

  // ---------------------------------------------------------------- game logic
  canMove(dx, dy) {
    const moved = this.playerBox(dx, dy);
    return !WALLS.some((wall) => overlaps(moved, wall));
  }

  isHeld(direction) {
    return MOVE_KEYS[direction].some((code) => this.keysDown.has(code));
  }

  movePlayer() {
    const right = this.isHeld("right") || this.touchMove.x > 0;
    const left = this.isHeld("left") || this.touchMove.x < 0;
    const up = this.isHeld("up") || this.touchMove.y < 0;
    const down = this.isHeld("down") || this.touchMove.y > 0;

    if (right && this.canMove(PLAYER_SPEED, 0)) this.playerX += PLAYER_SPEED;
    if (left && this.canMove(-PLAYER_SPEED, 0)) this.playerX -= PLAYER_SPEED;
    if (up && this.canMove(0, -PLAYER_SPEED)) this.playerY -= PLAYER_SPEED;
    if (down && this.canMove(0, PLAYER_SPEED)) this.playerY += PLAYER_SPEED;
  }

  moveEnemies() {
    this.enemyAX += ENEMY_SPEED * this.enemyADir;
    if (this.enemyAX >= ENEMY_MAX_X || this.enemyAX <= ENEMY_MIN_X) this.enemyADir *= -1;
    this.enemyBX += ENEMY_SPEED * this.enemyBDir;
    if (this.enemyBX >= ENEMY_MAX_X || this.enemyBX <= ENEMY_MIN_X) this.enemyBDir *= -1;
  }

  // the devil chases you in the bottom corridor, and goes home when you leave
  moveDevil() {
    let targetX, targetY;
    if (overlaps(this.playerBox(), DEVIL_ZONE)) {
      // aim the middle of the devil at the middle of the player
      targetX = this.playerX + 0.5 - DEVIL_SIZE / 2;
      targetY = this.playerY + 0.5 - DEVIL_SIZE / 2;
    } else {
      [targetX, targetY] = DEVIL_HOME;
    }
    this.devilX = clamp(stepTowards(this.devilX, targetX, DEVIL_SPEED), DEVIL_MIN[0], DEVIL_MAX[0]);
    this.devilY = clamp(stepTowards(this.devilY, targetY, DEVIL_SPEED), DEVIL_MIN[1], DEVIL_MAX[1]);
  }

  update() {
    this.moveEnemies();
    if (this.state !== "playing") return;

    this.elapsed += STEP;
    this.movePlayer();
    const player = this.playerBox();

    for (const checkpoint of CHECKPOINTS) {
      if (overlaps(player, checkpoint.area)) this.respawn = checkpoint.respawn;
    }

    if (!this.hasKey && overlaps(player, this.keyBox())) this.hasKey = true;

    if (this.hasKey && overlaps(player, GATE)) {
      this.win();
      return;
    }

    this.moveDevil();

    for (const danger of [...this.enemyBoxes(), this.devilBox()]) {
      if (overlaps(player, danger)) {
        [this.playerX, this.playerY] = this.respawn;
        [this.devilX, this.devilY] = DEVIL_HOME;   // so it doesn't wait at the checkpoint
        break;
      }
    }
  }

  win() {
    this.state = "won";
    this.newRecord = this.bestTime === null || this.elapsed < this.bestTime;
    if (this.newRecord) {
      this.bestTime = this.elapsed;
      saveBestTime(this.bestTime);
    }
  }

  // ---------------------------------------------------------------- input
  addInput() {
    window.addEventListener("keydown", (event) => {
      // stop arrows and space from scrolling the page (e.g. in the portfolio)
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
        event.preventDefault();
      }
      this.keysDown.add(event.code);
      if (!event.repeat) this.handleKey(event.code);
    });
    window.addEventListener("keyup", (event) => this.keysDown.delete(event.code));

    // pointer events work for the mouse and for fingers
    this.canvas.addEventListener("pointermove", (event) => this.onPointerMove(event));
    this.canvas.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.canvas.addEventListener("pointerup", () => this.stopJoystick());
    this.canvas.addEventListener("pointercancel", () => this.stopJoystick());
    this.canvas.addEventListener("pointerleave", () => { this.mouse = { x: -1, y: -1 }; });

    // auto-pause when you switch tabs or click outside the game
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.pause();
    });
    window.addEventListener("blur", () => {
      this.pause();
      this.keysDown.clear();   // otherwise a key could stay "held" forever
    });
  }

  handleKey(code) {
    const isEnter = code === "Enter" || code === "NumpadEnter" || code === "Space";
    if (this.state === "menu") {
      if (isEnter) this.start();
    } else if (this.state === "playing") {
      if (code === "KeyP" || code === "Escape") this.pause();
    } else if (this.state === "paused") {
      if (isEnter || code === "KeyP" || code === "Escape") this.state = "playing";
      else if (code === "KeyM") this.goToMenu();
    } else if (this.state === "won") {
      if (isEnter || code === "KeyR") this.start();
      else if (code === "Escape" || code === "KeyM") this.goToMenu();
    }
  }

  // the canvas is scaled by CSS, so change screen pixels into game pixels
  toGame(event) {
    const box = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - box.left) * (WIDTH / box.width),
      y: (event.clientY - box.top) * (HEIGHT / box.height),
    };
  }

  onPointerDown(event) {
    const point = this.toGame(event);
    this.mouse = point;

    if (this.state === "menu" && this.playButton.contains(point.x, point.y)) this.start();
    else if (this.state === "paused") {
      if (this.resumeButton.contains(point.x, point.y)) this.state = "playing";
      else if (this.pauseMenuButton.contains(point.x, point.y)) this.goToMenu();
    } else if (this.state === "won") {
      if (this.againButton.contains(point.x, point.y)) this.start();
      else if (this.wonMenuButton.contains(point.x, point.y)) this.goToMenu();
    } else if (this.state === "playing" && event.pointerType !== "mouse") {
      if (point.y < TOP_BAR) {
        this.pause();   // tap the top bar to pause
      } else {
        this.joystick = { startX: point.x, startY: point.y, x: point.x, y: point.y };
        this.canvas.setPointerCapture(event.pointerId);
      }
    }
  }

  onPointerMove(event) {
    const point = this.toGame(event);
    this.mouse = point;
    if (!this.joystick) return;

    this.joystick.x = point.x;
    this.joystick.y = point.y;
    // a small "dead zone", so a shaky finger doesn't move you by accident
    const deadZone = 25;
    const dx = point.x - this.joystick.startX;
    const dy = point.y - this.joystick.startY;
    this.touchMove.x = Math.abs(dx) > deadZone ? Math.sign(dx) : 0;
    this.touchMove.y = Math.abs(dy) > deadZone ? Math.sign(dy) : 0;
  }

  stopJoystick() {
    this.joystick = null;
    this.touchMove = { x: 0, y: 0 };
  }

  // ---------------------------------------------------------------- drawing helpers
  drawOverlay(alpha = 200) {
    this.ctx.fillStyle = `rgba(18, 2, 26, ${alpha / 255})`;
    this.ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // a rounded card in the middle of the screen; returns its rectangle
  drawPanel(width, height) {
    const rect = { x: (WIDTH - width) / 2, y: (HEIGHT - height) / 2, w: width, h: height };
    fillRoundRect(this.ctx, rect, 24, COLORS.panel);
    strokeRoundRect(this.ctx, rect, 24, COLORS.purple, 3);
    return rect;
  }

  // a key: a ring, a shaft and two teeth
  drawKey(rect) {
    const ctx = this.ctx;
    const r = Math.floor(rect.w / 3);
    const headX = rect.x + r;
    const midY = rect.y + rect.h / 2;
    ctx.fillStyle = COLORS.gold;
    ctx.beginPath();
    ctx.arc(headX, midY, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.background;
    ctx.beginPath();
    ctx.arc(headX, midY, r / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(headX + r - 1, midY - 2, rect.w - r, 4);
    ctx.fillRect(rect.x + rect.w - 4, midY, 3, 6);
    ctx.fillRect(rect.x + rect.w - 9, midY, 3, 5);
  }

  // the devil: an orange square with horns and eyes
  drawDevil(rect) {
    const ctx = this.ctx;
    const horn = rect.w / 4;
    const left = rect.x;
    const right = rect.x + rect.w;
    const top = rect.y;
    ctx.fillStyle = COLORS.devil;
    ctx.beginPath();
    ctx.moveTo(left, top + 4);
    ctx.lineTo(left + horn, top + 4);
    ctx.lineTo(left, top - horn);
    ctx.moveTo(right, top + 4);
    ctx.lineTo(right - horn, top + 4);
    ctx.lineTo(right, top - horn);
    ctx.fill();
    fillRoundRect(ctx, rect, 8, COLORS.devil);

    const eye = rect.w / 8;
    ctx.fillStyle = COLORS.background;
    ctx.beginPath();
    ctx.arc(left + rect.w / 3, top + rect.h / 3, eye, 0, Math.PI * 2);
    ctx.arc(right - rect.w / 3, top + rect.h / 3, eye, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------------------------------------------------------------- drawing the game
  drawBoard(now) {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = COLORS.wall;
    for (const wall of WALLS) {
      const r = cellRect(wall);
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }

    // the active checkpoint (where you will come back) glows brighter
    for (const checkpoint of CHECKPOINTS) {
      const active = checkpoint.respawn === this.respawn;
      fillRoundRect(ctx, cellRect(checkpoint.area), 4, active ? COLORS.lightPurple : COLORS.checkpoint);
    }

    for (const enemy of this.enemyBoxes()) {
      const r = cellRect(enemy);
      fillRoundRect(ctx, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, 5, COLORS.enemy);
    }
    this.drawDevil(cellRect(this.devilBox()));

    if (this.hasKey) {
      // the gate pulses: sin() gives a number that goes smoothly up and down
      const pulse = (Math.sin(now / 200) + 1) / 2;
      const [red, green, blue] = GOLD_RGB.map((c) => Math.floor(c * (0.6 + 0.4 * pulse)));
      fillRoundRect(ctx, cellRect(GATE), 4, `rgb(${red}, ${green}, ${blue})`);
    } else {
      const r = cellRect(this.keyBox());
      this.drawKey({ x: r.x - 7, y: r.y - 7, w: r.w + 14, h: r.h + 14 });   // drawn bigger than its hitbox
    }

    const player = cellRect(this.playerBox());
    fillRoundRect(ctx, player, 5, COLORS.player);
    strokeRoundRect(ctx, player, 5, COLORS.purple, 2);
  }

  drawTopBar() {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, WIDTH, TOP_BAR);
    ctx.fillStyle = COLORS.purple;
    ctx.fillRect(0, TOP_BAR - 3, WIDTH, 2);
    const middle = TOP_BAR / 2;

    drawText(ctx, `Time: ${formatTime(this.elapsed)}`, 20, middle, FONTS.mid, COLORS.text, "left");
    drawText(ctx, "MAZE ESCAPE", WIDTH / 2, middle, FONTS.mid, COLORS.lightPurple);

    const best = this.bestTime === null ? "Best: -" : `Best: ${formatTime(this.bestTime)}`;
    const bestWidth = drawText(ctx, best, WIDTH - 20, middle, FONTS.small, COLORS.muted, "right");

    if (this.hasKey) {
      drawText(ctx, "Got the key - back to the start!", WIDTH - 50 - bestWidth, middle,
               FONTS.small, COLORS.gold, "right");
    }
  }

  drawMenu() {
    this.drawOverlay();
    const panel = this.drawPanel(720, 460);
    const x = WIDTH / 2;
    const ctx = this.ctx;
    drawText(ctx, "MAZE ESCAPE", x, panel.y + 70, FONTS.title, COLORS.purple);
    drawText(ctx, "Get the key at the bottom of the maze and bring it back to the start.",
             x, panel.y + 150, FONTS.small, COLORS.text);
    drawText(ctx, "Watch out for the pink enemies and the devil in the bottom corridor!",
             x, panel.y + 182, FONTS.small, COLORS.text);
    const hint = IS_TOUCH
      ? "Move: drag your finger   |   Pause: tap the top bar"
      : "Move: arrows or WASD   |   Pause: P or Esc";
    drawText(ctx, hint, x, panel.y + 235, FONTS.small, COLORS.muted);
    if (this.bestTime === null) {
      drawText(ctx, "Best time: -", x, panel.y + 290, FONTS.mid, COLORS.muted);
    } else {
      drawText(ctx, `Best time: ${formatTime(this.bestTime)}`, x, panel.y + 290, FONTS.mid, COLORS.gold);
    }
    this.playButton.draw(ctx, this.mouse);
  }

  drawPaused() {
    this.drawOverlay(170);
    const panel = this.drawPanel(420, 280);
    drawText(this.ctx, "PAUSED", WIDTH / 2, panel.y + 65, FONTS.title, COLORS.purple);
    this.resumeButton.draw(this.ctx, this.mouse);
    this.pauseMenuButton.draw(this.ctx, this.mouse);
  }

  drawWon() {
    this.drawOverlay();
    const panel = this.drawPanel(600, 340);
    const x = WIDTH / 2;
    const ctx = this.ctx;
    drawText(ctx, "YOU ESCAPED!", x, panel.y + 70, FONTS.title, COLORS.gold);
    drawText(ctx, `Your time: ${formatTime(this.elapsed)}`, x, panel.y + 145, FONTS.mid, COLORS.text);
    if (this.newRecord) {
      drawText(ctx, "NEW BEST TIME!", x, panel.y + 185, FONTS.mid, COLORS.lightPurple);
    } else {
      drawText(ctx, `Best time: ${formatTime(this.bestTime)}`, x, panel.y + 185, FONTS.small, COLORS.muted);
    }
    this.againButton.draw(ctx, this.mouse);
    this.wonMenuButton.draw(ctx, this.mouse);
  }

  // the touch joystick: a ring where the finger started and a dot where it is now
  drawJoystick() {
    if (!this.joystick) return;
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(199, 125, 255, 0.6)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.joystick.startX, this.joystick.startY, 45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(199, 125, 255, 0.6)";
    ctx.beginPath();
    ctx.arc(this.joystick.x, this.joystick.y, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  draw(now) {
    this.drawBoard(now);
    this.drawTopBar();
    if (this.state === "menu") this.drawMenu();
    else if (this.state === "paused") this.drawPaused();
    else if (this.state === "won") this.drawWon();
    else this.drawJoystick();
  }

  // ---------------------------------------------------------------- main loop
  // the screen can refresh 60, 120 or 144 times per second, but the game should run at the
  // same speed everywhere - so the time is collected and turned into steps of 1/30 s
  loop(now) {
    if (this.lastTime === null) this.lastTime = now;
    const dt = Math.min((now - this.lastTime) / 1000, 0.25);   // max 0.25 s, e.g. after a lag
    this.lastTime = now;

    this.timeBank += dt;
    while (this.timeBank >= STEP) {
      this.update();
      this.timeBank -= STEP;
    }
    this.draw(now);
    requestAnimationFrame((t) => this.loop(t));
  }
}

if (window.self !== window.top) {
  document.body.classList.add("embedded");   // running inside an iframe
}
const game = new Game(document.getElementById("game"));