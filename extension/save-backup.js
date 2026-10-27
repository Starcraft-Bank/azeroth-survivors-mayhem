/* Preserve the game's own sealed account save before permanent trainer actions. */
(() => {
  'use strict';
  const databaseName = 'azs-trainer-save-backups';
  const digest = async text => Array.from(new Uint8Array(await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join('');
  const open = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('saves', {keyPath: 'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('The save backup database is blocked.'));
  });
  function download(record) {
    const url = URL.createObjectURL(new Blob([record.text], {type: 'application/octet-stream'}));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = record.filename; anchor.hidden = true;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function create(checkpoint) {
    if (typeof checkpoint !== 'function') throw new Error('A game save checkpoint is required.');
    const storage = localStorage, originalSet = Storage.prototype.setItem;
    let written = null;
    const captureSet = function(key, value) {
      const result = originalSet.apply(this, arguments);
      if (this === storage && key === 'rogue.characters') written = String(value);
      return result;
    };
    Storage.prototype.setItem = captureSet;
    try { await checkpoint(); }
    finally {
      if (Storage.prototype.setItem === captureSet) Storage.prototype.setItem = originalSet;
    }
    const text = storage.getItem('rogue.characters');
    if (written === null || text !== written)
      throw new Error('The game save checkpoint could not be verified. No unlocks applied.');
    if (!text) throw new Error('The game has not created an account save. No unlocks applied.');
    const id = new Date().toISOString() + '-' + crypto.randomUUID();
    const record = {id, created: Date.now(), text, sha256: await digest(text),
      filename: 'AzerothSurvivors pre-unlock ' + id.replace(/[:]/g, '-') + '.sav'};
    const db = await open();
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('saves', 'readwrite');
        transaction.objectStore('saves').add(record);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Backup was not saved.'));
      });
      const saved = await new Promise((resolve, reject) => {
        const request = db.transaction('saves').objectStore('saves').get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (saved?.text !== text || await digest(saved.text) !== record.sha256)
        throw new Error('Save backup verification failed. No unlocks applied.');
      if (typeof window.__azs_storeBackup === 'function') {
        const result = await window.__azs_storeBackup(record);
        if (!result?.verified || result.sha256 !== record.sha256)
          throw new Error('File backup verification failed. No unlocks applied.');
      } else {
        download(record);
      }
      return {id, filename: record.filename, sha256: record.sha256};
    } finally { db.close(); }
  }
  async function downloadLatest() {
    const db = await open();
    try {
      const record = await new Promise((resolve, reject) => {
        const request = db.transaction('saves').objectStore('saves').openCursor(null, 'prev');
        request.onsuccess = () => resolve(request.result?.value);
        request.onerror = () => reject(request.error);
      });
      if (!record || await digest(record.text) !== record.sha256)
        throw new Error('No verified pre-unlock backup is available in this browser.');
      download(record);
      return record.filename;
    } finally { db.close(); }
  }
  globalThis.AzsSaveBackup = {create, downloadLatest};
})();
