/* containers.js — box list management and fit checks */
(function (root) {
  'use strict';
  const SO = root.SO;
  const data = SO.data, ui = SO.ui, geom = SO;
  const t = (key, vars) => SO.i18n.t(key, vars);
  let query = '';

  function dimLabel(key) {
    return t('common.' + key);
  }

  function estimatedBadge(c) {
    if (!c.estimated || !c.estimated.length) return '';
    return ` <span class="badge badge-amber" title="${ui.escapeHtml(c.estimated.map(dimLabel).join(', '))}">≈ ${ui.escapeHtml(t('common.estimated'))}</span>`;
  }

  function render() {
    const all = data.loadContainers();
    const objects = data.loadObjects();
    const locale = SO.i18n.locale;
    const q = query.trim().toLocaleLowerCase(locale);
    const items = all.filter(c => !q || String(c.name).toLocaleLowerCase(locale).includes(q));
    const body = ui.el('containers-body');
    body.innerHTML = items.map(c => {
      const norm = geom.normalizeContainer(c);
      const qty = norm.quantity;
      const contents = (c.contents || []).map(id => {
        const obj = objects.find(o => o.id === id);
        return obj ? obj.name : id;
      });
      return `<tr>
        <td><div class="row-name"><span class="swatch" style="background:${ui.escapeHtml(c.color || '#d97706')}"></span> ${ui.escapeHtml(c.name)}</div><div class="row-sub">${ui.escapeHtml(c.id)}</div></td>
        <td>${ui.escapeHtml(ui.dimensionsText(c.dimensions, c.unit))}${estimatedBadge(c)}</td>
        <td>${ui.formatVolume(geom.volume(norm.size))}</td>
        <td><span class="badge badge-amber">× ${qty}</span></td>
        <td>${contents.length ? contents.map(n => `<span class="badge">${ui.escapeHtml(n)}</span>`).join(' ') : '<span class="card-sub">—</span>'}</td>
        <td><div class="row-actions">
          <button class="btn btn-sm btn-ghost" data-edit="${ui.escapeHtml(c.id)}" type="button" title="${ui.escapeHtml(t('common.edit'))}">✎</button>
          <button class="btn btn-sm btn-ghost" data-delete="${ui.escapeHtml(c.id)}" type="button" title="${ui.escapeHtml(t('common.delete'))}">🗑</button>
        </div></td>
      </tr>`;
    }).join('');
    ui.el('containers-empty').hidden = items.length > 0;
    ui.el('count-badge').textContent = t('containers.count', { n: items.length });

    body.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
      openForm(all.find(c => c.id === btn.dataset.edit));
    }));
    body.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async () => {
      const c = all.find(x => x.id === btn.dataset.delete);
      if (!c || !await ui.confirm(t('containers.deleteConfirm', { name: c.name }), t('containers.deleteTitle'))) return;
      data.saveContainers(data.loadContainers().filter(x => x.id !== c.id));
      ui.toast(t('containers.deleted'), 'success');
    }));
  }

  function formHtml(item, objects) {
    const c = item || {
      id: '', name: '', unit: 'cm', quantity: 1, color: '#d97706',
      dimensions: { length: '', width: '', height: '' }, estimated: [], contents: []
    };
    const estimated = c.estimated || [];
    const v = (obj, key) => ui.escapeHtml(obj[key] == null ? '' : obj[key]);
    const d = c.dimensions || {};
    const mark = key => estimated.includes(key) ? ' ≈' : '';
    return `
      <div class="form-row">
        <div class="field" style="grid-column:span 2"><label for="c-name">${ui.escapeHtml(t('common.name'))} *</label><input id="c-name" value="${v(c, 'name')}" required></div>
        <div class="field"><label for="c-quantity">${ui.escapeHtml(t('containers.available'))}</label><input id="c-quantity" type="number" min="1" step="1" value="${v(c, 'quantity') || 1}"></div>
      </div>
      <div class="form-row" style="margin-top:14px">
        <div class="field"><label for="c-length">${ui.escapeHtml(t('common.length'))} *${mark('length')}</label><input id="c-length" type="number" min="0" step="any" value="${v(d, 'length')}"></div>
        <div class="field"><label for="c-width">${ui.escapeHtml(t('common.width'))} *${mark('width')}</label><input id="c-width" type="number" min="0" step="any" value="${v(d, 'width')}"></div>
        <div class="field"><label for="c-height">${ui.escapeHtml(t('common.height'))} *${mark('height')}</label><input id="c-height" type="number" min="0" step="any" value="${v(d, 'height')}"></div>
      </div>
      <div class="form-row" style="margin-top:14px">
        <div class="field"><label for="c-unit">${ui.escapeHtml(t('common.unit'))}</label><select id="c-unit">
          ${geom.units.map(u => `<option value="${u}" ${c.unit === u ? 'selected' : ''}>${u}</option>`).join('')}
        </select></div>
        <div class="field" style="grid-column:span 2"><label for="c-color">${ui.escapeHtml(t('common.color'))}</label><input id="c-color" type="color" value="${ui.escapeHtml(c.color || '#d97706')}" style="padding:4px;height:42px"></div>
      </div>
      <p class="field-hint" style="margin-top:12px">≈ = ${ui.escapeHtml(t('containers.form.estimatedHint'))}</p>
      <div class="field" style="margin-top:16px"><label for="c-fit-object">${ui.escapeHtml(t('containers.fitLabel'))}</label>
        <div style="display:flex;gap:8px">
          <select id="c-fit-object"><option value="">${ui.escapeHtml(t('containers.fitChoose'))}</option>${objects.map(o => `<option value="${ui.escapeHtml(o.id)}">${ui.escapeHtml(o.name)}</option>`).join('')}</select>
          <button class="btn btn-ghost" id="c-fit-test" type="button">${ui.escapeHtml(t('containers.fitTest'))}</button>
        </div>
        <span class="field-hint" id="c-fit-result"></span>
      </div>
      <div class="field" style="margin-top:16px"><label>${ui.escapeHtml(t('common.declaredContents'))}</label>
        <div class="check-list">${objects.map(o => `<label class="check-item"><input type="checkbox" value="${ui.escapeHtml(o.id)}" ${(c.contents || []).includes(o.id) ? 'checked' : ''}><span class="ci-name">${ui.escapeHtml(o.name)}</span><span class="ci-dim">${ui.escapeHtml(ui.dimensionsText(o.dimensions, o.unit))}</span></label>`).join('') || `<span class="card-sub">${ui.escapeHtml(t('containers.noItems'))}</span>`}</div>
      </div>`;
  }

  function openForm(item) {
    const editing = !!item;
    const objects = data.loadObjects();
    const modal = ui.openModal(t(editing ? 'containers.form.edit' : 'containers.form.new'), formHtml(item, objects), `
      <button class="btn btn-ghost" data-modal-close type="button">${ui.escapeHtml(t('common.cancel'))}</button>
      <button class="btn btn-primary" data-save type="button">${ui.escapeHtml(t('common.save'))}</button>`);

    modal.querySelector('#c-fit-test').addEventListener('click', () => {
      const val = id => modal.querySelector('#' + id).value;
      const obj = objects.find(o => o.id === val('c-fit-object'));
      const result = modal.querySelector('#c-fit-result');
      if (!obj) { result.textContent = t('containers.fitPick'); result.style.color = 'var(--danger)'; return; }
      const container = {
        id: 'test', name: 'test', type: 'box', unit: val('c-unit'),
        dimensions: { length: val('c-length'), width: val('c-width'), height: val('c-height') }
      };
      try {
        const ok = geom.fitsIn(obj, container, true);
        result.textContent = t(ok ? 'containers.fitOk' : 'containers.fitNo', { name: obj.name });
        result.style.color = ok ? 'var(--success)' : 'var(--danger)';
      } catch (e) {
        result.textContent = SO.i18n.t(e.message);
        result.style.color = 'var(--danger)';
      }
    });

    modal.querySelector('[data-save]').addEventListener('click', () => {
      const val = id => modal.querySelector('#' + id).value;
      const rawDimensions = { length: val('c-length'), width: val('c-width'), height: val('c-height') };
      const candidate = {
        id: editing ? item.id : data.newId('container'),
        name: val('c-name').trim(),
        type: 'box',
        dimensions: rawDimensions,
        unit: val('c-unit'),
        quantity: Math.max(1, Math.floor(Number(val('c-quantity')) || 1)),
        color: val('c-color'),
        contents: Array.from(modal.querySelectorAll('.check-item input:checked')).map(i => i.value)
      };
      const errors = geom.validateObject(candidate);
      if (errors.length) { ui.toast(errors.map(e => SO.i18n.t(e)).join(' '), 'error'); return; }
      const resolved = geom.resolveDimensions(rawDimensions, 'box');
      const c = Object.assign({}, candidate, { dimensions: resolved.values, estimated: resolved.estimated });
      const list = data.loadContainers();
      if (editing) {
        const i = list.findIndex(x => x.id === item.id);
        if (i >= 0) list[i] = c;
      } else list.push(c);
      data.saveContainers(list);
      ui.closeModal();
      ui.toast(t(editing ? 'containers.updated' : 'containers.added'), 'success');
      resolved.estimated.forEach(key => {
        ui.toast(SO.i18n.t('containers.estimatedToast', { dim: dimLabel(key), value: resolved.values[key], unit: c.unit }), 'warning');
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
