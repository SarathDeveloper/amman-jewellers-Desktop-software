(function () {
  function invoke(cmd, args) {
    return new Promise(function (resolve, reject) {
      function attempt() {
        var internals = window.__TAURI_INTERNALS__;
        var core = window.__TAURI__ && window.__TAURI__.core;
        if (internals && typeof internals.invoke === 'function') {
          internals.invoke(cmd, args).then(resolve, reject);
          return;
        }
        if (core && typeof core.invoke === 'function') {
          core.invoke(cmd, args).then(resolve, reject);
          return;
        }
        setTimeout(attempt, 20);
      }
      attempt();
    });
  }

  window.desktopAPI = {
    platform: navigator.platform || 'unknown',
    getAppVersion: function () {
      return invoke('get_app_version');
    },
    exportDatabase: async function () {
      var suggested = 'jeweltrackerpro-backup-' + new Date().toISOString().slice(0, 10) + '.db';
      var path = await invoke('choose_backup_path', {
        default_filename: suggested,
        filter_name: 'SQLite database',
        extension: 'db',
      });
      if (!path) {
        return { canceled: true };
      }
      var response = await fetch('/api/backup/export', { credentials: 'same-origin' });
      if (!response.ok) {
        throw new Error('Export failed');
      }
      var bytes = Array.from(new Uint8Array(await response.arrayBuffer()));
      await invoke('write_backup_file', { path: path, bytes: bytes });
      return { canceled: false, filePath: path };
    },
    exportExcel: async function () {
      var suggested = 'jeweltrackerpro-tables-' + new Date().toISOString().slice(0, 10) + '.xlsx';
      var path = await invoke('choose_backup_path', {
        default_filename: suggested,
        filter_name: 'Excel workbook',
        extension: 'xlsx',
      });
      if (!path) {
        return { canceled: true };
      }
      var response = await fetch('/api/backup/export-excel', { credentials: 'same-origin' });
      if (!response.ok) {
        throw new Error('Excel export failed');
      }
      var bytes = Array.from(new Uint8Array(await response.arrayBuffer()));
      await invoke('write_backup_file', { path: path, bytes: bytes });
      return { canceled: false, filePath: path };
    },
    chooseBackupFolder: function () {
      return invoke('choose_backup_folder');
    },
  };
})();
