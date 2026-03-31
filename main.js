import * as THREE from 'three';

// --- Core Setup & Soft Aesthetics ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x13111c);
scene.fog = new THREE.FogExp2(0x13111c, 0.02); // Soft cosmic fog

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Smoother edges
document.body.appendChild(renderer.domElement);

// --- Soft Lighting ---
const hemiLight = new THREE.HemisphereLight(0xffbbf0, 0x080820, 0.6); // Pink/purple ambient
scene.add(hemiLight);
const dirLight = new THREE.DirectionalLight(0xfffaee, 0.8);
dirLight.position.set(50, 20, 30);
scene.add(dirLight);

// --- The Asteroid (Smooth & organic) ---
const asteroidRadius = 10;
const asteroidGeo = new THREE.SphereGeometry(asteroidRadius, 64, 64); // High poly for smoothness
const asteroidMat = new THREE.MeshStandardMaterial({ 
    color: 0x3d3545, // Soft dusty purple-brown
    roughness: 0.8,
    metalness: 0.1
});
const asteroid = new THREE.Mesh(asteroidGeo, asteroidMat);
scene.add(asteroid);

// --- Floating Spores (Atmosphere) ---
const particlesGeo = new THREE.BufferGeometry();
const particleCount = 400;
const posArray = new Float32Array(particleCount * 3);
for(let i=0; i < particleCount * 3; i++) {
    posArray[i] = (Math.random() - 0.5) * 40;
}
particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const particleMat = new THREE.PointsMaterial({
    size: 0.1,
    color: 0xa7f3d0,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending
});
const particleMesh = new THREE.Points(particlesGeo, particleMat);
scene.add(particleMesh);

// --- The Player Pod (Softer shape) ---
const podGroup = new THREE.Group();
const hullGeo = new THREE.CapsuleGeometry(0.3, 0.8, 4, 16);
hullGeo.rotateX(Math.PI / 2); 
const hullMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.4 });
const hull = new THREE.Mesh(hullGeo, hullMat);
podGroup.add(hull);
// Add a soft glowing thruster
const thrusterLight = new THREE.PointLight(0x44aaff, 1, 3);
thrusterLight.position.set(0, 0, -0.6);
podGroup.add(thrusterLight);
scene.add(podGroup);

// --- Game State & Logic ---
let theta = 0, phi = Math.PI / 2;
const orbitRadius = asteroidRadius + 2.5;
const keys = { w: false, a: false, s: false, d: false, space: false };
let terraformProgress = 0;
const maxProgress = 30; // Plant 30 trees to win
let gameWon = false;

const growingPlants = []; // Array to hold plants that need to animate

// UI Elements
const uiProgressBar = document.getElementById('progress-bar');
const uiProgressText = document.getElementById('progress-text');
const winScreen = document.getElementById('win-screen');

window.addEventListener('keydown', (e) => {
    if (e.key === 'w') keys.w = true;
    if (e.key === 's') keys.s = true;
    if (e.key === 'a') keys.a = true;
    if (e.key === 'd') keys.d = true;
    if (e.key === ' ' && !keys.space) {
        keys.space = true;
        plantSeed();
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'w') keys.w = false;
    if (e.key === 's') keys.s = false;
    if (e.key === 'a') keys.a = false;
    if (e.key === 'd') keys.d = false;
    if (e.key === ' ') keys.space = false;
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Planting & Growth Mechanics ---
function plantSeed() {
    if (gameWon) return;

    const worldSurfacePos = podGroup.position.clone().normalize().multiplyScalar(asteroidRadius);
    const localSurfacePos = asteroid.worldToLocal(worldSurfacePos.clone());

    // Create a softer, more organic tree
    const treeGroup = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0x4a3f35 }));
    trunk.position.y = 0.4;
    
    // Smooth spheres for canopy instead of sharp shapes
    const canopy1 = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 16), new THREE.MeshStandardMaterial({ color: 0x34d399, transparent: true, opacity: 0.9 }));
    canopy1.position.y = 1.0;
    const canopy2 = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16), new THREE.MeshStandardMaterial({ color: 0x6ee7b7, transparent: true, opacity: 0.8 }));
    canopy2.position.set(0.3, 1.3, 0.2);

    treeGroup.add(trunk, canopy1, canopy2);
    treeGroup.position.copy(localSurfacePos);
    
    const localNormal = localSurfacePos.clone().normalize();
    treeGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), localNormal);
    
    // Start scale at 0 for organic growth animation
    treeGroup.scale.set(0.01, 0.01, 0.01);
    asteroid.add(treeGroup);
    
    growingPlants.push(treeGroup);

    // Update Game Progress
    terraformProgress++;
    let percent = Math.min((terraformProgress / maxProgress) * 100, 100);
    uiProgressBar.style.width = percent + '%';
    uiProgressText.innerText = `Terraformed: ${Math.floor(percent)}%`;

    if (terraformProgress >= maxProgress && !gameWon) {
        gameWon = true;
        winScreen.style.opacity = 1;
        asteroidMat.color.setHex(0x2d4c1e); // Turn the whole planet softly green
    }
}

// --- Gentle Ambient Audio ---
let audioOn = false;
document.addEventListener('click', () => {
    if (audioOn) return;
    audioOn = true;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Gentle pentatonic drone
    const playDrone = (freq, type, vol) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        // Very soft filter
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;

        osc.type = type;
        osc.frequency.value = freq;
        
        gain.gain.setValueAtTime(0, ctx.currentTime);
        // Very slow, soft attack (10 seconds to fade in)
        gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 10);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
    };
    
    playDrone(130.81, 'sine', 0.06); // C3
    playDrone(196.00, 'sine', 0.04); // G3
    playDrone(261.63, 'triangle', 0.02); // C4
});

// --- Main Render Loop ---
let targetCameraPos = new THREE.Vector3();

function animate() {
    requestAnimationFrame(animate);

    // Gentle floating animation for the pod
    const hoverOffset = Math.sin(Date.now() * 0.002) * 0.1;

    // Pod Movement Logic
    const speed = 0.02;
    if (keys.w) phi -= speed;
    if (keys.s) phi += speed;
    if (keys.a) theta -= speed;
    if (keys.d) theta += speed;
    phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));

    const x = (orbitRadius + hoverOffset) * Math.sin(phi) * Math.sin(theta);
    const y = (orbitRadius + hoverOffset) * Math.cos(phi);
    const z = (orbitRadius + hoverOffset) * Math.sin(phi) * Math.cos(theta);
    podGroup.position.set(x, y, z);

    // Orient Pod smoothly
    const upVector = new THREE.Vector3().copy(podGroup.position).normalize();
    const forward = new THREE.Vector3(
        orbitRadius * Math.sin(phi) * Math.sin(theta + 0.1), 
        y, 
        orbitRadius * Math.sin(phi) * Math.cos(theta + 0.1)
    );
    podGroup.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(podGroup.position, forward, upVector));

    // Smooth Camera Follow (Lerping for cinematic feel)
    const idealCameraOffset = new THREE.Vector3(x, y, z).normalize().multiplyScalar(orbitRadius + 8);
    targetCameraPos.lerp(idealCameraOffset, 0.05);
    camera.position.copy(targetCameraPos);
    camera.lookAt(0, 0, 0);

    // Rotate World slowly
    asteroid.rotation.y += 0.0005;
    asteroid.rotation.z += 0.0002;
    particleMesh.rotation.y += 0.001;

    // Animate Tree Growth
    for (let i = growingPlants.length - 1; i >= 0; i--) {
        const plant = growingPlants[i];
        if (plant.scale.x < 1) {
            plant.scale.x += 0.02;
            plant.scale.y += 0.02;
            plant.scale.z += 0.02;
        } else {
            growingPlants.splice(i, 1); // Stop animating once fully grown
        }
    }

    renderer.render(scene, camera);
}

animate();
