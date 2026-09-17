// ============================================
// CINEMATIC INTRO DEMO — cutscene API example
//
// Shows how mission JS drives an in-game cutscene via
// CS.CinematicManager.Instance:
//   Begin()  → blocks player input, hides gameplay UI/HUD,
//              slides in letterbox bars, takes over the camera
//   FollowTransform / SetCamera / MoveCamera → shot control
//   ShowSubtitle / PlayBGM / PlaySound      → dialogue + audio
//   End()    → restores everything, camera blends back
//
// Scenario: enemy raid inbound. Intro cutscene shows the lead
// jet, then sweeps back to the player's C-RAM before combat.
// ============================================

const TEAM_GROUND = 1;
const TEAM_AIR = 2;

async function Init() {
    mission.setPlayerType("Ground", TEAM_GROUND);
    mission.setWinCondition("EliminateAllEnemies");
    mission.setTime(6, 10);
    mission.setWeather("Clear Sky");
    await mission.loadMap("Kuwait");
}

function SpawnUnits() {
    const raid = ["mig-29", "mig-29", "su-25"];
    const airSp = mission.getAirSpawnPoint();
    const airRotY = mission.getAirSpawnPointRotY();
    for (let i = 0; i < raid.length; i++) {
        const x = airSp.x + (i * 150) - 150;
        const z = airSp.z + (i * 600);
        const terrainY = mission.getTerrainHeight(x, z);
        const y = Math.max(airSp.y, terrainY + 250);
        mission.spawnUnit(raid[i], x, y, z, airRotY, TEAM_AIR, false, 1.0, 1.0);
    }

    // Cutscenes only exist in real gameplay (the editor parse pass also calls SpawnUnits)
    if (!mission.isGameplay) return;
    runIntroCinematic();
}

function runIntroCinematic() {
    const UE = CS.UnityEngine;
    const $t = puer.$typeof;

    // Root parented to Stage => auto-cleanup on round end
    const root = new UE.GameObject("CinematicIntro");
    if (CS.Stage.Instance) {
        root.transform.SetParent(CS.Stage.Instance.transform, false);
    }
    const relay = root.AddComponent($t(CS.JsEventRelay));
    const cine = CS.CinematicManager.Instance;

    let t = 0;
    let step = 0;
    relay.onUpdate = (dt) => {
        t += dt;

        // Shot 1 (t=1s): chase-cam on the lead enemy jet
        if (step === 0 && t >= 1.0) {
            step = 1;
            let enemy = null;
            const units = CS.Stage.Instance.allUnits;
            for (let i = 0; i < units.Count; i++) {
                const u = units.get_Item(i);
                if (u && u.isAlive && u.team === CS.Team.Air) { enemy = u; break; }
            }
            cine.Begin();
            if (enemy) {
                cine.FollowTransform(enemy.transform, -35, 12, 45);
            }
            cine.ShowSubtitle("Intel: Enemy raid package inbound from the north.", 4.5);
        }

        // Shot 2 (t=5.5s): glide down to the player's vehicle
        if (step === 1 && t >= 5.5) {
            step = 2;
            const player = CS.Player.instance.currentUnit;
            const p = player.transform.position;
            cine.MoveCamera(p.x + 30, p.y + 18, p.z - 40, p.x, p.y + 2, p.z, 3.0);
            cine.ShowSubtitle("HQ: Man the C-RAM. Weapons free!", 4.0);
        }

        // t=10s: hand control back to the player
        if (step === 2 && t >= 10.0) {
            step = 3;
            cine.End();
            relay.onUpdate = null;
        }
    };
}
