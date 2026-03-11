document.getElementById("open").addEventListener("click", async () => {

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const match = tab.url.match(/title\/(tt\d+)/);

  if (!match) return;

  const imdbId = match[1];

  chrome.tabs.update({
    url: `stremio://detail/${imdbId}`
  });

});