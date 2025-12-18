import * as THREE from 'three';

export class GlitchEnemy {
  static tempDir = new THREE.Vector3();

  constructor(scene, position, target, type = 'normal') {
    this.scene = scene;
    this.target = target;
    this.type = type;
    this.active = true;

    // Base Stats
    this.life = 10;
    this.speed = 16;
    this.damage = 10;
    this.color = 0xff0000;
    this.scale = 6.0;

    // Specialized Variants
    if (type === 'scout') {
      this.life = 5;
      this.speed = 28;
      this.color = 0xffff00; // Yellow
      this.scale = 3.5;
    } else if (type === 'tank') {
      this.life = 50;
      this.speed = 9;
      this.damage = 50;
      this.color = 0x3366ff; // Steel Blue
      this.scale = 14.0;
    } else if (type === 'wraith') {
      this.life = 12;
      this.speed = 18;
      this.color = 0x00ffff; // Cyan
      this.scale = 5.0;
      this.isWraith = true;
    } else if (type === 'berzerker') {
      this.life = 8;
      this.speed = 40;
      this.damage = 25;
      this.color = 0xff00ff; // Magenta
      this.scale = 4.5;
    }

    this.mesh = new THREE.Group();
    this.mesh.position.copy(position);

    // Demon Head Visuals
    const headGeo = new THREE.BoxGeometry(1, 1.2, 1);
    const mat = new THREE.MeshBasicMaterial({ color: this.color, wireframe: true, transparent: type === 'wraith', opacity: 0.6 });
    const head = new THREE.Mesh(headGeo, mat);
    this.mesh.add(head);

    // Horns
    const hornGeo = new THREE.ConeGeometry(0.2, 0.8, 8);
    const hornMat = new THREE.MeshBasicMaterial({ color: (type === 'tank' || type === 'berzerker' ? 0xff4400 : 0xffaa00) });

    const hornL = new THREE.Mesh(hornGeo, hornMat);
    hornL.position.set(-0.4, 0.8, 0);
    hornL.rotation.z = 0.3;
    this.mesh.add(hornL);

    const hornR = new THREE.Mesh(hornGeo, hornMat);
    hornR.position.set(0.4, 0.8, 0);
    hornR.rotation.z = -0.3;
    this.mesh.add(hornR);

    // Berzerker Extra Spikes
    if (type === 'berzerker') {
      const spikeGeo = new THREE.ConeGeometry(0.1, 1.2, 4);
      const spikeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      spike.position.set(0, 0.8, 0);
      this.mesh.add(spike);
    }

    // Eyes
    const eyeGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const eyeMat = new THREE.MeshBasicMaterial({ color: (type === 'scout' ? 0xffffff : 0x00ff00) });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.25, 0.1, 0.5);
    this.mesh.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.25, 0.1, 0.5);
    this.mesh.add(eyeR);

    this.mesh.scale.set(this.scale, this.scale, this.scale);
    this.scene.add(this.mesh);

    this.createHealthBar();
  }

  createHealthBar() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 8;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(0, 0, 64, 8);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    this.hpSprite = new THREE.Sprite(mat);
    this.hpSprite.scale.set(2.0, 0.25, 1);
    this.hpSprite.position.set(0, 2.0, 0);
    this.mesh.add(this.hpSprite);
    this.hpCanvas = canvas;
    this.hpCtx = ctx;
    this.hpTex = tex;
    this.maxLife = this.life;
  }

  updateHealthBar() {
    if (!this.hpCtx) return;
    const width = Math.max(0, (this.life / this.maxLife) * 64);
    this.hpCtx.clearRect(0, 0, 64, 8);
    this.hpCtx.fillStyle = '#330000';
    this.hpCtx.fillRect(0, 0, 64, 8);
    this.hpCtx.fillStyle = (this.life / this.maxLife) < 0.3 ? '#ff0000' : '#00ff00';
    this.hpCtx.fillRect(0, 0, width, 8);
    this.hpTex.needsUpdate = true;
  }

  update(delta, playerPos) {
    if (!this.active) return 'remove';

    // TARGETING LOGIC
    let targetPos = this.target ? this.target.position : null;
    this.isTargetingPlayer = false;

    // Non-wraiths will hunt the player if they are close
    if (!this.isWraith && playerPos) {
      const distSq = this.mesh.position.distanceToSquared(playerPos);
      if (distSq < 10000) { // 100 units squared
        targetPos = playerPos;
        this.isTargetingPlayer = true;
      }
    }

    if (!targetPos) return 'remove';

    // VECTOR POOLING
    GlitchEnemy.tempDir.subVectors(targetPos, this.mesh.position).normalize();
    this.mesh.position.add(GlitchEnemy.tempDir.multiplyScalar(this.speed * delta));

    // Rotate
    this.mesh.rotation.y += delta * 5;
    if (this.type === 'berzerker') {
      this.mesh.rotation.z += delta * 10;
    }

    // Attack Reach
    const attackDistSq = this.mesh.position.distanceToSquared(targetPos);
    if (attackDistSq < 16.0) {
      return this.isTargetingPlayer ? 'damage_player' : 'damage_crystal';
    }
    return 'move';
  }

  takeDamage(amount) {
    this.life -= amount;
    this.updateHealthBar();

    // Flash
    this.mesh.children.forEach(c => {
      if (c.material) {
        c.material.color.setHex(0xffffff);
        setTimeout(() => {
          if (this.active && c.material) {
            if (c.geometry.type === 'BoxGeometry' && c.position.y === 0) c.material.color.setHex(this.color);
            else if (c.geometry.type === 'ConeGeometry') c.material.color.setHex(this.type === 'tank' || this.type === 'berzerker' ? 0xff4400 : 0xffaa00);
            else c.material.color.setHex(this.type === 'scout' ? 0xffffff : 0x00ff00);
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
