const fs = require('fs');
const path = require('path');

// Scale Factor to match existing models (which are very small, ~0.2 - 1.0 range)
const SCALE = 0.05;
const CRYSTAL_DIR = path.join(__dirname, '../public/crystals');

// Utilities
function writePly(filename, vertices, edges) {
    const header = [
        'ply',
        'format ascii 1.0',
        `element vertex ${vertices.length}`,
        'property float x',
        'property float y',
        'property float z',
        'property uchar red',
        'property uchar green',
        'property uchar blue',
        `element edge ${edges.length}`,
        'property int vertex1',
        'property int vertex2',
        'end_header'
    ].join('\n');

    const bodyVertices = vertices.map(v =>
        `${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)} ${Math.floor(v.r)} ${Math.floor(v.g)} ${Math.floor(v.b)}`
    ).join('\n');

    const bodyEdges = edges.map(e =>
        `${e.u} ${e.v}`
    ).join('\n');

    const content = `${header}\n${bodyVertices}\n${bodyEdges}`;
    fs.writeFileSync(filename, content);
}

function randFloat(min, max) {
    return Math.random() * (max - min) + min;
}

// ---------------------------------------------------------
// 1. TinyLlama (Dense Spiral) - 22 Layers
// ---------------------------------------------------------
async function generateTinyLlama() {
    console.log("💎 Generating TinyLlama Structure...");
    const vertices = [];
    const edges = [];

    // TinyLlama: A Dense Spiral
    const layers = 22;
    const pointsPerLayer = 400; // Dense
    const count = layers * pointsPerLayer; // 8800 points

    for (let i = 0; i < count; i++) {
        const t = i / count; // 0 to 1

        // SPIRAL STRUCTURE
        const theta = i * 0.1;
        // Radius grows slightly then stabilizes
        const radius = (0.5 + (i / count) * 2.0) * SCALE * 10.0; // Scaled

        const x = Math.cos(theta) * radius;
        const z = Math.sin(theta) * radius;
        const y = (t * 20.0 - 10.0) * SCALE * 2.0; // Height spread

        // Color: Deep Purple to Cyan (Darker for Additive Blending)
        // Was: 100-255 range. Now: 10-50 range.
        const progress = i / count;
        const r = Math.floor((20 + Math.sin(t * Math.PI) * 10));
        const g = Math.floor(10 + progress * 20);
        const b = Math.floor(50);

        vertices.push({ x, y, z, r, g, b });

        // Sparse Edges (Helix connections)
        if (i > 0 && i % pointsPerLayer !== 0 && Math.random() > 0.7) {
            // Horizontal logic flow
            edges.push({ u: i - 1, v: i });
        }
        // Vertical simplified connection
        if (i > pointsPerLayer && Math.random() > 0.95) {
            edges.push({ u: i - pointsPerLayer, v: i });
        }
    }

    const outputDir = path.join(CRYSTAL_DIR, 'tinyllama');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    writePly(path.join(outputDir, 'structure_layers.ply'), vertices, edges);
    console.log(`✨ Saved ${path.join(outputDir, 'structure_layers.ply')}`);
}

// ---------------------------------------------------------
// 2. Mamba (State Space Double Helix)
// ---------------------------------------------------------


// Run
(async () => {
    try {

    } catch (err) {
        console.error("Error generating crystals:", err);
    }
})();
