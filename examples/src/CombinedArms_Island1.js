// MissionFormatVersion: 1
// Description: Unified battlefield prototype — armour, SAM, jets, gunships and warships clash on Island1.
// ============================================
// COMBINED ARMS — unified battlefield prototype v2
// BLUE (team 4, player): tank + Patriot + M1 Abrams + frigate + F-16 + AH-64
// RED  (team 3, enemy): 2x T-90A + Tunguska + destroyer + 2x MiG-29 + Mi-24
//
// v2 (2026-08-01): direct-coordinate spawn layout designed from a 50m terrain
// scan of Island1 (land spans x -1250..-350, z 1050..1850; water Y 310.33).
// Engagement distances per class (playtest round 2 findings):
//   ground vs ground  ~0.9 km  (island's physical maximum, SW tip vs E lobe)
//   fleet vs fleet    ~1.9 km  (just inside the 2 km surface gun gate)
//   each fleet to the enemy beach ~1.3-1.4 km (shore bombardment works)
//   jets ~5 km out, helis ~2.2-2.7 km behind their own fleets
// Player death no longer ends the round while allies fight on
// (mission.setSpectateOnDeath) — the camera follows the survivors.
// Embedded [UBF] observer logs the whole battle state every 10s.
// ============================================

const BLUE = 4; // player side
const RED = 3;  // enemy side

async function Init() {
    mission.setPlayerType("Ground", BLUE);
    mission.setWinCondition("EliminateAllEnemies");
    mission.setTime(11, 0);
    mission.setWeather("Clear Sky");
    await mission.loadMap("Island1"); // only map with both ground and sea
    // Player anchors the BLUE ground group on the southwest tip, facing the
    // RED ground group on the east lobe. Literal Y: Init runs in the parse pass,
    // before Island1 is loaded, so getTerrainHeight here would sample whatever
    // map is currently up (terrain at this spot is 323.4 m).
    mission.setPlayerStartPosition("Ground", -1150, 324, 1150, 47);
}

function SpawnUnits() {
    mission.setSpectateOnDeath(true);

    // --- BLUE ground group: southwest tip around the player ---
    mission.spawnUnit("m1-abrams", -1080, mission.getTerrainHeight(-1080, 1120), 1120, 47, BLUE, false, 1.0, 1.0);
    mission.spawnUnit("patriot", -1220, mission.getTerrainHeight(-1220, 1210), 1210, 47, BLUE, false, 1.0, 1.0);

    // --- RED ground group: east lobe, ~0.9 km from the BLUE tip ---
    mission.spawnUnit("t-90a", -550, mission.getTerrainHeight(-550, 1600), 1600, 227, RED, false, 1.0, 1.0);
    mission.spawnUnit("t-90a", -500, mission.getTerrainHeight(-500, 1500), 1500, 227, RED, false, 1.0, 1.0);
    mission.spawnUnit("2k22-tunguska", -650, mission.getTerrainHeight(-650, 1700), 1700, 227, RED, false, 1.0, 1.0);

    // --- NAVY: BLUE fleet southwest offshore, RED fleet east offshore.
    //     ~1.9 km apart so the ships can actually duel (2 km surface gun gate),
    //     and each fleet reaches the enemy beach for shore bombardment. ---
    const waterY = 310.33;
    mission.spawnUnit("frigate", -1700, waterY, 800, 90, BLUE, false, 1.0, 1.0);
    mission.spawnUnit("destroyer-class", 100, waterY, 1450, 270, RED, false, 1.0, 1.0);

    // --- RED air group: air spawn corridor ~5 km south, staggered in depth ---
    const air = mission.getAirSpawnPoint();
    const airRot = mission.getAirSpawnPointRotY();
    for (let i = 0; i < 2; i++) {
        mission.spawnUnit("mig-29", air.x + i * 200 - 100, Math.max(air.y, 600), air.z + i * 600, airRot, RED, false, 1.0, 1.0);
    }

    // --- Gunships: spawned behind their own fleets, outside immediate SAM reach ---
    mission.spawnUnit("mi-24", 1200, 350, 2400, 227, RED, false, 1.0, 1.0);
    mission.spawnUnit("ah-64", -2400, 350, 300, 47, BLUE, false, 1.0, 1.0);

    // --- BLUE air cover over the friendly fleet, facing the RED air corridor ---
    const toAirRot = Math.atan2(air.x - (-2200), air.z - 300) * 180 / Math.PI;
    mission.spawnUnit("f-16", -2200, 1250, 300, toAirRot, BLUE, false, 1.0, 1.0);

    // Everything below only makes sense during real gameplay.
    if (!mission.isGameplay) return;
    SetupObserver();
}

function OnUnitDead(unit) {
    if (!mission.isGameplay) return;
    try {
        CS.UnityEngine.Debug.Log("[UBF] DEAD t=" + Math.round(CS.UnityEngine.Time.time) + "s " + unit.name + " team=" + unit.team);
    } catch (e) { }
}

// ---------- [UBF] battle observer: full state snapshot every 10s ----------
function SetupObserver() {
    const $t = puer.$typeof;
    const root = new CS.UnityEngine.GameObject("UBF_Observer");
    const relay = root.AddComponent($t(CS.JsEventRelay));
    let nextSample = 5; // first snapshot 5s in
    let elapsed = 0;
    const aiCache = {}; // instanceId -> { air: UnitAI, ground: Ai }

    function GetAI(u) {
        const id = u.GetInstanceID();
        if (!(id in aiCache)) {
            const entry = { air: null, ground: null };
            entry.air = u.transform.GetComponentInChildren($t(CS.UnitAI));
            entry.ground = u.transform.GetComponentInChildren($t(CS.Ai));
            aiCache[id] = entry;
        }
        return aiCache[id];
    }

    relay.onUpdate = function (dt) {
        elapsed += dt;
        if (elapsed < nextSample) return;
        nextSample = elapsed + 10;
        try {
            const all = CS.Stage.Instance.allUnits;
            const fps = Math.round(1 / Math.max(dt, 0.0001));
            let lines = "[UBF] ===== t=" + Math.round(elapsed) + "s units=" + all.Count + " fps=" + fps + " =====";
            for (let i = 0; i < all.Count; i++) {
                const u = all.get_Item(i);
                if (!u) continue;
                const p = u.transform.position;
                let line = "[UBF] " + u.name + " team=" + u.team + " type=" + u.GetUnitType()
                    + " alive=" + u.isAlive + " hp=" + Math.round(u.CurrentHp * 10) / 10
                    + " pos=(" + Math.round(p.x) + "," + Math.round(p.y) + "," + Math.round(p.z) + ")";
                if (u.isAlive) {
                    const ai = GetAI(u);
                    let tgt = null;
                    let src = "";
                    if (ai.air && ai.air.closestAliveTarget) { tgt = ai.air.closestAliveTarget; src = "air"; }
                    else if (ai.ground && ai.ground.attackTarget) { tgt = ai.ground.attackTarget; src = "gnd"; }
                    if (tgt) {
                        const tp = tgt.transform.position;
                        const dx = tp.x - p.x, dy = tp.y - p.y, dz = tp.z - p.z;
                        const dist = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));
                        line += " tgt[" + src + "]=" + tgt.name + " dist=" + dist;
                    } else {
                        line += " tgt=none";
                    }
                }
                lines += "\n" + line;
            }
            CS.UnityEngine.Debug.Log(lines);
        } catch (e) {
            CS.UnityEngine.Debug.Log("[UBF] observer error: " + e);
        }
    };
}
