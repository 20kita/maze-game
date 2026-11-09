import json
import math
from pathlib import Path
import pygame as py

# ---------- settings
CELL = 20                  # size of one square in pixels
COLS, ROWS = 60, 40        # board size in squares
TOP_BAR = 50               # space for the timer at the top
WIDTH = COLS * CELL
HEIGHT = ROWS * CELL + TOP_BAR
FPS = 30                   # the game logic runs 30 times per second

PLAYER_SPEED = 0.5         # squares per frame
ENEMY_SPEED = 0.25
ENEMY_MIN_X, ENEMY_MAX_X = 10, 50     # enemies bounce between these columns
DEVIL_SPEED = 0.15         # slower than the player, so you can run away
DEVIL_SIZE = 2

# ---------- the level (all positions are in squares: x, y, width, height)
PLAYER_START = (1, 3)
KEY_POS = (9, 27.5)
GATE = (1, 1, 1, 5)        # appears at the start after you pick up the key

WALLS = [
    (0, 0, 60, 1), (0, 0, 1, 40), (0, 39, 60, 1), (59, 0, 1, 40),   # border
    (0, 6, 55, 1),
    (5, 12, 55, 1),
    (0, 18, 55, 1),
    (5, 24, 55, 1),
    (5, 24, 1, 8),
    (5, 31, 50, 1),
]

# (checkpoint area, where you come back after dying)
CHECKPOINTS = [
    ((55, 6, 4, 1), (57, 6)),
    ((1, 12, 4, 1), (2, 12)),
    ((55, 18, 4, 1), (57, 18)),
    ((1, 24, 4, 1), (2, 24)),
    ((55, 31, 4, 1), (57, 31)),
]

# two groups of enemies moving left and right; each number is the row of one enemy
ENEMY_ROWS_A = [1, 3, 5, 8, 10, 13, 15, 17, 20, 22]   # start on the left
ENEMY_ROWS_B = [2, 4, 7, 9, 11, 14, 16, 19, 21, 23]   # start on the right

DEVIL_HOME = (30, 35)
DEVIL_ZONE = (1, 32, 58, 7)                 # the bottom corridor, where the devil hunts
DEVIL_MIN = (1, 32)                         # the devil can't leave the corridor
DEVIL_MAX = (59 - DEVIL_SIZE, 39 - DEVIL_SIZE)

MOVE_KEYS = {
    "left": (py.K_LEFT, py.K_a),
    "right": (py.K_RIGHT, py.K_d),
    "up": (py.K_UP, py.K_w),
    "down": (py.K_DOWN, py.K_s),
}
BEST_TIME_FILE = Path(__file__).with_name("best_time.json")

# ---------- colors (dark theme, same as my portfolio)
BACKGROUND = (18, 2, 26)          # #12021A
WALL = (58, 14, 80)
PANEL = (46, 7, 63)               # #2E073F
PURPLE = (173, 73, 225)           # #AD49E1
LIGHT_PURPLE = (199, 125, 255)    # #C77DFF
TEXT = (235, 211, 248)            # #EBD3F8
MUTED = (150, 120, 170)
CHECKPOINT = (80, 40, 110)
PLAYER = (235, 211, 248)
ENEMY = (255, 77, 141)
DEVIL = (255, 140, 66)
GOLD = (255, 209, 102)
BUTTON = (88, 28, 120)
BUTTON_HOVER = (120, 45, 165)


# ---------- best time
def load_best_time():
    """Read the best time from the file, or None if there isn't one yet."""
    try:
        return float(json.loads(BEST_TIME_FILE.read_text())["best_time"])
    except Exception:
        return None


def save_best_time(seconds):
    try:
        BEST_TIME_FILE.write_text(json.dumps({"best_time": round(seconds, 2)}))
    except Exception:
        pass  # if saving fails, the game still works


# ---------- small helpers
def format_time(seconds):
    """75.3 -> '1:15.3' (minutes:seconds.tenths)"""
    seconds = round(seconds, 1)   # round first, so 59.96 doesn't become '0:60.0'
    minutes, rest = divmod(seconds, 60)
    return f"{int(minutes)}:{rest:04.1f}"


def overlaps(a, b):
    """Do two boxes (x, y, w, h) overlap? Touching edges don't count."""
    return (a[0] < b[0] + b[2] and a[0] + a[2] > b[0] and
            a[1] < b[1] + b[3] and a[1] + a[3] > b[1])


def step_towards(current, target, speed):
    """Move a number one step towards the target, without jumping past it."""
    if abs(target - current) <= speed:
        return target
    return current + speed if target > current else current - speed


def clamp(value, low, high):
    return max(low, min(value, high))


def cell_rect(x, y, w=1, h=1):
    """Change a position in squares into a rectangle in pixels (below the top bar)."""
    return py.Rect(round(x * CELL), round(y * CELL) + TOP_BAR, round(w * CELL), round(h * CELL))


class Button:
    def __init__(self, text, center, width=220, height=50):
        self.text = text
        self.rect = py.Rect(0, 0, width, height)
        self.rect.center = center

    def draw(self, surface, font):
        color = BUTTON_HOVER if self.rect.collidepoint(py.mouse.get_pos()) else BUTTON
        py.draw.rect(surface, color, self.rect, border_radius=12)
        py.draw.rect(surface, PURPLE, self.rect, width=2, border_radius=12)
        label = font.render(self.text, True, TEXT)
        surface.blit(label, label.get_rect(center=self.rect.center))

    def clicked(self, event):
        return (event.type == py.MOUSEBUTTONDOWN and event.button == 1
                and self.rect.collidepoint(event.pos))


class Game:
    def __init__(self):
        py.init()
        py.display.set_caption("Maze Escape")
        self.screen = py.display.set_mode((WIDTH, HEIGHT))
        self.clock = py.time.Clock()

        fonts = "poppins,segoeui,arial"
        self.font_title = py.font.SysFont(fonts, 60, bold=True)
        self.font_mid = py.font.SysFont(fonts, 22, bold=True)
        self.font_small = py.font.SysFont(fonts, 20)

        center_x = WIDTH // 2
        center_y = HEIGHT // 2
        self.play_button = Button("Play", (center_x, center_y + 150))
        self.resume_button = Button("Resume", (center_x, center_y + 10))
        self.pause_menu_button = Button("Menu", (center_x, center_y + 75))
        self.again_button = Button("Play again", (center_x - 120, center_y + 110))
        self.won_menu_button = Button("Menu", (center_x + 120, center_y + 110))

        self.best_time = load_best_time()
        self.state = "menu"     # "menu", "playing", "paused" or "won"

        # enemies keep moving in every state, so the menu has a moving background
        self.enemy_a_x, self.enemy_a_dir = ENEMY_MIN_X, 1
        self.enemy_b_x, self.enemy_b_dir = ENEMY_MAX_X, -1
        self.new_game()

    def new_game(self):
        self.player_x, self.player_y = PLAYER_START
        self.respawn = PLAYER_START
        self.devil_x, self.devil_y = DEVIL_HOME
        self.has_key = False
        self.elapsed = 0.0
        self.new_record = False

    def start(self):
        self.new_game()
        self.state = "playing"

    # ---------- positions as boxes (x, y, w, h)
    def player_box(self, dx=0, dy=0):
        return (self.player_x + dx, self.player_y + dy, 1, 1)

    def enemy_boxes(self):
        return ([(self.enemy_a_x, row, 1, 1) for row in ENEMY_ROWS_A] +
                [(self.enemy_b_x, row, 1, 1) for row in ENEMY_ROWS_B])

    def devil_box(self):
        return (self.devil_x, self.devil_y, DEVIL_SIZE, DEVIL_SIZE)

    def key_box(self):
        return (KEY_POS[0], KEY_POS[1], 1, 1)

    # ---------- game logic
    def can_move(self, dx, dy):
        moved = self.player_box(dx, dy)
        return not any(overlaps(moved, wall) for wall in WALLS)

    def move_player(self):
        keys = py.key.get_pressed()
        held = {name: any(keys[k] for k in codes) for name, codes in MOVE_KEYS.items()}
        if held["right"] and self.can_move(PLAYER_SPEED, 0):
            self.player_x += PLAYER_SPEED
        if held["left"] and self.can_move(-PLAYER_SPEED, 0):
            self.player_x -= PLAYER_SPEED
        if held["up"] and self.can_move(0, -PLAYER_SPEED):
            self.player_y -= PLAYER_SPEED
        if held["down"] and self.can_move(0, PLAYER_SPEED):
            self.player_y += PLAYER_SPEED

    def move_enemies(self):
        self.enemy_a_x += ENEMY_SPEED * self.enemy_a_dir
        if self.enemy_a_x >= ENEMY_MAX_X or self.enemy_a_x <= ENEMY_MIN_X:
            self.enemy_a_dir *= -1
        self.enemy_b_x += ENEMY_SPEED * self.enemy_b_dir
        if self.enemy_b_x >= ENEMY_MAX_X or self.enemy_b_x <= ENEMY_MIN_X:
            self.enemy_b_dir *= -1

    def move_devil(self):
        """The devil chases you in the bottom corridor, and goes home when you leave."""
        if overlaps(self.player_box(), DEVIL_ZONE):
            # aim the middle of the devil at the middle of the player
            target_x = self.player_x + 0.5 - DEVIL_SIZE / 2
            target_y = self.player_y + 0.5 - DEVIL_SIZE / 2
        else:
            target_x, target_y = DEVIL_HOME
        self.devil_x = clamp(step_towards(self.devil_x, target_x, DEVIL_SPEED), DEVIL_MIN[0], DEVIL_MAX[0])
        self.devil_y = clamp(step_towards(self.devil_y, target_y, DEVIL_SPEED), DEVIL_MIN[1], DEVIL_MAX[1])

    def update(self, dt):
        self.move_enemies()
        if self.state != "playing":
            return

        self.elapsed += dt
        self.move_player()
        player = self.player_box()

        for area, respawn in CHECKPOINTS:
            if overlaps(player, area):
                self.respawn = respawn

        if not self.has_key and overlaps(player, self.key_box()):
            self.has_key = True

        if self.has_key and overlaps(player, GATE):
            self.win()
            return

        self.move_devil()

        for danger in self.enemy_boxes() + [self.devil_box()]:
            if overlaps(player, danger):
                self.player_x, self.player_y = self.respawn
                self.devil_x, self.devil_y = DEVIL_HOME   # so it doesn't wait at the checkpoint
                break

    def win(self):
        self.state = "won"
        self.new_record = self.best_time is None or self.elapsed < self.best_time
        if self.new_record:
            self.best_time = self.elapsed
            save_best_time(self.best_time)

    # ---------- input
    def is_key(self, event, *keys):
        return event.type == py.KEYDOWN and event.key in keys

    def handle_event(self, event):
        if self.state == "menu":
            if self.is_key(event, py.K_RETURN, py.K_SPACE) or self.play_button.clicked(event):
                self.start()

        elif self.state == "playing":
            if self.is_key(event, py.K_p, py.K_ESCAPE):
                self.state = "paused"
            elif event.type == py.WINDOWFOCUSLOST:
                self.state = "paused"    # auto-pause when you click outside the game

        elif self.state == "paused":
            if self.is_key(event, py.K_p, py.K_ESCAPE, py.K_RETURN, py.K_SPACE) or self.resume_button.clicked(event):
                self.state = "playing"
            elif self.is_key(event, py.K_m) or self.pause_menu_button.clicked(event):
                self.new_game()
                self.state = "menu"

        elif self.state == "won":
            if self.is_key(event, py.K_RETURN, py.K_SPACE, py.K_r) or self.again_button.clicked(event):
                self.start()
            elif self.is_key(event, py.K_ESCAPE, py.K_m) or self.won_menu_button.clicked(event):
                self.new_game()
                self.state = "menu"

    # ---------- drawing helpers
    def text(self, text, font, color, **position):
        """Draw text placed like a Rect, e.g. text(..., center=(x, y)) or midleft=(x, y)."""
        image = font.render(text, True, color)
        self.screen.blit(image, image.get_rect(**position))

    def draw_overlay(self, alpha=200):
        shade = py.Surface((WIDTH, HEIGHT), py.SRCALPHA)
        shade.fill((*BACKGROUND, alpha))
        self.screen.blit(shade, (0, 0))

    def draw_panel(self, width, height):
        """A rounded card in the middle of the screen. Returns its rectangle."""
        rect = py.Rect(0, 0, width, height)
        rect.center = (WIDTH // 2, HEIGHT // 2)
        py.draw.rect(self.screen, PANEL, rect, border_radius=24)
        py.draw.rect(self.screen, PURPLE, rect, width=3, border_radius=24)
        return rect

    def draw_key(self, rect):
        """A key: a ring, a shaft and two teeth."""
        r = rect.w // 3
        head = (rect.left + r, rect.centery)
        py.draw.circle(self.screen, GOLD, head, r)
        py.draw.circle(self.screen, BACKGROUND, head, r // 2)
        py.draw.rect(self.screen, GOLD, (head[0] + r - 1, rect.centery - 2, rect.w - r, 4))
        py.draw.rect(self.screen, GOLD, (rect.right - 4, rect.centery, 3, 6))
        py.draw.rect(self.screen, GOLD, (rect.right - 9, rect.centery, 3, 5))

    def draw_devil(self, rect):
        """The devil: an orange square with horns and eyes."""
        horn = rect.w // 4
        py.draw.polygon(self.screen, DEVIL, [(rect.left, rect.top + 4), (rect.left + horn, rect.top + 4), (rect.left, rect.top - horn)])
        py.draw.polygon(self.screen, DEVIL, [(rect.right, rect.top + 4), (rect.right - horn, rect.top + 4), (rect.right, rect.top - horn)])
        py.draw.rect(self.screen, DEVIL, rect, border_radius=8)
        eye = rect.w // 8
        py.draw.circle(self.screen, BACKGROUND, (rect.left + rect.w // 3, rect.top + rect.h // 3), eye)
        py.draw.circle(self.screen, BACKGROUND, (rect.right - rect.w // 3, rect.top + rect.h // 3), eye)

    # ---------- drawing the game
    def draw_board(self):
        self.screen.fill(BACKGROUND)
        for wall in WALLS:
            py.draw.rect(self.screen, WALL, cell_rect(*wall))

        # the active checkpoint (where you will come back) glows brighter
        for area, respawn in CHECKPOINTS:
            color = LIGHT_PURPLE if respawn == self.respawn else CHECKPOINT
            py.draw.rect(self.screen, color, cell_rect(*area), border_radius=4)

        for enemy in self.enemy_boxes():
            py.draw.rect(self.screen, ENEMY, cell_rect(*enemy).inflate(-2, -2), border_radius=5)
        self.draw_devil(cell_rect(*self.devil_box()))

        if self.has_key:
            # the gate pulses: sin() gives a number that goes smoothly up and down
            pulse = (math.sin(py.time.get_ticks() / 200) + 1) / 2
            color = [int(c * (0.6 + 0.4 * pulse)) for c in GOLD]
            py.draw.rect(self.screen, color, cell_rect(*GATE), border_radius=4)
        else:
            self.draw_key(cell_rect(*self.key_box()).inflate(14, 14))   # drawn bigger than its hitbox

        player = cell_rect(*self.player_box())
        py.draw.rect(self.screen, PLAYER, player, border_radius=5)
        py.draw.rect(self.screen, PURPLE, player, width=2, border_radius=5)

    def draw_top_bar(self):
        py.draw.rect(self.screen, PANEL, (0, 0, WIDTH, TOP_BAR))
        py.draw.line(self.screen, PURPLE, (0, TOP_BAR - 2), (WIDTH, TOP_BAR - 2), 2)
        middle = TOP_BAR // 2

        self.text(f"Time: {format_time(self.elapsed)}", self.font_mid, TEXT, midleft=(20, middle))
        self.text("MAZE ESCAPE", self.font_mid, LIGHT_PURPLE, center=(WIDTH // 2, middle))

        best = "Best: -" if self.best_time is None else f"Best: {format_time(self.best_time)}"
        best_image = self.font_small.render(best, True, MUTED)
        best_rect = best_image.get_rect(midright=(WIDTH - 20, middle))
        self.screen.blit(best_image, best_rect)

        if self.has_key:
            self.text("Got the key - back to the start!", self.font_small, GOLD,
                      midright=(best_rect.left - 30, middle))

    def draw_menu(self):
        self.draw_overlay()
        panel = self.draw_panel(720, 460)
        x = WIDTH // 2
        self.text("MAZE ESCAPE", self.font_title, PURPLE, center=(x, panel.top + 70))
        self.text("Get the key at the bottom of the maze and bring it back to the start.",
                  self.font_small, TEXT, center=(x, panel.top + 150))
        self.text("Watch out for the pink enemies and the devil in the bottom corridor!",
                  self.font_small, TEXT, center=(x, panel.top + 182))
        self.text("Move: arrows or WASD   |   Pause: P or Esc",
                  self.font_small, MUTED, center=(x, panel.top + 235))
        if self.best_time is None:
            self.text("Best time: -", self.font_mid, MUTED, center=(x, panel.top + 290))
        else:
            self.text(f"Best time: {format_time(self.best_time)}", self.font_mid, GOLD, center=(x, panel.top + 290))
        self.play_button.draw(self.screen, self.font_mid)

    def draw_paused(self):
        self.draw_overlay(170)
        panel = self.draw_panel(420, 280)
        self.text("PAUSED", self.font_title, PURPLE, center=(WIDTH // 2, panel.top + 65))
        self.resume_button.draw(self.screen, self.font_mid)
        self.pause_menu_button.draw(self.screen, self.font_mid)

    def draw_won(self):
        self.draw_overlay()
        panel = self.draw_panel(600, 340)
        x = WIDTH // 2
        self.text("YOU ESCAPED!", self.font_title, GOLD, center=(x, panel.top + 70))
        self.text(f"Your time: {format_time(self.elapsed)}", self.font_mid, TEXT, center=(x, panel.top + 145))
        if self.new_record:
            self.text("NEW BEST TIME!", self.font_mid, LIGHT_PURPLE, center=(x, panel.top + 185))
        else:
            self.text(f"Best time: {format_time(self.best_time)}", self.font_small, MUTED, center=(x, panel.top + 185))
        self.again_button.draw(self.screen, self.font_mid)
        self.won_menu_button.draw(self.screen, self.font_mid)

    def draw(self):
        self.draw_board()
        self.draw_top_bar()
        if self.state == "menu":
            self.draw_menu()
        elif self.state == "paused":
            self.draw_paused()
        elif self.state == "won":
            self.draw_won()
        py.display.flip()

    # ---------- main loop
    def run(self):
        while True:
            dt = self.clock.tick(FPS) / 1000    # seconds since the last frame
            for event in py.event.get():
                if event.type == py.QUIT:
                    py.quit()
                    return
                self.handle_event(event)
            self.update(dt)
            self.draw()


if __name__ == "__main__":
    Game().run()