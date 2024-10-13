console.log("YouTube Timestamp Extension Loaded");

// Global variables
let markersData = [];
let activeMarker = null;
let isMouseOverTooltip = false;
let hideTooltipTimeout = null;

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
    .timestamp-marker:hover .timestamp-tooltip {
      display: block;
    }
    /* Additional styles for injected content */
    .timestamp-tooltip-content {
      margin-top: 5px;
      color: #fff;
      font-size: 12px;
      line-height: 1.4;
      max-width: 70%; /* Limit the width of the tooltip content */
      overflow-wrap: break-word; /* Allow long words to break and wrap */
      white-space: normal; /* Allow text to wrap */
    }
    .ytp-tooltip.ytp-preview {
      max-width: 80%; /* Limit the overall width of the tooltip */
      overflow: hidden; /* Hide any overflow */
    }
    .timestamp-comment {
      margin-bottom: 5px;
    }
    .timestamp-comment:last-child {
      margin-bottom: 0;
    }
    .timestamp-text {
      margin-bottom: 3px;
      color: #000000; /* Change text color to white for better visibility */
    }
    .go-to-comment {
      background-color: #3ea6ff;
      color: #000000;
      border: none;
      padding: 4px 8px;
      font-size: 11px;
      border-radius: 3px;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    .go-to-comment:hover {
      background-color: #65b8ff;
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

function groupCloseTimestamps(timestampedComments, threshold = 3) {
  const groupedComments = [];
  let currentGroup = [];

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

  const groupedComments = groupCloseTimestamps(timestampedComments);

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

// Add a new function to scroll to the comment
function scrollToComment(commentElement, isDescription) {
  if (commentElement) {
    if (isDescription) {
      // For description timestamps, expand the description if it's collapsed
      const descriptionToggle = document.querySelector("#description #expand");
      if (descriptionToggle) {
        descriptionToggle.click();
      }
    }
    commentElement.scrollIntoView({ behavior: "smooth", block: "center" });
    commentElement.style.transition = "none";
    commentElement.style.backgroundColor = "rgba(255, 255, 0, 0.2)";
    setTimeout(() => {
      commentElement.style.transition = "background-color 1.5s ease-out";
      commentElement.style.backgroundColor = "transparent";
    }, 0);
  }
}

// Setup listeners on the progress bar
function setupProgressBarListeners() {
  const progressBar = document.querySelector(".ytp-progress-bar");
  if (progressBar) {
    progressBar.addEventListener("mousemove", onProgressBarMouseMove);
    progressBar.addEventListener("mouseleave", onProgressBarMouseLeave);
  }
}

function onProgressBarMouseMove(event) {
  console.log("onProgressBarMouseMove");
  if (hideTooltipTimeout) {
    clearTimeout(hideTooltipTimeout);
    hideTooltipTimeout = null;
  }

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
    updateTooltip();
  }
}

function onProgressBarMouseLeave(event) {
  console.log("onProgressBarMouseLeave");
  hideTooltipTimeout = setTimeout(() => {
    console.log("hiding tooltip");
    activeMarker = null;
    updateTooltip();
  }, 3000); // 300ms delay
}

function updateTooltip() {
  const tooltip = document.querySelector(".ytp-tooltip.ytp-preview");

  if (tooltip) {
    // Remove existing injected content
    const existingContent = tooltip.querySelector(".timestamp-tooltip-content");
    if (existingContent) {
      existingContent.remove();
    }

    if (activeMarker) {
      // Inject our comments
      const tooltipContent = document.createElement("div");
      tooltipContent.classList.add("timestamp-tooltip-content");

      // Style the content as desired
      tooltipContent.innerHTML = activeMarker.comments
        .map(
          (comment, index) => `
            <div class="timestamp-comment">
              <p class="timestamp-text">${comment.text}</p>
            </div>
          `
          // <button class="go-to-comment" data-index="${index}">Go to ${
          //   comment.isDescription ? "description" : "comment"
          // }</button>
        )
        .join("");

      tooltip.appendChild(tooltipContent);

      // Add click event listeners to the "Go to comment/description" buttons
      tooltipContent.querySelectorAll(".go-to-comment").forEach((button) => {
        button.addEventListener("click", (e) => {
          e.stopPropagation(); // Prevent the marker click event from firing
          const index = parseInt(button.getAttribute("data-index"));
          scrollToComment(
            activeMarker.comments[index].element,
            activeMarker.comments[index].isDescription
          );
        });
      });

      // Add mouseenter and mouseleave event listeners to the tooltip content
      tooltipContent.addEventListener("mouseenter", () => {
        if (hideTooltipTimeout) {
          clearTimeout(hideTooltipTimeout);
          hideTooltipTimeout = null;
        }
        isMouseOverTooltip = true;
      });
      tooltipContent.addEventListener("mouseleave", () => {
        isMouseOverTooltip = false;
        hideTooltipTimeout = setTimeout(() => {
          console.log("hiding tooltip");
          activeMarker = null;
          updateTooltip();
        }, 3000);
      });
    }
  }
}
