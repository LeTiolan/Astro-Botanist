import * as THREE from 'three';

// --- Core Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f19);
scene.fog = new THREE.FogExp2(0x0b0f19, 0.02);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0xffbbf0, 0x080820, 0.6);
scene.add(hemiLight);
const dirLight = new THREE.DirectionalLight(0xfffaee, 0.8);
dirLight.position.set(50, 20, 30);
scene.add(dirLight);

// --- Game Objects ---
const asteroidRadius = 10;
const asteroid = new THREE.Mesh(
    new THREE.SphereGeometry(asteroidRadius, 64, 64),
    new THREE.MeshStandardMaterial({ color: 0x3d3545, roughness: 0.8 })
);
scene.add(asteroid);

const podGroup = new THREE.Group();
const hull = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, 0.8, 4, 16).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })
);
podGroup.add(hull);
const engineLight = new THREE.PointLight(0x44aaff, 1, 3);
engineLight.position.set(0, 0, -0.6);
podGroup.add(engineLight);
scene.add(podGroup);

// --- Game Logic & State ---
let gameState = 'START'; // 'START', 'PLAYING', 'WIN'
let water = 30;
const maxWater = 100;
const plantCost = 10;

let treesPlanted = 0;
const treesToWin = 20;

let theta = 0, phi = Math.PI / 2;
const orbitRadius = asteroidRadius + 2.5;
const keys = { w: false, a: false, s: false, d: false, space: false };

const growingTrees = [];
const waterOrbs = []; // Collectibles

// UI Elements
const uiStart = document.getElementById('start-screen');
const uiHud = document.getElementById('hud');
const uiWin = document.getElementById('win-screen');
const waterBar = document.getElementById('water-bar');
const waterText = document.getElementById('water-text');
const ecoBar = document.getElementById('eco-bar');
const ecoText = document.getElementById('eco-text');

// Update UI Function
function updateUI() {
    waterBar.style.width = `${(water / maxWater) * 100}%`;
    waterText.innerText = `${water} / ${maxWater}`;
    
    const ecoPercent = Math.min((treesPlanted / treesToWin) * 100, 100);
    ecoBar.style.width = `${ecoPercent}%`;
    ecoText.innerText = `${Math.floor(ecoPercent)}%`;
}
updateUI();

// --- Initialization (Start Button) ---
document.getElementById('start-btn').addEventListener('click', () => {
    gameState = 'PLAYING';
    uiStart.style.opacity = 0;
    uiStart.style.pointerEvents = 'none';
    uiHud.style.opacity = 1;
    initAudio();
    
    // Spawn initial orbs
    for(let i=0; i<5; i++) spawnWaterOrb();
});

// --- Input Handling ---
window.addEventListener('keydown', (e) => {
    if (gameState !== 'PLAYING') return;
    if (e.key === 'w') keys.w = true;
    if (e.key === 's') keys.s = true;
    if (e.key === 'a') keys.a = true;
    if (e.key === 'd') keys.d = true;
    if (e.key === ' ' && !keys.space) {
        keys.space = true;
        attemptPlanting();
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'w') keys.w = false;
    if (e.key === 's') keys.s = false;
    if (e.key === 'a') keys.a = false;
    if (e.key === 'd') keys.d = false;
    if (e.key === ' ') keys.space = false;
});

// --- Mechanics ---
function spawnWaterOrb() {
    const orbGroup = new THREE.Group();
    const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.4, 1),
        new THREE.MeshStandardMaterial({ color: 0x3b82f6, emissive: 0x1d4ed8, emissiveIntensity: 0.8 })
    );
    orbGroup.add(mesh);
    
    // Random position in orbit
    const randomTheta = Math.random() * Math.PI * 2;
    const randomPhi = (Math.random() * (Math.PI - 0.4)) + 0.2; // Avoid exact poles
    
    const x = orbitRadius * Math.sin(randomPhi) * Math.sin(randomTheta);
    const y = orbitRadius * Math.cos(randomPhi);
    const z = orbitRadius * Math.sin(randomPhi) * Math.cos(randomTheta);
    
    orbGroup.position.set(x, y, z);
    scene.add(orbGroup);
    waterOrbs.push(orbGroup);
}

function attemptPlanting() {
    if (water < plantCost) return; // Not enough water
    
    water -= plantCost;
    updateUI();

    const worldSurfacePos = podGroup.position.clone().normalize().multiplyScalar(asteroidRadius);
    const localSurfacePos = asteroid.worldToLocal(worldSurfacePos.clone());

    const treeGroup = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0x4a3f35 }));
    trunk.position.y = 0.4;
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 16), new THREE.MeshStandardMaterial({ color: 0x34d399, transparent: true, opacity: 0.9 }));
    canopy.position.y = 1.0;

    treeGroup.add(trunk, canopy);
    treeGroup.position.copy(localSurfacePos);
    
    const localNormal = localSurfacePos.clone().normalize();
    treeGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), localNormal);
    
    treeGroup.scale.set(0.01, 0.01, 0.01);
    asteroid.add(treeGroup);
    growingTrees.push(treeGroup);

    treesPlanted++;
    updateUI();

    if (treesPlanted >= treesToWin) {
        triggerWin();
    }
}

function triggerWin() {
    gameState = 'WIN';
    uiHud.style.opacity = 0;
    uiWin.style.opacity = 1;
    uiWin.style.pointerEvents = 'auto';
    asteroid.material.color.setHex(0x1f422b); // Turn planet green
}

// --- Audio ---
function initAudio() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const playDrone = (freq, type, vol) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;

        osc.type = type;
        osc.frequency.value = freq;
        
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 10);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
    };
    playDrone(130.81, 'sine', 0.06); 
    playDrone(196.00, 'sine', 0.04); 
}

// --- Main Render Loop ---
let targetCameraPos = new THREE.Vector3();

function animate() {
    requestAnimationFrame(animate);

    // Only process movement and collisions if playing
    if (gameState === 'PLAYING') {
        const speed = 0.02;
        if (keys.w) phi -= speed;
        if (keys.s) phi += speed;
        if (keys.a) theta -= speed;
        if (keys.d) theta += speed;
        phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));

        const hoverOffset = Math.sin(Date.now() * 0.002) * 0.1;
        const x = (orbitRadius + hoverOffset) * Math.sin(phi) * Math.sin(theta);
        const y = (orbitRadius + hoverOffset) * Math.cos(phi);
        const z = (orbitRadius + hoverOffset) * Math.sin(phi) * Math.cos(theta);
        podGroup.position.set(x, y, z);

        const upVector = new THREE.Vector3().copy(podGroup.position).normalize();
        const forward = new THREE.Vector3(
            orbitRadius * Math.sin(phi) * Math.sin(theta + 0.1), y, orbitRadius * Math.sin(phi) * Math.cos(theta + 0.1)
        );
        podGroup.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(podGroup.position, forward, upVector));

        // Check Collisions with Water Orbs
        for (let i = waterOrbs.length - 1; i >= 0; i--) {
            const orb = waterOrbs[i];
            orb.children[0].rotation.y += 0.05; // Spin orb
            orb.children[0].position.y = Math.sin(Date.now() * 0.005) * 0.2; // Bob orb

            // If pod is close enough to collect
            if (podGroup.position.distanceTo(orb.position) < 1.5) {
                scene.remove(orb);
                waterOrbs.splice(i, 1);
                water = Math.min(water + 20, maxWater); // Add water
                updateUI();
                setTimeout(spawnWaterOrb, 2000); // Spawn a new one 2 seconds later
            }
        }
    }

    // Camera follow (always runs so it smoothly settles on start menu)
    const idealCameraOffset = new THREE.Vector3(podGroup.position.x, podGroup.position.y, podGroup.position.z).normalize().multiplyScalar(orbitRadius + 12);
    // If on start menu, slowly pan around
    if (gameState === 'START') {
        idealCameraOffset.set(Math.sin(Date.now()*0.0005)*20, 10, Math.cos(Date.now()*0.0005)*20);
    }
    
    targetCameraPos.lerp(idealCameraOffset, 0.05);
    camera.position.copy(targetCameraPos);
    camera.lookAt(0, 0, 0);

    asteroid.rotation.y += 0.0005;

    // Tree Growth Animation
    for (let i = growingTrees.length - 1; i >= 0; i--) {
        const plant = growingTrees[i];
        if (plant.scale.x < 1) {
            plant.scale.addScalar(0.02);
        } else {
            growingTrees.splice(i, 1);
        }
    }

    renderer.render(scene, camera);
}

animate();
