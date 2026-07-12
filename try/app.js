(function () {
  "use strict";

  var data = window.CAST;
  var app = document.getElementById("app");
  // 아티클 장면 임베드용(?embed): 데모 레이어(리모컨·시나리오 카드)를 걷어내고
  // 해시로 지정된 그 저니만 남긴다. 제품 동작 자체는 동일.
  var isEmbedMode = String(window.location.search || "").indexOf("embed") !== -1;
  if (isEmbedMode && document.body && document.body.classList) {
    document.body.classList.add("is-embed");
  }
  var state = {
    route: "entry",
    selectedSlotId: null,
    reminderSent: false,
    selectedSoftSlots: {},
    optionalSoftSlots: {},
    inputOptOutByPerson: {},
    posted: false,
    activeSlotId: null,
    openSlotId: null,
    openCardId: null,
    rankInfoOpen: false,
    sortMode: "recommended",
    dragActive: false,
    dragMoved: false,
    dragPaintValue: null,
    dragStartId: null,
    dragLastPaintedId: null,
    suppressNextSoftToggle: false,
    composeModalOpen: false,
    composeStep: 1,
    inputStage: "dm",
    declined: false,
    myMarksOpen: false,
    windowStart: 20,
    windowEnd: 24,
    customSlot: null,
    deadlinePassed: false,
    deadlineSeen: false,
    entryTab: "channel",
    postToChannel: true,
    windowAnchor: null,
    windowPickerOpen: false,
    respondedReveal: false,
    jiwooSoftSlots: {},
    tentativeSlotId: null,
    scenarioOverlayOpen: false,
    scenarioFocusReturn: null,
    toastVisible: false,
    toastFading: false,
    toastText: "피하고 싶은 시간을 보냈어요",
    composePosted: false,
    composeAdded: {},
    attendanceOverride: {},
    meetingTitle: null,
    meetingContext: "",
    channelName: "pm-admin-dashboard",
    meetingRoom: "미팅룸 6",
    replyBy: "내일 18시",
    durationHours: 1,
    composeQuery: "",
    composeSuggestOpen: false,
    composeMessage: "",
    bannerOpen: false
  };

  // 장면별 설명 — 리모컨 위 비블로킹 캡션 한 줄(항상 표시). 파생 라우트는 기준 라우트와 같은 캡션.
  var demoCaptionByRoute = {
    entry: "주최자가 채널에서 회의를 열어요. 제목·참석자·문안은 미리 채워져 있어요.",
    input: "참석자가 DM으로 초대를 받았어요. 어려운 시간이 있으면 표시하고, 없으면 그대로 둬도 돼요.",
    compare: "기한이 지나 응답이 모였어요. 걸리는 게 적은 순서로 후보를 비교해 골라요.",
    confirm: "시간을 정하면 채널 카드가 확정으로 바뀌고 알림이 가요."
  };

  function demoCaptionFor(route) {
    var key = route === "input-optional" ? "input" : route;
    return demoCaptionByRoute[key] || demoCaptionByRoute.entry;
  }

  state.meetingTitle = data.meeting.title;

  function meetingTitle() {
    return state.meetingTitle || data.meeting.title;
  }

  // 검색 제안의 근거 칩 — 디렉토리/이력 데이터라고 시스템이 아는 것만 (cast.js는 수정하지 않음)
  var suggestReason = {
    taeho: "지난 킥오프 참석",
    minjun: "지난 킥오프 참석",
    haneul: "지난 킥오프 참석",
    sua: "지난 킥오프 결과 공유",
    seyoung: "지난 킥오프 결과 공유"
  };

  // 회의 설명(인비 본문) 제안 — 인비 관례: 목적(왜·무엇을 얻는지) + Agenda(준비 가능하게)
  function suggestedDescription() {
    return [
      "• 진행 현황 공유",
      "• 결정할 것 확인",
      "• 다음 액션·담당 정리"
    ].join("\n");
  }

  // 채널에 곁들여 보낼 메시지 제안 — 입력값(멘션·제목·소요시간·안건)에서 생성.
  // 실제 슬랙에서 쓰는 공지 형식(멘션 → 인사·맥락 → Agenda → 요청)을 따른다.
  function suggestedMessage() {
    var context = state.meetingContext.trim();
    var mentions = composeCandidates().filter(isComposeAdded).map(function (person) {
      return "@" + person.name;
    }).join(" ");
    var lines = [];
    if (mentions) {
      lines.push(mentions);
    }
    lines.push("안녕하세요, " + windowLabel() + " 중에 " + meetingTitle() + " " + durationLabel() + " 싱크를 잡으려고 해요.");
    if (context) {
      lines.push("");
      lines.push(context);
    }
    lines.push("");
    lines.push("시간은 아래 카드에서 확인하고, 어려우면 표시해주세요.");
    return lines.join("\n");
  }

  // 사람 행 공용 문법 — 아바타 / [이름 + 필수·선택 태그] / 직책(회색).
  // 작성·게시 카드가 같은 두 줄 구조를 쓰도록 한 함수로 뽑음.
  function personIdentityBlock(person, attendance, hideTag) {
    var isRequired = attendance === "required";
    return (
      '<span class="avatar" aria-hidden="true"' + avatarVars(person) + '>' + initials(person.name) + '</span>' +
      '<div class="compose-row-main">' +
        '<span class="compose-row-line">' +
          '<span class="compose-row-name">' + person.name + '</span>' +
          (isRequired || hideTag ? '' : '<span class="tag tag-optional">선택</span>') +
        '</span>' +
        '<span class="compose-row-role">' + person.role + '</span>' +
      '</div>'
    );
  }

  // 회의 시기 — 주최자가 월 캘린더에서 고른 날짜 범위가 곧 후보 요일이자 응답 기한.
  // 엔진은 요일 기준으로 돌고, 범위는 "어떤 요일이 후보인가"와 날짜 라벨만 정한다.
  var DOW_ORDER = ["월", "화", "수", "목", "금"];
  var TODAY_DOM = 11; // 2026-07-11(토). 이 날 이후 평일만 선택 가능

  // 작성 모달 왼쪽 아이콘 컬럼 (구글 캘린더 빠른 생성 문법) — 16px 스트로크
  var ICONS = {
    clock: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 4.8V8l2.2 1.6" stroke-linecap="round"/></svg>',
    lines: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h6"/></svg>',
    people: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="6" cy="5.5" r="2.4"/><path d="M1.8 13.2c.6-2.2 2.3-3.4 4.2-3.4s3.6 1.2 4.2 3.4"/><path d="M10.6 3.6a2.4 2.4 0 0 1 0 3.9M12.4 9.9c1 .5 1.7 1.6 2 3"/></svg>',
    hash: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M6.2 2.5 4.8 13.5M11.2 2.5 9.8 13.5M3 6h10.5M2.5 10H13"/></svg>',
    bubble: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2.5 3.5h11v7.5H8l-3 2.5v-2.5H2.5z"/></svg>',
    hourglass: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M4 2.5h8M4 13.5h8M5 2.5v2.6L8 8l3-2.9V2.5M5 13.5v-2.6L8 8l3 2.9v2.6"/></svg>',
    pin: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 1 0-9 0C3.5 9.8 8 14 8 14z"/><circle cx="8" cy="6.5" r="1.6"/></svg>'
  };

  var slotHours = buildSlotHours();
  var dayIndex = data.meeting.days.reduce(function (map, day, index) {
    map[day] = index;
    return map;
  }, {});
  function cloneList(items) {
    return JSON.parse(JSON.stringify(items));
  }

  function buildSlotHours() {
    // 점심(12시)도 정규 후보 — 시스템 잠금 대신 '모두에게 미리 채워진 회피 표시'로 다룬다.
    // 사람마다 점심이 다를 수 있으니, 기본 ×를 본인이 지울 수 있다 (사용성 테스트 3호).
    var hours = [];
    for (var hour = data.meeting.workHours.start; hour < data.meeting.workHours.end; hour += 1) {
      hours.push(hour);
    }
    return hours;
  }

  // 아바타 이니셜은 성 1글자로 통일 — 6인 캐스트는 성이 전부 달라 충돌 없음
  function initials(name) {
    return name.slice(0, 1);
  }

  // 아바타 정체성 파스텔을 CSS 변수로 (상태색과 분리된 레지스터)
  function avatarVars(person) {
    return ' style="--avatar:' + person.avatarColor + ';--avatar-text:' + person.avatarText + '"';
  }

  function slotId(day, start) {
    return day + "-" + start;
  }

  function formatClock(start) {
    var h = Math.floor(start);
    var m = Math.round((start - h) * 60);
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  function displayTime(slot) {
    return dayDate(slot.day) + "(" + slot.day + ") " + formatClock(slot.start);
  }

  function overlaps(event, start, end) {
    return event.start < end && event.end > start;
  }

  function getPerson(id) {
    return data.people.find(function (person) {
      return person.id === id;
    });
  }

  // 작성 단계에서 아무도 추가하지 않았으면(폴백) 캐스트 전원이 참여자다.
  // 일부만 추가했으면 추가된 사람 + 주최자만 이후 모든 화면의 참여자 집합이다.
  function composeHasSelection() {
    return Object.keys(state.composeAdded).some(function (id) {
      return state.composeAdded[id];
    });
  }

  function activePeople() {
    if (!composeHasSelection()) {
      return data.people;
    }
    return data.people.filter(function (person) {
      return person.isOrganizer || Boolean(state.composeAdded[person.id]);
    });
  }

  // 필수/선택 판정의 단일 창구 — 작성 단계에서 override가 없으면 cast 기본값 그대로.
  function effectiveAttendance(person) {
    if (Object.prototype.hasOwnProperty.call(state.attendanceOverride, person.id)) {
      return state.attendanceOverride[person.id];
    }
    return person.attendance;
  }

  function requiredPeople() {
    return activePeople().filter(function (person) {
      return effectiveAttendance(person) === "required";
    });
  }

  function optionalPeople() {
    return activePeople().filter(function (person) {
      return effectiveAttendance(person) === "optional";
    });
  }

  // 잠정 제안 — 캘린더 기준 1순위. 침묵=동의, 응답=보정, 기한=확정 트리거.
  // 확정이 보낸 잠정안과 다르면, '괜찮다'고 답한 동의는 이월되지 않는다 — 재확인 입구가 필요
  function confirmedDiffersFromTentative() {
    return Boolean(state.tentativeSlotId && state.selectedSlotId && state.tentativeSlotId !== state.selectedSlotId);
  }

  function tentativeSlot() {
    // 보낸 잠정안은 동결 — 응답이 들어와 지금의 1순위가 달라져도 '보낸 것'은 그대로다
    if (state.tentativeSlotId) {
      return slotById(state.tentativeSlotId);
    }
    return currentFeatured().recommended;
  }

  function tentativeLabel() {
    return displayTime(tentativeSlot());
  }

  // 2026년 7월: 7/1=수요일. 평일이면 요일 문자를, 주말이면 null.
  function julyDow(dom) {
    var idx = (dom - 1 + 2) % 7; // 0=월 … 6=일
    return idx <= 4 ? DOW_ORDER[idx] : null;
  }

  // 그 날짜가 속한 주의 월요일 날짜(월 안, 음수면 지난달)
  function weekMondayDom(dom) {
    return dom - ((dom - 1 + 2) % 7);
  }

  function isSelectableDom(dom) {
    return dom >= 1 && dom <= 31 && dom > TODAY_DOM && julyDow(dom) !== null;
  }

  // 선택 범위가 실제로 후보로 삼는 요일들 (범위는 한 주 안이라 월~금의 연속 부분집합)
  function activeDays() {
    var out = [];
    for (var dom = state.windowStart; dom <= state.windowEnd; dom += 1) {
      var dow = julyDow(dom);
      if (dow) {
        out.push(dow);
      }
    }
    return out.length ? out : DOW_ORDER.slice();
  }

  function dayDate(day) {
    for (var dom = state.windowStart; dom <= state.windowEnd; dom += 1) {
      if (julyDow(dom) === day) {
        return "7/" + dom;
      }
    }
    return "";
  }

  // 문안·필·버튼에 쓰는 범위 라벨. 하루면 "7/22", 여러 날이면 "7/20~24"
  function windowLabel() {
    if (state.windowStart === state.windowEnd) {
      return "7/" + state.windowStart;
    }
    return "7/" + state.windowStart + "~" + state.windowEnd;
  }

  // 캘린더 클릭: 시작일 찍고(anchor) → 같은 주 안에서 종료일 찍으면 범위 확정
  function pickWindowDate(dom) {
    if (isNaN(dom)) {
      return;
    }
    // 날짜 범위 2클릭: 시작일 찍고, 같은 주(월~금) 안에서 종료일 찍기.
    // 격자·추천이 한 주 화면이라 범위는 한 주를 넘지 않는다.
    if (state.windowAnchor === null) {
      state.windowAnchor = dom;
      render();
      return;
    }
    state.windowStart = Math.min(state.windowAnchor, dom);
    state.windowEnd = Math.max(state.windowAnchor, dom);
    state.windowAnchor = null;
    state.selectedSlotId = null;
    render();
  }

  function meetingDuration() {
    return state.durationHours || 1;
  }

  function durationLabel() {
    var map = { 0.5: "30분", 1: "1시간", 1.5: "90분", 2: "2시간" };
    return map[meetingDuration()] || "1시간";
  }

  // 회의 시작이 조직 점심창(12–13, 두 칸) 안이거나 근무 종료(18시)를 넘기면 후보에서 제외.
  // 점심은 추천에서 빼되(하드), 입력 격자에는 바꿀 수 있는 앰버로 미리 칠한다(lunchDefaultSoft).
  function slotBlockedByHours(start) {
    var end = start + meetingDuration();
    return end > data.meeting.workHours.end || data.meeting.workHours.lunch.indexOf(start) >= 0;
  }

  // 하드 차단 사유 라벨 — "왜 안 되는지"를 말할 때 쓴다
  function blockedHoursReason(start) {
    if (start === data.meeting.workHours.lunch[0]) {
      return "조직 점심시간";
    }
    return "근무 시간 밖";
  }

  function personHasBusy(person, day, start) {
    var end = start + meetingDuration();
    return person.busy.find(function (event) {
      return event.day === day && overlaps(event, start, end);
    });
  }

  function privateHardStatus(person, start) {
    var found = null;
    person.constraints.forEach(function (constraint) {
      if (constraint.type !== "hard" || !constraint.rule.unavailableAfter) {
        return;
      }
      if (start + meetingDuration() > constraint.rule.unavailableAfter) {
        found = {
          label: constraint.label,
          visibility: constraint.visibility,
          source: constraint.source
        };
      }
    });
    return found;
  }

  function privateBufferBurden(person, start) {
    var found = null;
    person.constraints.forEach(function (constraint) {
      if (constraint.type !== "hard" || !constraint.rule.unavailableAfter) {
        return;
      }
      if (start + meetingDuration() < constraint.rule.unavailableAfter && start + meetingDuration() + 1 >= constraint.rule.unavailableAfter) {
        found = {
          label: "바로 다음 일정",
          visibility: constraint.visibility,
          source: constraint.source
        };
      }
    });
    return found;
  }

  // 사람별 표시 오버라이드 맵 — 명시적으로 지운(false) 기록이 있는지 확인용
  function softOverrideMap(person) {
    if (person.id === "jiwoo") {
      return state.jiwooSoftSlots || {};
    }
    if (person.id === "haneul") {
      return state.selectedSoftSlots;
    }
    return state.optionalSoftSlots;
  }

  // 미리 채워진 회피 표시 = 점심(12시, 조직 공통) + 본인 상시 표시(예: 17시 이후).
  // 잠금이 아니라 '바꿀 수 있는 기본 표시'라 본인이 직접 정한 값(표시든 해제든)이 항상 우선한다.
  function lunchDefaultSoft(person, key, start) {
    var map = softOverrideMap(person);
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      return false;
    }
    if (data.meeting.workHours.lunch.indexOf(start) >= 0) {
      return true;
    }
    return (person.constraints || []).some(function (constraint) {
      if (constraint.type !== "soft") {
        return false;
      }
      if (constraint.rule.avoidStartAt === start) {
        return true;
      }
      if (constraint.rule.unavailableAfter && start + meetingDuration() > constraint.rule.unavailableAfter) {
        return true;
      }
      return false;
    });
  }

  function softConstraintStatus(person, day, start) {
    var key = slotId(day, start);
    var found = [];

    // 점심(12시)은 하드 차단으로 옮겨서 여기선 다루지 않는다 — lunchDefaultSoft는
    // 이제 본인 상시 표시(예: 17시 이후)만 반환한다
    if (person.id === "jiwoo" && state.jiwooSoftSlots && state.jiwooSoftSlots[key]) {
      found.push({ type: "soft", visibility: "private", label: "피하고 싶은 시간", source: "본인 입력" });
      return found;
    }
    if (person.id === "haneul" && Object.prototype.hasOwnProperty.call(state.selectedSoftSlots, key)) {
      if (state.selectedSoftSlots[key]) {
        found.push({
          type: "soft",
          visibility: "private",
          label: "피하고 싶은 시간",
          source: "본인 입력"
        });
      }
      return found;
    }

    person.constraints.forEach(function (constraint) {
      if (constraint.type === "soft" && constraint.rule.avoidStartAt === start) {
        found.push(constraint);
      }

      if (constraint.type === "soft" && constraint.rule.preferBefore && start >= constraint.rule.preferBefore) {
        found.push(constraint);
      }

      // 상시 표시(예: 17시 이후) — 회의가 그 시각을 넘기면 부담으로 계산
      if (constraint.type === "soft" && constraint.rule.unavailableAfter && start + meetingDuration() > constraint.rule.unavailableAfter) {
        found.push(constraint);
      }
    });
    return found;
  }

  function conditionalStatus(person, day) {
    return (person.attendanceModes || []).find(function (mode) {
      return mode.day === day;
    });
  }

  function researchBurden(day, start) {
    var defaults = data.researchDefaults;
    var items = [];
    if (defaults.postLunchDip.hours.indexOf(start) >= 0) {
      items.push({
        key: "postLunchDip",
        weight: defaults.postLunchDip.weight,
        label: "점심 이후"
      });
    }
    if (day === defaults.mondayMorning.day && start < defaults.mondayMorning.before) {
      items.push({
        key: "mondayMorning",
        weight: defaults.mondayMorning.weight,
        label: "월요일 오전"
      });
    }
    if (day === defaults.fridayLateAfternoon.day && start >= defaults.fridayLateAfternoon.after) {
      items.push({
        key: "fridayLateAfternoon",
        weight: defaults.fridayLateAfternoon.weight,
        label: "금요일 늦은 오후"
      });
    }
    return items;
  }

  function scoreSlot(day, start) {
    var blockedByHours = slotBlockedByHours(start);
    var requiredUnavailable = [];
    var optionalUnavailable = [];
    var privateSoft = [];
    var inferredSoft = [];
    var conditional = [];
    var busyConflicts = [];

    activePeople().forEach(function (person) {
      var busy = personHasBusy(person, day, start);
      var hard = privateHardStatus(person, start);

      if (busy || hard) {
        var conflict = {
          person: person,
          reason: busy ? busy.title : "시간이 맞지 않음",
          private: Boolean(hard && hard.visibility === "private")
        };
        busyConflicts.push(conflict);
        if (effectiveAttendance(person) === "required") {
          requiredUnavailable.push(conflict);
        } else {
          optionalUnavailable.push(conflict);
        }
      } else {
        var buffer = privateBufferBurden(person, start);
        if (buffer) {
          privateSoft.push({
            person: person,
            label: buffer.label,
            source: "비공개 입력",
            visibility: buffer.visibility
          });
        }
      }

      softConstraintStatus(person, day, start).forEach(function (constraint) {
        var item = {
          person: person,
          label: constraint.label,
          source: constraint.source,
          visibility: constraint.visibility
        };
        if (constraint.visibility === "private") {
          privateSoft.push(item);
        } else {
          inferredSoft.push(item);
        }
      });

      var condition = conditionalStatus(person, day);
      if (condition) {
        conditional.push({
          person: person,
          label: condition.label,
          mode: condition.mode
        });
      }
    });

    var research = researchBurden(day, start);
    var score =
      requiredUnavailable.length * 100 +
      optionalUnavailable.length * 7 +
      privateSoft.length * 10 +
      inferredSoft.length * 2 +
      research.reduce(function (sum, item) {
        return sum + (item.weight === "medium" ? 5 : 1);
      }, 0);

    return {
      id: slotId(day, start),
      day: day,
      start: start,
      score: score,
      burdenLevel: burdenLevel(score, requiredUnavailable.length > 0),
      requiredUnavailable: requiredUnavailable,
      optionalUnavailable: optionalUnavailable,
      privateSoft: privateSoft,
      inferredSoft: inferredSoft,
      conditional: conditional,
      research: research,
      busyConflicts: busyConflicts,
      blockedByHours: blockedByHours,
      allHardAvailable: !blockedByHours && busyConflicts.length === 0,
      requiredAvailable: requiredPeople().length - requiredUnavailable.length,
      optionalAvailable: optionalPeople().length - optionalUnavailable.length,
      totalAvailable: activePeople().length - busyConflicts.length
    };
  }

  function burdenLevel(score, blocked) {
    if (blocked) {
      return 4;
    }
    if (score <= 2) {
      return 0;
    }
    if (score <= 10) {
      return 1;
    }
    if (score <= 16) {
      return 2;
    }
    return 3;
  }

  function scoreAllSlots() {
    var slots = [];
    activeDays().forEach(function (day) {
      slotHours.forEach(function (start) {
        slots.push(scoreSlot(day, start));
      });
    });
    return slots;
  }

  function byRecommendation(a, b) {
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    if (a.optionalUnavailable.length !== b.optionalUnavailable.length) {
      return a.optionalUnavailable.length - b.optionalUnavailable.length;
    }
    if (dayIndex[a.day] !== dayIndex[b.day]) {
      return dayIndex[a.day] - dayIndex[b.day];
    }
    return a.start - b.start;
  }

  function byAvailability(a, b) {
    if (a.totalAvailable !== b.totalAvailable) {
      return b.totalAvailable - a.totalAvailable;
    }
    if (dayIndex[a.day] !== dayIndex[b.day]) {
      return dayIndex[b.day] - dayIndex[a.day];
    }
    return b.start - a.start;
  }

  function buildFeaturedSlots(slots) {
    var requiredOk = slots.filter(function (slot) {
      return !slot.blockedByHours && slot.requiredUnavailable.length === 0;
    });
    if (requiredOk.length === 0) {
      // 필수 전원이 가능한 슬롯이 없는 지형(예: 소요 시간이 길 때) — 가장 덜 걸리는 후보로 폴백
      requiredOk = slots.filter(function (slot) {
        return !slot.blockedByHours;
      });
    }
    if (requiredOk.length === 0) {
      requiredOk = slots;
    }

    var recommended = requiredOk
      .filter(function (slot) {
        return slot.allHardAvailable && slot.start < 16;
      })
      .sort(byRecommendation)[0] || requiredOk
      .filter(function (slot) {
        return slot.start < 16;
      })
      .sort(byRecommendation)[0] || requiredOk
      .sort(byRecommendation)[0];

    var runnerUp = requiredOk
      .filter(function (slot) {
        return slot.optionalUnavailable.length > 0 && slot.id !== recommended.id;
      })
      .sort(byRecommendation)[0] || requiredOk
      .filter(function (slot) {
        return slot.id !== recommended.id;
      })
      .sort(byRecommendation)[0];

    var stress = requiredOk
      .filter(function (slot) {
        // 근무 종료에 딱 붙는 마지막 시작(17시)은 제외 — 17시 하드 차단이 소프트로 강등되면서
        // 후보에 들어오지만, 데모 서사(퇴근 직전 16시·직후 일정 표시)는 16시에 묶여 있다
        return slot.allHardAvailable && slot.start < 17 && slot.id !== recommended.id && (!runnerUp || slot.id !== runnerUp.id);
      })
      .sort(byAvailability)[0] || requiredOk
      .filter(function (slot) {
        return slot.id !== recommended.id && (!runnerUp || slot.id !== runnerUp.id);
      })
      .sort(byAvailability)[0] || slots
      .filter(function (slot) {
        return slot.id !== recommended.id && (!runnerUp || slot.id !== runnerUp.id);
      })
      .sort(byAvailability)[0] || requiredOk
      .filter(function (slot) {
        return slot.id !== recommended.id;
      })
      .sort(byAvailability)[0] || runnerUp || recommended;

    var decisionFork = slots.find(function (slot) {
      return slot.day === data.keySlots.decisionFork.day && slot.start === data.keySlots.decisionFork.start;
    });

    return {
      recommended: recommended,
      runnerUp: runnerUp,
      stress: stress,
      decisionFork: decisionFork
    };
  }

  function currentFeatured() {
    return buildFeaturedSlots(scoreAllSlots());
  }

  function slotById(id) {
    if (state.customSlot && state.customSlot.id === id) {
      return state.customSlot;
    }
    var slots = scoreAllSlots();
    return slots.find(function (slot) {
      return slot.id === id;
    }) || currentFeatured().recommended;
  }

  // 데모용 결정적 매핑 — 시간대별로 빈 회의실이 다르다는 걸 보여주기 위한 것
  function roomForSlot(slot) {
    if (slot.start < 12) {
      return "미팅룸 4";
    }
    if (slot.start < 16) {
      return "미팅룸 6";
    }
    return "포커스룸 A";
  }

  function recommendedCards() {
    var featured = currentFeatured();
    var cards = [
      {
        key: "recommended",
        slot: featured.recommended,
        recommendedRank: "1순위",
        copy: primaryCardCopy(featured.recommended),
        detail: primaryCardDetail(featured.recommended)
      },
      {
        key: "runner-up",
        slot: featured.runnerUp,
        recommendedRank: "2순위",
        copy: runnerUpCardCopy(featured.runnerUp),
        detail: runnerUpCardDetail(featured.runnerUp)
      },
      {
        key: "stress",
        slot: featured.stress,
        recommendedRank: "3순위",
        copy: stressCardCopy(featured.stress),
        detail: stressCardDetail(featured.stress)
      }
    ];
    cards.slice().sort(function (a, b) {
      return byAvailability(a.slot, b.slot);
    }).forEach(function (card, index) {
      card.availableRank = "가능 " + (index + 1) + "위";
    });
    return cards;
  }

  function primaryCardCopy(slot) {
    if (slot.requiredUnavailable.length > 0) {
      return "이 길이로는 필수 참석자가 모두 가능한 시간이 없어요. 가장 가까운 후보예요.";
    }
    if (slot.totalAvailable === activePeople().length && slot.start < 16) {
      return "6명 모두 가능한 낮 시간이에요.";
    }
    return "필수 참석자가 모두 가능하고, 캘린더 충돌과 피하고 싶다는 표시가 가장 적어요.";
  }

  function primaryCardDetail(slot) {
    if (hasPrivateBurden(slot)) {
      // 과제 단서 "점심 직후 기피"는 사유(시간대)까지 밝힌다 — 누가·몇 명인지는 계속 숨긴다
      if (data.researchDefaults.postLunchDip.hours.indexOf(slot.start) >= 0) {
        return "점심 직후를 피하고 싶다는 표시가 있어요. 오후 후보 중에서는 겹치는 게 가장 적어요.";
      }
      return "피하고 싶다는 표시가 있어요. 후보 중 겹치는 게 가장 적어요.";
    }
    return "캘린더 충돌과 피하고 싶다는 표시가 후보 중 가장 적어요.";
  }

  function runnerUpCardCopy(slot) {
    if (slot.optionalUnavailable.length > 0) {
      return "필수 4명 모두 가능해요. 선택 참석자 " + slot.optionalUnavailable.length + "명은 캘린더 일정과 겹쳐요.";
    }
    return "다음으로 겹치는 게 적은 시간이에요.";
  }

  function runnerUpCardDetail(slot) {
    if (slot.optionalUnavailable.length > 0) {
      return "선택 참석자는 빠져도 진행할 수 있어요. 정해지면 결과를 공유해요.";
    }
    return "추천 시간과 비교할 후보로 볼 수 있어요.";
  }

  function stressCardCopy(slot) {
    if (slot.conditional.length > 0) {
      // 비공개 제약은 인원수도 안 센다 (k-익명 원칙)
      return "6명 모두 가능해요. 다만 끝나면 바로 퇴근이라, 직후에 일정이 있다는 표시가 있어요.";
    }
    if (hasPrivateBurden(slot)) {
      return "6명 모두 가능해요. 다만 피하고 싶다는 표시가 있어요.";
    }
    return "가능 인원은 많지만, 겹치는 표시가 다른 후보보다 많아요.";
  }

  function stressCardDetail(slot) {
    // 화상은 벌점이 아니므로 강등 이유로 쓰지 않는다 — 진짜 이유(시간대·직후 일정)만
    return "정렬을 '추천순'으로 바꾸면 이 시간은 3순위예요.";
  }

  function cardOrder(mode) {
    var cards = recommendedCards();
    if (mode === "availability") {
      return cards.sort(function (a, b) {
        return byAvailability(a.slot, b.slot);
      }).map(function (card) {
        return card.slot;
      });
    }
    return cards.map(function (card) {
      return card.slot;
    });
  }

  function orderedCards() {
    var cards = recommendedCards();
    if (state.sortMode === "availability") {
      return cards.sort(function (a, b) {
        return byAvailability(a.slot, b.slot);
      });
    }
    return cards;
  }

  function burdenCount(slot) {
    return slot.privateSoft.length + slot.inferredSoft.length;
  }

  function hasPrivateBurden(slot) {
    return slot.privateSoft.length > 0;
  }

  // 비공개로 입력한 하드 제약(예: 하늘의 17시 이후 불가)은 캘린더 일정과 달리
  // 어디에서도 이름과 결합해 표시하면 안 된다.
  function hasPrivateHardConflict(slot) {
    return slot.busyConflicts.some(function (item) {
      return item.private;
    });
  }

  function isUnavailableSlot(slot) {
    return slot.blockedByHours || slot.requiredUnavailable.length > 0;
  }

  function availabilityLevel(slot) {
    if (isUnavailableSlot(slot)) {
      return 0;
    }
    if (slot.totalAvailable >= activePeople().length) {
      return 3;
    }
    if (slot.totalAvailable >= activePeople().length - 1) {
      return 2;
    }
    return 1;
  }

  function participantHardForInput(person, day, start) {
    return personHasBusy(person, day, start) || privateHardStatus(person, start);
  }

  function softSelectedByDefault(slotKey) {
    if (Object.prototype.hasOwnProperty.call(state.selectedSoftSlots, slotKey)) {
      return state.selectedSoftSlots[slotKey];
    }
    // 빈 캔버스: 심사자가 직접 칠하기 전까지는 아무 칸도 미리 표시하지 않는다.
    // (추천 화면의 캐스트 폴백은 softConstraintStatus에서 별도로 유지된다.)
    return false;
  }

  function softSelectedForInput(person, slotKey) {
    // 점심 기본 ×: 명시 기록이 없으면 12시는 미리 칠해져 있고, 클릭 한 번으로 지워진다
    var start = parseFloat(slotKey.split("-")[1]);
    if (lunchDefaultSoft(person, slotKey, start)) {
      return true;
    }
    if (person.id === "jiwoo") {
      return Boolean(state.jiwooSoftSlots && state.jiwooSoftSlots[slotKey]);
    }
    if (person.id === "haneul") {
      return softSelectedByDefault(slotKey);
    }
    return Boolean(state.optionalSoftSlots[slotKey]);
  }

  // 이야기 배선 고정 인물(하늘/세영)이 작성 단계에서 빠졌을 수 있으니
  // activePeople 중 필수/선택 첫 번째(주최자 제외)로 폴백한다.
  function inputPersonForRoute() {
    var active = activePeople();
    if (state.route === "input-optional") {
      var seyoung = getPerson("seyoung");
      if (active.indexOf(seyoung) !== -1) {
        return seyoung;
      }
      return optionalPeople()[0] || active[0];
    }
    var haneul = getPerson("haneul");
    if (active.indexOf(haneul) !== -1) {
      return haneul;
    }
    return requiredPeople().filter(function (person) {
      return !person.isOrganizer;
    })[0] || active[0];
  }

  function softIsOn(slotKey) {
    if (state.myMarksOpen) {
      return softSelectedForInput(getPerson("jiwoo"), slotKey);
    }
    return softSelectedForInput(inputPersonForRoute(), slotKey);
  }

  function setSoft(slotKey, value, el) {
    // '내 캘린더 표시' 모달에서는 대상이 주최자 본인이다
    if (state.myMarksOpen) {
      state.jiwooSoftSlots[slotKey] = value;
      if (el && el.classList) {
        el.classList.toggle("is-soft", value);
      }
      return;
    }
    var person = inputPersonForRoute();
    if (state.inputOptOutByPerson[person.id]) {
      return;
    }
    if (person.id === "haneul") {
      state.selectedSoftSlots[slotKey] = value;
    } else {
      state.optionalSoftSlots[slotKey] = value;
    }
    if (!el) {
      return;
    }
    el.classList.toggle("is-soft", value);
    var parts = slotKey.split("-");
    var day = parts[0];
    var hour = parts[1];
    var label = day + "요일 " + hour + "시, " + (value ? "피하고 싶은 시간" : "가능한 시간");
    if (el.classList.contains("has-video")) {
      label += ", 화상 참여 가능";
    }
    el.setAttribute("aria-label", label);
  }

  function setRoute(route) {
    window.location.hash = route;
  }

  function currentRoute() {
    var hash = window.location.hash.replace("#", "");
    return hash || "entry";
  }

  function render() {
    state.route = currentRoute();
    if (state.route === "input" || state.route === "input-optional") {
      renderInput();
    } else if (state.route === "compare") {
      renderCompare();
    } else if (state.route === "confirm") {
      renderConfirm();
    } else {
      renderEntry();
    }
    renderDemoNav();
    lockBackgroundScroll(state.composeModalOpen || state.myMarksOpen || state.inputStage === "grid");
    if (state.composeModalOpen) {
      syncGhosts();
    }
    postEmbedHeight();
  }

  // 임베드(?embed): 렌더 후 실제 콘텐츠 높이를 부모(아티클)에 알려
  // iframe이 그 높이에 맞춰지도록 한다(세로 스크롤 제거).
  function postEmbedHeight() {
    if (!isEmbedMode || typeof window === "undefined" || window.parent === window) {
      return;
    }
    var send = function () {
      // 배경 화면은 뷰포트(=iframe 높이)를 채우도록 두므로 scrollHeight를 보고하면
      // 자기 자신을 따라가는 루프가 된다. 모달 카드만이 뷰포트와 무관한 진짜 콘텐츠
      // 높이라서, 모달이 열렸을 때만 카드 높이 + 오버레이 상하 여백(64)을 보고한다.
      // 부모는 이 값이 지금 높이보다 클 때만 늘린다(줄이지 않음).
      var modal = document.querySelector(".slack-modal-overlay .slack-modal");
      if (!modal) {
        return;
      }
      var h = Math.ceil(modal.getBoundingClientRect().height + 64);
      if (h) {
        window.parent.postMessage({ type: "ww-embed-height", route: state.route, height: h }, "*");
      }
    };
    // rAF는 iframe이 화면 밖이면 throttle되어 전송이 늦는다. setTimeout으로 레이아웃 반영 뒤 두 번 전송.
    setTimeout(send, 60);
    setTimeout(send, 260);
  }

  // 모달 열림 동안 배경 페이지 스크롤 잠금 (이중 스크롤의 세 번째 원인 제거)
  function lockBackgroundScroll(locked) {
    if (typeof document === "undefined" || !document.body) {
      return;
    }
    document.body.style.overflow = locked ? "hidden" : "";
  }

  // fish식 인라인 고스트: 입력이 제안의 접두사인 동안 나머지를 회색으로 보여준다.
  // (다르게 치면 사라진다 — Gmail의 무시-소멸 규칙. 빈 필드는 placeholder가 담당)
  function ghostRemainder(value, suggestion) {
    if (!value) {
      return "";
    }
    if (suggestion.indexOf(value) === 0 && suggestion.length > value.length) {
      return suggestion.slice(value.length);
    }
    return null;
  }

  function syncGhost(fieldId, mirrorId, acceptId, suggestion) {
    var field, mirror, accept;
    try {
      field = document.getElementById(fieldId);
      mirror = document.getElementById(mirrorId);
      accept = document.getElementById(acceptId);
    } catch (lookupError) {
      return;
    }
    if (!field || !mirror) {
      return;
    }
    var rest = ghostRemainder(field.value, suggestion);
    if (rest) {
      mirror.innerHTML = '<span class="ghost-typed">' + escapeText(field.value) + '</span><span class="ghost-rest">' + escapeText(rest) + '</span>';
      mirror.style.display = "block";
    } else {
      mirror.style.display = "none";
    }
    if (accept) {
      accept.style.display = (!field.value || rest) ? "inline-flex" : "none";
    }
  }

  function syncGhosts() {
    syncGhost("compose-context", "ghost-context", "ghost-accept-context", suggestedDescription());
    syncGhost("compose-message", "ghost-message", "ghost-accept-message", suggestedMessage());
  }

  // 여러 줄 텍스트가 기본 상태(제안 문안)에서 스크롤 없이 다 보이도록 rows를 미리 맞춘다.
  // JS 높이 측정은 레이아웃 타이밍·폭에 취약해, 줄 수 계산으로 대체.
  function textareaRows(text, min) {
    var lines = String(text || "").split("\n").length + 1;
    return Math.max(min, lines);
  }

  // 데모 전용 플로팅 네비게이터 — 제품 화면(#app) 바깥의 리모컨.
  // 주최자/참석자 시점 전환이 암시적이라 프로토타입을 처음 보는 사람이
  // 놓치기 쉬워서, 제품 UI 밖에 별도로 붙인 이동 수단이다.
  function renderDemoNav() {
    var nav;
    try {
      nav = document.getElementById("demo-nav");
    } catch (lookupError) {
      // 테스트 하네스 등 #demo-nav가 없는 최소 DOM 목업에서는 조용히 건너뛴다.
      return;
    }
    if (!nav) {
      return;
    }
    if (isEmbedMode) {
      // 임베드에서는 리모컨을 걷어낸다 — 비우면 #demo-nav:empty 규칙이 숨긴다.
      nav.innerHTML = "";
      return;
    }
    var route = state.route;
    var isInputOptional = route === "input-optional";
    var jiwoo = getPerson("jiwoo");
    var inputPerson = isInputOptional ? getPerson("seyoung") : getPerson("haneul");
    // 모달 화면에서는 패널이 모달 푸터 CTA(우하단)와 같은 자리라 푸터 위로 올린다.
    // CSS :has()는 삽입 직후 스타일 재계산이 안 도는 환경이 있어(실측) 클래스로 명시.
    var modalOpen = String(app.innerHTML || "").indexOf("slack-modal-overlay") !== -1;
    if (nav.setAttribute) {
      nav.setAttribute("class", modalOpen ? "is-lifted" : "");
    }
    // 역할별 그룹: 주최자 저니(제안→추천→확정) 한 행, 참석자 저니(응답) 한 행.
    var hostGroup = { role: "주최자", steps: [
      { hash: "entry", person: jiwoo, label: "제안", active: route === "entry" },
      { hash: "compare", person: jiwoo, label: "추천", active: route === "compare" },
      { hash: "confirm", person: jiwoo, label: "확정", active: route === "confirm" }
    ] };
    var guestGroup = { role: "참석자", steps: [
      { hash: isInputOptional ? "input-optional" : "input", person: inputPerson, label: "응답", active: route === "input" || isInputOptional }
    ] };

    function renderStepButton(step) {
      return (
        '<button type="button" class="demo-nav-btn" data-route="' + step.hash + '" aria-label="' + step.label + '"' + (step.active ? ' aria-current="page"' : '') + '>' +
          '<span class="demo-nav-label">' + step.label + '</span>' +
        '</button>'
      );
    }

    function renderGroup(group) {
      return (
        '<div class="demo-nav-group" role="group" aria-label="' + group.role + ' 단계">' +
          '<span class="demo-nav-role-label" aria-hidden="true">' + group.role + '</span>' +
          group.steps.map(renderStepButton).join("") +
        '</div>'
      );
    }

    // 우하단 고정 단일 패널 — 캡션·주최자 행·참석자 행이 같은 다크 배경 안에 쌓인다
    // (세 조각으로 떠 보인다는 피드백 반영). 폭은 모달 푸터 CTA 텍스트를 가리지 않는
    // 한도로 CSS에서 고정한다.
    nav.innerHTML =
      '<button type="button" class="demo-nav-help" data-action="scenario-replay" aria-label="데모 안내 다시 보기">?</button>' +
      '<p class="demo-nav-caption">' + demoCaptionFor(route) + '</p>' +
      '<div class="demo-nav-row">' + renderGroup(hostGroup) + '</div>' +
      '<div class="demo-nav-row">' + renderGroup(guestGroup) + '</div>';
  }

  // 소개 카드 — 자동으로 띄우지 않는다. 리모컨 ? 버튼으로 열 때만 표시하고,
  // 진입 즉시 제품 화면과 리모컨 캡션이 안내를 대신한다(첫인상에서 클릭 한 번 절약).
  function renderScenarioCard() {
    if (isEmbedMode) {
      // 임베드에서는 상황 설명을 아티클 본문이 대신한다 — 카드 없이 바로 조작.
      return;
    }
    var layer = getScenarioLayer();
    if (!layer) {
      return;
    }
    openScenarioOverlay(layer,
      '<div class="scenario-card" role="dialog" aria-modal="true" aria-label="3분 데모">' +
        '<p class="scenario-eyebrow">3분 데모</p>' +
        '<p class="scenario-body">슬랙에서 회의 시간을 정하는 흐름이에요. 주최자가 제안을 보내고, 참석자의 사정을 모아, 추천에서 골라 확정해요.</p>' +
        '<button type="button" class="scenario-start-btn" data-action="scenario-close">시작하기</button>' +
      '</div>');
  }

  function getScenarioLayer() {
    var layer;
    try {
      layer = document.getElementById("scenario-layer");
    } catch (lookupError) {
      // 테스트 하네스 등 #scenario-layer가 없는 최소 DOM 목업에서는 조용히 건너뛴다.
      return null;
    }
    return layer || null;
  }

  function openScenarioOverlay(layer, cardHtml) {
    state.scenarioOverlayOpen = true;
    state.scenarioFocusReturn = (document.activeElement && document.activeElement !== document.body)
      ? document.activeElement
      : null;
    layer.innerHTML = '<div class="scenario-overlay">' + cardHtml + '</div>';
    var focusBtn = layer.querySelector ? layer.querySelector(".scenario-start-btn") : null;
    if (focusBtn && focusBtn.focus) {
      focusBtn.focus();
    }
  }

  function closeScenarioCard() {
    if (!state.scenarioOverlayOpen) {
      return;
    }
    state.scenarioOverlayOpen = false;
    var layer;
    try {
      layer = document.getElementById("scenario-layer");
    } catch (lookupError) {
      return;
    }
    if (layer) {
      layer.innerHTML = "";
    }
    var returnEl = state.scenarioFocusReturn;
    state.scenarioFocusReturn = null;
    if (returnEl && returnEl.focus && document.body && document.body.contains && document.body.contains(returnEl)) {
      returnEl.focus();
    }
    revealMissionCta();
  }

  // 시나리오 카드가 가리키는 CTA가 폴드 아래 잘려 있으면 화면 안으로 데려온다.
  // (예: 1단계 미션 "'시간 정하기'를 눌러…" — 버튼이 스크롤 밖이면 미션을 수행할 수 없다)
  var missionCtaByRoute = {
    entry: '[data-action="post-compose"], [data-action="go-compare"]',
    confirm: '[data-action="post-confirm"]'
  };

  function revealMissionCta() {
    var selector = missionCtaByRoute[state.route];
    if (!selector || !app.querySelector) {
      return;
    }
    var cta = app.querySelector(selector);
    if (!cta || !cta.getBoundingClientRect || !cta.scrollIntoView) {
      return;
    }
    var rect = cta.getBoundingClientRect();
    var viewportHeight = window.innerHeight || 0;
    // 하단 88px는 데모 리모컨이 덮는 영역
    if (rect.bottom <= viewportHeight - 88 && rect.top >= 0) {
      return;
    }
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    cta.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
  }

  function renderEntry() {
    app.innerHTML = entryMarkup() + renderToast();
  }

  // 추천 다이얼로그 뒤 배경으로도 재사용 — 모달 문법(뒤에 실제 채널이 비침)
  function entryMarkup() {
    var jiwoo = getPerson("jiwoo");
    return (
      '<section class="screen">' +
        '<div class="screen-inner messenger-shell">' +
          '<aside class="workspace-rail" aria-label="워크스페이스">' +
            '<p class="workspace-name">Product Lab</p>' +
            '<ul class="channel-list">' +
              ["공지", "pm-admin-dashboard", "제품실험", "데이터지원"].map(function (ch) {
                var active = state.composePosted && state.postToChannel && state.entryTab === "channel" && ch === state.channelName;
                var unread = (ch === "공지" || ch === "제품실험") && !active;
                var clickable = state.composePosted && state.postToChannel && ch === state.channelName;
                return '<li class="' + (active ? "active" : "") + (unread ? " is-unread" : "") + '"' + (clickable ? ' data-action="entry-tab-channel"' : '') + '><span># ' + ch + '</span></li>';
              }).join("") +
              '<li class="channel-app' + (!state.composePosted || state.entryTab === "bot" ? " active" : "") + '"' + (state.composePosted ? ' data-action="entry-tab-bot"' : '') + '>' +
                '<span>WhenWorks</span>' +
                (state.deadlinePassed && !state.deadlineSeen ? '<span class="ch-badge">1</span>' : '') +
              '</li>' +
            '</ul>' +
          '</aside>' +
          '<section class="channel-panel" aria-label="슬랙 스타일 채널">' +
            '<header class="channel-header"><h1>' + (state.composePosted && state.entryTab === "channel" ? '# ' + state.channelName : 'WhenWorks') + '</h1></header>' +
            (state.composePosted && state.entryTab === "channel" ? renderMeetingBanner() : '') +
            '<div class="message-thread">' +
              (state.composePosted && state.entryTab === "channel"
                ? '<article class="message">' +
                    '<div class="avatar" aria-hidden="true"' + avatarVars(jiwoo) + '>' + initials(jiwoo.name) + '</div>' +
                    '<div>' +
                      '<div class="message-meta"><span class="message-author">서지우</span><span class="message-time">오전 10:04</span></div>' +
                      renderPostedMessageText() + renderPostedCard() +
                    '</div>' +
                  '</article>'
                : renderBotIntroMessage() +
                  (state.composePosted && !state.postToChannel
                    ? '<article class="message">' +
                        '<div class="avatar app-avatar" aria-hidden="true">W</div>' +
                        '<div>' +
                          '<div class="message-meta"><span class="message-author">WhenWorks</span><span class="app-badge">앱</span><span class="message-time">오전 10:04</span></div>' +
                          '<p class="bot-intro-text">참석자들에게 초대를 보냈어요.</p>' +
                          renderPostedCard() +
                        '</div>' +
                      '</article>'
                    : '') +
                  (state.composePosted && state.deadlinePassed ? renderDeadlineMessage() : '')) +
            '</div>' +
          '</section>' +
          (state.deadlinePassed && !state.deadlineSeen && state.entryTab === "channel"
            ? '<div class="coach-bubble" role="status">응답 기한이 끝났어요. <strong>WhenWorks</strong>를 눌러 알림을 확인하세요.</div>'
            : '') +
        '</div>' +
      '</section>' +
      (state.composeModalOpen ? renderComposeModal(jiwoo) : '') +
      (state.myMarksOpen ? renderMyMarksModal(jiwoo) : '')
    );
  }

  // 마감 알림 — 봇이 주최자에게 보내는 메시지. 여기의 [시간 확정하기]가 다음 단계 입구.
  function renderDeadlineMessage() {
    return (
      '<article class="message">' +
        '<div class="avatar app-avatar" aria-hidden="true">W</div>' +
        '<div>' +
          '<div class="message-meta"><span class="message-author">WhenWorks</span><span class="app-badge">앱</span><span class="message-time">방금</span></div>' +
          '<p class="bot-intro-text">' + meetingTitle() + ' 응답 기한이 끝났어요. 모인 응답으로 추천 시간을 골라보세요.</p>' +
          '<div class="bot-intro-actions">' +
            '<button type="button" class="slack-btn slack-btn-primary" data-action="go-compare">시간 확정하기</button>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  // 봇 채널의 앱 메시지 — 여기의 버튼이 진입점이다 (슬랙 앱 관례)
  function renderBotIntroMessage() {
    return (
      '<article class="message">' +
        '<div class="avatar app-avatar" aria-hidden="true">W</div>' +
        '<div>' +
          '<div class="message-meta"><span class="message-author">WhenWorks</span><span class="app-badge">앱</span><span class="message-time">오전 10:03</span></div>' +
          '<p class="bot-intro-text">회의 시간을 정할 때 불러주세요.</p>' +
          '<div class="bot-intro-actions">' +
            '<button type="button" class="slack-btn slack-btn-primary" data-action="open-compose">회의 개최</button>' +
            '<button type="button" class="slack-btn" data-action="open-my-marks">내 캘린더 표시</button>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  // 슬랙 네이티브 모달 문법 — 앱의 작성 폼은 dialog 안에서 열린다
  // 상시 '내 캘린더 표시' — 회의 단위가 아니라 개인 레이어. 모든 조율 계산에 반영된다.
  function renderMyMarksModal(jiwoo) {
    return (
      '<div class="slack-modal-overlay" data-action="close-my-marks-backdrop">' +
        '<div class="slack-modal" role="dialog" aria-modal="true" aria-label="내 캘린더 표시">' +
          '<header class="slack-modal-head">' +
            '<h2>내 캘린더 표시</h2>' +
            '<button type="button" class="slack-modal-close" data-action="close-my-marks" aria-label="닫기">✕</button>' +
          '</header>' +
          '<div class="slack-modal-body">' +
            '<p class="helper-copy">피하고 싶은 시간을 표시해두면 앞으로의 모든 회의 조율에 반영돼요. 누가 표시했는지는 보이지 않아요.</p>' +
            '<div class="mini-week-grid" style="--day-cols: ' + activeDays().length + '" aria-label="내 표시 격자">' + renderMiniGrid(jiwoo, false) + '</div>' +
          '</div>' +
          '<div class="compose-footer">' +
            '<button class="btn compose-send-btn" data-action="close-my-marks">저장</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderComposeModal(jiwoo) {
    var isStep2 = state.composeStep === 2;
    // 단계 표시는 스테퍼 대신 슬랙 모달 스택(views.push) 문법 —
    // 타이틀 교체 + 좌상단 ← + 진행형 CTA 라벨. 확정 화면 제목(이 시간으로 정할까요?)과 대구.
    return (
      '<div class="slack-modal-overlay" data-action="close-compose-backdrop">' +
        '<div class="slack-modal is-compose' + (isStep2 ? ' is-wide' : '') + '" role="dialog" aria-modal="true" aria-label="회의 잡기">' +
          '<header class="slack-modal-head">' +
            (isStep2 ? '<button type="button" class="slack-modal-back" data-action="compose-back" aria-label="뒤로">←</button>' : '') +
            '<h2>' + (isStep2 ? (state.tentativeSlotId ? '이 시간으로 제안할까요?' : '어느 시간으로 제안할까요?') : '회의 잡기') + '</h2>' +
            '<button type="button" class="slack-modal-close" data-action="close-compose" aria-label="닫기">✕</button>' +
          '</header>' +
          '<div class="slack-modal-body">' + (isStep2 ? renderComposeStep2(jiwoo) : renderComposeStep1(jiwoo)) + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  // 채널 상단 배너 — 예정 회의가 있으면 공지처럼 떠 있고, 펼치면 응답 현황
  function renderMeetingBanner() {
    var people = activePeople();
    var waiting = unrespondedPeople();
    var responded = (!state.respondedReveal && !state.posted) ? 0 : people.length - waiting.length;
    var body = "";
    if (state.bannerOpen) {
      body =
        '<div class="meeting-banner-body">' +
          '<span class="banner-line">응답 ' + responded + '/' + people.length +
            (waiting.length > 0 ? ' · ' + waiting.map(function (p) { return p.name; }).join(', ') + '님 답 기다리는 중' : ' · 모두 응답했어요') + '</span>' +
          '<button type="button" class="btn btn-secondary banner-cta" data-action="go-compare">추천 보기</button>' +
        '</div>';
    }
    return (
      '<div class="meeting-banner">' +
        '<button type="button" class="meeting-banner-head" data-action="toggle-banner" aria-expanded="' + String(state.bannerOpen) + '">' +
          '<span class="banner-title">' + (state.posted ? '확정 회의' : '예정 회의') + ' · ' + meetingTitle() + '</span>' +
          '<span class="banner-meta">응답 ' + responded + '/' + people.length + '</span>' +
          '<span class="banner-chevron" aria-hidden="true">' + (state.bannerOpen ? '∧' : '∨') + '</span>' +
        '</button>' + body +
      '</div>'
    );
  }

  // 나머지 5명(주최자 제외) — 작성 단계 "참석자 추가" 후보 목록
  function composeCandidates() {
    return data.people.filter(function (person) {
      return !person.isOrganizer;
    });
  }

  function isComposeAdded(person) {
    return Boolean(state.composeAdded[person.id]);
  }

  function escapeAttr(value) {
    return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function escapeText(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }

  function composeSuggestions() {
    var query = state.composeQuery.trim();
    return composeCandidates().filter(function (person) {
      if (isComposeAdded(person)) {
        return false;
      }
      if (!query) {
        return true;
      }
      return person.name.indexOf(query) >= 0 || (person.role || "").indexOf(query) >= 0;
    });
  }

  function renderComposeSuggestions() {
    var items = composeSuggestions();
    if (items.length === 0) {
      return '<p class="compose-suggest-empty">일치하는 동료가 없어요</p>';
    }
    return items.map(renderCandidateRow).join("");
  }

  // 월 캘린더 주 피커 — 날짜 하나를 누르면 그 주(월~금) 전체가 후보. 주말·오늘 이전은 비활성.
  function renderWindowCalendar() {
    var weekdayHead = ["월", "화", "수", "목", "금", "토", "일"];
    var head = weekdayHead.map(function (w) {
      return '<span class="wcal-dow">' + w + '</span>';
    }).join("");

    // 7/1은 수요일 → 월요일 시작 격자에서 앞 2칸은 빈칸
    var cells = '<span class="wcal-pad"></span><span class="wcal-pad"></span>';
    for (var dom = 1; dom <= 31; dom += 1) {
      var dow = julyDow(dom);
      var isWeekend = dow === null;
      var selectable = isSelectableDom(dom);
      // 시작일을 찍었으면 달력 7일 안에서만 종료일 후보 — 같은 요일이 두 번 들어오면
      // 주간 격자(요일 축)가 성립하지 않는다. 주 걸침(목~다음 화)은 허용된다.
      if (state.windowAnchor !== null && selectable && Math.abs(dom - state.windowAnchor) > 6) {
        selectable = false;
      }
      var inRange = state.windowAnchor === null && dom >= state.windowStart && dom <= state.windowEnd && !isWeekend;
      var cls = ["wcal-day"];
      if (isWeekend) cls.push("is-weekend");
      if (!selectable && state.windowAnchor !== dom) cls.push("is-disabled");
      if (inRange) {
        cls.push("is-range");
        if (dom === state.windowStart) cls.push("is-range-start");
        if (dom === state.windowEnd) cls.push("is-range-end");
      }
      if (state.windowAnchor === dom) cls.push("is-anchor");
      var weekAttr = selectable ? ' data-week="' + weekMondayDom(dom) + '"' : '';
      var attrs = selectable || state.windowAnchor === dom
        ? ' data-action="window-pick" data-dom="' + dom + '"' + weekAttr
        : ' disabled';
      cells += '<button type="button" class="' + cls.join(" ") + '"' + attrs + '>' + dom + '</button>';
    }

    return (
      '<div class="wcal">' +
        '<div class="wcal-title">2026년 7월 <span class="wcal-today">오늘 ' + TODAY_DOM + '일</span></div>' +
        '<div class="wcal-grid wcal-grid--head">' + head + '</div>' +
        '<div class="wcal-grid" data-wcal-grid="1">' + cells + '</div>' +
        (state.windowAnchor !== null
          ? '<p class="wcal-note">마지막 날짜를 눌러주세요. 평일 기준 최대 5일까지 골라요.</p>'
          : '') +
        '<button type="button" class="btn wcal-confirm" data-action="window-confirm">확인</button>' +
      '</div>'
    );
  }

  // 1단계 — 회의 정보만: 제목 → 후보 날짜·소요 시간 → 내 캘린더 표시 안내 → 설명 → 참석자.
  // 응답 기한·게시 묶음은 2단계로 옮겼다(추천을 먼저 보고 정하는 게 순서에 맞아서).
  function renderComposeStep1(jiwoo) {
    var addedCount = composeCandidates().filter(isComposeAdded).length;
    var addedRows = composeCandidates().filter(isComposeAdded).map(renderAddedRow).join("");
    // 구글 캘린더 빠른 생성 문법 차용: 제목이 최상단 대형 언더라인, 시간 요소는 회색 칩 한 행.
    // 왼쪽은 아이콘 대신 텍스트 라벨 컬럼(제목·일정·참석자·설명) — 장식이 아니라 정보가 되게.
    return (
      '<div class="schedule-card compose-card">' +
        '<div class="compose-step1-col">' +
        '<div class="compose-row-icon">' +
          '<span class="compose-row-label">제목</span>' +
          '<input class="compose-title-input" id="compose-title" type="text" value="' + escapeAttr(meetingTitle()) + '" placeholder="회의 이름" aria-label="회의 이름" />' +
        '</div>' +
        '<div class="compose-row-icon">' +
          '<span class="compose-row-label">일정</span>' +
          '<div class="compose-chip-row">' +
            '<div class="compose-chip-field">' +
              '<span class="compose-chip-label">후보 날짜</span>' +
              '<div class="wcal-anchor">' +
                '<button type="button" class="compose-chip" data-action="toggle-window-picker" aria-expanded="' + state.windowPickerOpen + '" aria-label="후보 날짜">' +
                  windowLabel() + ' <span class="compose-chip-caret" aria-hidden="true">▾</span>' +
                '</button>' +
                (state.windowPickerOpen ? '<div class="wcal-popover">' + renderWindowCalendar() + '</div>' : '') +
            '</div>' +
            '</div>' +
            '<div class="compose-chip-field">' +
              '<span class="compose-chip-label">소요 시간</span>' +
              '<span class="compose-chip-wrap"><select id="compose-duration" class="compose-chip compose-chip-select" aria-label="소요 시간">' +
                [[0.5, "30분"], [1, "1시간"], [1.5, "90분"], [2, "2시간"]].map(function (opt) {
                  return '<option value="' + opt[0] + '"' + (meetingDuration() === opt[0] ? " selected" : "") + '>' + opt[1] + '</option>';
                }).join("") +
              '</select></span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="compose-row-icon">' +
          '<span class="compose-row-label">참석자</span>' +
          '<div class="compose-row-body">' +
            '<div class="compose-search-wrap">' +
              '<input class="compose-search-input" id="compose-search" type="text" value="' + escapeAttr(state.composeQuery) + '" placeholder="초대할 사람 추가" aria-label="참석자 검색" autocomplete="off" />' +
              '<div class="compose-suggestions' + (state.composeSuggestOpen ? " is-open" : "") + '" id="compose-suggestions">' + renderComposeSuggestions() + '</div>' +
            '</div>' +
            '<p class="compose-prefill-note">함께 일한 이력으로 미리 담았어요</p>' +
            '<div class="compose-list">' + renderOrganizerRow(jiwoo) + addedRows + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="compose-row-icon">' +
          '<span class="compose-row-label">설명</span>' +
          '<div class="compose-row-body">' +
            '<div class="ghost-wrap">' +
              '<div class="ghost-mirror" id="ghost-context" aria-hidden="true"></div>' +
              '<textarea class="compose-context-input" id="compose-context" rows="' + Math.max(3, (state.meetingContext || suggestedDescription()).split("\n").length) + '" placeholder="' + escapeAttr(suggestedDescription()).replace(/\n/g, '&#10;') + '" aria-label="회의 설명">' + escapeText(state.meetingContext) + '</textarea>' +
              '<button type="button" class="ghost-accept" id="ghost-accept-context" data-action="accept-description">→ 그대로 쓰기</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '</div>' +
        '<div class="compose-footer">' +
          '<button class="btn compose-send-btn" data-action="compose-next"' + (addedCount === 0 ? " disabled" : "") + '>제안 시간 보기</button>' +
        '</div>' +
      '</div>'
    );
  }

  // 2단계 — 제안 시간을 확인·조정하고 보낸다: 컴팩트 카드(좌) + 주간 격자(우) → 응답 기한 → 게시 묶음.
  function renderComposeStep2(jiwoo) {
    var featured = currentFeatured();
    return (
      '<div class="schedule-card compose-card">' +
        '<div class="compose-step2-top">' +
          '<p class="compose-step2-hint">참석자들의 캘린더와 미리 표시해 둔 피하고 싶은 시간으로 계산했어요. 응답을 받으면 더 정확해져요.</p>' +
        '</div>' +
        '<div class="compose-step2-layout">' +
          '<div class="compose-decide-col">' +
            '<div class="compose-chip-field">' +
              '<span class="compose-chip-label">응답 기한</span>' +
              '<span class="compose-chip-wrap"><select id="compose-replyby" class="compose-chip compose-chip-select" aria-label="응답 기한">' +
                ["오늘 18시", "내일 12시", "내일 18시", "모레 12시"].map(function (opt) {
                  return '<option value="' + opt + '"' + (state.replyBy === opt ? " selected" : "") + '>' + opt + '까지 받기</option>';
                }).join("") +
              '</select></span>' +
            '</div>' +
            '<div class="recommend-list compose-pick-list">' + renderComposePickCards() + '</div>' +
          '</div>' +
          '<section class="panel" aria-label="주간 격자">' +
            '<div class="legend legend-mini"><span class="legend-swatch is-viable" aria-hidden="true"></span>가능한 시간</div>' +
            '<div class="schedule-grid" style="--day-cols: ' + activeDays().length + '">' + renderScheduleGrid(featured, { pickAction: "compose-pick-slot" }) + '</div>' +
          '</section>' +
        '</div>' +
        '<div class="compose-publish compose-publish-wide' + (state.postToChannel ? '' : ' is-off') + '">' +
          '<label class="compose-publish-toggle">' +
            '<input type="checkbox" id="post-to-channel"' + (state.postToChannel ? ' checked' : '') + ' /> 채널에 보내기' +
          '</label>' +
          (state.postToChannel ? '<div class="compose-publish-grid">' +
            '<select id="compose-channel" class="fact-select compose-channel-select" aria-label="보낼 채널">' +
              ["pm-admin-dashboard", "공지", "제품실험", "데이터지원"].map(function (ch) {
                return '<option value="' + ch + '"' + (state.channelName === ch ? " selected" : "") + '>#' + ch + '</option>';
              }).join("") +
            '</select>' +
            '<div class="ghost-wrap">' +
              '<div class="ghost-mirror" id="ghost-message" aria-hidden="true"></div>' +
              '<textarea class="compose-message-input" id="compose-message" rows="' + textareaRows(state.composeMessage || suggestedMessage(), 3) + '" aria-label="채널에 보낼 메시지" placeholder="' + escapeAttr(suggestedMessage()).replace(/\n/g, '&#10;') + '">' + escapeText(state.composeMessage) + '</textarea>' +
              '<button type="button" class="ghost-accept" id="ghost-accept-message" data-action="compose-accept-message">→ 그대로 쓰기</button>' +
            '</div>' +
          '</div>' : '') +
        '</div>' +
        '<div class="compose-footer">' +
          '<button type="button" class="btn btn-secondary" data-action="compose-back">이전으로</button>' +
          '<button class="btn compose-send-btn" data-action="post-compose"' + (state.tentativeSlotId ? '' : ' disabled') + '>' + (state.postToChannel ? '제안 보내기' : '초대 보내기') + '</button>' +
        '</div>' +
      '</div>'
    );
  }

  // 2단계 좌측 — compare 화면의 renderRecommendCards를 컴팩트하게 축약한 것.
  // 카드 전체가 클릭 타깃(중첩 button 금지 — 안쪽은 span만).
  // 이 화면의 주인공은 '보낼 제안 하나' — 선택된 제안만 카드로, 나머지는 한 줄 대안.
  // 순위 번호는 격자 뱃지가 이미 말하므로 여기선 뺀다(밀도 축소).
  // 후보 카드는 위계 동등 — 선택(보낼 제안)만 레이어 필로 따라온다.
  // 격자에서 30분 단위 등 카드 밖 시각을 골랐으면 그 슬롯을 목록 맨 위에 얹는다.
  function renderComposePickCards() {
    // 기본 선택 없음 — 보낼 제안은 주최자가 직접 고른다 (도구는 후보만 내민다)
    var tentativeId = state.tentativeSlotId || null;
    var cards = orderedCards().slice();
    var inList = cards.some(function (card) { return card.slot.id === tentativeId; });
    if (tentativeId && !inList) {
      cards.unshift({ slot: slotById(tentativeId) });
    }
    return cards.map(function (card) {
      var slot = card.slot;
      var selected = slot.id === tentativeId;
      var count = slot.totalAvailable === activePeople().length
        ? activePeople().length + '명 모두 가능'
        : slot.totalAvailable + '/' + activePeople().length + '명 가능';
      return (
        '<button type="button" class="recommend-card compose-pick-card' + (selected ? ' is-selected' : '') + '" data-action="compose-pick-slot" data-slot-id="' + slot.id + '" aria-pressed="' + String(selected) + '">' +
          '<span class="compose-pick-head">' +
            '<span class="card-time">' + displayTime(slot) + '</span>' +
            (selected ? '<span class="compose-pick-flag">제안 시간</span>' : '') +
          '</span>' +
          '<span class="compose-main-count">' + count + '</span>' +
        '</button>'
      );
    }).join("");
  }

  function renderOrganizerRow(jiwoo) {
    return (
      '<div class="compose-row is-organizer">' +
        personIdentityBlock(jiwoo, "required") +
        '<div class="compose-row-controls">' +
          '<span class="organizer-cap">필수</span>' +
          '<span class="compose-remove-btn" aria-hidden="true" style="visibility:hidden">×</span>' +
        '</div>' +
      '</div>'
    );
  }

  function renderCandidateRow(person) {
    // 드롭다운 관례: 행 전체가 클릭 대상, 누르면 곧바로 추가된다
    var reason = suggestReason[person.id];
    return (
      '<button type="button" class="compose-row compose-suggest-row" data-action="compose-add" data-person-id="' + person.id + '" aria-label="' + person.name + ' 참석자로 추가">' +
        personIdentityBlock(person, effectiveAttendance(person)) +
        (reason ? '<span class="compose-evidence-chip">' + reason + '</span>' : '') +
      '</button>'
    );
  }

  function renderAddedRow(person) {
    var attendance = effectiveAttendance(person);
    return (
      '<div class="compose-row is-added">' +
        personIdentityBlock(person, attendance, true) +
        '<div class="compose-row-controls">' +
          '<div class="compose-segmented" role="group" aria-label="' + person.name + ' 참석 구분">' +
            '<button type="button" class="' + (attendance === "required" ? "is-active" : "") + '" aria-pressed="' + String(attendance === "required") + '" data-action="compose-attendance" data-person-id="' + person.id + '" data-value="required">필수</button>' +
            '<button type="button" class="' + (attendance === "optional" ? "is-active" : "") + '" aria-pressed="' + String(attendance === "optional") + '" data-action="compose-attendance" data-person-id="' + person.id + '" data-value="optional">선택</button>' +
          '</div>' +
          '<button type="button" class="compose-remove-btn" data-action="compose-remove" data-person-id="' + person.id + '" aria-label="' + person.name + ' 참석자에서 제거">×</button>' +
        '</div>' +
      '</div>'
    );
  }

  // 슬랙에서 앱 카드에 곁들여 보낸 일반 메시지 텍스트 — 비워서 보냈으면 제안 문안이 그대로 나간다.
  function renderPostedMessageText() {
    var text = state.composeMessage.trim() || suggestedMessage();
    return '<p class="posted-message-text">' + escapeText(text) + '</p>';
  }

  function renderPostedCard() {
    return (
      '<div class="schedule-card">' +
        '<div class="posted-card-head">' +
          '<div>' +
            '<p class="card-kicker">회의 시간 정하기</p>' +
            '<h2>' + meetingTitle() + '</h2>' +
            renderResponseStatusLine() +
          '</div>' +
          '<button class="btn posted-cta" data-action="' + (state.posted ? 'go-confirm' : 'go-compare') + '">' + (state.posted ? '확정 내용 보기' : '추천 보기') + '</button>' +
        '</div>' +
        '<div class="meeting-facts">' +
          '<span class="fact-pill">' + durationLabel() + '</span>' +
          '<span class="fact-pill">' + windowLabel() + ' 중</span>' +
          '<span class="fact-pill">참석자 ' + activePeople().length + '명</span>' +
          (state.posted ? '<span class="fact-pill">' + state.meetingRoom + '</span>' : '') +
        '</div>' +
        (state.posted
          ? '<div class="tentative-line is-confirmed"><strong>확정 ' + displayTime(slotById(state.selectedSlotId)) + '</strong><span>' + (confirmedDiffersFromTentative() ? '보낸 제안과 달라요. 어려운 분은 알려주세요' : '참석자 모두에게 알림을 보냈어요') + '</span></div>'
          : '<div class="tentative-line"><strong>제안 시간 ' + tentativeLabel() + '</strong><span>응답이 없으면 이대로 확정돼요 · ' + state.replyBy + '까지</span></div>') +
        // 주최자도 참석자와 대칭으로 자기 캘린더 표시를 남길 수 있게 — 조용한 링크 한 줄(과설명 금지)
        '<p class="posted-mark-note"><button type="button" class="compose-note-link" data-action="open-my-marks">나도 피하고 싶은 시간 표시하기</button></p>' +
        '<div class="participant-grid">' + renderParticipantRows() + '</div>' +
        (state.posted ? '<button type="button" class="btn btn-secondary dm-ok-btn" data-action="propose-change">시간 변경 제안</button>' : '') +
      '</div>'
    );
  }

  // 주최자가 채널 카드에서 보는 응답 현황
  function renderResponseStatusLine() {
    var people = activePeople();
    if (!state.respondedReveal && !state.posted) {
      // 방금 보냈다 — 아직 아무도 안 답한 게 정직한 상태
      return '<p class="response-status-line">응답 0/' + people.length + ' · ' + state.replyBy + '까지 받아요</p>';
    }
    var waiting = unrespondedPeople();
    var responded = people.length - waiting.length;
    var text = "응답 " + responded + "/" + people.length;
    if (state.deadlinePassed && !state.posted) {
      text = "응답 마감 · " + responded + "/" + people.length + " 응답";
    } else if (waiting.length > 0) {
      text += " · " + waiting.map(function (p) { return p.name; }).join(", ") + "님 답 기다리는 중";
    } else {
      text += " · 모두 응답했어요";
    }
    return '<p class="response-status-line">' + text + '</p>';
  }

  function renderParticipantRows() {
    return activePeople().map(function (person) {
      return (
        '<div class="compose-row is-static">' +
          personIdentityBlock(person, effectiveAttendance(person)) +
        '</div>'
      );
    }).join("");
  }

  function renderInput() {
    var person = inputPersonForRoute();
    var optional = effectiveAttendance(person) === "optional";
    var optedOut = Boolean(state.inputOptOutByPerson[person.id]);
    // 참석자도 같은 데스크톱 슬랙 무대 — DM 대화가 진입점, 격자는 슬랙 모달로 열린다
    app.innerHTML =
      '<section class="screen">' +
        '<div class="screen-inner messenger-shell">' +
          '<aside class="workspace-rail" aria-label="워크스페이스">' +
            '<p class="workspace-name">Product Lab</p>' +
            '<ul class="channel-list">' +
              ["공지", "pm-admin-dashboard", "제품실험", "데이터지원"].map(function (ch) {
                var unread = ch === "공지" || ch === "제품실험";
                return '<li class="' + (unread ? "is-unread" : "") + '"><span># ' + ch + '</span></li>';
              }).join("") +
              '<li class="channel-section">다이렉트 메시지</li>' +
              '<li class="channel-app active"><span>WhenWorks</span></li>' +
            '</ul>' +
          '</aside>' +
          '<section class="channel-panel" aria-label="봇 DM">' +
            '<header class="channel-header"><h1>WhenWorks <span class="app-badge">앱</span></h1><span class="dm-header-me">' + person.name + '</span></header>' +
            '<div class="message-thread">' +
              '<p class="dm-day-divider">오늘</p>' +
              renderDmInviteMessage(person, optional) +
              (state.inputStage === "done"
                ? '<article class="message">' +
                    '<div class="avatar app-avatar" aria-hidden="true">W</div>' +
                    '<div>' +
                      '<div class="message-meta"><span class="message-author">WhenWorks</span><span class="app-badge">앱</span><span class="message-time">방금</span></div>' +
                      '<p class="bot-intro-text">' + ((state.answerCount || 1) > 1 ? '답변을 바꿨어요. 바뀐 응답으로 반영할게요.' : '응답 받았어요. 시간이 정해지면 여기로 알려드릴게요.') + '</p>' +
                    '</div>' +
                  '</article>'
                : '') +
            '</div>' +
          '</section>' +
        '</div>' +
      '</section>' +
      (state.inputStage === "grid" ? renderInputGridModal(person, optional, optedOut) : '') +
      renderToast();
  }

  function renderDmInviteMessage(person, optional) {
    return (
      '<article class="message">' +
        '<div class="avatar app-avatar" aria-hidden="true">W</div>' +
        '<div>' +
          '<div class="message-meta"><span class="message-author">WhenWorks</span><span class="app-badge">앱</span><span class="message-time">오전 10:12</span></div>' +
          '<p class="bot-intro-text">' + getPerson("jiwoo").name + '님이 회의에 초대했어요.</p>' +
          '<div class="schedule-card dm-card">' +
            '<h2>' + meetingTitle() + '</h2>' +
            '<div class="meeting-facts">' +
              '<span class="fact-pill">' + durationLabel() + '</span>' +
              '<span class="fact-pill">' + (effectiveAttendance(person) === "required" ? "필수 참석" : "선택 참석") + '</span>' +
            '</div>' +
            '<div class="tentative-line"><strong>제안 시간 ' + tentativeLabel() + '</strong><span>응답이 없으면 이대로 확정돼요 · ' + state.replyBy + '까지</span></div>' +
            (state.inputStage === "done"
              ? '<div class="dm-answered is-ok">' +
                  '<p class="dm-answered-check">✓ ' + (inputMarkCount(person) > 0 ? '피하고 싶은 시간 ' + inputMarkCount(person) + '개를 표시했어요' : '언제든 괜찮다고 답했어요') + '</p>' +
                  '<button type="button" class="btn btn-secondary btn-full" data-action="dm-change-answer">답변 바꾸기</button>' +
                '</div>'
              : state.declined
                ? '<div class="dm-answered">' +
                    '<p class="dm-answered-text">참석 어려움으로 답했어요. 기한 전까지 언제든 바꿀 수 있어요.</p>' +
                    '<button type="button" class="btn btn-secondary btn-full" data-action="dm-change-answer">답변 바꾸기</button>' +
                  '</div>'
                : '<button class="btn btn-full" data-action="dm-open-grid">피하고 싶은 시간 표시하기</button>' +
                  '<button type="button" class="btn btn-secondary btn-full dm-ok-btn" data-action="dm-all-ok">' + windowLabel() + ' 언제든 괜찮아요</button>' +
                  '<button type="button" class="dm-decline-link" data-action="dm-decline">이 회의 참석이 어려워요</button>') +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  // 내가 칠한 피하고 싶은 시간 수 — 응답 상태 카드가 '뭐라고 답했는지'를 말하게 한다
  function inputMarkCount(person) {
    // 기본 점심 ×는 '이번 응답'이 아니라 상시 표시라 세지 않는다 —
    // 안 그러면 '언제든 괜찮아요'를 눌러도 5개 표시로 읽힌다
    var n = 0;
    activeDays().forEach(function (day) {
      slotHours.forEach(function (hour) {
        var key = slotId(day, hour);
        if (lunchDefaultSoft(person, key, hour)) {
          return;
        }
        if (softSelectedForInput(person, key)) {
          n += 1;
        }
      });
    });
    return n;
  }

  function renderInputGridModal(person, optional, optedOut) {
    return (
      '<div class="slack-modal-overlay" data-action="close-grid-backdrop">' +
        '<div class="slack-modal is-input" role="dialog" aria-modal="true" aria-label="' + meetingTitle() + ' 피하고 싶은 시간 표시">' +
          '<header class="slack-modal-head">' +
            '<h2>' + meetingTitle() + '</h2>' +
            '<button type="button" class="slack-modal-close" data-action="grid-back-dm" aria-label="닫기">✕</button>' +
          '</header>' +
          '<div class="slack-modal-body">' +
            '<p class="input-tentative">어려운 시간을 눌러서 표시해주세요. 누가 표시했는지는 주최자에게 보이지 않아요.</p>' +
            (optional ? '<p class="input-guidance">선택 참석이라 어려우면 \'참석 어려움\'을 눌러도 돼요. 정해지면 결과를 공유해요</p>' : '') +
            (optional ? renderOptOutControl(person, optedOut) : '') +
            '<div class="mini-week-grid ' + (optedOut ? "is-disabled" : "") + '" style="--day-cols: ' + activeDays().length + '" aria-label="주간 입력 격자">' + renderMiniGrid(person, optedOut) + '</div>' +
          '</div>' +
          '<div class="compose-footer compose-footer-split">' +
            '<button type="button" class="dm-decline-link" data-action="dm-decline">이 회의 참석이 어려워요</button>' +
            '<button class="btn compose-send-btn" data-action="submit-response">제출</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderOptOutControl(person, optedOut) {
    return (
      '<div class="opt-out-control">' +
        '<button class="btn btn-secondary opt-out-button ' + (optedOut ? "is-active" : "") + '" data-action="toggle-opt-out" aria-pressed="' + String(optedOut) + '">참석 어려움</button>' +
        (optedOut ? '<p class="opt-out-message">정해지면 결과를 공유해요</p>' : '') +
      '</div>'
    );
  }

  function renderMiniGrid(person, optedOut) {
    var days = activeDays();
    // 제안 시간 슬롯을 격자에 직접 표시 (내 캘린더 표시 모달에는 특정 제안이 없으므로 제외)
    var proposalId = state.myMarksOpen ? null : (tentativeSlot() ? tentativeSlot().id : null);
    var html = '<div class="mini-head"></div>';
    days.forEach(function (day) {
      html += '<div class="mini-head">' + day + '<span class="grid-date">' + dayDate(day) + '</span></div>';
    });

    slotHours.forEach(function (hour) {
      html += '<div class="mini-time"><span>' + hour + '</span></div>';
      days.forEach(function (day) {
        var id = slotId(day, hour);
        // 내 캘린더의 일정 — 본인 화면이라 비공개 하드(예: 학원)도 제목 노출 OK
        var hardInfo = participantHardForInput(person, day, hour);
        var hard = Boolean(hardInfo);
        // 캘린더 일정만 이름을 가진다(title). 등록한 상시 제약(label만)은 사유를 밝히지 않고
        // 안 되는 시간으로만 표시 — 다른 막힌 칸과 똑같이 ×.
        var hardTitle = hard ? (hardInfo.title || "") : "";
        var soft = !hard && !optedOut && softSelectedForInput(person, id);
        // 미리 칠해진 표시(점심·상시)는 이번 응답으로 세지 않으니 새 표시와 톤을 가른다 —
        // 안 가르면 '1개를 표시했어요'와 화면의 칠해진 칸 수가 어긋나 보인다
        var presetSoft = soft && lunchDefaultSoft(person, id, hour);
        var presetIsLunch = presetSoft && data.meeting.workHours.lunch.indexOf(hour) >= 0;
        var video = !hard && conditionalStatus(person, day);
        var disabled = hard || optedOut;
        var label = day + "요일 " + hour + "시, " + (hard ? (hardTitle ? hardTitle + " 일정이 있어요" : "안 되는 시간") : optedOut ? "비활성화된 시간" : presetSoft ? (presetIsLunch ? "조직 점심시간, 미리 표시됨" : "평소 피하는 시간, 미리 표시됨") : soft ? "피하고 싶은 시간" : "가능한 시간");
        if (video) {
          label += ", 화상 참여 가능";
        }
        var softTitle = presetSoft
          ? (presetIsLunch ? "조직 점심시간 · 눌러서 바꿀 수 있어요" : "평소 피하는 시간 · 눌러서 바꿀 수 있어요")
          : "표시한 시간이에요";
        var isProposal = id === proposalId;
        html +=
          '<button class="mini-slot' + (hard ? " is-hard" : "") + (hard && !hardTitle ? " is-blocked" : "") + (soft ? " is-soft" : "") + (presetSoft ? " is-preset" : "") + (video ? " has-video" : "") + (isProposal ? " is-proposal" : "") + '" ' +
          'data-action="toggle-soft" data-slot-id="' + id + '" aria-label="' + label + (isProposal ? ", 제안 시간" : "") + '" ' + (disabled ? "disabled" : "") + (soft ? ' title="' + softTitle + '"' : "") + '>' +
            (isProposal ? '<span class="mini-proposal-tag">제안 시간</span>' : '') +
            (hardTitle ? '<span class="mini-slot-label">' + escapeText(hardTitle) + '</span>' : '') +
            (video ? '<span class="mini-video-badge" aria-hidden="true"></span>' : '') +
          '</button>';
      });
    });

    return html;
  }

  function renderCompare() {
    state.respondedReveal = true;
    var featured = currentFeatured();
    if (!state.activeSlotId) {
      state.activeSlotId = featured.recommended.id;
    }
    app.innerHTML =
      '<div class="dialog-backdrop" aria-hidden="true" inert>' + entryMarkup() + '</div>' +
      '<div class="slack-modal-overlay">' +
        '<div class="slack-modal is-compose is-wide" role="dialog" aria-modal="true" aria-label="' + meetingTitle() + ' 시간 확정하기">' +
        '<header class="slack-modal-head">' +
          '<h2>' + meetingTitle() + ' 시간 확정하기</h2>' +
          '<button type="button" class="slack-modal-close" data-action="go-entry" aria-label="닫기">✕</button>' +
        '</header>' +
        '<div class="slack-modal-body">' +
        '<div class="screen-inner">' +
          '<header class="compare-header">' +
            '<div>' +
              renderResponseLine() +
            '</div>' +
          '</header>' +
          '<div class="desktop-layout">' +
            '<aside class="decide-col">' +
              renderSortToggle() +
              '<div class="recommend-list">' + renderRecommendCards() + '</div>' +
            '</aside>' +
            '<section class="panel" aria-label="주간 격자">' +
              '<div class="legend legend-mini"><span class="legend-swatch is-viable" aria-hidden="true"></span>가능한 시간</div>' +
              '<div class="schedule-grid" style="--day-cols: ' + activeDays().length + '">' + renderScheduleGrid(featured) + '</div>' +
            '</section>' +
          '</div>' +
        '</div>' +
        '</div>' +
        '<div class="compose-footer">' +
          '<button class="btn compose-send-btn" data-action="go-confirm"' + (state.selectedSlotId ? '' : ' disabled') + '>미팅 확정</button>' +
        '</div>' +
        '</div>' +
      '</div>' +
      renderToast();
  }

  // 미응답은 비공개 제약이 아니라 진행 상태라서 이름을 보여도 된다 (자기 사례 000-6).
  // 미응답자의 시간 정보는 캘린더로만 아는 것 — 팝업에서 점선(미확정 문법)으로 표시.
  function unrespondedPeople() {
    return activePeople().filter(function (person) {
      return person.responded === false;
    });
  }

  function renderResponseLine() {
    var sent = '<strong class="response-sent">보낸 제안 ' + tentativeLabel() + '</strong>';
    var waiting = unrespondedPeople();
    if (waiting.length === 0) {
      return '<p class="response-line">' + sent + ' · ' + activePeople().length + '명 모두 응답했어요</p>';
    }
    var respondedCount = activePeople().length - waiting.length;
    var waitingNames = waiting.map(function (person) {
      return person.name + "님";
    }).join(", ");
    return (
      '<p class="response-line">' +
        sent + ' · ' + respondedCount + '명 응답 · ' + waitingNames + '은 응답이 없어 캘린더 기준이에요' +
      '</p>'
    );
  }

  function renderSortToggle() {
    return (
      '<div class="sort-toggle-wrap">' +
        '<div class="sort-toggle" role="group" aria-label="추천 정렬">' +
          '<button class="' + (state.sortMode === "recommended" ? "is-active" : "") + '" aria-pressed="' + String(state.sortMode === "recommended") + '" data-action="sort-mode" data-sort-mode="recommended">추천순</button>' +
          '<button class="' + (state.sortMode === "availability" ? "is-active" : "") + '" aria-pressed="' + String(state.sortMode === "availability") + '" data-action="sort-mode" data-sort-mode="availability">가능한 사람 많은 순</button>' +
        '</div>' +
        '<button type="button" class="rank-info-btn" data-action="toggle-rank-info" aria-expanded="' + String(Boolean(state.rankInfoOpen)) + '" aria-label="순위 기준 설명">i</button>' +
        (state.rankInfoOpen
          ? '<span class="rank-info-pop" role="note">' +
              '<strong>순위는 이렇게 매겨요</strong>' +
              '<span>필수 참석자가 안 되는 시간은 후보에서 빠져요.</span>' +
              '<span>남은 후보는 캘린더 충돌과 피하고 싶다는 표시가 적은 순서예요. 모두 가능한 시간이라도 부담 표시가 있으면 순위가 내려가요.</span>' +
              '<span>인원수로 보고 싶으면 \'가능한 사람 많은 순\'으로 바꿀 수 있어요.</span>' +
            '</span>'
          : '') +
      '</div>'
    );
  }

  function renderLegend() {
    return (
      '<div class="legend" role="group" aria-label="격자 범례">' +

        '<span class="legend-item"><span class="legend-ramp" aria-hidden="true"><span class="is-low"></span><span class="is-mid"></span><span class="is-high"></span></span>추천</span>' +
        '<span class="legend-item"><span class="legend-dot" aria-hidden="true"></span>피하고 싶다는 표시 있음</span>' +
      '</div>'
    );
  }

  // opts.pickAction — compose 2단계 전용 모드. 지정하면 셀·팝오버 버튼이 select-grid-slot/
  // choose-slot 대신 이 액션으로 렌더된다(보낼 제안 선택 전용, confirm 라우트로 안 감).
  // opts가 없으면(compare 화면) 기존 동작 그대로 — 1픽셀도 안 바뀐다.
  function renderScheduleGrid(featured, opts) {
    var pickAction = (opts && opts.pickAction) || "select-grid-slot";
    var composeMode = Boolean(opts && opts.pickAction);
    // compose(보내기 전) 모드: 주최자가 고르기 전엔 제안 시간이 없다. 그 외 화면은 폴백 유지
    var tentativeId = composeMode
      ? state.tentativeSlotId
      : (state.tentativeSlotId || featured.recommended.id);
    // 현재 정렬 기준의 1~3위를 격자에도 찍는다 — 뱃지를 뺐더니 카드와 격자가
    // 이어져 보이지 않는다는 실사용 피드백(006)으로 복원. 번호 언어는 카드와 동일.
    var rankOrderIds = cardOrder(state.sortMode).map(function (slot) { return slot.id; });
    var days = activeDays();
    var html = '<div class="grid-corner">시간</div>';
    days.forEach(function (day) {
      html += '<div class="grid-day">' + day + '<span class="grid-date">' + dayDate(day) + '</span></div>';
    });

    slotHours.forEach(function (hour) {
      html += '<div class="grid-time"><span>' + String(hour).padStart(2, "0") + ':00</span></div>';
      days.forEach(function (day) {
        var slot = slotById(slotId(day, hour));
        var selected = composeMode ? tentativeId === slot.id : state.selectedSlotId === slot.id;
        var recommended = slot.id === featured.recommended.id;
        var active = state.activeSlotId === slot.id;
        var open = state.openSlotId === slot.id;
        var unavailable = isUnavailableSlot(slot);
        // 격자 표면에도 부담 신호를 올린다 — 호버/팝업 뒤에만 숨기면
        // When2meet류 여유 히트맵과 첫인상이 같아져 이 도구의 차별점(소프트·비공개
        // 부담 반영)이 안 보인다. 인원수·이름은 여전히 절대 노출하지 않는다(k-익명).
        // 세모는 본인이 직접 남긴 표시(privateSoft)만 — 추론·통념까지 그리면
        // 후보마다 전부 표시가 붙는 부조리가 된다. 약한 신호는 카드 문장의 몫.
        // 세모는 compose에서도 보여준다 — 점심·상시 표시는 응답 전에도 존재하는 정보라,
        // 숨기면 12시가 '깨끗한 후보'처럼 보여 점심에 제안하는 사고가 난다
        var privateBurden = !unavailable && slot.privateSoft.length > 0;
        // 카드와 같은 번호 언어(1·2·3순위)를 격자에도 — 카드↔격자 연결(사용성 테스트 006 P1)
        var rankIndex = rankOrderIds.indexOf(slot.id);
        // compose(현재의 제안을 고르는 중)에서만 '제안 시간' 뱃지 — 확정 화면에서는 같은 말이
        // '지금 제안되는 시간'으로 오독돼 순위만 남기고, 보낸 제안은 상태줄·카드가 말한다.
        var rankLabel = composeMode
          ? (rankIndex >= 0
              ? (rankIndex + 1) + "순위" + (slot.id === tentativeId ? " · 제안 시간" : "")
              : (slot.id === tentativeId ? "제안 시간" : null))
          : (rankIndex >= 0 ? (rankIndex + 1) + "순위" : null);
        var rankClass = composeMode && slot.id === tentativeId ? "rank-tag is-tonal" : "rank-tag";
        // 10분 단위 선택: 정시가 아닌 시각을 고르면 그 셀 안에 라인+시간 칩으로 표시
        var pick = state.customSlot && state.customSlot.day === day && Math.floor(state.customSlot.start) === hour
          ? state.customSlot
          : null;
        if (pick) {
          selected = true;
        }
        html +=
          '<div class="slot-cell availability-' + availabilityLevel(slot) + (unavailable ? " is-unavailable" : "") + (privateBurden ? " has-private-burden" : "") + (selected ? " is-selected" : "") + (recommended ? " is-recommended" : "") + (active ? " is-active" : "") + (open ? " is-open" : "") + '" ' +
          'role="button" tabindex="0" data-pick-source="cell" data-action="' + pickAction + '" data-slot-id="' + slot.id + '" aria-label="' + slotAria(slot, recommended) + '">' +
            (rankLabel ? '<span class="' + rankClass + '">' + rankLabel + '</span>' : '') +
            (pick ? '<span class="slot-pick" style="top:' + Math.round((pick.start - hour) * 100) + '%"><span class="slot-pick-chip">' + formatClock(pick.start) + '</span></span>' : '') +
            '<span class="slot-popover" role="dialog" aria-label="' + displayTime(pick || slot) + ' 상세">' + renderSlotPopover(pick || slot, open, opts) + '</span>' +
          '</div>';
      });
    });

    return html;
  }

  function slotAria(slot, recommended) {
    var parts = [displayTime(slot)];
    if (isUnavailableSlot(slot)) {
      // 하드 차단은 사유가 있으면 그대로 말한다(예: 조직 점심시간)
      parts.push(slot.blockedByHours ? blockedHoursReason(slot.start) + " — 안 돼요" : "안 돼요");
    } else {
      parts.push(slot.totalAvailable + "명 참석 가능");
      parts.push("여유 " + availabilityLevel(slot) + "단계");
    }
    if (slot.privateSoft.length > 0) {
      parts.push("피하고 싶다는 표시 있음");
    }
    if (recommended) {
      parts.push("추천");
    }
    if (state.selectedSlotId === slot.id) {
      parts.push("선택됨");
    }
    return parts.join(", ");
  }

  // Privacy display rule:
  // Calendar busy is public scheduling information, so attendee names may appear with "일정이 있어요".
  // BUT privately entered constraints (hard or soft) and inferred preferences are aggregate-only:
  // never show a person's name, or a count, beside private information anywhere (audit 012-1).
  // 팝업은 기호·배지를 해독하지 않아도 읽히도록 평문 문장으로만 구성한다 (019 평문화).
  // 정상 참석자는 아바타만, 예외(미응답/공개 일정 충돌/화상)는 이름 + 문장으로 각자 한 줄.
  function slotPeopleStates(slot) {
    return activePeople().map(function (person) {
      var away = slot.busyConflicts.some(function (item) {
        return item.person.id === person.id && !item.private;
      });
      var unresponded = !away && person.responded === false;
      return { person: person, away: away, unresponded: unresponded };
    });
  }

  function renderSlotPopover(slot, isOpen, opts) {
    // 아바타 회색 처리 문법 — 불참(회색 흐림)·미응답(반투명)은 범례 없이 읽힌다.
    // 이름별 설명 문장은 과설명이라 쓰지 않는다.
    var chooseAction = (opts && opts.pickAction) || "choose-slot";
    var states = slotPeopleStates(slot);
    var avatars = states.map(function (item) {
      var cls = "slot-avatar " + (effectiveAttendance(item.person) === "required" ? "is-required" : "is-optional");
      var sr = item.person.name + " 참석 가능";
      if (item.away) {
        cls += " is-away";
        sr = item.person.name + " 못 옴";
      } else if (item.unresponded) {
        cls += " is-unresponded";
        sr = item.person.name + " 아직 응답 전 — 캘린더 기준";
      }
      return (
        '<span class="' + cls + '" title="' + item.person.name + '"' + avatarVars(item.person) + '>' +
          '<span aria-hidden="true">' + initials(item.person.name) + '</span>' +
          '<span class="sr-only">' + sr + '</span>' +
        '</span>'
      );
    }).join("");
    return (
      '<strong class="popover-title">' + slotStatusTitle(slot) + '</strong>' +
      '<span class="popover-avatar-stack">' + avatars + '</span>' +
      // 안 되는 시간엔 회의실을 안내할 이유가 없다
      (isUnavailableSlot(slot) ? '' : '<span class="popover-room">' + ICONS.pin + ' ' + roomForSlot(slot) + ' 예약 가능</span>') +
      (slot.privateSoft.length > 0 ? '<span class="popover-note">피하고 싶다는 표시가 있어요</span>' : '') +
      ''
    );
  }

  function slotStatusTitle(slot) {
    return displayTime(slot) + " · " + slot.totalAvailable + "명 참석 가능";
  }

  function renderRecommendCards() {
    return orderedCards().map(function (card, index) {
      var slot = card.slot;
      var isOpen = state.openCardId === card.key;
      var selected = state.selectedSlotId === slot.id;
      var rank = state.sortMode === "availability" ? card.availableRank : card.recommendedRank;
      return (
        '<article class="recommend-card ' + (selected ? "is-selected" : "") + '" data-card-id="' + slot.id + '">' +
          '<button class="card-summary" data-action="toggle-card" data-card-id="' + card.key + '" data-slot-id="' + slot.id + '" aria-expanded="' + String(isOpen) + '">' +
            '<span class="rank-label">' + rank + (slot.id === tentativeSlot().id ? '<span class="card-sent-flag">보낸 제안</span>' : '') + '</span>' +
            '<span class="card-time">' + displayTime(slot) + '</span>' +
            '<span class="card-copy">' + card.copy + '</span>' +
          '</button>' +
          '<div class="metric-row">' +
            '<span class="metric-pill">필수 ' + slot.requiredAvailable + '/' + requiredPeople().length + '</span>' +
            '<span class="metric-pill">선택 ' + slot.optionalAvailable + '/' + optionalPeople().length + '</span>' +
            (slot.conditional.length ? '<span class="metric-pill"><span class="video-icon" aria-hidden="true"></span>화상</span>' : '') +
            '<span class="metric-pill metric-room">' + ICONS.pin + ' ' + roomForSlot(slot) + '</span>' +
          '</div>' +
          (isOpen ? '<p class="recommend-detail">' + card.detail + '</p>' : '') +
          (selected ? renderCardAttendees(slot) : '') +
        '</article>'
      );
    }).join("");
  }

  // 선택된 카드에만 참석 가능한 사람을 아바타로 보여준다 — 정보는 결정 이후에나 필요하다(과설명 방지)
  function renderCardAttendees(slot) {
    var going = slotPeopleStates(slot).filter(function (item) {
      return !item.away;
    });
    return '<span class="card-attendees">' + going.map(function (item) {
      return '<span class="card-avatar' + (item.unresponded ? ' is-unresponded' : '') + '" title="' + item.person.name + (item.unresponded ? ' · 응답 전 — 캘린더 기준' : '') + '"' + avatarVars(item.person) + '>' + initials(item.person.name) + '</span>';
    }).join('') + '</span>';
  }

  function renderConfirm() {
    var slot = slotById(state.selectedSlotId || currentFeatured().recommended.id);
    // 추천 다이얼로그에서 이어지는 같은 저니 — 여기만 페이지로 튀지 않게 같은 다이얼로그 문법.
    // 작성 1단계의 왼쪽 라벨 컬럼 문법(compose-row-icon/compose-row-label)을 그대로 써서
    // '읽기 전용 요약'으로 보이게 한다(이중 프레임·초록 뱃지 등 옛 스타일 폐기).
    app.innerHTML =
      '<div class="dialog-backdrop" aria-hidden="true" inert>' + entryMarkup() + '</div>' +
      '<div class="slack-modal-overlay">' +
        '<div class="slack-modal is-compose" role="dialog" aria-modal="true" aria-label="확정 전 확인">' +
        '<header class="slack-modal-head">' +
          '<button type="button" class="slack-modal-back" data-action="go-compare" aria-label="추천으로">←</button>' +
          '<h2>이 시간으로 정할까요?</h2>' +
          '<button type="button" class="slack-modal-close" data-action="go-entry" aria-label="닫기">✕</button>' +
        '</header>' +
        '<div class="slack-modal-body">' +
        '<div class="compose-step1-col confirm-single">' +
          '<div class="compose-row-icon">' +
            '<span class="compose-row-label">시간</span>' +
            '<div class="compose-row-body confirm-time-body">' +
              '<strong class="confirm-time-value">' + displayTime(slot) + '</strong>' +
              '<span class="confirm-time-meta">' + durationLabel() + ' · ' + meetingTitle() + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="compose-row-icon">' +
            '<span class="compose-row-label">회의실</span>' +
            '<div class="compose-row-body">' +
              '<select id="confirm-room" class="confirm-room-select" aria-label="회의실">' +
                ["미팅룸 6", "미팅룸 4", "포커스룸 A", "화상으로 진행"].map(function (room) {
                  return '<option value="' + room + '"' + (state.meetingRoom === room ? " selected" : "") + '>' + room + '</option>';
                }).join("") +
              '</select>' +
            '</div>' +
          '</div>' +
          (hasPrivateBurden(slot) ? '<p class="confirm-soft-note">이 시간은 피하고 싶다는 표시가 있어요. 누가 표시했는지는 보이지 않아요.</p>' : '') +
          // 보낸 잠정안과 지금 확정하려는 시간이 다르면 — 확정 뒤 재확인이 필요하다는 걸 미리 말한다
          (tentativeSlot().id !== slot.id ? '<p class="confirm-soft-note">보낸 제안(' + displayTime(tentativeSlot()) + ')과 달라요. 확정하면 바뀐 시간으로 한 번 더 물어봐요.</p>' : '') +
          '<div class="compose-row-icon">' +
            '<span class="compose-row-label">참석자</span>' +
            '<div class="compose-row-body">' + renderConfirmAttendeeSection(slot) + '</div>' +
          '</div>' +
          '<div class="compose-row-icon">' +
            '<span class="compose-row-label">알림</span>' +
            '<div class="compose-row-body">' + renderConfirmPreview(slot) + '</div>' +
          '</div>' +
        '</div>' +
        '</div>' +
        '<div class="compose-footer">' +
          '<button class="btn compose-send-btn" data-action="post-confirm"' + (state.posted ? " disabled" : "") + '>' + (state.posted ? "확정됨 ✓" : "확정하고 #" + state.channelName + " 채널에 알리기") + '</button>' +
        '</div>' +
        '</div>' +
      '</div>';
  }

  // 참석자 행 — 요약 한 줄(전원/N명 가능, 미응답 보정) + 예외자(미응답·불참)만 개별 행.
  // 정상 참석자는 요약이 이미 셌으니 다시 나열하지 않는다(한 사실은 한 번만).
  function renderConfirmAttendeeSection(slot) {
    if (hasPrivateHardConflict(slot)) {
      // 비공개 하드 제약이 있는 슬롯은 사람별 상태를 그리지 않는다 — 이름 결합 금지
      return '<p class="privacy-note">이 시간은 비공개 사정 때문에 확정하기 어려워요. 다른 시간을 골라주세요.</p>';
    }
    var states = slotPeopleStates(slot);
    var total = states.length;
    var going = states.filter(function (item) {
      return !item.away;
    });
    var unresponded = states.filter(function (item) {
      return item.unresponded;
    });
    var summary = going.length === total
      ? total + "명 모두 참석 가능해요."
      : going.length + "명 참석 가능해요.";
    if (unresponded.length > 0) {
      summary += " " + unresponded.length + "명은 응답 전이라 캘린더 기준이에요.";
    }
    var exceptions = states.filter(function (item) {
      return item.away || item.unresponded;
    });
    return (
      '<p class="confirm-attendee-summary">' + summary + '</p>' +
      (exceptions.length
        ? '<div class="compose-list confirm-exceptions">' + exceptions.map(renderConfirmExceptionRow).join("") + '</div>'
        : '')
    );
  }

  // 예외(미응답/불참) 개별 행 — 작성 1단계 참석자 행과 같은 아나토미(아바타 + 이름/설명),
  // 오른쪽은 초록 뱃지 대신 중립 텍스트(참석 여부를 단정하지 않는다, F-004)
  function renderConfirmExceptionRow(item) {
    var person = item.person;
    var description, statusText;
    if (item.unresponded) {
      description = "응답 전이라 캘린더 기준이에요";
      statusText = "캘린더로는 가능";
    } else if (effectiveAttendance(person) === "optional") {
      description = "정해지면 결과를 공유해요";
      statusText = "결과 공유";
    } else {
      description = "다른 시간이 필요해요";
      statusText = "다른 시간 필요";
    }
    return (
      '<div class="compose-row confirm-attendee-row">' +
        '<span class="avatar" aria-hidden="true"' + avatarVars(person) + '>' + initials(person.name) + '</span>' +
        '<div class="compose-row-main">' +
          '<span class="compose-row-line"><span class="compose-row-name">' + person.name + '</span></span>' +
          '<span class="compose-row-role">' + description + '</span>' +
        '</div>' +
        '<span class="confirm-attendee-status">' + statusText + '</span>' +
      '</div>'
    );
  }

  // 확정하면 채널에 올라갈 내용 미리보기 — 확정 전에 무엇이 알림으로 나가는지 보여준다
  function renderConfirmPreview(slot) {
    return (
      '<div class="confirm-preview">' +
        '<p><strong>확정 · ' + meetingTitle() + '</strong></p>' +
        '<p>' + displayTime(slot) + ' · ' + state.meetingRoom + ' · #' + state.channelName + ' 채널에 알림이 가요</p>' +
      '</div>'
    );
  }

  function captureCardRects() {
    var rects = {};
    if (!app.querySelectorAll) {
      return rects;
    }
    app.querySelectorAll("[data-card-id]").forEach(function (element) {
      rects[element.getAttribute("data-card-id")] = element.getBoundingClientRect();
    });
    return rects;
  }

  function animateCardReorder(previousRects) {
    if (!app.querySelectorAll || !window.requestAnimationFrame) {
      return;
    }
    window.requestAnimationFrame(function () {
      app.querySelectorAll("[data-card-id]").forEach(function (element) {
        var id = element.getAttribute("data-card-id");
        var before = previousRects[id];
        if (!before) {
          return;
        }
        var after = element.getBoundingClientRect();
        var dx = before.left - after.left;
        var dy = before.top - after.top;
        if (!dx && !dy) {
          return;
        }
        element.animate(
          [
            { transform: "translate(" + dx + "px, " + dy + "px)", opacity: 0.82 },
            { transform: "translate(0, 0)", opacity: 1 }
          ],
          {
            // 모션 사다리(120/200/320ms) 안에서 최댓값 — 브리프 규율과 일치
            duration: 320,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)"
          }
        );
      });
    });
  }

  // 입력 제출 피드백 토스트 — 2.5초 노출 후 opacity 트랜지션으로 사라짐
  function scheduleToastDismiss() {
    if (typeof window.setTimeout !== "function") {
      return;
    }
    window.setTimeout(function () {
      state.toastFading = true;
      render();
      window.setTimeout(function () {
        state.toastVisible = false;
        state.toastFading = false;
        render();
      }, 200);
    }, 2500);
  }

  function renderToast() {
    if (!state.toastVisible) {
      return "";
    }
    return (
      '<div class="submit-toast-layer" aria-live="polite">' +
        '<div class="submit-toast' + (state.toastFading ? " is-fading" : "") + '">' + state.toastText + '</div>' +
      '</div>'
    );
  }

  app.addEventListener("change", function (event) {
    var sel = event.target;
    if (sel && sel.id === "post-to-channel") {
      state.postToChannel = sel.checked;
      render();
      return;
    }
    if (sel && sel.id === "compose-replyby") {
      state.replyBy = sel.value;
      return;
    }
    if (sel && sel.id === "compose-channel") {
      state.channelName = sel.value;
      return;
    }
    if (sel && sel.id === "compose-duration") {
      state.durationHours = parseFloat(sel.value);
      render();
      return;
    }
    if (sel && sel.id === "confirm-room") {
      state.meetingRoom = sel.value;
      return;
    }
  });

  app.addEventListener("input", function (event) {
    var field = event.target;
    if (!field || !field.id) {
      return;
    }
    if (field.id === "compose-title") {
      state.meetingTitle = field.value;
      syncComposeMessagePlaceholder();
      return;
    }
    if (field.id === "compose-context") {
      state.meetingContext = field.value;
      syncGhosts();
      syncComposeMessagePlaceholder();
      return;
    }
    if (field.id === "compose-context" || field.id === "compose-message") {
      syncAcceptChips();
    }
    if (field.id === "compose-message") {
      // 직접 타이핑 = 자기 글. placeholder(제안 문안)는 브라우저가 알아서 숨긴다.
      state.composeMessage = field.value;
      syncGhosts();
      return;
    }
    if (field.id === "compose-search") {
      state.composeQuery = field.value;
      var box = document.getElementById("compose-suggestions");
      if (box) {
        box.innerHTML = renderComposeSuggestions();
      }
    }
  });

  // 제목·맥락이 바뀌면 제안 문안(유령 글자)만 새로 만든다 — value는 절대 건드리지 않는다.
  function syncComposeMessagePlaceholder() {
    var msgEl = document.getElementById && document.getElementById("compose-message");
    if (msgEl) {
      msgEl.placeholder = suggestedMessage();
    }
  }

  // 제안 문안을 그대로 수락 (Tab 키 / 칩 공용) — value에 채워 넣는다.
  function acceptSuggestedMessage() {
    var msgEl = document.getElementById && document.getElementById("compose-message");
    state.composeMessage = suggestedMessage();
    if (msgEl) {
      msgEl.value = state.composeMessage;
    }
  }

  function openComposeSuggest() {
    state.composeSuggestOpen = true;
    var box = document.getElementById && document.getElementById("compose-suggestions");
    if (box && box.classList) {
      box.classList.add("is-open");
    }
  }

  function closeComposeSuggest() {
    if (!state.composeSuggestOpen) {
      return;
    }
    state.composeSuggestOpen = false;
    var box = document.getElementById && document.getElementById("compose-suggestions");
    if (box && box.classList) {
      box.classList.remove("is-open");
    }
  }

  app.addEventListener("click", function (event) {
    // 앱 안 클릭은 여기서 끝 — document의 '바깥 클릭 닫기'가 render() 뒤
    // 분리된 노드를 보고 바깥 클릭으로 오판해 팝오버를 되닫는 것을 막는다
    if (event.stopPropagation) {
      event.stopPropagation();
    }
    // 검색창은 재클릭(이미 포커스 상태)에도 제안이 열려야 한다 (focusin은 이때 안 옴)
    if (event.target && event.target.id === "compose-search") {
      openComposeSuggest();
    }
    // 검색 오버레이 바깥 클릭이면 닫는다 (오버레이 안 행 클릭은 wrap 안이라 유지)
    if (state.composeSuggestOpen) {
      var inWrap = event.target.closest ? event.target.closest(".compose-search-wrap") : null;
      if (!inWrap) {
        closeComposeSuggest();
      }
    }
    // 회의 시기 캘린더 팝오버 바깥 클릭이면 닫는다
    if (state.windowPickerOpen) {
      var inPicker = event.target.closest ? event.target.closest(".wcal-anchor") : null;
      if (!inPicker) {
        state.windowPickerOpen = false;
        state.windowAnchor = null;
        render();
      }
    }
    var target = event.target.closest("[data-action]");
    if (!target) {
      if (state.openSlotId) {
        state.openSlotId = null;
        render();
      }
      return;
    }

    var action = target.getAttribute("data-action");
    if (action !== "select-grid-slot") {
      state.openSlotId = null;
    }
    if (action === "toggle-rank-info") {
      state.rankInfoOpen = !state.rankInfoOpen;
      render();
      return;
    }
    // 순위 설명은 다른 조작을 시작하면 닫는다 — 한 번에 하나만
    if (state.rankInfoOpen) {
      state.rankInfoOpen = false;
    }
    if (action === "go-input") {
      setRoute("input");
    }
    if (action === "go-entry") {
      setRoute("entry");
    }
    if (action === "close-grid-backdrop") {
      if (event.target === target) {
        state.inputStage = "dm";
        render();
      }
      return;
    }
    if (action === "grid-back-dm") {
      state.inputStage = "dm";
      render();
      return;
    }
    if (action === "dm-open-grid" || action === "dm-change-answer") {
      // 답변 바꾸기는 바로 격자를 연다 — 상태만 되돌리고 다시 누르게 하지 않는다
      state.declined = false;
      state.inputStage = "grid";
      render();
      return;
    }
    if (action === "dm-all-ok" || action === "submit-response") {
      // 피드백은 토스트가 아니라 대화 안에서: 카드가 응답 완료 상태로 바뀌고,
      // 봇이 한 줄짜리 확인 메시지를 보낸다 (슬랙 실물: chat.update + 짧은 메시지)
      state.answerCount = (state.answerCount || 0) + 1;
      state.inputStage = "done";
      render();
      return;
    }
    if (action === "dm-decline") {
      // 거절도 하나의 응답 — 기한 전까지 되돌릴 수 있다 (구글 캘린더 RSVP처럼 가역적)
      state.declined = true;
      state.inputStage = "dm";
      render();
      return;
    }
    if (action === "go-confirm") {
      // 확정 화면의 회의실 기본값이 고른 시간을 따라가게 — 방을 직접 못 고른 채 넘어가지 않는다
      if (state.selectedSlotId) {
        state.meetingRoom = roomForSlot(slotById(state.selectedSlotId));
      }
      setRoute("confirm");
      return;
    }
    if (action === "go-compare") {
      var submittedFromInput = state.route === "input" || state.route === "input-optional";
      state.posted = false;
      if (submittedFromInput) {
        state.toastVisible = true;
        state.toastFading = false;
        state.toastText = "피하고 싶은 시간을 보냈어요";
        scheduleToastDismiss();
      }
      setRoute("compare");
    }
    if (action === "toggle-banner") {
      state.bannerOpen = !state.bannerOpen;
      render();
    }
    if (action === "compose-add") {
      var addId = target.getAttribute("data-person-id");
      state.composeAdded[addId] = true;
      state.composeQuery = "";
      syncMentionLine();
      // 연속 추가 — 오버레이는 열린 채로 두고 검색 입력으로 포커스 복귀
      state.composeSuggestOpen = true;
      render();
      var searchEl = document.getElementById && document.getElementById("compose-search");
      if (searchEl && searchEl.focus) {
        searchEl.focus();
      }
    }
    if (action === "accept-description") {
      acceptSuggestedDescription();
      return;
    }
    if (action === "compose-accept-message") {
      acceptSuggestedMessage();
      syncAcceptChips();
    }
    if (action === "compose-remove") {
      var removeId = target.getAttribute("data-person-id");
      delete state.composeAdded[removeId];
      syncMentionLine();
      delete state.composeAdded[removeId];
      delete state.attendanceOverride[removeId];
      render();
    }
    if (action === "compose-attendance") {
      var attendanceId = target.getAttribute("data-person-id");
      var attendanceValue = target.getAttribute("data-value");
      state.attendanceOverride[attendanceId] = attendanceValue;
      render();
    }
    if (action === "close-my-marks-backdrop") {
      if (event.target === target) {
        state.myMarksOpen = false;
        render();
      }
      return;
    }
    if (action === "close-compose-backdrop") {
      if (event.target === target) {
        state.composeModalOpen = false;
        render();
      }
      return;
    }
    if (action === "open-my-marks") {
      state.myMarksOpen = true;
      render();
      return;
    }
    if (action === "close-my-marks") {
      state.myMarksOpen = false;
      render();
      return;
    }
    if (action === "propose-change") {
      // 재조율 = 같은 흐름의 재사용 — 확정 상태를 풀고 추천으로
      state.posted = false;
      setRoute("compare");
      return;
    }
    if (action === "open-compose") {
      state.composeModalOpen = true;
      state.composeStep = 1;
      // 데모 프리필: 제품 주장은 "참석자·문안까지 미리 채워진다" — 빈 작성 창에서
      // 5번 클릭하게 두지 않고, 처음 여는 순간부터 그 상태로 시작한다.
      if (!state.composePosted && !composeHasSelection()) {
        ["taeho", "minjun", "haneul", "sua", "seyoung"].forEach(function (id) {
          state.composeAdded[id] = true;
        });
      }
      render();
      return;
    }
    if (action === "close-compose") {
      state.composeModalOpen = false;
      render();
      return;
    }
    if (action === "compose-next") {
      if (target.disabled) {
        return;
      }
      state.composeStep = 2;
      // 이전 화면(compare 등)에서 남은 격자 상태가 새 2단계에 새어 들어오지 않게 정리
      state.activeSlotId = null;
      state.openSlotId = null;
      state.customSlot = null;
      render();
      return;
    }
    if (action === "compose-back") {
      state.composeStep = 1;
      render();
      return;
    }
    if (action === "compose-pick-slot") {
      var pickCellId = target.getAttribute("data-slot-id");
      var pickedSlotId = pickCellId;
      var isPickCell = target.getAttribute("data-pick-source") === "cell";
      if (isPickCell) {
        if (state.dragJustPicked) {
          state.dragJustPicked = false;
          return;
        }
        // 셀 클릭 = 정시. 10분 단위는 드래그 제스처가 담당 (select-grid-slot과 동일 원칙)
        if (!state.customSlot || state.customSlot.id !== pickCellId) {
          state.customSlot = null;
        }
        state.activeSlotId = pickCellId;
        state.openSlotId = pickCellId;
      } else {
        // 팝오버 안 [이 시간 선택] 버튼 — 이미 셀 클릭이 계산해둔 정확한 id를 그대로 신뢰
        // (choose-slot과 같은 원칙: 여기서 다시 좌표 스냅을 하면 버튼 자체의 rect로 재계산돼 어긋난다)
        if (!state.customSlot || state.customSlot.id !== pickedSlotId) {
          state.customSlot = null;
        }
        state.openSlotId = null;
      }
      state.tentativeSlotId = pickedSlotId;
      render();
      return;
    }
    if (action === "entry-tab-bot") {
      state.entryTab = "bot";
      state.deadlineSeen = true;
      render();
      return;
    }
    if (action === "entry-tab-channel") {
      state.entryTab = "channel";
      render();
      return;
    }
    if (action === "toggle-window-picker") {
      state.windowPickerOpen = !state.windowPickerOpen;
      state.windowAnchor = null;
      render();
      return;
    }
    if (action === "window-confirm") {
      state.windowPickerOpen = false;
      state.windowAnchor = null;
      render();
      return;
    }
    if (action === "window-pick") {
      pickWindowDate(parseInt(target.getAttribute("data-dom"), 10));
      return;
    }
    if (action === "post-compose") {
      if (target.disabled) {
        return;
      }
      state.composePosted = true;
      state.composeModalOpen = false;
      // 2단계에서 카드/격자로 직접 고른 제안이 있으면 그대로 존중 — 없을 때만 추천 1순위로 기본값
      if (!state.tentativeSlotId) {
        state.tentativeSlotId = currentFeatured().recommended.id;
      }
      state.respondedReveal = false;
      state.toastVisible = true;
      state.toastFading = false;
      state.toastText = state.postToChannel ? "채널에 보냈어요" : "참석자들에게 초대를 보냈어요";
      scheduleToastDismiss();
      state.deadlinePassed = false;
      state.deadlineSeen = false;
      state.entryTab = state.postToChannel ? "channel" : "bot";
      if (window.location.hash === "#entry") {
        render();
      } else {
        setRoute("entry");
      }
      // 2초 뒤 응답 기한 마감을 연출 — 오버레이 설명 대신 실제 제품의 신호(토스트·뱃지·알림)로
      if (typeof window.setTimeout === "function") {
        window.setTimeout(function () {
          if (!state.composePosted || state.posted) {
            return;
          }
          state.deadlinePassed = true;
          state.respondedReveal = true;
          state.toastVisible = true;
          state.toastFading = false;
          state.toastText = "응답 기한이 지났어요";
          scheduleToastDismiss();
          render();
        }, 2000);
      }
      return;
    }
    if (action === "toggle-soft") {
      if (state.suppressNextSoftToggle) {
        state.suppressNextSoftToggle = false;
        return;
      }
      if (target.disabled) {
        return;
      }
      var miniSlotId = target.getAttribute("data-slot-id");
      if (state.myMarksOpen) {
        // '내 캘린더 표시' 모달 — 대상은 주최자 본인, 표시는 이후 모든 조율 계산에 반영
        var jiwoo = getPerson("jiwoo");
        state.jiwooSoftSlots[miniSlotId] = !softSelectedForInput(jiwoo, miniSlotId);
        render();
        return;
      }
      var inputPerson = inputPersonForRoute();
      if (state.inputOptOutByPerson[inputPerson.id]) {
        return;
      }
      // 현재값은 기본 점심 ×까지 아는 softSelectedForInput 기준 — 기본 표시도 한 번에 지워진다
      if (inputPerson.id === "haneul") {
        state.selectedSoftSlots[miniSlotId] = !softSelectedForInput(inputPerson, miniSlotId);
      } else {
        state.optionalSoftSlots[miniSlotId] = !softSelectedForInput(inputPerson, miniSlotId);
      }
      render();
    }
    if (action === "toggle-opt-out") {
      var optOutPerson = inputPersonForRoute();
      state.inputOptOutByPerson[optOutPerson.id] = !state.inputOptOutByPerson[optOutPerson.id];
      render();
    }
    if (action === "select-grid-slot") {
      // 드래그가 방금 픽을 커밋했으면 뒤따르는 클릭은 무시 (드래그 후 click 이벤트가 한 번 더 온다)
      if (state.dragJustPicked) {
        state.dragJustPicked = false;
        return;
      }
      // 클릭 = 정시 선택. 10분 단위 시각은 드래그 제스처(누르고 끌어서 놓기)가 담당
      var cellId = target.getAttribute("data-slot-id");
      if (!state.customSlot || state.customSlot.id !== cellId) {
        state.customSlot = null;
      }
      state.selectedSlotId = cellId;
      state.activeSlotId = cellId;
      state.posted = false;
      render();
    }
    if (action === "send-reminder") {
      state.reminderSent = true;
      render();
      return;
    }
    if (action === "sort-mode") {
      var mode = target.getAttribute("data-sort-mode");
      if (mode !== state.sortMode) {
        var rects = captureCardRects();
        state.sortMode = mode;
        render();
        animateCardReorder(rects);
      }
    }
    if (action === "toggle-card") {
      var cardId = target.getAttribute("data-card-id");
      state.openCardId = state.openCardId === cardId ? null : cardId;
      // 카드 클릭 = 그 시간을 고르는 행위 — 격자 링·하단 상태줄이 함께 따라온다
      var cardSlotId = target.getAttribute("data-slot-id");
      if (cardSlotId) {
        state.selectedSlotId = cardSlotId;
        state.activeSlotId = cardSlotId;
        if (!state.customSlot || state.customSlot.id !== cardSlotId) {
          state.customSlot = null;
        }
      }
      render();
    }
    if (action === "choose-slot") {
      // 선택만 한다 — 다음 단계는 푸터 CTA([확정하러 가기])가 담당 (다이얼로그 원칙)
      state.selectedSlotId = target.getAttribute("data-slot-id");
      if (!state.customSlot || state.customSlot.id !== state.selectedSlotId) {
        state.customSlot = null;
      }
      state.activeSlotId = state.selectedSlotId;
      state.openSlotId = null;
      state.posted = false;
      render();
    }
    if (action === "post-confirm") {
      // 선택 없이 확정 화면에 직행(데모 내비)한 경우 화면이 보여주던 추천 1순위로 확정
      if (!state.selectedSlotId) {
        state.selectedSlotId = currentFeatured().recommended.id;
      }
      state.posted = true;
      // 확정은 채널 카드의 업데이트다 — 작성을 건너뛴 자유 탐색에서도 카드가 존재해야 한다
      state.composePosted = true;
      state.toastVisible = true;
      state.toastFading = false;
      state.toastText = "#" + state.channelName + " 채널에 확정 카드를 올렸어요";
      scheduleToastDismiss();
      setRoute("entry");
      return;
    }
  });

  app.addEventListener("pointerdown", function (event) {
    if (state.route !== "input" && state.route !== "input-optional") {
      return;
    }
    var slotEl = event.target.closest ? event.target.closest(".mini-slot") : null;
    if (!slotEl || slotEl.disabled) {
      return;
    }
    state.dragActive = true;
    state.dragMoved = false;
    state.dragPaintValue = null;
    state.dragStartId = slotEl.getAttribute("data-slot-id");
    state.dragLastPaintedId = null;
  });

  app.addEventListener("pointermove", function (event) {
    if (!state.dragActive) {
      return;
    }
    var hovered = document.elementFromPoint(event.clientX, event.clientY);
    var slotEl = hovered && hovered.closest ? hovered.closest(".mini-slot") : null;
    if (!slotEl || slotEl.disabled) {
      return;
    }
    var id = slotEl.getAttribute("data-slot-id");
    if (!state.dragMoved) {
      if (id === state.dragStartId) {
        return;
      }
      state.dragMoved = true;
      state.dragPaintValue = !softIsOn(state.dragStartId);
      var startEl = app.querySelector('.mini-slot[data-slot-id="' + state.dragStartId + '"]');
      if (startEl) {
        setSoft(state.dragStartId, state.dragPaintValue, startEl);
      }
      state.dragLastPaintedId = state.dragStartId;
    }
    if (id === state.dragLastPaintedId) {
      return;
    }
    setSoft(id, state.dragPaintValue, slotEl);
    state.dragLastPaintedId = id;
  });

  // window 레벨: 창 밖에서 손을 떼거나(pointerup 유실) OS가 제스처를 가로채도(pointercancel)
  // 드래그 상태가 남지 않게 한다.
  function endSoftDrag() {
    if (!state.dragActive) {
      return;
    }
    state.dragActive = false;
    if (state.dragMoved) {
      state.dragMoved = false;
      state.suppressNextSoftToggle = true;
      render();
    }
  }

  window.addEventListener("pointerup", endSoftDrag);
  window.addEventListener("pointercancel", endSoftDrag);

  app.addEventListener("mouseover", function (event) {
    // 추천 카드에 호버하면 격자의 해당 셀을 강조 — 카드↔격자 연결(006)
    var hoverCard = event.target.closest ? event.target.closest(".recommend-card") : null;
    if (hoverCard) {
      var linked = document.querySelector('.slot-cell[data-slot-id="' + hoverCard.getAttribute("data-card-id") + '"]');
      var prev = document.querySelectorAll(".slot-cell.is-card-hover");
      for (var p = 0; p < prev.length; p += 1) { prev[p].classList.remove("is-card-hover"); }
      if (linked) { linked.classList.add("is-card-hover"); }
      return;
    }
    // 회의 시기 캘린더: 시작일을 찍은 상태면 anchor→호버 범위를 미리보기,
    // 아니면 호버한 날짜 하나만 하이라이트 (날짜 범위 선택 모델)
    var wcalDay = event.target.closest ? event.target.closest(".wcal-day[data-week]") : null;
    if (wcalDay) {
      var grid = wcalDay.closest("[data-wcal-grid]");
      if (grid) {
        var hoverDom = parseInt(wcalDay.getAttribute("data-dom"), 10);
        var lo = state.windowAnchor !== null ? Math.min(state.windowAnchor, hoverDom) : hoverDom;
        var hi = state.windowAnchor !== null ? Math.max(state.windowAnchor, hoverDom) : hoverDom;
        var days = grid.querySelectorAll(".wcal-day[data-dom]");
        var marked = [];
        for (var i = 0; i < days.length; i += 1) {
          var d = parseInt(days[i].getAttribute("data-dom"), 10);
          var on = d >= lo && d <= hi;
          days[i].classList.toggle("is-hover-week", on);
          days[i].classList.remove("is-hover-start", "is-hover-end");
          if (on) marked.push(days[i]);
        }
        if (marked.length) {
          marked[0].classList.add("is-hover-start");
          marked[marked.length - 1].classList.add("is-hover-end");
        }
      }
      return;
    }
    var cell = event.target.closest ? event.target.closest(".slot-cell") : null;
    if (!cell) {
      return;
    }
    state.activeSlotId = cell.getAttribute("data-slot-id");
  });

  app.addEventListener("mouseout", function (event) {
    // 추천 카드에서 나가면 격자 강조 해제
    var outCard = event.target.closest ? event.target.closest(".recommend-card") : null;
    if (outCard) {
      var rel = event.relatedTarget && event.relatedTarget.closest ? event.relatedTarget.closest(".recommend-card") : null;
      if (!rel || rel !== outCard) {
        var marked = document.querySelectorAll(".slot-cell.is-card-hover");
        for (var m = 0; m < marked.length; m += 1) { marked[m].classList.remove("is-card-hover"); }
      }
    }
    // 캘린더 밖으로 나가면 주 호버 하이라이트 해제
    var wcalDay = event.target.closest ? event.target.closest(".wcal-day[data-week]") : null;
    if (!wcalDay) {
      return;
    }
    var related = event.relatedTarget && event.relatedTarget.closest ? event.relatedTarget.closest(".wcal-day[data-week]") : null;
    if (related) {
      return;
    }
    var grid = wcalDay.closest("[data-wcal-grid]");
    if (grid) {
      var days = grid.querySelectorAll(".wcal-day.is-hover-week");
      for (var i = 0; i < days.length; i += 1) {
        days[i].classList.remove("is-hover-week", "is-hover-start", "is-hover-end");
      }
    }
  });

  app.addEventListener("focusin", function (event) {
    // 검색창에 포커스가 오면 제안 오버레이를 연다 (전체 재렌더 없이 클래스만 토글, 포커스 보존)
    if (event.target && event.target.id === "compose-search") {
      openComposeSuggest();
      return;
    }
    var cell = event.target.closest ? event.target.closest(".slot-cell") : null;
    if (!cell) {
      return;
    }
    state.activeSlotId = cell.getAttribute("data-slot-id");
  });

  if (document.addEventListener) {
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.composeModalOpen) {
        state.composeModalOpen = false;
        render();
      }
    });
  }

  // 제안 수락 — value가 비어 있을 때 → 키만 (Tab은 표준 역할 유지 — 021 조사)
  app.addEventListener("keydown", function (event) {
    var field = event.target;
    if (!field || event.key !== "ArrowRight") {
      return;
    }
    var sug = field.id === "compose-message" ? suggestedMessage()
      : field.id === "compose-context" ? suggestedDescription()
      : null;
    if (sug === null) {
      return;
    }
    if (field.value && ghostRemainder(field.value, sug) === null) {
      return;
    }
    if (field.value && field.selectionStart !== field.value.length) {
      return;
    }
    event.preventDefault();
    if (field.id === "compose-message") {
      acceptSuggestedMessage();
    } else {
      acceptSuggestedDescription();
    }
    syncGhosts();
  });

  // 참석자가 바뀌면 문안의 멘션 줄도 따라간다 — 첫 줄이 멘션으로만 된 줄일 때만 (손글 존중)
  function syncMentionLine() {
    if (!state.composeMessage) {
      return;
    }
    var lines = state.composeMessage.split("\n");
    var mentionPattern = /^(@\S+[ ]*)+$/;
    var mentions = composeCandidates().filter(isComposeAdded).map(function (person) {
      return "@" + person.name;
    }).join(" ");
    if (mentionPattern.test(lines[0])) {
      if (mentions) {
        lines[0] = mentions;
      } else {
        lines.shift();
      }
    } else if (mentions) {
      lines.unshift(mentions);
    }
    state.composeMessage = lines.join("\n");
  }

  function acceptSuggestedDescription() {
    state.meetingContext = suggestedDescription();
    var ctxEl = document.getElementById && document.getElementById("compose-context");
    if (ctxEl) {
      ctxEl.value = state.meetingContext;
    }
    syncComposeMessagePlaceholder();
    syncAcceptChips();
  }

  // 수락 칩은 '받아들일 것이 있을 때만' — 값이 생기면 사라진다
  function syncAcceptChips() {
    var pairs = [["compose-context", "accept-description"], ["compose-message", "compose-accept-message"]];
    pairs.forEach(function (pair) {
      var field = document.getElementById && document.getElementById(pair[0]);
      var chip = document.querySelector && document.querySelector('[data-action="' + pair[1] + '"]');
      if (field && chip) {
        chip.style.display = field.value ? "none" : "";
      }
    });
  }

  // ── 드래그로 10분 단위 시각 고르기 (구글 캘린더의 누르고-끌고-떼기 문법) ──
  // 클릭은 정시, 드래그는 분 단위 — 클릭 위치 스냅보다 의도가 분명하고 더 섬세하다.
  var gridDrag = null;

  function dragPickCandidate(clientX, clientY) {
    // 포인터 아래의 실제 셀에서 시각을 계산 — 점심 밴드 등 높이가 다른 행을 건너도 정확하다
    var el = document.elementFromPoint ? document.elementFromPoint(clientX, clientY) : null;
    var cell = el && el.closest ? el.closest('.slot-cell[data-slot-id]') : null;
    if (!cell) {
      return null;
    }
    var rect = cell.getBoundingClientRect();
    if (rect.height <= 0) {
      return null;
    }
    var parts = cell.getAttribute("data-slot-id").split("-");
    // 30분 스냅 — 회의는 정시/반시에 시작하는 문화가 기본값. 더 잘게 쪼갠 시각(09:50 등)은
    // 고를 수 있어도 의미가 없고, 제약 경계의 미세 시각은 수동 스크럽이 아니라
    // 엔진 추천이 알려주는 게 맞다.
    var minutes = Math.round(((clientY - rect.top) / rect.height) * 60 / 30) * 30;
    if (minutes >= 60) {
      minutes = 30;
    }
    minutes = Math.max(0, minutes);
    var start = parseFloat(parts[1]) + minutes / 60;
    var candidate = scoreSlot(parts[0], start);
    if (candidate.blockedByHours) {
      return null;
    }
    return { slot: candidate, cellId: cell.getAttribute("data-slot-id"), cell: cell, rect: rect, frac: minutes / 60 };
  }

  function updateDragPreview(pick) {
    if (!gridDrag || !gridDrag.grid) {
      return;
    }
    var line = gridDrag.previewEl;
    if (!line) {
      line = document.createElement("div");
      line.className = "drag-pick-line";
      line.innerHTML = '<span class="slot-pick-chip"></span>';
      gridDrag.grid.appendChild(line);
      gridDrag.previewEl = line;
    }
    var gridRect = gridDrag.grid.getBoundingClientRect();
    line.style.top = (pick.rect.top - gridRect.top + pick.rect.height * pick.frac) + "px";
    line.style.left = (pick.rect.left - gridRect.left) + "px";
    line.style.width = pick.rect.width + "px";
    line.querySelector(".slot-pick-chip").textContent = formatClock(pick.slot.start);
  }

  // ── 입력 격자 드래그 페인트: 회피 표시를 끌어서 여러 칸 한 번에 칠하거나 지운다 ──
  var paintDrag = null;

  app.addEventListener("mousedown", function (event) {
    if (!event.target || !event.target.closest) {
      return;
    }
    var mini = event.target.closest('.mini-slot[data-action="toggle-soft"]');
    if (mini && !mini.disabled) {
      var person = state.myMarksOpen ? getPerson("jiwoo") : inputPersonForRoute();
      paintDrag = {
        person: person,
        // 첫 칸의 반대값을 드래그 전체에 칠한다 (칠하기 시작이면 칠하고, 지우기 시작이면 지운다)
        value: !softSelectedForInput(person, mini.getAttribute("data-slot-id")),
        painted: {},
        moved: false
      };
      if (event.preventDefault) {
        event.preventDefault();
      }
      return;
    }
    var cell = event.target.closest('.slot-cell[data-action="select-grid-slot"], .slot-cell[data-action="compose-pick-slot"]');
    if (!cell) {
      return;
    }
    var grid = cell.closest ? cell.closest(".schedule-grid") : null;
    gridDrag = {
      action: cell.getAttribute("data-action"),
      grid: grid,
      startY: event.clientY,
      moved: false,
      lastPick: null,
      previewEl: null
    };
    // 드래그 중 텍스트 선택 방지
    if (event.preventDefault) {
      event.preventDefault();
    }
  });

  if (document.addEventListener) {
    document.addEventListener("mousemove", function (event) {
      if (paintDrag) {
        var el = document.elementFromPoint ? document.elementFromPoint(event.clientX, event.clientY) : null;
        var mini = el && el.closest ? el.closest('.mini-slot[data-action="toggle-soft"]') : null;
        if (mini && !mini.disabled) {
          var key = mini.getAttribute("data-slot-id");
          if (!paintDrag.painted[key]) {
            paintDrag.painted[key] = true;
            paintDrag.moved = true;
            softOverrideMap(paintDrag.person)[key] = paintDrag.value;
            render();
          }
        }
        return;
      }
      if (!gridDrag) {
        return;
      }
      if (!gridDrag.moved && Math.abs(event.clientY - gridDrag.startY) < 5) {
        return;
      }
      gridDrag.moved = true;
      if (gridDrag.grid && gridDrag.grid.classList) {
        gridDrag.grid.classList.add("is-dragging");
      }
      var pick = dragPickCandidate(event.clientX, event.clientY);
      if (pick) {
        gridDrag.lastPick = pick;
        updateDragPreview(pick);
      }
    });

    document.addEventListener("mouseup", function () {
      if (paintDrag) {
        var drag = paintDrag;
        paintDrag = null;
        if (drag.moved) {
          // 드래그로 칠했으면 뒤따르는 click(toggle-soft)은 무시
          state.suppressNextSoftToggle = true;
        }
        return;
      }
      if (!gridDrag) {
        return;
      }
      var drag = gridDrag;
      gridDrag = null;
      if (drag.grid && drag.grid.classList) {
        drag.grid.classList.remove("is-dragging");
      }
      if (drag.previewEl && drag.previewEl.parentNode) {
        drag.previewEl.parentNode.removeChild(drag.previewEl);
      }
      if (!drag.moved || !drag.lastPick) {
        return;
      }
      // 드래그 커밋 — 뒤따르는 click은 무시하게 표시
      state.dragJustPicked = true;
      var slot = drag.lastPick.slot;
      var isWhole = slot.start === Math.floor(slot.start);
      state.customSlot = isWhole ? null : slot;
      if (drag.action === "compose-pick-slot") {
        state.tentativeSlotId = slot.id;
        state.activeSlotId = drag.lastPick.cellId;
        state.openSlotId = drag.lastPick.cellId;
      } else {
        state.selectedSlotId = slot.id;
        state.activeSlotId = drag.lastPick.cellId;
        state.openSlotId = drag.lastPick.cellId;
      }
      render();
    });
  }

  if (document.addEventListener) {
    document.addEventListener("click", function (event) {
      // #app 바깥 클릭이면 열려 있던 검색 오버레이를 닫는다
      if (state.composeSuggestOpen && !(app.contains && app.contains(event.target))) {
        closeComposeSuggest();
      }
      if (!state.openSlotId || (app.contains && app.contains(event.target))) {
        return;
      }
      state.openSlotId = null;
      render();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.scenarioOverlayOpen) {
        closeScenarioCard();
      }
      if (event.key === "Escape" && state.composeSuggestOpen) {
        closeComposeSuggest();
      }
    });
  }

  var demoNav = null;
  try {
    demoNav = document.getElementById("demo-nav");
  } catch (lookupError) {
    // 테스트 하네스 등 #demo-nav가 없는 최소 DOM 목업에서는 조용히 건너뛴다.
    demoNav = null;
  }
  if (demoNav) {
    demoNav.addEventListener("click", function (event) {
      var routeTarget = event.target.closest("[data-route]");
      if (routeTarget) {
        setRoute(routeTarget.getAttribute("data-route"));
        return;
      }
      var replayTarget = event.target.closest("[data-action='scenario-replay']");
      if (replayTarget) {
        renderScenarioCard();
      }
    });
  }

  var scenarioLayer = null;
  try {
    scenarioLayer = document.getElementById("scenario-layer");
  } catch (lookupError) {
    // 테스트 하네스 등 #scenario-layer가 없는 최소 DOM 목업에서는 조용히 건너뛴다.
    scenarioLayer = null;
  }
  if (scenarioLayer) {
    scenarioLayer.addEventListener("click", function (event) {
      var closeBtn = event.target.closest ? event.target.closest("[data-action='scenario-close']") : null;
      if (closeBtn) {
        closeScenarioCard();
        return;
      }
      var card = event.target.closest ? event.target.closest(".scenario-card") : null;
      if (card) {
        // 카드 내부(버튼 제외) 클릭은 닫지 않는다.
        return;
      }
      closeScenarioCard();
    });
  }

  window.addEventListener("hashchange", render);
  if (isEmbedMode) {
    // 부모 폭 변화로 iframe이 리사이즈되면 콘텐츠 높이도 바뀌니 다시 알린다.
    window.addEventListener("resize", postEmbedHeight);
    window.addEventListener("load", postEmbedHeight);
    // render()를 거치지 않는 조작(모달 열기·격자 칠하기 등)까지 커버하려면
    // body 크기 변화를 직접 감지해 부모에 알린다. 연속 조작에서 iframe이 정확히 따라온다.
    if (typeof ResizeObserver !== "undefined" && document.body) {
      var embedResizeObserver = new ResizeObserver(function () {
        postEmbedHeight();
      });
      embedResizeObserver.observe(document.body);
    }
  }
  if (String(window.location.search || "").indexOf("debug") !== -1) {
    window.PROTOTYPE_DEBUG = {
      featuredSlots: currentFeatured,
      cardOrder: cardOrder,
      scoreAllSlots: scoreAllSlots,
      render: render,
      state: state
    };
  }
  render();
})();
