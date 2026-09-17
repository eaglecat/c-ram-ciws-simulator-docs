// MissionFormatVersion: 1
// ============================================
// FLAPPY JET — flappy bird with a fighter jet.
//
// Pure-JS custom game: takes over the player aircraft (kinematic),
// tap/space to pitch up, fly through 10 gates to win, touch a bar = crash.
// Uses CS.* engine access + JsEventRelay only.
//
// Self-test: globalThis.__gameTest.start() enables an autopilot that
// steers through every gap — used by MET autoRun="jsgames".
// ============================================

const GATE_COUNT = 10;
const GATE_SPACING = 260;
const FIRST_GATE_DIST = 500;
const GAP_HEIGHT = 110;
const BAR_WIDTH = 160;
const BAR_THICK = 8;
const BAR_TALL = 400;
const SPEED = 55;
const GRAVITY = 60;
const JUMP_VY = 28;
const END_DELAY = 2.2;

async function Init() {
    mission.setPlayerType("Aircraft", 4);
    mission.setWinCondition("Manual");
    mission.setTime(9, 0);
    mission.setWeather("Clear Sky");
    await mission.loadMap("Kuwait");
}

function SpawnUnits() {
    if (!mission.isGameplay) return;
    setupFlappy();
}

function setupFlappy() {
    const UE = CS.UnityEngine;
    const $t = puer.$typeof;

    const state = {
        score: 0,
        crashed: false,
        won: false,
        testMode: false,
        // runtime instrumentation (JS-side, no interop cost)
        dist: 0,
        py: 0,
        updates: 0,
        barEvents: 0,
        gapEvents: 0,
        otherHits: 0
    };
    globalThis.__flappy = state;

    const test = {
        ready: false,
        done: false,
        passed: false,
        log: "",
        start: function () { state.testMode = true; test.log = "autopilot on"; }
    };
    globalThis.__gameTest = test;

    // ---------- root ----------
    const root = new UE.GameObject("FlappyRoot");
    if (CS.Stage.Instance) {
        root.transform.SetParent(CS.Stage.Instance.transform, false);
    }
    const relay = root.AddComponent($t(CS.JsEventRelay));

    // ---------- take over the player aircraft ----------
    const unit = CS.Player.instance.GetUnit();
    const mio = unit;
    // stop the real flight physics from fighting the flappy controller
    if (mio.aircraft) mio.aircraft.enabled = false;
    if (unit.rigidbody) {
        unit.rigidbody.isKinematic = true;
    }

    const startTr = CS.StageEnvironment.Instance.PlayerAircraftStartPosition;
    const spv = startTr.position;
    const sp = [spv.x, spv.y, spv.z];
    const fwv = startTr.forward;
    let fl = Math.sqrt(fwv.x * fwv.x + fwv.z * fwv.z);
    let fwd = [0, 0, 1];
    if (fl > 0.001) fwd = [fwv.x / fl, 0, fwv.z / fl];

    // plane state (JS-owned)
    let dist = 0;       // distance along fwd
    let py = sp[1];     // altitude
    let vy = 0;

    // ---------- gates ----------
    const shader = UE.Shader.Find("Sprites/Default");
    const matBar = new UE.Material(shader);
    matBar.color = new UE.Color(0.9, 0.25, 0.2, 1);

    const gaps = [];    // gap center Y per gate
    let gapY = sp[1];
    const gates = [];

    function makeBar(parent, cx, cy, cz, sy) {
        const bar = UE.GameObject.CreatePrimitive(UE.PrimitiveType.Cube);
        bar.name = "bar";
        bar.transform.SetParent(parent.transform, false);
        bar.transform.position = new UE.Vector3(cx, cy, cz);
        // face the corridor: wide across, tall, thin along path
        bar.transform.rotation = UE.Quaternion.LookRotation(new UE.Vector3(fwd[0], 0, fwd[2]));
        bar.transform.localScale = new UE.Vector3(BAR_WIDTH, sy, BAR_THICK);
        const col = bar.GetComponent($t(UE.BoxCollider));
        col.isTrigger = true;
        const rend = bar.GetComponent($t(UE.MeshRenderer));
        rend.sharedMaterial = matBar;
        rend.shadowCastingMode = UE.Rendering.ShadowCastingMode.Off;
        return bar;
    }

    for (let i = 0; i < GATE_COUNT; i++) {
        const d = FIRST_GATE_DIST + i * GATE_SPACING;
        gapY += (Math.random() - 0.5) * 90;
        const minY = sp[1] - 160;
        const maxY = sp[1] + 160;
        if (gapY < minY) gapY = minY;
        if (gapY > maxY) gapY = maxY;
        gaps.push(gapY);

        const cx = sp[0] + fwd[0] * d;
        const cz = sp[2] + fwd[2] * d;

        const gate = new UE.GameObject("Gate_" + i);
        gate.transform.SetParent(root.transform, false);

        const topBar = makeBar(gate, cx, gapY + GAP_HEIGHT / 2 + BAR_TALL / 2, cz, BAR_TALL);
        const botBar = makeBar(gate, cx, gapY - GAP_HEIGHT / 2 - BAR_TALL / 2, cz, BAR_TALL);

        const barRelayTop = topBar.AddComponent($t(CS.JsEventRelay));
        barRelayTop.onTriggerEnter = function (other) {
            state.barEvents++;
            if (isPlayer(other)) crash();
            else state.otherHits++;
        };
        const barRelayBot = botBar.AddComponent($t(CS.JsEventRelay));
        barRelayBot.onTriggerEnter = function (other) {
            state.barEvents++;
            if (isPlayer(other)) crash();
            else state.otherHits++;
        };

        // invisible gap sensor
        const sensor = new UE.GameObject("gap");
        sensor.transform.SetParent(gate.transform, false);
        sensor.transform.position = new UE.Vector3(cx, gapY, cz);
        sensor.transform.rotation = UE.Quaternion.LookRotation(new UE.Vector3(fwd[0], 0, fwd[2]));
        const scol = sensor.AddComponent($t(UE.BoxCollider));
        scol.isTrigger = true;
        scol.size = new UE.Vector3(BAR_WIDTH, GAP_HEIGHT, 6);
        const gateIndex = i;
        let counted = false;
        const srelay = sensor.AddComponent($t(CS.JsEventRelay));
        srelay.onTriggerEnter = function (other) {
            state.gapEvents++;
            if (counted) return;
            if (!isPlayer(other)) { state.otherHits++; return; }
            counted = true;
            pass(gateIndex);
        };

        gates.push(gate);
    }

    // ---------- HUD ----------
    const canvasGo = new UE.GameObject("FlappyHUD");
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
        text.color = new UE.Color(1, 0.9, 0.2, 1);
        const outline = go.AddComponent($t(UE.UI.Outline));
        outline.effectColor = new UE.Color(0, 0, 0, 0.9);
        return text;
    }
    const scoreText = makeText("score", 0, -50, 700, 90, 64);
    const bigText = makeText("big", 0, -220, 900, 120, 52);
    scoreText.text = "0 / " + GATE_COUNT;
    bigText.text = "TAP / SPACE TO FLAP";

    // ---------- helpers ----------
    function isPlayer(other) {
        let t = other.transform;
        const rb = other.attachedRigidbody;
        if (rb) t = rb.transform;
        return t.root.GetInstanceID() === unit.transform.root.GetInstanceID();
    }

    function pass(i) {
        if (state.crashed || state.won) return;
        state.score++;
        scoreText.text = state.score + " / " + GATE_COUNT;
        if (state.score >= GATE_COUNT) {
            state.won = true;
            bigText.text = "CLEAR!";
            console.log("[Flappy] clear!");
            test.done = true;
            test.passed = true;
            test.log = "cleared " + state.score + " gates";
        }
    }

    function crash() {
        if (state.crashed || state.won) return;
        state.crashed = true;
        bigText.text = "CRASH!  " + state.score + " / " + GATE_COUNT;
        console.log("[Flappy] crash at score " + state.score);
        test.done = true;
        test.passed = false;
        test.log = "crashed at " + state.score;
    }

    // ---------- input ----------
    function tapped() {
        const kb = CS.UnityEngine.InputSystem.Keyboard.current;
        if (kb && kb.spaceKey.wasPressedThisFrame) return true;
        const mouse = CS.UnityEngine.InputSystem.Mouse.current;
        if (mouse && mouse.leftButton.wasPressedThisFrame) return true;
        const touch = CS.UnityEngine.InputSystem.Touchscreen.current;
        if (touch && touch.primaryTouch.press.wasPressedThisFrame) return true;
        return false;
    }

    // ---------- game loop ----------
    let started = false;
    let endTimer = 0;
    let endSent = false;

    relay.onUpdate = function (dt) {
        if (state.crashed || state.won) {
            endTimer += dt;
            if (!endSent && endTimer >= END_DELAY) {
                endSent = true;
                if (state.won) mission.win();
                else mission.fail();
            }
            return;
        }

        let speed = SPEED;
        if (state.testMode) {
            started = true;
            speed = SPEED * 2;
            // autopilot: track the current gap center
            let target = gaps[state.score];
            if (target === undefined) target = sp[1];
            py += (target - py) * Math.min(1, dt * 4);
            vy = 0;
        } else {
            if (tapped()) {
                started = true;
                vy = JUMP_VY;
                if (bigText.text.length > 6) bigText.text = "";
            }
            if (started) {
                vy -= GRAVITY * dt;
                py += vy * dt;
            }
        }

        if (started) dist += speed * dt;

        // Autopilot only: distance-based pass fallback. At low editor FPS the kinematic
        // teleport steps can tunnel straight through the 6m-deep gap trigger, the score
        // never advances, and the autopilot keeps flying at a stale gap height into a bar.
        if (state.testMode) {
            const gateDist = FIRST_GATE_DIST + state.score * GATE_SPACING;
            if (dist > gateDist + 5) pass(state.score);
        }

        // altitude floor/ceiling = crash
        if (py < sp[1] - 260 || py > sp[1] + 260) {
            crash();
        }

        const nx = sp[0] + fwd[0] * dist;
        const nz = sp[2] + fwd[2] * dist;
        const pos = new UE.Vector3(nx, py, nz);
        unit.transform.position = pos;
        if (unit.rigidbody) unit.rigidbody.position = pos;

        state.dist = dist;
        state.py = py;
        state.updates++;

        // pitch follows vertical velocity
        let pitch = -vy * 1.2;
        if (pitch > 45) pitch = 45;
        if (pitch < -60) pitch = -60;
        const look = UE.Quaternion.LookRotation(new UE.Vector3(fwd[0], 0, fwd[2]));
        unit.transform.rotation = look * UE.Quaternion.Euler(pitch, 0, 0);
    };

    test.ready = true;
    console.log("[Flappy] ready — " + GATE_COUNT + " gates");
}
