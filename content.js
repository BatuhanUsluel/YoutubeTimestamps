console.log("YouTube Timestamp Extension Loaded");

// Global variables
let markersData = [];
let activeMarker = null;
let isMouseOverTooltip = false;
let hideTooltipTimeout = null;
let originalPreviewBgStyles = null;

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
      height: 100%;
      transform: translateX(-50%);
      background: transparent;
      cursor: pointer;
      pointer-events: auto; /* Prevent interfering with YouTube's tooltip */
      z-index: 10000;
    }
    .timestamp-marker::before {
      content: '';
      position: absolute;
      bottom: 0;
      left: 50%;
      width: 4px;
      height: 12px;
      background-color: #ff0000;
      transform: translateX(-50%);
    }
    .ytp-tooltip-text.ytp-tooltip-text-no-title {
      display: none !important;
    }
    .timestamp-tooltip-content {
      color: #fff;
      font-family: Roboto, Arial, sans-serif;
      font-size: 12px;
      line-height: 1.4;
      background-color: rgba(28, 28, 28, 0.9);
      border-radius: 0 0 8px 8px;
      padding: 8px;
      box-sizing: border-box;
      max-height: 300px;
      overflow-y: auto;
      top: 100%;
      left: 0;
    }
    .ytp-tooltip.ytp-preview {
      overflow: visible !important;
    }
    .timestamp-comment {
      margin-bottom: 6px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .timestamp-comment:last-child {
      margin-bottom: 0;
      padding-bottom: 0;
      border-bottom: none;
    }
    .timestamp-text {
      margin-bottom: 2px;
      white-space: normal;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .timestamp-time {
      font-weight: bold;
      font-size: 13px;
      color: #aaa;
    }
    .timestamp-icon {
      margin-right: 4px;
      opacity: 0.7;
    }
    .see-more-link {
      color: #3ea6ff;
      cursor: pointer;
      display: inline-block;
      margin-top: 4px;
      font-size: 11px;
    }
  `;
  document.head.appendChild(style);
}

// Scrape comments from YouTube's comment section
function getCommentsWithTimestamps() {
  const comments = document.querySelectorAll(
    "ytd-comment-thread-renderer #content-text"
  );
  const description = document.querySelector(
    "yt-attributed-string.content.style-scope.ytd-expandable-video-description-body-renderer"
  );
  console.log("Description: ", description.textContent);
  const timestampedComments = [];

  const descriptionLines = description.textContent.split("\n");
  descriptionLines.forEach((line) => {
    const timestamps = findTimestamps(line);
    if (timestamps) {
      timestamps.forEach((timestamp) => {
        timestampedComments.push({
          time: timestamp,
          text: line.trim(),
          element: description,
          isDescription: true,
        });
      });
    }
  });

  // Process comments (existing code)
  comments.forEach((comment) => {
    const lines = comment.textContent.split("\n");
    lines.forEach((line) => {
      const timestamps = findTimestamps(line);
      if (timestamps) {
        timestamps.forEach((timestamp) => {
          timestampedComments.push({
            time: timestamp,
            text: line.trim(),
            element: comment.closest("ytd-comment-thread-renderer"),
            isDescription: false,
          });
        });
      }
    });
  });

  console.log(
    "Found",
    timestampedComments.length,
    "timestamps in description and comments"
  );
  console.log(timestampedComments);
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

function groupCloseTimestamps(timestampedComments, videoDuration) {
  const groupedComments = [];
  let currentGroup = [];

  // Set threshold to 1% of video duration
  const threshold = videoDuration * 0.01;

  timestampedComments.sort(
    (a, b) => timestampToSeconds(a.time) - timestampToSeconds(b.time)
  );

  for (let i = 0; i < timestampedComments.length; i++) {
    if (
      currentGroup.length === 0 ||
      Math.abs(
        timestampToSeconds(timestampedComments[i].time) -
          timestampToSeconds(currentGroup[0].time)
      ) <= threshold
    ) {
      currentGroup.push(timestampedComments[i]);
    } else {
      groupedComments.push(currentGroup);
      currentGroup = [timestampedComments[i]];
    }
  }

  if (currentGroup.length > 0) {
    groupedComments.push(currentGroup);
  }

  return groupedComments;
}

function addMarkerToVideo(seconds, comments) {
  const video = document.querySelector("video");
  const progressBar = document.querySelector(".ytp-progress-bar");

  if (!progressBar || !video || !video.duration) return;

  const marker = document.createElement("div");
  marker.classList.add("timestamp-marker");

  const leftPercent = (seconds / video.duration) * 100;
  marker.style.left = `${leftPercent}%`;

  // Store marker data for later use
  markersData.push({
    leftPercent: leftPercent,
    seconds: seconds,
    comments: comments,
  });

  progressBar.appendChild(marker);
}

function displayMarkers(timestampedComments) {
  const video = document.querySelector("video");
  if (!video) return;

  clearExistingMarkers(); // Clear existing markers before adding new ones
  markersData = []; // Clear markers data

  const videoDuration = video.duration;
  const groupedComments = groupCloseTimestamps(
    timestampedComments,
    videoDuration
  );

  if (video.readyState >= 1) {
    // HAVE_METADATA
    groupedComments.forEach((group) => {
      const seconds = timestampToSeconds(group[0].time);
      addMarkerToVideo(seconds, group);
    });
  } else {
    video.addEventListener("loadedmetadata", () => {
      groupedComments.forEach((group) => {
        const seconds = timestampToSeconds(group[0].time);
        addMarkerToVideo(seconds, group);
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

function clearExistingMarkers() {
  const existingMarkers = document.querySelectorAll(".timestamp-marker");
  existingMarkers.forEach((marker) => marker.remove());
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
    } else {
      clearExistingMarkers(); // Clear markers if no timestamped comments are found
    }
  }, 500); // 500ms debounce time

  const observer = new MutationObserver(debouncedCallback);

  observer.observe(targetNode, config);

  // Observe changes to the video element
  const videoObserver = new MutationObserver(() => {
    clearExistingMarkers();
    debouncedCallback();
  });

  const videoConfig = { attributes: true, attributeFilter: ["src"] };
  const videoElement = document.querySelector("video");
  if (videoElement) {
    videoObserver.observe(videoElement, videoConfig);
  }
}

// Run script after the page fully loads
window.addEventListener("load", () => {
  injectStyles();
  observeCommentsSection();
  setupProgressBarListeners();
  console.log("YouTube Timestamp Extension Loaded");
});

// Setup listeners on the progress bar
function setupProgressBarListeners() {
  const progressBar = document.querySelector(".ytp-progress-bar");
  if (progressBar) {
    progressBar.addEventListener("mousemove", onProgressBarMouseMove);
    progressBar.addEventListener("mouseleave", clearCustomTooltip);
  }
}

function onProgressBarMouseMove(event) {
  const progressBar = event.currentTarget;
  const progressBarRect = progressBar.getBoundingClientRect();
  const cursorX = event.clientX - progressBarRect.left;

  let foundMarker = null;
  const thresholdPixels = 5;

  for (let marker of markersData) {
    const markerX = (marker.leftPercent / 100) * progressBarRect.width;
    if (Math.abs(cursorX - markerX) <= thresholdPixels) {
      foundMarker = marker;
      break;
    }
  }

  if (foundMarker !== activeMarker) {
    activeMarker = foundMarker;
    if (activeMarker) {
      updateTooltip();
    } else {
      clearCustomTooltip();
    }
  }
}

function clearCustomTooltip() {
  console.log("clearCustomTooltip");
  const tooltip = document.querySelector(".ytp-tooltip.ytp-preview");
  if (tooltip) {
    const existingContent = tooltip.querySelector(".timestamp-tooltip-content");
    if (existingContent) {
      existingContent.remove();
    }

    // Reset ytp-tooltip-bg styles to original state
    const previewBg = tooltip.querySelector(".ytp-tooltip-bg");
    if (previewBg && originalPreviewBgStyles) {
      previewBg.style.borderRadius = originalPreviewBgStyles.borderRadius;
      previewBg.style.outline = originalPreviewBgStyles.outline;
    }
  }
  activeMarker = null;
}

function updateTooltip() {
  console.log("updateTooltip");
  const tooltip = document.querySelector(".ytp-tooltip.ytp-preview");
  const previewBg = tooltip.querySelector(".ytp-tooltip-bg");

  if (tooltip && activeMarker && previewBg) {
    const existingContent = tooltip.querySelector(".timestamp-tooltip-content");
    if (existingContent) {
      existingContent.remove();
    }

    // Save original styles if not already saved
    if (!originalPreviewBgStyles) {
      originalPreviewBgStyles = {
        borderRadius: previewBg.style.borderRadius,
        outline: previewBg.style.outline,
      };
    }

    // Modify the ytp-tooltip-bg styles
    previewBg.style.borderRadius = "0";
    previewBg.style.outline = "none";

    // Inject our comments
    const tooltipContent = document.createElement("div");
    tooltipContent.classList.add("timestamp-tooltip-content");

    // Set width based on the preview background element's inline style
    const previewWidth = previewBg.style.width;
    tooltipContent.style.width = previewWidth;
    console.log("Preview width: " + previewWidth);

    // Display up to 5 comments
    const displayedComments = activeMarker.comments.slice(0, 5);
    const remainingComments = activeMarker.comments.length - 5;

    // Style the content as desired
    tooltipContent.innerHTML = displayedComments
      .map(
        (comment) => `
          <div class="timestamp-comment">
            <p class="timestamp-time">
              <span class="timestamp-icon">🕒</span>${comment.time}
            </p>
            <p class="timestamp-text">${comment.text}</p>
          </div>
        `
      )
      .join("");

    if (remainingComments > 0) {
      tooltipContent.innerHTML += `
        <span class="see-more-link">+${remainingComments} more</span>
      `;
    }

    tooltip.appendChild(tooltipContent);
  }
}

// Helper function to truncate text
function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substr(0, maxLength) + "...";
}
