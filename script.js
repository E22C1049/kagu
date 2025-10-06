// script.js（修正版）
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

let scene, camera, renderer, cube, controls;

init();
animate();

function init() {
  // シーン
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f6f8);

  // カメラ
  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.01,
    1000
  );
  camera.position.set(2.5, 2, 3);

  // レンダラ
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  // 操作
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.5, 0);

  // ライト
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(5, 8, 5);
  scene.add(dirLight);
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));

  // ガイド（任意）
  const grid = new THREE.GridHelper(10, 20);
  scene.add(grid);
  const axes = new THREE.AxesHelper(1.5);
  scene.add(axes);

  // 初期ボックス
  createBox(1, 1, 1);

  // UIイベント
  document.getElementById('generate').addEventListener('click', () => {
    const w = parseFloat(document.getElementById('width').value);
    const h = parseFloat(document.getElementById('height').value);
    const d = parseFloat(document.getElementById('depth').value);

    if (![w, h, d].every(Number.isFinite) || w <= 0 || h <= 0 || d <= 0) {
      alert('幅・高さ・奥行きには 0 より大きい数値を入力してください。');
      return;
    }
    createBox(w, h, d);
  });

  window.addEventListener('resize', onWindowResize);
}

function createBox(width, height, depth) {
  if (cube) {
    scene.remove(cube);
    cube.geometry.dispose();
    cube.material.dispose();
    cube = null;
  }

  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({ color: 0x2194ce, roughness: 0.5, metalness: 0.0 });
  cube = new THREE.Mesh(geometry, material);
  cube.position.set(0, height / 2, 0); // 底面がy=0に乗るように
  scene.add(cube);

  // カメラに収まるよう自動フレーミング
  fitCameraToObject(camera, cube, 1.4);
  controls.target.copy(cube.position);
  controls.update();
}

function fitCameraToObject(cam, object3D, offset = 1.2) {
  const box = new THREE.Box3().setFromObject(object3D);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = cam.fov * (Math.PI / 180);
  let cameraZ = (maxDim / 2) / Math.tan(fov / 2);
  cameraZ *= offset;

  // カメラ位置をターゲット中心に向けて調整（水平後退）
  cam.position.set(center.x + cameraZ, center.y + cameraZ * 0.6, center.z + cameraZ);
  cam.near = cameraZ / 100;
  cam.far = cameraZ * 100;
  cam.updateProjectionMatrix();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
