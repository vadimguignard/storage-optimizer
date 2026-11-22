/* containers.js — gestion des cartons et vérification de compatibilité */
(function (root) {
  'use strict';
  const SO = root.SO;
  const data = SO.data, ui = SO.ui, geom = SO;
  let query = '';

  function render() {
    const all = data.loadContainers();
    const q = query.trim().toLocaleLowerCase('fr');
    const items = all.filter(c => !q || String(c.name).toLocaleLowerCase('fr').includes(q));
    const body = ui.el('containers-body');
    body.innerHTML = items.map(c => {
      const norm = geom.normalizeContainer(c);
      const volume = geom.volume(norm.size);
      const qty = norm.quantity;
      const contents = (c.contents || []).map(id => {
        const obj = data.loadObjects().find(o => o.id === id);
        return obj ? obj.name : id;
      });
      return `<tr>
        <td><div class="row-name"><span class="swatch" style="background:${ui.escapeHtml(c.color || '#d97706')}"></span> ${ui.escapeHtml(c.name)}</div><div class="row-sub">${ui.escapeHtml(c.id)}</div></td>
        <td>${ui.escapeHtml(ui.dimensionsText(c.dimensions, c.unit))}</td>
        <td>${ui.formatVolume(volume)}</td>
        <td><span class="badge badge-amber">× ${qty}</span></td>
        <td>${contents.length ? contents.map(n => `<span class="badge">${ui.escapeHtml(n)}</span>`).join(' ') : '<span class="card-sub">—</span>'}</td>
        <td><div class="row-actions">
          <button class="btn btn-sm btn-ghost" data-edit="${ui.escapeHtml(c.id)}" type="button">✎</button>
          <button class="btn btn-sm btn-ghost" data-delete="${ui.escapeHtml(c.id)}" type="button">🗑</button>
        </div></td>
      </tr>`;
    }).join('');
    ui.el('containers-empty').hidden = items.length > 0;
    ui.el('count-badge').textContent = `${items.length} carton${items.length > 1 ? 's' : ''}`;

    body.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
      openForm(all.find(c => c.id === btn.dataset.edit));
    }));
    body.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async () => {
      const c = all.find(x => x.id === btn.dataset.delete);
      if (!c || !await ui.confirm(`Supprimer « ${c.name} » ?`, 'Supprimer un carton')) return;
      data.saveContainers(data.loadContainers().filter(x => x.id !== c.id));
      ui.toast('Carton supprimé.', 'success');
    }));
  }

  function formHtml(item, objects) {
    const c = item || {
      id: '', name: '', unit: 'cm', quantity: 1, color: '#d97706',
      dimensions: { length: '', width: '', height: '' }, contents: []
    };
    const v = (obj, key) => ui.escapeHtml(obj[key] == null ? '' : obj[key]);
    const d = c.dimensions || {};
    return `
      <div class="form-row">
        <div class="field" style="grid-column:span 2"><label for="c-name">Nom *</label><input id="c-name" value="${v(c, 'name')}" placeholder="Ex. Carton standard" required></div>
        <div class="field"><label for="c-quantity">Quantité disponible</label><input id="c-quantity" type="number" min="1" step="1" value="${v(c, 'quantity') || 1}"></div>
      </div>
      <div class="form-row" style="margin-top:14px">
        <div class="field"><label for="c-length">Longueur *</label><input id="c-length" type="number" min="0.1" step="any" value="${ui.escapeHtml(d.length == null ? '' : d.length)}"></div>
        <div class="field"><label for="c-width">Largeur *</label><input id="c-width" type="number" min="0.1" step="any" value="${ui.escapeHtml(d.width == null ? '' : d.width)}"></div>
        <div class="field"><label for="c-height">Hauteur *</label><input id="c-height" type="number" min="0.1" step="any" value="${ui.escapeHtml(d.height == null ? '' : d.height)}"></div>
      </div>
      <div class="form-row" style="margin-top:14px">
        <div class="field"><label for="c-unit">Unité</label><select id="c-unit">
          ${geom.units.map(u => `<option value="${u}" ${c.unit === u ? 'selected' : ''}>${u}</option>`).join('')}
        </select></div>
        <div class="field" style="grid-column:span 2"><label for="c-color">Couleur dans la scène 3D</label><input id="c-color" type="color" value="${ui.escapeHtml(c.color || '#d97706')}" style="padding:4px;height:42px"></div>
      </div>
      <div class="field" style="margin-top:16px"><label for="c-fit-object">Tester si un objet rentre</label>
        <div style="display:flex;gap:8px">
          <select id="c-fit-object"><option value="">— Choisir un objet —</option>${objects.map(o => `<option value="${ui.escapeHtml(o.id)}">${ui.escapeHtml(o.name)}</option>`).join('')}</select>
          <button class="btn btn-ghost" id="c-fit-test" type="button">Tester</button>
        </div>
        <span class="field-hint" id="c-fit-result"></span>
      </div>
      <div class="field" style="margin-top:16px"><label>Contenu déclaré (indicatif)</label>
        <div class="check-list">${objects.map(o => `<label class="check-item"><input type="checkbox" value="${ui.escapeHtml(o.id)}" ${(c.contents || []).includes(o.id) ? 'checked' : ''}><span class="ci-name">${ui.escapeHtml(o.name)}</span><span class="ci-dim">${ui.escapeHtml(ui.dimensionsText(o.dimensions, o.unit))}</span></label>`).join('') || '<span class="card-sub">Ajoutez d’abord des objets.</span>'}</div>
      </div>`;
  }

  function openForm(item) {
    const editing = !!item;
    const objects = data.loadObjects();
    const modal = ui.openModal(editing ? 'Modifier le carton' : 'Nouveau carton', formHtml(item, objects), `
      <button class="btn btn-ghost" data-modal-close type="button">Annuler</button>
      <button class="btn btn-primary" data-save type="button">Enregistrer</button>`);

    modal.querySelector('#c-fit-test').addEventListener('click', () => {
      const val = id => modal.querySelector('#' + id).value;
      const obj = objects.find(o => o.id === val('c-fit-object'));
      const result = modal.querySelector('#c-fit-result');
      if (!obj) { result.textContent = 'Choisissez un objet.'; return; }
      const container = {
        id: 'test', name: 'test', type: 'box', unit: val('c-unit'),
        dimensions: { length: Number(val('c-length')), width: Number(val('c-width')), height: Number(val('c-height')) }
      };
      try {
        const ok = geom.fitsIn(obj, container, true);
        result.textContent = ok ? `✓ « ${obj.name} » rentre dans ce carton.` : `✗ « ${obj.name} » ne rentre pas dans ce carton.`;
        result.style.color = ok ? 'var(--success)' : 'var(--danger)';
      } catch (e) {
        result.textContent = e.message;
        result.style.color = 'var(--danger)';
      }
    });

    modal.querySelector('[data-save]').addEventListener('click', () => {
      const val = id => modal.querySelector('#' + id).value;
      const c = {
        id: editing ? item.id : data.newId('carton'),
        name: val('c-name').trim(),
        type: 'box',
        dimensions: { length: Number(val('c-length')), width: Number(val('c-width')), height: Number(val('c-height')) },
        unit: val('c-unit'),
        quantity: Math.max(1, Math.floor(Number(val('c-quantity')) || 1)),
        color: val('c-color'),
        contents: Array.from(modal.querySelectorAll('.check-item input:checked')).map(i => i.value)
      };
      const errors = geom.validateObject(Object.assign({}, c, { type: 'box' }));
      if (errors.length) { ui.toast(errors.join(' '), 'error'); return; }
      const list = data.loadContainers();
      if (editing) {
        const i = list.findIndex(x => x.id === item.id);
        if (i >= 0) list[i] = c;
      } else list.push(c);
      data.saveContainers(list);
      ui.closeModal();
      ui.toast(editing ? 'Carton mis à jour.' : 'Carton ajouté.', 'success');
      render();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    ui.el('btn-add').addEventListener('click', () => openForm(null));
    ui.el('search').addEventListener('input', e => { query = e.target.value; render(); });
    window.addEventListener('so:data-changed', render);
    render();
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
