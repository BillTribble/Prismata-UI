const fs = require('fs');
const path = require('path');

/**
 * PRISMATA CRYSTAL POLISHER
 * 
 * Usage: node scripts/polish_crystal.js <input_file> [output_file]
 * 
 * Functions:
 * 1. Reads PLY geometry (x, y, z)
 * 2. Normalizes or Colors based on Y-height (Rainbow Spectrum)
 * 3. Adds Organic Jitter (Cloud Glow Effect)
 * 4. Saves as optimized PLY
 */

const JITTER = 0.002;
const SATURATION = 0.9;
const VALUE = 1.0;

// Helper: HSV to RGB
function hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }
    return { 
        r: Math.floor(r * 255), 
        g: Math.floor(g * 255), 
        b: Math.floor(b * 255) 
    };
}

function getLayerColor(y, minY, maxY) {
    let t = (y - minY) / (maxY - minY);
    t = Math.max(0, Math.min(1, t)); // Clamp
    
    // Standard Spectrum: Red/Yellow (Bottom) -> Purple/Blue (Top)
    // Hue: 0.0 (Red) -> 0.75 (Purple)
    const hue = t * 0.75;
    
    return hsvToRgb(hue, SATURATION, VALUE);
}

function polishCrystal(inputFile, outputFile) {
    console.log(`💎 Polishing Crystal: ${inputFile}`);
    
    if (!fs.existsSync(inputFile)) {
        console.error(`❌ Error: Input file not found: ${inputFile}`);
        process.exit(1);
    }

    try {
        const data = fs.readFileSync(inputFile, 'utf8');
        const lines = data.split('\n');
        
        let headerEnded = false;
        const vertices = [];
        const edges = [];
        
        for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            if (line === 'end_header') {
                headerEnded = true;
                continue;
            }
            if (!headerEnded) continue;
            
            const parts = line.split(/\s+/);
            if (parts.length >= 3) {
                // Heuristic Parsing
                const isVertex = (parts.length === 3 || parts.length === 6) && parts[0].includes('.');
                const isEdge = parts.length === 2 && !parts[0].includes('.');

                if (isVertex) {
                     const xBase = parseFloat(parts[0]);
                     const y = parseFloat(parts[1]);
                     const zBase = parseFloat(parts[2]);
                     if (!isNaN(xBase)) {
                        // Jitter
                        const x = xBase + (Math.random() - 0.5) * JITTER;
                        const z = zBase + (Math.random() - 0.5) * JITTER;
                        vertices.push({ x, y, z });
                     }
                } else if (isEdge) {
                     const u = parseInt(parts[0]);
                     const v = parseInt(parts[1]);
                     if (!isNaN(u)) edges.push({ u, v });
                }
            }
        }
        
        console.log(`   Geometry: ${vertices.length} vertices, ${edges.length} edges.`);
        
        // Bounds
        let minY = Infinity, maxY = -Infinity;
        vertices.forEach(v => {
            if (v.y < minY) minY = v.y;
            if (v.y > maxY) maxY = v.y;
        });
        
        // Colorize
        console.log(`   Applying Rainbow Spectrum (Y: ${minY.toFixed(2)} -> ${maxY.toFixed(2)})...`);
        const coloredVertices = vertices.map(v => {
            const c = getLayerColor(v.y, minY, maxY);
            return { ...v, ...c };
        });
        
        // Save
        const header = [
            'ply',
            'format ascii 1.0',
            `element vertex ${coloredVertices.length}`,
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

        const bodyVertices = coloredVertices.map(v =>
            `${v.x.toFixed(6)} ${v.y.toFixed(6)} ${v.z.toFixed(6)} ${v.r} ${v.g} ${v.b}`
        ).join('\n');

        const bodyEdges = edges.map(e =>
            `${e.u} ${e.v}`
        ).join('\n');

        const content = `${header}\n${bodyVertices}\n${bodyEdges}`;
        fs.writeFileSync(outputFile, content);
        console.log(`✨ Polished Crystal Saved: ${outputFile}`);

    } catch (err) {
        console.error("❌ Error processing file:", err);
        process.exit(1);
    }
}

// CLI Args
const args = process.argv.slice(2);
if (args.length < 1) {
    console.log("Usage: node scripts/polish_crystal.js <input.ply> [output.ply]");
    process.exit(0);
}

const input = args[0];
const output = args[1] || input.replace('.ply', '_polished.ply');

polishCrystal(input, output);
