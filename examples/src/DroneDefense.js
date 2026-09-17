// MissionFormatVersion: 1
// Description: Kamikaze quadcopter defense as infantry — stop FPV drone waves from wiping out your squad.
// ============================================
// DRONE DEFENSE — 카미카제 드론 방어전 (보병)
//
// You are a soldier guarding your squad: one parked vehicle with three
// riflemen taking cover at its flanks (same cluster shape as the Drone
// Strike mode) — everyone holds position, nobody chases anything.
// Kamikaze FPV quadcopters come in low waves and dive on them (the AI
// targets your squadmates before you — you are the last resort target).
// Shoot every drone down before the squad is wiped out.
//
// Player:  soldier, "ak" (press EQUIP / Z first — weapon starts holstered).
//          No MANPADS: an IR seeker cannot lock a tiny electric quad — rifles only, like real counter-FPV.
// Enemies: fpv-drone kamikaze quadcopters closing from 500-700 m, low.
// Win:     clear all 2 waves.
// Lose:    you die. Losing the squad no longer ends the round — you are the
//          drones' last-resort target, so with the squad gone they come for
//          you and you fight on alone.
//
// Self-test (MET autoRun "jsgames"): __gameTest.start() enables test mode.
// TEST_LOSE = false → win path: each wave's drones are JS-killed shortly
//   after spawning; verifies wave progression and the win.
// TEST_LOSE = true → squad-wipe path: nobody defends; the drones wipe the
//   squad and the round must KEEP running (the player is still alive).
// ============================================

const TEST_LOSE = false;

const TEAM_ALLY = 1;
const TEAM_ENEMY = 2;

const WAVE_DELAY = 6;        // seconds between wave clear and next spawn
const POLL_INTERVAL = 0.5;   // wave/squad alive polling

// Fixed bearings (compass degrees from the base) so rounds are comparable.
// Each entry is one wave: groups of quadcopters per bearing.
const WAVES = [
    { groups: [{ bearing: 20, count: 3, dist: 500 }] },
    { groups: [{ bearing: 300, count: 2, dist: 550 }, { bearing: 80, count: 2, dist: 650 }] }
];

const DRONE_ALT = 50;

async function Init() {
    mission.setPlayerType("Ground", TEAM_ALLY);
    mission.setWinCondition("Manual");
    mission.setTime(8, 0);
    mission.setWeather("Cloudy 1");
    // FPV games play only on the close-quarters urban maps.
    const maps = ["Mostar", "Bakhmut"];
    await mission.loadMap(maps[Math.floor(Math.random() * maps.length)]);
}

function SpawnUnits() {
    const sp = mission.getPlayerGroundStartPosition();
    const bx = sp.x;
    const bz = sp.z;
    const rotY = mission.getPlayerGroundStartRotY();

    // You — AK for the close quads, Stinger as the long-range option.
    const py = mission.getTerrainHeight(bx, bz);
    mission.spawnUnit("soldier", bx, py, bz, rotY, TEAM_ALLY, true, 1.0, 1.0, "ak");

    // The squad you are defending: one parked vehicle with three riflemen
    // hugging its flanks like cover (same cluster shape as the Drone Strike
    // mode), 60m from the player so a drone hit on them doesn't also kill
    // you. Everyone holds position — the squad defends the spot.
    const vehiclePool = ["humvee", "apc-2", "apc", "toyota-pickup"];
    const ax = bx + 55;
    const az = bz + 35;
    const ay = mission.getTerrainHeight(ax, az);
    const vehRotY = 100;
    const allies = [];
    const vehicle = vehiclePool[Math.floor(Math.random() * vehiclePool.length)];
    const v = mission.spawnUnit(vehicle, ax, ay, az, vehRotY, TEAM_ALLY, false, 1.0, 1.0);
    mission.setUnitHoldPosition(v, true);
    allies.push(v);
    const vrad = vehRotY * Math.PI / 180;
    const fwdX = Math.sin(vrad), fwdZ = Math.cos(vrad);
    const rightX = Math.cos(vrad), rightZ = -Math.sin(vrad);
    for (let i = 0; i < 3; i++) {
        let side = 1;
        if (i % 2 === 1) { side = -1; }
        const lat = (2.6 + Math.random() * 1.0) * side;
        const lon = (Math.random() * 2 - 1) * 2.5;
        const x = ax + rightX * lat + fwdX * lon;
        const z = az + rightZ * lat + fwdZ * lon;
        const y = mission.getTerrainHeight(x, z);
        const u = mission.spawnUnit("soldier", x, y, z, randomRange(0, 360), TEAM_ALLY, false, 1.0, 1.0, "ak");
        mission.setUnitHoldPosition(u, true);
        allies.push(u);
    }

    // Everything below is the live wave game — skip in editor preview.
    if (!mission.isGameplay) return;
    SetupWaveGame(bx, bz, allies);
}

function SetupWaveGame(bx, bz, allies) {
    const UE = CS.UnityEngine;
    const $t = puer.$typeof;

    const state = {
        waveIndex: -1,          // index of the wave currently in the air
        waveUnits: [],          // spawnUnit handles of the current wave
        wavesCleared: 0,
        alliesAlive: allies.length,
        nextWaveAt: 4,          // first wave 4s in
        elapsed: 0,
        nextPoll: 0,
        finished: false,
        testMode: false,
        testKillAt: -1,
        testCheckAt: -1
    };

    const test = {
        ready: true,
        done: false,
        passed: false,
        log: "",
        start: function () {
            state.testMode = true;
            if (TEST_LOSE) {
                // Lose path: defend nothing, the drones must wipe the squad.
                test.log = "lose-test mode on";
                return;
            }
            // A wave may already be in the air before the harness calls start()
            // (wave 1 spawns 4s in) — arm the kill timer for it too.
            state.testKillAt = state.elapsed + 2;
            test.log = "test mode on";
        }
    };
    globalThis.__gameTest = test;

    function spawnPoint(bearing, dist, alt, jitterIndex) {
        // Spread multiple drones of one group along the bearing arc and in depth.
        const spreadDeg = (jitterIndex - 1) * 12;
        const rad = (bearing + spreadDeg) * Math.PI / 180;
        const d = dist + jitterIndex * 120;
        const x = bx + Math.sin(rad) * d;
        const z = bz + Math.cos(rad) * d;
        const groundY = mission.getTerrainHeight(x, z);
        const baseY = mission.getTerrainHeight(bx, bz);
        const y = Math.max(groundY, baseY) + alt;
        const rotToBase = Math.atan2(bx - x, bz - z) * 180 / Math.PI;
        return { x: x, y: y, z: z, rotY: rotToBase };
    }

    function spawnWave(index) {
        const wave = WAVES[index];
        state.waveIndex = index;
        state.waveUnits = [];

        for (let g = 0; g < wave.groups.length; g++) {
            const grp = wave.groups[g];
            for (let i = 0; i < grp.count; i++) {
                const p = spawnPoint(grp.bearing, grp.dist, DRONE_ALT, i);
                state.waveUnits.push(mission.spawnUnit("fpv-drone", p.x, p.y, p.z, p.rotY, TEAM_ENEMY, false, 1.0, 1.0));
            }
        }

        if (state.testMode) {
            if (!TEST_LOSE) {
                state.testKillAt = state.elapsed + 2;
            }
            test.log += " | wave" + (index + 1) + " spawned " + state.waveUnits.length;
        }
    }

    function aliveCount(list) {
        let n = 0;
        for (let i = 0; i < list.length; i++) {
            if (list[i] && list[i].isAlive) n++;
        }
        return n;
    }

    function finish(won) {
        state.finished = true;
        if (won) {
            mission.win();
        } else {
            mission.fail();
        }
        if (state.testMode) {
            test.done = true;
            test.passed = won && state.wavesCleared === WAVES.length;
            test.log += " | finished won=" + won + " waves=" + state.wavesCleared + " allies=" + state.alliesAlive;
        }
    }

    const root = new UE.GameObject("DroneDefenseLogic");
    root.transform.SetParent(CS.Stage.Instance.transform, false);
    const relay = root.AddComponent($t(CS.JsEventRelay));

    relay.onUpdate = function (dt) {
        if (state.finished) return;
        state.elapsed += dt;

        // Test mode: simulate the player clearing the wave.
        if (state.testMode && state.testKillAt > 0 && state.elapsed >= state.testKillAt) {
            state.testKillAt = -1;
            const playerUnit = CS.Player.instance.GetUnit();
            for (let i = 0; i < state.waveUnits.length; i++) {
                const u = state.waveUnits[i];
                if (u && u.isAlive) {
                    u.CurrentHp = 0;
                    u.Dead(playerUnit);
                }
            }
        }

        // Pending wave spawn
        if (state.nextWaveAt > 0 && state.elapsed >= state.nextWaveAt) {
            state.nextWaveAt = -1;
            spawnWave(state.wavesCleared);
        }

        if (state.elapsed < state.nextPoll) return;
        state.nextPoll = state.elapsed + POLL_INTERVAL;

        // Squad status. Losing the whole squad does NOT end the round — the
        // player is the drones' last-resort target, so they keep coming and
        // the fight goes on alone (the engine handles the player's own death).
        const alliesNow = aliveCount(allies);
        if (alliesNow < state.alliesAlive) {
            state.alliesAlive = alliesNow;
            if (alliesNow === 0 && state.testMode && TEST_LOSE) {
                state.testCheckAt = state.elapsed + 3;
            }
        }

        // Lose-test: the squad is gone — verify the round kept running (the
        // old rule ended it here), then report.
        if (state.testCheckAt > 0 && state.elapsed >= state.testCheckAt) {
            state.testCheckAt = -1;
            test.passed = !state.finished;
            test.done = true;
            test.log += " | squad wiped, round still running=" + !state.finished;
        }

        // Wave cleared?
        if (state.waveIndex >= 0 && state.nextWaveAt < 0 && aliveCount(state.waveUnits) === 0) {
            state.wavesCleared++;
            state.waveIndex = -1;
            if (state.wavesCleared >= WAVES.length) {
                finish(true);
            } else {
                state.nextWaveAt = state.elapsed + WAVE_DELAY;
            }
        }
    };
}
