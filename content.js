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
      height: 100%;
      transform: translateX(-50%);
      background: transparent;
      cursor: pointer;
      pointer-events: auto;
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
    .timestamp-tooltip {
      display: none;
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      background-color: rgba(28, 28, 28, 0.95);
      color: #ffffff;
      padding: 12px;
      font-size: 14px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      z-index: 10001;
      max-width: 300px;
      width: max-content;
    }
    .timestamp-comment {
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .timestamp-comment:last-child {
      margin-bottom: 0;
      padding-bottom: 0;
      border-bottom: none;
    }
    .timestamp-text {
      margin-bottom: 5px;
      line-height: 1.4;
    }
    .go-to-comment {
      background-color: #3ea6ff;
      color: #000000;
      border: none;
      padding: 6px 12px;
      font-size: 12px;
      border-radius: 4px;
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
            element: comment.closest("ytd-comment-thread-renderer"), // Store the comment element
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

  // Create tooltip element
  const tooltip = document.createElement("div");
  tooltip.classList.add("timestamp-tooltip");

  // Display multiple comments in the tooltip
  tooltip.innerHTML = comments
    .map(
      (comment, index) => `
      <div class="timestamp-comment">
        <p class="timestamp-text">${comment.text}</p>
        <button class="go-to-comment" data-index="${index}">Go to comment</button>
      </div>
    `
    )
    .join("");

  // Add click event listeners to the "Go to comment" buttons
  tooltip.querySelectorAll(".go-to-comment").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent the marker click event from firing
      const index = parseInt(button.getAttribute("data-index"));
      scrollToComment(comments[index].element);
    });
  });

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

// Add a new function to scroll to the comment
function scrollToComment(commentElement) {
  if (commentElement) {
    commentElement.scrollIntoView({ behavior: "smooth", block: "center" });
    commentElement.style.transition = "none";
    commentElement.style.backgroundColor = "rgba(255, 255, 0, 0.2)";
    setTimeout(() => {
      commentElement.style.transition = "background-color 1.5s ease-out";
      commentElement.style.backgroundColor = "transparent";
    }, 0);
  }
}
