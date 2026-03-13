chrome.runtime.onInstalled.addListener(() => {

  chrome.contextMenus.create({
    id: "stremio-search",
    title: "Search in Stremio",
    contexts: ["selection"]
  });

});

chrome.contextMenus.onClicked.addListener((info, tab) => {

  if (info.menuItemId === "stremio-search") {

    const query = encodeURIComponent(info.selectionText);

    chrome.tabs.sendMessage(tab.id, {
      action: "openStremioSearch",
      query
    });

  }

});
