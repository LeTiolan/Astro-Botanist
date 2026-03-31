// your code goes here
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x040408, 0.015);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0x222233);
scene.add(ambientLight);
const sunLight = new THREE.DirectionalLight(0xfffaee, 1.5);
sunLight.position.set(50, 20, 30);
scene.add(sunLight);

// --- The Asteroid (Now with dynamic colors) ---
const asteroidRadius = 10;
const asteroidGeo = new THREE.IcosahedronGeometry(asteroidRadius, 10);
// Apply base brown color to all vertices
const colors = [];
const color = new THREE.Color(0x554433);
for (let i = 0; i < asteroidGeo.attributes.position.count; i++) {
    colors.push(color.r, color.g, color.b);
}
asteroidGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

const asteroidMat = new THREE.MeshStandardMaterial({ 
    vertexColors: true, 
    roughness: 0.9,
    flatShading: true 
});
const asteroid = new THREE.Mesh(asteroidGeo, asteroidMat);
scene.add(asteroid);

// --- The Atmosphere Shell ---
const atmosphereGeo = new THREE.SphereGeometry(asteroidRadius + 4, 32, 32);
const atmosphereMat = new THREE.MeshPhongMaterial({
    color: 0x44aaff,
    transparent: true,
    opacity: 0.0, // Starts invisible
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});
const atmosphere = new THREE.Mesh(atmosphereGeo, atmosphereMat);
scene.add(atmosphere);

// --- The Player Pod ---
const podGroup = new THREE.Group();
const hullGeo = new THREE.ConeGeometry(0.5, 1.5, 8);
hullGeo.rotateX(Math.PI / 2); 
const hullMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8 });
const hull = new THREE.Mesh(hullGeo, hullMat);
podGroup.add(hull);
scene.add(podGroup);

// --- Game State ---
let theta = 0, phi = Math.PI / 2;
const orbitRadius = asteroidRadius + 2.5;
const keys = { w: false, a: false, s: false, d: false, space: false };
let currentTool = 1; // 1: Seed, 2: Water, 3: Gas
const uiTool = document.getElementById('current-tool');

// --- Input Handling ---
window.addEventListener('keydown', (e) => {
    if (e.key === 'w') keys.w = true;
    if (e.key === 's') keys.s = true;
    if (e.key === 'a') keys.a = true;
    if (e.key === 'd') keys.d = true;
    
    if (e.key === '1') { currentTool = 1; uiTool.innerText = "Current Tool: SEEDS"; uiTool.style.color = "#4ade80"; }
    if (e.key === '2') { currentTool = 2; uiTool.innerText = "Current Tool: WATER"; uiTool.style.color = "#3b82f6"; }
    if (e.key === '3') { currentTool = 3; uiTool.innerText = "Current Tool: GAS"; uiTool.style.color = "#c084fc"; }
    
    if (e.key === ' ' && !keys.space) {
        keys.space = true;
        useTool();
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
function useTool() {
    const surfacePos = new THREE.Vector3().copy(podGroup.position).normalize().multiplyScalar(asteroidRadius);

    if (currentTool === 1) {
        // Plant Seed
        const treeGroup = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1, 5), new THREE.MeshStandardMaterial({ color: 0x332211 }));
        trunk.position.y = 0.5;
        const canopy = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2), new THREE.MeshStandardMaterial({ color: 0x4ade80, emissive: 0x116633, emissiveIntensity: 0.5 }));
        canopy.position.y = 1.5;
        treeGroup.add(trunk, canopy);
        treeGroup.position.copy(surfacePos);
        treeGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), surfacePos.clone().normalize());
        asteroid.add(treeGroup); // Add to asteroid so it rotates with it
    } 
    else if (currentTool === 2) {
        // Hydrate Soil (Change vertex colors to green)
        const positions = asteroidGeo.attributes.position;
        const colors = asteroidGeo.attributes.color;
        const targetColor = new THREE.Color(0x2d4c1e); // Mossy green
        
        for (let i = 0; i < positions.count; i++) {
            const vertex = new THREE.Vector3(positions.getX(i), positions.getY(i), positions.getZ(i));
            // Transform vertex to world space to compare with pod
            vertex.applyMatrix4(asteroid.matrixWorld);
            if (vertex.distanceTo(surfacePos) < 4.0) {
                colors.setXYZ(i, targetColor.r, targetColor.g, targetColor.b);
            }
        }
        colors.needsUpdate = true;
    }
    else if (currentTool === 3) {
        // Add Atmosphere
        if (atmosphereMat.opacity < 0.4) {
            atmosphereMat.opacity += 0.05;
        }
    }
}

// --- Audio (Calming Synth) ---
let audioOn = false;
document.addEventListener('click', () => {
    if (audioOn) return;
    audioOn = true;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const playDrone = (freq, detune) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.detune.value = detune;
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
    };
    playDrone(146.83, 0); // D3
    playDrone(146.83, 6); // Chorus
    playDrone(220.00, 0); // A3
});

// --- Main Loop ---
function animate() {
    requestAnimationFrame(animate);

    const speed = 0.03;
    if (keys.w) phi -= speed;
    if (keys.s) phi += speed;
    if (keys.a) theta -= speed;
    if (keys.d) theta += speed;
    phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));

    const x = orbitRadius * Math.sin(phi) * Math.sin(theta);
    const y = orbitRadius * Math.cos(phi);
    const z = orbitRadius * Math.sin(phi) * Math.cos(theta);
    podGroup.position.set(x, y, z);

    const upVector = new THREE.Vector3().copy(podGroup.position).normalize();
    const forward = new THREE.Vector3(
        orbitRadius * Math.sin(phi) * Math.sin(theta + 0.1), y, orbitRadius * Math.sin(phi) * Math.cos(theta + 0.1)
    );
    podGroup.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(podGroup.position, forward, upVector));

    const cameraOffset = new THREE.Vector3(x, y, z).normalize().multiplyScalar(orbitRadius + 8);
    camera.position.lerp(cameraOffset, 0.1);
    camera.lookAt(0, 0, 0);

    asteroid.rotation.y += 0.0005;
    atmosphere.rotation.y += 0.0008;

    renderer.render(scene, camera);
}
animate();
