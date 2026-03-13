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

async function resolveStremioType(imdbId) {
  try {

    const [movieRes, seriesRes] = await Promise.all([
      fetch(`https://v3-cinemeta.strem.io/catalog/movie/top/search=${imdbId}.json`),
      fetch(`https://v3-cinemeta.strem.io/catalog/series/top/search=${imdbId}.json`)
    ]);

    const movieData = movieRes.ok ? await movieRes.json() : null;
    const seriesData = seriesRes.ok ? await seriesRes.json() : null;

    if (seriesData?.metas?.length) return "series";
    if (movieData?.metas?.length) return "movie";

    const seriesResRetry = await Promise(fetch(`https://v3-cinemeta.strem.io/catalog/series/top/search=${imdbId}.json`));

    if (seriesResRetry.ok) {
      const seriesDataRetry = await seriesResRetry.json();
      if (seriesDataRetry?.metas?.length) return "series";
    }

  } catch (err) {
    console.warn("Stremio lookup failed", err);
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

  stremioItem.className = "ipc-list__item stremio-option";
  stremioItem.setAttribute("role", "menuitem");
  stremioItem.href = "#";
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

  stremioItem.onclick = (e) => {
    e.preventDefault();

    window.location.href =
      `stremio:///detail/series/${seriesId}/${seriesId}%3A${season}%3A${episode}`;
  };

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

addButtonToCards();

watchForWatchOptionsPopup();

addStremioButtonNearReviews();

setTimeout(universalStremioLinks, 2000);