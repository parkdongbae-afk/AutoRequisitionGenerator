const manifest = chrome.runtime.getManifest();
const now = new Date().toLocaleString("ko-KR");
document.querySelector("#details").textContent =
  `${manifest.name} v${manifest.version} · ${now}`;
