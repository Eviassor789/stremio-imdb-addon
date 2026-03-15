/* ---------------------------
   Helpers
--------------------------- */

// Settings + runtime control
const SETTINGS_DEFAULTS = {
  showOnImdb: true,
  showOnGoogle: true,
  allowContextSearch: true
};

function loadSettingsAndStart() {
  chrome.storage.sync.get(SETTINGS_DEFAULTS, (settings) => {
    extensionSettings = { ...SETTINGS_DEFAULTS, ...settings };
    startFeaturesBasedOnSettings();
  });
}

let extensionSettings = { ...SETTINGS_DEFAULTS };
let _observers = {};

function clearInjectedUI() {
  // remove known injected UI elements
  document.querySelectorAll('.stremio-button, .stremio-option, .circular-strmio-button, .stremio-card-button, #stremio-search-overlay').forEach(el => el.remove());
  // clear Google injection marks
  document.querySelectorAll('[data-attrid="VisualDigestWatchAction"]').forEach(p => { if (p && p.dataset.stremioInjected) { delete p.dataset.stremioInjected; } });
}

function startFeaturesBasedOnSettings() {
  // disconnect all running observers
  Object.values(_observers).forEach(o => { try { o && o.disconnect && o.disconnect(); } catch (e) {} });
  _observers = {};

  // remove previously injected UI so toggling off takes effect
  clearInjectedUI();

  if (extensionSettings.showOnImdb) {
    _observers.cardsObserver = addButtonToCards();
    _observers.popupObserver = watchForWatchOptionsPopup();
    // one-off insertion that waits for reviews/header
    addStremioButtonNearReviews();
    // universal links after short delay
    setTimeout(() => { universalStremioLinks(); }, 1000);
  }

  if (extensionSettings.showOnGoogle) {
    _observers.googleObserver = addStremioToGoogleWhereToWatch();
  }

  if (extensionSettings.showOnImdb) {
    setTimeout(() => universalStremioLinks(), 1000);
  }

}

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
  const metadata = document.querySelector('[data-testid="hero-parent"]')?.innerText.toLowerCase() || "";

  if (
    metadata.includes("tv series") ||
    metadata.includes("tv mini series")
  ) {
    return "series";
  }

  return "movie";
}

// UI helpers: small purple spinner shown while resolving type
function showStremioLoading() {
  if (document.getElementById('stremio-search-spinner')) return;
    const style = document.createElement('style');
    style.id = 'stremio-search-spinner-style';
    style.textContent = `
      @keyframes stremio-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }
      #stremio-search-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display:flex; align-items:center; justify-content:center; z-index: 999999; }
      #stremio-search-spinner { display:flex; flex-direction:column; align-items:center; gap:10px; padding:18px; border-radius:12px; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
      #stremio-search-spinner .icon { width:88px; height:88px; display:block; border-radius:12px; box-shadow: 0 8px 30px rgba(124,77,255,0.25); }
      #stremio-search-spinner .label { font-size:14px; color:#ffffff; font-family: Arial, sans-serif; }
      #stremio-search-spinner .blink { animation: stremio-blink 1s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) { #stremio-search-spinner .blink { animation: none; } }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'stremio-search-overlay';

    const iconUrl = chrome.runtime.getURL('icons/imdb-to-stremio.png');

    const el = document.createElement('div');
    el.id = 'stremio-search-spinner';
    el.setAttribute('role','status');
    el.innerHTML = `<img class="icon blink" src="${iconUrl}" alt="Stremio" aria-hidden="true"><div class="label">Searching Stremio...</div>`;
    overlay.appendChild(el);
    document.body.appendChild(overlay);
}

function hideStremioLoading() {
  const overlay = document.getElementById('stremio-search-overlay');
  if (overlay) overlay.remove();
  const s = document.getElementById('stremio-search-spinner-style');
  if (s) s.remove();
}

async function resolveStremioType(imdbId) {
  showStremioLoading();
  try {

    const [movieRes, seriesRes] = await Promise.all([
      fetch(`https://v3-cinemeta.strem.io/catalog/movie/top/search=${imdbId}.json`),
      fetch(`https://v3-cinemeta.strem.io/catalog/series/top/search=${imdbId}.json`)
    ]);

    const movieData = movieRes.ok ? await movieRes.json() : null;
    const seriesData = seriesRes.ok ? await seriesRes.json() : null;

    if (seriesData?.metas?.length) return "series";
    if (movieData?.metas?.length) return "movie";

    const seriesResRetry = await fetch(`https://v3-cinemeta.strem.io/catalog/series/top/search=${imdbId}.json`);

    if (seriesResRetry.ok) {
      const seriesDataRetry = await seriesResRetry.json();
      if (seriesDataRetry?.metas?.length) return "series";
    }

  } catch (err) {
    console.warn("Stremio lookup failed", err);
  } finally {
    hideStremioLoading();
  }

  return "movie";
}

function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve) => {

    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(null); // important so await doesn't hang
    }, timeout);
  });
}

function waitForReviewsElement(callback) {

  const existing = document.querySelector('[data-testid="tm-box-wl-button"]');
  if (existing) {
    callback(existing);
    return;
  }

  const observer = new MutationObserver(() => {
    const reviews = document.querySelector('[data-testid="tm-box-wl-button"]');

    if (reviews) {
      observer.disconnect();
      callback(reviews);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

async function getHeaderElement(isEpisodePage) {

  if (isEpisodePage) {
    return await waitForElement(
      '[data-testid="tm-box-wl-button"]'
    );
  }

  return await waitForElement("h1");
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

  return observer;
}

function addStremioStreamingOption(popup) {

  const list = popup.querySelector('[data-testid="STREAMING-list"]');
  if (!list) return;
  // prevent duplicates
  if (list.querySelector(".stremio-option")) return;
  const titleHeader = popup.querySelector(".prompt-title-text");
  if (!titleHeader) return;

  const match = titleHeader.innerText.match(/S(\d+)\.E(\d+)/i);
  
  const stremioItem = document.createElement("a");

  const titleMatch = titleHeader.parentElement.href.match(/title\/(tt\d+)/);
  let imdbId = titleMatch ? titleMatch[1] : null;
  
  let link = `stremio:///search?query=${titleHeader.innerText}`;
  
  
  if (match) {
    imdbId = getImdbIdFromUrl();
    console.log("This is an episode page, extracting season and episode numbers");
    const season = match[1];
    const episode = match[2];
    link = `stremio:///detail/series/${imdbId}/${imdbId}%3A${season}%3A${episode}`;
  }

  stremioItem.className = "ipc-list__item stremio-option";
  stremioItem.setAttribute("role", "menuitem");
  stremioItem.href = link;
  stremioItem.target = "_self";

  const iconUrl = chrome.runtime.getURL("icons/imdb-to-stremio.png");

  stremioItem.innerHTML = `
    <span class="ipc-list-item__text" role="presentation">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:50px;height:50px;display:flex;align-items:center;justify-content:center;">
          <img src="${iconUrl}" alt="Stremio" style="width:100%;height:100%; border-radius:12px;">
        </div>
        <div>
          <div>Stremio</div>
          <div style="font-size:12px;opacity:0.7;">Open in Stremio</div>
        </div>
      </div>
    </span>

    <span class="ipc-list-item__icon ipc-list-item__icon--post" role="presentation">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
        class="ipc-icon ipc-icon--launch"
        viewBox="0 0 24 24"
        fill="currentColor">
        <path d="M16 16.667H8A.669.669 0 0 1 7.333 16V8c0-.367.3-.667.667-.667h3.333c.367 0 .667-.3.667-.666C12 6.3 11.7 6 11.333 6h-4C6.593 6 6 6.6 6 7.333v9.334C6 17.4 6.6 18 7.333 18h9.334C17.4 18 18 17.4 18 16.667v-4c0-.367-.3-.667-.667-.667-.366 0-.666.3-.666.667V16c0 .367-.3.667-.667.667zm-2.667-10c0 .366.3.666.667.666h1.727L9.64 13.42a.664.664 0 1 0 .94.94l6.087-6.087V10c0 .367.3.667.666.667.367 0 .667-.3.667-.667V6h-4c-.367 0-.667.3-.667.667z"></path>
      </svg>
    </span>
  `;

  list.appendChild(stremioItem);
}

function createButtonToCards() {
  const cards = document.querySelectorAll(".ipc-poster-card");
  
  const typeCache = {};

  cards.forEach(card => {
    if (card.querySelector(".stremio-button")) return;

    const titleLink = card.querySelector('.ipc-poster-card__title[href*="/title/"]');
    if (!titleLink) return;

    const match = titleLink.href.match(/title\/(tt\d+)/);
    if (!match) return;

    const imdbId = match[1];

    const actions = card.querySelector(".ipc-poster-card__actions");
    if (!actions) return;

    const button = document.createElement("a");

    button.className =
      "ipc-btn ipc-btn--single-padding ipc-btn--center-align-content ipc-btn--default-height ipc-btn--core-baseAlt ipc-btn--theme-baseAlt ipc-btn--button-radius ipc-btn--on-textPrimary ipc-text-button card-action-button stremio-button stremio-card-button";

    button.href = `stremio:///detail/movie/${imdbId}`;
    button.innerHTML = `
      <span class="ipc-btn__text">Stremio</span>
    `;
    button.innerHTML = `
      <span class="ipc-btn__text">▶ Watch in Stremio</span>
    `;

    button.onclick = async (e) => {
      e.preventDefault();

      if (!typeCache[imdbId]) {
        typeCache[imdbId] = await resolveStremioType(imdbId);
      }

      const type = typeCache[imdbId];
      if (!type) return;

      window.location.href = `stremio:///detail/${type}/${imdbId}`;
    };

    actions.prepend(button);
  });
}

function addButtonToCards() {
  const observer = new MutationObserver(() => {
    createButtonToCards();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // ensure at least one initial run
  createButtonToCards();

  return observer;
}

async function addStremioButtonNearReviews() {

  const imdbId = getImdbIdFromUrl();
  if (!imdbId) return;

  const episodeData = getSeriesEpisodeData();
  const type = detectContentType();

  waitForReviewsElement(async (reviewsElement) => {

    const container = reviewsElement.parentElement.parentElement;
    if (!container) return;

    if (container.querySelector(".stremio-button, .circular-strmio-button")) return;

    const buttonText = episodeData
      ? `▶ Play S${episodeData.season}.E${episodeData.episode} in Stremio`
      : "▶ Watch in Stremio";

    const buttonClass = "circular-strmio-button";

    const button = createStremioButton(buttonText, buttonClass);

    button.onclick = () => {
      if (episodeData) {
        window.location.href =
          `stremio:///detail/series/${episodeData.seriesId}/${episodeData.seriesId}%3A${episodeData.season}%3A${episodeData.episode}`;
      } else {
        window.location.href =
          `stremio:///detail/${type}/${imdbId}`;
      }
    };

    console.log("Looking for preferred services button...");

    let preferredServicesBtn =
      container.querySelector('[data-testid="wb-setYourPreferredServicesButton"]');

    if (!preferredServicesBtn) {
      preferredServicesBtn = await waitForElement(
        '[data-testid="wb-setYourPreferredServicesButton"]',
        1500
      );
    }

    if (preferredServicesBtn) {

      console.log("Found preferred services button — inserting after first element");

      const firstChild = container.firstElementChild;

      if (firstChild?.nextSibling) {
        container.insertBefore(button, firstChild.nextSibling);
      } else {
        container.appendChild(button);
      }

    } else {

      console.log("Preferred services button not found — inserting before reviews");

      const referenceNode = reviewsElement.parentElement;
      container.insertBefore(button, referenceNode);

    }

  });
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

// Google search injection: add Stremio tile inside the "Where to watch" (VisualDigestWatchAction) panel
function addStremioToGoogleWhereToWatch() {

  if (!location.hostname.includes("google.")) return;

  const iconUrl = chrome.runtime.getURL("icons/imdb-to-stremio.png");

  function extractImdbIdFromPage() {
    const imdb = document.querySelector('a[href*="imdb.com/title/tt"]');
    if (!imdb) return null;

    const m = imdb.href.match(/title\/(tt\d+)/);
    return m ? m[1] : null;
  }

  function detectType() {
    const kps = document.querySelectorAll('[data-maindata]');
    const kp = (kps && kps.length > 1) ? kps[1] : (kps[0] || null);
    if (!kp) return "movie";

    try {
      const raw = kp.getAttribute("data-maindata") || "";
      const decoded = raw.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      const data = JSON.parse(decoded);

      console.log("Google knowledge panel data", data);

      // Prefer explicit text field when available
      const text = (data && data.text) || (typeof data === 'string' ? data : JSON.stringify(data || {}));

      console.log("this is the text", text)

      if (typeof text === 'string' && text.toUpperCase().includes('["TV"]')) return 'series';
      if (typeof text === 'string' && text.toUpperCase().includes('["FILM"]')) return 'movie';
    } catch (err) {
      console.warn('Could not parse Google knowledge panel type', err);
    }

    return 'movie';
  }

  function inject(panel) {

    if (panel.dataset.stremioInjected) return;

    const imdbId = extractImdbIdFromPage();
    const type = detectType(panel);

    // providers section
    const providersWrapper = panel.children[0]?.children[1];
    if (!providersWrapper) return;

    const providersList = providersWrapper.firstElementChild;
    if (!providersList) return;

    const firstProvider = providersList.firstElementChild;
    if (!firstProvider) return;

    // clone existing provider tile
    const stremioTile = firstProvider.cloneNode(true);

    // change icon
    const img = stremioTile.querySelector("img");
    if (img) img.src = iconUrl;

    // change text
    const textDiv = stremioTile.querySelector("div[dir]");
    if (textDiv) textDiv.textContent = "Stremio";

    // remove Google's tracking attributes
    stremioTile.removeAttribute("data-ping");
    stremioTile.removeAttribute("jsdata");
    stremioTile.removeAttribute("jsaction");

    const link = stremioTile.closest("a") || stremioTile.querySelector("a");

    if (link) {
      link.href = imdbId
        ? `stremio:///detail/${type}/${imdbId}`
        : `stremio:///search?query=${encodeURIComponent(document.title)}`;

      link.addEventListener("click", (e) => {
        e.preventDefault();
        window.location.href = link.href;
      });
    }

    providersList.appendChild(stremioTile);

    panel.dataset.stremioInjected = "1";
  }

  const observer = new MutationObserver(() => {

    const panel = document.querySelector('[data-attrid="VisualDigestWatchAction"]');

    if (panel) inject(panel);

  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  const initial = document.querySelector('[data-attrid="VisualDigestWatchAction"]');
  if (initial) inject(initial);
}

chrome.runtime.onMessage.addListener((message) => {

  if (message.action === "openStremioSearch") {

    const url = `stremio:///search?query=${message.query}`;

    const link = document.createElement("a");
    link.href = url;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    link.remove();

  }

  if (message.action === "setShowOnImdb") {
    extensionSettings.showOnImdb = message.value;
    startFeaturesBasedOnSettings();
  }

  if (message.action === "setShowOnGoogle") {
    extensionSettings.showOnGoogle = message.value;
    startFeaturesBasedOnSettings();
  }


});  // TODO: stabilty, popup page on extension click, appear on google search


loadSettingsAndStart();

chrome.runtime.onMessage.addListener((message) => {


});