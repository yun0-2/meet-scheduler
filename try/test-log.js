(function () {
  "use strict";

  // 활성 조건: 테스트 배포(/try/)가 심는 전역 플래그, 또는 URL 쿼리 test=1.
  // 제출용 배포에는 이 파일 자체가 실리지 않는다.
  if (!window.TEST_LOG_FORCE && !/(?:^|[?&])test=1(?:&|$)/.test(location.search)) {
    return;
  }

  var startTime = Date.now();
  var logs = [];
  var scenarioOpen = false;

  function record(type, detail) {
    logs.push({ t: Date.now() - startTime, type: type, detail: detail });
  }

  function isTestLogUi(el) {
    return !!(el && el.closest && el.closest(".test-log-ui"));
  }

  // --- 스타일 주입 (styles.css는 건드리지 않는다) ---
  var style = document.createElement("style");
  style.textContent =
    ".test-log-banner{position:fixed;top:0;left:50%;transform:translateX(-50%);" +
    "z-index:9998;max-width:min(92vw,520px);background:#1c1c1e;color:#fff;" +
    "font-size:12px;line-height:1.5;padding:8px 34px 8px 14px;border-radius:0 0 10px 10px;" +
    "box-shadow:0 4px 14px rgba(0,0,0,.25);font-family:inherit;text-align:left;}" +
    ".test-log-banner strong{font-weight:600;}" +
    ".test-log-banner .test-log-close{position:absolute;top:2px;right:6px;" +
    "background:transparent;border:0;color:#fff;opacity:.7;font-size:16px;line-height:1;" +
    "padding:6px;cursor:pointer;}" +
    ".test-log-banner .test-log-close:hover{opacity:1;}" +
    ".test-log-copy-btn{position:fixed;top:10px;right:10px;z-index:9999;" +
    "background:#1c1c1e;color:#fff;border:0;border-radius:999px;padding:8px 14px;" +
    "font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);" +
    "font-family:inherit;}" +
    ".test-log-copy-btn:hover{opacity:.9;}";
  document.head.appendChild(style);

  // --- 고지 배너 ---
  var banner = document.createElement("div");
  banner.className = "test-log-banner test-log-ui";
  banner.innerHTML =
    "테스트 모드예요. 이 화면에서의 클릭·이동이 <strong>이 브라우저 안에만</strong> 기록돼요. " +
    "끝나면 오른쪽 위 '기록 복사'로 보내주세요." +
    '<button type="button" class="test-log-close" aria-label="안내 닫기">×</button>';
  document.body.appendChild(banner);
  banner.querySelector(".test-log-close").addEventListener("click", function () {
    banner.style.display = "none";
  });

  // --- 기록 복사 버튼 ---
  var copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "test-log-copy-btn test-log-ui";
  copyBtn.textContent = "기록 복사";
  document.body.appendChild(copyBtn);

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (err) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  function showCopied() {
    copyBtn.textContent = "복사됨 ✓";
    setTimeout(function () {
      copyBtn.textContent = "기록 복사";
    }, 2000);
  }

  copyBtn.addEventListener("click", function () {
    var payload = JSON.stringify({
      meta: {
        version: 1,
        ua: navigator.userAgent.slice(0, 60),
        startedAt: new Date(startTime).toISOString()
      },
      logs: logs
    });

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(payload).then(showCopied, function () {
        if (fallbackCopy(payload)) {
          showCopied();
        }
      });
    } else if (fallbackCopy(payload)) {
      showCopied();
    }
  });

  // --- 페이지 로드 / 초기 해시 ---
  record("start", window.innerWidth + "x" + window.innerHeight);
  record("route", location.hash || "");

  // --- 해시 변경 ---
  window.addEventListener("hashchange", function () {
    record("route", location.hash || "");
  });

  // --- 클릭 위임 (캡처 단계) ---
  document.addEventListener(
    "click",
    function (event) {
      var el = event.target;
      if (isTestLogUi(el)) {
        return;
      }
      if (!el || !el.closest) {
        return;
      }
      var actionTarget = el.closest("[data-action]");
      if (actionTarget) {
        record("click", actionTarget.getAttribute("data-action"));
        return;
      }
      var slotTarget = el.closest("[data-slot-id]");
      if (slotTarget) {
        record("click", "slot:" + slotTarget.getAttribute("data-slot-id"));
        return;
      }
      var tag = el.tagName ? el.tagName.toLowerCase() : "unknown";
      var text = (el.textContent || "").trim().slice(0, 15);
      record("click", tag + text);
    },
    true
  );

  // --- 격자 칠하기 (드래그 페인트는 click을 안 만들 수 있어 별도 기록) ---
  document.addEventListener(
    "pointerup",
    function (event) {
      var el = event.target;
      if (!el || !el.closest) {
        return;
      }
      var slotEl = el.closest(".mini-slot");
      if (slotEl) {
        record("paint", slotEl.getAttribute("data-slot-id"));
      }
    },
    true
  );

  // --- 시나리오 카드 표시/닫힘 ---
  var scenarioLayer = document.getElementById("scenario-layer");
  if (scenarioLayer && window.MutationObserver) {
    var observer = new MutationObserver(function () {
      var hasContent = scenarioLayer.children.length > 0;
      if (hasContent && !scenarioOpen) {
        scenarioOpen = true;
        record("scenario-open", null);
      } else if (!hasContent && scenarioOpen) {
        scenarioOpen = false;
        record("scenario-close", null);
      }
    });
    observer.observe(scenarioLayer, { childList: true });
  }
})();
