/* objects.js — item list management */
(function (root) {
  'use strict';
  const SO = root.SO;
  const data = SO.data, ui = SO.ui, geom = SO;
  const t = (key, vars) => SO.i18n.t(key, vars);
  let query = '';

  const rotationsLabel = { allowed: 'common.all', upright: 'common.upright', none: 'common.none' };
  const rotationsBadge = { allowed: 'badge-blue', upright: 'badge-amber', none: '' };

  function dimLabel(key) {
    return key === 'diameter' ? t('common.diameter') : t('common.' + key);
  }

  function estimatedBadge(item) {
    if (!item.estimated || !item.estimated.length) return '';
    return ` <span class="badge badge-amber" title="${ui.escapeHtml(item.estimated.map(dimLabel).join(', '))}">≈ ${ui.escapeHtml(t('common.estimated'))}</span>`;
  }

  function render() {
    const all = data.loadObjects();
    const q = query.trim().toLocaleLowerCase();
    const items = all.filter(o => !q || String(o.name).toLocaleLowerCase().includes(q));
    const body = ui.el('objects-body');
    body.innerHTML = items.map(o => {
      const norm = geom.normalizeItem(o);
      const qty = norm.quantity;
      return `<tr>
        <td><div class="row-name"><span class="swatch" style="background:${ui.escapeHtml(o.color || '#94a3b8')}"></span> ${ui.escapeHtml(o.name)}</div><div class="row-sub">${ui.escapeHtml(o.id)}</div></td>
        <td><span class="badge">${ui.escapeHtml(t(o.type === 'cylinder' ? 'common.cylinder' : 'common.box'))}</span></td>
        <td>${ui.escapeHtml(ui.dimensionsText(o.dimensions, o.unit))}${estimatedBadge(o)}</td>
        <td>${ui.formatVolume(geom.volume(norm.size))}${qty > 1 ? `<div class="row-sub">× ${qty} = ${ui.formatVolume(geom.volume(norm.size) * qty)}</div>` : ''}</td>
        <td><span class="badge ${rotationsBadge[o.rotations] || ''}">${ui.escapeHtml(t(rotationsLabel[o.rotations] || 'common.all'))}</span></td>
        <td>${qty}</td>
        <td><div class="row-actions">
          <button class="btn btn-sm btn-ghost" data-edit="${ui.escapeHtml(o.id)}" type="button" title="${ui.escapeHtml(t('common.edit'))}">✎</button>
          <button class="btn btn-sm btn-ghost" data-delete="${ui.escapeHtml(o.id)}" type="button" title="${ui.escapeHtml(t('common.delete'))}">🗑</button>
        </div></td>
      </tr>`;
    }).join('');
    ui.el('objects-empty').hidden = items.length > 0;
    ui.el('count-badge').textContent = t('objects.count', { n: items.length });

    body.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
      openForm(all.find(o => o.id === btn.dataset.edit));
    }));
    body.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async () => {
      const obj = all.find(o => o.id === btn.dataset.delete);
      if (!obj || !await ui.confirm(t('objects.deleteConfirm', { name: obj.name }), t('objects.deleteTitle'))) return;
      data.saveObjects(data.loadObjects().filter(o => o.id !== obj.id));
      ui.toast(t('objects.deleted'), 'success');
    }));
  }

  function formHtml(item) {
    const o = item || {
      id: '', name: '', type: 'box', unit: 'cm', rotations: 'allowed',
      quantity: 1, color: '#3b82f6', estimated: [],
      dimensions: { length: '', width: '', height: '' }
    };
    const estimated = o.estimated || [];
    const v = (obj, key) => ui.escapeHtml(obj[key] == null ? '' : obj[key]);
    const d = o.dimensions || {};
    const mark = key => estimated.includes(key) ? ' ≈' : '';
    const isCylinder = o.type === 'cylinder';
    return `
      <div class="form-row">
        <div class="field" style="grid-column:span 2"><label for="f-name">${ui.escapeHtml(t('common.name'))} *</label><input id="f-name" value="${v(o, 'name')}" required></div>
        <div class="field"><label for="f-quantity">${ui.escapeHtml(t('common.quantity'))}</label><input id="f-quantity" type="number" min="1" step="1" value="${v(o, 'quantity') || 1}"></div>
      </div>
      <div class="form-row" style="margin-top:14px">
        <div class="field"><label for="f-type">${ui.escapeHtml(t('common.shape'))}</label><select id="f-type">
          <option value="box" ${!isCylinder ? 'selected' : ''}>${ui.escapeHtml(t('common.box'))} (L × W × H)</option>
          <option value="cylinder" ${isCylinder ? 'selected' : ''}>${ui.escapeHtml(t('common.cylinder'))} (Ø × H)</option>
        </select></div>
        <div class="field"><label for="f-unit">${ui.escapeHtml(t('common.unit'))}</label><select id="f-unit">
          ${geom.units.map(u => `<option value="${u}" ${o.unit === u ? 'selected' : ''}>${u}</option>`).join('')}
        </select></div>
        <div class="field"><label for="f-rotations">${ui.escapeHtml(t('common.rotations'))}</label><select id="f-rotations">
          <option value="allowed" ${o.rotations === 'allowed' ? 'selected' : ''}>${ui.escapeHtml(t('common.all'))}</option>
          <option value="upright" ${o.rotations === 'upright' ? 'selected' : ''}>${ui.escapeHtml(t('common.upright'))}</option>
          <option value="none" ${o.rotations === 'none' ? 'selected' : ''}>${ui.escapeHtml(t('common.none'))}</option>
        </select></div>
      </div>
      <div class="form-row" style="margin-top:14px">
        <div class="field dim-box" ${isCylinder ? 'hidden' : ''}><label for="f-length">${ui.escapeHtml(t('common.length'))} *${mark('length')}</label><input id="f-length" type="number" min="0" step="any" value="${ui.escapeHtml(d.length == null ? '' : d.length)}"></div>
        <div class="field dim-box" ${isCylinder ? 'hidden' : ''}><label for="f-width">${ui.escapeHtml(t('common.width'))} *${mark('width')}</label><input id="f-width" type="number" min="0" step="any" value="${ui.escapeHtml(d.width == null ? '' : d.width)}"></div>
        <div class="field dim-box" ${isCylinder ? 'hidden' : ''}><label for="f-height">${ui.escapeHtml(t('common.height'))} *${mark('height')}</label><input id="f-height" type="number" min="0" step="any" value="${ui.escapeHtml(d.height == null ? '' : d.height)}"></div>
        <div class="field dim-cyl" ${!isCylinder ? 'hidden' : ''}><label for="f-diameter">${ui.escapeHtml(t('common.diameter'))} *${mark('diameter')}</label><input id="f-diameter" type="number" min="0" step="any" value="${ui.escapeHtml(d.diameter == null ? '' : d.diameter)}"></div>
        <div class="field dim-cyl" ${!isCylinder ? 'hidden' : ''}><label for="f-cyl-height">${ui.escapeHtml(t('common.height'))} *${mark('height')}</label><input id="f-cyl-height" type="number" min="0" step="any" value="${ui.escapeHtml(d.height == null ? '' : d.height)}"></div>
      </div>
      <div class="field" style="margin-top:14px;max-width:200px"><label for="f-color">${ui.escapeHtml(t('common.color'))}</label><input id="f-color" type="color" value="${ui.escapeHtml(o.color || '#3b82f6')}" style="padding:4px;height:42px"></div>
      <p class="field-hint" style="margin-top:12px">≈ = ${ui.escapeHtml(t('objects.form.estimatedHint'))}</p>
      <p class="field-hint">${ui.escapeHtml(t('objects.form.cylinderHint'))}</p>`;
  }

  function openForm(item) {
    const editing = !!item;
    const modal = ui.openModal(t(editing ? 'objects.form.edit' : 'objects.form.new'), formHtml(item), `
      <button class="btn btn-ghost" data-modal-close type="button">${ui.escapeHtml(t('common.cancel'))}</button>
      <button class="btn btn-primary" data-save type="button">${ui.escapeHtml(t('common.save'))}</button>`);

    const typeSel = modal.querySelector('#f-type');
    const toggleDims = () => {
      const cyl = typeSel.value === 'cylinder';
      modal.querySelectorAll('.dim-box').forEach(n => n.hidden = cyl);
      modal.querySelectorAll('.dim-cyl').forEach(n => n.hidden = !cyl);
    };
    typeSel.addEventListener('change', toggleDims);
    toggleDims();

    modal.querySelector('[data-save]').addEventListener('click', () => {
      const val = id => modal.querySelector('#' + id).value;
      const type = typeSel.value;
      const rawDimensions = type === 'cylinder'
        ? { diameter: val('f-diameter'), height: val('f-cyl-height') }
        : { length: val('f-length'), width: val('f-width'), height: val('f-height') };
      const candidate = {
        id: editing ? item.id : data.newId('item'),
        name: val('f-name').trim(), type, dimensions: rawDimensions,
        unit: val('f-unit'), rotations: val('f-rotations'),
        quantity: Math.max(1, Math.floor(Number(val('f-quantity')) || 1)),
        color: val('f-color')
      };
      const errors = geom.validateObject(candidate);
      if (errors.length) { ui.toast(errors.map(e => SO.i18n.t(e)).join(' '), 'error'); return; }
      const resolved = geom.resolveDimensions(rawDimensions, type);
      const obj = Object.assign({}, candidate, { dimensions: resolved.values, estimated: resolved.estimated });
      const list = data.loadObjects();
      if (editing) {
        const i = list.findIndex(o => o.id === item.id);
        if (i >= 0) list[i] = obj;
      } else list.push(obj);
      data.saveObjects(list);
      ui.closeModal();
      ui.toast(t(editing ? 'objects.updated' : 'objects.added'), 'success');
      resolved.estimated.forEach(key => {
        ui.toast(SO.i18n.t('objects.estimatedToast', { dim: dimLabel(key), value: resolved.values[key], unit: obj.unit }), 'warning');
      });
      render();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    ui.el('btn-add').addEventListener('click', () => openForm(null));
    ui.el('search').addEventListener('input', e => { query = e.target.value; render(); });
    window.addEventListener('so:data-changed', render);
    window.addEventListener('so:lang-changed', render);
    render();
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
