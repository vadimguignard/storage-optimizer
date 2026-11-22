/* objects.js — gestion de la liste d'objets */
(function (root) {
  'use strict';
  const SO = root.SO;
  const data = SO.data, ui = SO.ui, geom = SO;
  let query = '';

  const rotationsLabel = { allowed: 'Toutes', upright: 'Debout seul.', none: 'Aucune' };
  const rotationsBadge = { allowed: 'badge-blue', upright: 'badge-amber', none: '' };

  function render() {
    const all = data.loadObjects();
    const q = query.trim().toLocaleLowerCase('fr');
    const items = all.filter(o => !q || String(o.name).toLocaleLowerCase('fr').includes(q));
    const body = ui.el('objects-body');
    body.innerHTML = items.map(o => {
      const volume = geom.volume(geom.normalizeItem(o).size);
      const qty = Number(o.quantity) || 1;
      return `<tr>
        <td><div class="row-name"><span class="swatch" style="background:${ui.escapeHtml(o.color || '#94a3b8')}"></span> ${ui.escapeHtml(o.name)}</div><div class="row-sub">${ui.escapeHtml(o.id)}</div></td>
        <td><span class="badge">${o.type === 'cylinder' ? 'Cylindre' : 'Boîte'}</span></td>
        <td>${ui.escapeHtml(ui.dimensionsText(o.dimensions, o.unit))}</td>
        <td>${ui.formatVolume(volume)}${qty > 1 ? `<div class="row-sub">× ${qty} = ${ui.formatVolume(volume * qty)}</div>` : ''}</td>
        <td><span class="badge ${rotationsBadge[o.rotations] || ''}">${rotationsLabel[o.rotations] || 'Toutes'}</span></td>
        <td>${qty}</td>
        <td><div class="row-actions">
          <button class="btn btn-sm btn-ghost" data-edit="${ui.escapeHtml(o.id)}" type="button">✎</button>
          <button class="btn btn-sm btn-ghost" data-delete="${ui.escapeHtml(o.id)}" type="button">🗑</button>
        </div></td>
      </tr>`;
    }).join('');
    ui.el('objects-empty').hidden = items.length > 0;
    ui.el('count-badge').textContent = `${items.length} objet${items.length > 1 ? 's' : ''}`;

    body.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
      openForm(all.find(o => o.id === btn.dataset.edit));
    }));
    body.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async () => {
      const obj = all.find(o => o.id === btn.dataset.delete);
      if (!obj || !await ui.confirm(`Supprimer « ${obj.name} » ?`, 'Supprimer un objet')) return;
      data.saveObjects(data.loadObjects().filter(o => o.id !== obj.id));
      ui.toast('Objet supprimé.', 'success');
    }));
  }

  function formHtml(item) {
    const o = item || {
      id: '', name: '', type: 'box', unit: 'cm', rotations: 'allowed',
      quantity: 1, color: '#3b82f6',
      dimensions: { length: '', width: '', height: '', diameter: '', height: '' }
    };
    const v = (obj, key) => ui.escapeHtml(obj[key] == null ? '' : obj[key]);
    const isCylinder = o.type === 'cylinder';
    return `
      <div class="form-row">
        <div class="field" style="grid-column:span 2"><label for="f-name">Nom *</label><input id="f-name" value="${v(o, 'name')}" placeholder="Ex. Table à manger" required></div>
        <div class="field"><label for="f-quantity">Quantité</label><input id="f-quantity" type="number" min="1" step="1" value="${v(o, 'quantity') || 1}"></div>
      </div>
      <div class="form-row" style="margin-top:14px">
        <div class="field"><label for="f-type">Forme</label><select id="f-type">
          <option value="box" ${!isCylinder ? 'selected' : ''}>Boîte (L × l × H)</option>
          <option value="cylinder" ${isCylinder ? 'selected' : ''}>Cylindre (Ø × H)</option>
        </select></div>
        <div class="field"><label for="f-unit">Unité</label><select id="f-unit">
          ${geom.units.map(u => `<option value="${u}" ${o.unit === u ? 'selected' : ''}>${u}</option>`).join('')}
        </select></div>
        <div class="field"><label for="f-rotations">Rotations</label><select id="f-rotations">
          <option value="allowed" ${o.rotations === 'allowed' ? 'selected' : ''}>Toutes autorisées</option>
          <option value="upright" ${o.rotations === 'upright' ? 'selected' : ''}>Debout uniquement</option>
          <option value="none" ${o.rotations === 'none' ? 'selected' : ''}>Aucune</option>
        </select></div>
      </div>
      <div class="form-row" style="margin-top:14px">
        <div class="field dim-box" ${isCylinder ? 'hidden' : ''}><label for="f-length">Longueur *</label><input id="f-length" type="number" min="0.1" step="any" value="${ui.escapeHtml((o.dimensions || {}).length == null ? '' : o.dimensions.length)}"></div>
        <div class="field dim-box" ${isCylinder ? 'hidden' : ''}><label for="f-width">Largeur *</label><input id="f-width" type="number" min="0.1" step="any" value="${ui.escapeHtml((o.dimensions || {}).width == null ? '' : o.dimensions.width)}"></div>
        <div class="field dim-box" ${isCylinder ? 'hidden' : ''}><label for="f-height">Hauteur *</label><input id="f-height" type="number" min="0.1" step="any" value="${ui.escapeHtml((o.dimensions || {}).height == null ? '' : o.dimensions.height)}"></div>
        <div class="field dim-cyl" ${!isCylinder ? 'hidden' : ''}><label for="f-diameter">Diamètre *</label><input id="f-diameter" type="number" min="0.1" step="any" value="${ui.escapeHtml((o.dimensions || {}).diameter == null ? '' : o.dimensions.diameter)}"></div>
        <div class="field dim-cyl" ${!isCylinder ? 'hidden' : ''}><label for="f-cyl-height">Hauteur *</label><input id="f-cyl-height" type="number" min="0.1" step="any" value="${ui.escapeHtml((o.dimensions || {}).height == null ? '' : o.dimensions.height)}"></div>
      </div>
      <div class="field" style="margin-top:14px;max-width:200px"><label for="f-color">Couleur dans la scène 3D</label><input id="f-color" type="color" value="${ui.escapeHtml(o.color || '#3b82f6')}" style="padding:4px;height:42px"></div>
      <p class="field-hint" style="margin-top:12px">Un cylindre est approché par sa boîte englobante (diamètre × diamètre × hauteur) lors du calcul de placement.</p>`;
  }

  function openForm(item) {
    const editing = !!item;
    const modal = ui.openModal(editing ? 'Modifier l’objet' : 'Nouvel objet', formHtml(item), `
      <button class="btn btn-ghost" data-modal-close type="button">Annuler</button>
      <button class="btn btn-primary" data-save type="button">Enregistrer</button>`);

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
      const dimensions = type === 'cylinder'
        ? { diameter: Number(val('f-diameter')), height: Number(val('f-cyl-height')) }
        : { length: Number(val('f-length')), width: Number(val('f-width')), height: Number(val('f-height')) };
      const obj = {
        id: editing ? item.id : data.newId('objet'),
        name: val('f-name').trim(),
        type, dimensions,
        unit: val('f-unit'),
        rotations: val('f-rotations'),
        quantity: Math.max(1, Math.floor(Number(val('f-quantity')) || 1)),
        color: val('f-color')
      };
      const errors = geom.validateObject(obj);
      if (errors.length) { ui.toast(errors.join(' '), 'error'); return; }
      const list = data.loadObjects();
      if (editing) {
        const i = list.findIndex(o => o.id === item.id);
        if (i >= 0) list[i] = obj;
      } else list.push(obj);
      data.saveObjects(list);
      ui.closeModal();
      ui.toast(editing ? 'Objet mis à jour.' : 'Objet ajouté.', 'success');
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
