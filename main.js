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
    state: 'START', // START, PLAY, WIN
    keys: { w: false, s: false, space: false, spaceLocked: false }
};

const PLAYER = {
    mesh: null,
    orbitAngle: 0,
    altitude: 50,       // Distance from center of planet
    velocity: 5.5,      // Tangential velocity
    payloads: CONFIG.maxPayloads,
    trail: null         // Visual orbit path
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
        restart: document.getElementById('btn-restart')
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
