// MissionFormatVersion: 1
// ============================================
// AIR RACE — Checkpoint Time Trial (pure-JS custom game prototype)
//
// Roblox-style demo: every game rule lives in this script.
// C# side provides only:
//   - the mission.* API (map/player/win plumbing)
//   - JsEventRelay (Unity messages -> JS callbacks)
//   - the full engine via the CS.* global (PuerTS)
//
// Player: your equipped aircraft. Fly through all rings, fastest time wins.
// ============================================

const RING_COUNT = 6;
const RING_RADIUS = 60;        // trigger + visual radius (m)
const RING_SEGMENTS = 14;      // spheres forming each ring visual
const SEGMENT_SCALE = 10;      // diameter of each ring sphere (m)
const FIRST_CP_DIST = 600;     // distance from start to first ring (m)
const CP_SPACING = 700;        // distance between rings (m)
const MIN_CLEARANCE = 120;     // min height above terrain (m)
const FINISH_WIN_DELAY = 2.5;  // seconds after finish before mission.win()

async function Init() {
    mission.setPlayerType("Aircraft", 4);
    mission.setWinCondition("Manual");
    mission.setTime(10, 30);
    mission.setWeather("Clear Sky");
    await mission.loadMap("Kuwait");
}

function SpawnUnits() {
    // The editor parse pass also calls SpawnUnits (data collection mode).
    // The race only exists in real gameplay.
    if (!mission.isGameplay) return;
    setupRace();
}

// ---------- small vector helpers (plain arrays, no interop cost) ----------
function vSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function vAdd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function vScale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function vLen(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
function vNorm(a) {
    const l = vLen(a);
    if (l < 0.0001) return [0, 0, 1];
    return vScale(a, 1 / l);
}
function vCross(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
}

function setupRace() {
    const UE = CS.UnityEngine;
    const $t = puer.$typeof;

    // ---------- shared state ----------
    const state = {
        current: 0,
        total: RING_COUNT,
        finished: false,
        time: 0,
        winSent: false,
        finishTimer: 0,
        positions: [],
        lastPassVia: "",
        hudReady: false
    };
    globalThis.__race = state;

    // ---------- root object (parented to Stage => auto-cleanup on round end) ----------
    const raceRoot = new UE.GameObject("RaceRoot");
    if (CS.Stage.Instance) {
        raceRoot.transform.SetParent(CS.Stage.Instance.transform, false);
    }

    // ---------- course layout from the aircraft start pose ----------
    const startTr = CS.StageEnvironment.Instance.PlayerAircraftStartPosition;
    const spv = startTr.position;
    const sp = [spv.x, spv.y, spv.z];
    const fwv = startTr.forward;
    let fwd = vNorm([fwv.x, 0, fwv.z]);
    const right = vNorm(vCross([0, 1, 0], fwd));

    const lateral = [0, 150, -200, 250, -250, 0];
    const climb = [0, 60, -40, 100, -60, 20];

    const centers = [];
    for (let i = 0; i < RING_COUNT; i++) {
        const dist = FIRST_CP_DIST + i * CP_SPACING;
        let p = vAdd(sp, vScale(fwd, dist));
        p = vAdd(p, vScale(right, lateral[i % lateral.length]));
        p[1] = sp[1] + climb[i % climb.length];
        const groundY = mission.getTerrainHeight(p[0], p[2]);
        if (p[1] < groundY + MIN_CLEARANCE) {
            p[1] = groundY + MIN_CLEARANCE;
        }
        centers.push(p);
        state.positions.push({ x: p[0], y: p[1], z: p[2] });
    }

    // ---------- materials (3 shared instances, not per-sphere) ----------
    const shader = UE.Shader.Find("Sprites/Default");
    const matActive = new UE.Material(shader);
    matActive.color = new UE.Color(1, 0.85, 0.1, 1);
    const matPending = new UE.Material(shader);
    matPending.color = new UE.Color(0.45, 0.55, 0.75, 1);

    // ---------- build rings ----------
    const rings = [];
    for (let i = 0; i < RING_COUNT; i++) {
        let prev = sp;
        if (i > 0) prev = centers[i - 1];
        const dir = vNorm(vSub(centers[i], prev));
        const u = vNorm(vCross(dir, [0, 1, 0]));
        const v = vCross(u, dir);

        const ringGo = new UE.GameObject("RaceRing_" + i);
        ringGo.transform.SetParent(raceRoot.transform, false);
        ringGo.transform.position = new UE.Vector3(centers[i][0], centers[i][1], centers[i][2]);

        // visual: spheres arranged in a circle
        for (let s = 0; s < RING_SEGMENTS; s++) {
            const ang = (s / RING_SEGMENTS) * Math.PI * 2;
            const off = vAdd(vScale(u, Math.cos(ang) * RING_RADIUS), vScale(v, Math.sin(ang) * RING_RADIUS));
            const sphere = UE.GameObject.CreatePrimitive(UE.PrimitiveType.Sphere);
            sphere.name = "seg";
            sphere.transform.SetParent(ringGo.transform, false);
            sphere.transform.localPosition = new UE.Vector3(off[0], off[1], off[2]);
            sphere.transform.localScale = new UE.Vector3(SEGMENT_SCALE, SEGMENT_SCALE, SEGMENT_SCALE);
            // visual only — the primitive's collider would physically block the aircraft
            UE.Object.Destroy(sphere.GetComponent($t(UE.SphereCollider)));
            const rend = sphere.GetComponent($t(UE.MeshRenderer));
            if (i === 0) {
                rend.sharedMaterial = matActive;
            } else {
                rend.sharedMaterial = matPending;
            }
            rend.shadowCastingMode = UE.Rendering.ShadowCastingMode.Off;
        }

        // trigger volume + relay
        const col = ringGo.AddComponent($t(UE.SphereCollider));
        col.isTrigger = true;
        col.radius = RING_RADIUS;
        const relay = ringGo.AddComponent($t(CS.JsEventRelay));
        const ringIndex = i;
        relay.onTriggerEnter = function (other) {
            if (isPlayerCollider(other)) {
                passCheckpoint(ringIndex, "trigger");
            }
        };

        rings.push(ringGo);
    }

    // ---------- HUD (UGUI built from JS) ----------
    let hudText = null;
    (function buildHud() {
        const canvasGo = new UE.GameObject("RaceHUD");
        canvasGo.transform.SetParent(raceRoot.transform, false);
        const canvas = canvasGo.AddComponent($t(UE.Canvas));
        canvas.renderMode = UE.RenderMode.ScreenSpaceOverlay;
        canvas.sortingOrder = 500;
        canvasGo.AddComponent($t(UE.UI.CanvasScaler));

        const textGo = new UE.GameObject("RaceText");
        textGo.transform.SetParent(canvasGo.transform, false);
        const text = textGo.AddComponent($t(UE.UI.Text));
        text.font = UE.Resources.GetBuiltinResource($t(UE.Font), "LegacyRuntime.ttf");
        text.fontSize = 40;
        text.fontStyle = UE.FontStyle.Bold;
        text.alignment = UE.TextAnchor.UpperCenter;
        text.color = new UE.Color(1, 0.9, 0.2, 1);
        const outline = textGo.AddComponent($t(UE.UI.Outline));
        outline.effectColor = new UE.Color(0, 0, 0, 0.9);

        const rt = textGo.GetComponent($t(UE.RectTransform));
        rt.anchorMin = new UE.Vector2(0.5, 1);
        rt.anchorMax = new UE.Vector2(0.5, 1);
        rt.pivot = new UE.Vector2(0.5, 1);
        rt.anchoredPosition = new UE.Vector2(0, -60);
        rt.sizeDelta = new UE.Vector2(1100, 130);

        hudText = text;
        state.hudReady = true;
    })();

    function updateHud() {
        if (!hudText) return;
        if (state.finished) {
            hudText.text = "FINISH!  " + state.time.toFixed(1) + "s";
            return;
        }
        hudText.text = "AIR RACE  " + state.current + "/" + RING_COUNT
            + "   TIME " + state.time.toFixed(1) + "s";
    }

    // ---------- player helpers ----------
    let cachedUnit = null;
    function playerUnit() {
        if (cachedUnit && cachedUnit.isAlive) return cachedUnit;
        const p = CS.Player.instance;
        if (!p) return null;
        cachedUnit = p.GetUnit();
        return cachedUnit;
    }

    function isPlayerCollider(other) {
        const u = playerUnit();
        if (!u) return false;
        let t = other.transform;
        const rb = other.attachedRigidbody;
        if (rb) t = rb.transform;
        return t.root.GetInstanceID() === u.transform.root.GetInstanceID();
    }

    // ---------- race rules ----------
    function passCheckpoint(index, via) {
        if (state.finished) return;
        if (index !== state.current) return;

        state.lastPassVia = via;
        rings[index].SetActive(false);
        state.current++;
        console.log("[AirRace] checkpoint " + state.current + "/" + RING_COUNT + " via " + via);

        if (state.current >= RING_COUNT) {
            state.finished = true;
            updateHud();
            return;
        }

        // highlight new active ring
        const active = rings[state.current];
        const rends = active.GetComponentsInChildren($t(UE.MeshRenderer));
        for (let r = 0; r < rends.Length; r++) {
            rends.get_Item(r).sharedMaterial = matActive;
        }
        updateHud();
    }

    // ---------- per-frame logic: one relay for the whole race ----------
    const managerRelay = raceRoot.AddComponent($t(CS.JsEventRelay));
    managerRelay.onUpdate = function (dt) {
        if (state.finished) {
            state.finishTimer += dt;
            if (!state.winSent && state.finishTimer >= FINISH_WIN_DELAY) {
                state.winSent = true;
                console.log("[AirRace] finished in " + state.time.toFixed(1) + "s — mission.win()");
                mission.win();
            }
            return;
        }

        state.time += dt;

        // distance fallback so the race also works if physics layers
        // filter out the trigger contact
        const u = playerUnit();
        if (u) {
            const pos = u.transform.position;
            const c = state.positions[state.current];
            const dx = pos.x - c.x;
            const dy = pos.y - c.y;
            const dz = pos.z - c.z;
            if (dx * dx + dy * dy + dz * dz < RING_RADIUS * RING_RADIUS) {
                passCheckpoint(state.current, "distance");
            }
        }

        updateHud();
    };

    updateHud();
    console.log("[AirRace] course ready: " + RING_COUNT + " rings from ("
        + sp[0].toFixed(0) + "," + sp[1].toFixed(0) + "," + sp[2].toFixed(0) + ")");
}
