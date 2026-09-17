// ============================================
// Infantry Battle 20 vs 20
//
// Pure infantry firefight: you + 19 allied riflemen against 20 enemy riflemen,
// two staggered lines per side, ~280m apart. No vehicles, no aircraft.
//
// All AI soldiers spawn with a 4x HP multiplier — at stock single-digit HP a
// 20-rifle exchange at this range wipes a side in ~10 seconds, which is not a
// game. You stay at 1 HP (Unit.Start resets the player's HP to PlayerMaxHp).
//
// YOU are one of the 20 — spawnUnit isPlayer seats you in a soldier (same as the
// Play As Infantry demo). Press EQUIP (Z) first to draw the rifle. One rifle
// round kills you (PlayerMaxHp = 1), so use your squad as cover and engage from
// the back line.
//
// Layout, relative to your ground start position:
//   YOU               1 soldier "ak", 15m behind your front line
//   YOUR FRONT LINE   10 allied soldiers at +40m
//   YOUR BACK LINE    9 allied soldiers at +25m
//   ENEMY FRONT LINE  10 soldiers at +320m, facing you
//   ENEMY BACK LINE   10 soldiers at +335m
// Kill all 20 to win.
// ============================================

const TEAM_ALLY = 1;   // Ground
const TEAM_ENEMY = 2;  // Air (the enemy side used by the other infantry demos)

const SQUAD_SPACING = 9;
const ALLY_FRONT = 40;
const ALLY_BACK = 25;
const ENEMY_FRONT = 320;
const ENEMY_BACK = 335;

async function Init() {
    mission.setPlayerType("Ground", TEAM_ALLY);
    mission.setWinCondition("EliminateAllEnemies");
    mission.setTime(9, 30);
    mission.setWeather("Clear Sky");
    await mission.loadMap("Mostar");
}

// A line of riflemen centred on (centerX, centerZ), spread along X.
function spawnLine(count, centerX, centerZ, rotY, team) {
    const startX = centerX - ((count - 1) * SQUAD_SPACING) / 2;
    for (let i = 0; i < count; i++) {
        const x = startX + i * SQUAD_SPACING;
        const z = centerZ;
        const y = mission.getTerrainHeight(x, z);
        mission.spawnUnit("soldier", x, y, z, rotY, team, false, 4.0, 1.0, "ak");
    }
}

function SpawnUnits() {
    const sp = mission.getPlayerGroundStartPosition();
    const rotY = mission.getPlayerGroundStartRotY();

    // You, behind your own lines. isPlayer = true hands this soldier to the
    // player and removes the ground vehicle setPlayerType spawned.
    const py = mission.getTerrainHeight(sp.x, sp.z + 10);
    mission.spawnUnit("soldier", sp.x, py, sp.z + 10, rotY, TEAM_ALLY, true, 1.0, 1.0, "ak");

    // Back lines sit half a step sideways so the rear rank shoots through the gaps
    // instead of into its own front rank's backs.
    const stagger = SQUAD_SPACING / 2;

    // Your side: 10 + 9 = 19 riflemen.
    spawnLine(10, sp.x, sp.z + ALLY_FRONT, rotY, TEAM_ALLY);
    spawnLine(9, sp.x + stagger, sp.z + ALLY_BACK, rotY, TEAM_ALLY);

    // Enemy side: 10 + 10 = 20 riflemen, facing you.
    spawnLine(10, sp.x, sp.z + ENEMY_FRONT, rotY + 180, TEAM_ENEMY);
    spawnLine(10, sp.x + stagger, sp.z + ENEMY_BACK, rotY + 180, TEAM_ENEMY);
}
