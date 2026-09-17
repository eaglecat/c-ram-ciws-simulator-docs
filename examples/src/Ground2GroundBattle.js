// MissionFormatVersion: 1
// ============================================
// Mission Script v0.1
// ============================================
//
// --- Callbacks ---
// async function Init()      : Setup map, time, weather, playerType (required)
// function SpawnUnits()       : Spawn enemies and allies (required)
// function SpawnBoss()        : Boss variant spawn (optional)
// function OnUnitDead(unit)   : Called when any unit dies (optional)
// function OnGameEnd(won)     : Called on game end (optional)
//
// --- Init APIs ---
// await mission.loadMap("mapName")             : "random" for random map
// mission.setTime(hour, minute)                : hour 0-23, minute 0-59
// mission.setWeather("weatherName")
// mission.setPlayerType("type", team)          : Ground, Aircraft, Helicopter, Ship | team: 1=Ground 2=Air 3=Red 4=Blue
// mission.setWinCondition("type")              : EliminateAllEnemies, SurviveForTime, KillTargets, ReachDestination
// mission.setPlayerStartPosition("type", x, y, z, rotY)
//
// --- Spawn APIs ---
// mission.spawnUnit(unitId, x, y, z, rotY, team, isPlayer, hpMultiplier, speedMultiplier)
// mission.spawnObject(objectId, x, y, z, rotY, jsonParams?)
//
// --- Teams ---
// 0=None, 1=Ground(+Navy), 2=Air(+Heli), 3=Red, 4=Blue
// ============================================

// Ground2GroundBattle Mission Script
// Player: Ground unit, Enemies: Ground armor column, Allies: Ground units
// Enemy tanks advance on the player using the driver AI and hold at
// engagement range, so the fight comes to you.

// ============================================
// Unit Pools
// ============================================
const enemyArmorPool = [
    { name: "t-72",      weight: 5 },
    { name: "t-90a",     weight: 3 },
    { name: "type-99",   weight: 3 },
    { name: "m1-abrams", weight: 2 },
];
const enemyLightPool = ["apc", "apc-2", "humvee", "toyota-pickup"];

const allyArmorPool = [
    { name: "m1-abrams", weight: 4 },
    { name: "t-90a",     weight: 3 },
    { name: "type-99",   weight: 3 },
];
const allyLightPool = ["apc-2", "humvee"];

// ============================================
// Team Constants
// ============================================
const TEAM_GROUND = 1;
const TEAM_AIR = 2;

// ============================================
// Init
// ============================================
async function Init() {
    mission.setPlayerType("Ground", TEAM_GROUND);
    // Open desert: the driving AI has no pathfinding and the LOS check reads
    // buildings as terrain, so city maps stall the whole battle.
    await mission.loadMap("Kuwait");
    const t = weightedPick(timePool);
    mission.setTime(t.time[0], t.time[1]);
    const w = weightedPick(weatherPool);
    mission.setWeather(w.name);
}

// ============================================
// SpawnUnits - Ground2GroundBattle
// Enemies: MBTs 3-4 + light vehicles 2-3 at ground spawn points,
//          they close in on the player with the driving AI.
// Allies: tanks 1-2 at spawn points + light escorts 1-2 near player.
//
// Units spawn in a tight column behind each spawn point instead of a wide
// random scatter: a 30-60m scatter kept landing vehicles on buildings and
// riverbeds (city maps), where they flip on spawn and die instantly.
// Spawn points sit on drivable ground, so the column stays on it.
// ============================================

// Column slot i behind a spawn point facing rotY (degrees):
// 18m spacing straight back, +-3m lateral jitter.
// Y is the surface height; the spawner rests each vehicle's collider bottom
// on the surface, so no manual lift is needed here.
function columnSlot(sp, rotY, i) {
    const rad = rotY * Math.PI / 180;
    const fwdX = Math.sin(rad);
    const fwdZ = Math.cos(rad);
    const back = i * 18;
    const side = randomRange(-3, 4);
    const x = sp.x - fwdX * back + fwdZ * side;
    const z = sp.z - fwdZ * back - fwdX * side;
    return { x: x, y: mission.getTerrainHeight(x, z), z: z };
}

function SpawnUnits() {
    const playerSp = mission.getPlayerGroundStartPosition();
    const playerRotY = mission.getPlayerGroundStartRotY();

    // Sort spawn points by distance from the player: enemies take the far ones
    // (so the armor column has to advance on you), allies take the near ones.
    const groundCount = mission.getGroundSpawnPointCount();
    const byDistance = [];
    for (let i = 0; i < groundCount; i++) {
        const sp = mission.getGroundSpawnPoint(i);
        const dx = sp.x - playerSp.x;
        const dz = sp.z - playerSp.z;
        byDistance.push({ idx: i, d2: dx * dx + dz * dz });
    }
    byDistance.sort((a, b) => b.d2 - a.d2); // farthest first

    // Enemy armor column at the farthest spawn point, light vehicles trailing.
    // The column is pulled back extra distance behind the spawn point so the
    // battle opens with an approach march instead of an instant 2km gun duel
    // (the halt-fire doctrine stops them once they see a target inside 2km).
    const enemyIdx = byDistance[0].idx;
    const enemySp = mission.getGroundSpawnPoint(enemyIdx);
    const enemyRotY = mission.getGroundSpawnPointRotY(enemyIdx);
    const rad = enemyRotY * Math.PI / 180;
    let pullback = 900;
    while (pullback > 0) {
        const bx = enemySp.x - Math.sin(rad) * pullback;
        const bz = enemySp.z - Math.cos(rad) * pullback;
        if (mission.getTerrainHeight(bx, bz) != 0) {
            break;
        }
        pullback -= 100; // off the map: creep back toward the spawn point
    }
    const pulledSp = {
        x: enemySp.x - Math.sin(rad) * pullback,
        y: enemySp.y,
        z: enemySp.z - Math.cos(rad) * pullback,
    };
    const armorCount = randomRange(3, 5);
    const lightCount = randomRange(2, 4);
    for (let i = 0; i < armorCount; i++) {
        const unit = weightedPick(enemyArmorPool).name;
        const p = columnSlot(pulledSp, enemyRotY, i);
        mission.spawnUnit(unit, p.x, p.y, p.z, enemyRotY, TEAM_AIR, false, 1.0);
    }
    for (let i = 0; i < lightCount; i++) {
        const unit = randomPick(enemyLightPool);
        const p = columnSlot(pulledSp, enemyRotY, armorCount + i);
        mission.spawnUnit(unit, p.x, p.y, p.z, enemyRotY, TEAM_AIR, false, 1.0);
    }

    // Ally tank column at the spawn point closest to the player
    const allyIdx = byDistance[byDistance.length - 1].idx;
    const allySp = mission.getGroundSpawnPoint(allyIdx);
    const allyRotY = mission.getGroundSpawnPointRotY(allyIdx);
    const allyTankCount = randomRange(1, 3);
    for (let i = 0; i < allyTankCount; i++) {
        const unit = weightedPick(allyArmorPool).name;
        const p = columnSlot(allySp, allyRotY, i);
        mission.spawnUnit(unit, p.x, p.y, p.z, allyRotY, TEAM_GROUND, false, 1.0);
    }

    // Light escorts in column behind the player start
    const escortCount = randomRange(1, 3);
    for (let i = 0; i < escortCount; i++) {
        const unit = randomPick(allyLightPool);
        const p = columnSlot(playerSp, playerRotY, i + 1);
        mission.spawnUnit(unit, p.x, p.y, p.z, playerRotY, TEAM_GROUND, false, 1.0);
    }
}
