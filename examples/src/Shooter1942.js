// MissionFormatVersion: 1
// ============================================
// 1942 — top-down arcade shooter inside the flight game.
//
// Pure-JS custom game. Builds its own orthographic overlay camera
// (renders on top of the normal game camera), a primitive-built player
// ship, enemy waves and bullets at y=3000, with ALL game logic and
// collision math in JS (no physics, no colliders — positions live in
// JS arrays, only transform writes cross the interop boundary).
//
// Controls: arrow keys to move, auto-fire. 20 kills to win, 3 lives.
// Self-test: __gameTest.start() → fast spawns + aim-assist autopilot.
// ============================================

const FIELD_Y = 3000;
const HALF_W = 52;          // playfield half width (x)
const TOP_Z = 65;
const BOT_Z = -65;
const SHIP_SPEED = 45;
const BULLET_SPEED = 90;
const FIRE_INTERVAL = 0.18;
const SPAWN_INTERVAL = 1.1;
const KILL_TARGET = 20;
const START_LIVES = 3;
const END_DELAY = 2.5;

async function Init() {
    mission.setPlayerType("Ground", 1);
    mission.setWinCondition("Manual");
    mission.setTime(12, 0);
    mission.setWeather("Clear Sky");
    await mission.loadMap("Kuwait");
}

function SpawnUnits() {
    if (!mission.isGameplay) return;
    setup1942();
}

function setup1942() {
    const UE = CS.UnityEngine;
    const $t = puer.$typeof;

    const state = {
        score: 0,
        kills: 0,
        lives: START_LIVES,
        won: false,
        dead: false,
        testMode: false
    };
    globalThis.__s1942 = state;

    const test = {
        ready: false,
        done: false,
        passed: false,
        log: "",
        start: function () { state.testMode = true; test.log = "autopilot on"; }
    };
    globalThis.__gameTest = test;

    // ---------- root ----------
    const root = new UE.GameObject("Arcade1942Root");
    if (CS.Stage.Instance) {
        root.transform.SetParent(CS.Stage.Instance.transform, false);
    }
    const relay = root.AddComponent($t(CS.JsEventRelay));

    // ---------- overlay camera ----------
    const camGo = new UE.GameObject("ArcadeCam");
    camGo.transform.SetParent(root.transform, false);
    camGo.transform.position = new UE.Vector3(0, FIELD_Y + 100, 0);
    camGo.transform.rotation = UE.Quaternion.Euler(90, 0, 0);
    const cam = camGo.AddComponent($t(UE.Camera));
    cam.orthographic = true;
    cam.orthographicSize = 70;
    cam.nearClipPlane = 1;
    cam.farClipPlane = 300;
    cam.depth = 99;
    cam.clearFlags = UE.CameraClearFlags.SolidColor;
    cam.backgroundColor = new UE.Color(0.03, 0.05, 0.12, 1);

    // ---------- materials ----------
    const shader = UE.Shader.Find("Sprites/Default");
    function makeMat(r, g, b) {
        const m = new UE.Material(shader);
        m.color = new UE.Color(r, g, b, 1);
        return m;
    }
    const matShip = makeMat(0.85, 0.95, 1);
    const matEnemy = makeMat(0.95, 0.25, 0.2);
    const matBullet = makeMat(1, 0.9, 0.2);

    function stripCollider(go) {
        const cap = go.GetComponent($t(UE.CapsuleCollider));
        if (cap) UE.Object.Destroy(cap);
        const box = go.GetComponent($t(UE.BoxCollider));
        if (box) UE.Object.Destroy(box);
        const sph = go.GetComponent($t(UE.SphereCollider));
        if (sph) UE.Object.Destroy(sph);
    }

    function makePlane(mat, big) {
        const p = new UE.GameObject("plane");
        p.transform.SetParent(root.transform, false);

        const body = UE.GameObject.CreatePrimitive(UE.PrimitiveType.Capsule);
        body.transform.SetParent(p.transform, false);
        body.transform.localRotation = UE.Quaternion.Euler(90, 0, 0);
        body.transform.localScale = new UE.Vector3(2.4, 3.2, 2.4);
        stripCollider(body);
        body.GetComponent($t(UE.MeshRenderer)).sharedMaterial = mat;

        const wings = UE.GameObject.CreatePrimitive(UE.PrimitiveType.Cube);
        wings.transform.SetParent(p.transform, false);
        let wingZ = -0.8;
        if (big) wingZ = 0.8;
        wings.transform.localPosition = new UE.Vector3(0, 0, wingZ);
        wings.transform.localScale = new UE.Vector3(9, 0.7, 2.2);
        stripCollider(wings);
        wings.GetComponent($t(UE.MeshRenderer)).sharedMaterial = mat;

        return p;
    }

    // ---------- player ship ----------
    const ship = makePlane(matShip, false);
    let shipX = 0;
    let shipZ = -48;
    let invuln = 0;
    ship.transform.position = new UE.Vector3(shipX, FIELD_Y, shipZ);

    // ---------- pools ----------
    const bullets = [];
    for (let i = 0; i < 24; i++) {
        const b = UE.GameObject.CreatePrimitive(UE.PrimitiveType.Sphere);
        b.transform.SetParent(root.transform, false);
        b.transform.localScale = new UE.Vector3(1.1, 1.1, 1.1);
        stripCollider(b);
        b.GetComponent($t(UE.MeshRenderer)).sharedMaterial = matBullet;
        b.SetActive(false);
        bullets.push({ go: b, x: 0, z: 0, active: false });
    }

    const enemies = [];
    for (let i = 0; i < 16; i++) {
        const e = makePlane(matEnemy, true);
        e.transform.rotation = UE.Quaternion.Euler(0, 180, 0);
        e.SetActive(false);
        enemies.push({ go: e, x: 0, z: 0, speed: 0, drift: 0, phase: 0, active: false });
    }

    // ---------- HUD ----------
    const canvasGo = new UE.GameObject("ArcadeHUD");
    canvasGo.transform.SetParent(root.transform, false);
    const canvas = canvasGo.AddComponent($t(UE.Canvas));
    canvas.renderMode = UE.RenderMode.ScreenSpaceOverlay;
    canvas.sortingOrder = 500;
    canvasGo.AddComponent($t(UE.UI.CanvasScaler));

    const font = UE.Resources.GetBuiltinResource($t(UE.Font), "LegacyRuntime.ttf");
    function makeText(name, x, y, w, h, size) {
        const go = new UE.GameObject(name);
        go.transform.SetParent(canvasGo.transform, false);
        const rt = go.AddComponent($t(UE.RectTransform));
        rt.anchorMin = new UE.Vector2(0.5, 1);
        rt.anchorMax = new UE.Vector2(0.5, 1);
        rt.pivot = new UE.Vector2(0.5, 1);
        rt.anchoredPosition = new UE.Vector2(x, y);
        rt.sizeDelta = new UE.Vector2(w, h);
        const text = go.AddComponent($t(UE.UI.Text));
        text.font = font;
        text.fontSize = size;
        text.fontStyle = UE.FontStyle.Bold;
        text.alignment = UE.TextAnchor.MiddleCenter;
        text.color = new UE.Color(1, 1, 1, 1);
        const outline = go.AddComponent($t(UE.UI.Outline));
        outline.effectColor = new UE.Color(0, 0, 0, 0.9);
        return text;
    }
    const scoreText = makeText("score", 0, -40, 800, 60, 36);
    const bigText = makeText("big", 0, -240, 900, 120, 56);

    function updateHud() {
        let hearts = "";
        for (let i = 0; i < state.lives; i++) hearts += "O";
        scoreText.text = "SCORE " + state.score + "   KILLS " + state.kills + "/" + KILL_TARGET
            + "   LIVES " + hearts;
    }

    // ---------- spawn / fire ----------
    function spawnEnemy() {
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (e.active) continue;
            e.active = true;
            e.x = (Math.random() * 2 - 1) * (HALF_W - 6);
            e.z = TOP_Z;
            e.speed = 16 + Math.random() * 12;
            e.drift = (Math.random() * 2 - 1) * 8;
            e.phase = Math.random() * 6.28;
            e.go.SetActive(true);
            e.go.transform.position = new UE.Vector3(e.x, FIELD_Y, e.z);
            return;
        }
    }

    function fireBullet() {
        for (let i = 0; i < bullets.length; i++) {
            const b = bullets[i];
            if (b.active) continue;
            b.active = true;
            b.x = shipX;
            b.z = shipZ + 4;
            b.go.SetActive(true);
            b.go.transform.position = new UE.Vector3(b.x, FIELD_Y, b.z);
            return;
        }
    }

    function killEnemy(e) {
        e.active = false;
        e.go.SetActive(false);
        state.kills++;
        state.score += 100;
        updateHud();
        if (state.kills >= KILL_TARGET && !state.won && !state.dead) {
            state.won = true;
            bigText.text = "STAGE CLEAR!";
            test.done = true;
            test.passed = true;
            test.log = "cleared with score " + state.score;
            console.log("[1942] clear — score " + state.score);
        }
    }

    function hitPlayer(e) {
        e.active = false;
        e.go.SetActive(false);
        if (state.testMode) return;
        state.lives--;
        invuln = 2;
        updateHud();
        if (state.lives <= 0 && !state.dead && !state.won) {
            state.dead = true;
            bigText.text = "GAME OVER";
            test.done = true;
            test.passed = false;
            test.log = "died at " + state.kills + " kills";
            console.log("[1942] game over");
        }
    }

    // ---------- game loop ----------
    let fireTimer = 0;
    let spawnTimer = 0;
    let time = 0;
    let endTimer = 0;
    let endSent = false;

    relay.onUpdate = function (dt) {
        if (state.won || state.dead) {
            endTimer += dt;
            if (!endSent && endTimer >= END_DELAY) {
                endSent = true;
                if (state.won) mission.win();
                else mission.fail();
            }
            return;
        }

        time += dt;
        if (invuln > 0) invuln -= dt;

        // --- input / autopilot ---
        if (state.testMode) {
            // aim assist: track nearest active enemy x
            let best = null;
            let bestZ = 999;
            for (let i = 0; i < enemies.length; i++) {
                const e = enemies[i];
                if (e.active && e.z < bestZ) { bestZ = e.z; best = e; }
            }
            if (best) {
                const diff = best.x - shipX;
                let step = SHIP_SPEED * dt;
                if (Math.abs(diff) < step) step = Math.abs(diff);
                if (diff > 0) shipX += step;
                else shipX -= step;
            }
        } else {
            const kb = CS.UnityEngine.InputSystem.Keyboard.current;
            if (kb) {
                if (kb.leftArrowKey.isPressed) shipX -= SHIP_SPEED * dt;
                if (kb.rightArrowKey.isPressed) shipX += SHIP_SPEED * dt;
                if (kb.upArrowKey.isPressed) shipZ += SHIP_SPEED * dt;
                if (kb.downArrowKey.isPressed) shipZ -= SHIP_SPEED * dt;
            }
        }
        if (shipX < -HALF_W) shipX = -HALF_W;
        if (shipX > HALF_W) shipX = HALF_W;
        if (shipZ < BOT_Z + 6) shipZ = BOT_Z + 6;
        if (shipZ > 20) shipZ = 20;
        ship.transform.position = new UE.Vector3(shipX, FIELD_Y, shipZ);

        // --- auto fire ---
        fireTimer += dt;
        if (fireTimer >= FIRE_INTERVAL) {
            fireTimer = 0;
            fireBullet();
        }

        // --- spawns ---
        spawnTimer += dt;
        let interval = SPAWN_INTERVAL;
        if (state.testMode) interval = 0.35;
        if (spawnTimer >= interval) {
            spawnTimer = 0;
            spawnEnemy();
        }

        // --- bullets ---
        for (let i = 0; i < bullets.length; i++) {
            const b = bullets[i];
            if (!b.active) continue;
            b.z += BULLET_SPEED * dt;
            if (b.z > TOP_Z) {
                b.active = false;
                b.go.SetActive(false);
                continue;
            }
            b.go.transform.position = new UE.Vector3(b.x, FIELD_Y, b.z);
        }

        // --- enemies + collisions (all JS math) ---
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (!e.active) continue;
            e.z -= e.speed * dt;
            e.x += Math.sin(time * 1.5 + e.phase) * e.drift * dt;
            if (e.x < -HALF_W) e.x = -HALF_W;
            if (e.x > HALF_W) e.x = HALF_W;
            if (e.z < BOT_Z) {
                e.active = false;
                e.go.SetActive(false);
                continue;
            }

            // bullet hits
            let killed = false;
            for (let j = 0; j < bullets.length; j++) {
                const b = bullets[j];
                if (!b.active) continue;
                const dx = b.x - e.x;
                const dz = b.z - e.z;
                if (dx * dx + dz * dz < 12) {
                    b.active = false;
                    b.go.SetActive(false);
                    killEnemy(e);
                    killed = true;
                    break;
                }
            }
            if (killed) continue;

            // player hit
            if (invuln <= 0) {
                const dx = e.x - shipX;
                const dz = e.z - shipZ;
                if (dx * dx + dz * dz < 20) {
                    hitPlayer(e);
                    continue;
                }
            }

            e.go.transform.position = new UE.Vector3(e.x, FIELD_Y, e.z);
        }
    };

    updateHud();
    bigText.text = "";
    test.ready = true;
    console.log("[1942] arcade ready — " + KILL_TARGET + " kills to win");
}
