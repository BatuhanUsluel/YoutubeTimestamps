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
      width: 12px; /* Increased width for better hover area */
      height: 100%;
      transform: translateX(-50%);
      background: transparent; /* Transparent background */
      cursor: pointer;
      pointer-events: auto;
      z-index: 10; /* Ensure marker is above the progress bar */
    }
    .timestamp-marker::before {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      width: 4px; /* Visual marker width */
      height: 100%;
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
      transform: translate(-50%, -5px);
      background-color: rgba(0, 0, 0, 0.85);
      color: white;
      padding: 8px;
      font-size: 12px;
      border-radius: 4px;
      white-space: nowrap;
      z-index: 9999;
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
  const progressList = document.querySelector(".ytp-progress-list");

  if (!progressList || !video || !video.duration) return;

  const marker = document.createElement("div");
  marker.classList.add("timestamp-marker");

  const leftPercent = (seconds / video.duration) * 100;
  marker.style.left = `${leftPercent}%`;

  // Create tooltip element
  const tooltip = document.createElement("div");
  tooltip.classList.add("timestamp-tooltip");

  tooltip.innerText = comment;

  marker.appendChild(tooltip);

  // Debug: Log tooltip creation
  console.log("Tooltip created:", tooltip);

  // Debug: Add hover event listeners
  marker.addEventListener("mouseenter", () => {
    console.log("Marker hovered");
    tooltip.style.display = "block";
  });

  marker.addEventListener("mouseleave", () => {
    console.log("Marker unhovered");
    tooltip.style.display = "none";
  });

  // Seek video to the timestamp when marker is clicked
  marker.addEventListener("click", () => {
    video.currentTime = seconds;
    video.play();
  });

  progressList.appendChild(marker);

  // Debug: Log marker addition
  console.log("Marker added to progress list:", marker);
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
  const observer = new MutationObserver(() => {
    const timestampedComments = getCommentsWithTimestamps();
    if (timestampedComments.length > 0) {
      displayMarkers(timestampedComments);
      observer.disconnect(); // Stop observing after markers are added
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
