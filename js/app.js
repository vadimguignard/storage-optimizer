/*
 * app.js — interface partagée : navigation, notifications, modales, formatage, import/export
 */
(function (root) {
  'use strict';
  const SO = root.SO = root.SO || {};
  const data = SO.data;

  function el(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function trimNumber(n, digits) {
    return Number(n.toFixed(digits)).toString();
  }

  function formatDim(cm) {
    if (cm >= 100) return `${trimNumber(cm / 100, 2)} m`;
    return `${trimNumber(cm, 1)} cm`;
  }

  function formatVolume(cm3) {
    if (cm3 >= 1e6) return `${trimNumber(cm3 / 1e6, 2)} m³`;
    if (cm3 >= 1000) return `${trimNumber(cm3 / 1000, 1)} L`;
    return `${trimNumber(cm3, 0)} cm³`;
  }

  function dimensionsText(dimensions, unit) {
    const u = unit || 'cm';
    if (dimensions.diameter != null) return `Ø ${dimensions.diameter} × ${dimensions.height} ${u}`;
    return `${dimensions.length} × ${dimensions.width} × ${dimensions.height} ${u}`;
  }

  function toast(message, type) {
    const rootEl = el('toast-root') || document.body;
    const node = document.createElement('div');
    node.className = `toast toast-${type || 'info'}`;
    node.innerHTML = `<span class="toast-icon">${{ success: '✓', error: '!', warning: '⚠', info: 'i' }[type || 'info']}</span><span>${escapeHtml(message)}</span>`;
    rootEl.appendChild(node);
    requestAnimationFrame(() => node.classList.add('show'));
    setTimeout(() => {
      node.classList.remove('show');
      setTimeout(() => node.remove(), 250);
    }, 3800);
  }

  let modalCleanup = null;
  function openModal(title, bodyHtml, footerHtml) {
    closeModal();
    const rootEl = el('modal-root') || document.body;
    rootEl.innerHTML = `
      <div class="modal-backdrop" data-modal-close>
        <div class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
          <div class="modal-head"><h3>${escapeHtml(title)}</h3><button class="icon-btn" type="button" data-modal-close aria-label="Fermer">✕</button></div>
          <div class="modal-body">${bodyHtml}</div>
          ${footerHtml ? `<div class="modal-foot">${footerHtml}</div>` : ''}
        </div>
      </div>`;
    const onClick = e => {
      if (e.target.matches('[data-modal-close]')) closeModal();
    };
    const onKey = e => { if (e.key === 'Escape') closeModal(); };
    rootEl.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    modalCleanup = () => {
      rootEl.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
    const first = rootEl.querySelector('input, select, textarea, button');
    if (first) setTimeout(() => first.focus(), 50);
    return rootEl.querySelector('.modal');
  }

  function closeModal() {
    if (modalCleanup) modalCleanup();
    modalCleanup = null;
    const rootEl = el('modal-root');
    if (rootEl) rootEl.innerHTML = '';
  }

  function confirm(message, title) {
    return new Promise(resolve => {
      const modal = openModal(title || 'Confirmation', `<p class="confirm-text">${escapeHtml(message)}</p>`, `
        <button class="btn btn-ghost" type="button" data-confirm="no">Annuler</button>
        <button class="btn btn-danger" type="button" data-confirm="yes">Confirmer</button>`);
      modal.querySelectorAll('[data-confirm]').forEach(btn => {
        btn.addEventListener('click', () => { closeModal(); resolve(btn.dataset.confirm === 'yes'); });
      });
      const backdrop = modal.parentElement;
      backdrop.addEventListener('click', e => {
        if (e.target.hasAttribute('data-modal-close')) resolve(false);
      });
    });
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function pickFile() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.json,application/json';
      input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return reject(new Error('Aucun fichier sélectionné.'));
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
        reader.readAsText(file);
      };
      input.click();
    });
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    button.disabled = !!busy;
    if (busy) {
      button.dataset.label = button.textContent;
      button.innerHTML = `<span class="spinner"></span> ${escapeHtml(label || 'Traitement…')}`;
    } else if (button.dataset.label) {
      button.textContent = button.dataset.label;
      delete button.dataset.label;
    }
  }

  function bindDataTools() {
    const exportBtn = el('btn-export');
    const importBtn = el('btn-import');
    const resetBtn = el('btn-reset');
    if (exportBtn) exportBtn.addEventListener('click', () => {
      downloadText('storage-optimizer-data.json', data.exportJSON());
      toast('Données exportées en JSON.', 'success');
    });
    if (importBtn) importBtn.addEventListener('click', async () => {
      try {
        const text = await pickFile();
        const result = data.importJSON(text);
        toast(`${result.objects} objets et ${result.containers} conteneurs importés.`, 'success');
      } catch (err) { toast(err.message, 'error'); }
    });
    if (resetBtn) resetBtn.addEventListener('click', async () => {
      if (!await confirm('Remplacer toutes les données par les exemples d’origine ?', 'Réinitialiser')) return;
      data.resetAll();
      toast('Données réinitialisées.', 'success');
    });
  }

  function renderNav() {
    const mount = el('nav-mount');
    if (!mount) return;
    const page = location.pathname.split('/').pop() || 'index.html';
    const links = [
      ['index.html', '🏠', 'Accueil'],
      ['objects.html', '📦', 'Objets'],
      ['containers.html', '📮', 'Cartons'],
      ['simulator.html', '🧊', 'Simulateur']
    ];
    mount.innerHTML = `
      <header class="site-header">
        <div class="header-inner">
          <a class="brand" href="index.html"><span class="brand-mark">◈</span><span>Storage<span class="brand-accent">Optimizer</span></span></a>
          <nav class="nav" aria-label="Navigation principale">
            ${links.map(([href, icon, label]) => `<a href="${href}" class="nav-link ${page === href ? 'active' : ''}"><span>${icon}</span> ${label}</a>`).join('')}
          </nav>
        </div>
      </header>`;
  }

  function renderSummary() {
    const objects = data.loadObjects();
    const containers = data.loadContainers();
    const values = {
      objects: objects.reduce((n, o) => n + (Number(o.quantity) || 1), 0),
      containers: containers.reduce((n, c) => n + (Number(c.quantity) || 1), 0),
      volume: formatVolume(data.totalVolume(objects))
    };
    document.querySelectorAll('[data-summary]').forEach(node => {
      const key = node.getAttribute('data-summary');
      if (values[key] != null) node.textContent = values[key];
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderNav();
    renderSummary();
    bindDataTools();
    data.ensureSeeded().then(changed => {
      if (changed) renderSummary();
    });
  });
  window.addEventListener('so:data-changed', renderSummary);

  SO.ui = {
    el, escapeHtml, formatDim, formatVolume, dimensionsText, toast,
    openModal, closeModal, confirm, downloadText, pickFile, setBusy, bindDataTools
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
