// ============================================
// Common Mission Utilities
// ============================================

// Weapon loadout slots for mission.spawnUnit's loadout argument
// (values mirror the C# LoadoutRole enum)
const LOADOUT = {
    AIR_TO_AIR: 1,
    AIR_TO_GROUND: 2,
    MULTIROLE: 3,
};

function randomRange(min, maxExclusive) {
    return Math.floor(Math.random() * (maxExclusive - min)) + min;
}

function randomPick(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function shuffleIndices(count) {
    const indices = [];
    for (let i = 0; i < count; i++) { indices.push(i); }
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = indices[i];
        indices[i] = indices[j];
        indices[j] = temp;
    }
    return indices;
}

function weightedPick(options) {
    let total = 0;
    for (const opt of options) { total += opt.weight; }
    let r = Math.random() * total;
    for (const opt of options) {
        r -= opt.weight;
        if (r <= 0) { return opt; }
    }
    return options[options.length - 1];
}

const timePool = [
    { time: [5, 0],   weight: 2 },
    { time: [6, 0],   weight: 2 },
    { time: [9, 0],   weight: 15 },
    { time: [13, 0],  weight: 15 },
    { time: [16, 0],  weight: 15 },
    { time: [18, 0],  weight: 2 },
    { time: [19, 0],  weight: 2 },
    { time: [21, 0],  weight: 2 },
    { time: [0, 0],   weight: 1 },
];

const weatherPool = [
    { name: "Clear Sky",  weight: 2 },
    { name: "Cloudy 0",   weight: 25 },
    { name: "Cloudy 1",   weight: 20 },
    { name: "Cloudy 2",   weight: 15 },
    { name: "Cloudy 3",   weight: 8 },
    { name: "Foggy",      weight: 2 },
    { name: "Rain",       weight: 2 },
    { name: "Storm",      weight: 2 },
    { name: "Snow",       weight: 2 },
];
