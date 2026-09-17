// ============================================
// Gulf War 1991 — Operation Desert Storm
// Player: Coalition C-RAM crew defending a desert camp in Kuwait.
// Enemy: Iraqi air force dawn raid — MiG-29 escorts, Mirage strike
//        jets, Su-25 attackers and a Mi-24 gunship.
// ============================================

const TEAM_GROUND = 1;
const TEAM_AIR = 2;

async function Init() {
    mission.setPlayerType("Ground", TEAM_GROUND);
    mission.setWinCondition("EliminateAllEnemies");
    mission.setTime(5, 40);
    mission.setWeather("Clear Sky");
    await mission.loadMap("Kuwait");
}

function SpawnUnits() {
    // Iraqi raid package, staggered in depth so they arrive in sequence
    const raid = ["mig-29", "mig-29", "mirage-2000", "mirage-2000", "su-25", "su-25"];
    const airSp = mission.getAirSpawnPoint();
    const airRotY = mission.getAirSpawnPointRotY();
    for (let i = 0; i < raid.length; i++) {
        const x = airSp.x + (i * 120) - (raid.length * 60);
        const z = airSp.z + (i * 800);
        const terrainY = mission.getTerrainHeight(x, z);
        const y = Math.max(airSp.y, terrainY + 250);
        mission.spawnUnit(raid[i], x, y, z, airRotY, TEAM_AIR, false, 1.0, 1.0);
    }

    // Mi-24 gunship comes in low through the heli corridor
    const heliSp = mission.getHeliSpawnPoint();
    const heliRotY = mission.getHeliSpawnPointRotY();
    const heliY = Math.max(heliSp.y, mission.getTerrainHeight(heliSp.x, heliSp.z) + 80);
    mission.spawnUnit("mi-24", heliSp.x, heliY, heliSp.z, heliRotY, TEAM_AIR, false, 1.0, 1.0);

    // Coalition camp around the player
    const playerSp = mission.getPlayerGroundStartPosition();
    const playerRotY = mission.getPlayerGroundStartRotY();

    // Shilka escort at the first ground spawn point
    if (mission.getGroundSpawnPointCount() > 0) {
        const sp = mission.getGroundSpawnPoint(0);
        mission.spawnUnit("shilka", sp.x, sp.y, sp.z, mission.getGroundSpawnPointRotY(0), TEAM_GROUND, false, 1.0, 1.0);
    }

    // Soft camp targets: supply truck + humvees spread around the player
    const camp = ["hemtt", "humvee", "humvee"];
    for (let i = 0; i < camp.length; i++) {
        const angle = (i / camp.length) * Math.PI * 2 + 0.6;
        const dist = 45 + i * 8;
        const x = playerSp.x + Math.cos(angle) * dist;
        const z = playerSp.z + Math.sin(angle) * dist;
        const y = mission.getTerrainHeight(x, z);
        mission.spawnUnit(camp[i], x, y, z, playerRotY, TEAM_GROUND, false, 1.0, 1.0);
    }
}
