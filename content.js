console.log("YouTube Timestamp Extension Loaded");

// Global variables
let markersData = [];
let activeMarker = null;
let isMouseOverTooltip = false;
let hideTooltipTimeout = null;
let originalPreviewBgStyles = null;

/**
 * Scans the provided text for timestamp patterns (e.g., "mm:ss" or "hh:mm:ss").
 * If a timestamp starts with "00:" (i.e., hours are zero), it simplifies it to "mm:ss".
 *
 * @param {string} text - The text to search for timestamps.
 * @returns {Array<string>|null} An array of found timestamp strings or null if none are found.
 */
function findTimestamps(text) {
  const timestampPattern = /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g;
  const matches = text.match(timestampPattern);
  if (!matches) return null;

  return matches.map((timestamp) => {
    const parts = timestamp.split(":");
    if (parts.length === 3 && parts[0] === "00") {
      return `${parts[1]}:${parts[2]}`;
    }
    return timestamp;
  });
}

/**
 * Injects custom CSS styles into the document head.
 * These styles are required for the proper display and positioning of timestamp markers and tooltips.
 */
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
  `;
  document.head.appendChild(style);
}

/**
 * Extracts and parses timestamped content from both the video description and the comments.
 * Creates an array of objects that each contains:
 *  - The timestamp string,
 *  - The comment text,
 *  - The corresponding DOM element, and
 *  - A flag indicating if the comment originates from the video description.
 *
 * @returns {Array<Object>} An array of timestamped comment objects.
 */
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

/**
 * Converts a timestamp string (formatted as "mm:ss" or "hh:mm:ss") into the total number of seconds.
 *
 * @param {string} timestamp - The timestamp to convert.
 * @returns {number} The equivalent time in seconds.
 */
function timestampToSeconds(timestamp) {
  const parts = timestamp.split(":").map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

/**
 * Groups timestamped comment objects that are within a close time range of each other.
 * The grouping threshold is set to 1% of the video duration.
 *
 * @param {Array<Object>} timestampedComments - The list of timestamped comment objects.
 * @param {number} videoDuration - The total duration of the video in seconds.
 * @returns {Array<Array<Object>>} An array where each element is a group (array) of closely-timed comment objects.
 */
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

/**
 * Adds a visual marker to the video progress bar at the specified time.
 * Each marker corresponds to one or more timestamped comments.
 *
 * @param {number} seconds - The time (in seconds) at which to place the marker.
 * @param {Array<Object>} comments - The associated timestamped comments for this marker.
 */
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

/**
 * Clears any existing markers and displays new markers on the video progress bar.
 * It groups the provided timestamped comments and adds one marker per group.
 *
 * @param {Array<Object>} timestampedComments - The list of timestamped comments.
 */
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

/**
 * Returns a debounced version of the provided function that delays its execution
 * until after a specified delay period (in milliseconds) has elapsed since the last invocation.
 *
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The number of milliseconds to delay.
 * @returns {Function} A debounced version of the input function.
 */
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

/**
 * Removes all timestamp markers currently displayed on the video progress bar.
 * This prevents duplicate markers when re-rendering based on new comment data.
 */
function clearExistingMarkers() {
  const existingMarkers = document.querySelectorAll(".timestamp-marker");
  existingMarkers.forEach((marker) => marker.remove());
}

/**
 * Observes the YouTube comments section for changes using a MutationObserver.
 * If the comments section is not initially found, it will retry up to a maximum number of times.
 * When changes are detected, it triggers the parsing of comments to update timestamp markers.
 *
 * @param {number} [retryCount=0] - The current retry attempt count.
 * @param {number} [maxRetries=4] - The maximum number of retry attempts.
 */
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

/**
 * Attaches event listeners to the video progress bar to handle mouse interactions.
 * Listeners include handling mouse movement for displaying tooltips and clearing them when the mouse leaves.
 */
function setupProgressBarListeners() {
  const progressBar = document.querySelector(".ytp-progress-bar");
  if (progressBar) {
    progressBar.addEventListener("mousemove", onProgressBarMouseMove);
    progressBar.addEventListener("mouseleave", clearCustomTooltip);
  }
}

/**
 * Handles mouse movement over the progress bar.
 * Checks if the cursor is near any timestamp marker, and if so, updates the tooltip to display the associated comments.
 *
 * @param {MouseEvent} event - The mouse event object.
 */
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

/**
 * Clears the custom tooltip that displays timestamped comment details.
 * Restores any modified styles of the YouTube tooltip background to their original state.
 */
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

/**
 * Updates the custom tooltip on the progress bar to display details of timestamped comments
 * when the user hovers near a marker.
 * Modifies the YouTube tooltip element by injecting additional content and setting up an observer to adjust to style changes.
 */
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

    // Style the content as desired
    tooltipContent.innerHTML = activeMarker.comments
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

    tooltip.appendChild(tooltipContent);

    // Set up a MutationObserver to watch for changes in the previewBg width
    const observer = new MutationObserver(() => {
      const previewWidth = previewBg.style.width;
      tooltipContent.style.width = previewWidth;
      console.log("Updated preview width: " + previewWidth);
    });

    // Start observing the previewBg for attribute changes
    observer.observe(previewBg, {
      attributes: true,
      attributeFilter: ["style"],
    });

    // Initial width set
    tooltipContent.style.width = previewBg.style.width;
    console.log("Initial preview width: " + previewBg.style.width);
  }
}

/**
 * Truncates the provided text to a specified maximum length and appends an ellipsis ("...") if truncation occurs.
 *
 * @param {string} text - The text to be truncated.
 * @param {number} maxLength - The maximum allowed length of the text.
 * @returns {string} The truncated text if it exceeds maxLength, otherwise the original text.
 */
function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substr(0, maxLength) + "...";
}

// Run script after the page fully loads
window.addEventListener("load", () => {
  injectStyles();
  observeCommentsSection();
  setupProgressBarListeners();
  console.log("YouTube Timestamp Extension Loaded");
});
