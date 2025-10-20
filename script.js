// script.js — Roboflow解析→3D表示 ＋ 物体配置（生成/ダブルクリック選択/ドラッグ/完了/削除）
// 単位設定: unitScale=0.1（UIで1入力 → ワールド0.1）

let accessToken = null;
let latestJson = null;

/* Google Drive 認証 */
function handleCredentialResponse(_) {
    console.log("Googleログイン成功");
    requestAccessToken();
}
function requestAccessToken() {
    google.accounts.oauth2.initTokenClient({
        client_id: '479474446026-kej6f40kvfm6dsuvfeo5d4fm87c6god4.apps.googleusercontent.com',
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (tokenResponse) => {
            accessToken = tokenResponse.access_token;
            console.log("アクセストークン取得済");
            updateFileSelect();
        }
    }).requestAccessToken();
}

/* =========================
   Placement（配置コントローラ）
   ========================= */
class Placement {
    constructor({ scene, camera, renderer, controls = null, ui, unitScale = 1 }) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.controls = controls;      // OrbitControls（任意）
        this.ui = ui || {};
        this.unit = unitScale;         // ★ UI 1 あたりのワールド長さ（例: 0.1）

        this.objects = [];      // 家具メッシュ
        this.selected = null;   // 選択中メッシュ
        this.outline = null;    // 選択アウトライン
        this.isDragging = false;
        this.enabled = true;
        this.snap = 0;          // 例: 0.05 で5cmスナップ

        // レイキャスト & ドラッグ平面（y=0 のXZ）
        this.ray = new THREE.Raycaster();
        this.ndc = new THREE.Vector2();
        this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.dragOffset = new THREE.Vector3();
        this.hit = new THREE.Vector3();

        this._bindUI();
        this._bindPointer();
        this._updateStatus('未選択');
        if (this.ui.doneBtn) this.ui.doneBtn.disabled = true;
        if (this.ui.delBtn) this.ui.delBtn.disabled = true;
    }

    dispose() {
        const el = this.renderer.domElement;
        el.removeEventListener('dblclick', this._onDblClick);
        el.removeEventListener('pointerdown', this._onDown);
        el.removeEventListener('pointermove', this._onMove);
        el.removeEventListener('pointerup', this._onUp);
        window.removeEventListener('keydown', this._onKeyDown);

        this._clearSelection();
        this.objects.forEach(m => {
            this.scene.remove(m);
            m.geometry?.dispose();
            m.material?.dispose();
        });
        this.objects = [];
    }

    setEnabled(flag) {
        this.enabled = !!flag;
        if (!this.enabled) {
            this._clearSelection();
            if (this.ui.genBtn) this.ui.genBtn.disabled = true;
        } else {
            if (this.ui.genBtn) this.ui.genBtn.disabled = false;
        }
    }

    _bindUI() {
        const { wEl, hEl, dEl, genBtn, doneBtn, delBtn, statusEl } = this.ui;
        this.wEl = wEl; this.hEl = hEl; this.dEl = dEl;
        this.genBtn = genBtn; this.doneBtn = doneBtn; this.delBtn = delBtn; this.statusEl = statusEl;

        if (this.genBtn) {
            this.genBtn.addEventListener('click', () => {
                if (!this.enabled) return;
                const w = parseFloat(this.wEl?.value ?? '1');
                const h = parseFloat(this.hEl?.value ?? '1');
                const d = parseFloat(this.dEl?.value ?? '1');
                if (![w, h, d].every(Number.isFinite) || w <= 0 || h <= 0 || d <= 0) {
                    alert('幅・高さ・奥行きには 0 より大きい数値を入力してください。');
                    return;
                }
                this.addBox({ width: w, height: h, depth: d });
            });
        }
        if (this.doneBtn) this.doneBtn.addEventListener('click', () => this._clearSelection());
        if (this.delBtn) this.delBtn.addEventListener('click', () => this._deleteSelected());

        // キーボード削除
        this._onKeyDown = (e) => {
            if (!this.enabled) return;
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected) {
                e.preventDefault();
                this._deleteSelected();
            }
        };
        window.addEventListener('keydown', this._onKeyDown);
    }

    _bindPointer() {
        const el = this.renderer.domElement;

        // ダブルクリックで選択
        this._onDblClick = (ev) => {
            if (!this.enabled) return;
            this._setNDC(ev);
            this.ray.setFromCamera(this.ndc, this.camera);
            const hits = this.ray.intersectObjects(this.objects, false);
            if (hits.length > 0) this._select(hits[0].object);
        };

        // 選択中 & 物体上でのみドラッグ開始
        this._onDown = (ev) => {
            if (!this.enabled || !this.selected) return;
            this._setNDC(ev);
            this.ray.setFromCamera(this.ndc, this.camera);
            const hits = this.ray.intersectObject(this.selected, false);
            if (hits.length === 0) return;
            if (this.ray.ray.intersectPlane(this.dragPlane, this.hit)) {
                this.dragOffset.copy(this.hit).sub(this.selected.position);
                this.isDragging = true;
                if (this.controls) this.controls.enabled = false;
            }
        };

        this._onMove = (ev) => {
            if (!this.enabled || !this.isDragging || !this.selected) return;
            this._setNDC(ev);
            this.ray.setFromCamera(this.ndc, this.camera);
            if (this.ray.ray.intersectPlane(this.dragPlane, this.hit)) {
                const target = new THREE.Vector3().copy(this.hit).sub(this.dragOffset);
                if (this.snap > 0) {
                    target.x = Math.round(target.x / this.snap) * this.snap;
                    target.z = Math.round(target.z / this.snap) * this.snap;
                }
                // 底面は常に y=0
                const H = this._getHeight(this.selected);
                this.selected.position.set(target.x, H / 2, target.z);
                if (this.outline) this.outline.position.copy(this.selected.position);
            }
        };

        this._onUp = () => {
            if (this.isDragging) {
                this.isDragging = false;
                if (this.controls) this.controls.enabled = true;
            }
        };

        el.addEventListener('dblclick', this._onDblClick);
        el.addEventListener('pointerdown', this._onDown);
        el.addEventListener('pointermove', this._onMove);
        el.addEventListener('pointerup', this._onUp);
    }

    _setNDC(ev) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.ndc.set(
            ((ev.clientX - rect.left) / rect.width) * 2 - 1,
            -((ev.clientY - rect.top) / rect.height) * 2 + 1
        );
    }

    _updateStatus(text) {
        if (this.statusEl) this.statusEl.textContent = text;
    }

    _getHeight(mesh) {
        const p = mesh.geometry?.parameters;
        return p?.height ?? 1;
    }

    addBox({ width = 1, height = 1, depth = 1, color = 0x2194ce, position = null }) {
        // ★ UIの数値にunitを乗算（1 → 0.1）
        const W = width * this.unit;
        const H = height * this.unit;
        const D = depth * this.unit;

        const geo = new THREE.BoxGeometry(W, H, D);
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.0 });
        const box = new THREE.Mesh(geo, mat);
        box.castShadow = true; box.receiveShadow = true;
        box.position.copy(position ?? new THREE.Vector3(0, H / 2, 0)); // 底面をy=0に
        this.scene.add(box);
        this.objects.push(box);

        // 新規生成時は未選択（誤操作防止）
        this._clearSelection();
    }

    _select(mesh) {
        if (this.selected === mesh) return;
        this._clearSelection(true); // ハイライトのみ解除
        this.selected = mesh;

        const edges = new THREE.EdgesGeometry(mesh.geometry);
        const mat = new THREE.LineBasicMaterial({ color: 0x0077ff });
        this.outline = new THREE.LineSegments(edges, mat);
        this.outline.position.copy(mesh.position);
        this.scene.add(this.outline);

        mesh.material.emissive = new THREE.Color(0x113355);
        mesh.material.emissiveIntensity = 0.15;

        this._updateStatus('選択中（ダブルクリックで選択／ドラッグで移動）');
        if (this.doneBtn) this.doneBtn.disabled = false;
        if (this.delBtn) this.delBtn.disabled = false;
    }

    _clearSelection(keepObj = false) {
        if (this.outline) {
            this.scene.remove(this.outline);
            this.outline.geometry.dispose();
            this.outline.material.dispose();
            this.outline = null;
        }
        if (this.selected?.material) this.selected.material.emissiveIntensity = 0;
        this.selected = keepObj ? this.selected : null;
        this.isDragging = false;
        if (this.controls) this.controls.enabled = true;

        this._updateStatus('未選択');
        if (this.doneBtn) this.doneBtn.disabled = true;
        if (this.delBtn) this.delBtn.disabled = true;
    }

    _deleteSelected() {
        if (!this.selected) return;
        if (this.outline) {
            this.scene.remove(this.outline);
            this.outline.geometry.dispose();
            this.outline.material.dispose();
            this.outline = null;
        }
        const i = this.objects.indexOf(this.selected);
        if (i >= 0) this.objects.splice(i, 1);
        this.scene.remove(this.selected);
        this.selected.geometry.dispose();
        this.selected.material.dispose();
        this.selected = null;

        this._updateStatus('削除しました');
        if (this.doneBtn) this.doneBtn.disabled = true;
        if (this.delBtn) this.delBtn.disabled = true;
        if (this.controls) this.controls.enabled = true;
    }
}

/* =======================
   既存UI初期化とAPI呼び出し
   ======================= */
document.addEventListener("DOMContentLoaded", () => {
    const uploadHeader = document.getElementById("upload-header");
    const uploadContainer = document.getElementById("upload-container");
    const resultHeader = document.getElementById("result-header");
    const resultContainer = document.getElementById("result-container");
    const analyzeBtn = document.getElementById("analyzeBtn");
    const previewImg = document.getElementById("preview");
    const resultPre = document.getElementById("result");
    const saveBtn = document.getElementById("saveBtn");
    const loadBtn = document.getElementById("loadBtn");
    const filenameInput = document.getElementById("filenameInput");
    const fileSelect = document.getElementById("fileSelect");

    // 配置ツールUI
    const wEl = document.getElementById('boxW');
    const hEl = document.getElementById('boxH');
    const dEl = document.getElementById('boxD');
    const genBtn = document.getElementById('genBoxBtn');
    const doneBtn = document.getElementById('moveDoneBtn');
    const delBtn = document.getElementById('moveDeleteBtn');
    const statusEl = document.getElementById('placeStatus');

    analyzeBtn.addEventListener("click", analyzeImage);

    // 折りたたみ
    const openContainer = (c) => { c.classList.remove("collapsed"); c.classList.add("expanded"); };
    const closeContainer = (c) => { c.classList.remove("expanded"); c.classList.add("collapsed"); };
    const toggleExclusive = (openElem, closeElem) => {
        if (openElem.classList.contains("expanded")) closeContainer(openElem);
        else { openContainer(openElem); closeContainer(closeElem); }
    };
    uploadHeader.addEventListener("click", () => toggleExclusive(uploadContainer, resultContainer));
    resultHeader.addEventListener("click", () => toggleExclusive(resultContainer, uploadContainer));

    // 画像プレビュー
    let selectedFile = null;
    document.getElementById("imageInput").addEventListener("change", (e) => {
        selectedFile = e.target.files[0];
        if (!selectedFile) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            previewImg.src = event.target.result;
            openContainer(uploadContainer);
            closeContainer(resultContainer);
        };
        reader.readAsDataURL(selectedFile);
    });

    // ローディング表示
    const loadingText = document.createElement("div");
    loadingText.style.color = "#008cff";
    loadingText.style.fontWeight = "bold";
    loadingText.style.marginTop = "10px";
    document.querySelector(".left-pane").appendChild(loadingText);

    let loadingInterval;

    async function analyzeImage() {
        if (!selectedFile) { alert("画像を選択してください"); return; }

        analyzeBtn.disabled = true;
        loadingText.textContent = "分析中";
        let dotCount = 0;
        loadingInterval = setInterval(() => {
            dotCount = (dotCount + 1) % 4;
            loadingText.textContent = "分析中" + ".".repeat(dotCount);
        }, 500);

        const model = "floor-plan-japan";
        const version = 7;
        const apiKey = "E0aoexJvBDgvE3nb1jkc";

        const formData = new FormData();
        formData.append("file", selectedFile);

        const url = `https://detect.roboflow.com/${model}/${version}?api_key=${apiKey}`;

        try {
            const res = await fetch(url, { method: "POST", body: formData });
            const result = await res.json();

            clearInterval(loadingInterval);
            loadingText.textContent = "";
            latestJson = result;

            resultPre.textContent = JSON.stringify(result, null, 2);
            openContainer(resultContainer); closeContainer(uploadContainer);

            draw3D(result.predictions, result.image.width, result.image.height, {
                placementUI: { wEl, hEl, dEl, genBtn, doneBtn, delBtn, statusEl }
            });
        } catch (err) {
            clearInterval(loadingInterval);
            loadingText.textContent = "エラー: " + err.message;
        } finally {
            analyzeBtn.disabled = false;
        }
    }

    // Drive 保存
    saveBtn.addEventListener("click", () => {
        if (!accessToken || !latestJson) return alert("ログインまたは解析が必要です");
        const filename = filenameInput.value.trim();
        if (!filename) return alert("保存名を入力してください");

        const metadata = { name: `${filename}.json`, mimeType: 'application/json' };
        const file = new Blob([JSON.stringify(latestJson)], { type: 'application/json' });
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', file);

        fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
            body: form
        }).then(res => res.json()).then(_ => {
            alert('保存完了'); updateFileSelect();
        }).catch(err => {
            console.error(err); alert('保存失敗');
        });
    });

    // Drive 読み込み
    loadBtn.addEventListener("click", () => {
        const fileId = fileSelect.value;
        if (!accessToken || !fileId) return alert("ログインまたはファイルを選択してください");

        fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken })
        }).then(res => res.json()).then(data => {
            latestJson = data;
            resultPre.textContent = JSON.stringify(data, null, 2);
            openContainer(resultContainer); closeContainer(uploadContainer);
            draw3D(data.predictions, data.image.width, data.image.height, {
                placementUI: { wEl, hEl, dEl, genBtn, doneBtn, delBtn, statusEl }
            });
        }).catch(err => {
            console.error(err); alert('読み込みに失敗しました');
        });
    });

    // Drive ファイル削除
    const deleteBtn = document.getElementById("deleteBtn");
    deleteBtn.addEventListener("click", () => {
        const fileId = fileSelect.value;
        if (!accessToken || !fileId) return alert("ログインまたはファイルを選択してください");
        const confirmDelete = confirm("本当にこのファイルを削除しますか？");
        if (!confirmDelete) return;

        fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: "DELETE",
            headers: new Headers({ Authorization: "Bearer " + accessToken })
        })
            .then((res) => {
                if (res.status === 204) { alert("ファイルを削除しました"); updateFileSelect(); }
                else { throw new Error("削除に失敗しました"); }
            })
            .catch((err) => { console.error(err); alert("削除エラー: " + err.message); });
    });

    function updateFileSelect() {
        if (!accessToken) return;
        fetch(`https://www.googleapis.com/drive/v3/files?q=mimeType='application/json'`, {
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken })
        }).then(res => res.json()).then(fileList => {
            fileSelect.innerHTML = `<option value="">読み込むファイルを選択</option>`;
            (fileList.files || []).forEach(file => {
                const option = document.createElement("option");
                option.value = file.id;
                option.textContent = file.name;
                fileSelect.appendChild(option);
            });
        });
    }
});

/* ==============
   3D描画本体
   ============== */
function draw3D(predictions, imageWidth, imageHeight, opts = {}) {
    const placementUI = opts.placementUI || null;

    const container = document.getElementById("three-container");
    container.innerHTML = "";

    // レンダラ
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const W = container.clientWidth;
    const H = container.clientHeight || 600;
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // シーン & カメラ & コントロール
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf2f2f2);

    const aspect = W / H;
    const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    camera.position.set(3.2, 3.2, 3.2);
    camera.lookAt(0, 0, 0);

    const controls = new window.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.15;
    controls.screenSpacePanning = false;
    controls.maxPolarAngle = Math.PI / 2;

    // ライト & 床
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(6, 10, 4);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    scene.add(dir);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const floorGeo = new THREE.PlaneGeometry(20, 20);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xE6E6E6, roughness: 0.9, metalness: 0.0 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // 解析結果を薄い箱で描画（平面的）
    const pxToWorld = 0.01; // 1px → 0.01（任意）
    const classColors = {
        "left side": 0xffffff, "right side": 0xffffff, "top side": 0xffffff, "under side": 0xffffff,
        wall: 0xaaaaaa, door: 0x8b4513, "glass door": 0x87cefa,
        window: 0x1e90ff, closet: 0xffa500, fusuma: 0xda70d6,
    };

    (predictions || []).forEach((pred) => {
        const w = Math.max(pred.width * pxToWorld, 0.01);
        const h = Math.max(pred.height * pxToWorld, 0.01);
        const geometry = new THREE.BoxGeometry(w, 0.1, h);
        const color = classColors[pred.class] || 0xffffff;
        const material = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0, transparent: true, opacity: 0.85 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.x = (pred.x - imageWidth / 2) * pxToWorld;
        mesh.position.y = 0.05;
        mesh.position.z = -(pred.y - imageHeight / 2) * pxToWorld;
        mesh.receiveShadow = true;
        scene.add(mesh);
    });

    // ★ 配置コントローラ起動（unitScale=0.1 = UIの1→0.1）
    const placement = new Placement({
        scene, camera, renderer,
        controls,
        ui: placementUI || {},
        unitScale: 0.1
    });

    // リサイズ対応
    window.addEventListener("resize", onResize);
    function onResize() {
        const W = container.clientWidth, H = container.clientHeight || 600;
        renderer.setSize(W, H);
        camera.aspect = W / H;
        camera.updateProjectionMatrix();
    }

    // ループ
    (function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    })();
}
