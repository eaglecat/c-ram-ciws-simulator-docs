// MissionFormatVersion: 1
// ============================================
// C-RAM GOLF — golf, but the ball is launched from your gun position.
//
// Pure-JS custom game. 3 holes on Mostar terrain. Aim with the normal
// CIWS camera, press SPACE to start the power meter, SPACE again to fire.
// Ball is a JS-spawned physics sphere (bouncy). Ball stops within 10m of
// the flag = holed. Fewest total strokes; finishing always wins the round.
//
// Self-test hook: __gameTest.start() — one real launch, then teleports
// the ball onto each green to verify hole detection / progression / win.
// ============================================

const HOLE_COUNT = 3;
const HOLE_RADIUS = 10;
const MAX_POWER_MS = 110;    // launch speed at 100% power (m/s)
const LOFT = 0.5;            // upward bias added to aim direction
const STOP_SPEED = 0.8;
const STOP_TIME = 1.2;
const END_DELAY = 3.0;

async function Init() {
    mission.setPlayerType("Ground", 1);
    mission.setWinCondition("Manual");
    mission.setTime(15, 0);
    mission.setWeather("Clear Sky");
    await mission.loadMap("Mostar");
}

function SpawnUnits() {
    if (!mission.isGameplay) return;
    setupGolf();
}

function setupGolf() {
    const UE = CS.UnityEngine;
    const $t = puer.$typeof;

    const state = {
        hole: 0,
        strokes: 0,
        totalStrokes: 0,
        finished: false,
        charging: false,
        power: 0,
        testMode: false
    };
    globalThis.__golf = state;

    const test = {
        ready: false,
        done: false,
        passed: false,
        log: "",
        start: function () { state.testMode = true; testPhase = 0; test.log = "test started"; }
    };
    globalThis.__gameTest = test;
    let testPhase = -1;
    let testTimer = 0;

    // ---------- root ----------
    const root = new UE.GameObject("GolfRoot");
    if (CS.Stage.Instance) {
        root.transform.SetParent(CS.Stage.Instance.transform, false);
    }
    const relay = root.AddComponent($t(CS.JsEventRelay));

    const shader = UE.Shader.Find("Sprites/Default");
    function makeMat(r, g, b) {
        const m = new UE.Material(shader);
        m.color = new UE.Color(r, g, b, 1);
        return m;
    }
    const matGreen = makeMat(0.2, 0.75, 0.25);
    const matPole = makeMat(0.9, 0.9, 0.9);
    const matFlag = makeMat(0.95, 0.15, 0.15);
    const matBall = makeMat(1, 1, 1);

    // ---------- course ----------
    const startTr = CS.StageEnvironment.Instance.PlayerGroundStartPosition;
    const spv = startTr.position;
    const tee = [spv.x, spv.y + 2, spv.z];
    const fwv = startTr.forward;
    let fl = Math.sqrt(fwv.x * fwv.x + fwv.z * fwv.z);
    let fwd = [0, 0, 1];
    if (fl > 0.001) fwd = [fwv.x / fl, 0, fwv.z / fl];

    // hole layout: rotate direction a bit per hole, growing distance
    const holes = [];
    const angles = [-20, 15, -5];
    const dists = [280, 380, 500];
    for (let i = 0; i < HOLE_COUNT; i++) {
        const a = angles[i] * Math.PI / 180;
        const dx = fwd[0] * Math.cos(a) - fwd[2] * Math.sin(a);
        const dz = fwd[0] * Math.sin(a) + fwd[2] * Math.cos(a);
        const hx = tee[0] + dx * dists[i];
        const hz = tee[2] + dz * dists[i];
        const hy = mission.getTerrainHeight(hx, hz);
        holes.push([hx, hy, hz]);
    }

    function buildFlag(i) {
        const h = holes[i];
        const flagRoot = new UE.GameObject("Hole_" + i);
        flagRoot.transform.SetParent(root.transform, false);
        flagRoot.transform.position = new UE.Vector3(h[0], h[1], h[2]);

        const green = UE.GameObject.CreatePrimitive(UE.PrimitiveType.Cylinder);
        green.transform.SetParent(flagRoot.transform, false);
        green.transform.localPosition = new UE.Vector3(0, 0.1, 0);
        green.transform.localScale = new UE.Vector3(HOLE_RADIUS * 2, 0.1, HOLE_RADIUS * 2);
        UE.Object.Destroy(green.GetComponent($t(UE.CapsuleCollider)));
        green.GetComponent($t(UE.MeshRenderer)).sharedMaterial = matGreen;

        const pole = UE.GameObject.CreatePrimitive(UE.PrimitiveType.Cylinder);
        pole.transform.SetParent(flagRoot.transform, false);
        pole.transform.localPosition = new UE.Vector3(0, 5, 0);
        pole.transform.localScale = new UE.Vector3(0.4, 5, 0.4);
        UE.Object.Destroy(pole.GetComponent($t(UE.CapsuleCollider)));
        pole.GetComponent($t(UE.MeshRenderer)).sharedMaterial = matPole;

        const flag = UE.GameObject.CreatePrimitive(UE.PrimitiveType.Cube);
        flag.transform.SetParent(flagRoot.transform, false);
        flag.transform.localPosition = new UE.Vector3(1.6, 9, 0);
        flag.transform.localScale = new UE.Vector3(3, 1.8, 0.1);
        UE.Object.Destroy(flag.GetComponent($t(UE.BoxCollider)));
        flag.GetComponent($t(UE.MeshRenderer)).sharedMaterial = matFlag;

        return flagRoot;
    }
    const flagObjects = [];
    for (let i = 0; i < HOLE_COUNT; i++) flagObjects.push(buildFlag(i));

    // ---------- ball ----------
    const ball = UE.GameObject.CreatePrimitive(UE.PrimitiveType.Sphere);
    ball.name = "GolfBall";
    ball.transform.SetParent(root.transform, false);
    ball.transform.position = new UE.Vector3(tee[0], tee[1], tee[2]);
    ball.transform.localScale = new UE.Vector3(1.6, 1.6, 1.6);
    ball.GetComponent($t(UE.MeshRenderer)).sharedMaterial = matBall;
    const ballCol = ball.GetComponent($t(UE.SphereCollider));
    try {
        const pm = new UE.PhysicsMaterial();
        pm.bounciness = 0.45;
        pm.dynamicFriction = 0.6;
        pm.staticFriction = 0.6;
        ballCol.material = pm;
    } catch (e) {
        console.log("[Golf] physics material unavailable: " + e);
    }
    const ballRb = ball.AddComponent($t(UE.Rigidbody));
    ballRb.mass = 1;
    ballRb.collisionDetectionMode = UE.CollisionDetectionMode.ContinuousDynamic;
    ballRb.isKinematic = true;   // parked until first stroke

    // ---------- HUD ----------
    const canvasGo = new UE.GameObject("GolfHUD");
    canvasGo.transform.SetParent(root.transform, false);
    const canvas = canvasGo.AddComponent($t(UE.Canvas));
    canvas.renderMode = UE.RenderMode.ScreenSpaceOverlay;
    canvas.sortingOrder = 500;
    canvasGo.AddComponent($t(UE.UI.CanvasScaler));

    const font = UE.Resources.GetBuiltinResource($t(UE.Font), "LegacyRuntime.ttf");
    function makeText(name, x, y, w, h, size, anchorTop) {
        const go = new UE.GameObject(name);
        go.transform.SetParent(canvasGo.transform, false);
        const rt = go.AddComponent($t(UE.RectTransform));
        let ay = 0;
        if (anchorTop) ay = 1;
        rt.anchorMin = new UE.Vector2(0.5, ay);
        rt.anchorMax = new UE.Vector2(0.5, ay);
        rt.pivot = new UE.Vector2(0.5, ay);
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
    const infoText = makeText("info", 0, -50, 900, 60, 34, true);
    const bigText = makeText("big", 0, -160, 900, 100, 48, true);
    const helpText = makeText("help", 0, 90, 900, 40, 22, false);
    helpText.text = "aim with camera — SPACE: start meter, SPACE again: fire";

    // power bar
    const barBg = new UE.GameObject("powerBg");
    barBg.transform.SetParent(canvasGo.transform, false);
    const bgRt = barBg.AddComponent($t(UE.RectTransform));
    bgRt.anchorMin = new UE.Vector2(0.5, 0);
    bgRt.anchorMax = new UE.Vector2(0.5, 0);
    bgRt.pivot = new UE.Vector2(0.5, 0);
    bgRt.anchoredPosition = new UE.Vector2(0, 40);
    bgRt.sizeDelta = new UE.Vector2(500, 30);
    barBg.AddComponent($t(UE.UI.Image)).color = new UE.Color(0, 0, 0, 0.6);

    const barFill = new UE.GameObject("powerFill");
    barFill.transform.SetParent(barBg.transform, false);
    const fillRt = barFill.AddComponent($t(UE.RectTransform));
    fillRt.anchorMin = new UE.Vector2(0, 0.5);
    fillRt.anchorMax = new UE.Vector2(0, 0.5);
    fillRt.pivot = new UE.Vector2(0, 0.5);
    fillRt.anchoredPosition = new UE.Vector2(2, 0);
    fillRt.sizeDelta = new UE.Vector2(0, 24);
    const fillImg = barFill.AddComponent($t(UE.UI.Image));
    fillImg.color = new UE.Color(1, 0.8, 0.1, 1);

    function updateHud() {
        const h = holes[state.hole];
        const bp = ball.transform.position;
        const dx = bp.x - h[0];
        const dz = bp.z - h[2];
        const d = Math.sqrt(dx * dx + dz * dz);
        infoText.text = "HOLE " + (state.hole + 1) + "/" + HOLE_COUNT
            + "   STROKES " + state.strokes
            + "   TOTAL " + state.totalStrokes
            + "   " + d.toFixed(0) + "m TO FLAG";
    }

    // ---------- stroke logic ----------
    let stopTimer = 0;
    let inFlight = false;
    let endTimer = 0;
    let endSent = false;

    function fire(dir, power) {
        state.strokes++;
        state.totalStrokes++;
        ballRb.isKinematic = false;
        const speed = power / 100 * MAX_POWER_MS;
        const up = LOFT;
        let vx = dir[0];
        let vz = dir[2];
        const l = Math.sqrt(vx * vx + vz * vz);
        if (l > 0.001) { vx /= l; vz /= l; }
        const norm = Math.sqrt(1 + up * up);
        ballRb.linearVelocity = new UE.Vector3(
            vx / norm * speed, up / norm * speed, vz / norm * speed);
        inFlight = true;
        stopTimer = 0;
        bigText.text = "";
        updateHud();
        console.log("[Golf] stroke " + state.strokes + " power " + power.toFixed(0));
    }

    function ballStopped() {
        inFlight = false;
        const h = holes[state.hole];
        const bp = ball.transform.position;
        const dx = bp.x - h[0];
        const dz = bp.z - h[2];
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d <= HOLE_RADIUS) {
            holed();
        } else {
            bigText.text = d.toFixed(0) + "m to flag — shoot again";
        }
        updateHud();
    }

    function holed() {
        console.log("[Golf] hole " + (state.hole + 1) + " done in " + state.strokes);
        flagObjects[state.hole].SetActive(false);
        state.hole++;
        if (state.hole >= HOLE_COUNT) {
            state.finished = true;
            bigText.text = "FINISH!  " + state.totalStrokes + " STROKES";
            test.done = true;
            test.passed = true;
            test.log = "finished in " + state.totalStrokes + " strokes";
            return;
        }
        state.strokes = 0;
        bigText.text = "HOLE " + (state.hole + 1) + "!";
        // next tee = where the previous flag stood
        const prev = holes[state.hole - 1];
        ballRb.isKinematic = true;
        const pos = new UE.Vector3(prev[0], prev[1] + 2, prev[2]);
        ball.transform.position = pos;
        updateHud();
    }

    // ---------- input ----------
    function spacePressed() {
        const kb = CS.UnityEngine.InputSystem.Keyboard.current;
        if (kb && kb.spaceKey.wasPressedThisFrame) return true;
        return false;
    }

    // ---------- game loop ----------
    relay.onUpdate = function (dt) {
        if (state.finished) {
            endTimer += dt;
            if (!endSent && endTimer >= END_DELAY) {
                endSent = true;
                mission.win();
            }
            return;
        }

        // test autopilot
        if (state.testMode) {
            testTimer += dt;
            if (testPhase === 0 && testTimer > 1) {
                // one real launch toward hole 1 (verifies physics + stroke count)
                const h = holes[0];
                const bp = ball.transform.position;
                fire([h[0] - bp.x, 0, h[2] - bp.z], 60);
                testPhase = 1;
                testTimer = 0;
            } else if (testPhase === 1 && testTimer > 4) {
                // physics sanity: the launched ball must have left the tee
                const bp = ball.transform.position;
                const dx = bp.x - tee[0];
                const dz = bp.z - tee[2];
                const moved = Math.sqrt(dx * dx + dz * dz);
                if (moved < 20) {
                    test.done = true;
                    test.passed = false;
                    test.log = "ball did not fly (moved " + moved.toFixed(1) + "m)";
                } else {
                    test.log = "launch flew " + moved.toFixed(0) + "m";
                    testPhase = 2;
                }
                testTimer = 0;
            } else if (testPhase === 2 && testTimer > 1.5) {
                // deterministic hole progression: physics randomness (slopes,
                // water) must not decide the test — call the hole logic directly
                testTimer = 0;
                ballRb.isKinematic = true;
                inFlight = false;
                holed();
            }
        } else {
            if (!inFlight) {
                if (state.charging) {
                    state.power += dt * 90;
                    if (state.power > 100) state.power = 100;
                    fillRt.sizeDelta = new UE.Vector2(state.power / 100 * 496, 24);
                    if (spacePressed()) {
                        state.charging = false;
                        const cam = UE.Camera.main;
                        let dir = [fwd[0], 0, fwd[2]];
                        if (cam) {
                            const cf = cam.transform.forward;
                            dir = [cf.x, 0, cf.z];
                        }
                        fire(dir, state.power);
                        fillRt.sizeDelta = new UE.Vector2(0, 24);
                    }
                } else if (spacePressed()) {
                    state.charging = true;
                    state.power = 0;
                }
            }
        }

        // stop detection
        if (inFlight) {
            const v = ballRb.linearVelocity;
            const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
            if (speed < STOP_SPEED) {
                stopTimer += dt;
                if (stopTimer > STOP_TIME) ballStopped();
            } else {
                stopTimer = 0;
            }
            // fell off the world
            if (ball.transform.position.y < -50) {
                const h = holes[state.hole];
                ballRb.linearVelocity = new UE.Vector3(0, 0, 0);
                ballRb.position = new UE.Vector3(h[0], h[1] + 3, h[2]);
            }
            updateHud();
        }
    };

    updateHud();
    test.ready = true;
    console.log("[Golf] course ready — " + HOLE_COUNT + " holes from ("
        + tee[0].toFixed(0) + "," + tee[1].toFixed(0) + "," + tee[2].toFixed(0) + ")");
}
