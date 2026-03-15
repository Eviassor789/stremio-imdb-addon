const DEFAULTS = {
  showOnImdb: true,
  showOnGoogle: true,
  allowContextSearch: true
};

function updateContextMenu(enabled) {

  chrome.contextMenus.removeAll(() => {

    if (!enabled) return;

    chrome.contextMenus.create({
      id: "stremio-search",
      title: "Search in Stremio",
      contexts: ["selection"]
    });

  });
}

chrome.runtime.onInstalled.addListener(() => {

  chrome.storage.sync.get(DEFAULTS, (settings) => {
    updateContextMenu(settings.allowContextSearch);
  });

});

chrome.runtime.onMessage.addListener((message) => {

  if (message.action === "setAllowContextSearch") {

    chrome.storage.sync.set({ allowContextSearch: message.value });

    updateContextMenu(message.value);
  }

  if (message.action === "settingsReset") {

    chrome.storage.sync.set(DEFAULTS);
    updateContextMenu(DEFAULTS.allowContextSearch);
  }

});

chrome.contextMenus.onClicked.addListener((info) => {

  if (info.menuItemId === "stremio-search") {

    const query = encodeURIComponent(info.selectionText);

    chrome.tabs.create({
      url: `stremio:///search?query=${query}`
    });

  }

});