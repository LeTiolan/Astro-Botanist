import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

/** =========================================================================
 * ASTRO-BOTANIST: ORBITAL MECHANICS ENGINE (PART 1)
 * Architecture, Procedural Generation, and UI Binding
 * ========================================================================= */

// --- 1. GLOBAL STATE & CONFIGURATION ---
const CONFIG = {
  planetRadius: 50,
gravity: 600,        // Gravitational parameter (mu) for orbital mechanics
    atmoMax: 100,         // Target atmosphere level
    maxPayloads: 100,
    cameraSmooth: 0.1,
    orbitColors: {
        prograde: 0x38bdf8,
        retrograde: 0xf43f5e,
        stable: 0x34d399
    }
};

const ENGINE = {
    scene: null,
    camera: null,
    renderer: null,
    clock: new THREE.Clock(),
    state: 'START', // START, PLAY, WIN, OVER
    keys: { w: false, s: false, a: false, d: false, q: false, e: false, space: false, spaceLocked: false },
    // NEW: Mouse and Camera tracking
    mouse: { isDown: false, lastX: 0, lastY: 0 },
camTarget: { theta: 0, phi: 0.2, radius: 20 },
camCurrent: { theta: 0, phi: 0.2, radius: 20 }
};

const PLAYER = {
    mesh: null,
    orbitAngle: 0,
    altitude: 50,
    velocity: 5.5,
    payloads: CONFIG.maxPayloads,
    trail: null,
    // NEW: Orbital Lock tracking
    canLock: false,
    isLocked: false,
    orbitAxis: new THREE.Vector3(),
    angularVelocity: 0
};

const WORLD = {
    group: new THREE.Group(),
    planetMesh: null,
    atmoMesh: null,
    trees: [],
    projectiles: [],
    particles: [],
    atmosphere: 0
};

// --- 2. UI MANAGER (Glassmorphism Bindings) ---
const UI = {
    screens: {
        start: document.getElementById('menu-start'),
        lore: document.getElementById('menu-lore'),
        hud: document.getElementById('hud-active'),
        win: document.getElementById('menu-win')
    },
  buttons: {
        play: document.getElementById('btn-play'),
        lore: document.getElementById('btn-lore'),
        closeLore: document.getElementById('btn-close-lore'),
        fire: document.getElementById('btn-fire'),
        restart: document.getElementById('btn-restart'),
        lock: document.getElementById('btn-lock')
    },
    bars: {
        atmo: document.getElementById('bar-atmo'),
        payload: document.getElementById('bar-payload')
    },
    text: {
        atmo: document.getElementById('txt-atmo'),
        payload: document.getElementById('txt-payload'),
        vel: document.getElementById('txt-vel'),
        alt: document.getElementById('txt-alt')
    },
    
   init() {
        // Bind Menu Interactions
        this.buttons.play.addEventListener('click', () => {
            this.switchScreen('hud');
            ENGINE.state = 'PLAY';
        });
        
        this.buttons.lore.addEventListener('click', () => {
            this.switchScreen('lore');
        });
        
        this.buttons.closeLore.addEventListener('click', () => {
            this.switchScreen('start');
        });
        
        this.buttons.restart.addEventListener('click', () => {
            location.reload(); // Hard reset for prototype
        });

        // --- NEW: Orbital Lock Listeners ---
      this.buttons.lock.addEventListener('click', () => {
    toggleOrbitLock();
});

document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'l') {
        toggleOrbitLock();
    }
});

        // Touch/Mouse binding for the fire button
      this.buttons.fire.addEventListener('mousedown', () => { ENGINE.keys.space = true; ENGINE.keys.spaceLocked = false; });
this.buttons.fire.addEventListener('mouseup', () => { ENGINE.keys.space = false; ENGINE.keys.spaceLocked = false; });
        this.buttons.fire.addEventListener('touchstart', (e) => { e.preventDefault(); ENGINE.keys.space = true; });
        this.buttons.fire.addEventListener('touchend', (e) => { e.preventDefault(); ENGINE.keys.space = false; });
    },

    switchScreen(targetName) {
        Object.values(this.screens).forEach(screen => {
            if (screen) {
                screen.classList.remove('active-screen');
                screen.classList.add('hidden');
            }
        });
        if (this.screens[targetName]) {
            this.screens[targetName].classList.remove('hidden');
            // Slight delay for smooth CSS transition
            setTimeout(() => this.screens[targetName].classList.add('active-screen'), 50);
        }
    },

 updateHUD() {
        if (ENGINE.state !== 'PLAY') return;

        // Update Liquid Bars (Wrapped in safety checks)
        const atmoPercent = (WORLD.atmosphere / CONFIG.atmoMax) * 100;
        if (this.bars.atmo) this.bars.atmo.style.width = `${Math.min(atmoPercent, 100)}%`;
        if (this.text.atmo) this.text.atmo.innerText = `${Math.floor(atmoPercent)}%`;

        const payloadPercent = (PLAYER.payloads / CONFIG.maxPayloads) * 100;
        if (this.bars.payload) this.bars.payload.style.width = `${Math.max(payloadPercent, 0)}%`;
        if (this.text.payload) this.text.payload.innerText = PLAYER.payloads;

        // Update Telemetry (Wrapped in safety checks)
        if (this.text.vel) this.text.vel.innerText = `${PLAYER.velocity.toFixed(2)} km/s`;
        
        const surfaceAlt = PLAYER.altitude - CONFIG.planetRadius;
        if (this.text.alt) {
            this.text.alt.innerText = `${surfaceAlt.toFixed(1)} km`;
            // Telemetry warning colors
            if (surfaceAlt < 5) this.text.alt.style.color = 'var(--neon-purple)';
            else this.text.alt.style.color = 'var(--text-main)';
        }
    }
    };

// --- 3. CUSTOM MATH & PROCEDURAL NOISE ---
// A simplified seeded pseudo-random number generator for terrain consistency
class SimpleNoise {
    constructor() {
        this.seed = 1337;
    }
    random() {
        const x = Math.sin(this.seed++) * 10000;
        return x - Math.floor(x);
    }
    // Simple 3D noise approximation mapping a vector to a scalar
    noise3D(x, y, z) {
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 10000;
    return n - Math.floor(n);
}
}
const terrainNoise = new SimpleNoise();

function generateAsteroidGeometry(radius, detail) {
    const geometry = new THREE.IcosahedronGeometry(radius, detail);
    const positions = geometry.attributes.position;
    const vertex = new THREE.Vector3();

    // Displace vertices to create mountains and craters
    for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i);
        
        // Normalize for noise input
        const norm = vertex.clone().normalize();
        
        // Layer 1: Macro terrain (Continents/Oceans equivalent)
        const noise1 = terrainNoise.noise3D(norm.x * 2, norm.y * 2, norm.z * 2);
        // Layer 2: Micro terrain (Bumps/Craters)
        const noise2 = terrainNoise.noise3D(norm.x * 8, norm.y * 8, norm.z * 8);
        
        // Combine noise and map to an elevation multiplier
        const elevation = 1 + (noise1 * 0.1) + (noise2 * 0.05);
        
        vertex.multiplyScalar(elevation);
        positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    geometry.computeVertexNormals();
    return geometry;
}

// --- 4. ENGINE INITIALIZATION ---
function init() {
    // 4.1 Setup Scene
    ENGINE.scene = new THREE.Scene();
    ENGINE.scene.background = new THREE.Color(0x030508);
    // Deep space fog
    ENGINE.scene.fog = new THREE.FogExp2(0x030508, 0.005);

    // 4.2 Setup Camera
    ENGINE.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
   ENGINE.camera.position.set(0, 0, 160);

    // 4.3 Setup Renderer
    ENGINE.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    ENGINE.renderer.setSize(window.innerWidth, window.innerHeight);
    ENGINE.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Soft shadow maps
    ENGINE.renderer.shadowMap.enabled = true;
    ENGINE.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game-container').insertBefore(ENGINE.renderer.domElement, document.getElementById('ui-layer'));

    // 4.4 Setup Lighting
    const ambientLight = new THREE.AmbientLight(0x1a1a2e, 1.5);
    ENGINE.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff5e6, 3.0);
    sunLight.position.set(100, 50, -50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 300;
  sunLight.shadow.camera.left = -100;
sunLight.shadow.camera.right = 100;
sunLight.shadow.camera.top = 100;
sunLight.shadow.camera.bottom = -100;
    sunLight.shadow.bias = -0.001;
    ENGINE.scene.add(sunLight);

    // Rim light for that cinematic sci-fi glow
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 2.0);
    rimLight.position.set(-100, -50, 50);
    ENGINE.scene.add(rimLight);

    buildWorld();
    buildPlayer();
    
    UI.init();
    bindInputs();
    
    // Handle Window Resize
    window.addEventListener('resize', () => {
        ENGINE.camera.aspect = window.innerWidth / window.innerHeight;
        ENGINE.camera.updateProjectionMatrix();
        ENGINE.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Start the game loop (defined in Part 2)
    requestAnimationFrame(animate);
}

// --- 5. WORLD BUILDING ---
function buildWorld() {
    ENGINE.scene.add(WORLD.group);

    // Core Asteroid
    const planetGeo = generateAsteroidGeometry(CONFIG.planetRadius, 32);
    const planetMat = new THREE.MeshStandardMaterial({
        color: 0x111827,
        roughness: 0.8,
        metalness: 0.2,
        flatShading: true // Gives it a stylized, low-poly look that pairs well with smooth UI
    });
    WORLD.planetMesh = new THREE.Mesh(planetGeo, planetMat);
    WORLD.planetMesh.castShadow = true;
    WORLD.planetMesh.receiveShadow = true;
    WORLD.group.add(WORLD.planetMesh);

    // Atmosphere Shell (Soft, glowing, transparent sphere)
    const atmoGeo = new THREE.SphereGeometry(CONFIG.planetRadius * 1.3, 64, 64);
    const atmoMat = new THREE.MeshPhongMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.0, // Starts invisible
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    WORLD.atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
    WORLD.group.add(WORLD.atmoMesh);

 // Background Stars — Three layered systems for depth
function makeStarLayer(count, spread, minClear, size, color, opacity) {
    const geo = new THREE.BufferGeometry();
    const pos = [];
    let attempts = 0;
    while (pos.length / 3 < count && attempts < count * 10) {
        attempts++;
        const x = (Math.random() - 0.5) * spread;
        const y = (Math.random() - 0.5) * spread;
        const z = (Math.random() - 0.5) * spread;
        if (Math.abs(x) < minClear && Math.abs(y) < minClear && Math.abs(z) < minClear) continue;
        pos.push(x, y, z);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity, sizeAttenuation: true });
    return new THREE.Points(geo, mat);
}

// Layer 1: Dense distant field — tiny, cool white
ENGINE.scene.add(makeStarLayer(8000, 2000, 150, 0.4, 0xddeeff, 0.6));
// Layer 2: Mid-range warm stars — slightly yellow tint
ENGINE.scene.add(makeStarLayer(3000, 1200, 120, 0.7, 0xfff5cc, 0.5));
// Layer 3: Bright foreground stars — vivid, sparse
ENGINE.scene.add(makeStarLayer(400, 800, 100, 1.8, 0xffffff, 0.9));
// Layer 4: Rare blue giants
ENGINE.scene.add(makeStarLayer(80, 900, 100, 3.0, 0x99ccff, 1.0));

// --- 6. PLAYER/ORBITER BUILDING ---
function buildPlayer() {
    PLAYER.mesh = new THREE.Group();

    // --- FUSELAGE: tapered body, wider at engine end ---
    const fuselageGeo = new THREE.CylinderGeometry(0.55, 0.72, 5, 12);
    fuselageGeo.rotateX(Math.PI / 2);
    const fuselageMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.7, roughness: 0.2 });
    const fuselage = new THREE.Mesh(fuselageGeo, fuselageMat);
    fuselage.castShadow = true;
    PLAYER.mesh.add(fuselage);

    // --- NOSE CONE: blue tint, emissive glow ---
    const noseGeo = new THREE.ConeGeometry(0.55, 2.5, 12);
    noseGeo.rotateX(Math.PI / 2);
    const noseMat = new THREE.MeshStandardMaterial({ color: 0x7dd3fc, metalness: 0.8, roughness: 0.1, emissive: 0x0369a1, emissiveIntensity: 0.4 });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.z = 3.7;
    nose.castShadow = true;
    PLAYER.mesh.add(nose);

    // --- COCKPIT WINDOW ---
    const windowGeo = new THREE.SphereGeometry(0.28, 8, 8);
    const windowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const cockpit = new THREE.Mesh(windowGeo, windowMat);
    cockpit.position.set(0, 0.45, 2.8);
    PLAYER.mesh.add(cockpit);

    // --- ENGINE BELL: narrows toward front, flares at back ---
    const bellGeo = new THREE.CylinderGeometry(0.3, 1.1, 1.6, 12);
    bellGeo.rotateX(Math.PI / 2);
    const bellMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.95, roughness: 0.05 });
    const bell = new THREE.Mesh(bellGeo, bellMat);
    bell.position.z = -3.3;
    PLAYER.mesh.add(bell);

    // --- ENGINE INNER GLOW ---
    const glowGeo = new THREE.CircleGeometry(0.55, 16);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    const engineGlow = new THREE.Mesh(glowGeo, glowMat);
    engineGlow.position.z = -4.15;
    PLAYER.mesh.add(engineGlow);

    // --- SOLAR PANELS ---
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, metalness: 0.3, roughness: 0.5, emissive: 0x0c2340, emissiveIntensity: 0.3 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.1 });

    [-1, 1].forEach(side => {
        const panelGeo = new THREE.BoxGeometry(4.2, 0.06, 1.4);
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.position.set(side * 3.0, 0, 0);
        PLAYER.mesh.add(panel);

        // Panel frame
        const frameGeo = new THREE.BoxGeometry(4.3, 0.1, 0.08);
        [-0.65, 0, 0.65].forEach(z => {
            const frame = new THREE.Mesh(frameGeo, frameMat);
            frame.position.set(side * 3.0, 0, z);
            PLAYER.mesh.add(frame);
        });

        // Nav light on wing tip
        const navGeo = new THREE.SphereGeometry(0.18, 6, 6);
        const navMat = new THREE.MeshBasicMaterial({ color: side === -1 ? 0xff3333 : 0x33ff88 });
        const nav = new THREE.Mesh(navGeo, navMat);
        nav.position.set(side * 5.2, 0, 0);
        PLAYER.mesh.add(nav);
    });

    // --- FINS: 4 fins at the engine end ---
    const finMat = new THREE.MeshStandardMaterial({ color: 0xc084fc, metalness: 0.6, roughness: 0.2, emissive: 0x6b21a8, emissiveIntensity: 0.3 });
    [0, 1, 2, 3].forEach(i => {
        const angle = (i / 4) * Math.PI * 2;
        const finGeo = new THREE.BoxGeometry(0.1, 1.4, 1.2);
        const fin = new THREE.Mesh(finGeo, finMat);
        fin.position.set(Math.sin(angle) * 0.85, Math.cos(angle) * 0.85, -2.5);
        fin.rotation.z = angle;
        PLAYER.mesh.add(fin);
    });

    // --- ORBITAL RING ---
    const ringGeo = new THREE.TorusGeometry(1.1, 0.08, 8, 40);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.y = Math.PI / 2;
    PLAYER.mesh.add(ring);

    ENGINE.scene.add(PLAYER.mesh);

    // Predictive Orbit Path
    const trailGeo = new THREE.BufferGeometry();
    const trailMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.5, linewidth: 2 });
    PLAYER.trail = new THREE.LineLoop(trailGeo, trailMat);
    ENGINE.scene.add(PLAYER.trail);
}
// --- 7. INPUT HANDLING ---
function bindInputs() {
    // Keyboard Controls
   document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'w') ENGINE.keys.w = true;
if (e.key.toLowerCase() === 's') ENGINE.keys.s = true;
if (e.key.toLowerCase() === 'a') ENGINE.keys.a = true;
if (e.key.toLowerCase() === 'd') ENGINE.keys.d = true;
if (e.key.toLowerCase() === 'q') ENGINE.keys.q = true;
if (e.key.toLowerCase() === 'e') ENGINE.keys.e = true;
        if (e.code === 'Space') {
            ENGINE.keys.space = true;
            if (ENGINE.state === 'START') {
                UI.switchScreen('hud');
                ENGINE.state = 'PLAY';
                ENGINE.keys.spaceLocked = true; // <-- FIX IS ADDED HERE
            }
        }
    });

    document.addEventListener('keyup', (e) => {
      if (e.key.toLowerCase() === 'w') ENGINE.keys.w = false;
if (e.key.toLowerCase() === 's') ENGINE.keys.s = false;
if (e.key.toLowerCase() === 'a') ENGINE.keys.a = false;
if (e.key.toLowerCase() === 'd') ENGINE.keys.d = false;
if (e.key.toLowerCase() === 'q') ENGINE.keys.q = false;
if (e.key.toLowerCase() === 'e') ENGINE.keys.e = false;
        if (e.code === 'Space') {
            ENGINE.keys.space = false;
            ENGINE.keys.spaceLocked = false;
        }
    });

    // --- NEW: Soft Mouse Camera Controls ---
    document.addEventListener('mousedown', (e) => {
        // Only allow camera drag if clicking on the background, not UI
        if (e.target.tagName !== 'BUTTON' && !e.target.closest('.glass-panel')) {
            ENGINE.mouse.isDown = true;
            ENGINE.mouse.lastX = e.clientX;
            ENGINE.mouse.lastY = e.clientY;
        }
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!ENGINE.mouse.isDown || ENGINE.state !== 'PLAY') return;
        
        const dx = e.clientX - ENGINE.mouse.lastX;
        const dy = e.clientY - ENGINE.mouse.lastY;
        ENGINE.mouse.lastX = e.clientX;
        ENGINE.mouse.lastY = e.clientY;
        
        // Rotate horizontally
        ENGINE.camTarget.theta -= dx * 0.005;
      ENGINE.camTarget.phi -= dy * 0.005;
    });
    
    document.addEventListener('mouseup', () => ENGINE.mouse.isDown = false);
    
    // Zoom in/out with scroll wheel
document.addEventListener('wheel', (e) => {
        if (ENGINE.state !== 'PLAY') return;
        // Allow zooming in as close as 15 units
        ENGINE.camTarget.radius = Math.max(15, Math.min(150, ENGINE.camTarget.radius + e.deltaY * 0.1));
    });
}

// --- 8. ORBITAL PHYSICS ENGINE ---
const SHIP_STATE = {
    pos: new THREE.Vector3(0, CONFIG.planetRadius + 40, 0),
    vel: new THREE.Vector3(Math.sqrt(CONFIG.gravity / (CONFIG.planetRadius + 40)), 0, 0)
};

function toggleOrbitLock() {
    if (!PLAYER.canLock && !PLAYER.isLocked) return; 
    
    PLAYER.isLocked = !PLAYER.isLocked;
    const btn = document.getElementById('btn-lock');
    
    if (PLAYER.isLocked) {
        if (btn) {
            btn.classList.add('btn-locked');
            btn.innerHTML = '<span>UNLOCK ORBIT (L)</span>';
        }
        
       const radius = SHIP_STATE.pos.length();
const circularSpeed = Math.sqrt(CONFIG.gravity / radius);
PLAYER.angularVelocity = circularSpeed / radius;
PLAYER.orbitAxis = SHIP_STATE.pos.clone().cross(SHIP_STATE.vel).normalize();
SHIP_STATE.vel.copy(PLAYER.orbitAxis.clone().cross(SHIP_STATE.pos).normalize().multiplyScalar(circularSpeed));
        
    } else {
        if (btn) {
            btn.classList.remove('btn-locked');
            btn.innerHTML = '<span>LOCK ORBIT (L)</span>';
        }
    }
}

function updateShipPhysics(dt) {
    if (ENGINE.state !== 'PLAY') return;

    // FIX 1: Safely inject camera config if it is missing from the 40kb file
    if (!ENGINE.camTarget) {
        ENGINE.camTarget = { theta: Math.PI/2, phi: Math.PI/2.5, radius: 12 };
        ENGINE.camCurrent = { theta: Math.PI/2, phi: Math.PI/2.5, radius: 12 };
    }

    // --- ONE-TIME SPAWN SETUP ---
    if (!PLAYER.hasSpawned) {
        PLAYER.hasSpawned = true;
        
        // Safety check against zero velocity on spawn
        if (SHIP_STATE.vel.lengthSq() === 0) SHIP_STATE.vel.set(10, 0, 0); 
        
     const radius = SHIP_STATE.pos.length();
const circularSpeed = Math.sqrt(CONFIG.gravity / radius);
PLAYER.angularVelocity = circularSpeed / radius;
PLAYER.orbitAxis = SHIP_STATE.pos.clone().cross(SHIP_STATE.vel).normalize();
SHIP_STATE.vel.copy(PLAYER.orbitAxis.clone().cross(SHIP_STATE.pos).normalize().multiplyScalar(circularSpeed));
        
        PLAYER.isLocked = true;
        PLAYER.canLock = true;
        
        const btn = document.getElementById('btn-lock');
        if (btn) {
            btn.classList.add('btn-locked');
            btn.innerHTML = '<span>UNLOCK ORBIT (L)</span>';
        }

        // SNAP CAMERA TO SHIP
        const startUp = SHIP_STATE.pos.clone().normalize();
        const startFwd = SHIP_STATE.vel.clone().normalize();
        ENGINE.camera.position.copy(SHIP_STATE.pos.clone().add(startUp.clone().multiplyScalar(6)).add(startFwd.clone().multiplyScalar(-19)));
        ENGINE.camera.lookAt(SHIP_STATE.pos);
    }

    const distSq = SHIP_STATE.pos.lengthSq();
    const dist = Math.sqrt(distSq);
    PLAYER.altitude = dist;

    if (PLAYER.isLocked) {
        SHIP_STATE.pos.applyAxisAngle(PLAYER.orbitAxis, PLAYER.angularVelocity * dt);
        SHIP_STATE.vel.applyAxisAngle(PLAYER.orbitAxis, PLAYER.angularVelocity * dt);
        PLAYER.velocity = SHIP_STATE.vel.length();
        
        // FIX 3: Check if trail exists before hiding it
        if (PLAYER.trail) PLAYER.trail.visible = false; 
        
        const statusTxt = document.getElementById('txt-orbit-status');
        if (statusTxt) {
            statusTxt.innerText = "LOCKED";
            statusTxt.style.color = "var(--neon-green)";
        }
        
    } else {
        if (PLAYER.trail) PLAYER.trail.visible = true;
        const gravityForce = CONFIG.gravity / distSq;
        const gravityDir = SHIP_STATE.pos.clone().normalize().negate();
        const acceleration = gravityDir.clone().multiplyScalar(gravityForce);

       const progradeDir = SHIP_STATE.vel.clone().normalize();
const radialDir = SHIP_STATE.pos.clone().normalize();
const normalDir = progradeDir.clone().cross(radialDir).normalize();
const thrustPower = 15.0;

if (ENGINE.keys.w) {
    acceleration.add(progradeDir.clone().multiplyScalar(thrustPower));
    spawnEngineParticles(SHIP_STATE.pos, progradeDir.clone().negate());
}
if (ENGINE.keys.s) {
    acceleration.add(progradeDir.clone().multiplyScalar(-thrustPower));
    spawnEngineParticles(SHIP_STATE.pos, progradeDir.clone());
}
if (ENGINE.keys.a) {
    acceleration.add(normalDir.clone().multiplyScalar(thrustPower));
    spawnEngineParticles(SHIP_STATE.pos, normalDir.clone().negate());
}
if (ENGINE.keys.d) {
    acceleration.add(normalDir.clone().multiplyScalar(-thrustPower));
    spawnEngineParticles(SHIP_STATE.pos, normalDir.clone());
}
if (ENGINE.keys.q) {
    acceleration.add(radialDir.clone().multiplyScalar(-thrustPower));
    spawnEngineParticles(SHIP_STATE.pos, radialDir.clone());
}
if (ENGINE.keys.e) {
    acceleration.add(radialDir.clone().multiplyScalar(thrustPower));
    spawnEngineParticles(SHIP_STATE.pos, radialDir.clone().negate());
}

        SHIP_STATE.vel.add(acceleration.clone().multiplyScalar(dt));
        SHIP_STATE.pos.add(SHIP_STATE.vel.clone().multiplyScalar(dt));
        PLAYER.velocity = SHIP_STATE.vel.length();

        if (typeof updatePredictiveTrail === 'function') updatePredictiveTrail();
    }

    // --- 1. ROBUST MESH ORIENTATION ---
    if (PLAYER.mesh) {
        PLAYER.mesh.position.copy(SHIP_STATE.pos);
        const up = SHIP_STATE.pos.clone().normalize();
        const shipForward = SHIP_STATE.vel.clone().normalize();
        
        if (shipForward.lengthSq() === 0) shipForward.set(1, 0, 0);
        
        const dummyObj = new THREE.Object3D();
        dummyObj.position.copy(SHIP_STATE.pos);
        dummyObj.up.copy(up);
        dummyObj.lookAt(SHIP_STATE.pos.clone().add(shipForward.clone().multiplyScalar(10)));
        PLAYER.mesh.quaternion.slerp(dummyObj.quaternion, 0.15);
    }

   // --- 2. SHIP-RELATIVE CHASE CAMERA ---
ENGINE.camCurrent.theta += (ENGINE.camTarget.theta - ENGINE.camCurrent.theta) * 0.1;
ENGINE.camCurrent.phi += (ENGINE.camTarget.phi - ENGINE.camCurrent.phi) * 0.1;
ENGINE.camCurrent.radius += (ENGINE.camTarget.radius - ENGINE.camCurrent.radius) * 0.1;

const up = SHIP_STATE.pos.clone().normalize();
const forward = SHIP_STATE.vel.clone().normalize();
if (forward.lengthSq() === 0) forward.set(1, 0, 0);

let right = forward.clone().cross(up);
if (right.lengthSq() < 0.001) right.set(1, 0, 0).cross(up);
right.normalize();

const trueUp = right.clone().cross(forward).normalize();

// Base offset: behind and slightly above in ship-local space
const r = ENGINE.camCurrent.radius;
let camOffset = forward.clone().multiplyScalar(-r)
    .add(trueUp.clone().multiplyScalar(r * 0.35));

// Apply mouse yaw (around trueUp) and pitch (around right)
// Wrap theta to prevent float overflow on long sessions
ENGINE.camCurrent.theta = ENGINE.camCurrent.theta % (Math.PI * 2);
camOffset.applyAxisAngle(trueUp, ENGINE.camCurrent.theta);
camOffset.applyAxisAngle(right, ENGINE.camCurrent.phi);

const idealCamPos = SHIP_STATE.pos.clone().add(camOffset);
ENGINE.camera.position.lerp(idealCamPos, 0.08);
ENGINE.camera.lookAt(SHIP_STATE.pos);

  // --- RADAR UI ---
const orbitDist = SHIP_STATE.pos.length();
const radarScale = 68 / Math.max(orbitDist * 1.1, CONFIG.planetRadius * 2);

const radarPlanet = document.getElementById('radar-planet');
if (radarPlanet) {
    const planetPx = CONFIG.planetRadius * radarScale * 2;
    radarPlanet.style.width = `${planetPx}px`;
    radarPlanet.style.height = `${planetPx}px`;
}

const radarShip = document.getElementById('radar-ship');
if (radarShip) {
    radarShip.style.left = `calc(50% + ${SHIP_STATE.pos.x * radarScale}px)`;
    radarShip.style.top = `calc(50% + ${SHIP_STATE.pos.z * radarScale}px)`;
}

const radarOrbit = document.getElementById('radar-orbit');
if (radarOrbit) {
    const orbitPx = orbitDist * radarScale * 2;
    radarOrbit.style.width = `${orbitPx}px`;
    radarOrbit.style.height = `${orbitPx}px`;
}
const radarOrbit = document.getElementById('radar-orbit');
if (radarOrbit) {
    const orbitRadius = SHIP_STATE.pos.length() * radarScale;
    radarOrbit.style.width = `${orbitRadius * 2}px`;
    radarOrbit.style.height = `${orbitRadius * 2}px`;
}

    if (dist < CONFIG.planetRadius + 1) triggerGameOver("ORBIT DECAYED", "Ship collided with the planetary surface.", "var(--neon-purple)");
    if (dist > 300) triggerGameOver("LOST IN SPACE", "Escaped planetary gravity well.", "var(--neon-purple)");
}
function updatePredictiveTrail() {
    const simPos = SHIP_STATE.pos.clone();
    const simVel = SHIP_STATE.vel.clone();
    const points = [];
    const simDt = 0.5; 
    
    let isStable = true;
    let escapes = false;

    for (let i = 0; i < 300; i++) {
        points.push(simPos.clone());
        
        const rSq = simPos.lengthSq();
        if (rSq < (CONFIG.planetRadius * CONFIG.planetRadius)) {
            isStable = false; 
            break;
        }
        if (rSq > 40000) { 
            escapes = true;
            isStable = false;
            break;
        }

        const gAccel = simPos.clone().normalize().negate().multiplyScalar(CONFIG.gravity / rSq);
        simVel.add(gAccel.multiplyScalar(simDt));
        simPos.add(simVel.clone().multiplyScalar(simDt));
    }

    PLAYER.trail.geometry.setFromPoints(points);
    
    // UI Feedback & Lock availability
    const statusTxt = document.getElementById('txt-orbit-status');
    const lockBtn = document.getElementById('btn-lock');

    if (!isStable) {
        PLAYER.canLock = false;
        if (lockBtn) lockBtn.classList.add('hidden');
        PLAYER.trail.material.color.setHex(CONFIG.orbitColors.retrograde);
        if (statusTxt) {
            statusTxt.innerText = escapes ? "ESCAPING" : "UNSTABLE";
            statusTxt.style.color = "var(--neon-purple)";
        }
        document.getElementById('hud-active').style.boxShadow = "inset 0 0 50px rgba(244, 63, 94, 0.2)";
    } else {
        PLAYER.canLock = true;
        if (lockBtn) lockBtn.classList.remove('hidden');
        PLAYER.trail.material.color.setHex(CONFIG.orbitColors.stable);
        if (statusTxt) {
            statusTxt.innerText = "STABLE";
            statusTxt.style.color = "var(--neon-blue)";
        }
        document.getElementById('hud-active').style.boxShadow = "none";
    }
}

// --- 9. TERRA-SEED & PROJECTILE SYSTEM ---
function handleShooting() {
    if (ENGINE.keys.space && !ENGINE.keys.spaceLocked && ENGINE.state === 'PLAY' && PLAYER.payloads > 0) {
        PLAYER.payloads--;
        ENGINE.keys.spaceLocked = true; // Prevent rapid fire

        // Spawn Projectile
        const geo = new THREE.SphereGeometry(0.5, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
        const mesh = new THREE.Mesh(geo, mat);
        
        mesh.position.copy(SHIP_STATE.pos);
        
        // Shoot "down" towards the planet, plus inherited orbital velocity
        const downDir = SHIP_STATE.pos.clone().normalize().negate();
        const shootVel = downDir.multiplyScalar(30).add(SHIP_STATE.vel);

        ENGINE.scene.add(mesh);
        WORLD.projectiles.push({ mesh, vel: shootVel, alive: true });
    }
}

function updateProjectiles(dt) {
    WORLD.projectiles.forEach(p => {
        if (!p.alive) return;

        const distSq = p.mesh.position.lengthSq();
        const gravityDir = p.mesh.position.clone().normalize().negate();
        const gAccel = gravityDir.clone().multiplyScalar(CONFIG.gravity / distSq);
        
        p.vel.add(gAccel.multiplyScalar(dt));
        p.mesh.position.add(p.vel.clone().multiplyScalar(dt));

        const dist = Math.sqrt(distSq);
        const norm = p.mesh.position.clone().normalize();
        
        const localNorm = norm.clone();
        WORLD.group.worldToLocal(localNorm);
        localNorm.normalize(); 

        const noise1 = terrainNoise.noise3D(localNorm.x * 2, localNorm.y * 2, localNorm.z * 2);
        const noise2 = terrainNoise.noise3D(localNorm.x * 8, localNorm.y * 8, localNorm.z * 8);
        const elevation = 1 + (noise1 * 0.1) + (noise2 * 0.05);
        
        const actualSurfaceRadius = CONFIG.planetRadius * elevation;

        if (dist <= actualSurfaceRadius + 0.5) {
            p.alive = false;
            ENGINE.scene.remove(p.mesh);
            
            const impactPos = norm.multiplyScalar(actualSurfaceRadius);
            
            spawnTree(impactPos);
            if (typeof spawnImpactParticles === 'function') spawnImpactParticles(impactPos);
            
            WORLD.atmosphere += 2.5; 
            if (WORLD.atmosphere >= CONFIG.atmoMax) {
                triggerWin();
            }
        }
    });

    // Cleanup dead projectiles
    WORLD.projectiles = WORLD.projectiles.filter(p => p.alive);
}

// --- 10. ENVIRONMENT & TERRAFORMING VISUALS ---
function spawnTree(position) {
    // Hyper-round, soft trees
    const treeGroup = new THREE.Group();
    
    // Soft, bubbly canopy
    const canopyGeo = new THREE.IcosahedronGeometry(1.5, 2); // High detail for roundness
    const canopyMat = new THREE.MeshStandardMaterial({ 
        color: 0x34d399, 
        roughness: 0.4, 
        metalness: 0.1,
        emissive: 0x064e3b,
        emissiveIntensity: 0.5
    });
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.y = 1.0;
    
    treeGroup.add(canopy);
    
    // --- FIX: Convert World space to Planet's Local Space ---
    const localPos = position.clone();
    WORLD.group.worldToLocal(localPos);
    
    // Align to surface normal based on the local position
    const normal = localPos.clone().normalize();
    treeGroup.position.copy(localPos);
    treeGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), normal);
    // --------------------------------------------------------
    
    // Add to planet so it rotates perfectly with it
    WORLD.group.add(treeGroup);
    
    // Pop-in animation scale setup
    treeGroup.scale.set(0.01, 0.01, 0.01);
    WORLD.trees.push(treeGroup);
}

function updateEnvironment(dt) {
    // Soft rotation of the entire planetary body
    WORLD.group.rotation.y += 0.02 * dt;
    WORLD.group.rotation.z += 0.01 * dt;

    // Fade in atmosphere visually based on progress
    const atmoTargetOpacity = (WORLD.atmosphere / CONFIG.atmoMax) * 0.4;
    WORLD.atmoMesh.material.opacity += (atmoTargetOpacity - WORLD.atmoMesh.material.opacity) * 0.05;

    // Animate Tree Growth (Bouncy scaling)
    WORLD.trees.forEach(tree => {
        if (tree.scale.x < 1.0) {
            const growth = dt * 2.0;
            tree.scale.addScalar(growth);
            // Bouncy overshoot logic
            if (tree.scale.x > 1.2) tree.scale.setScalar(1.0); 
        }
    });

    // Update Particles
    for (let i = WORLD.particles.length - 1; i >= 0; i--) {
        const p = WORLD.particles[i];
        p.mesh.position.add(p.vel.clone().multiplyScalar(dt));
        p.life -= dt;
        
        // Soft fade and shrink
        const scale = Math.max(0, p.life / p.maxLife);
        p.mesh.scale.setScalar(scale);
        
        if (p.life <= 0) {
            ENGINE.scene.remove(p.mesh);
            WORLD.particles.splice(i, 1);
        }
    }
}

// --- 11. PARTICLE EFFECTS ---
function spawnEngineParticles(pos, dir) {
    // Hot white core
    const coreGeo = new THREE.SphereGeometry(0.18, 4, 4);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0 });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.copy(pos).add(dir.clone().multiplyScalar(1.5));
    const coreSpread = new THREE.Vector3((Math.random()-0.5), (Math.random()-0.5), (Math.random()-0.5)).multiplyScalar(0.8);
    ENGINE.scene.add(coreMesh);
    WORLD.particles.push({ mesh: coreMesh, vel: dir.clone().multiplyScalar(14).add(coreSpread), life: 0.25, maxLife: 0.25 });

    // Mid plume — blue
    const plumeGeo = new THREE.SphereGeometry(0.3, 4, 4);
    const plumeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 });
    const plumeMesh = new THREE.Mesh(plumeGeo, plumeMat);
    plumeMesh.position.copy(pos).add(dir.clone().multiplyScalar(2.5));
    const plumeSpread = new THREE.Vector3((Math.random()-0.5), (Math.random()-0.5), (Math.random()-0.5)).multiplyScalar(2);
    ENGINE.scene.add(plumeMesh);
    WORLD.particles.push({ mesh: plumeMesh, vel: dir.clone().multiplyScalar(9).add(plumeSpread), life: 0.5, maxLife: 0.5 });

    // Outer cool exhaust — purple fade
    const outerGeo = new THREE.SphereGeometry(0.4, 4, 4);
    const outerMat = new THREE.MeshBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.4 });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    outerMesh.position.copy(pos).add(dir.clone().multiplyScalar(3.5));
    const outerSpread = new THREE.Vector3((Math.random()-0.5), (Math.random()-0.5), (Math.random()-0.5)).multiplyScalar(3.5);
    ENGINE.scene.add(outerMesh);
    WORLD.particles.push({ mesh: outerMesh, vel: dir.clone().multiplyScalar(6).add(outerSpread), life: 0.8, maxLife: 0.8 });
}

function spawnImpactParticles(pos) {
    const geo = new THREE.SphereGeometry(0.4, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
    
    for (let i = 0; i < 8; i++) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        
        const normal = pos.clone().normalize();
        const spread = new THREE.Vector3((Math.random()-0.5)*10, (Math.random()-0.5)*10, (Math.random()-0.5)*10);
        // Blast outward from normal
        const vel = normal.multiplyScalar(5).add(spread);
        
        ENGINE.scene.add(mesh);
        WORLD.particles.push({ mesh, vel, life: 1.0, maxLife: 1.0 });
    }
}

// --- 12. GAME STATE MANAGEMENT ---
function triggerGameOver(title, desc, color) {
    if (ENGINE.state === 'WIN') return; // Don't overwrite win
    ENGINE.state = 'OVER';
    
    const winScreen = UI.screens.win;
    winScreen.querySelector('.success-text').innerText = title;
    winScreen.querySelector('.success-text').style.background = `linear-gradient(to right, #fff, ${color})`;
    winScreen.querySelector('.success-text').style.webkitBackgroundClip = "text";
    winScreen.querySelector('p').innerText = desc;
    
    UI.switchScreen('win');
}

function triggerWin() {
    if (ENGINE.state === 'WIN') return; // <-- FIX: Prevents multiple seeds from breaking the camera!
    
    ENGINE.state = 'WIN';
    UI.switchScreen('win');
    
    // Zoom camera out for a cinematic shot
    const zoomOut = setInterval(() => {
      ENGINE.camera.position.lerp(new THREE.Vector3(0, 0, 220), 0.02);
        ENGINE.camera.lookAt(0,0,0);
    }, 16);
    setTimeout(() => clearInterval(zoomOut), 5000);
}
// --- 13. MAIN RENDER LOOP ---
function animate() {
    requestAnimationFrame(animate);
    
    const dt = Math.min(ENGINE.clock.getDelta(), 0.1); // Cap delta to prevent physics explosions on lag

    if (ENGINE.state === 'START') {
        // Idle cinematic camera orbiting the planet
        const time = ENGINE.clock.getElapsedTime();
      ENGINE.camera.position.set(Math.sin(time*0.1)*130, 30, Math.cos(time*0.1)*130);
        ENGINE.camera.lookAt(0,0,0);
        WORLD.group.rotation.y += 0.05 * dt;
    } 
    else if (ENGINE.state === 'PLAY') {
        updateShipPhysics(dt);
        handleShooting();
        updateProjectiles(dt);
        UI.updateHUD();
        
        // Check loss condition for running out of payloads
        if (PLAYER.payloads <= 0 && WORLD.projectiles.length === 0 && WORLD.atmosphere < CONFIG.atmoMax) {
            triggerGameOver("MISSION FAILED", "Out of terra-seeds. Biosphere collapsed.", "var(--neon-purple)");
        }
    }

    updateEnvironment(dt);
    ENGINE.renderer.render(ENGINE.scene, ENGINE.camera);
}

// FIRE IT UP
init();
