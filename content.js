console.log("YouTube Timestamp Extension Loaded");

// Helper function to find timestamps in comments
function findTimestamps(text) {
  const timestampPattern = /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g;
  return text.match(timestampPattern);
}

// Inject CSS styles for markers and tooltips
function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .timestamp-marker {
      position: absolute;
      bottom: 0;
      width: 12px;
      height: 100%; /* Change to full height */
      transform: translateX(-50%);
      background: transparent;
      cursor: pointer;
      pointer-events: auto;
      z-index: 10000;
    }
    .timestamp-marker::before {
      content: '';
      position: absolute;
      bottom: 0; /* Change from top to bottom */
      left: 50%;
      width: 4px;
      height: 12px;
      background-color: red;
      transform: translateX(-50%);
    }
    .timestamp-marker:hover .timestamp-tooltip {
      display: block;
    }
    .timestamp-tooltip {
      display: none;
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      background-color: rgba(0, 0, 0, 0.85);
      color: white;
      padding: 8px;
      font-size: 12px;
      border-radius: 4px;
      white-space: nowrap;
      z-index: 10001;
    }
  `;
  document.head.appendChild(style);
}

// Scrape comments from YouTube's comment section
function getCommentsWithTimestamps() {
  const comments = document.querySelectorAll(
    "ytd-comment-thread-renderer #content-text"
  );
  const timestampedComments = [];

  comments.forEach((comment) => {
    const lines = comment.textContent.split("\n");
    lines.forEach((line) => {
      const timestamps = findTimestamps(line);
      if (timestamps) {
        timestamps.forEach((timestamp) => {
          timestampedComments.push({
            time: timestamp,
            text: line.trim(),
          });
        });
      }
    });
  });

  console.log("Found", timestampedComments.length, "comments with timestamps");
  return timestampedComments;
}

function timestampToSeconds(timestamp) {
  const parts = timestamp.split(":").map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

function addMarkerToVideo(seconds, comment) {
  const video = document.querySelector("video");
  const progressBar = document.querySelector(".ytp-progress-bar");

  if (!progressBar || !video || !video.duration) return;

  const marker = document.createElement("div");
  marker.classList.add("timestamp-marker");

  const leftPercent = (seconds / video.duration) * 100;
  marker.style.left = `${leftPercent}%`;

  // Create tooltip element
  const tooltip = document.createElement("div");
  tooltip.classList.add("timestamp-tooltip");

  tooltip.innerText = comment;

  marker.appendChild(tooltip);

  // Seek video to the timestamp when marker is clicked
  marker.addEventListener("click", () => {
    video.currentTime = seconds;
    video.play();
  });

  progressBar.appendChild(marker);
}

function displayMarkers(timestampedComments) {
  const video = document.querySelector("video");
  if (!video) return;

  if (video.readyState >= 1) {
    // HAVE_METADATA
    timestampedComments.forEach((commentObj) => {
      const seconds = timestampToSeconds(commentObj.time);
      addMarkerToVideo(seconds, commentObj.text);
    });
  } else {
    video.addEventListener("loadedmetadata", () => {
      timestampedComments.forEach((commentObj) => {
        const seconds = timestampToSeconds(commentObj.time);
        addMarkerToVideo(seconds, commentObj.text);
      });
    });
  }
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Wait for the comments to load
function observeCommentsSection(retryCount = 0, maxRetries = 4) {
  const targetNode = document.querySelector("#comments");
  console.log("Target node: ", targetNode);

  if (!targetNode) {
    if (retryCount < maxRetries) {
      console.log(
        `Comments section not found. Retrying in 1 second (${
          retryCount + 1
        }/${maxRetries})`
      );
      setTimeout(
        () => observeCommentsSection(retryCount + 1, maxRetries),
        1000
      );
    } else {
      console.log("Max retries reached. Comments section not found.");
    }
    return;
  }

  const config = { childList: true, subtree: true };

  const debouncedCallback = debounce(() => {
    console.log("MutationObserver triggered (debounced)");
    const timestampedComments = getCommentsWithTimestamps();
    if (timestampedComments.length > 0) {
      displayMarkers(timestampedComments);
    }
  }, 500); // 500ms debounce time

  const observer = new MutationObserver(debouncedCallback);

  observer.observe(targetNode, config);
}

// Run script after the page fully loads
window.addEventListener("load", () => {
  injectStyles();
  observeCommentsSection();
  console.log("YouTube Timestamp Extension Loaded");
});
