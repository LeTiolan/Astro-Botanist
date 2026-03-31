import * as THREE from 'three';

/** =========================================================================
 * ASTRO-BOTANIST: DEEP CORE ENGINE
 * Advanced WebGL Prototype utilizing Custom Physics & Procedural Generation
 * ========================================================================= */

// --- 1. CORE ENGINE STATE ---
const ENGINE = {
    scene: null, camera: null, renderer: null,
    clock: new THREE.Clock(),
    delta: 0, time: 0,
    state: 'MENU', // MENU, PLAY, OVER, WIN
    config: { baseRadius: 20, gravity: 9.8, maxAtmo: 100 }
};

const PLAYER = {
    mesh: null, group: new THREE.Group(),
    velocity: new THREE.Vector3(),
    position: new THREE.Vector3(0, 30, 0), // Start above planet
    rotation: new THREE.Quaternion(),
    energy: 100,
    speed: 15.0,
    boostMult: 2.5
};

const WORLD = {
    mesh: null, geometry: null,
    atmoMesh: null,
    trees: [], particles: [],
    atmoLevel: 0
};

const INPUT = {
    w: false, a: false, s: false, d: false, 
    space: false, shift: false,
    spacePressed: false
};

// --- 2. UI MANAGER ---
const UI = {
    screens: {
        menu: document.getElementById('menu-screen'),
        hud: document.getElementById('hud-screen'),
        end: document.getElementById('end-screen')
    },
    bars: { atmo: document.getElementById('bar-atmo'), energy: document.getElementById('bar-energy') },
    txt: {
        atmo: document.getElementById('txt-atmo'),
        energy: document.getElementById('txt-energy'),
        vel: document.getElementById('txt-velocity'),
        alt: document.getElementById('txt-alt'),
        endTitle: document.getElementById('end-title'),
        endDesc: document.getElementById('end-desc')
    },
    switchScreen(target) {
        Object.values(this.screens).forEach(s => s.classList.remove('active'));
        this.screens[target].classList.add('active');
    },
    update() {
        this.bars.atmo.style.width = `${WORLD.atmoLevel}%`;
        this.txt.atmo.innerText = `${Math.floor(WORLD.atmoLevel)}%`;
        
        this.bars.energy.style.width = `${PLAYER.energy}%`;
        this.txt.energy.innerText = `${Math.floor(PLAYER.energy)}%`;

        const velMag = PLAYER.velocity.length().toFixed(2);
        this.txt.vel.innerText = `VEL: ${velMag} u/s`;

        const alt = (PLAYER.group.position.length() - ENGINE.config.baseRadius).toFixed(2);
        this.txt.alt.innerText = `ALT: ${alt} u`;
    }
};

// --- 3. MATH & PROCEDURAL UTILS ---
// Simple seeded random for consistent terrain generation
class PRNG {
    constructor(seed) { this.seed = seed; }
    next() {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
}
const rng = new PRNG(1337);

function generateDisplacedSphere(radius, segments) {
    const geo = new THREE.IcosahedronGeometry(radius, segments);
    const posAttribute = geo.attributes.position;
    const vertex = new THREE.Vector3();
    
    // Deform vertices to create mountains and valleys
    for (let i = 0; i < posAttribute.count; i++) {
        vertex.fromBufferAttribute(posAttribute, i);
        // Pseudo-noise using sine waves
        const noise = Math.sin(vertex.x * 0.5) * Math.cos(vertex.y * 0.5) * Math.sin(vertex.z * 0.5);
        const elevation = 1 + (noise * 0.08); // Max 8% height variance
        vertex.multiplyScalar(elevation);
        posAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    geo.computeVertexNormals();
    return geo;
}

// --- 4. INITIALIZATION ---
function initEngine() {
    ENGINE.scene = new THREE.Scene();
    ENGINE.scene.background = new THREE.Color(0x020205);
    ENGINE.scene.fog = new THREE.FogExp2(0x020205, 0.008);

    ENGINE.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    ENGINE.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    ENGINE.renderer.setSize(window.innerWidth, window.innerHeight);
    ENGINE.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.body.appendChild(ENGINE.renderer.domElement);

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0x4466ff, 0x111122, 0.5);
    ENGINE.scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.5);
    dirLight.position.set(50, 20, -30);
    ENGINE.scene.add(dirLight);

    buildWorld();
    buildPlayer();

    // Event Listeners
    window.addEventListener('resize', () => {
        ENGINE.camera.aspect = window.innerWidth / window.innerHeight;
        ENGINE.camera.updateProjectionMatrix();
        ENGINE.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    document.getElementById('btn-start').addEventListener('click', startGame);
    document.getElementById('btn-restart').addEventListener('click', resetGame);

    animate();
}

function buildWorld() {
    // Planet Mesh
    WORLD.geometry = generateDisplacedSphere(ENGINE.config.baseRadius, 16);
    const mat = new THREE.MeshStandardMaterial({ 
        color: 0x2a2830, roughness: 0.9, flatShading: true 
    });
    WORLD.mesh = new THREE.Mesh(WORLD.geometry, mat);
    ENGINE.scene.add(WORLD.mesh);

    // Atmosphere Shell
    const atmoGeo = new THREE.SphereGeometry(ENGINE.config.baseRadius + 5, 32, 32);
    const atmoMat = new THREE.MeshPhongMaterial({
        color: 0x00f0ff, transparent: true, opacity: 0.0,
        side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false
    });
    WORLD.atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
    ENGINE.scene.add(WORLD.atmoMesh);
}

function buildPlayer() {
    // Player Ship (Sci-fi Lander)
    const hullGeo = new THREE.ConeGeometry(0.8, 2.5, 6);
    hullGeo.rotateX(Math.PI / 2);
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8, roughness: 0.2 });
    PLAYER.mesh = new THREE.Mesh(hullGeo, hullMat);
    
    // Engine Glow
    const glowGeo = new THREE.SphereGeometry(0.4, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(0, 0, -1.2);
    PLAYER.mesh.add(glow);

    PLAYER.group.add(PLAYER.mesh);
    PLAYER.group.position.copy(PLAYER.position);
    ENGINE.scene.add(PLAYER.group);
}

// --- 5. INPUT HANDLING ---
function handleKeyDown(e) {
    if (e.key === 'w' || e.key === 'W') INPUT.w = true;
    if (e.key === 's' || e.key === 'S') INPUT.s = true;
    if (e.key === 'a' || e.key === 'A') INPUT.a = true;
    if (e.key === 'd' || e.key === 'D') INPUT.d = true;
    if (e.key === 'Shift') INPUT.shift = true;
    
    if (e.code === 'Space') {
        INPUT.space = true;
        if (ENGINE.state === 'PLAY' && !INPUT.spacePressed) {
            deploySeed();
            INPUT.spacePressed = true;
        }
    }
}

function handleKeyUp(e) {
    if (e.key === 'w' || e.key === 'W') INPUT.w = false;
    if (e.key === 's' || e.key === 'S') INPUT.s = false;
    if (e.key === 'a' || e.key === 'A') INPUT.a = false;
    if (e.key === 'd' || e.key === 'D') INPUT.d = false;
    if (e.key === 'Shift') INPUT.shift = false;
    if (e.code === 'Space') {
        INPUT.space = false;
        INPUT.spacePressed = false;
    }
}

// --- 6. GAME LOGIC ---
function startGame() {
    ENGINE.state = 'PLAY';
    UI.switchScreen('hud');
}

function resetGame() {
    // Clear World
    WORLD.trees.forEach(t => WORLD.mesh.remove(t));
    WORLD.trees = [];
    WORLD.particles.forEach(p => ENGINE.scene.remove(p.mesh));
    WORLD.particles = [];
    
    WORLD.atmoLevel = 0;
    WORLD.atmoMesh.material.opacity = 0;
    WORLD.mesh.material.color.setHex(0x2a2830);

    // Reset Player
    PLAYER.position.set(0, 30, 0);
    PLAYER.velocity.set(0,0,0);
    PLAYER.energy = 100;
    
    ENGINE.state = 'PLAY';
    UI.switchScreen('hud');
}

function deploySeed() {
    if (PLAYER.energy < 10) return;
    
    // Raycast straight down from ship to find actual terrain height
    const direction = PLAYER.group.position.clone().normalize().negate();
    const raycaster = new THREE.Raycaster(PLAYER.group.position, direction);
    const intersects = raycaster.intersectObject(WORLD.mesh);

    if (intersects.length > 0) {
        const hitPoint = intersects[0].point;
        // Verify we are close enough to the ground
        if (PLAYER.group.position.distanceTo(hitPoint) < 15) {
            PLAYER.energy -= 10;
            spawnTree(hitPoint, intersects[0].face.normal);
            spawnParticles(hitPoint, 0x39ff14, 20); // Green burst
            
            WORLD.atmoLevel += 5;
            if (WORLD.atmoLevel >= ENGINE.config.maxAtmo) {
                triggerWin();
            }
        }
    }
}

function spawnTree(worldPos, normal) {
    const group = new THREE.Group();
    
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.4, 2, 5),
        new THREE.MeshStandardMaterial({ color: 0x3d2817 })
    );
    trunk.position.y = 1;
    
    const canopy = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1.5),
        new THREE.MeshStandardMaterial({ color: 0x39ff14, emissive: 0x114411 })
    );
    canopy.position.y = 3;
    
    group.add(trunk, canopy);
    
    // Attach to planet
    WORLD.mesh.add(group);
    const localPos = WORLD.mesh.worldToLocal(worldPos.clone());
    group.position.copy(localPos);
    
    // Orient to surface normal
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), normal);
    
    // Scale animation setup
    group.scale.set(0.01, 0.01, 0.01);
    WORLD.trees.push(group);
}

function spawnParticles(pos, colorHex, count) {
    const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex });
    
    for(let i=0; i<count; i++) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        
        // Random outward velocity
        const vel = new THREE.Vector3(
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5
        );
        
        ENGINE.scene.add(mesh);
        WORLD.particles.push({ mesh, vel, life: 1.0 });
    }
}

function triggerWin() {
    ENGINE.state = 'WIN';
    UI.switchScreen('end');
    UI.txt.endTitle.innerText = "PLANET RESTORED";
    UI.txt.endTitle.style.color = "#39ff14";
    UI.txt.endDesc.innerText = "Atmospheric integrity at 100%.";
    WORLD.mesh.material.color.lerp(new THREE.Color(0x1a3320), 1);
}

function triggerGameOver() {
    ENGINE.state = 'OVER';
    UI.switchScreen('end');
    UI.txt.endTitle.innerText = "SYSTEM FAILURE";
    UI.txt.endTitle.style.color = "#ff3333";
    UI.txt.endDesc.innerText = "Ship energy depleted.";
}

// --- 7. PHYSICS & MOVEMENT ENGINE ---
function updatePhysics(dt) {
    if (ENGINE.state !== 'PLAY') return;

    // 1. Calculate Gravity Vector (Pulling toward 0,0,0)
    const gravityDir = PLAYER.group.position.clone().normalize().negate();
    const gravityAccel = gravityDir.clone().multiplyScalar(ENGINE.config.gravity * dt);
    
    // 2. Input / Thrusters
    let currentSpeed = PLAYER.speed;
    if (INPUT.shift && PLAYER.energy > 0) {
        currentSpeed *= PLAYER.boostMult;
        PLAYER.energy -= 2 * dt; // Drain energy when boosting
    }

    // Ship local axes
    const up = PLAYER.group.position.clone().normalize();
    const right = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0,1,0)).normalize();
    if (right.length() === 0) right.set(1,0,0); // Handle pole singularity
    const forward = new THREE.Vector3().crossVectors(right, up).normalize();

    const thrust = new THREE.Vector3();
    if (INPUT.w) thrust.add(forward);
    if (INPUT.s) thrust.sub(forward);
    if (INPUT.a) thrust.sub(right);
    if (INPUT.d) thrust.add(right);

    if (thrust.length() > 0) {
        thrust.normalize().multiplyScalar(currentSpeed * dt);
        PLAYER.velocity.add(thrust);
    }

    // 3. Apply Gravity to Velocity
    PLAYER.velocity.add(gravityAccel);

    // 4. Apply Velocity to Position
    PLAYER.group.position.add(PLAYER.velocity.clone().multiplyScalar(dt));

    // 5. Collision Detection (Ground Constraint)
    // We use distance from center as a rough collision bounds, but add raycasting for displaced terrain
    const distFromCenter = PLAYER.group.position.length();
    
    // Raycast to find exact terrain height beneath ship
    const raycaster = new THREE.Raycaster(PLAYER.group.position, gravityDir);
    const intersects = raycaster.intersectObject(WORLD.mesh);
    
    let floorDist = ENGINE.config.baseRadius; // Fallback
    if (intersects.length > 0) {
        floorDist = intersects[0].distance;
        const actualAltitude = PLAYER.group.position.length() - intersects[0].point.length();
        
        // Hard collision with ground
        if (actualAltitude < 1.0) {
            PLAYER.group.position.copy(intersects[0].point).add(up.multiplyScalar(1.0));
            
            // Bounce/Friction logic
            const bounce = PLAYER.velocity.dot(up);
            if (bounce < 0) {
                PLAYER.velocity.sub(up.clone().multiplyScalar(bounce * 1.5)); // Dampened bounce
                PLAYER.velocity.multiplyScalar(0.9); // Surface friction
            }
        }
    }

    // Atmospheric Drag (Slow down over time)
    PLAYER.velocity.multiplyScalar(0.99);

    // 6. Orient Ship visually
    // Look in the direction of velocity, but keep "up" pointing away from planet
    if (PLAYER.velocity.lengthSq() > 0.1) {
        const lookTarget = PLAYER.group.position.clone().add(PLAYER.velocity);
        const matrix = new THREE.Matrix4().lookAt(PLAYER.group.position, lookTarget, up);
        PLAYER.group.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(matrix), 0.1);
    } else {
        // Idle orientation
        const matrix = new THREE.Matrix4().lookAt(PLAYER.group.position, PLAYER.group.position.clone().add(forward), up);
        PLAYER.group.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(matrix), 0.05);
    }

    // Camera Follow logic (Smooth Spring-like behavior)
    const camOffset = up.clone().multiplyScalar(15).add(forward.clone().multiplyScalar(-20));
    const idealCamPos = PLAYER.group.position.clone().add(camOffset);
    ENGINE.camera.position.lerp(idealCamPos, 0.05);
    ENGINE.camera.lookAt(PLAYER.group.position);

    // Energy recovery if idle
    if (!INPUT.w && !INPUT.s && !INPUT.a && !INPUT.d && !INPUT.shift) {
        PLAYER.energy = Math.min(100, PLAYER.energy + (1 * dt));
    }

    if (PLAYER.energy <= 0 && ENGINE.state === 'PLAY') triggerGameOver();
}

function updateWorld(dt) {
    // Spin planet slowly
    WORLD.mesh.rotation.y += 0.05 * dt;

    // Update Atmosphere Visuals
    const targetOpacity = (WORLD.atmoLevel / ENGINE.config.maxAtmo) * 0.5;
    WORLD.atmoMesh.material.opacity = THREE.MathUtils.lerp(WORLD.atmoMesh.material.opacity, targetOpacity, 0.05);

    // Animate Tree Growth
    WORLD.trees.forEach(tree => {
        if (tree.scale.x < 1.0) {
            tree.scale.addScalar(dt * 0.5);
        }
    });

    // Animate Particles
    for (let i = WORLD.particles.length - 1; i >= 0; i--) {
        const p = WORLD.particles[i];
        p.mesh.position.add(p.vel.clone().multiplyScalar(dt));
        p.life -= dt;
        p.mesh.scale.setScalar(p.life);
        if (p.life <= 0) {
            ENGINE.scene.remove(p.mesh);
            WORLD.particles.splice(i, 1);
        }
    }
}

// --- 8. MAIN RENDER LOOP ---
function animate() {
    requestAnimationFrame(animate);
    
    ENGINE.delta = ENGINE.clock.getDelta();
    ENGINE.time = ENGINE.clock.getElapsedTime();

    if (ENGINE.state === 'PLAY') {
        updatePhysics(ENGINE.delta);
        UI.update();
    } else if (ENGINE.state === 'MENU') {
        // Cinematic idle rotation
        const camRad = 40;
        ENGINE.camera.position.set(Math.sin(ENGINE.time*0.2)*camRad, 15, Math.cos(ENGINE.time*0.2)*camRad);
        ENGINE.camera.lookAt(0,0,0);
        WORLD.mesh.rotation.y += 0.1 * ENGINE.delta;
    }

    updateWorld(ENGINE.delta);
    ENGINE.renderer.render(ENGINE.scene, ENGINE.camera);
}

// Boot Sequence
initEngine();
