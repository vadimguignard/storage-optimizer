/*
 * viewer3d.js — rendu Three.js du résultat de packing
 * Correspondance des axes : interne (x=longueur, y=largeur, z=hauteur) -> Three (x, z, y)
 */
(function (root) {
  'use strict';
  const SO = root.SO = root.SO || {};

  function Viewer3D(options) {
    const host = options.container;
    const labelEl = options.label || null;
    if (typeof THREE === 'undefined') {
      host.innerHTML = '<div class="viewer-placeholder"><div><div class="vp-icon">⚠</div>Three.js is not loaded (check <code>assets/vendor/three.min.js</code>).</div></div>';
      return { setResult() {}, resetCamera() {}, setShowCartons() {}, setShowSpace() {}, dispose() {} };
    }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      host.innerHTML = '<div class="viewer-placeholder"><div><div class="vp-icon">⚠</div>WebGL is not available in this browser.</div></div>';
      return { setResult() {}, resetCamera() {}, setShowCartons() {}, setShowSpace() {}, dispose() {} };
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.domElement.style.display = 'block';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, host.clientWidth / host.clientHeight, 0.1, 100000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.5));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(1, 2, 1.5);
    scene.add(dir);

    const world = new THREE.Group();
    scene.add(world);
    let contentGroup = null;
    let spaceLines = null;
    let grid = null;
    let selected = null;
    let cartonsVisible = true;
    let spaceVisible = true;
    let currentSpace = { length: 100, width: 100, height: 100 };
    let disposables = [];

    const target = new THREE.Vector3();
    const spherical = { theta: Math.PI * 0.25, phi: Math.PI * 0.32, radius: 600 };
    let defaultRadius = 600;

    function updateCamera() {
      const s = Math.sin(spherical.phi);
      camera.position.set(
        target.x + spherical.radius * s * Math.sin(spherical.theta),
        target.y + spherical.radius * Math.cos(spherical.phi),
        target.z + spherical.radius * s * Math.cos(spherical.theta)
      );
      camera.lookAt(target);
    }

    function fitCamera(space) {
      currentSpace = space;
      target.set(space.length / 2, space.height / 2, space.width / 2);
      defaultRadius = Math.max(space.length, space.width, space.height, 10) * 2.1;
      spherical.radius = defaultRadius;
      spherical.theta = Math.PI * 0.25;
      spherical.phi = Math.PI * 0.32;
      updateCamera();
    }

    function clearWorld() {
      for (const item of disposables) {
        if (item.geometry) item.geometry.dispose();
        if (item.material) {
          if (Array.isArray(item.material)) item.material.forEach(m => m.dispose());
          else item.material.dispose();
        }
      }
      disposables = [];
      while (world.children.length) world.remove(world.children[0]);
      contentGroup = null; spaceLines = null; grid = null; selected = null;
      if (labelEl) labelEl.style.display = 'none';
    }

    function track(object) {
      if (object.geometry) disposables.push(object.geometry);
      if (object.material) disposables.push(object.material);
      return object;
    }

    function makeBoxMesh(size, position, color, opacity) {
      const geometry = new THREE.BoxGeometry(size.l, size.h, size.w);
      const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color(color || '#64748b'),
        transparent: opacity < 1,
        opacity: opacity,
        shininess: 35,
        side: THREE.DoubleSide,
        depthWrite: opacity >= 0.9
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(position.x + size.l / 2, position.z + size.h / 2, position.y + size.w / 2);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: 0x1e293b, transparent: true, opacity: opacity < 0.5 ? 0.7 : 0.9 })
      );
      mesh.add(edges);
      disposables.push(edges.geometry, edges.material);
      return track(mesh);
    }

    function setResult(result) {
      clearWorld();
      if (!result || !result.space) return;
      fitCamera(result.space);

      contentGroup = new THREE.Group();
      world.add(contentGroup);

      const spaceGeo = new THREE.BoxGeometry(result.space.length, result.space.height, result.space.width);
      spaceLines = new THREE.LineSegments(
        new THREE.EdgesGeometry(spaceGeo),
        new THREE.LineBasicMaterial({ color: 0x4f46e5, linewidth: 2 })
      );
      spaceLines.position.set(result.space.length / 2, result.space.height / 2, result.space.width / 2);
      world.add(track(spaceLines));
      spaceGeo.dispose();

      grid = new THREE.GridHelper(
        Math.max(result.space.length, result.space.width) * 1.8,
        Math.max(8, Math.round(Math.max(result.space.length, result.space.width) / 25)),
        0x94a3b8, 0xcbd5e1
      );
      grid.position.set(result.space.length / 2, -0.1, result.space.width / 2);
      grid.material.transparent = true;
      grid.material.opacity = 0.5;
      world.add(track(grid));

      const axes = new THREE.AxesHelper(Math.min(result.space.length, result.space.width) * 0.18);
      world.add(track(axes));

      for (const p of result.placed || []) {
        const isCarton = !!p.isContainer;
        const mesh = makeBoxMesh(p.size, p.position, p.color || (isCarton ? '#d97706' : '#3b82f6'), isCarton ? 0.22 : 0.88);
        mesh.userData = {
          label: p.label || p.name || 'Objet',
          dims: `${p.size.l.toFixed(0)} × ${p.size.w.toFixed(0)} × ${p.size.h.toFixed(0)} cm`,
          isCarton: isCarton,
          isShell: true
        };
        contentGroup.add(mesh);
        if (isCarton) mesh.visible = cartonsVisible;

        for (const child of p.contents || []) {
          if (!child.size || !child.position) continue;
          const group = new THREE.Group();
          group.position.set(p.position.x, p.position.z, p.position.y);
          const childMesh = makeBoxMesh(child.size, child.position, child.color || '#22c55e', 0.9);
          childMesh.userData = {
            label: child.name || 'Contenu',
            dims: `${child.size.l.toFixed(0)} × ${child.size.w.toFixed(0)} × ${child.size.h.toFixed(0)} cm`,
            isCarton: false, isShell: false
          };
          group.add(childMesh);
          contentGroup.add(group);
        }
      }
      renderLabel();
    }

    function setShowCartons(visible) {
      cartonsVisible = !!visible;
      if (!contentGroup) return;
      contentGroup.traverse(obj => {
        if (obj.isMesh && obj.userData && obj.userData.isShell && obj.userData.isCarton) obj.visible = cartonsVisible;
      });
    }

    function setShowSpace(visible) {
      spaceVisible = !!visible;
      if (spaceLines) spaceLines.visible = spaceVisible;
      if (grid) grid.visible = spaceVisible;
    }

    function renderLabel() {
      if (!labelEl || !selected) { if (labelEl) labelEl.style.display = 'none'; return; }
      const pos = new THREE.Vector3();
      selected.getWorldPosition(pos);
      pos.project(camera);
      const width = host.clientWidth, height = host.clientHeight;
      const x = (pos.x * 0.5 + 0.5) * width;
      const y = (-pos.y * 0.5 + 0.5) * height;
      if (pos.z > 1 || x < 0 || x > width || y < 0 || y > height) {
        labelEl.style.display = 'none';
        return;
      }
      labelEl.innerHTML = `<strong>${selected.userData.label}</strong><br>${selected.userData.dims}`;
      labelEl.style.display = 'block';
      labelEl.style.left = `${Math.min(x + 12, width - 190)}px`;
      labelEl.style.top = `${Math.max(y - 42, 6)}px`;
    }

    // ---------- contrôles caméra ----------
    let dragging = false, moved = 0, lastX = 0, lastY = 0, panning = false;
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none';

    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
      panning = e.button === 2 || e.shiftKey;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (panning) {
        const scale = spherical.radius * 0.0016;
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
        target.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
      } else {
        spherical.theta -= dx * 0.006;
        spherical.phi = Math.max(0.12, Math.min(Math.PI - 0.12, spherical.phi - dy * 0.006));
      }
      updateCamera();
    });
    canvas.addEventListener('pointerup', e => {
      if (dragging && moved < 5) pick(e);
      dragging = false;
    });
    canvas.addEventListener('pointercancel', () => { dragging = false; });

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      spherical.radius = Math.max(defaultRadius * 0.12, Math.min(defaultRadius * 6, spherical.radius * Math.exp(e.deltaY * 0.0012)));
      updateCamera();
    }, { passive: false });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    function pick(e) {
      if (!contentGroup) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(contentGroup.children, true);
      const hit = hits.find(h => h.object.isMesh);
      selected = hit ? hit.object : null;
      renderLabel();
      if (options.onSelect) options.onSelect(selected ? selected.userData : null);
    }

    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderLabel();
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (observer) observer.observe(host);
    else window.addEventListener('resize', resize);

    let raf = 0;
    function animate() {
      raf = requestAnimationFrame(animate);
      if (selected) renderLabel();
      renderer.render(scene, camera);
    }
    fitCamera(currentSpace);
    animate();

    return {
      setResult,
      resetCamera: () => fitCamera(currentSpace),
      setShowCartons,
      setShowSpace,
      dispose() {
        cancelAnimationFrame(raf);
        if (observer) observer.disconnect();
        else window.removeEventListener('resize', resize);
        clearWorld();
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }

  SO.Viewer3D = Viewer3D;
})(typeof globalThis !== 'undefined' ? globalThis : this);
