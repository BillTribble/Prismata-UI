import { CrystalViewer } from './main.js';

// DOM Elements
const navList = document.getElementById('model-list');
const loader = document.getElementById('loader');
const toggleCompare = document.getElementById('compare-toggle');
const viewerContainer = document.getElementById('viewer-container');
const viewCompare = document.getElementById('view-compare');

// Panels
const panelA = document.getElementById('panel-a');
const panelB = document.getElementById('panel-b');

const uiElements = {
  main: {
    title: document.getElementById('crystal-title-a'),
    type: document.getElementById('crystal-type-a'),
    desc: document.getElementById('crystal-desc-a'),
    nodes: document.getElementById('meta-nodes-a'),
    links: document.getElementById('meta-links-a'),
  },
  compare: {
    title: document.getElementById('crystal-title-b'),
    type: document.getElementById('crystal-type-b'),
    desc: document.getElementById('crystal-desc-b'),
    nodes: document.getElementById('meta-nodes-b'),
    links: document.getElementById('meta-links-b'),
  }
};

// State
let isCompareMode = false;
let activeSlot = 'main'; // 'main' or 'compare'
let mainViewer = null;
let compareViewer = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Init Viewers
  mainViewer = new CrystalViewer('view-main');
  compareViewer = new CrystalViewer('view-compare');

  // 2. Load Gallery
  await loadGallery();
  setupControls();

  // 3. Setup Slot Selection
  panelA.addEventListener('click', () => setActiveSlot('main'));
  panelB.addEventListener('click', () => setActiveSlot('compare'));

  // Initial State
  setActiveSlot('main');
});

function setActiveSlot(slot) {
  if (slot === 'compare' && !isCompareMode) return; // Can't select B if hidden
  activeSlot = slot;

  // Update UI Visuals
  if (slot === 'main') {
    panelA.style.borderColor = '#00f3ff';
    panelA.style.boxShadow = '0 0 15px rgba(0, 243, 255, 0.2)';
    panelB.style.borderColor = 'rgba(0, 243, 255, 0.2)';
    panelB.style.boxShadow = 'none';

    // Update List Highlights (Optional: show which item is in this slot?)
    // Complex to track "selected item per slot" visually in list without clutter.
  } else {
    panelB.style.borderColor = '#00f3ff';
    panelB.style.boxShadow = '0 0 15px rgba(0, 243, 255, 0.2)';
    panelA.style.borderColor = 'rgba(0, 243, 255, 0.2)';
    panelA.style.boxShadow = 'none';
  }
}

async function loadGallery() {
  try {
    const res = await fetch('./crystals/manifest.json');
    const models = await res.json();

    models.forEach((model, index) => {
      // Create Group Header
      const groupDiv = document.createElement('div');
      groupDiv.className = 'model-group';
      // Open first group by default
      if (index === 0) groupDiv.classList.add('active');

      const groupTitle = document.createElement('div');
      groupTitle.className = 'model-title';
      groupTitle.textContent = model.name;
      groupTitle.addEventListener('click', () => {
        groupDiv.classList.toggle('active');
      });
      groupDiv.appendChild(groupTitle);

      const contentDiv = document.createElement('div');
      contentDiv.className = 'group-content';

      // Create Items
      model.crystals.forEach(crystal => {
        const item = document.createElement('div');
        item.className = 'crystal-item';
        item.dataset.url = `./${crystal.file}`;
        item.dataset.name = crystal.name;
        item.dataset.desc = crystal.desc;
        item.dataset.type = model.type;
        item.dataset.modelDesc = model.desc;
        item.dataset.modelId = model.id; // Passed for README fetch

        item.innerHTML = `
                    <span class="item-name">${crystal.name}</span>
                    <span class="item-desc">${crystal.desc.substring(0, 35)}...</span>
                `;

        item.addEventListener('click', () => {
          // Highlight logic
          // We could mark it active, but maybe just flash it?
          document.querySelectorAll('.crystal-item').forEach(el => el.classList.remove('active'));
          item.classList.add('active');

          // Load into ACTIVE slot
          handleLoadCrystal(item.dataset, activeSlot);
        });

        contentDiv.appendChild(item);
      });

      groupDiv.appendChild(contentDiv);
      navList.appendChild(groupDiv);
    });

  } catch (err) {
    console.error("Failed to load manifest:", err);
    navList.innerHTML = `<div style="color:red; padding:1rem;">ERROR CONNECTING TO ARCHIVE<br>${err.message}</div>`;
  }
}

async function handleLoadCrystal(data, slot) {
  loader.classList.remove('hidden');

  const ui = slot === 'main' ? uiElements.main : uiElements.compare;
  const viewer = slot === 'main' ? mainViewer : compareViewer;

  // Update Header
  ui.title.textContent = data.name;
  ui.type.textContent = data.type;

  try {
    // 1. Load 3D
    const stats = await viewer.loadCrystal(data.url);

    // 2. Stats
    ui.nodes.textContent = stats.nodes.toLocaleString();
    ui.links.textContent = stats.links.toLocaleString();

    // 3. Info
    let infoText = "";
    try {
      const res = await fetch(`./crystals/${data.modelId}/INFO.md`);
      if (res.ok) infoText = await res.text();
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
  let html = text;
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#fff;">$1</strong>');
  html = html.replace(/\n/gm, '<br>');
  return html;
}

function setupControls() {
  const btnSpin = document.getElementById('btn-spin');
  const btnReset = document.getElementById('btn-reset');

  btnSpin.addEventListener('click', () => {
    const isActive = btnSpin.classList.toggle('active');
    mainViewer.setAutoRotate(isActive);
    compareViewer.setAutoRotate(isActive);
    btnSpin.textContent = isActive ? "AUTO-ROTATE: ON" : "AUTO-ROTATE: OFF";
  });

  btnReset.addEventListener('click', () => {
    mainViewer.resetView();
    compareViewer.resetView();
  });

  toggleCompare.addEventListener('change', (e) => {
    isCompareMode = e.target.checked;
    if (isCompareMode) {
      // SHOW B
      viewCompare.classList.remove('hidden');
      viewerContainer.classList.add('split');
      panelB.classList.remove('hidden');

      // Auto Select B for convenience
      setActiveSlot('compare');

      setTimeout(() => {
        mainViewer.onResize();
        compareViewer.onResize();
      }, 550);
    } else {
      // HIDE B
      viewCompare.classList.add('hidden');
      viewerContainer.classList.remove('split');
      panelB.classList.add('hidden');

      // Force select A
      setActiveSlot('main');

      setTimeout(() => {
        mainViewer.onResize();
      }, 550);
    }
  });
}
