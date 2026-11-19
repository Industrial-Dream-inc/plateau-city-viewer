import * as THREE from 'three';
import { City } from './city/City.js';
import { Debris } from './city/Debris.js';
import { WalkControls } from './controls/WalkControls.js';

const params = new URLSearchParams(location.search);
const cityUrl = params.get('city') || './data/ginza.city.json';

const $ = (id) => document.getElementById(id);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const sky = new THREE.Color(0xbfd3e6);
scene.background = sky;
scene.fog = new THREE.Fog(sky, 120, 520);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 2000);
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6b6255, 1.4));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
sun.position.set(-120, 200, 80);
scene.add(sun);

const status = $('status');
status.textContent = 'Loading city…';
const data = await (await fetch(cityUrl)).json();
const city = new City(data);
scene.add(city.mesh);

// ground: asphalt with faint 10 m grid so speed reads while walking
const groundSize = Math.max(city.width, city.depth) * 3;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize), new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const grid = new THREE.GridHelper(groundSize, groundSize / 10, 0x6a6e73, 0x62666b);
grid.position.y = 0.02;
scene.add(grid);
// edge of the loaded crop
const edge = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(city.width, 0.1, city.depth)),
  new THREE.LineBasicMaterial({ color: 0xffb347 }));
edge.position.y = 0.05;
scene.add(edge);

const debris = new Debris(scene, { groundAt: (x, z) => city.grid.groundAt(x, z) });
const controls = new WalkControls(camera, canvas, city.grid);
controls.spawn(0, 0, 0);

// --- breaking things --------------------------------------------------------
const ray = new THREE.Raycaster();
ray.far = 400;
const beams = [];
const beamMat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true });

function fireFrom(ndcX, ndcY) {
  ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const hit = city.pick(ray);
  if (!hit) return null;
  const from = camera.position.clone().add(new THREE.Vector3(0.3, -0.3, 0).applyQuaternion(camera.quaternion));
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, hit.point]), beamMat.clone());
  scene.add(line); beams.push({ line, t: 0.25 });
  const b = city.buildings[hit.bid];
  debris.impact(hit.point, hit.normal, b.color, 8);
  city.damage(hit.bid, 1, camera.position);
  return hit;
}

function stomp() {
  // area hit in front of the walker: a giant footstep, an explosion, etc.
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize();
  const p = controls.pos.clone().addScaledVector(fwd, 14);
  city.damageSphere(p, 22, 6);
  debris.puff(p.setY(0.5), 40, 8, 16, 3);
  shake = Math.max(shake, 0.6);
}

let shake = 0;
city.on('collapse', (bid, b) => {
  debris.collapseBurst(b);
  const d = b.center.distanceTo(camera.position);
  shake = Math.max(shake, Math.min(1.2, 60 / Math.max(20, d)));
});
city.on('destroyed', () => updateHud());
city.on('hit', () => updateHud());

canvas.addEventListener('mousedown', (e) => {
  if (!controls.locked) { controls.lock(); return; }
  if (e.button === 0) fireFrom(0, 0);
  else if (e.button === 2) stomp();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('keydown', (e) => { if (e.code === 'KeyE' && !e.repeat) stomp(); });
controls.onTap = (x, y) => fireFrom((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
$('btn-stomp').addEventListener('click', stomp);
$('btn-jump').addEventListener('touchstart', (e) => { e.preventDefault(); if (controls.onGround) controls.vy = controls.jumpSpeed; });
$('btn-reset').addEventListener('click', () => location.reload());

document.addEventListener('pointerlockchange', () => {
  $('intro').hidden = controls.locked || $('intro').dataset.dismissed === '1';
});
$('intro').addEventListener('click', () => {
  $('intro').dataset.dismissed = matchMedia('(pointer: coarse)').matches ? '1' : '0';
  $('intro').hidden = true;
  if (!matchMedia('(pointer: coarse)').matches) controls.lock();
});

function updateHud() {
  const total = city.buildings.length;
  const down = city.buildings.filter((b) => b.state !== 'standing').length;
  $('count').textContent = `${down} / ${total}`;
}
updateHud();
$('place').textContent = data.name;
$('attr').textContent = data.attribution;
status.textContent = '';

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  controls.update(dt);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.4;
    camera.position.y += (Math.random() - 0.5) * shake * 0.4;
    shake = Math.max(0, shake - dt * 1.5);
  }
  city.update(dt, t);
  debris.update(dt);
  for (let i = beams.length - 1; i >= 0; i--) {
    const bm = beams[i]; bm.t -= dt; bm.line.material.opacity = Math.max(0, bm.t * 4);
    if (bm.t <= 0) { scene.remove(bm.line); bm.line.geometry.dispose(); beams.splice(i, 1); }
  }
  renderer.render(scene, camera);
});

// handy for the console and for automated checks
window.viewer = { THREE, scene, camera, city, debris, controls, fireFrom, stomp };
