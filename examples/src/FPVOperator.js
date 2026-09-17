// ============================================
// FPV Operator — play the soldier who flies the kamikaze drone
// Player: infantry with the FPV drone controller (soldierWeapon "fpv-drone").
// Hold the fire button to launch a drone: control and camera jump to it,
// dive it into a vehicle — the warhead pops, the airframe dies with it, and
// you are back in the soldier's boots. 5s later the next drone is ready.
// Targets: an unarmed convoy 450-700m out — they drive straight at you and
// WILL run you over, so stop them with drone strikes before they arrive.
// ============================================

const TEAM_PLAYER = 1;
const TEAM_ENEMY = 2;

async function Init() {
    mission.setPlayerType("Ground", TEAM_PLAYER);
    mission.setWinCondition("EliminateAllEnemies");
    mission.setTime(12, 0);
    mission.setWeather("Clear Sky");
    await mission.loadMap("Seoul");
}

function SpawnUnits() {
    const playerSp = mission.getPlayerGroundStartPosition();
    const px = playerSp.x;
    const pz = playerSp.z;
    const py = mission.getTerrainHeight(px, pz);

    // You: a soldier carrying a rifle AND the FPV drone controller — the
    // change-weapon button swaps between them.
    mission.spawnUnit("soldier", px, py, pz, 0, TEAM_PLAYER, true, 1.0, 1.0, "ak,fpv-drone");

    // Unarmed convoy in a ring, 450-700m out. Ground AI drives them straight
    // at the soldier — the mission is a race to break the convoy with drone
    // strikes before it rolls over you.
    const targets = ["humvee", "apc-2", "hemtt", "humvee", "apc-2", "hemtt"];
    for (let i = 0; i < targets.length; i++) {
        const angle = (i / targets.length) * Math.PI * 2;
        const dist = 450 + (i % 3) * 125; // 450 / 575 / 700m
        const x = px + Math.cos(angle) * dist;
        const z = pz + Math.sin(angle) * dist;
        const y = mission.getTerrainHeight(x, z);
        const rotY = Math.random() * 360;
        mission.spawnUnit(targets[i], x, y, z, rotY, TEAM_ENEMY, false, 1.0, 1.0);
    }
}
