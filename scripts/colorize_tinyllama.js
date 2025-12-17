const fs = require('fs');
const path = require('path');

// Configuration
const INPUT_FILE = path.join(__dirname, '../public/crystals/tinyllama/activation_consciousness.ply');
const OUTPUT_FILE = path.join(__dirname, '../public/crystals/tinyllama/structure_layers.ply');

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

// Full Spectrum Color (Rainbow) - Matches Standard Models (Red/Yellow Bottom -> Purple Top)
function getLayerColor(y, minY, maxY) {
  let t = (y - minY) / (maxY - minY);
  t = Math.max(0, Math.min(1, t));

  // Standard Model Spectrum:
  // Bottom (0.0): Red/Yellow
  // Top (1.0): Blue/Purple
  // Hue: 0.0 (Red) -> 0.75 (Purple)
  const hue = t * 0.75;

  // High saturation for vibrant glow
  const saturation = 0.9;
  const value = 1.0;

  return hsvToRgb(hue, saturation, value);
}

// Jitter amount to break the grid artifacts and create "cloud" glow
const JITTER = 0.002;

function processPly() {
  console.log(`💎 Reading authentic geometry from ${INPUT_FILE}...`);

  try {
    const data = fs.readFileSync(INPUT_FILE, 'utf8');
    const lines = data.split('\n');

    let headerEnded = false;
    const vertices = [];
    const edges = [];

    // simple parsing
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
        if (parts.length === 6 || parts.length === 3) {
          // Likely vertex
          const xBase = parseFloat(parts[0]);
          const y = parseFloat(parts[1]);
          const zBase = parseFloat(parts[2]);

          if (!isNaN(xBase)) {
            // Apply Jitter for Organic Cloud Look
            const x = xBase + (Math.random() - 0.5) * JITTER;
            const z = zBase + (Math.random() - 0.5) * JITTER;
            vertices.push({ x, y, z });
          }
        } else if (parts.length === 2) {
          const u = parseInt(parts[0]);
          const v = parseInt(parts[1]);
          if (!isNaN(u)) edges.push({ u, v });
        }
      }
    }
    console.log(`READ: ${vertices.length} vertices, ${edges.length} edges.`);

    // Find Bounds for Coloring
    let minY = Infinity, maxY = -Infinity;
    vertices.forEach(v => {
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    });

    console.log(`Bounds Y: ${minY.toFixed(4)} to ${maxY.toFixed(4)}`);

    // Colorize
    const coloredVertices = vertices.map(v => {
      const c = getLayerColor(v.y, minY, maxY);
      return { ...v, ...c };
    });

    // Write
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
    fs.writeFileSync(OUTPUT_FILE, content);
    console.log(`✨ Saved Authentic Colorized Model to ${OUTPUT_FILE}`);

  } catch (err) {
    console.error("Error processing PLY:", err);
  }
}

processPly();
