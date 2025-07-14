import * as THREE from 'three';

let scene, camera, renderer, cube;

init();
animate();

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 5;

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(5, 5, 5);
  scene.add(light);

  const ambient = new THREE.AmbientLight(0x404040);
  scene.add(ambient);

  createBox(1, 1, 1); // 初期ボックス

  document.getElementById('generate').addEventListener('click', () => {
    const w = parseFloat(document.getElementById('width').value);
    const h = parseFloat(document.getElementById('height').value);
    const d = parseFloat(document.getElementById('depth').value);
    createBox(w, h, d);
  });

  window.addEventListener('resize', onWindowResize);
}

function createBox(width, height, depth) {
  if (cube) {
    scene.remove(cube);
    cube.geometry.dispose();
    cube.material.dispose();
  }

  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({ color: 0x2194ce });
  cube = new THREE.Mesh(geometry, material);
  scene.add(cube);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  if (cube) cube.rotation.y += 0.01;
  renderer.render(scene, camera);
}
