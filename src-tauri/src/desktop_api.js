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

  var platform = navigator.platform || navigator.userAgent || 'unknown';
  var isMac = /Mac/i.test(platform);

  window.desktopAPI = {
    platform: platform,
    isMac: isMac,
    getAppVersion: function () {
      return invoke('get_app_version');
    },
    exportDatabase: async function () {
      var suggested = 'jeweltrackerpro-backup-' + new Date().toISOString().slice(0, 10) + '.db';
      var path = await invoke('choose_backup_path', {
        defaultFilename: suggested,
        filterName: 'SQLite database',
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
        defaultFilename: suggested,
        filterName: 'Excel workbook',
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
    savePdf: async function (bytes, defaultFilename) {
      var path = await invoke('choose_backup_path', {
        defaultFilename: defaultFilename,
        filterName: 'PDF document',
        extension: 'pdf',
      });
      if (!path) {
        return { canceled: true };
      }
      await invoke('write_backup_file', { path: path, bytes: Array.from(bytes) });
      return { canceled: false, filePath: path };
    },
    openPrintWindow: function (path) {
      return invoke('open_print_window', { path: path });
    },
    printWebview: function () {
      return invoke('print_webview');
    },
  };

  // In a dedicated print window on macOS, render through the native webview
  // print panel. WKWebView does not reliably print an embedded iframe, so
  // PrintPreviewModal opens this window instead.
  if (window.__JTP_DESKTOP_PRINT__ && isMac) {
    window.print = function () {
      window.desktopAPI.printWebview();
    };
  }
})();
