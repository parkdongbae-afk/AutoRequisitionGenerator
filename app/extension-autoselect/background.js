/*
 * 물품 자동 선택 — 백그라운드 서비스 워커
 * 팝업 ↔ 콘텐츠 스크립트 메시지 중계, 선택 완료 수 배지, 가상화 몰의 확대/축소 전환을 담당한다.
 */
'use strict';

// 가상화 목록 전체 렌더를 위해 실행 전 브라우저 배율을 25%로 낮추는 몰 —
// 품의캡처 확장이 검증한 방식(chrome.tabs.setZoom 0.25 → 대기 → 실행 → 복원)과 동일하다.
const ZOOM_MALLS = new Set(['naver-cart']);
const ZOOM_LEVEL = 0.25;
const ZOOM_RENDER_WAIT_MS = 1000;

// manifest 자동 주입이 빠진 탭(확장 재적재 후 열어 둔 페이지 등)에 콘텐츠 스크립트를
// 즉시 주입하기 위한 파일 목록 — manifest content_scripts와 동일한 순서다.
const CONTENT_FILES = ['content/core.js', 'content/rules-data.js', 'content/cart-router.js'];
const NO_CONTENT_MESSAGE = '이 페이지에서는 실행할 수 없습니다. 지원 쇼핑몰의 장바구니 화면에서 다시 실행해 주세요.';

function onRunResponse(res) {
  if (res && res.ok && typeof res.selected === 'number') {
    chrome.action.setBadgeText({ text: res.selected > 0 ? String(res.selected) : '' });
    if (res.selected > 0) chrome.action.setBadgeBackgroundColor({ color: '#1a7f37' });
  }
}

function sendRun(tabId, payload, sendResponse) {
  chrome.tabs.sendMessage(tabId, { type: 'AUTO_SELECT_RUN', payload }, (res) => {
    if (chrome.runtime.lastError) {
      // 콘텐츠 스크립트가 없는 탭(확장 재적재 후 열어 둔 페이지 등) — 즉시 주입 후 1회 재시도한다.
      // activeTab 권한으로 확장 아이콘을 누른 시점의 활성 탭에는 주입이 허용된다.
      chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, code: 'NO_CONTENT', message: NO_CONTENT_MESSAGE });
          return;
        }
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { type: 'AUTO_SELECT_RUN', payload }, (res2) => {
            if (chrome.runtime.lastError || !res2) {
              sendResponse({ ok: false, code: 'NO_CONTENT', message: NO_CONTENT_MESSAGE });
              return;
            }
            onRunResponse(res2);
            sendResponse(res2);
          });
        }, 150);
      });
      return;
    }
    onRunResponse(res);
    sendResponse(res);
  });
}

// 실행 전 25%로 축소(가상화 목록 전체 렌더 대기) → 실행 → 원래 배율 복원.
// 복원은 실행 결과와 무관하게 항상 수행한다.
function runWithZoom(tabId, payload, sendResponse) {
  chrome.tabs.getZoom(tabId, (prev) => {
    const prevZoom = chrome.runtime.lastError || typeof prev !== 'number' ? 1 : prev;
    chrome.tabs.setZoom(tabId, ZOOM_LEVEL, () => {
      const zoomed = !chrome.runtime.lastError;
      setTimeout(() => {
        sendRun(tabId, payload, (res) => {
          if (zoomed) chrome.tabs.setZoom(tabId, prevZoom, () => void chrome.runtime.lastError);
          sendResponse(res);
        });
      }, zoomed ? ZOOM_RENDER_WAIT_MS : 0);
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'AUTO_SELECT_RUN_RELAY') return undefined;

  const start = (tabId) => {
    if (!tabId) {
      sendResponse({ ok: false, message: '활성 탭을 찾을 수 없습니다.' });
      return;
    }
    if (msg.zoom) runWithZoom(tabId, msg.payload, sendResponse);
    else sendRun(tabId, msg.payload, sendResponse);
  };

  if (msg.tabId) {
    start(msg.tabId);
  } else {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      start(tabs && tabs[0] ? tabs[0].id : null);
    });
  }

  return true; // 비동기 sendResponse 유지
});
