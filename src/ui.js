import { CrystalViewer, smartFetch, THREE } from './main.js';

// DOM Elements
const navList = document.getElementById('model-list');
const loader = document.getElementById('loader');
const toggleCompare = document.getElementById('compare-toggle');
const viewerContainer = document.getElementById('viewer-container');
const viewCompare = document.getElementById('view-compare');
let btnResume = null;

// Panels
const panelA = document.getElementById('panel-a');
const panelB = document.getElementById('panel-b');

const uiElements = {
  main: {
    superTitle: document.getElementById('model-name-a'),
    title: document.getElementById('crystal-title-a'),
    type: document.getElementById('crystal-type-a'),
    desc: document.getElementById('crystal-desc-a'),
    nodes: document.getElementById('meta-nodes-a'),
    links: document.getElementById('meta-links-a'),
    year: document.getElementById('model-year-a'),
  },
  compare: {
    superTitle: document.getElementById('model-name-b'),
    title: document.getElementById('crystal-title-b'),
    type: document.getElementById('crystal-type-b'),
    desc: document.getElementById('crystal-desc-b'),
    nodes: document.getElementById('meta-nodes-b'),
    links: document.getElementById('meta-links-b'),
    year: document.getElementById('model-year-b'),
  }
};

// State
// State
let isCompareMode = false;
let activeSlot = 'main'; // 'main' or 'compare'
let mainViewer = null;
let compareViewer = null;
let infoVisible = true;
let autoFPSEnabled = true;
window.targetFPS = 24;
let currentPalette = 'classic';
let isInverted = true;

const autonomyColors = {
  normal: {
    output: '#ff00ff',
    processing: '#00ff00',
    input: '#ff0000'
  },
  inverted: {
    output: '#90ee90',
    processing: '#ff00ff',
    input: '#00ffff'
  }
};

function updateAutonomyColors() {
  const colors = isInverted ? autonomyColors.inverted : autonomyColors.normal;
  const outputEl = document.querySelector('.autonomy-text.output-text');
  const processingEl = document.querySelector('.autonomy-text.processing-text');
  const inputEl = document.querySelector('.autonomy-text.input-text');
  if (outputEl) outputEl.style.color = colors.output;
  if (processingEl) processingEl.style.color = colors.processing;
  if (inputEl) inputEl.style.color = colors.input;
}

// Recording State
let isRecording = false;
let isPlaying = false;
let isPlaybackPaused = false;
let playbackIndex = 0;
let lastModelUrl = null;
let recordingBuffer = [];
let recordingInterval = null;
let recordingStartTime = 0;
let playbackTimeout = null;

function recordInteraction(type, value) {
  if (!isRecording) return;
  recordingBuffer.push({
    time: Date.now() - recordingStartTime,
    type,
    value
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Init Viewers
  mainViewer = new CrystalViewer('view-main');
  compareViewer = new CrystalViewer('view-compare');

  // Ghost Fader Logic
  const ghost = document.getElementById('size-ghost');
  const sizeSlider = document.getElementById('point-size-slider');

  if (ghost && sizeSlider) {
    mainViewer.onUpdateUI = (currentSize) => {
      const min = parseFloat(sizeSlider.min);
      const max = parseFloat(sizeSlider.max);

      // Ensure max is correct (it might change in DOM)
      // If necessary, we can hardcode 0.1 for now if DOM didn't update before this calls 
      // but user interaction drives this so DOM is usually ready. 

      const percent = ((currentSize - min) / (max - min)) * 100;

      // Clamp visuals
      let p = Math.max(0, Math.min(100, percent));
      ghost.style.left = `${p}%`;

      // Show/Hide based on difference from base
      if (Math.abs(currentSize - mainViewer.baseSize) > 0.0001) {
        ghost.classList.remove('hidden');
      } else {
        ghost.classList.add('hidden');
      }
    };

    mainViewer.onBaseSizeChange = (newBaseSize) => {
      sizeSlider.value = newBaseSize;
    };
    compareViewer.onBaseSizeChange = (newBaseSize) => {
      sizeSlider.value = newBaseSize;
    };
  }

  // 2. Load Gallery
  await loadGallery();
  setupControls();
  updateAutonomyColors();

  // Try to load default attract mode
  try {
    const attractRes = await fetch(`${import.meta.env.BASE_URL}prismata_attract_13.json`);

    if (attractRes.ok) {
      const data = await attractRes.json();
      if (Array.isArray(data) && data.length > 0) {
        recordingBuffer = data;
        if (btnRecord) btnRecord.classList.remove('hidden');
        if (btnSave) btnSave.classList.remove('hidden');
        console.log("✓ Attract mode loaded:", data.length, "events");

        // Auto-start playback
        setTimeout(() => {
          console.log("→ Auto-starting playback");
          startPlaybackSession();
        }, 1200);
      } else {
        console.warn("⚠ Attract mode file loaded but data is invalid");
      }
    } else {
      console.error("✗ Attract mode file not found (HTTP", attractRes.status, ")");
    }
  } catch (e) {
    console.error("✗ Failed to load attract mode:", e);
  }

  // Removed previous auto-start block

  // Playback Pause UI
  const pauseOverlay = document.getElementById('playback-pause-overlay');
  btnResume = document.getElementById('btn-resume-playback');
  const btnAbout = document.getElementById('btn-about');
  const aboutModal = document.getElementById('about-modal');
  const btnCloseAbout = document.getElementById('btn-close-about');

  if (btnAbout && aboutModal) {
    btnAbout.addEventListener('click', () => {
      aboutModal.classList.remove('hidden');
    });
  }

  if (btnCloseAbout && aboutModal) {
    btnCloseAbout.addEventListener('click', () => {
      aboutModal.classList.add('hidden');
    });
    // Click outside to close
    aboutModal.addEventListener('click', (e) => {
      if (e.target === aboutModal) {
        aboutModal.classList.add('hidden');
      }
    });
  }

  // Filter Accordion
  const btnToggleFilters = document.getElementById('btn-toggle-filters');
  const filterContent = document.getElementById('filter-content');
  if (btnToggleFilters && filterContent) {
    btnToggleFilters.addEventListener('click', () => {
      btnToggleFilters.classList.toggle('open');
      filterContent.classList.toggle('open');
    });
  }

  // Timeline Button
  const btnTimeline = document.getElementById('btn-timeline');
  if (btnTimeline) {
    btnTimeline.addEventListener('click', () => {
      const overlay = document.getElementById('timeline-overlay');
      if (overlay) overlay.classList.remove('hidden');
    });
  }



  if (btnResume) {
    btnResume.addEventListener('click', () => {
      resumePlayback();
    });
  }

  // Interruption Detection
  const handleInteraction = (e) => {
    // Ignore if it's the resume button OR the play button OR accordion controls OR info panel OR scrolling in models list
    if (e.target.closest('#btn-resume-playback') ||
      e.target.closest('#btn-play-attract') ||
      e.target.closest('.accordion-toggle') ||
      e.target.closest('.accordion-content') ||
      e.target.closest('.artifact-details') ||
      (e.type === 'wheel' && e.target.closest('#model-list'))) return;

    if (isPlaying && !isPlaybackPaused) {
      pausePlayback();
    }
  };
  window.addEventListener('mousedown', handleInteraction, true);
  window.addEventListener('wheel', handleInteraction, true);
  window.addEventListener('touchstart', handleInteraction, true);

  // 3. Setup Search & Filters
  setupSearch();

  // 4. Setup Slot Selection
  panelA.addEventListener('click', () => setActiveSlot('main'));
  panelB.addEventListener('click', () => setActiveSlot('compare'));

  // Initial State
  setActiveSlot('main');
});

// Filter State
const filterState = {
  query: '',
  tag: 'ALL'
};

function setupSearch() {
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', (e) => {
    filterState.query = e.target.value.toLowerCase();
    applyFilters();
  });
}

function setupTags(models) {
  const container = document.getElementById('filter-tags');
  if (!container) return;

  container.innerHTML = ''; // clear
  // Force specific order
  const types = new Set(['ALL', 'LLM']);
  models.forEach(m => types.add(m.type));

  types.forEach(type => {
    const btn = document.createElement('div');
    btn.className = 'filter-tag';
    if (type === 'ALL') btn.classList.add('active');
    btn.textContent = type;

    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-tag').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      filterState.tag = type;
      applyFilters();
    });

    container.appendChild(btn);
  });
}

function applyFilters() {
  const groups = document.querySelectorAll('.model-group');
  const { query, tag } = filterState;

  groups.forEach(group => {
    const groupTitle = group.querySelector('.model-title').textContent.toLowerCase();
    const items = group.querySelectorAll('.crystal-item');
    let hasVisibleItem = false;

    items.forEach(item => {
      const name = (item.dataset.name || '').toLowerCase();
      const desc = (item.dataset.desc || '').toLowerCase();
      const type = item.dataset.type;

      const matchesQuery = groupTitle.includes(query) || name.includes(query) || desc.includes(query);
      let matchesTag = (tag === 'ALL') || (type === tag);
      if (tag === 'LLM') {
        const llmTypes = ['Encoder', 'Decoder', 'Enc-Dec', 'Dense Decoder', 'CoT Decoder', 'MoE', 'Mobile'];
        matchesTag = llmTypes.includes(type);
      }

      if (matchesQuery && matchesTag) {
        item.style.display = 'block';
        hasVisibleItem = true;
      } else {
        item.style.display = 'none';
      }
    });

    if (hasVisibleItem) {
      group.style.display = 'block';
      if (query.length > 0 || tag !== 'ALL') group.classList.add('active');
      else group.classList.remove('active');
    } else {
      group.style.display = 'none';
    }

    if (query.length === 0 && tag === 'ALL') {
      group.style.display = 'block';
      group.classList.remove('active');
      if (group === groups[0]) group.classList.add('active');
    }
  });
}

function setActiveSlot(slot) {
  if (slot === 'compare' && !isCompareMode) return;
  activeSlot = slot;

  if (slot === 'main') {
    panelA.style.borderColor = '#00f3ff';
    panelA.style.boxShadow = '0 0 15px rgba(0, 243, 255, 0.2)';
    panelB.style.borderColor = 'rgba(0, 243, 255, 0.2)';
    panelB.style.boxShadow = 'none';
  } else {
    panelB.style.borderColor = '#00f3ff';
    panelB.style.boxShadow = '0 0 15px rgba(0, 243, 255, 0.2)';
    panelA.style.borderColor = 'rgba(0, 243, 255, 0.2)';
    panelA.style.boxShadow = 'none';
  }
}

async function loadGallery() {
  try {
    // Load Manifest
    console.log('Loading manifest...');
    const res = await smartFetch('./crystals/manifest.json');
    if (!res.ok) throw new Error(`Failed to load manifest: ${res.status} ${res.statusText}`);
    let models = await res.json();

    // Sort by Year (Descending: Recent -> Oldest)
    models.sort((a, b) => b.year - a.year);

    // Setup Tags based on loaded models
    setupTags(models);

    models.forEach((model, index) => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'model-group active';

      const groupTitle = document.createElement('div');
      groupTitle.className = 'model-title';
      // Year | Name
      groupTitle.innerHTML = `<span style="opacity:1; font-family:monospace; font-weight:300; margin-right:8px;">${model.year}</span> ${model.name}`;

      groupTitle.addEventListener('click', () => {
        groupDiv.classList.toggle('active');
      });
      groupDiv.appendChild(groupTitle);

      const contentDiv = document.createElement('div');
      contentDiv.className = 'group-content';

      model.crystals.forEach(crystal => {
        const item = document.createElement('div');
        item.className = 'crystal-item';
        item.dataset.url = `./${crystal.file}`;
        item.dataset.name = crystal.name;
        item.dataset.desc = crystal.desc;
        item.dataset.type = model.type;
        item.dataset.year = model.year;
        item.dataset.modelName = model.name; // Pass Model Name
        item.dataset.modelDesc = model.desc;
        item.dataset.modelId = model.id;

        item.innerHTML = `
                    <span class="item-name">${crystal.name}</span>
                `;

        item.addEventListener('click', () => {
          document.querySelectorAll('.crystal-item').forEach(el => el.classList.remove('active'));
          item.classList.add('active');
          handleLoadCrystal(item.dataset, activeSlot);

          recordInteraction('model-load', { url: item.dataset.url, slot: activeSlot });

          // Close mobile menu if open
          document.querySelector('.gallery-nav').classList.remove('active');
        });

        contentDiv.appendChild(item);
      });

      groupDiv.appendChild(contentDiv);
      navList.appendChild(groupDiv);
    });

    // Auto-select GoogleNet "The Lattice" if found, else first item
    setTimeout(() => {
      const items = Array.from(navList.querySelectorAll('.crystal-item'));
      const target = items.find(item =>
        item.dataset.name.includes('The Twin Spires') ||
        item.dataset.modelName.includes('CLIP')
      );
      if (target) {
        target.click();
        // Scroll to it?
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        // Pulse the model button on first load
        target.classList.add('model-flash');
        setTimeout(() => target.classList.remove('model-flash'), 6000);
      } else if (items.length > 0) {
        items[0].click();
        // Pulse the model button on first load
        items[0].classList.add('model-flash');
        setTimeout(() => items[0].classList.remove('model-flash'), 6000);
      }
    }, 500);

  } catch (err) {
    console.error("Failed to load manifest:", err);
    navList.innerHTML = `<div style="color:red; padding:1rem;">ERROR CONNECTING TO ARCHIVE<br>${err.message}</div>`;
  }
}

async function handleLoadCrystal(data, slot) {
  loader.classList.remove('hidden');

  const ui = slot === 'main' ? uiElements.main : uiElements.compare;
  const viewer = slot === 'main' ? mainViewer : compareViewer;

  if (ui.superTitle) ui.superTitle.textContent = data.modelName || 'UNKNOWN';
  if (ui.year) ui.year.textContent = data.year || '----';
  ui.title.textContent = data.name;

  // Track last model for resume
  if (slot === 'main') lastModelUrl = data.url;
  ui.type.textContent = data.type;

  try {
    // Before loading, capture current camera if recording and main
    let currentCam = null;
    if (isRecording && slot === 'main') {
      currentCam = {
        pos: mainViewer.camera.position.clone(),
        target: mainViewer.controls.target.clone()
      };
    }

    const stats = await viewer.loadCrystal(data.url);

    // After loading, if recording, capture target and animate
    if (isRecording && slot === 'main') {
      const targetCam = {
        pos: mainViewer.camera.position.clone(),
        target: mainViewer.controls.target.clone()
      };

      // Reset to current
      mainViewer.camera.position.copy(currentCam.pos);
      mainViewer.controls.target.copy(currentCam.target);
      mainViewer.controls.update();

      // Disable controls during animation
      mainViewer.controls.enabled = false;

      // Animate over 1 second (60 frames, ~16ms intervals)
      const startPos = currentCam.pos.clone();
      const startTarget = currentCam.target.clone();
      const endPos = targetCam.pos.clone();
      const endTarget = targetCam.target.clone();

      const steps = 60;
      let step = 0;

      function animate() {
        step++;
        const ratio = step / steps;
        mainViewer.camera.position.lerpVectors(startPos, endPos, ratio);
        mainViewer.controls.target.lerpVectors(startTarget, endTarget, ratio);
        mainViewer.controls.update();

        if (step < steps) {
          setTimeout(animate, 16);
        } else {
          // Re-enable controls after animation
          mainViewer.controls.enabled = true;
        }
      }
      animate();
    }

    ui.nodes.textContent = stats.nodes.toLocaleString();
    ui.links.textContent = stats.links.toLocaleString();

    let infoText = "";
    try {
      const res = await smartFetch(`./crystals/${data.modelId}/INFO.md`);
      if (res.ok) {
        const text = await res.text();
        // Vite fallback protection
        if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
          infoText = data.desc || "No description available.";
        } else {
          infoText = text;
        }
      }
      else infoText = data.desc;
    } catch (e) {
      infoText = data.desc;
    }

    ui.desc.innerHTML = `
            <div class="markdown-content">
                ${parseMarkdown(infoText)}
            </div>
            <br>
            <div style="font-size:0.7em; opacity:0.6;">SOURCE: ${data.url.split('/').pop()}</div>
        `;

  } catch (err) {
    ui.title.textContent = "LOAD ERROR";
    ui.desc.textContent = "Corrupted data.";
  } finally {
    loader.classList.add('hidden');
  }
}

function parseMarkdown(text) {
  if (!text) return '';
  // Remove redundant metadata
  text = text.replace(/^(\*\*Architecture:\*\*.*\n?)/gm, '');
  text = text.replace(/^(\*\*Shape:\*\*.*\n?)/gm, '');
  let html = text;

  // Normalize newlines
  html = html.replace(/\r\n/g, '\n');
  html = html.replace(/\\n/g, '\n');

  // 1. Structural
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#aee6f0;">$1</strong>');
  html = html.replace(/^#\s+(.*)$/gm, '');

  // 2. Headers (Global replacement because of possible leading whitespace issues or newlines)
  html = html.replace(/^##\s+(.*)$/gm, '<h4 style="color:#00f3ff; margin-top:15px; margin-bottom:5px; text-transform:uppercase;">$1</h4>');
  html = html.replace(/^###\s+(.*)$/gm, '<h5 style="color:#fff; margin-top:10px; margin-bottom:5px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:2px;">$1</h5>');

  // 3. Newlines LAST
  html = html.replace(/\n/gm, '<br>');

  // 4. Cleanup
  html = html.replace(/<\/h4><br>/g, '</h4>');
  html = html.replace(/<\/h5><br>/g, '</h5>');
  html = html.replace(/^(<br>)*/, '');
  html = html.replace(/(<br>)*$/, '');

  return html;
}

function setupControls() {
  const btnSpin = document.getElementById('btn-spin');
  const btnReset = document.getElementById('btn-reset');
  const btnToggleInfo = document.getElementById('btn-toggle-info');
  const btnPan = document.getElementById('btn-pan');


  if (btnPan) {
    btnPan.addEventListener('click', () => {
      const isActive = mainViewer.toggleAutoPan();
      btnPan.classList.toggle('active', isActive);
      // Removed exclusivity logic
    });
  }

  // Palette Menu Logic
  const paletteTrigger = document.getElementById('palette-trigger');
  const paletteMenu = document.getElementById('palette-menu');
  const paletteOptions = document.querySelectorAll('.palette-option');

  if (paletteTrigger && paletteMenu) {
    paletteTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      paletteMenu.classList.toggle('hidden');
    });

    // Add click listeners to legend labels
    const legendLabels = document.querySelectorAll('.legend-label');
    legendLabels.forEach(label => {
      label.addEventListener('click', (e) => {
        e.stopPropagation();
        // Trigger click on palette trigger to open menu
        paletteTrigger.click();
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', () => {
      paletteMenu.classList.add('hidden');
    });

    paletteOptions.forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const paletteName = opt.dataset.palette;
        currentPalette = paletteName;

        // Update both viewers
        if (mainViewer) mainViewer.setPalette(paletteName);
        if (compareViewer) compareViewer.setPalette(paletteName);

        // Update UI gradient bar
        paletteTrigger.className = `gradient-bar ${paletteName}`;
        paletteMenu.classList.add('hidden');
      });
    });

    // Initial load sync
    paletteTrigger.className = `gradient-bar ${currentPalette}`;
  }

  // Hook up Spin to disable Pan - REMOVED for independent control
  // if (btnSpin) ... removed

  if (btnSpin) {
    btnSpin.addEventListener('click', () => {
      const isActive = btnSpin.classList.toggle('active');
      mainViewer.setAutoRotate(isActive);
      compareViewer.setAutoRotate(isActive);
      btnSpin.textContent = isActive ? "AUTO-ROTATE: ON" : "AUTO-ROTATE: OFF";
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      mainViewer.resetView();
      compareViewer.resetView();
    });
  }

  if (btnToggleInfo) {
    document.getElementById('btn-toggle-info').addEventListener('click', () => {
      const panels = document.querySelectorAll('.artifact-details');
      // Assuming infoVisible is defined globally or in a scope accessible here
      // If not, this would need to be initialized, e.g., `let infoVisible = true;`
      // For now, faithfully applying the change as provided.
      infoVisible = !infoVisible;
      panels.forEach(p => p.style.opacity = infoVisible ? '1' : '0');
      document.getElementById('btn-toggle-info').textContent = infoVisible ? 'HIDE INFO' : 'SHOW INFO';

      setTimeout(() => {
        if (mainViewer) mainViewer.onResize();
        if (compareViewer) compareViewer.onResize();
      }, 300);
    });

    // Mobile Default: Hide Info
    if (window.innerWidth < 900) {
      document.querySelector('.ui-layer').classList.add('no-details');
      btnToggleInfo.textContent = "SHOW INFO";
    }
  }

  // About Modal Logic
  const btnAbout = document.getElementById('btn-about');
  const modal = document.getElementById('about-modal');
  const btnCloseModal = document.getElementById('btn-close-about');

  if (btnAbout && modal) {
    btnAbout.addEventListener('click', () => modal.classList.remove('hidden'));
    if (btnCloseModal) {
      btnCloseModal.addEventListener('click', () => modal.classList.add('hidden'));
    }
    // Close on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  }

  // Accordion handlers moved to later in setupControls to avoid duplication

  // Rotate Speed Slider
  const rotSpeedSlider = document.getElementById('rot-speed');
  if (rotSpeedSlider) {
    rotSpeedSlider.addEventListener('input', (e) => {
      const speed = parseFloat(e.target.value);
      if (mainViewer) mainViewer.setRotSpeed(speed);
      if (compareViewer) compareViewer.setRotSpeed(speed);
    });
  }

  // Pan Limits Sliders
  // Dual Range Slider Logic
  const rangeMin = document.getElementById('pan-limit-min');
  const rangeMax = document.getElementById('pan-limit-max');
  const rangeTrack = document.getElementById('pan-track');

  function updateDualSlider() {
    if (!rangeMin || !rangeMax || !rangeTrack) return;

    let minVal = parseFloat(rangeMin.value);
    let maxVal = parseFloat(rangeMax.value);

    // Prevent crossover
    if (minVal > maxVal - 1) {
      const temp = minVal;
      minVal = maxVal - 1;
      rangeMin.value = minVal;
    }

    const min = parseFloat(rangeMin.min);
    const max = parseFloat(rangeMin.max);

    // Update visual track
    const percentMin = ((minVal - min) / (max - min)) * 100;
    const percentMax = ((maxVal - min) / (max - min)) * 100;

    rangeTrack.style.left = percentMin + "%";
    rangeTrack.style.width = (percentMax - percentMin) + "%";

    // Update Viewers
    if (mainViewer) {
      mainViewer.setPanMin(minVal);
      mainViewer.setPanMax(maxVal);
    }
    if (compareViewer) {
      compareViewer.setPanMin(minVal);
      compareViewer.setPanMax(maxVal);
    }
  }

  if (rangeMin && rangeMax) {
    rangeMin.addEventListener('input', updateDualSlider);
    rangeMax.addEventListener('input', updateDualSlider);
    // Init
    updateDualSlider();
  }

  // Movement & PERF Section Toggles (Tabs)
  const btnMovement = document.getElementById('btn-movement');
  const btnPerf = document.getElementById('btn-perf');
  const movementSection = document.getElementById('movement-controls');
  const perfSection = document.getElementById('perf-controls');

  if (btnMovement && btnPerf && movementSection && perfSection) {
    btnMovement.addEventListener('click', () => {
      const isOpening = !btnMovement.classList.contains('open');

      // Toggle Movement
      btnMovement.classList.toggle('open', isOpening);
      movementSection.classList.toggle('open', isOpening);

      // Close Perf
      btnPerf.classList.remove('open');
      perfSection.classList.remove('open');
    });

    btnPerf.addEventListener('click', () => {
      const isOpening = !btnPerf.classList.contains('open');

      // Toggle Perf
      btnPerf.classList.toggle('open', isOpening);
      perfSection.classList.toggle('open', isOpening);

      // Close Movement
      btnMovement.classList.remove('open');
      movementSection.classList.remove('open');
    });

    // Initial Distance Multiplier Slider
    const initialDistanceSlider = document.createElement('div');
    initialDistanceSlider.className = 'control-group';
    initialDistanceSlider.innerHTML = `
      <label for="initial-distance-slider" class="control-label">Initial Distance <span id="initial-distance-display">0.9</span></label>
      <input type="range" id="initial-distance-slider" min="0.5" max="3.0" value="0.9" step="0.1">
    `;
    movementSection.appendChild(initialDistanceSlider);

    const initialDistanceSliderEl = document.getElementById('initial-distance-slider');
    if (initialDistanceSliderEl) {
      initialDistanceSliderEl.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (mainViewer) mainViewer.setInitialDistanceMultiplier(val);
        if (compareViewer) compareViewer.setInitialDistanceMultiplier(val);
        document.getElementById('initial-distance-display').textContent = val.toFixed(1);
        recordInteraction('setting', { id: 'initial-distance-slider', val: val });
      });
    }
  }

  // Auto FPS Toggle (Relocated to bottom of Perf)
  if (perfSection) {
    const autoFPSToggle = document.createElement('div');
    autoFPSToggle.className = 'control-group';
    autoFPSToggle.innerHTML = `
      <label for="auto-fps-checkbox" class="control-label">Auto FPS</label>
      <input type="checkbox" id="auto-fps-checkbox" checked>
    `;
    perfSection.appendChild(autoFPSToggle);

    const checkbox = document.getElementById('auto-fps-checkbox');
    if (checkbox) {
      checkbox.addEventListener('change', (e) => {
        autoFPSEnabled = e.target.checked;
      });
    }

    // Target FPS Slider
    const targetFPSSlider = document.createElement('div');
    targetFPSSlider.className = 'control-group';
    targetFPSSlider.innerHTML = `
      <label for="target-fps-slider" class="control-label">Target FPS <span id="target-fps-display">24</span></label>
      <input type="range" id="target-fps-slider" min="10" max="120" value="24" step="1">
    `;
    perfSection.appendChild(targetFPSSlider);

    const targetFPSSliderEl = document.getElementById('target-fps-slider');
    if (targetFPSSliderEl) {
      targetFPSSliderEl.addEventListener('input', (e) => {
        window.targetFPS = parseInt(e.target.value);
        document.getElementById('target-fps-display').textContent = e.target.value;
      });
    }

    // Font Switcher
    const fontRow = document.createElement('div');
    fontRow.className = 'control-row';
    fontRow.innerHTML = `
      <div class="control-group full-width">
        <label for="font-select">FONT SWITCHER</label>
        <select id="font-select">
          <option value="arimo">Arimo (Default)</option>
          <option value="inter">Inter</option>
          <option value="rajdhani">Rajdhani</option>
          <option value="ibm">IBM Plex Sans</option>
        </select>
      </div>
    `;
    perfSection.appendChild(fontRow);

    const orbitronRow = document.createElement('div');
    orbitronRow.className = 'control-row';
    orbitronRow.innerHTML = `
      <div class="control-group">
        <label>
          <input type="checkbox" id="replace-orbitron"> Also replace Orbitron
        </label>
      </div>
      <div class="control-group">
        <label>
          <input type="checkbox" id="keep-h1-orbitron" checked> Keep H1 as Orbitron
        </label>
      </div>
    `;
    perfSection.appendChild(orbitronRow);

    // copySettingsBtn
    const copySettingsBtn = document.createElement('button');
    copySettingsBtn.className = 'minimal-btn';
    copySettingsBtn.textContent = 'COPY SETTINGS';
    copySettingsBtn.style.marginTop = '10px';
    copySettingsBtn.addEventListener('click', () => {
      const settings = {
        panSpeed: parseFloat(document.getElementById('pan-speed').value),
        rotSpeed: parseFloat(document.getElementById('rot-speed').value),
        panMin: parseFloat(document.getElementById('pan-limit-min').value),
        panMax: parseFloat(document.getElementById('pan-limit-max').value),
        initialDistanceMultiplier: parseFloat(document.getElementById('initial-distance-slider').value),
        pointSize: parseFloat(document.getElementById('point-size-slider').value),
        lfoAmount: parseFloat(document.getElementById('lfo-slider').value),
        lfoSpeed: parseFloat(document.getElementById('lfo-speed').value),
        lineDist: parseFloat(document.getElementById('line-dist-slider').value),
        nodeDist: parseFloat(document.getElementById('node-dist-slider').value),
        lineDensity: parseFloat(document.getElementById('line-density-slider').value),
        nodeDensity: parseFloat(document.getElementById('node-density-slider').value),
        summarizeThin: parseFloat(document.getElementById('summarize-thin').value),
        viewHeight: parseFloat(document.getElementById('view-height').value),
        xorDensity: parseFloat(document.getElementById('xor-density-slider').value),
        nodeOpacity: parseFloat(document.getElementById('node-opacity-slider').value),
        pulse: document.getElementById('btn-toggle-pulse').classList.contains('active'),
        autoPan: document.getElementById('btn-pan').classList.contains('active'),
        autoRotate: document.getElementById('btn-spin').classList.contains('active'),
        targetFPS: targetFPS,
        autoFPS: autoFPSEnabled,
        palette: currentPalette,
        inverted: isInverted
      };
      const settingsJSON = JSON.stringify(settings, null, 2);
      navigator.clipboard.writeText(settingsJSON).then(() => {
        showToast('Settings copied to clipboard!');
      }).catch(err => {
        console.error('Failed to copy settings:', err);
        showToast('Failed to copy settings.', true);
      });
    });
    perfSection.appendChild(copySettingsBtn);

    // Font Switcher Logic
    const fontSelect = document.getElementById('font-select');
    const replaceOrbitron = document.getElementById('replace-orbitron');
    const keepH1 = document.getElementById('keep-h1-orbitron');
    const h1Element = document.querySelector('.logo-text h1');

    if (fontSelect && replaceOrbitron && keepH1 && h1Element) {
      const applyFont = () => {
        const font = fontSelect.value;
        const applyToHeader = replaceOrbitron.checked;
        const keepH1Orbitron = keepH1.checked;
        const root = document.documentElement.style;

        const fontMap = {
          rajdhani: 'Rajdhani, sans-serif',
          inter: 'Inter, sans-serif',
          arimo: 'Arimo, sans-serif',
          ibm: 'IBM Plex Sans, sans-serif'
        };

        root.setProperty('--font-body', fontMap[font] || 'Inter, sans-serif');
        root.setProperty('--font-mono', fontMap[font] || 'Inter, sans-serif');

        const headerFont = applyToHeader ? (fontMap[font] || 'Orbitron, sans-serif') : 'Orbitron, sans-serif';
        root.setProperty('--font-header', headerFont);

        if (keepH1Orbitron) {
          h1Element.style.fontFamily = 'Orbitron, sans-serif';
        } else {
          h1Element.style.fontFamily = headerFont;
        }
      };

      fontSelect.addEventListener('change', applyFont);
      replaceOrbitron.addEventListener('change', applyFont);
      keepH1.addEventListener('change', applyFont);

      // Initial application if needed, but defaults are set in CSS
    }
  }
}

// Record Attract Logic
const btnRecord = document.getElementById('btn-record');
const btnSave = document.getElementById('btn-save-attract');
const btnLoad = document.getElementById('btn-load-attract');

if (btnRecord) {
  btnRecord.addEventListener('click', () => {
    if (!isRecording) {
      // If playing, stop playback first
      if (isPlaying) {
        stopPlayback();
      } else {
        // If not playing and buffer exists, start playback
        if (recordingBuffer.length > 0) {
          startPlaybackSession();
          return;
        }
        // Else, start recording
      }
      // Start Recording
      isRecording = true;
      recordingBuffer = [];
      recordingStartTime = Date.now();
      btnRecord.textContent = "STOP RECORDING";
      btnRecord.classList.add('active');
      showToast("Recording session (clicks, camera, settings)...");

      // Disable cross-fade during recording for instant model switches
      if (mainViewer) mainViewer.enableCrossFade = false;
      if (compareViewer) compareViewer.enableCrossFade = false;

      // Record initial model state
      if (lastModelUrl) {
        recordInteraction('model-load', { url: lastModelUrl, slot: 'main' });
      }

      recordingInterval = setInterval(() => {
        if (mainViewer && mainViewer.camera && mainViewer.controls) {
          recordInteraction('camera', {
            pos: {
              x: parseFloat(mainViewer.camera.position.x.toFixed(3)),
              y: parseFloat(mainViewer.camera.position.y.toFixed(3)),
              z: parseFloat(mainViewer.camera.position.z.toFixed(3))
            },
            target: {
              x: parseFloat(mainViewer.controls.target.x.toFixed(3)),
              y: parseFloat(mainViewer.controls.target.y.toFixed(3)),
              z: parseFloat(mainViewer.controls.target.z.toFixed(3))
            }
          });
        }
      }, 100); // 10fps for demo efficiency
    } else {
      // Stop Recording
      isRecording = false;
      clearInterval(recordingInterval);
      btnRecord.textContent = "RECORD ATTRACT";
      btnRecord.classList.remove('active');

      // Re-enable cross-fade after recording
      if (mainViewer) mainViewer.enableCrossFade = true;
      if (compareViewer) compareViewer.enableCrossFade = true;

      if (recordingBuffer.length > 0) {
        if (btnRecord) btnRecord.classList.remove('hidden');
        if (btnSave) btnSave.classList.remove('hidden');
        const data = JSON.stringify(recordingBuffer);
        navigator.clipboard.writeText(data).then(() => {
          showToast("Session data copied to clipboard!");
        }).catch(err => {
          console.error("Failed to copy path:", err);
          showToast("Failed to copy session.", true);
        });
      }
    }
  });
}

if (btnSave) {
  btnSave.addEventListener('click', () => {
    if (recordingBuffer.length === 0) return;
    const blob = new Blob([JSON.stringify(recordingBuffer)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prismata_attract_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Attract mode file downloaded.");
  });
}

if (btnLoad) {
  btnLoad.addEventListener('click', () => {
    const input = prompt("PASTE ATTRACT JSON HERE:");
    if (!input) return;
    try {
      const data = JSON.parse(input);
      if (Array.isArray(data)) {
        recordingBuffer = data;
        if (btnRecord) btnRecord.classList.remove('hidden');
        if (btnSave) btnSave.classList.remove('hidden');
        showToast("Attract sequence loaded!");
      } else {
        showToast("Invalid data format.", true);
      }
    } catch (e) {
      showToast("Failed to parse JSON.", true);
    }
  });
}



function startPlaybackSession() {
  console.log("Starting attract playback session...");
  isPlaying = true;
  isPlaybackPaused = false;
  playbackIndex = 0;
  if (btnRecord) {
    btnRecord.textContent = "STOP ATTRACT";
    btnRecord.classList.add('active');
    btnRecord.classList.remove('hidden');
  }
  if (btnResume) btnResume.classList.add('hidden');
  showToast("Demo mode - interact to pause");

  startPlayback(0);
}

function stopPlayback() {
  isPlaying = false;
  isPlaybackPaused = false;
  if (playbackTimeout) clearTimeout(playbackTimeout);
  if (btnRecord) {
    btnRecord.textContent = "RECORD ATTRACT";
    btnRecord.classList.remove('active');
    btnRecord.classList.remove('hidden');
  }
  if (btnResume) btnResume.classList.add('hidden');

  // Ensure camera controls are re-enabled after playback stops
  if (mainViewer && mainViewer.controls) {
    mainViewer.controls.enabled = true;
    mainViewer.controls.enableRotate = true;
    mainViewer.controls.enableZoom = true;
    mainViewer.controls.enablePan = true;
  }

  showToast("Playback stopped.");
}

function pausePlayback() {
  console.log('Pausing playback');
  if (!isPlaying) return;
  isPlaybackPaused = true;
  if (playbackTimeout) clearTimeout(playbackTimeout);
  if (btnRecord) {
    btnRecord.textContent = "RECORD NEW";
    btnRecord.classList.remove('hidden');
  }
  if (btnResume) {
    console.log('Removing hidden from btnResume');
    btnResume.classList.remove('hidden');
    btnResume.style.fontWeight = 'bold';
    btnResume.classList.add('pulse-appear');
    btnResume.addEventListener('animationend', () => {
      btnResume.classList.remove('pulse-appear');
    }, { once: true });
  } else {
    console.log('btnResume is null');
  }

  // Ensure camera controls are enabled when playback is paused
  if (mainViewer && mainViewer.controls) {
    mainViewer.controls.enabled = true;
    mainViewer.controls.enableRotate = true;
    mainViewer.controls.enableZoom = true;
    mainViewer.controls.enablePan = true;
  }
}

function resumePlayback() {
  if (!isPlaying) return;
  isPlaybackPaused = false;
  if (btnResume) btnResume.classList.add('hidden');
  if (btnRecord) {
    btnRecord.classList.remove('hidden');
    btnRecord.textContent = "STOP ATTRACT";
  }
  showToast("Resuming playback...");

  // Resume from the model we were on
  if (lastModelUrl) {
    const item = Array.from(document.querySelectorAll('.crystal-item')).find(el => el.dataset.url === lastModelUrl);
    if (item) item.click();
  }

  startPlayback(playbackIndex);
}

function startPlayback(index) {
  playbackIndex = index;
  if (!isPlaying || isPlaybackPaused) return;

  if (index >= recordingBuffer.length) {
    // Check if recording has model switches - if not, stop instead of loop
    const hasModelLoads = recordingBuffer.some(event => event.type === 'model-load');
    if (!hasModelLoads) {
      // Stop playback for camera-only recordings
      stopPlayback();
      return;
    }

    // Loop: Restart with Twin Spires
    showToast("Looping playback...");
    const items = Array.from(navList.querySelectorAll('.crystal-item'));
    const target = items.find(item =>
      item.dataset.name.includes('The Twin Spires') ||
      item.dataset.modelName.includes('CLIP')
    );
    if (target) target.click();

    startPlayback(0);
    return;
  }

  const event = recordingBuffer[index];
  const nextEvent = recordingBuffer[index + 1];
  const delay = nextEvent ? (nextEvent.time - event.time) : 0;

  // Execute Event
  executePlaybackEvent(event, delay);

  playbackTimeout = setTimeout(() => {
    startPlayback(index + 1);
  }, delay);
}

function executePlaybackEvent(event, delay = 0) {
  switch (event.type) {
    case 'camera':
      if (mainViewer && mainViewer.camera && mainViewer.controls) {
        if (delay > 0) {
          // Animate camera move over delay time
          const startPos = mainViewer.camera.position.clone();
          const startTarget = mainViewer.controls.target.clone();
          const endPos = new THREE.Vector3(event.value.pos.x, event.value.pos.y, event.value.pos.z);
          const endTarget = new THREE.Vector3(event.value.target.x, event.value.target.y, event.value.target.z);

          const steps = Math.max(1, Math.floor(delay / 16)); // ~60fps
          let step = 0;

          function animate() {
            step++;
            const ratio = step / steps;
            mainViewer.camera.position.lerpVectors(startPos, endPos, ratio);
            mainViewer.controls.target.lerpVectors(startTarget, endTarget, ratio);
            mainViewer.controls.update();

            if (step < steps) {
              setTimeout(animate, 16);
            }
          }
          animate();
        } else {
          // Instant set for delay=0
          mainViewer.camera.position.set(event.value.pos.x, event.value.pos.y, event.value.pos.z);
          mainViewer.controls.target.set(event.value.target.x, event.value.target.y, event.value.target.z);
          mainViewer.controls.update();
        }
      }
      break;
    case 'model-load':
      const item = Array.from(document.querySelectorAll('.crystal-item')).find(el => el.dataset.url === event.value.url);
      if (item) {
        document.querySelectorAll('.crystal-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        handleLoadCrystal(item.dataset, event.value.slot);
        // Scroll to the model in the Models List panel
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Add bright neon flash to the button
        item.classList.add('model-flash');
        setTimeout(() => item.classList.remove('model-flash'), 6000);
      }
      break;
    case 'setting':
      const el = document.getElementById(event.value.id);
      if (el) {
        el.value = event.value.val;
        el.dispatchEvent(new Event('input'));
      }
      break;
    case 'btn-click':
      const btn = document.getElementById(event.value.id);
      if (btn) {
        if (event.value.id === 'btn-toggle-pulse') {
          // Force state match
          const isActive = btn.classList.contains('active');
          if (isActive !== event.value.active) btn.click();
        } else if (event.value.id === 'btn-node-blend' || event.value.id === 'btn-line-blend') {
          const currentMode = btn.textContent.toLowerCase();
          if (currentMode !== event.value.mode) btn.click();
        } else {
          btn.click();
        }
      }
      break;
  }
}

// Easter Egg Toggle
const btnEgg = document.getElementById('btn-easter-egg');
if (btnEgg) {
  btnEgg.addEventListener('click', () => {
    if (mainViewer) {
      const isActive = mainViewer.toggleEasterEgg();
      btnEgg.classList.toggle('active', isActive);

      if (isActive) {
        showToast("Lightcycle Arena: ONLINE");
      } else {
        showToast("Lightcycle Arena: OFFLINE", true);
      }
    }
  });
}

// Pulse Toggle
const btnPulse = document.getElementById('btn-toggle-pulse');
if (btnPulse) {
  btnPulse.addEventListener('click', () => {
    const isActive = btnPulse.classList.toggle('active');
    btnPulse.textContent = isActive ? "FLOW: ON" : "FLOW: OFF";
    if (mainViewer) mainViewer.setPulse(isActive);
    recordInteraction('btn-click', { id: 'btn-toggle-pulse', active: isActive });
  });
}

// Point Size Slider
const pointSizeSlider = document.getElementById('point-size-slider');
if (pointSizeSlider) {
  pointSizeSlider.addEventListener('input', (e) => {
    const size = parseFloat(e.target.value);
    if (mainViewer) mainViewer.setBaseSize(size);
    if (compareViewer) compareViewer.setBaseSize(size);
    recordInteraction('setting', { id: 'point-size-slider', val: size });
  });
}

// View Height Control
const heightSlider = document.getElementById('view-height');
if (heightSlider) {
  heightSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (mainViewer) mainViewer.setManualHeight(val);
    if (compareViewer) compareViewer.setManualHeight(val);
    recordInteraction('setting', { id: 'view-height', val: val });
  });
}

// LFO Slider
const lfoSlider = document.getElementById('lfo-slider');
if (lfoSlider) {
  lfoSlider.addEventListener('input', (e) => {
    const amount = parseFloat(e.target.value);
    if (mainViewer) mainViewer.setLFOAmount(amount);
    if (compareViewer) compareViewer.setLFOAmount(amount);
    recordInteraction('setting', { id: 'lfo-slider', val: amount });
  });
}

// LFO Speed Slider
const lfoSpeedSlider = document.getElementById('lfo-speed');
if (lfoSpeedSlider) {
  lfoSpeedSlider.addEventListener('input', (e) => {
    const speed = parseFloat(e.target.value);
    if (mainViewer) mainViewer.setLFOSpeed(speed);
    if (compareViewer) compareViewer.setLFOSpeed(speed);
    recordInteraction('setting', { id: 'lfo-speed', val: speed });
  });
}

// PERFORMANCE Property Sliders
const lineDistSlider = document.getElementById('line-dist-slider');
if (lineDistSlider) {
  lineDistSlider.addEventListener('input', (e) => {
    const dist = parseFloat(e.target.value);
    if (mainViewer) mainViewer.setLineDist(dist);
    if (compareViewer) compareViewer.setLineDist(dist);
    recordInteraction('setting', { id: 'line-dist-slider', val: dist });
  });
}

const nodeDistSlider = document.getElementById('node-dist-slider');
if (nodeDistSlider) {
  nodeDistSlider.addEventListener('input', (e) => {
    const dist = parseFloat(e.target.value);
    if (mainViewer) mainViewer.setNodeDist(dist);
    if (compareViewer) compareViewer.setNodeDist(dist);
    recordInteraction('setting', { id: 'node-dist-slider', val: dist });
  });
}

const lineDensitySlider = document.getElementById('line-density-slider');
if (lineDensitySlider) {
  lineDensitySlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (mainViewer) mainViewer.setLineDensity(val);
    if (compareViewer) compareViewer.setLineDensity(val);
    recordInteraction('setting', { id: 'line-density-slider', val: val });
  });
}

const nodeDensitySlider = document.getElementById('node-density-slider');
if (nodeDensitySlider) {
  nodeDensitySlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (mainViewer) mainViewer.setNodeDensity(val);
    if (compareViewer) compareViewer.setNodeDensity(val);
    recordInteraction('setting', { id: 'node-density-slider', val: val });
  });
}

const summarizeThinSlider = document.getElementById('summarize-thin');
if (summarizeThinSlider) {
  summarizeThinSlider.addEventListener('input', (e) => {
    const intensity = parseFloat(e.target.value);
    if (mainViewer) mainViewer.setThinning(intensity);
    if (compareViewer) compareViewer.setThinning(intensity);
  });
}

const xorDensitySlider = document.getElementById('xor-density-slider');
if (xorDensitySlider) {
  xorDensitySlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (mainViewer) mainViewer.setXorDensity(val);
    if (compareViewer) compareViewer.setXorDensity(val);
  });
}

// New Visual Controls
const colorInflSlider = document.getElementById('color-infl-slider');
if (colorInflSlider) {
  colorInflSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value) / 100;
    if (mainViewer) mainViewer.setColorInfluence(val);
    if (compareViewer) compareViewer.setColorInfluence(val);
  });
}

const lineOpacitySlider = document.getElementById('line-opacity-slider');
if (lineOpacitySlider) {
  lineOpacitySlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (mainViewer) mainViewer.setLineOpacity(val);
    if (compareViewer) compareViewer.setLineOpacity(val);
  });
}

const nodeSaturSlider = document.getElementById('node-satur-slider');
if (nodeSaturSlider) {
  nodeSaturSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (mainViewer) mainViewer.setNodeSaturation(val);
    if (compareViewer) compareViewer.setNodeSaturation(val);
  });
}

const nodeOpacitySlider = document.getElementById('node-opacity-slider');
if (nodeOpacitySlider) {
  nodeOpacitySlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (mainViewer) mainViewer.setNodeOpacity(val);
    if (compareViewer) compareViewer.setNodeOpacity(val);
  });
}

const btnNodeBlend = document.getElementById('btn-node-blend');
if (btnNodeBlend) {
  btnNodeBlend.addEventListener('click', () => {
    const isAdditive = btnNodeBlend.textContent === 'NORMAL';
    btnNodeBlend.textContent = isAdditive ? 'ADDITIVE' : 'NORMAL';
    const mode = isAdditive ? 'additive' : 'normal';
    if (mainViewer) mainViewer.setNodeBlending(mode);
    if (compareViewer) compareViewer.setNodeBlending(mode);
    recordInteraction('btn-click', { id: 'btn-node-blend', mode });
  });
}

const btnLineBlend = document.getElementById('btn-line-blend');
if (btnLineBlend) {
  btnLineBlend.addEventListener('click', () => {
    const isAdditive = btnLineBlend.textContent === 'NORMAL';
    btnLineBlend.textContent = isAdditive ? 'ADDITIVE' : 'NORMAL';
    const mode = isAdditive ? 'additive' : 'normal';
    if (mainViewer) mainViewer.setLineBlending(mode);
    if (compareViewer) compareViewer.setLineBlending(mode);
    recordInteraction('btn-click', { id: 'btn-line-blend', mode });
  });
}

const btnInvertInfluence = document.getElementById('btn-invert-influence');
if (btnInvertInfluence) {
  // Set initial state
  btnInvertInfluence.textContent = isInverted ? 'INVERTED (COMPLEMENTARY)' : 'DIRECT INFLUENCE';
  if (mainViewer) mainViewer.setInvertInfluence(isInverted);
  if (compareViewer) compareViewer.setInvertInfluence(isInverted);

  btnInvertInfluence.addEventListener('click', () => {
    isInverted = !isInverted;
    btnInvertInfluence.textContent = isInverted ? 'INVERTED (COMPLEMENTARY)' : 'DIRECT INFLUENCE';
    if (mainViewer) mainViewer.setInvertInfluence(isInverted);
    if (compareViewer) compareViewer.setInvertInfluence(isInverted);
    updateAutonomyColors();
  });
}

// File Upload Logic
const fileInput = document.getElementById('file-upload');
if (fileInput) {
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    console.log("Loading custom file:", url);

    // Force Main View logic
    setActiveSlot('main');

    mainViewer.loadCrystal(url).then(stats => {
      // Update UI
      if (uiElements.main.superTitle) uiElements.main.superTitle.textContent = "CUSTOM UPLOAD";
      uiElements.main.title.textContent = file.name.toUpperCase().replace('.PLY', '');
      uiElements.main.type.textContent = "USER DATA";
      uiElements.main.nodes.textContent = stats.nodes.toLocaleString();
      uiElements.main.links.textContent = stats.links.toLocaleString();
      uiElements.main.desc.innerHTML = "PREVISUALIZATION MODE<br><br>Loaded local artifact: " + file.name;

      // Close modal
      if (modal) modal.classList.add('hidden');
    }).catch(err => {
      alert("Failed to load PLY: " + err);
    });
  });
}




// Mobile Menu
const btnMobileMenu = document.getElementById('btn-mobile-menu');
if (btnMobileMenu) {
  btnMobileMenu.addEventListener('click', () => {
    document.querySelector('.gallery-nav').classList.toggle('active');
  });
}



toggleCompare.addEventListener('change', (e) => {
  isCompareMode = e.target.checked;
  if (isCompareMode) {
    viewCompare.classList.remove('hidden');
    viewerContainer.classList.add('split');
    panelB.classList.remove('hidden');
    setActiveSlot('compare');
    setTimeout(() => {
      mainViewer.onResize();
      compareViewer.onResize();
    }, 550);
  } else {
    viewCompare.classList.add('hidden');
    viewerContainer.classList.remove('split');
    panelB.classList.add('hidden');
    setActiveSlot('main');
    setTimeout(() => {
      mainViewer.onResize();
    }, 550);
  }
});

// Toast Helper
function showToast(msg, isAlert = false) {
  let toast = document.getElementById('toast-notification');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.className = 'toast-notification';
    document.body.appendChild(toast);
  }

  toast.textContent = msg;
  toast.classList.remove('alert');
  if (isAlert) toast.classList.add('alert');

  // Force reflow
  void toast.offsetWidth;

  toast.classList.add('show');

  if (window.toastTimeout) clearTimeout(window.toastTimeout);
  window.toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

// --- TIMELINE LOGIC ---

// Timeline Elements
const timelineOverlay = document.getElementById('timeline-overlay');
const timelineTrack = document.getElementById('timeline-track');
const timelineYear = document.getElementById('timeline-year');
const timelineTitle = document.getElementById('timeline-title');
const timelineDesc = document.getElementById('timeline-desc');
const btnPrev2 = document.getElementById('btn-prev-model');
const btnNext2 = document.getElementById('btn-next-model');
const btnCloseTime = document.getElementById('btn-close-timeline');

let timelineModels = [];
let currentIndex = 0;

function setupTimelineMode(models) {
  // Sort Chronologically (Old -> New) for Timeline
  timelineModels = [...models].sort((a, b) => a.year - b.year);

  if (timelineTrack) {
    timelineTrack.innerHTML = '';

    timelineModels.forEach((model, index) => {
      // Only use the first crystal to represent the model
      // Skip if no crystals
      if (!model.crystals || model.crystals.length === 0) return;

      const crystal = model.crystals[0];

      const node = document.createElement('div');
      node.className = 'timeline-node';
      node.dataset.index = index;

      node.innerHTML = `
          <div class="node-dot"></div>
          <span class="node-year">${model.year}</span>
          <span class="node-label">${model.name}</span>
        `;

      node.addEventListener('click', () => {
        goToTimelineIndex(index);
      });

      timelineTrack.appendChild(node);
    });
  }

  // Nav Buttons
  if (btnPrev2) btnPrev2.addEventListener('click', () => {
    if (currentIndex > 0) goToTimelineIndex(currentIndex - 1);
  });

  if (btnNext2) btnNext2.addEventListener('click', () => {
    if (currentIndex < timelineModels.length - 1) goToTimelineIndex(currentIndex + 1);
  });

  if (btnCloseTime) btnCloseTime.addEventListener('click', () => {
    exitTimelineMode();
  });
}

function enterTimelineMode() {
  // 1. Show Overlay
  if (timelineOverlay) timelineOverlay.classList.remove('hidden');

  // 2. Hide Standard UI
  const nav = document.querySelector('.gallery-nav');
  const details = document.querySelector('.artifact-details');
  const headerMain = document.querySelector('.gallery-header');

  if (nav) { nav.style.opacity = '0'; nav.style.pointerEvents = 'none'; }
  if (details) details.style.opacity = '0';
  if (headerMain) headerMain.style.opacity = '0';

  // 3. Reset View
  if (typeof isCompareMode !== 'undefined' && isCompareMode) {
    // Force exit compare mode if we can access toggle
    const toggle = document.getElementById('compare-toggle');
    if (toggle) {
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change'));
    }
  }

  // 4. Start at beginning (Perceptron)
  goToTimelineIndex(0);
}

function exitTimelineMode() {
  if (timelineOverlay) timelineOverlay.classList.add('hidden');

  // Restore UI
  const nav = document.querySelector('.gallery-nav');
  const details = document.querySelector('.artifact-details');
  const headerMain = document.querySelector('.gallery-header');

  if (nav) { nav.style.opacity = '1'; nav.style.pointerEvents = 'auto'; }
  if (details) details.style.opacity = '1';
  if (headerMain) headerMain.style.opacity = '1';

  // Reset Camera?
  if (mainViewer) mainViewer.resetView();
}

function goToTimelineIndex(index) {
  currentIndex = index;
  const model = timelineModels[index];
  if (!model) return;
  const crystal = model.crystals[0];

  // 1. Update Active Node UI
  document.querySelectorAll('.timeline-node').forEach(n => {
    n.classList.remove('active');
    if (parseInt(n.dataset.index) === index) {
      n.classList.add('active');
      n.scrollIntoView({ behavior: 'smooth', inline: 'center' });
    }
  });

  // 2. Update Info Text
  // Animate Out
  if (timelineTitle) timelineTitle.style.opacity = 0;
  if (timelineDesc) timelineDesc.style.opacity = 0;
  if (timelineYear) timelineYear.style.opacity = 0;

  setTimeout(() => {
    if (timelineYear) timelineYear.textContent = model.year;
    if (timelineTitle) timelineTitle.textContent = model.name;
    if (timelineDesc) timelineDesc.textContent = model.desc; // Use short desc

    // Animate In
    if (timelineTitle) timelineTitle.style.opacity = 1;
    if (timelineDesc) timelineDesc.style.opacity = 1;
    if (timelineYear) timelineYear.style.opacity = 1;
  }, 200);

  // 3. Load Crystal
  const data = {
    url: `./${crystal.file}`,
    name: crystal.name,
    type: model.type,
    modelName: model.name,
    desc: crystal.desc,
    modelId: model.id
  };

  if (mainViewer) {
    mainViewer.loadCrystal(data.url).then(() => {
      // Optional: Auto-rotate faster?
    }).catch(e => console.error(e));
  }
}

// Add Timeline Button to Header (Dynamically)
setTimeout(() => {
  const headerStatus = document.querySelector('.status-indicator');
  if (headerStatus) {
    const btnTimeline = document.createElement('button');
    btnTimeline.id = 'btn-timeline';
    btnTimeline.className = 'minimal-btn';
    btnTimeline.textContent = "TIMELINE VIEW";
    btnTimeline.style.border = "1px solid rgba(0, 243, 255, 0.3)";

    btnTimeline.addEventListener('click', enterTimelineMode);

    console.log('Timeline View button created with cyan color');

    btnTimeline.style.display = 'none'; // Hide for now

    headerStatus.insertBefore(btnTimeline, btnResume.nextSibling);
  }
}, 1000); // Wait for DOM

// Self-init timeline data independently to avoid scope issues
smartFetch('./crystals/manifest.json').then(r => {
  if (!r.ok) throw new Error(`Failed to load timeline manifest: ${r.status} ${r.statusText}`);
  return r.json();
}).then(models => {
  setupTimelineMode(models);
}).catch(err => {
  console.error("Failed to setup timeline:", err);
});

// --- DYNAMIC PERFORMANCE GOVERNOR ---
let fpsStabilityCounter = 0;
let xorReductionDelay = 0;
window.addEventListener('fps-update', (e) => {
  const fps = e.detail.fps;
  const thinSlider = document.getElementById('summarize-thin');
  const lineDistSlider = document.getElementById('line-dist-slider');
  const nodeDistSlider = document.getElementById('node-dist-slider');
  const lineDensitySlider = document.getElementById('line-density-slider');
  const nodeDensitySlider = document.getElementById('node-density-slider');
  const xorDensitySlider = document.getElementById('xor-density-slider');

  if (!thinSlider || !lineDistSlider || !nodeDistSlider || !lineDensitySlider || !nodeDensitySlider || !xorDensitySlider) return;

  let currentThin = parseFloat(thinSlider.value);
  let currentLineDist = parseFloat(lineDistSlider.value);
  let currentNodeDist = parseFloat(nodeDistSlider.value);
  let currentLineDensity = parseFloat(lineDensitySlider.value);
  let currentNodeDensity = parseFloat(nodeDensitySlider.value);
  let currentXorDensity = parseFloat(xorDensitySlider.value);

  let nextThin = currentThin;
  let nextLineDist = currentLineDist;
  let nextNodeDist = currentNodeDist;
  let nextLineDensity = currentLineDensity;
  let nextNodeDensity = currentNodeDensity;
  let nextXorDensity = currentXorDensity;

  if (autoFPSEnabled) {
    if (fps < targetFPS && fps > 0) {
      // PERFORMANCE DROP: Tiered Optimization
      // 1. Reduce XOR visibility first, but keep at least 5%
      if (currentXorDensity > 5) {
        nextXorDensity = Math.max(5, currentXorDensity - 5);
        xorReductionDelay = 0;
      } else {
        xorReductionDelay++;
        if (xorReductionDelay > 5) {
          // 2. Increase Thinning before dropping density
          if (currentThin < 1.0) {
            nextThin = Math.min(1.0, currentThin + 0.1);
          }
          // 3. Reduce line/node density BEFORE distance clipping
          // Prioritize reducing line density over node density
          else if (currentLineDensity > 10 || currentNodeDensity > 30) {
            if (currentLineDensity > 10) {
              nextLineDensity = Math.max(10, currentLineDensity - 8);
            }
            if (currentNodeDensity > 30) {
              nextNodeDensity = Math.max(30, currentNodeDensity - 4);
            }
          } else {
            // 4. Last resort: reduce distance clipping much faster
            nextLineDist = Math.max(10, currentLineDist - 20);
            nextNodeDist = Math.max(10, currentNodeDist - 20);
          }
        }
      }
      fpsStabilityCounter = 0;
    } else if (fps >= targetFPS + 1) {
      fpsStabilityCounter++;
      if (fpsStabilityCounter > 4) {
        // RECOVERY: Node Density -> Distance -> Line Density -> Thinning -> XOR
        // Nodes are recovered first to maintain structure
        if (currentNodeDensity < 100) {
          nextNodeDensity = Math.min(100, currentNodeDensity + 2);
        } else if (currentLineDist < 100) {
          nextLineDist = Math.min(100, currentLineDist + 5);
          nextNodeDist = Math.min(100, currentNodeDist + 5);
        } else if (currentLineDensity < 100) {
          nextLineDensity = Math.min(100, currentLineDensity + 1);
        } else if (currentThin > 0.4) {
          nextThin = Math.max(0.4, currentThin - 0.05);
        } else if (currentXorDensity < 100) {
          nextXorDensity = Math.min(100, currentXorDensity + 1);
        }
      }
    }

    if (nextThin !== currentThin || nextLineDist !== currentLineDist || nextNodeDist !== currentNodeDist ||
      nextLineDensity !== currentLineDensity || nextNodeDensity !== currentNodeDensity || nextXorDensity !== currentXorDensity) {

      thinSlider.value = nextThin;
      lineDistSlider.value = nextLineDist;
      nodeDistSlider.value = nextNodeDist;
      lineDensitySlider.value = nextLineDensity;
      nodeDensitySlider.value = nextNodeDensity;
      xorDensitySlider.value = nextXorDensity;

      // Apply to viewers
      [mainViewer, compareViewer].forEach(v => {
        if (v) {
          v.setThinning(nextThin);
          v.setLineDist(nextLineDist);
          v.setNodeDist(nextNodeDist);
          v.setLineDensity(nextLineDensity);
          v.setNodeDensity(nextNodeDensity);
          v.setXorDensity(nextXorDensity);
        }
      });
    }
  }
});
