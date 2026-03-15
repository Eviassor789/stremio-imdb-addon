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

  function updateResetButtonAppearance() {
    const allOn = $("toggle-imdb").checked && $("toggle-google").checked && $("toggle-context").checked;
    const btn = $("reset");
    if (!btn) return;
    btn.className = 'btn ' + (allOn ? 'btn-ghost' : 'btn-primary');
  }

  // set initial appearance
  updateResetButtonAppearance();

  $("toggle-imdb").addEventListener('change', async (e) => {
    settings.showOnImdb = e.target.checked;
    await saveSettings({ showOnImdb: settings.showOnImdb });
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'setShowOnImdb', value: settings.showOnImdb });
    }
    updateResetButtonAppearance();
  });

  $("toggle-google").addEventListener('change', async (e) => {
    settings.showOnGoogle = e.target.checked;
    await saveSettings({ showOnGoogle: settings.showOnGoogle });
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'setShowOnGoogle', value: settings.showOnGoogle });
    }
    updateResetButtonAppearance();
  });

  $("toggle-context").addEventListener('change', async (e) => {
    settings.allowContextSearch = e.target.checked;
    await saveSettings({ allowContextSearch: settings.allowContextSearch });
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'setAllowContextSearch', value: settings.allowContextSearch });
    }
    updateResetButtonAppearance();
  });

  $("reset").addEventListener('click', async () => {
    await saveSettings(DEFAULTS);
    $("toggle-imdb").checked = DEFAULTS.showOnImdb;
    $("toggle-google").checked = DEFAULTS.showOnGoogle;
    $("toggle-context").checked = DEFAULTS.allowContextSearch;
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'settingsReset' });
    }
    updateResetButtonAppearance();
  });
}

document.addEventListener('DOMContentLoaded', init);