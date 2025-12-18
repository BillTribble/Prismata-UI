import { LightCycleArena } from './easterEgg.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';


// Global FPS Tracking
let fpsLastTime = performance.now();
let fpsFrames = 0;
const fpsElement = document.getElementById('fps-counter');
let lastMeasuredFrame = 0;
let lastOptimizationTime = 0;

// Helper to create soft circle texture
function createCircleTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const center = size / 2;
  const radius = size / 2 - 2; // Slight padding

  // Solid Circle
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

export class CrystalViewer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return; // Silent fail if container missing (e.g. passive mode)

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.crystalGroup = null; // Holds mesh+wireframe
    this.autoRotate = true; // Default ON
    this.animationId = null;
    this.customUniforms = {
      uTime: { value: 0 },
      uPulseEnabled: { value: 0.0 },
      uLineNear: { value: 200.0 },
      uLineFar: { value: 1000.0 },
      uNodeNear: { value: 200.0 },
      uNodeFar: { value: 1000.0 },
      uThinning: { value: 0.4 },
      uLineDensity: { value: 1.0 },
      uNodeDensity: { value: 1.0 },
      uXorDensity: { value: 0.6 },
      uXorThreshold: { value: 0.02 }
    };

    // Target values for smooth lerping
    this.targetUniforms = {
      uLineNear: 200.0,
      uLineFar: 1000.0,
      uNodeNear: 200.0,
      uNodeFar: 1000.0,
      uThinning: 0.4,
      uLineDensity: 1.0,
      uNodeDensity: 1.0,
      uXorDensity: 0.6,
      uXorThreshold: 0.02
    };

    // Easter Egg System
    this.arena = null;

    // Internal Animation State
    this.lastPanY = 0;
    this.panTime = 0;
    this.modelHeight = 1.0;
    this.modelBottom = 0;

    // Size & LFO State
    this.autoPan = true;
    this.panSpeed = 0.1;
    this.rotSpeed = 1.25;

    // Pan Limits
    this.panMin = 3.0;
    this.panMax = 9.0;

    // Model Info
    this.modelHeight = 15.0;
    this.modelBottom = -7.5;

    this.lastPanY = 0;

    // Line indices for rebuilding
    this.allIndices = null;
    this.geometry = null;
    this.stdWire = null;
    this.xorWire = null;
    this.xorPercentage = 0.02;

    this.baseSize = 0.04;
    this.lfoAmount = 0.2;
    this.lfoSpeed = 3.5;

    this.pointMaterial = null;

    this.init();
  }

  init() {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050810);
    this.scene.fog = new THREE.FogExp2(0x050810, 0.005);

    // Camera
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 2000);
    this.camera.position.set(15, 0, 15);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.autoRotate = this.autoRotate;
    this.controls.autoRotateSpeed = 2.0;

    // Environment
    this.buildEnvironment();

    // Init Arena
    this.arena = new LightCycleArena(this.scene);

    // Resize Listener
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.container);

    // Start Loop
    this.animate();
  }

  buildEnvironment() {
    // Grid
    const gridHelper = new THREE.GridHelper(200, 100, 0x00f3ff, 0x003344);
    gridHelper.position.y = -10;
    this.scene.add(gridHelper);

    // Lights
    const ambient = new THREE.AmbientLight(0x404040);
    this.scene.add(ambient);

    const light1 = new THREE.PointLight(0x00f3ff, 2, 100);
    light1.position.set(0, 20, 0);
    this.scene.add(light1);

    const light2 = new THREE.PointLight(0xff0055, 1, 100);
    light2.position.set(40, -10, 40);
    this.scene.add(light2);
  }

  async loadCrystal(url) {
    if (this.crystalGroup) {
      this.scene.remove(this.crystalGroup);
      this.crystalGroup.children.forEach(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this.crystalGroup = null;
    }

    this.allIndices = null;
    this.geometry = null;
    this.stdWire = null;
    this.xorWire = null;

    try {
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      const { meshResult, stats } = this.parsePLY(buffer);

      this.crystalGroup = meshResult;
      this.scene.add(this.crystalGroup);

      this.fitCameraToSelection();

      return stats;
    } catch (err) {
      console.error("Load failed:", err);
      throw err;
    }
  }

  fitCameraToSelection() {
    if (!this.crystalGroup) return;

    const box = new THREE.Box3().setFromObject(this.crystalGroup);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    const fovRad = this.camera.fov * (Math.PI / 180);
    let cameraDist = (maxDim / 2) / Math.tan(fovRad / 2);
    cameraDist *= 1.4;

    this.controls.target.copy(center);
    const direction = new THREE.Vector3(1, 0.6, 1).normalize();
    const pos = center.clone().add(direction.multiplyScalar(cameraDist));

    this.camera.position.copy(pos);
    this.controls.update();

    const heightFactor = this.modelHeight / 15.0;
    const mid = this.modelBottom + ((this.panMin + this.panMax) / 2) * heightFactor;

    const deltaY = mid - center.y;
    this.camera.position.y += deltaY;
    this.controls.target.y += deltaY;
    this.controls.update();

    this.lastPanY = mid;
    this.panTime = 0;
  }

  setAutoRotate(enabled) {
    this.autoRotate = enabled;
    if (this.controls) this.controls.autoRotate = enabled;
  }

  resetView() {
    this.fitCameraToSelection();
  }

  onResize() {
    if (!this.camera || !this.renderer) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());

    const lerp = (cur, tar, speed = 0.2) => cur + (tar - cur) * speed;

    this.customUniforms.uLineNear.value = lerp(this.customUniforms.uLineNear.value, this.targetUniforms.uLineNear);
    this.customUniforms.uLineFar.value = lerp(this.customUniforms.uLineFar.value, this.targetUniforms.uLineFar);
    this.customUniforms.uNodeNear.value = lerp(this.customUniforms.uNodeNear.value, this.targetUniforms.uNodeNear);
    this.customUniforms.uNodeFar.value = lerp(this.customUniforms.uNodeFar.value, this.targetUniforms.uNodeFar);
    this.customUniforms.uThinning.value = lerp(this.customUniforms.uThinning.value, this.targetUniforms.uThinning);
    this.customUniforms.uLineDensity.value = lerp(this.customUniforms.uLineDensity.value, this.targetUniforms.uLineDensity);
    this.customUniforms.uNodeDensity.value = lerp(this.customUniforms.uNodeDensity.value, this.targetUniforms.uNodeDensity);
    this.customUniforms.uXorDensity.value = lerp(this.customUniforms.uXorDensity.value, this.targetUniforms.uXorDensity);
    this.customUniforms.uXorThreshold.value = lerp(this.customUniforms.uXorThreshold.value, this.targetUniforms.uXorThreshold);

    if (this.customUniforms) {
      this.customUniforms.uTime.value += 0.01;
    }

    if (this.pointMaterial) {
      if (this.lfoAmount > 0) {
        const time = Date.now() * 0.001;
        const scale = 1.0 + Math.sin(time * this.lfoSpeed) * this.lfoAmount;
        let newSize = this.baseSize * scale;
        if (newSize < 0.001) newSize = 0.001;
        this.pointMaterial.size = newSize;
        if (this.onUpdateUI) this.onUpdateUI(newSize);
      } else if (this.pointMaterial.size !== this.baseSize) {
        this.pointMaterial.size = this.baseSize;
        if (this.onUpdateUI) this.onUpdateUI(this.baseSize);
      }
    }

    if (this.autoPan) {
      if (!this.panTime) this.panTime = 0;
      // Add a tiny floor (0.01) so that slider 0 is "VERY slow"
      const effectiveSpeed = this.panSpeed + 0.01;
      this.panTime += 0.016 * effectiveSpeed;

      const heightFactor = this.modelHeight / 15.0;
      const effectiveMin = this.modelBottom + (this.panMin * heightFactor);
      const effectiveMax = this.modelBottom + (this.panMax * heightFactor);

      const range = effectiveMax - effectiveMin;
      const mid = (effectiveMax + effectiveMin) / 2;
      const amp = range / 2;

      const targetY = mid + Math.sin(this.panTime) * amp;
      const deltaY = targetY - this.lastPanY;
      this.lastPanY = targetY;

      this.camera.position.y += deltaY;
      this.controls.target.y += deltaY;
    }

    if (this.controls && this.autoRotate) {
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = this.rotSpeed;
    } else if (this.controls) {
      this.controls.autoRotate = false;
    }

    if (this.arena) this.arena.update();
    if (this.controls) this.controls.update();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }

    const now = performance.now();
    const frameId = Math.floor(now / 16.66);
    if (frameId !== lastMeasuredFrame) {
      fpsFrames++;
      lastMeasuredFrame = frameId;

      if (now > fpsLastTime + 250) {
        const fps = fpsFrames / 0.25;
        if (fpsElement) {
          fpsElement.textContent = `${fps.toFixed(0)} FPS`;
          fpsElement.style.color = 'var(--color-primary)';
          fpsElement.style.opacity = '0.7';
        }
        window.dispatchEvent(new CustomEvent('fps-update', { detail: { fps } }));
        fpsLastTime = now;
        fpsFrames = 0;
      }
    }
  }

  toggleEasterEgg() {
    if (this.arena) {
      this.arena.toggle();
      return this.arena.active;
    }
    return false;
  }

  parsePLY(buffer) {
    const decoder = new TextDecoder();
    let headerEndIndex = 0;
    const chunk = decoder.decode(buffer.slice(0, 2048));
    const idx = chunk.indexOf("end_header\n");
    if (idx !== -1) headerEndIndex = idx + "end_header\n".length;

    const headerText = decoder.decode(buffer.slice(0, headerEndIndex));
    const body = buffer.slice(headerEndIndex);

    const vertexCount = parseInt(headerText.match(/element vertex (\d+)/)?.[1] || 0);
    const edgeCount = parseInt(headerText.match(/element edge (\d+)/)?.[1] || 0);

    const textData = decoder.decode(body).trim().split(/\s+/);
    let ptr = 0;

    const positions = [];
    const colors = [];
    const edgeIndices = [];

    for (let i = 0; i < vertexCount; i++) {
      const x = parseFloat(textData[ptr++]);
      const y = parseFloat(textData[ptr++]);
      const z = parseFloat(textData[ptr++]);
      const r = parseInt(textData[ptr++]) / 255;
      const g = parseInt(textData[ptr++]) / 255;
      const b = parseInt(textData[ptr++]) / 255;
      positions.push(x, y, z);
      colors.push(r, g, b);
    }

    const allIndices = [];
    for (let i = 0; i < edgeCount; i++) {
      const v1 = parseInt(textData[ptr++]);
      const v2 = parseInt(textData[ptr++]);
      allIndices.push(v1, v2);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.center();

    this.geometry = geometry;
    this.allIndices = allIndices;

    geometry.computeBoundingBox();
    if (geometry.boundingBox) {
      this.modelHeight = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
      this.modelBottom = geometry.boundingBox.min.y;
    }

    const group = new THREE.Group();

    const pointMaterial = new THREE.PointsMaterial({
      size: this.baseSize,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      map: createCircleTexture(),
      alphaTest: 0.001,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    this.pointMaterial = pointMaterial;

    pointMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.customUniforms.uTime;
      shader.uniforms.uPulseEnabled = this.customUniforms.uPulseEnabled;
      shader.uniforms.uNodeNear = this.customUniforms.uNodeNear;
      shader.uniforms.uNodeFar = this.customUniforms.uNodeFar;
      shader.uniforms.uNodeDensity = this.customUniforms.uNodeDensity;

      shader.vertexShader = `
          varying float vPulse;
          varying float vDistAlpha;
          varying float vSeed;
          uniform float uTime;
          uniform float uPulseEnabled;
          uniform float uNodeNear;
          uniform float uNodeFar;
        ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
          #include <begin_vertex>
          vPulse = 0.0;
          if (uPulseEnabled > 0.5) {
             float offset = sin(position.x * 0.5) + cos(position.y * 0.5);
             float wave = sin(position.z * 0.2 + uTime * 2.5 + offset * 0.5);
             vPulse = smoothstep(0.9, 1.0, wave);
          }
          `
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `
        #include <project_vertex>
        float dist = length(mvPosition.xyz);
        vDistAlpha = 1.0 - smoothstep(uNodeNear, uNodeFar, dist);
        vSeed = fract(sin(dot(position.xyz, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
        `
      );

      shader.fragmentShader = `
          varying float vPulse;
          varying float vDistAlpha;
          varying float vSeed;
          uniform float uNodeDensity;
        ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
          #include <color_fragment>
          
          float fog = pow(vDistAlpha, 2.0);
          
          // Node Density Discard
          if (vSeed > uNodeDensity) discard;
          
          // Boost Alpha when density is low
          float alphaBoost = 1.0 + (1.0 - uNodeDensity) * 2.0;
          diffuseColor.a *= fog * alphaBoost;
          
          if (vPulse > 0.01) {
             diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 1.0, 1.0), vPulse * 0.7);
          }
          `
      );
    };

    const mesh = new THREE.Points(geometry, pointMaterial);
    group.add(mesh);

    this.buildLines(group);

    return {
      meshResult: group,
      stats: {
        nodes: vertexCount,
        links: edgeCount,
        layers: 10
      }
    };
  }

  buildLines(group) {
    if (!this.allIndices || !this.geometry) return;

    if (this.stdWire) {
      group.remove(this.stdWire);
      this.stdWire.geometry.dispose();
      this.stdWire.material.dispose();
      this.stdWire = null;
    }
    if (this.xorWire) {
      group.remove(this.xorWire);
      this.xorWire.geometry.dispose();
      this.xorWire.material.dispose();
      this.xorWire = null;
    }

    // Assign a random seed attribute to lines so we can cross-fade XOR-ness in shader
    const lineSeeds = new Float32Array(this.allIndices.length);
    for (let i = 0; i < this.allIndices.length; i += 2) {
      const seed = Math.random();
      lineSeeds[i] = seed;
      lineSeeds[i + 1] = seed;
    }

    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute('position', this.geometry.getAttribute('position'));
    wireGeo.setAttribute('aLineSeed', new THREE.BufferAttribute(lineSeeds, 1));
    wireGeo.setIndex(this.allIndices);

    // 1. Standard Material (renders lines that NOT in XOR set)
    const stdMat = new THREE.LineBasicMaterial({
      color: 0x00f3ff,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    stdMat.onBeforeCompile = (shader) => {
      shader.uniforms.uLineNear = this.customUniforms.uLineNear;
      shader.uniforms.uLineFar = this.customUniforms.uLineFar;
      shader.uniforms.uThinning = this.customUniforms.uThinning;
      shader.uniforms.uLineDensity = this.customUniforms.uLineDensity;
      shader.uniforms.uXorThreshold = this.customUniforms.uXorThreshold;

      shader.vertexShader = `
        attribute float aLineSeed;
        varying float vDistAlpha;
        varying float vSeed;
        varying float vLineSeed;
        uniform float uLineNear;
        uniform float uLineFar;
      ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `
        #include <project_vertex>
        float dist = length(mvPosition.xyz);
        vDistAlpha = 1.0 - smoothstep(uLineNear, uLineFar, dist);
        vSeed = fract(sin(dot(position.xyz, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
        vLineSeed = aLineSeed;
        `
      );

      shader.fragmentShader = `
        varying float vDistAlpha;
        varying float vSeed;
        varying float vLineSeed;
        uniform float uThinning;
        uniform float uLineDensity;
        uniform float uXorThreshold;
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        
        // Hide if this line is in the XOR pool
        if (vLineSeed < uXorThreshold) discard;
        
        float fog = pow(vDistAlpha, 2.0);
        // Exponential fade for thinning: much more aggressive
        float thinningAlpha = mix(1.0, pow(fog, 4.0), uThinning);

        if (vSeed > uLineDensity) discard;
        float alphaBoost = 1.0 + (1.0 - uLineDensity) * 1.5;
        diffuseColor.a *= thinningAlpha * fog * alphaBoost;
        if (diffuseColor.a < 0.005) discard;
        `
      );
    };

    // 2. XOR Material (renders lines that ARE in XOR set)
    const xorMat = new THREE.LineBasicMaterial({
      color: 0x00f3ff,
      transparent: true,
      opacity: 0.6,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneMinusDstColorFactor,
      blendDst: THREE.OneMinusSrcColorFactor,
      depthWrite: false
    });

    xorMat.onBeforeCompile = (shader) => {
      shader.uniforms.uLineNear = this.customUniforms.uLineNear;
      shader.uniforms.uLineFar = this.customUniforms.uLineFar;
      shader.uniforms.uThinning = this.customUniforms.uThinning;
      shader.uniforms.uXorDensity = this.customUniforms.uXorDensity;
      shader.uniforms.uXorThreshold = this.customUniforms.uXorThreshold;

      shader.vertexShader = `
        attribute float aLineSeed;
        varying float vDistAlpha;
        varying float vLineSeed;
        uniform float uLineNear;
        uniform float uLineFar;
      ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `
        #include <project_vertex>
        float dist = length(mvPosition.xyz);
        vDistAlpha = 1.0 - smoothstep(uLineNear, uLineFar, dist);
        vLineSeed = aLineSeed;
        `
      );

      shader.fragmentShader = `
        varying float vDistAlpha;
        varying float vLineSeed;
        uniform float uThinning;
        uniform float uXorDensity;
        uniform float uXorThreshold;
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        
        // Hide if this line is NOT in the XOR pool
        if (vLineSeed >= uXorThreshold) discard;
        
        float fog = pow(vDistAlpha, 2.0);
        float thinningAlpha = mix(1.0, pow(fog, 3.0), uThinning);

        diffuseColor.a *= uXorDensity * thinningAlpha * fog;
        if (diffuseColor.a < 0.001) discard;
        `
      );
    };

    this.stdWire = new THREE.LineSegments(wireGeo, stdMat);
    this.xorWire = new THREE.LineSegments(wireGeo, xorMat);
    group.add(this.stdWire);
    group.add(this.xorWire);
  }

  setLineDist(dist) {
    // Map 0-100 slider to a more useful 2-150 range for distance fading
    const effectiveNear = 2 + (dist / 100) * 148;
    this.targetUniforms.uLineNear = effectiveNear;
    this.targetUniforms.uLineFar = effectiveNear * 1.5;
  }

  setNodeDist(dist) {
    const effectiveNear = 2 + (dist / 100) * 148;
    this.targetUniforms.uNodeNear = effectiveNear;
    this.targetUniforms.uNodeFar = effectiveNear * 1.5;
  }

  setThinning(intensity) {
    this.targetUniforms.uThinning = intensity;
  }

  setLineDensity(val) {
    this.targetUniforms.uLineDensity = val / 100;
  }

  setNodeDensity(val) {
    this.targetUniforms.uNodeDensity = val / 100;
  }

  setXorDensity(val) {
    // Keep a minimum floor of visibility so we always see some XOR lines
    const floorOpacity = 0.008;
    let opacity;

    // Quadratic curve for ultra-smooth low-end control
    if (val <= 33) {
      opacity = floorOpacity + Math.pow(val / 33, 2.0) * 0.06;
    } else {
      opacity = 0.068 + 0.1 * Math.pow(100, (val - 33) / 67);
    }

    this.targetUniforms.uXorDensity = opacity;

    // Smooth Transition: instead of rebuilding geometry, update the shader threshold
    this.targetUniforms.uXorThreshold = Math.max(0.005, (val / 100) * 0.05);
  }

  setManualHeight(val) {
    const heightFactor = this.modelHeight / 15.0;
    const targetY = this.modelBottom + (val * heightFactor);
    const deltaY = targetY - this.lastPanY;
    this.lastPanY = targetY;

    this.camera.position.y += deltaY;
    this.controls.target.y += deltaY;
    this.controls.update();
  }

  setPulse(enabled) {
    if (this.customUniforms) {
      this.customUniforms.uPulseEnabled.value = enabled ? 1.0 : 0.0;
    }
  }

  setBaseSize(size) {
    this.baseSize = size;
  }

  setLFOAmount(amount) {
    this.lfoAmount = amount;
  }

  setLFOSpeed(speed) {
    this.lfoSpeed = speed;
  }

  setPanSpeed(speed) {
    this.panSpeed = speed;
  }

  setRotSpeed(speed) {
    this.rotSpeed = speed;
    if (this.controls) {
      this.controls.autoRotateSpeed = speed;
    }
  }

  setPanMin(val) {
    this.panMin = val;
  }

  setPanMax(val) {
    this.panMax = val;
  }

  toggleAutoPan() {
    this.autoPan = !this.autoPan;
    return this.autoPan;
  }
}

