const DEFAULTS = {
  showOnImdb: true,
  showOnGoogle: true,
  allowContextSearch: true
};

const $ = (id) => document.getElementById(id);

async function loadSettings() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULTS, (items) => resolve(items));
    });
  }

  try {
    const raw = localStorage.getItem('stremio_settings');
    if (raw) return Object.assign({}, DEFAULTS, JSON.parse(raw));
  } catch (e) {
    // ignore
  }

  return Promise.resolve(Object.assign({}, DEFAULTS));
}

async function saveSettings(settings) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    return new Promise((resolve) => {
      chrome.storage.sync.set(settings, () => resolve());
    });
  }

  try { localStorage.setItem('stremio_settings', JSON.stringify(settings)); } catch (e) {}
  return Promise.resolve();
}

async function init() {
  const settings = await loadSettings();

  $("toggle-imdb").checked = !!settings.showOnImdb;
  $("toggle-google").checked = !!settings.showOnGoogle;
  $("toggle-context").checked = !!settings.allowContextSearch;

  $("toggle-imdb").addEventListener('change', async (e) => {
    settings.showOnImdb = e.target.checked;
    await saveSettings({ showOnImdb: settings.showOnImdb });
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'setShowOnImdb', value: settings.showOnImdb });
    }
  });

  $("toggle-google").addEventListener('change', async (e) => {
    settings.showOnGoogle = e.target.checked;
    await saveSettings({ showOnGoogle: settings.showOnGoogle });
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'setShowOnGoogle', value: settings.showOnGoogle });
    }
  });

  $("toggle-context").addEventListener('change', async (e) => {
    settings.allowContextSearch = e.target.checked;
    await saveSettings({ allowContextSearch: settings.allowContextSearch });
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'setAllowContextSearch', value: settings.allowContextSearch });
    }
  });

  $("reset").addEventListener('click', async () => {
    await saveSettings(DEFAULTS);
    $("toggle-imdb").checked = DEFAULTS.showOnImdb;
    $("toggle-google").checked = DEFAULTS.showOnGoogle;
    $("toggle-context").checked = DEFAULTS.allowContextSearch;
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'settingsReset' });
    }
  });

  $("open").addEventListener('click', async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url) {
          const match = tab.url.match(/title\/(tt\d+)/);
          if (match) {
            const imdbId = match[1];
            try { chrome.tabs.update({ url: `stremio:///detail/${imdbId}` }); return; } catch (err) {}
            window.open(`stremio:///detail/${imdbId}`);
            return;
          }
          try { chrome.tabs.update({ url: `stremio:///search?query=${encodeURIComponent(tab.title || '')}` }); return; } catch (err) {}
          window.open(`stremio:///search?query=${encodeURIComponent(tab.title||'')}`);
          return;
        }
      }
    } catch (e) {
      // fallthrough to direct open
    }

    const pageTitle = document.title || '';
    window.open(`stremio:///search?query=${encodeURIComponent(pageTitle)}`);
  });
}

document.addEventListener('DOMContentLoaded', init);