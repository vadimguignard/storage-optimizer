/* simulator.js — simulator orchestration and result display */
(function (root) {
  'use strict';
  const SO = root.SO;
  const data = SO.data, ui = SO.ui;
  const geom = SO, packing = SO;
  const t = (key, vars) => SO.i18n.t(key, vars);
  const num = (value, digits) => Number(value.toFixed(digits)).toLocaleString(SO.i18n.locale, { maximumFractionDigits: digits });
  let settings = data.loadSettings();
  let viewer = null;
  let lastResult = null;

  function selectedIds(kind) {
    const key = kind === 'object' ? 'selectedObjects' : 'selectedContainers';
    return settings[key];
  }

  function setSelectedIds(kind, ids) {
    const key = kind === 'object' ? 'selectedObjects' : 'selectedContainers';
    settings[key] = ids;
  }

  function buildList(kind) {
    const items = kind === 'object' ? data.loadObjects() : data.loadContainers();
    const chosen = selectedIds(kind);
    const list = ui.el(kind === 'object' ? 'object-list' : 'carton-list');
    list.innerHTML = items.map(item => {
      const checked = chosen == null || chosen.includes(item.id);
      const qty = Number(item.quantity) || 1;
      return `<label class="check-item">
        <input type="checkbox" data-${kind}="${ui.escapeHtml(item.id)}" ${checked ? 'checked' : ''}>
        <span class="ci-name">${ui.escapeHtml(item.name)}${qty > 1 ? ` <span class="badge">×${qty}</span>` : ''}</span>
        <span class="ci-dim">${ui.escapeHtml(ui.dimensionsText(item.dimensions, item.unit))}</span>
      </label>`;
    }).join('') || `<span class="card-sub">${ui.escapeHtml(t('sim.noElements'))}</span>`;

    list.querySelectorAll(`input[data-${kind}]`).forEach(input => {
      input.addEventListener('change', () => {
        const all = items.map(i => i.id);
        const checked = Array.from(list.querySelectorAll(`input[data-${kind}]:checked`)).map(i => i.dataset[kind]);
        setSelectedIds(kind, checked.length === all.length ? null : checked);
        data.saveSettings(settings);
      });
    });
  }

  function refreshLists() {
    buildList('object');
    buildList('carton');
  }

  function readSpace() {
    const unit = ui.el('space-unit').value;
    return {
      length: geom.toCm(ui.el('space-length').value, unit),
      width: geom.toCm(ui.el('space-width').value, unit),
      height: geom.toCm(ui.el('space-height').value, unit)
    };
  }

  function updateSpaceSummary() {
    let space;
    try { space = readSpace(); }
    catch (e) { ui.el('space-summary').textContent = ''; return; }
    const vol = (space.length * space.width * space.height) / 1e6;
    ui.el('space-summary').textContent =
      `${num(space.length, 0)} × ${num(space.width, 0)} × ${num(space.height, 0)} cm · ${num(vol, 2)} m³`;
  }

  function saveFormSettings() {
    settings.space = {
      length: Number(ui.el('space-length').value),
      width: Number(ui.el('space-width').value),
      height: Number(ui.el('space-height').value),
      unit: ui.el('space-unit').value
    };
    settings.mode = ui.el('mode').value;
    settings.rotations = ui.el('rotations').checked;
    settings.attempts = Number(ui.el('attempts').value);
    data.saveSettings(settings);
  }

  function updateToggleLabels() {
    const spaceBtn = ui.el('btn-toggle-space');
    if (spaceBtn) spaceBtn.innerHTML = `◻ <span>${ui.escapeHtml(t(spaceBtn.dataset.state === 'off' ? 'sim.showOutline' : 'sim.outline'))}</span>`;
    const cartonBtn = ui.el('btn-toggle-cartons');
    if (cartonBtn) cartonBtn.innerHTML = `📮 <span>${ui.escapeHtml(t(cartonBtn.dataset.state === 'off' ? 'sim.showBoxes' : 'sim.boxesToggle'))}</span>`;
  }

  function applySettings() {
    const s = settings.space || {};
    ui.el('space-length').value = s.length != null ? s.length : 300;
    ui.el('space-width').value = s.width != null ? s.width : 200;
    ui.el('space-height').value = s.height != null ? s.height : 250;
    ui.el('space-unit').value = s.unit || 'cm';
    ui.el('mode').value = settings.mode || 'space';
    ui.el('rotations').checked = settings.rotations !== false;
    ui.el('attempts').value = settings.attempts || 12;
    ui.el('attempts-label').textContent = t('sim.attempts', { n: ui.el('attempts').value });
    ui.el('carton-field').hidden = ui.el('mode').value !== 'cartons';
    updateSpaceSummary();
    updateToggleLabels();
    refreshLists();
  }

  function showResult(result) {
    lastResult = result;
    const s = result.stats;
    const banner = ui.el('result-banner');
    const ok = result.success;
    banner.className = `result-banner ${ok ? 'ok' : 'fail'}`;
    banner.innerHTML = `<span class="rb-icon">${ok ? '✅' : '⚠️'}</span>
      <div><strong>${ui.escapeHtml(t(ok ? 'sim.ok.title' : 'sim.fail.title'))}</strong>
      <small>${ui.escapeHtml(t(ok ? 'sim.ok.sub' : 'sim.fail.sub'))}</small></div>`;

    ui.el('kpis').hidden = false;
    const cartonMode = result.mode === 'cartons';
    const count = cartonMode ? s.objectsCount : (s.placedCount + (result.unplaced || []).length);
    ui.el('kpi-placed-label').textContent = t(cartonMode ? 'sim.kpi.placedBoxes' : 'sim.kpi.placedItems');
    ui.el('kpi-placed').textContent = cartonMode
      ? `${s.placedCount} / ${s.cartonsCount}`
      : `${s.placedCount} / ${count}`;
    ui.el('kpi-fill').textContent = `${num(s.fillRate * 100, 1)} %`;
    ui.el('fill-bar').style.width = `${Math.min(100, s.fillRate * 100)}%`;
    ui.el('kpi-height').textContent = ui.formatDim(s.usedHeight);
    ui.el('kpi-time').textContent = `${num(s.timeMs, 0)} ms`;

    ui.el('result-meta').textContent = cartonMode
      ? t('sim.meta.boxes', { n: count, b: s.cartonsCount, a: s.attempts })
      : t('sim.meta.items', { n: count, a: s.attempts });

    const unplaced = result.unplaced || [];
    ui.el('unplaced-block').hidden = unplaced.length === 0;
    ui.el('unplaced-list').innerHTML = unplaced.map(u =>
      `<li>${ui.escapeHtml(u.name)} — ${ui.escapeHtml(ui.dimensionsText({ length: u.size.l, width: u.size.w, height: u.size.h }, 'cm'))}</li>`
    ).join('');

    const hasCartons = result.mode === 'cartons' && s.cartonsCount > 0;
    ui.el('btn-toggle-cartons').hidden = !hasCartons;
    if (viewer) {
      viewer.setShowCartons(true);
      viewer.setResult(result);
      // The CSS rule [hidden] { display: none !important } makes this effective.
      ui.el('viewer-placeholder').hidden = true;
    }
  }

  function optimize() {
    saveFormSettings();
    let space;
    try { space = readSpace(); }
    catch (e) { ui.toast(SO.i18n.t(e.message) === e.message ? e.message : SO.i18n.t(e.message), 'error'); return; }

    const objects = data.loadObjects().filter(o => selectedIds('object') == null || selectedIds('object').includes(o.id));
    const cartons = data.loadContainers().filter(c => selectedIds('carton') == null || selectedIds('carton').includes(c.id));
    if (!objects.length) { ui.toast(t('sim.noItems'), 'warning'); return; }

    const button = ui.el('btn-optimize');
    ui.setBusy(button, true, t('sim.calculating'));
    setTimeout(() => {
      let result;
      try {
        const options = { attempts: settings.attempts, rotations: settings.rotations, timeLimitMs: 4000 };
        result = settings.mode === 'cartons'
          ? packing.packWithCartons(objects, cartons, space, options)
          : packing.pack(objects, space, options);
        showResult(result);
        ui.toast(result.success ? t('sim.done') : t('sim.someLeft', { n: result.unplaced.length }), result.success ? 'success' : 'warning');
      } catch (e) {
        ui.toast(t('sim.calcError', { msg: e.message }), 'error');
        console.error(e);
      } finally {
        ui.setBusy(button, false);
      }
    }, 30);
  }

  document.addEventListener('DOMContentLoaded', () => {
    viewer = SO.Viewer3D({
      container: ui.el('viewer'),
      label: ui.el('viewer-label')
    });
    applySettings();

    ['space-length', 'space-width', 'space-height', 'space-unit'].forEach(id => {
      ui.el(id).addEventListener('input', () => {
        updateSpaceSummary();
        saveFormSettings();
      });
    });
    ui.el('mode').addEventListener('change', e => {
      ui.el('carton-field').hidden = e.target.value !== 'cartons';
      saveFormSettings();
    });
    ui.el('rotations').addEventListener('change', saveFormSettings);
    ui.el('attempts').addEventListener('input', e => {
      ui.el('attempts-label').textContent = t('sim.attempts', { n: e.target.value });
      saveFormSettings();
    });
    ui.el('btn-optimize').addEventListener('click', optimize);
    ui.el('btn-reset-camera').addEventListener('click', () => viewer.resetCamera());
    ui.el('btn-toggle-space').addEventListener('click', () => {
      const btn = ui.el('btn-toggle-space');
      btn.dataset.state = btn.dataset.state === 'off' ? 'on' : 'off';
      viewer.setShowSpace(btn.dataset.state !== 'off');
      updateToggleLabels();
    });
    ui.el('btn-toggle-cartons').addEventListener('click', () => {
      const btn = ui.el('btn-toggle-cartons');
      btn.dataset.state = btn.dataset.state === 'off' ? 'on' : 'off';
      viewer.setShowCartons(btn.dataset.state !== 'off');
      updateToggleLabels();
    });
    ui.el('select-all').addEventListener('click', () => {
      setSelectedIds('object', null);
      setSelectedIds('carton', null);
      data.saveSettings(settings);
      refreshLists();
    });
    ui.el('select-none').addEventListener('click', () => {
      setSelectedIds('object', []);
      setSelectedIds('carton', []);
      data.saveSettings(settings);
      refreshLists();
    });
    window.addEventListener('so:data-changed', () => {
      settings = data.loadSettings();
      refreshLists();
    });
    window.addEventListener('so:lang-changed', () => {
      applySettings();
      if (lastResult) showResult(lastResult);
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
