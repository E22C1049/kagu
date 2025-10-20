import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let cube = null;        
let outline = null;     
let currentHeight = 1;  

const statusEl = document.getElementById('status');
const doneBtn = document.getElementById('done');
const deleteBtn = document.getElementById('delete');

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // XZ平面(y=0)
const planeIntersectPoint = new THREE.Vector3();
const dragOffset = new THREE.Vector3();
let isSelected = false;
let isDragging = false;

init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f6f8);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 1000);
    camera.position.set(2.5, 2, 3);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.5, 0);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 8, 5);
    scene.add(dirLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    scene.add(new THREE.GridHelper(10, 20));
    scene.add(new THREE.AxesHelper(1.5));

    // 初期の箱
    createBox(1, 1, 1);

    document.getElementById('generate').addEventListener('click', () => {
        const w = parseFloat(document.getElementById('width').value);
        const h = parseFloat(document.getElementById('height').value);
        const d = parseFloat(document.getElementById('depth').value);
        if (![w, h, d].every(Number.isFinite) || w <= 0 || h <= 0 || d <= 0) {
            alert('幅・高さ・奥行きには 0 より大きい数値を入力してください。');
            return;
        }
        createBox(w, h, d);
        clearSelection(); 
    });

    doneBtn.addEventListener('click', () => {
        clearSelection(); 
    });

    deleteBtn.addEventListener('click', () => {
        deleteSelected(); 
    });

    // 入力（ダブルクリックで選択）
    renderer.domElement.addEventListener('dblclick', onDoubleClick);

    // ドラッグ（選択中のみ）
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    window.addEventListener('resize', onWindowResize);

    window.addEventListener('keydown', (e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && isSelected) {
            e.preventDefault();
            deleteSelected();
        }
    });
}

function createBox(width, height, depth) {
    if (cube) {
        scene.remove(cube);
        cube.geometry.dispose();
        cube.material.dispose();
        cube = null;
    }
    if (outline) {
        scene.remove(outline);
        outline.geometry.dispose();
        outline.material.dispose();
        outline = null;
    }

    // 新規作成
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({ color: 0x2194ce, roughness: 0.5, metalness: 0.0 });
    cube = new THREE.Mesh(geometry, material);
    currentHeight = height;
    cube.position.set(0, height / 2, 0); 
    scene.add(cube);

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

    cam.position.set(center.x + cameraZ, center.y + cameraZ * 0.6, center.z + cameraZ);
    cam.near = cameraZ / 100;
    cam.far = cameraZ * 100;
    cam.updateProjectionMatrix();
}

function setPointerFromEvent(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    pointer.set(x, y);
}

//ダブルクリック
function onDoubleClick(event) {
    setPointerFromEvent(event);
    raycaster.setFromCamera(pointer, camera);
    const hits = cube ? raycaster.intersectObject(cube, false) : [];
    if (hits.length > 0) {
        selectCube();
    }
}

function onPointerDown(event) {
    if (!isSelected) return;

    setPointerFromEvent(event);
    raycaster.setFromCamera(pointer, camera);
    const hits = cube ? raycaster.intersectObject(cube, false) : [];
    if (hits.length === 0) return; 

    if (raycaster.ray.intersectPlane(dragPlane, planeIntersectPoint)) {
        dragOffset.copy(planeIntersectPoint).sub(cube.position);
        isDragging = true;
        controls.enabled = false; 
    }
}

function onPointerMove(event) {
    if (!isDragging || !isSelected) return;

    setPointerFromEvent(event);
    raycaster.setFromCamera(pointer, camera);

    if (raycaster.ray.intersectPlane(dragPlane, planeIntersectPoint)) {
        const target = new THREE.Vector3().copy(planeIntersectPoint).sub(dragOffset);

        cube.position.set(target.x, currentHeight / 2, target.z);
        if (outline) outline.position.copy(cube.position);
    }
}

function onPointerUp() {
    if (isDragging) {
        isDragging = false;
        controls.enabled = true;
    }
}

// 選択状態
function selectCube() {
    if (!cube) return;
    if (isSelected) return;

    isSelected = true;
    statusEl.textContent = '選択中（ドラッグで移動）';
    doneBtn.disabled = false;
    deleteBtn.disabled = false;

    const edges = new THREE.EdgesGeometry(cube.geometry);
    const mat = new THREE.LineBasicMaterial({ color: 0x0077ff });
    outline = new THREE.LineSegments(edges, mat);
    outline.position.copy(cube.position);
    scene.add(outline);

    cube.material.emissive = new THREE.Color(0x113355);
    cube.material.emissiveIntensity = 0.15;
}

function clearSelection() {
    isSelected = false;
    isDragging = false;
    controls.enabled = true;
    statusEl.textContent = 'ダブルクリックで選択';
    doneBtn.disabled = true;
    deleteBtn.disabled = true;

    if (outline) {
        scene.remove(outline);
        outline.geometry.dispose();
        outline.material.dispose();
        outline = null;
    }
    if (cube && cube.material) {
        cube.material.emissiveIntensity = 0.0;
    }
}

//物体の削除
function deleteSelected() {
    if (!isSelected || !cube) return;

    if (outline) {
        scene.remove(outline);
        outline.geometry.dispose();
        outline.material.dispose();
        outline = null;
    }

    scene.remove(cube);
    cube.geometry.dispose();
    cube.material.dispose();
    cube = null;

    statusEl.textContent = '削除済み';
    isSelected = false;
    isDragging = false;
    doneBtn.disabled = true;
    deleteBtn.disabled = true;
    controls.enabled = true;
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
