import * as THREE from 'three';

// --- INLINED DEPENDENCIES TO FIX LOADING ISSUES ---

class GlitchEnemy {
    constructor(scene, position, target) {
        this.scene = scene;
        this.target = target;
        this.life = 6;
        this.speed = 12; // Fast
        this.active = true;

        this.mesh = new THREE.Group();
        this.mesh.position.copy(position);

        // Demon Head Visuals
        const headGeo = new THREE.BoxGeometry(1, 1.2, 1);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
        const head = new THREE.Mesh(headGeo, mat);
        this.mesh.add(head);

        // Horns
        const hornGeo = new THREE.ConeGeometry(0.2, 0.8, 8);
        const hornMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

        const hornL = new THREE.Mesh(hornGeo, hornMat);
        hornL.position.set(-0.4, 0.8, 0);
        hornL.rotation.z = 0.3;
        this.mesh.add(hornL);

        const hornR = new THREE.Mesh(hornGeo, hornMat);
        hornR.position.set(0.4, 0.8, 0);
        hornR.rotation.z = -0.3;
        this.mesh.add(hornR);

        // Eyes
        const eyeGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
        eyeL.position.set(-0.25, 0.1, 0.5);
        this.mesh.add(eyeL);
        const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
        eyeR.position.set(0.25, 0.1, 0.5);
        this.mesh.add(eyeR);

        this.scene.add(this.mesh);
    }

    update(delta) {
        if (!this.active) return 'remove';

        // Always move towards target (or player if target lost)
        const targetPos = this.target ? this.target.position : null;
        if (!targetPos) return 'remove';

        const dist = this.mesh.position.distanceTo(targetPos);

        // Move
        const dir = new THREE.Vector3().subVectors(targetPos, this.mesh.position).normalize();
        this.mesh.position.add(dir.multiplyScalar(this.speed * delta));

        // Rotate
        this.mesh.rotation.x += delta * 5;
        this.mesh.rotation.y += delta * 5;

        // Attack Reach
        if (dist < 3.0) {
            return 'damage';
        }
        return 'move';
    }

    takeDamage(amount) {
        this.life -= amount;

        // Flash
        this.mesh.children.forEach(c => {
            if (c.material) {
                c.material.color.setHex(0xffffff);
                setTimeout(() => {
                    if (this.active && c.material) {
                        if (c.geometry.type === 'BoxGeometry' && c.position.y === 0) c.material.color.setHex(0xff0000);
                        else if (c.geometry.type === 'ConeGeometry') c.material.color.setHex(0xffaa00);
                        else c.material.color.setHex(0x00ff00);
                    }
                }, 50);
            }
        });

        if (this.life <= 0) {
            this.active = false;
            this.scene.remove(this.mesh);
            this.mesh.children.forEach(c => {
                if (c.geometry) c.geometry.dispose();
                if (c.material) c.material.dispose();
            });
            return true; // Dead
        }
        return false;
    }
}

class Weapon {
    constructor(name, cooldown, damage, color, type) {
        this.name = name;
        this.cooldown = cooldown;
        this.damage = damage;
        this.color = color;
        this.type = type; // 'hitscan', 'projectile', 'spread'
        this.lastShot = 0;
    }
}

const WEAPONS = [
    new Weapon("BLASTER", 150, 1, 0x00ff00, 'hitscan'),
    new Weapon("SHOTGUN", 1000, 1, 0xffaa00, 'spread'),
    new Weapon("LAUNCHER", 1500, 5, 0xff0000, 'projectile')
];

// --- DOOM MANAGER ---

export class DoomManager {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.active = false;

        // Game State
        this.score = 0;
        this.wave = 1;
        this.enemies = [];
        this.projectiles = [];
        this.particles = [];
        this.gameInterval = null;

        // Weapons
        this.weapons = WEAPONS;
        this.currentWeaponIdx = 0;
        this.weaponMesh = null;
        this.muzzleLight = null;
        this.weaponRecoil = 0;

        // Tools
        this.raycaster = new THREE.Raycaster();
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // UI
        this.hud = null;
    }

    activate() {
        if (this.active) return;
        if (this.cooldown && Date.now() < this.cooldown) return; // Cooldown check

        this.active = true;
        console.log("🛡️ DEFENSE MODE ACTIVATED - FORCING START");

        // UI Startup
        this.createHUD();
        this.createWeaponMesh();

        // Input
        this.clickParams = { handler: (e) => this.shoot(e) };
        document.addEventListener('mousedown', this.clickParams.handler);

        this.keyParams = { handler: (e) => this.handleKeys(e) };
        window.addEventListener('keydown', this.keyParams.handler);

        // IMMEDIATE INSTRUCTIONS
        this.showInstructions();

        // Resume audio if possible
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().then(() => console.log("Audio Resumed")).catch(console.error);
        }
    }

    showInstructions() {
        // Fallback: Remove if exists
        const existing = document.getElementById('doom-instructions');
        if (existing) existing.remove();

        const hud = document.getElementById('doom-hud');
        if (!hud) this.createHUD();

        // 1. Force Unlock Pointer so mouse is visible/usable if they want
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }

        const container = document.getElementById('doom-hud');
        if (container) {
            container.innerHTML += `
                <div id="doom-instructions" style="position: absolute; top:0; left:0; width:100%; height:100%; 
                            background: rgba(0,0,0,0.9); display:flex; flex-direction:column; justify-content:center; align-items:center;
                            text-align: center; color: white; z-index: 5000; pointer-events: auto;">
                    <h1 style="font-size: 60px; color: #ff0033; text-shadow:0 0 20px red; font-family:'Orbitron', sans-serif;">PROTOCOL: FIREWALL</h1>
                    <p style="font-size: 24px; max-width: 600px; line-height: 1.5; font-family:'Orbitron', sans-serif;">
                        <span style="color:red; font-weight:bold;">ENEMIES TARGET THE ARCHIVE</span><br>
                        DEFEND THE MODELS.<br>
                        <br>
                        [1] BLASTER - Rapid Fire<br>
                        [2] SHOTGUN - Wide Spread<br>
                        [3] LAUNCHER - Explosive<br>
                        <br>
                        <span style="color:#00ff00; font-weight:bold;">PRESS [ENTER] TO START</span><br>
                        <span style="color:#666;">PRESS [ESC] TO CANCEL</span>
                    </p>
                    <button id="doom-start-btn" style="margin-top:40px; padding: 20px 40px; font-size: 30px; 
                                border: 2px solid #ff0033; background: #330000; color: #ff0033; cursor: pointer; font-family: 'Orbitron', sans-serif;">
                        INITIATE DEFENSE
                    </button>
                </div>
            `;

            // Handler for Start
            const startGame = () => {
                const instr = document.getElementById('doom-instructions');
                if (instr) instr.remove();

                // Cleanup temporary listener
                window.removeEventListener('keydown', keyHandler);

                if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
                this.playMusic();
                this.startWave();

                // Lock pointer again for gameplay
                document.body.requestPointerLock();
            };

            // Handler for Cancel
            const cancelGame = () => {
                const instr = document.getElementById('doom-instructions');
                if (instr) instr.remove();
                window.removeEventListener('keydown', keyHandler);
                this.deactivate();
            };

            // Keyboard Listener
            const keyHandler = (e) => {
                if (e.key === 'Enter') startGame();
                if (e.key === 'Escape') cancelGame();
            };
            window.addEventListener('keydown', keyHandler);

            // Button Click Listener
            const btn = document.getElementById('doom-start-btn');
            if (btn) btn.onclick = (e) => {
                e.stopPropagation();
                startGame();
            };
        }
    }

    deactivate() {
        this.active = false;
        if (this.weaponMesh) { this.camera.remove(this.weaponMesh); this.weaponMesh = null; }
        if (this.clickParams) document.removeEventListener('mousedown', this.clickParams.handler);
        if (this.keyParams) window.removeEventListener('keydown', this.keyParams.handler);
        if (this.musicInterval) clearInterval(this.musicInterval);
        if (this.spawnInterval) clearInterval(this.spawnInterval);
        if (this.hud) { this.hud.remove(); this.hud = null; }
        this.enemies.forEach(e => { if (e.active) this.scene.remove(e.mesh); });
        this.enemies = [];
        this.projectiles.forEach(p => {
            if (p.mesh) { this.scene.remove(p.mesh); if (p.mesh.geometry) p.mesh.geometry.dispose(); if (p.mesh.material) p.mesh.material.dispose(); }
        });
        this.projectiles = [];
    }

    startWave() {
        if (this.spawnInterval) clearInterval(this.spawnInterval);
        if (this.wave > 5) { this.triggerWin(); return; }

        console.log(`Starting Wave ${this.wave}`);
        const spawnRate = Math.max(500, 3000 - (this.wave * 200));

        this.spawnInterval = setInterval(() => {
            if (!this.active || this.isGameOver) return;
            this.spawnEnemy();
        }, spawnRate);
    }

    spawnEnemy() {
        if (this.enemies.length > 30) return;

        // 1. Get ALL valid targets
        const targets = [];
        this.scene.traverse(obj => {
            if (obj.isPoints && obj.visible) {
                if (obj.userData.health === undefined) obj.userData.health = 100;
                targets.push(obj);
            }
        });

        if (targets.length === 0) {
            this.triggerGameOver();
            return;
        }

        const target = targets[Math.floor(Math.random() * targets.length)];

        // 2. Spawn relative to PLAYER so you SEE them
        const angle = Math.random() * Math.PI * 2;
        const radius = 60 + Math.random() * 40;

        const spawnX = this.camera.position.x + Math.cos(angle) * radius;
        const spawnZ = this.camera.position.z + Math.sin(angle) * radius;

        const enemy = new GlitchEnemy(this.scene, new THREE.Vector3(spawnX, 4, spawnZ), target);
        enemy.mesh.scale.set(3, 3, 3);
        this.enemies.push(enemy);
    }

    triggerGameOver() {
        if (this.isGameOver) return;
        this.isGameOver = true;
        const hud = document.getElementById('doom-hud');
        if (hud) {
            hud.innerHTML += `
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                            font-size: 80px; color: red; text-align: center; text-shadow: 0 0 20px red; pointer-events:none;">
                    GAME OVER<br>
                    <span style="font-size: 30px; color: white;">PRESS 'R' TO RESTART</span>
                </div>
            `;
        }
        this.playSound(100, 'sawtooth', 2.0, 1.0);
    }

    triggerWin() {
        this.isGameOver = true;
        const hud = document.getElementById('doom-hud');
        if (hud) {
            hud.innerHTML += `
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                            font-size: 80px; color: #00ff00; text-align: center; text-shadow: 0 0 20px lime; pointer-events:none;">
                    ARCHIVE SECURED<br>
                    <span style="font-size: 30px; color: white;">SIMULATION COMPLETE</span><br>
                    <span style="font-size: 20px; color: #aaaaaa;">PRESS 'R' TO PLAY AGAIN</span>
                </div>
            `;
        }
        this.playSound(400, 'sine', 0.5, 0.5);
        this.playSound(600, 'sine', 0.5, 0.5);
    }

    resetGame() {
        this.isGameOver = false;
        this.score = 0;
        this.wave = 1;
        this.scene.traverse(obj => {
            if (obj.isPoints) {
                obj.visible = true;
                obj.userData.health = 100;
                if (obj.material) obj.material.color.setHex(0x00f3ff);
            }
        });
        this.enemies.forEach(e => { this.scene.remove(e.mesh); e.active = false; });
        this.enemies = [];
        if (this.hud) this.hud.remove();
        this.createHUD();
        this.updateHUD();
        this.playMusic();
        this.startWave();
    }

    update(delta) {
        if (!this.active) return;

        // AUTO-RESUME AUDIO
        if (this.audioCtx && this.audioCtx.state === 'suspended' && this.active) {
            this.audioCtx.resume();
        }

        try {
            // Enemies
            for (let i = this.enemies.length - 1; i >= 0; i--) {
                const e = this.enemies[i];
                const result = e.update(delta);

                if (result === 'damage') {
                    this.createExplosion(e.mesh.position, 0x00ffff, true);
                    if (e.target) {
                        e.target.userData.health -= 20;
                        if (e.target.material) {
                            e.target.material.color.setHex(0xff0000);
                            setTimeout(() => { if (e.target.material) e.target.material.color.setHex(0x00f3ff); }, 100);
                        }
                        if (e.target.userData.health <= 0) {
                            e.target.visible = false;
                            this.playSound(200, 'sawtooth', 0.5, 0.5);
                        } else {
                            this.playSound(100, 'square', 0.1, 0.3);
                        }
                    }
                    e.takeDamage(999);
                }
                if (!e.active) {
                    this.enemies.splice(i, 1);
                }
            }

            this.updateProjectiles(delta);
            this.updateParticles(delta);

            // Recoil
            if (this.weaponMesh && this.weaponRecoil > 0) {
                this.weaponMesh.position.z += this.weaponRecoil * delta * 5;
                this.weaponRecoil -= delta * 2;
                if (this.weaponRecoil < 0) this.weaponRecoil = 0;
                this.weaponMesh.position.z = Math.min(-0.6 + this.weaponRecoil, -0.4);
            }
        } catch (err) {
            console.error("DoomManager Update Error:", err);
        }
    }

    shoot() {
        if (!this.active) return;
        const w = this.weapons[this.currentWeaponIdx];
        const now = Date.now();
        if (now - w.lastShot < w.cooldown) return;
        w.lastShot = now;

        this.weaponRecoil = 0.2;
        this.muzzleLight.intensity = 5;
        setTimeout(() => { if (this.muzzleLight) this.muzzleLight.intensity = 0; }, 50);

        // Sounds
        if (w.name === "BLASTER") this.playSound(800, 'sine', 0.1, 0.3);
        if (w.name === "SHOTGUN") {
            this.playSound(100, 'sawtooth', 0.2, 0.5);
            this.playSound(200, 'square', 0.1, 0.3);
        }
        if (w.name === "LAUNCHER") {
            this.playSound(60, 'triangle', 0.5, 0.5);
        }

        if (w.type === 'hitscan') {
            this.fireHitscan(w);
        } else if (w.type === 'spread') {
            // SCATTER SHOT: VISIBLE 
            for (let i = 0; i < 20; i++) this.fireHitscan(w, 0.5); // 20 pellets, 0.5 spread
        } else if (w.type === 'projectile') {
            this.fireProjectile(w);
        }
    }

    fireHitscan(weapon, spread = 0) {
        this.raycaster.setFromCamera(new THREE.Vector2(
            (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread
        ), this.camera);

        const enemyMeshes = this.enemies.map(e => e.mesh);
        const intersections = this.raycaster.intersectObjects(enemyMeshes, true);

        let hitPoint = null;

        if (intersections.length > 0) {
            const hit = intersections[0];
            hitPoint = hit.point;

            let curr = hit.object;
            while (curr && !enemyMeshes.includes(curr)) {
                curr = curr.parent;
            }

            if (curr) {
                const enemy = this.enemies.find(e => e.mesh === curr);
                if (enemy) {
                    this.createExplosion(hit.point, 0x00ff00, false);
                    if (enemy.takeDamage(weapon.damage)) {
                        this.score += 100;
                        this.updateHUD();
                        this.createExplosion(enemy.mesh.position, 0xff0000, true);
                    }
                }
            }
        }
        this.createTracer(hitPoint, weapon.color);
    }

    fireProjectile(weapon) {
        const start = this.weaponMesh.position.clone().add(new THREE.Vector3(0, 0, -1));
        start.applyMatrix4(this.camera.matrixWorld);
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);

        const geo = new THREE.IcosahedronGeometry(0.5, 0);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff4400, wireframe: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(start);

        this.scene.add(mesh);
        this.projectiles.push({
            mesh,
            velocity: forward.multiplyScalar(30),
            life: 5.0,
            damage: weapon.damage,
            isRocket: true
        });
    }

    updateProjectiles(delta) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            if (p.mesh) {
                p.mesh.position.add(p.velocity.clone().multiplyScalar(delta));
                p.life -= delta;

                if (p.isRocket) {
                    p.mesh.rotation.x += delta * 5;
                    p.mesh.rotation.z += delta * 2;
                }

                if (p.life <= 0) {
                    this.scene.remove(p.mesh);
                    if (p.mesh.geometry) p.mesh.geometry.dispose();
                    if (p.mesh.material) p.mesh.material.dispose();

                    if (p.isRocket) {
                        this.createExplosion(p.mesh.position, 0xff4400, true);
                        this.playSound(200, 'square', 0.5, 0.5);
                    }
                    this.projectiles.splice(i, 1);
                }
            } else {
                this.projectiles.splice(i, 1);
            }
        }
    }

    createTracer(hitPoint, color) {
        const target = hitPoint || this.camera.position.clone().add(new THREE.Vector3(0, 0, -100).applyQuaternion(this.camera.quaternion));
        const start = this.weaponMesh.position.clone().add(new THREE.Vector3(0, -0.1, -0.5));
        start.applyMatrix4(this.camera.matrixWorld);

        const dist = start.distanceTo(target);
        const geo = new THREE.BoxGeometry(0.05, 0.05, dist);
        const mat = new THREE.MeshBasicMaterial({ color: color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(start).lerp(target, 0.5);
        mesh.lookAt(target);
        this.scene.add(mesh);
        this.projectiles.push({ mesh, velocity: new THREE.Vector3(), life: 0.1 });
    }

    createExplosion(pos, color, isBig = false, life = null) {
        const count = isBig ? 60 : 15;
        const spread = isBig ? 3.0 : 0.5;

        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = [];
        for (let i = 0; i < count; i++) {
            positions[i * 3] = pos.x; positions[i * 3 + 1] = pos.y; positions[i * 3 + 2] = pos.z;
            velocities.push({
                x: (Math.random() - 0.5) * 10 * spread,
                y: (Math.random() - 0.5) * 10 * spread + (isBig ? 5 : 0),
                z: (Math.random() - 0.5) * 10 * spread
            });
        }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color, size: isBig ? 0.8 : 0.3, transparent: true, blending: THREE.AdditiveBlending
        });
        const ps = new THREE.Points(geo, mat);
        this.scene.add(ps);
        this.particles.push({ mesh: ps, velocities, life: life !== null ? life : (isBig ? 1.5 : 0.5) });
    }

    updateParticles(delta) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            const pos = p.mesh.geometry.attributes.position.array;
            for (let j = 0; j < p.velocities.length; j++) {
                pos[j * 3] += p.velocities[j].x * delta;
                pos[j * 3 + 1] += p.velocities[j].y * delta;
                pos[j * 3 + 2] += p.velocities[j].z * delta;
            }
            p.mesh.geometry.attributes.position.needsUpdate = true;
            p.life -= delta;
            p.mesh.material.opacity = p.life;
            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                this.particles.splice(i, 1);
            }
        }
    }

    playSound(freq, type, duration, vol) {
        if (!this.audioCtx) return;
        const o = this.audioCtx.createOscillator();
        const g = this.audioCtx.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(vol, this.audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);
        o.connect(g); g.connect(this.audioCtx.destination);
        o.start(); o.stop(this.audioCtx.currentTime + duration);
    }

    playMusic() {
        if (!this.audioCtx) return;
        if (this.musicInterval) clearInterval(this.musicInterval);

        let noteIdx = 0;
        const notes = [
            110, 110, 220, 110, 110, 196, 110, 110, 185, 110, 110, 174, 110, 110, 164, 155
        ];

        const playNote = () => {
            if (!this.active || this.isGameOver) return;

            const freq = notes[noteIdx];
            noteIdx = (noteIdx + 1) % notes.length;

            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

            const filter = this.audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 1000;

            gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.15);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.audioCtx.destination);

            osc.start();
            osc.stop(this.audioCtx.currentTime + 0.15);
        };

        this.musicInterval = setInterval(playNote, 150);
    }

    createHUD() {
        if (document.getElementById('doom-hud')) return;

        this.hud = document.createElement('div');
        this.hud.id = 'doom-hud';
        this.hud.style.position = 'absolute';
        this.hud.style.bottom = '20px';
        this.hud.style.left = '20px';
        this.hud.style.width = '100vw'; // Viewport width
        this.hud.style.height = '100vh'; // Viewport height
        this.hud.style.pointerEvents = 'none';
        this.hud.style.color = '#ff0033';
        this.hud.style.fontFamily = "'Orbitron', sans-serif";
        this.hud.style.fontSize = '24px';
        this.hud.style.textShadow = '0 0 10px #ff0000';
        this.hud.style.zIndex = '4000'; // HIGHER THAN ARCHIVE CONTAINER (3000)

        this.hud.innerHTML = `
            <div style="position:absolute; bottom:20px; left:20px; pointer-events:none;">
                <div>SCORE: <span id="doom-score">0</span></div>
                <div>WAVE: <span id="doom-wave">1</span>/5</div>
                <div style="margin-top:10px; font-size:18px;">WEAPON: <span id="doom-weapon">BLASTER</span></div>
            </div>
        `;
        document.body.appendChild(this.hud);
    }

    updateHUD() {
        if (!this.hud) return;
        const w = this.weapons[this.currentWeaponIdx];
        const scoreEl = document.getElementById('doom-score');
        const waveEl = document.getElementById('doom-wave');
        const weaponEl = document.getElementById('doom-weapon');

        if (scoreEl) scoreEl.innerText = this.score;
        if (waveEl) waveEl.innerText = `${this.wave}/5`;
        if (weaponEl) {
            weaponEl.innerText = w.name;
            weaponEl.style.color = '#' + new THREE.Color(w.color).getHexString();
        }
    }

    shoot() {
        if (!this.active) return;
        const w = this.weapons[this.currentWeaponIdx];
        const now = Date.now();
        if (now - w.lastShot < w.cooldown) return;
        w.lastShot = now;

        this.weaponRecoil = 0.2;
        this.muzzleLight.intensity = 5;
        setTimeout(() => { if (this.muzzleLight) this.muzzleLight.intensity = 0; }, 50);

        // Sounds
        if (w.name === "BLASTER") this.playSound(800, 'sine', 0.1, 0.3);
        if (w.name === "SHOTGUN") {
            this.playSound(100, 'sawtooth', 0.2, 0.5);
            this.playSound(200, 'square', 0.1, 0.3);
            console.log("Shotgun fired multiple times!"); // Debug log for shotgun fire
        }
        if (w.name === "LAUNCHER") {
            this.playSound(60, 'triangle', 0.5, 0.5);
        }

        if (w.type === 'hitscan') {
            this.fireHitscan(w);
        } else if (w.type === 'spread') {
            // SCATTER SHOT: VISIBLE SPREAD
            // We fire 1 central shot + 14 scattered shots
            this.fireHitscan(w, 0);
            for (let i = 0; i < 14; i++) {
                // Increased spread factor to 0.15 for distinct shotgun feel
                this.fireHitscan(w, 0.15);
            }
        } else if (w.type === 'projectile') {
            this.fireProjectile(w);
        }
    }

    createWeaponMesh() {
        if (this.weaponMesh) this.camera.remove(this.weaponMesh);

        this.weaponMesh = new THREE.Group();
        this.weaponMesh.position.set(0.3, -0.3, -0.6);
        this.camera.add(this.weaponMesh);

        // 1. Blaster Mesh
        this.blasterMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.3, 0.8),
            new THREE.MeshBasicMaterial({ color: 0x33ff33, wireframe: true })
        );
        this.weaponMesh.add(this.blasterMesh);

        // 2. Shotgun Mesh 
        this.shotgunMesh = new THREE.Group();
        const barrelL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6), new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
        barrelL.rotation.x = Math.PI / 2; barrelL.position.set(-0.1, 0, 0);
        const barrelR = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6), new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
        barrelR.rotation.x = Math.PI / 2; barrelR.position.set(0.1, 0, 0);
        this.shotgunMesh.add(barrelL, barrelR);
        this.weaponMesh.add(this.shotgunMesh);

        // 3. Launcher Mesh 
        this.launcherMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.2, 1.0, 8),
            new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true })
        );
        this.launcherMesh.rotation.x = Math.PI / 2;
        this.weaponMesh.add(this.launcherMesh);

        this.muzzleLight = new THREE.PointLight(0xffffff, 0, 5);
        this.muzzleLight.position.set(0, 0, -1.0);
        this.weaponMesh.add(this.muzzleLight);

        this.updateWeaponVisuals();
    }

    updateWeaponVisuals() {
        if (!this.weaponMesh) return;
        const w = this.weapons[this.currentWeaponIdx];
        this.blasterMesh.visible = (w.name === "BLASTER");
        this.shotgunMesh.visible = (w.name === "SHOTGUN");
        this.launcherMesh.visible = (w.name === "LAUNCHER");
        this.muzzleLight.color.setHex(w.color);
    }

    handleKeys(e) {
        if (this.isGameOver && e.key.toLowerCase() === 'r') {
            this.resetGame();
            return;
        }

        // ESCAPE TO EXIT
        if (e.key === 'Escape') {
            this.deactivate();
            this.cooldown = Date.now() + 3000; // 3 second cooldown to prevent re-trigger on pad
            return;
        }

        if (e.key === '1') this.currentWeaponIdx = 0;
        if (e.key === '2') this.currentWeaponIdx = 1;
        if (e.key === '3') this.currentWeaponIdx = 2;
        this.updateWeaponVisuals();
        this.updateHUD();
    }
}
