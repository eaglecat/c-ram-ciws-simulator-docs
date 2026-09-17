// MissionFormatVersion: 1
// Description: 1 vs 4 dogfight over Mostar — shoot down all four F-15 Eagles.
// ============================================
// ACE COMBAT — 1 vs 4 dogfight over Mostar
// Player: your equipped jet (Blue team).
// Enemy: 4x F-15 Eagle (Red team), forced into Dogfight so they
//        pursue the player instead of the default ground-attack AI.
// Win: shoot down all four F-15s.
// ============================================

const TEAM_BLUE = 4; // player
const TEAM_RED = 3;  // enemies

async function Init() {
    mission.setPlayerType("Aircraft", TEAM_BLUE);
    mission.setWinCondition("EliminateAllEnemies");
    mission.setTime(14, 0);
    mission.setWeather("Clear Sky");
    await mission.loadMap("Mostar");
}

function SpawnUnits() {
    // Explicit enemy placement — head-on merge with the player.
    // The player spawns at ~(123, 1365, 6516) facing -Z. The default air spawn
    // point faces -Z too, so the enemy flight would start with its back to the
    // player and stall trying to whip around 180deg. Instead we hand-place the
    // four F-15s ahead of the player (lower Z) facing +Z (rotY 0), so both
    // sides begin pointed at each other. Altitude is held at 1350m — above the
    // ~1235m ridge line in this corridor, just under the player for a slight
    // height advantage.
    const enemies = [
        { x: -600, y: 1350, z: 4000, rotY: 0 },
        { x: -200, y: 1350, z: 4150, rotY: 0 },
        { x:  200, y: 1350, z: 4150, rotY: 0 },
        { x:  600, y: 1350, z: 4000, rotY: 0 },
    ];
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        mission.spawnUnit("f-15", e.x, e.y, e.z, e.rotY, TEAM_RED, false, 1.0, 1.0);
    }

    // The rest only makes sense during real gameplay.
    if (!mission.isGameplay) return;

    // Enemy air units default to SmartCAS (ground attack) and would ignore the
    // player's jet. Force every AI fighter into Dogfight so they engage the
    // player. Target acquisition is automatic by opposing team (Red vs Blue).
    const $t = puer.$typeof;
    let playerUnit = null;
    if (CS.Player.instance) playerUnit = CS.Player.instance.GetUnit();

    const airUnits = CS.Stage.Instance.airUnits;
    for (let i = 0; i < airUnits.Count; i++) {
        const u = airUnits.get_Item(i);
        if (!u) continue;
        if (playerUnit && u.transform.root.GetInstanceID() === playerUnit.transform.root.GetInstanceID()) continue;
        const ai = u.transform.GetComponent($t(CS.FlightAIFighter));
        if (ai) {
            ai.combatMode = CS.CombatMode.Dogfight;
            ai.state = CS.FighterState.DogfightEngage;
        }
    }
}
