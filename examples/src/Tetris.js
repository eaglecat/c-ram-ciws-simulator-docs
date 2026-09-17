// MissionFormatVersion: 1
// ============================================
// TETRIS — inside a combat flight game.
//
// Absurdity-proof for the pure-JS custom game stack: this mission ignores
// the entire war game and renders a playable Tetris on a UGUI canvas.
// Everything below is plain mission JS using:
//   - CS.* (PuerTS full engine access) for UI construction
//   - JsEventRelay.onUpdate as the game loop
//   - CS.UnityEngine.InputSystem.Keyboard for controls (+ on-screen buttons)
//   - mission.win()/fail() to end the round
//
// Goal: clear 10 lines to WIN. Stack out = lose.
// Controls: arrows move/rotate, down = soft drop, space = hard drop.
// ============================================

const COLS = 10;
const ROWS = 20;
const CELL = 28;
const TARGET_LINES = 10;
const GRAVITY_SEC = 0.8;
const SOFT_SEC = 0.05;
const END_DELAY = 2.2;

async function Init() {
    mission.setPlayerType("Ground", 1);
    mission.setWinCondition("Manual");
    mission.setTime(12, 0);
    mission.setWeather("Clear Sky");
    await mission.loadMap("Kuwait");
}

function SpawnUnits() {
    // Editor parse pass also calls this — only build in real gameplay.
    if (!mission.isGameplay) return;
    setupTetris();
}

function setupTetris() {
    const UE = CS.UnityEngine;
    const $t = puer.$typeof;

    // ---------- piece data ----------
    const PIECES = [
        { size: 4, blocks: [[0, 1], [1, 1], [2, 1], [3, 1]], color: [0.10, 0.85, 0.90] }, // I
        { size: 2, blocks: [[0, 0], [1, 0], [0, 1], [1, 1]], color: [0.95, 0.85, 0.10] }, // O
        { size: 3, blocks: [[1, 0], [0, 1], [1, 1], [2, 1]], color: [0.70, 0.30, 0.90] }, // T
        { size: 3, blocks: [[1, 0], [2, 0], [0, 1], [1, 1]], color: [0.30, 0.85, 0.30] }, // S
        { size: 3, blocks: [[0, 0], [1, 0], [1, 1], [2, 1]], color: [0.90, 0.25, 0.25] }, // Z
        { size: 3, blocks: [[0, 0], [0, 1], [1, 1], [2, 1]], color: [0.25, 0.45, 0.95] }, // J
        { size: 3, blocks: [[2, 0], [0, 1], [1, 1], [2, 1]], color: [0.95, 0.55, 0.15] }  // L
    ];
    // ROT[p][r] = array of [x,y] cells for rotation r
    const ROT = [];
    for (let p = 0; p < PIECES.length; p++) {
        const size = PIECES[p].size;
        const rots = [PIECES[p].blocks];
        for (let r = 1; r < 4; r++) {
            const prev = rots[r - 1];
            const cur = [];
            for (let b = 0; b < prev.length; b++) {
                cur.push([size - 1 - prev[b][1], prev[b][0]]);
            }
            rots.push(cur);
        }
        ROT.push(rots);
    }

    // ---------- game state ----------
    let board = [];
    for (let y = 0; y < ROWS; y++) board.push(new Array(COLS).fill(0));

    const state = {
        hudReady: false,
        score: 0,
        lines: 0,
        locked: 0,
        px: 0,
        py: 0,
        dead: false,
        won: false
    };
    globalThis.__tetris = state;

    let cur = null;             // { p, r, x, y }
    let nextP = Math.floor(Math.random() * PIECES.length);
    let dropTimer = 0;
    let endTimer = 0;
    let endSent = false;
    let holdLeft = 0;
    let holdRight = 0;

    // ---------- core rules ----------
    function collides(p, r, x, y) {
        const blocks = ROT[p][r];
        for (let b = 0; b < blocks.length; b++) {
            const bx = x + blocks[b][0];
            const by = y + blocks[b][1];
            if (bx < 0 || bx >= COLS || by >= ROWS) return true;
            if (by >= 0 && board[by][bx]) return true;
        }
        return false;
    }

    function spawnPiece() {
        cur = { p: nextP, r: 0, x: 3, y: -2 };
        nextP = Math.floor(Math.random() * PIECES.length);
        if (collides(cur.p, cur.r, cur.x, cur.y)) {
            gameOver();
            return;
        }
        syncState();
        paintPreview();
        repaint();
    }

    function move(dx) {
        if (!cur || state.dead || state.won) return;
        if (!collides(cur.p, cur.r, cur.x + dx, cur.y)) {
            cur.x += dx;
            syncState();
            repaint();
        }
    }

    function rotate() {
        if (!cur || state.dead || state.won) return;
        const nr = (cur.r + 1) % 4;
        const kicks = [0, -1, 1, -2, 2];
        for (let k = 0; k < kicks.length; k++) {
            if (!collides(cur.p, nr, cur.x + kicks[k], cur.y)) {
                cur.r = nr;
                cur.x += kicks[k];
                syncState();
                repaint();
                return;
            }
        }
    }

    function stepDown() {
        if (!cur || state.dead || state.won) return;
        if (!collides(cur.p, cur.r, cur.x, cur.y + 1)) {
            cur.y += 1;
            syncState();
            repaint();
        } else {
            lockPiece();
        }
    }

    function hardDrop() {
        if (!cur || state.dead || state.won) return;
        while (!collides(cur.p, cur.r, cur.x, cur.y + 1)) cur.y += 1;
        lockPiece();
    }

    function lockPiece() {
        const blocks = ROT[cur.p][cur.r];
        let above = false;
        for (let b = 0; b < blocks.length; b++) {
            const bx = cur.x + blocks[b][0];
            const by = cur.y + blocks[b][1];
            if (by < 0) { above = true; continue; }
            board[by][bx] = cur.p + 1;
        }
        state.locked++;
        if (above) {
            gameOver();
            return;
        }
        clearLines();
        spawnPiece();
    }

    function clearLines() {
        const kept = [];
        for (let y = 0; y < ROWS; y++) {
            let full = true;
            for (let x = 0; x < COLS; x++) {
                if (!board[y][x]) { full = false; break; }
            }
            if (!full) kept.push(board[y]);
        }
        const n = ROWS - kept.length;
        if (n > 0) {
            while (kept.length < ROWS) kept.unshift(new Array(COLS).fill(0));
            board = kept;
            state.lines += n;
            const scoreTable = [0, 100, 300, 500, 800];
            state.score += scoreTable[Math.min(n, 4)];
            paintScore();
            checkWin();
        }
    }

    function checkWin() {
        if (state.lines >= TARGET_LINES && !state.won && !state.dead) {
            state.won = true;
            bigText.text = "YOU WIN!";
            console.log("[Tetris] WIN — " + state.lines + " lines, score " + state.score);
        }
    }

    function gameOver() {
        if (state.dead || state.won) return;
        state.dead = true;
        bigText.text = "GAME OVER";
        console.log("[Tetris] game over — score " + state.score);
    }

    function syncState() {
        if (!cur) return;
        state.px = cur.x;
        state.py = cur.y;
    }

    // ---------- UI ----------
    const root = new UE.GameObject("TetrisRoot");
    if (CS.Stage.Instance) {
        root.transform.SetParent(CS.Stage.Instance.transform, false);
    }
    const relay = root.AddComponent($t(CS.JsEventRelay));

    const canvasGo = new UE.GameObject("TetrisHUD");
    canvasGo.transform.SetParent(root.transform, false);
    const canvas = canvasGo.AddComponent($t(UE.Canvas));
    canvas.renderMode = UE.RenderMode.ScreenSpaceOverlay;
    canvas.sortingOrder = 500;
    canvasGo.AddComponent($t(UE.UI.CanvasScaler));

    const font = UE.Resources.GetBuiltinResource($t(UE.Font), "LegacyRuntime.ttf");

    function makeRect(name, parent, x, y, w, h) {
        const go = new UE.GameObject(name);
        go.transform.SetParent(parent.transform, false);
        const rt = go.AddComponent($t(UE.RectTransform));
        rt.anchorMin = new UE.Vector2(0.5, 0.5);
        rt.anchorMax = new UE.Vector2(0.5, 0.5);
        rt.anchoredPosition = new UE.Vector2(x, y);
        rt.sizeDelta = new UE.Vector2(w, h);
        return go;
    }

    function makeImage(name, parent, x, y, w, h, color) {
        const go = makeRect(name, parent, x, y, w, h);
        const img = go.AddComponent($t(UE.UI.Image));
        img.color = color;
        return img;
    }

    function makeText(name, parent, x, y, w, h, size, str) {
        const go = makeRect(name, parent, x, y, w, h);
        const text = go.AddComponent($t(UE.UI.Text));
        text.font = font;
        text.fontSize = size;
        text.fontStyle = UE.FontStyle.Bold;
        text.alignment = UE.TextAnchor.MiddleCenter;
        text.color = new UE.Color(1, 1, 1, 1);
        text.text = str;
        return text;
    }

    const panel = makeImage("panel", canvasGo, 0, 0, 540, 720, new UE.Color(0, 0, 0, 0.78));

    // board cells (top-left of board at (-250, 290) inside panel)
    const BOARD_LEFT = -250;
    const BOARD_TOP = 290;
    const EMPTY_COLOR = new UE.Color(1, 1, 1, 0.06);
    const pieceColors = [];
    for (let p = 0; p < PIECES.length; p++) {
        const c = PIECES[p].color;
        pieceColors.push(new UE.Color(c[0], c[1], c[2], 1));
    }

    const cellImages = [];
    for (let y = 0; y < ROWS; y++) {
        const row = [];
        for (let x = 0; x < COLS; x++) {
            const cx = BOARD_LEFT + x * CELL + CELL / 2;
            const cy = BOARD_TOP - y * CELL - CELL / 2;
            row.push(makeImage("c" + x + "_" + y, panel.gameObject, cx, cy, CELL - 2, CELL - 2, EMPTY_COLOR));
        }
        cellImages.push(row);
    }

    // next-piece preview (4x4)
    makeText("nextLabel", panel.gameObject, 150, 290, 160, 40, 28, "NEXT");
    const PRE = 22;
    const previewImages = [];
    for (let y = 0; y < 4; y++) {
        const row = [];
        for (let x = 0; x < 4; x++) {
            const cx = 110 + x * PRE + PRE / 2;
            const cy = 250 - y * PRE - PRE / 2;
            row.push(makeImage("p" + x + "_" + y, panel.gameObject, cx, cy, PRE - 2, PRE - 2, EMPTY_COLOR));
        }
        previewImages.push(row);
    }

    const scoreText = makeText("score", panel.gameObject, 150, 80, 220, 200, 26,
        "SCORE\n0\n\nLINES\n0/" + TARGET_LINES);
    const bigText = makeText("big", panel.gameObject, 0, 0, 460, 120, 56, "");
    makeText("help", panel.gameObject, 0, -345, 520, 30, 18,
        "arrows: move/rotate   down: soft   space: drop");

    function makeButton(label, x, cb) {
        const img = makeImage("btn_" + label, panel.gameObject, x, -290, 74, 74, new UE.Color(1, 1, 1, 0.14));
        const btn = img.gameObject.AddComponent($t(UE.UI.Button));
        btn.onClick.AddListener(cb);
        makeText("lbl", img.gameObject, 0, 0, 74, 74, 34, label);
    }
    makeButton("<", -195, function () { move(-1); });
    makeButton(">", -115, function () { move(1); });
    makeButton("@", -35, function () { rotate(); });
    makeButton("v", 45, function () { hardDrop(); });

    // ---------- rendering (diffed — only changed cells cross the JS/C# boundary) ----------
    const lastPaint = new Array(ROWS * COLS).fill(-1);

    function repaint() {
        // desired = board + current piece overlay
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                let v = board[y][x];
                if (cur) {
                    const blocks = ROT[cur.p][cur.r];
                    for (let b = 0; b < blocks.length; b++) {
                        if (cur.x + blocks[b][0] === x && cur.y + blocks[b][1] === y) {
                            v = cur.p + 1;
                        }
                    }
                }
                const idx = y * COLS + x;
                if (lastPaint[idx] !== v) {
                    lastPaint[idx] = v;
                    if (v === 0) {
                        cellImages[y][x].color = EMPTY_COLOR;
                    } else {
                        cellImages[y][x].color = pieceColors[v - 1];
                    }
                }
            }
        }
    }

    const lastPreview = new Array(16).fill(-1);

    function paintPreview() {
        const blocks = ROT[nextP][0];
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) {
                let v = 0;
                for (let b = 0; b < blocks.length; b++) {
                    if (blocks[b][0] === x && blocks[b][1] === y) v = nextP + 1;
                }
                const idx = y * 4 + x;
                if (lastPreview[idx] !== v) {
                    lastPreview[idx] = v;
                    if (v === 0) {
                        previewImages[y][x].color = EMPTY_COLOR;
                    } else {
                        previewImages[y][x].color = pieceColors[v - 1];
                    }
                }
            }
        }
    }

    function paintScore() {
        scoreText.text = "SCORE\n" + state.score + "\n\nLINES\n" + state.lines + "/" + TARGET_LINES;
    }

    // ---------- input ----------
    function readKeys(dt) {
        const kb = CS.UnityEngine.InputSystem.Keyboard.current;
        if (!kb) return false;

        if (kb.leftArrowKey.wasPressedThisFrame) { move(-1); holdLeft = -0.25; }
        if (kb.rightArrowKey.wasPressedThisFrame) { move(1); holdRight = -0.25; }

        // hold-to-repeat
        if (kb.leftArrowKey.isPressed) {
            holdLeft += dt;
            if (holdLeft > 0.12) { holdLeft = 0; move(-1); }
        }
        if (kb.rightArrowKey.isPressed) {
            holdRight += dt;
            if (holdRight > 0.12) { holdRight = 0; move(1); }
        }

        if (kb.upArrowKey.wasPressedThisFrame || kb.zKey.wasPressedThisFrame) rotate();
        if (kb.spaceKey.wasPressedThisFrame) hardDrop();
        return kb.downArrowKey.isPressed;
    }

    // ---------- debug hooks (used by the MET automated test) ----------
    globalThis.__tetrisDebug = {
        moveLeft: function () { move(-1); },
        moveRight: function () { move(1); },
        rotate: function () { rotate(); },
        hardDrop: function () { hardDrop(); },
        forceLines: function (n) { state.lines += n; paintScore(); checkWin(); }
    };

    // ---------- game loop ----------
    relay.onUpdate = function (dt) {
        if (state.won || state.dead) {
            endTimer += dt;
            if (!endSent && endTimer >= END_DELAY) {
                endSent = true;
                if (state.won) {
                    mission.win();
                } else {
                    mission.fail();
                }
            }
            return;
        }

        const soft = readKeys(dt);

        dropTimer += dt;
        let interval = GRAVITY_SEC;
        if (soft) interval = SOFT_SEC;
        if (dropTimer >= interval) {
            dropTimer = 0;
            stepDown();
        }
    };

    spawnPiece();
    paintScore();
    state.hudReady = true;
    console.log("[Tetris] board ready — clear " + TARGET_LINES + " lines to win");
}
