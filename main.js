import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

/** =========================================================================
 * ASTRO-BOTANIST: ORBITAL MECHANICS ENGINE (PART 1)
 * Architecture, Procedural Generation, and UI Binding
 * ========================================================================= */

// --- 1. GLOBAL STATE & CONFIGURATION ---
const CONFIG = {
    planetRadius: 30,
    gravity: 1500,        // Gravitational parameter (mu) for orbital mechanics
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
    keys: { w: false, s: false, space: false, spaceLocked: false },
    // NEW: Mouse and Camera tracking
    mouse: { isDown: false, lastX: 0, lastY: 0 },
 camTarget: { theta: Math.PI/2, phi: Math.PI/2.5, radius: 40 },
    camCurrent: { theta: Math.PI/2, phi: Math.PI/2.5, radius: 40 }
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
            if (typeof toggleOrbitLock === "function") toggleOrbitLock();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'l') {
                if (typeof toggleOrbitLock === "function") toggleOrbitLock();
            }
        });

        // Touch/Mouse binding for the fire button
        this.buttons.fire.addEventListener('mousedown', () => ENGINE.keys.space = true);
        this.buttons.fire.addEventListener('mouseup', () => ENGINE.keys.space = false);
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

        // Update Liquid Bars
        const atmoPercent = (WORLD.atmosphere / CONFIG.atmoMax) * 100;
        this.bars.atmo.style.width = `${Math.min(atmoPercent, 100)}%`;
        this.text.atmo.innerText = `${Math.floor(atmoPercent)}%`;

        const payloadPercent = (PLAYER.payloads / CONFIG.maxPayloads) * 100;
        this.bars.payload.style.width = `${Math.max(payloadPercent, 0)}%`;
        this.text.payload.innerText = PLAYER.payloads;

        // Update Telemetry
        this.text.vel.innerText = `${PLAYER.velocity.toFixed(2)} km/s`;
        const surfaceAlt = PLAYER.altitude - CONFIG.planetRadius;
        this.text.alt.innerText = `${surfaceAlt.toFixed(1)} km`;

        // Telemetry warning colors
        if (surfaceAlt < 5) this.text.alt.style.color = 'var(--neon-purple)';
        else this.text.alt.style.color = 'var(--text-main)';
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
        const n = x * 12.9898 + y * 78.233 + z * 37.719;
        this.seed = n;
        return this.random();
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
    ENGINE.camera.position.set(0, 0, 100);

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
    sunLight.shadow.camera.left = -60;
    sunLight.shadow.camera.right = 60;
    sunLight.shadow.camera.top = 60;
    sunLight.shadow.camera.bottom = -60;
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

    // Background Stars (Particle System)
    const starsGeo = new THREE.BufferGeometry();
    const starsPos = [];
    for(let i = 0; i < 2000; i++) {
        const x = (Math.random() - 0.5) * 1000;
        const y = (Math.random() - 0.5) * 1000;
        const z = (Math.random() - 0.5) * 1000;
        // Keep stars away from the immediate play area
        if (Math.abs(x) < 100 && Math.abs(y) < 100 && Math.abs(z) < 100) continue;
        starsPos.push(x, y, z);
    }
    starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(starsPos, 3));
    const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, opacity: 0.8 });
    const starField = new THREE.Points(starsGeo, starsMat);
    ENGINE.scene.add(starField);
}

// --- 6. PLAYER/ORBITER BUILDING ---
function buildPlayer() {
    // A sleek, hyper-modern orbital seed pod
    PLAYER.mesh = new THREE.Group();

    // Main Hull
    const hullGeo = new THREE.CapsuleGeometry(0.8, 2, 8, 16);
    hullGeo.rotateX(Math.PI / 2);
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.5, roughness: 0.1 });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.castShadow = true;
    PLAYER.mesh.add(hull);

    // Glowing Energy Rings
    const ringGeo = new THREE.TorusGeometry(1.2, 0.1, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const ring1 = new THREE.Mesh(ringGeo, ringMat);
    ring1.rotation.y = Math.PI / 2;
    PLAYER.mesh.add(ring1);

    ENGINE.scene.add(PLAYER.mesh);

    // Predictive Orbit Path (Line)
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
        if (e.code === 'Space') {
            ENGINE.keys.space = true;
            if (ENGINE.state === 'START') {
                UI.switchScreen('hud');
                ENGINE.state = 'PLAY';
            }
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.key.toLowerCase() === 'w') ENGINE.keys.w = false;
        if (e.key.toLowerCase() === 's') ENGINE.keys.s = false;
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
        // Rotate vertically (clamped to prevent flipping upside down)
        ENGINE.camTarget.phi = Math.max(0.1, Math.min(Math.PI - 0.1, ENGINE.camTarget.phi - dy * 0.005));
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
    vel: new THREE.Vector3(CONFIG.gravity / Math.sqrt(CONFIG.planetRadius + 40) * 0.15, 0, 0)
};

function toggleOrbitLock() {
    if (!PLAYER.canLock && !PLAYER.isLocked) return; 
    
    PLAYER.isLocked = !PLAYER.isLocked;
    const btn = document.getElementById('btn-lock');
    
    if (PLAYER.isLocked) {
        btn.classList.add('btn-locked');
        btn.innerHTML = '<span>UNLOCK ORBIT (L)</span>';
        
        // Calculate Perfect Orbit Parameters
        const radius = SHIP_STATE.pos.length();
        PLAYER.angularVelocity = SHIP_STATE.vel.length() / radius;
        // Find the perpendicular axis of rotation
        PLAYER.orbitAxis = SHIP_STATE.pos.clone().cross(SHIP_STATE.vel).normalize();
        
        // Zero out erratic velocities to snap it perfectly to a circle
        SHIP_STATE.vel.copy(PLAYER.orbitAxis.clone().cross(SHIP_STATE.pos).normalize().multiplyScalar(SHIP_STATE.vel.length()));
        
    } else {
        btn.classList.remove('btn-locked');
        btn.innerHTML = '<span>LOCK ORBIT (L)</span>';
    }
}

function updateShipPhysics(dt) {
    if (ENGINE.state !== 'PLAY') return;

    // --- NEW: ONE-TIME SPAWN LOCK SETUP ---
    // This forces the ship perfectly onto the rails the moment the game starts
    if (!PLAYER.hasSpawned) {
        PLAYER.hasSpawned = true;
        const radius = SHIP_STATE.pos.length();
        PLAYER.angularVelocity = SHIP_STATE.vel.length() / radius;
        PLAYER.orbitAxis = SHIP_STATE.pos.clone().cross(SHIP_STATE.vel).normalize();
        SHIP_STATE.vel.copy(PLAYER.orbitAxis.clone().cross(SHIP_STATE.pos).normalize().multiplyScalar(SHIP_STATE.vel.length()));
        
        PLAYER.isLocked = true;
        PLAYER.canLock = true;
        
        // Sync the UI Button to show we are locked
        const btn = document.getElementById('btn-lock');
        if (btn) {
            btn.classList.add('btn-locked');
            btn.innerHTML = '<span>UNLOCK ORBIT (L)</span>';
        }
        // SNAP CAMERA TO SHIP
        const startUp = SHIP_STATE.pos.clone().normalize();
        const startFwd = SHIP_STATE.vel.clone().normalize();
        ENGINE.camera.position.copy(SHIP_STATE.pos.clone().add(startUp.multiplyScalar(10)).add(startFwd.multiplyScalar(-30)));
        ENGINE.camera.lookAt(SHIP_STATE.pos);
    }
    // --------------------------------------

    const distSq = SHIP_STATE.pos.lengthSq();
    const dist = Math.sqrt(distSq);
    PLAYER.altitude = dist;

    if (PLAYER.isLocked) {
        // ON-RAILS PARAMETRIC MATH
        SHIP_STATE.pos.applyAxisAngle(PLAYER.orbitAxis, PLAYER.angularVelocity * dt);
        SHIP_STATE.vel.applyAxisAngle(PLAYER.orbitAxis, PLAYER.angularVelocity * dt);
        PLAYER.velocity = SHIP_STATE.vel.length();
        
        PLAYER.trail.visible = false; 
        
        const statusTxt = document.getElementById('txt-orbit-status');
        if (statusTxt) {
            statusTxt.innerText = "LOCKED";
            statusTxt.style.color = "var(--neon-green)";
        }
        
    } else {
        // FREE FLIGHT NEWTONIAN MATH
        PLAYER.trail.visible = true;
        const gravityForce = CONFIG.gravity / distSq;
        const gravityDir = SHIP_STATE.pos.clone().normalize().negate();
        const acceleration = gravityDir.clone().multiplyScalar(gravityForce);

        const progradeDir = SHIP_STATE.vel.clone().normalize();
        const thrustPower = 15.0;

        if (ENGINE.keys.w) {
            acceleration.add(progradeDir.clone().multiplyScalar(thrustPower));
            spawnEngineParticles(SHIP_STATE.pos, progradeDir.clone().negate());
        }
        if (ENGINE.keys.s) {
            acceleration.add(progradeDir.clone().multiplyScalar(-thrustPower));
            spawnEngineParticles(SHIP_STATE.pos, progradeDir.clone());
        }

        SHIP_STATE.vel.add(acceleration.multiplyScalar(dt));
        SHIP_STATE.pos.add(SHIP_STATE.vel.clone().multiplyScalar(dt));
        PLAYER.velocity = SHIP_STATE.vel.length();

        updatePredictiveTrail();
    }

    // Update 3D Mesh
    PLAYER.mesh.position.copy(SHIP_STATE.pos);
    const up = SHIP_STATE.pos.clone().normalize();
    const lookTarget = SHIP_STATE.pos.clone().add(SHIP_STATE.vel);
    const mtx = new THREE.Matrix4().lookAt(SHIP_STATE.pos, lookTarget, up);
    PLAYER.mesh.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(mtx), 0.1);

// --- NEW: LOOSE CARTOON CHASE CAMERA ---
    ENGINE.camCurrent.theta += (ENGINE.camTarget.theta - ENGINE.camCurrent.theta) * 0.1;
    ENGINE.camCurrent.phi += (ENGINE.camTarget.phi - ENGINE.camCurrent.phi) * 0.1;
    ENGINE.camCurrent.radius += (ENGINE.camTarget.radius - ENGINE.camCurrent.radius) * 0.1;

    // 1. Get the Ship's Local Directions
    const shipUp = SHIP_STATE.pos.clone().normalize();
    const shipForward = SHIP_STATE.vel.clone().normalize();
    const shipRight = shipForward.clone().cross(shipUp).normalize();

    // 2. Calculate spherical offsets based on your mouse movements
    const r = ENGINE.camCurrent.radius;
    const xOffset = r * Math.sin(ENGINE.camCurrent.phi) * Math.cos(ENGINE.camCurrent.theta);
    const yOffset = r * Math.cos(ENGINE.camCurrent.phi);
    const zOffset = r * Math.sin(ENGINE.camCurrent.phi) * Math.sin(ENGINE.camCurrent.theta);

    // 3. Attach the camera relative to the ship's orientation
    const idealCamPos = SHIP_STATE.pos.clone()
        .add(shipRight.multiplyScalar(xOffset))
        .add(shipUp.multiplyScalar(yOffset))
        .add(shipForward.multiplyScalar(-zOffset)); // Negative Z puts camera trailing behind

    // 4. Loose rubber-band spring
    ENGINE.camera.position.lerp(idealCamPos, 0.08);

    // 5. Hard focus directly on the ship
    ENGINE.camera.lookAt(SHIP_STATE.pos);
    // ---------------------------------

    // Update Radar UI
    const radarShip = document.getElementById('radar-ship');
    if (radarShip) {
        const radarScale = 75 / 150; 
        radarShip.style.left = `calc(50% + ${SHIP_STATE.pos.x * radarScale}px)`;
        radarShip.style.top = `calc(50% + ${SHIP_STATE.pos.z * radarScale}px)`;
    }

    // Crash Detection
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

        // Simple gravity for projectiles
        const distSq = p.mesh.position.lengthSq();
        const gravityDir = p.mesh.position.clone().normalize().negate();
        const gAccel = gravityDir.clone().multiplyScalar(CONFIG.gravity / distSq);
        
        p.vel.add(gAccel.multiplyScalar(dt));
        p.mesh.position.add(p.vel.clone().multiplyScalar(dt));

        // Check impact with planet (approximate using radius)
        if (p.mesh.position.length() <= CONFIG.planetRadius + 0.5) {
            p.alive = false;
            ENGINE.scene.remove(p.mesh);
            
            spawnTree(p.mesh.position.clone());
            spawnImpactParticles(p.mesh.position.clone());
            
            WORLD.atmosphere += 2.5; // Increase atmosphere
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
    
    // Align to surface normal
    const normal = position.clone().normalize();
    treeGroup.position.copy(position);
    treeGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), normal);
    
    // Add to planet so it rotates with it (if we add rotation later)
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
    // Soft round particles
    const geo = new THREE.SphereGeometry(0.3, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(geo, mat);
    
    mesh.position.copy(pos).add(dir.clone().multiplyScalar(2)); // Spawn behind ship
    
    const spread = new THREE.Vector3((Math.random()-0.5), (Math.random()-0.5), (Math.random()-0.5)).multiplyScalar(2);
    const vel = dir.clone().multiplyScalar(10).add(spread);
    
    ENGINE.scene.add(mesh);
    WORLD.particles.push({ mesh, vel, life: 0.5, maxLife: 0.5 });
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
    ENGINE.state = 'WIN';
    UI.switchScreen('win');
    
    // Zoom camera out for a cinematic shot
    const zoomOut = setInterval(() => {
        ENGINE.camera.position.lerp(new THREE.Vector3(0, 0, 150), 0.02);
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
        ENGINE.camera.position.set(Math.sin(time*0.1)*80, 20, Math.cos(time*0.1)*80);
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
