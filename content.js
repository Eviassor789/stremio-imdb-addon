/* ---------------------------
   Helpers
--------------------------- */

function getImdbIdFromUrl() {
  const match = window.location.pathname.match(/title\/(tt\d+)/);
  return match ? match[1] : null;
}

function getSeriesEpisodeData() {
  const seasonEpisodeElement = document.querySelector(
    '[data-testid="hero-subnav-bar-season-episode-numbers-section"]'
  );

  const seriesLinkElement = document.querySelector(
    'a[data-testid="hero-title-block__series-link"][href*="/title/tt"]'
  );

  if (!seasonEpisodeElement || !seriesLinkElement) return null;

  const seasonEpisodeMatch = seasonEpisodeElement.innerText
    .replace(/\s+/g, "")
    .match(/S(\d+)\.E(\d+)/i);

  const seriesMatch = (seriesLinkElement.getAttribute("href") || "")
    .match(/\/title\/(tt\d+)/i);

  if (!seasonEpisodeMatch || !seriesMatch) return null;

  return {
    seriesId: seriesMatch[1],
    season: seasonEpisodeMatch[1],
    episode: seasonEpisodeMatch[2]
  };
}

function detectContentType() {
  const metadata = document.body.innerText.toLowerCase();

  if (
    metadata.includes("tv series") ||
    metadata.includes("tv mini series")
  ) {
    return "series";
  }

  return "movie";
}

function getHeaderElement(isEpisodePage) {
  if (isEpisodePage) {
    return document.querySelector(
      '[data-testid="hero-parent"] > :nth-child(4) > :nth-child(2) > :nth-child(2) > :nth-child(2)'
    );
  }

  return document.querySelector("h1");
}

/* ---------------------------
   Button Creation
--------------------------- */

function createStremioButton(text, className) {
  const btn = document.createElement("button");
  btn.className = className;
  btn.innerText = text;
  return btn;
}

function attachButton(header, button, prepend = false) {
  if (!header) return;

  if (prepend) {
    header.parentElement.prepend(button);
  } else {
    header.parentElement.appendChild(button);
  }
}

/* ---------------------------
   Main Button Logic
--------------------------- */

function addStremioButton() {
  const imdbId = getImdbIdFromUrl();
  if (!imdbId) return;

  const episodeData = getSeriesEpisodeData();
  const type = detectContentType();

  const isEpisodePage = Boolean(episodeData);
  const header = getHeaderElement(isEpisodePage);
  if (!header) return;

  const buttonText = isEpisodePage
    ? `▶ Play S${episodeData.season} - E${episodeData.episode} in Stremio`
    : "▶ Watch in Stremio";

  const buttonClass = isEpisodePage
    ? "circular-strmio-button"
    : "stremio-button";

  const button = createStremioButton(buttonText, buttonClass);

  button.onclick = () => {
    if (episodeData) {
      window.location.href =
        `stremio:///detail/series/${episodeData.seriesId}/${episodeData.seriesId}%3A${episodeData.season}%3A${episodeData.episode}`;
    } else {
      window.location.href = `stremio:///detail/${type}/${imdbId}`;
    }
  };

  attachButton(header, button, isEpisodePage);
}

/* -------------------------------------------------------------------------------------------- */

function watchForWatchOptionsPopup() {
  const observer = new MutationObserver(() => {

    const popup = document.querySelector('[data-testid="promptable"]');
    if (!popup) return;

    addStremioStreamingOption(popup);

  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function addStremioStreamingOption(popup) {

  const list = popup.querySelector('[data-testid="STREAMING-list"]');
  if (!list) return;

  // prevent duplicates
  if (list.querySelector(".stremio-option")) return;

  const episodeHeader = popup.querySelector(".prompt-title-text");
  if (!episodeHeader) return;

  const match = episodeHeader.innerText.match(/S(\d+)\.E(\d+)/i);
  if (!match) return;

  const season = match[1];
  const episode = match[2];

  const seriesId = getImdbIdFromUrl();

  const stremioItem = document.createElement("a");

  stremioItem.setAttribute("role", "menuitem");
  stremioItem.href = "#";

  const iconUrl = chrome.runtime.getURL("icons/streimo-imdb.png");

  stremioItem.innerHTML = `
    <span class="ipc-list-item__text" role="presentation">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:50px;height:50px;display:flex;align-items:center;justify-content:center;">
          <img src="${iconUrl}" alt="Stremio" style="width:100%;height:100%;">
        </div>
        <div>
          <div>Stremio</div>
          <div style="font-size:12px;opacity:0.7;">Open in Stremio</div>
        </div>
      </div>
    </span>
  `;

  stremioItem.onclick = (e) => {
    e.preventDefault();

    window.location.href =
      `stremio:///detail/series/${seriesId}/${seriesId}%3A${season}%3A${episode}`;
  };

  list.appendChild(stremioItem);
}





/* ---------------------------
   Universal IMDb Links
--------------------------- */

function universalStremioLinks() {
  const imdbRegex = /tt\d{7,9}/g;

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT
  );

  let node;

  while ((node = walker.nextNode())) {
    const match = node.nodeValue.match(imdbRegex);
    if (!match) continue;

    match.forEach(id => {
      const span = document.createElement("span");

      span.innerHTML =
        `<button class="stremio-button">▶ Stremio</button>`;

      span.onclick = () => {
        window.location.href = `stremio:///detail/${id}`;
      };

      node.parentNode.appendChild(span);
    });
  }
}

/* ---------------------------
   Initialization
--------------------------- */

setTimeout(addStremioButton, 500);

watchForWatchOptionsPopup();

setTimeout(universalStremioLinks, 2000);
