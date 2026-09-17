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
// mission.spawnUnit(unitId, x, y, z, rotY, team, isPlayer, hpMultiplier, speedMultiplier, soldierWeapon, loadout)
// loadout = LOADOUT.AIR_TO_AIR / AIR_TO_GROUND / MULTIROLE (Common.js); omitted = MULTIROLE = factory armament
// mission.spawnObject(objectId, x, y, z, rotY, jsonParams?)
//
// --- Goal APIs ---
// mission.eliminateAll()      : Win by killing all enemies
// mission.survive(seconds)    : Win after surviving N seconds
// mission.manual()            : Manual control, then call win() or fail()
// mission.win() / mission.fail()
//
// --- Info APIs ---
// mission.enemyCount()        : Alive enemy count
// mission.allyCount()         : Alive ally count
// mission.listUnits()         : JSON array of unit IDs
// mission.listMaps()          : JSON array of map names
// mission.listWeather()       : JSON array of weather names
//
// --- Spawn Points ---
// mission.getAirSpawnPoint()           → {x, y, z}
// mission.getAirSpawnPointRotY()       → float
// mission.getGroundSpawnPoint(index)   → {x, y, z}
// mission.getGroundSpawnPointRotY(index) → float
// mission.getGroundSpawnPointCount()   → int
// mission.getHeliSpawnPoint()          → {x, y, z}
// mission.getHeliSpawnPointRotY()      → float
// mission.getNavalSpawnPoint(index)    → {x, y, z}
// mission.getNavalSpawnPointRotY(index) → float
// mission.getNavalSpawnPointCount()    → int
//
// --- Teams ---
// 0=None, 1=Ground(+Navy), 2=Air(+Heli), 3=Red, 4=Blue
//
// --- Weather ---
// Clear Sky, Cloudy 0, Cloudy 1, Cloudy 2, Cloudy 3, Foggy, Rain, Storm, Snow
//
// --- Units ---
// Aircraft : f-4-phantom, f-14-tomcat, f-15, f-16, fa-18-hornet,
//            mig-29, mirage-2000, su-25, su-27, su-30mkk, su-57,
//            a-10, j-8, j-20-chengdu
// Heli     : ah-64, ah-1, mi-24, mi-28, ka-52
// Ground   : 9k332-tor, shilka, hemtt, apc-2, humvee
// Drone    : shahed-136, fpv-drone
// Naval    : frigate, destroyer-class
// ============================================

// Classic_Ground2Air Mission Script
// Player: Ground unit, Enemies: Air/Heli/Drone, Allies: Ground units

// ============================================
// Unit Pools
// ============================================
const airEnemyPool = ["f-4-phantom", "f-15", "mig-29", "a-10", "mirage-2000", "su-57", "su-25"];
const heliPool = ["ah-64", "ah-1", "mi-24", "ka-52"];
const dronePool = ["shahed-136", "fpv-drone"];
// 9k332-tor weight kept low — its long-range SAM dominates engagements
const groundAllyPool = [
    { name: "9k332-tor", weight: 1 },
    { name: "shilka",    weight: 10 },
];
const groundAllyEasyPool = ["apc-2", "humvee"];

// ============================================
// Team Constants
// ============================================
const TEAM_GROUND = 1;
const TEAM_AIR = 2;

// ============================================
// Init
// ============================================
async function Init() {
    mission.setRevealAllEnemies(true);
    mission.setPlayerType("Ground", 1);
    await mission.loadMap("random");
    const t = weightedPick(timePool);
    mission.setTime(t.time[0], t.time[1]);
    const w = weightedPick(weatherPool);
    mission.setWeather(w.name);
}

// ============================================
// SpawnUnits - Classic_Ground2Air
// Mode 1: Jets 3-4 + Heli 0-2
// Mode 2: Drones 5-7
// Both: Ground allies 2-3
// ============================================
function SpawnUnits() {
    const groundCount = mission.getGroundSpawnPointCount();
    // First 10 rounds: jets+heli only (no Shahed drones).
    // After that: 30% chance of drones, but never two drone rounds in a row.
    let droneMode = false;
    if (mission.playCount() >= 10 && !mission.wasLastDrone()) {
        droneMode = Math.random() < 0.3;
    }
    mission.setLastDrone(droneMode);
    const mode = droneMode ? 1 : 0;
    let droneCountForMode = 0;

    if (mode === 0) {
        // Mode 1: Jets + Heli
        const airCount = randomRange(3, 5);
        const heliCount = randomRange(0, 3);

        const airSp = mission.getAirSpawnPoint();
        const airRotY = mission.getAirSpawnPointRotY();
        for (let i = 0; i < airCount; i++) {
            const unit = randomPick(airEnemyPool);
            const x = airSp.x + (i * 100) - (airCount * 50);
            const z = airSp.z + (i * 1000); // 1km staggered depth
            const terrainY = mission.getTerrainHeight(x, z);
            const y = Math.max(airSp.y, terrainY + 200);
            mission.spawnUnit(unit, x, y, z, airRotY, TEAM_AIR, false, 1.0, 1.0, "", LOADOUT.AIR_TO_GROUND);
        }

        if (heliCount > 0) {
            const heliSp = mission.getHeliSpawnPoint();
            const heliRotY = mission.getHeliSpawnPointRotY();
            for (let i = 0; i < heliCount; i++) {
                const heli = randomPick(heliPool);
                const x = heliSp.x + (i * 100) - (heliCount * 50);
                const z = heliSp.z + (i * 500); // 500m staggered depth
                const terrainY = mission.getTerrainHeight(x, z);
                const y = Math.max(heliSp.y, terrainY + 100);
                mission.spawnUnit(heli, x, y, z, heliRotY, TEAM_AIR, false, 1.0, 1.0, "", LOADOUT.AIR_TO_GROUND);
            }
        }
    } else {
        // Mode 2: Drones
        const droneCount = randomRange(5, 8);
        droneCountForMode = droneCount;

        const airSp = mission.getAirSpawnPoint();
        const airRotY = mission.getAirSpawnPointRotY();
        const dronePlayerSp = mission.getPlayerGroundStartPosition();
        // Direction from player toward the air spawn point — FPV drones come in
        // from the same side as the Shaheds, just much closer.
        let dirX = airSp.x - dronePlayerSp.x;
        let dirZ = airSp.z - dronePlayerSp.z;
        const dirLen = Math.sqrt(dirX * dirX + dirZ * dirZ);
        dirX /= dirLen;
        dirZ /= dirLen;
        let fpvIndex = 0;
        for (let i = 0; i < droneCount; i++) {
            const unit = randomPick(dronePool);
            if (unit === "fpv-drone") {
                // Quadcopter FPV drone is slow — spawn 700m+ out instead of at the
                // far air spawn point so it reaches the battle in time.
                const spawnDist = 700 + fpvIndex * 150;
                fpvIndex++;
                const x = dronePlayerSp.x + dirX * spawnDist + randomRange(-60, 61);
                const z = dronePlayerSp.z + dirZ * spawnDist + randomRange(-60, 61);
                const terrainY = mission.getTerrainHeight(x, z);
                const y = terrainY + 100 + randomRange(0, 41);
                const rotY = Math.atan2(dronePlayerSp.x - x, dronePlayerSp.z - z) * 180 / Math.PI;
                mission.spawnUnit(unit, x, y, z, rotY, TEAM_AIR, false, 1.0, 1.0, "", LOADOUT.AIR_TO_GROUND);
                continue;
            }
            const x = airSp.x + randomRange(-50, 51);
            const z = airSp.z + (i * 500); // 500m staggered depth for sequential arrival
            // Clear terrain: use max(airSp.y, terrainHeight + 200) to avoid mountain collisions
            const terrainY = mission.getTerrainHeight(x, z);
            const y = Math.max(airSp.y, terrainY + 200);
            mission.spawnUnit(unit, x, y, z, airRotY, TEAM_AIR, false, 1.0, 1.0, "", LOADOUT.AIR_TO_GROUND);
        }
    }

    // Combat ally (0-1) at spawn point
    const combatAllyCount = randomRange(0, 2);
    const groundIndices = shuffleIndices(groundCount);
    for (let i = 0; i < combatAllyCount && i < groundIndices.length; i++) {
        const unit = weightedPick(groundAllyPool).name;
        const idx = groundIndices[i];
        const sp = mission.getGroundSpawnPoint(idx);
        const spRotY = mission.getGroundSpawnPointRotY(idx);
        mission.spawnUnit(unit, sp.x, sp.y, sp.z, spRotY, TEAM_GROUND, false, 1.0);
    }

    // Non-combat allies near player, spread around within 20m.
    // In drone mode: always spawn more easy allies than drones so Shaheds have
    // plenty of soft targets to split up on.
    let easyAllyCount = randomRange(2, 4);
    if (droneCountForMode > 0) {
        easyAllyCount = droneCountForMode + randomRange(1, 3);
    }
    const playerSp = mission.getPlayerGroundStartPosition();
    const playerRotY = mission.getPlayerGroundStartRotY();
    const angleSlots = Math.max(8, easyAllyCount);
    const angles = shuffleIndices(angleSlots);
    for (let i = 0; i < easyAllyCount; i++) {
        const unit = randomPick(groundAllyEasyPool);
        const angle = (angles[i] / angleSlots) * Math.PI * 2;
        const dist = 40 + randomRange(0, 21); // 40-60m
        const x = playerSp.x + Math.cos(angle) * dist;
        const z = playerSp.z + Math.sin(angle) * dist;
        const y = mission.getTerrainHeight(x, z);
        mission.spawnUnit(unit, x, y, z, playerRotY, TEAM_GROUND, false, 1.0);
    }
}
