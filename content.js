console.log("YouTube Timestamp Extension Loaded");

// Helper function to find timestamps in comments (e.g., "1:23", "10:00", etc.)
function findTimestamps(text) {
  const timestampPattern = /\b(\d{1,2}:\d{2})\b/g;
  return text.match(timestampPattern);
}

// Inject CSS styles for markers and tooltips
function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .timestamp-marker {
      position: absolute;
      bottom: 0;
      width: 2px;
      height: 100%;
      background-color: red;
      transform: translateX(-50%);
      pointer-events: auto;
    }
    .timestamp-tooltip {
      position: absolute;
      bottom: 20px;
      background-color: black;
      color: white;
      padding: 5px;
      font-size: 12px;
      border-radius: 5px;
      white-space: nowrap;
      transform: translateX(-50%);
      pointer-events: none;
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
    const timestamps = findTimestamps(comment.textContent);
    if (timestamps) {
      timestamps.forEach((timestamp) => {
        timestampedComments.push({
          time: timestamp,
          text: comment.textContent,
        });
      });
    }
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

  // Display comment on hover
  marker.addEventListener("mouseenter", () => {
    const tooltip = document.createElement("div");
    tooltip.classList.add("timestamp-tooltip");
    tooltip.innerText = comment;
    marker.appendChild(tooltip);
  });

  marker.addEventListener("mouseleave", () => {
    marker.innerHTML = "";
  });

  progressBar.appendChild(marker);
}

// After collecting timestamped comments, insert markers
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

// Wait for the comments to load
function observeCommentsSection() {
  const targetNode = document.querySelector("#comments");

  if (!targetNode) return;

  const config = { childList: true, subtree: true };
  const observer = new MutationObserver((mutationsList) => {
    const timestampedComments = getCommentsWithTimestamps();
    if (timestampedComments.length > 0) {
      displayMarkers(timestampedComments);
    }
  });

  observer.observe(targetNode, config);
}

// Run script after the page fully loads
window.addEventListener("load", () => {
  injectStyles();
  observeCommentsSection();
  console.log("YouTube Timestamp Extension Loaded");
});
