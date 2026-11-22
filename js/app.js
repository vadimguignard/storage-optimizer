/*
 * app.js — shared UI: navigation, language, toasts, modals, formatting, import/export
 */
(function (root) {
  'use strict';
  const SO = root.SO = root.SO || {};
  const data = SO.data;
  const t = (key, vars) => SO.i18n.t(key, vars);
  const locale = () => SO.i18n.locale;

  function el(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function trimNumber(n, digits) {
    return Number(n.toFixed(digits)).toLocaleString(locale(), { maximumFractionDigits: digits });
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
          <div class="modal-head"><h3>${escapeHtml(title)}</h3><button class="icon-btn" type="button" data-modal-close aria-label="${escapeHtml(t('common.close'))}">✕</button></div>
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
      const modal = openModal(title, `<p class="confirm-text">${escapeHtml(message)}</p>`, `
        <button class="btn btn-ghost" type="button" data-confirm="no">${escapeHtml(t('common.cancel'))}</button>
        <button class="btn btn-danger" type="button" data-confirm="yes">${escapeHtml(t('common.confirm'))}</button>`);
      let settled = false;
      const finish = value => { if (!settled) { settled = true; closeModal(); resolve(value); } };
      modal.querySelectorAll('[data-confirm]').forEach(btn => {
        btn.addEventListener('click', () => finish(btn.dataset.confirm === 'yes'));
      });
      modal.parentElement.addEventListener('click', e => {
        if (e.target.hasAttribute('data-modal-close')) finish(false);
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
        if (!file) return reject(new Error('toast.noFile'));
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('toast.fileRead'));
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
      button.innerHTML = `<span class="spinner"></span> ${escapeHtml(label || '…')}`;
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
      toast(t('toast.exported'), 'success');
    });
    if (importBtn) importBtn.addEventListener('click', async () => {
      try {
        const text = await pickFile();
        const result = data.importJSON(text);
        toast(t('toast.imported', { n: result.objects, m: result.containers }), 'success');
      } catch (err) {
        toast(SO.i18n.t(err.message) === err.message ? err.message : SO.i18n.t(err.message), 'error');
      }
    });
    if (resetBtn) resetBtn.addEventListener('click', async () => {
      if (!await confirm(t('toast.resetConfirm'), t('toast.resetTitle'))) return;
      data.resetAll();
      toast(t('toast.resetDone'), 'success');
    });
  }

  function renderSyncStatus(status) {
    const wrap = el('sync-status');
    const labels = {
      synced: 'sync.synced', syncing: 'sync.syncing', error: 'sync.error',
      local: 'sync.local', disabled: 'sync.disabled'
    };
    if (wrap) {
      wrap.className = `sync-status ${status.status === 'synced' ? 'online' : status.status === 'syncing' ? 'syncing' : status.status === 'error' ? 'error' : ''}`;
      const text = el('sync-status-text');
      if (text) text.textContent = t(labels[status.status] || 'sync.local');
      const detail = el('sync-detail');
      if (detail) {
        if (status.status === 'error' && status.message) detail.textContent = status.message;
        else if (status.time) detail.textContent = t('sync.lastSync', { time: new Date(status.time).toLocaleTimeString(SO.i18n.locale) });
        else detail.textContent = '';
      }
    }
    const badge = document.querySelector('.sync-badge');
    if (badge) {
      badge.classList.toggle('online', status.status === 'synced');
      badge.textContent = status.status === 'synced' ? '☁' : status.status === 'syncing' ? '◌' : status.status === 'error' ? '⚠' : '◍';
      badge.title = t(labels[status.status] || 'sync.local');
    }
  }

  function bindSyncTools() {
    if (!SO.sync) return;
    const cfg = SO.sync.getConfig() || {};
    if (el('sync-owner')) el('sync-owner').value = cfg.owner || 'vadimguignard';
    if (el('sync-repo')) el('sync-repo').value = cfg.repo || 'storage-optimizer';
    if (el('sync-branch')) el('sync-branch').value = cfg.branch || 'sync';
    if (el('sync-token')) el('sync-token').value = cfg.token || '';

    const enableBtn = el('sync-enable');
    if (enableBtn) enableBtn.addEventListener('click', async () => {
      const owner = el('sync-owner').value.trim();
      const repo = el('sync-repo').value.trim();
      const branch = el('sync-branch').value.trim() || 'sync';
      const token = el('sync-token').value.trim();
      if (!owner || !repo || !token) { toast(t('sync.needFields'), 'error'); return; }
      await SO.sync.enable({ owner, repo, branch, token });
      toast(t('sync.saved'), 'success');
    });
    const nowBtn = el('sync-now');
    if (nowBtn) nowBtn.addEventListener('click', async () => {
      if (!SO.sync.isEnabled()) { toast(t('sync.needFields'), 'warning'); return; }
      await SO.sync.syncNow();
    });
    const disableBtn = el('sync-disable');
    if (disableBtn) disableBtn.addEventListener('click', () => {
      SO.sync.disable();
      if (el('sync-token')) el('sync-token').value = '';
      toast(t('sync.disabledToast'), 'success');
    });
    SO.sync.onStatus(renderSyncStatus);
  }

  function renderNav() {
    const mount = el('nav-mount');
    if (!mount) return;
    const page = location.pathname.split('/').pop() || 'index.html';
    const links = [
      ['index.html', '🏠', 'nav.home'],
      ['objects.html', '📦', 'nav.objects'],
      ['containers.html', '📮', 'nav.containers'],
      ['simulator.html', '🧊', 'nav.simulator']
    ];
    mount.innerHTML = `
      <header class="site-header">
        <div class="header-inner">
          <a class="brand" href="index.html"><span class="brand-mark">◈</span><span>Storage<span class="brand-accent">Optimizer</span></span></a>
          <nav class="nav" aria-label="Navigation">
            ${links.map(([href, icon, key]) => `<a href="${href}" class="nav-link ${page === href ? 'active' : ''}"><span>${icon}</span> ${escapeHtml(t(key))}</a>`).join('')}
          </nav>
          <a class="sync-badge" href="index.html#sync-panel" title="Sync">◍</a>
          <div class="lang-switch">
            <label for="lang-select">${escapeHtml(t('nav.language'))}</label>
            <select id="lang-select" aria-label="${escapeHtml(t('nav.language'))}">
              <option value="en" ${SO.i18n.lang === 'en' ? 'selected' : ''}>English</option>
              <option value="fr" ${SO.i18n.lang === 'fr' ? 'selected' : ''}>Français</option>
            </select>
          </div>
        </div>
      </header>`;
    el('lang-select').addEventListener('change', e => SO.i18n.setLang(e.target.value));
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
    bindSyncTools();
    data.ensureSeeded().then(changed => { if (changed) renderSummary(); });
  });
  window.addEventListener('so:data-changed', renderSummary);
  window.addEventListener('so:lang-changed', () => { renderNav(); renderSummary(); });

  SO.ui = {
    el, escapeHtml, formatDim, formatVolume, dimensionsText, toast,
    openModal, closeModal, confirm, downloadText, pickFile, setBusy, bindDataTools
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
