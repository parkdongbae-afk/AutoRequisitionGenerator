const showReadyBadge = () => {
  chrome.action.setBadgeBackgroundColor({ color: "#16A34A" });
  chrome.action.setBadgeText({ text: "OK" });
};

chrome.runtime.onInstalled.addListener(showReadyBadge);
chrome.runtime.onStartup.addListener(showReadyBadge);
showReadyBadge();
