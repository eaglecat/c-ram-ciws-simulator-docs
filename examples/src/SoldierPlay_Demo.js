// ============================================
// Play As Infantry (Soldier) — Demo
//
// Puts YOU on foot instead of in a vehicle, to exercise the infantry mobile HUD:
// move stick, EQUIP / SPRINT / CROUCH / JUMP, ADS, fire.
//
// How the player becomes a soldier:
//   mission.spawnUnit("soldier", x, y, z, rotY, team, true, 1.0, 1.0, "ak")
//                                                     ^^^^ isPlayer
// spawnUnit's isPlayer flag seats you in whatever it spawns, so no new player
// type is needed — setPlayerType stays "Ground" and the vehicle it spawns is
// replaced the moment this soldier takes over.
//
// FIRST THING TO DO IN GAME: press EQUIP (or Z on keyboard) to draw the rifle.
// A soldier starts with the weapon holstered; ADS and fire do nothing until it
// is out.
//
// WHY THE ENEMIES CARRY STINGERS
// The soldier prefab has PlayerMaxHp = 1, so one rifle round kills you, and a
// mission cannot raise it (Unit.Start resets the player's HP to PlayerMaxHp,
// which overrides the spawn hpMultiplier). Enemy riflemen would end the round
// before you finished reading the HUD. Stinger soldiers are anti-air: they hold
// their ground and track you but never launch at a man on foot, so you get a
// winnable round to actually drive the controls with.
// Want a real firefight? Raise PlayerMaxHp on Soldier2_Code_LOD, then swap
// ENEMY_WEAPON below to "ak".
//
// Layout, all relative to your start position:
//   YOU              1 soldier, "ak"
//   AHEAD  (+100m)   4 enemy soldiers
//   AHEAD  (+170m)   2 enemy soldiers
// Kill all 6 to win.
// ============================================

const TEAM_ALLY = 1;   // Ground
const TEAM_ENEMY = 2;  // Air — the enemy side used by the other infantry demo

const ENEMY_WEAPON = "stinger";
const FIRST_LINE = 100;
const SECOND_LINE = 170;
const SQUAD_SPACING = 9;

async function Init() {
    mission.setPlayerType("Ground", TEAM_ALLY);
    mission.setWinCondition("EliminateAllEnemies");
    mission.setTime(10, 0);
    mission.setWeather("Clear Sky");
    await mission.loadMap("Mostar");
}

// A line of soldiers centred on (centerX, centerZ), spread along X.
function spawnSquad(count, centerX, centerZ, rotY, team, weaponId) {
    const startX = centerX - ((count - 1) * SQUAD_SPACING) / 2;
    for (let i = 0; i < count; i++) {
        const x = startX + i * SQUAD_SPACING;
        const z = centerZ;
        const y = mission.getTerrainHeight(x, z);
        mission.spawnUnit("soldier", x, y, z, rotY, team, false, 1.0, 1.0, weaponId);
    }
}

function SpawnUnits() {
    const sp = mission.getPlayerGroundStartPosition();
    const rotY = mission.getPlayerGroundStartRotY();

    // You. isPlayer = true hands this soldier to the player and deletes the
    // ground vehicle that setPlayerType spawned a moment earlier.
    const py = mission.getTerrainHeight(sp.x, sp.z);
    mission.spawnUnit("soldier", sp.x, py, sp.z, rotY, TEAM_ALLY, true, 1.0, 1.0, "ak");

    // Enemy squads downrange, in two lines.
    spawnSquad(4, sp.x, sp.z + FIRST_LINE, rotY + 180, TEAM_ENEMY, ENEMY_WEAPON);
    spawnSquad(2, sp.x, sp.z + SECOND_LINE, rotY + 180, TEAM_ENEMY, ENEMY_WEAPON);
}
