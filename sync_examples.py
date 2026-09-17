#!/usr/bin/env python3
"""Refresh the example scripts from the game repo.

Copies Docs/CustomMissions/*.js (and two built-in scripts) from the
Ground_vs_Air2 repo checked out next to this one into examples/src/, then
replaces every inlined listing in README.md that sits between
<!-- source: examples/src/X.js --> and <!-- /source --> markers.
"""
import os, re, shutil

GAME = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'Ground_vs_Air2')
SRC = os.path.join(GAME, 'Docs', 'CustomMissions')
BUILTIN = os.path.join(GAME, 'Assets', 'a6GameData', 'Missions')
DST = 'examples/src'
NAMES = ["AirRace_Kuwait", "Tetris", "FlappyJet", "CRAMGolf", "Shooter1942", "AceCombat",
         "GulfWar_DesertStorm", "CinematicIntro_Demo", "DroneDefense",
         "CombinedArms_Island1", "Infantry20v20", "SoldierPlay_Demo", "FPVOperator", "Ground2GroundBattle"]

os.makedirs(DST, exist_ok=True)
for n in NAMES:
    shutil.copy(os.path.join(SRC, n + '.js'), os.path.join(DST, n + '.js'))
shutil.copy(os.path.join(BUILTIN, 'Classic_Ground2Air_Easy.js.txt'), os.path.join(DST, 'Classic_Ground2Air_Easy.js'))
shutil.copy(os.path.join(BUILTIN, 'Common.js.txt'), os.path.join(DST, 'Common.js'))

readme = open('README.md').read()
def refresh(m):
    path = m.group(1)
    code = open(path).read().rstrip('\n')
    return f'<!-- source: {path} -->\n```js\n{code}\n```\n<!-- /source -->'
readme, n = re.subn(r'<!-- source: ([^ ]+) -->\n```js\n.*?\n```\n<!-- /source -->', refresh, readme, flags=re.S)
open('README.md', 'w').write(readme)
print(f'copied {len(NAMES) + 2} files, refreshed {n} listings in README.md')
