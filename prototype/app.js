(function () {
  "use strict";

  var data = window.CAST;
  var app = document.getElementById("app");
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
    openReasonId: null,
    openCardId: null,
    sortMode: "recommended",
    dragActive: false,
    dragMoved: false,
    dragPaintValue: null,
    dragStartId: null,
    dragLastPaintedId: null,
    suppressNextSoftToggle: false,
    scenarioSeen: {},
    scenarioLastRoute: null,
    scenarioOverlayOpen: false,
    scenarioFocusReturn: null
  };

  // 시나리오 카드 카피 — 상황 설명은 제품 화면(#app) 밖, 이 데모 레이어에서만.
  var scenarioContent = {
    entry: {
      eyebrow: "1/4 · 주최자",
      body: "당신은 회의를 잡아야 하는 주최자예요. 팀 채널에 조율 카드를 올렸어요.",
      mission: "'시간 정하기'를 눌러 시작해보세요."
    },
    input: {
      eyebrow: "2/4 · 참석자",
      body: "이번엔 초대받은 참석자예요. 캘린더가 모르는 사정이 있죠.",
      mission: "피하고 싶은 시간을 직접 칠하고 제출해보세요."
    },
    "input-optional": {
      eyebrow: "2/4 · 선택 참석자",
      body: "선택 참석자에게는 다른 선택지가 하나 더 있어요.",
      mission: "'참석 어려움'도 눌러보세요."
    },
    compare: {
      eyebrow: "3/4 · 주최자",
      body: "다시 주최자예요. 응답이 모였어요.",
      mission: "1순위 추천의 이유를 눌러 확인해보세요."
    },
    confirm: {
      eyebrow: "4/4 · 주최자",
      body: "이제 확정하고 채널에 알릴 차례예요.",
      mission: "확정 후 게시된 카드를 살펴보세요."
    }
  };

  var slotHours = buildSlotHours();
  var dayIndex = data.meeting.days.reduce(function (map, day, index) {
    map[day] = index;
    return map;
  }, {});
  state.selectedSlotId = buildFeaturedSlots(scoreAllSlots()).recommended.id;

  function cloneList(items) {
    return JSON.parse(JSON.stringify(items));
  }

  function buildSlotHours() {
    var hours = [];
    var lunchStart = data.meeting.workHours.lunch[0];
    for (var hour = data.meeting.workHours.start; hour < data.meeting.workHours.end; hour += 1) {
      if (hour !== lunchStart) {
        hours.push(hour);
      }
    }
    return hours;
  }

  function initials(name) {
    return name.slice(1, 3);
  }

  function shortInitial(name) {
    return name.slice(0, 1);
  }

  // 아바타 정체성 파스텔을 CSS 변수로 (상태색과 분리된 레지스터)
  function avatarVars(person) {
    return ' style="--avatar:' + person.avatarColor + ';--avatar-text:' + person.avatarText + '"';
  }

  function slotId(day, start) {
    return day + "-" + start;
  }

  function displayTime(slot) {
    return slot.day + "요일 " + String(slot.start).padStart(2, "0") + ":00";
  }

  function overlaps(event, start, end) {
    return event.start < end && event.end > start;
  }

  function getPerson(id) {
    return data.people.find(function (person) {
      return person.id === id;
    });
  }

  function requiredPeople() {
    return data.people.filter(function (person) {
      return person.attendance === "required";
    });
  }

  function optionalPeople() {
    return data.people.filter(function (person) {
      return person.attendance === "optional";
    });
  }

  function personHasBusy(person, day, start) {
    var end = start + 1;
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
      if (start >= constraint.rule.unavailableAfter) {
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
      if (start < constraint.rule.unavailableAfter && start + 1 >= constraint.rule.unavailableAfter) {
        found = {
          label: "바로 다음 일정",
          visibility: constraint.visibility,
          source: constraint.source
        };
      }
    });
    return found;
  }

  function softConstraintStatus(person, day, start) {
    var key = slotId(day, start);
    var found = [];

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
    var requiredUnavailable = [];
    var optionalUnavailable = [];
    var privateSoft = [];
    var inferredSoft = [];
    var conditional = [];
    var busyConflicts = [];

    data.people.forEach(function (person) {
      var busy = personHasBusy(person, day, start);
      var hard = privateHardStatus(person, start);

      if (busy || hard) {
        var conflict = {
          person: person,
          reason: busy ? busy.title : "시간이 맞지 않음",
          private: Boolean(hard && hard.visibility === "private")
        };
        busyConflicts.push(conflict);
        if (person.attendance === "required") {
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
      allHardAvailable: busyConflicts.length === 0,
      requiredAvailable: requiredPeople().length - requiredUnavailable.length,
      optionalAvailable: optionalPeople().length - optionalUnavailable.length,
      totalAvailable: data.people.length - busyConflicts.length
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
    data.meeting.days.forEach(function (day) {
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
      return slot.requiredUnavailable.length === 0;
    });

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
        return slot.allHardAvailable && slot.id !== recommended.id && (!runnerUp || slot.id !== runnerUp.id);
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
    var slots = scoreAllSlots();
    return slots.find(function (slot) {
      return slot.id === id;
    }) || currentFeatured().recommended;
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
        recommendedRank: "비교",
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
    if (slot.totalAvailable === data.people.length && slot.start < 16) {
      return "6명이 낮에 다 올 수 있는 시간이에요.";
    }
    return "필수 참석자가 모두 가능한 시간 중 부담이 가장 낮아요.";
  }

  function primaryCardDetail(slot) {
    if (hasPrivateBurden(slot)) {
      // 과제 단서 "점심 직후 기피"는 사유(시간대)까지 밝힌다 — 누가·몇 명인지는 계속 숨긴다
      if (data.researchDefaults.postLunchDip.hours.indexOf(slot.start) >= 0) {
        return "점심 직후라 피하고 싶다는 표시가 있어요. 그래도 오후 중 가장 이른 시작이라 부담이 가장 적어요.";
      }
      return "피하고 싶은 표시가 조금 있어요. 그래도 가장 무난한 시간이에요.";
    }
    return "캘린더 충돌과 피하고 싶은 표시를 같이 보니 가장 무난한 시간이에요.";
  }

  function runnerUpCardCopy(slot) {
    if (slot.optionalUnavailable.length > 0) {
      return "필수 4명은 다 괜찮아요. " + names(slot.optionalUnavailable) + "은 어려운데, 정해지면 결과만 알려드릴까요?";
    }
    return "다음으로 부담이 적은 시간이에요.";
  }

  function runnerUpCardDetail(slot) {
    if (slot.optionalUnavailable.length > 0) {
      return "선택 참석자는 빠져도 회의 결정을 진행할 수 있어요. 대신 결과 공유를 같이 준비해요.";
    }
    return "추천 시간과 비교할 후보로 볼 수 있어요.";
  }

  function stressCardCopy(slot) {
    if (slot.conditional.length > 0) {
      // 비공개 제약은 인원수도 안 센다 (k-익명 원칙, 감사 016-4)
      return "다 되긴 하는데 금요일 늦은 오후예요. 끝나고 바로 다음 일정이 걸린다는 표시도 있어요.";
    }
    if (hasPrivateBurden(slot)) {
      return "다 되긴 하는데 피하고 싶은 표시가 있어요.";
    }
    return "가능 인원은 많지만 다른 후보보다 여유가 적어요.";
  }

  function stressCardDetail(slot) {
    // 화상은 벌점이 아니므로 강등 이유로 쓰지 않는다 — 진짜 이유(시간대·직후 일정)만
    return "가능 인원만 보면 좋아 보이지만, 시간대 부담과 바로 다음 일정까지 보면 여유가 적어요.";
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
  // 어디에서도 이름과 결합해 표시하면 안 된다 (감사 012-1).
  function hasPrivateHardConflict(slot) {
    return slot.busyConflicts.some(function (item) {
      return item.private;
    });
  }

  function isUnavailableSlot(slot) {
    return slot.requiredUnavailable.length > 0;
  }

  function availabilityLevel(slot) {
    if (isUnavailableSlot(slot)) {
      return 0;
    }
    if (slot.totalAvailable >= data.people.length) {
      return 3;
    }
    if (slot.totalAvailable >= data.people.length - 1) {
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
    if (person.id === "haneul") {
      return softSelectedByDefault(slotKey);
    }
    return Boolean(state.optionalSoftSlots[slotKey]);
  }

  function inputPersonForRoute() {
    if (state.route === "input-optional") {
      return getPerson("seyoung");
    }
    return getPerson("haneul");
  }

  function softIsOn(slotKey) {
    return softSelectedForInput(inputPersonForRoute(), slotKey);
  }

  function setSoft(slotKey, value, el) {
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
    if (state.route !== state.scenarioLastRoute) {
      state.scenarioLastRoute = state.route;
      renderScenarioCard(state.route, false);
    }
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
    var route = state.route;
    var isInputOptional = route === "input-optional";
    var jiwoo = getPerson("jiwoo");
    var inputPerson = isInputOptional ? getPerson("seyoung") : getPerson("haneul");
    var steps = [
      { num: 1, hash: "entry", person: jiwoo, label: "요청 · 주최자", active: route === "entry" },
      { num: 2, hash: isInputOptional ? "input-optional" : "input", person: inputPerson, label: "입력 · 참석자", active: route === "input" || isInputOptional },
      { num: 3, hash: "compare", person: jiwoo, label: "추천 · 주최자", active: route === "compare" },
      { num: 4, hash: "confirm", person: jiwoo, label: "확정 · 주최자", active: route === "confirm" }
    ];

    var buttonsHtml = steps.map(function (step) {
      return (
        '<button type="button" class="demo-nav-btn" data-route="' + step.hash + '" aria-label="' + step.num + '단계, ' + step.label + '"' + (step.active ? ' aria-current="page"' : '') + '>' +
          '<span class="demo-nav-num" aria-hidden="true">' + step.num + '</span>' +
          '<span class="demo-nav-avatar" aria-hidden="true"' + avatarVars(step.person) + '>' + initials(step.person.name) + '</span>' +
          '<span class="demo-nav-label" aria-hidden="true">' + step.label + '</span>' +
        '</button>'
      );
    }).join("");

    var subToggleHtml = "";
    if (route === "input" || isInputOptional) {
      subToggleHtml =
        '<div class="demo-nav-subtoggle" role="group" aria-label="입력 화면 대상 전환">' +
          '<button type="button" data-route="input" aria-pressed="' + String(route === "input") + '">필수</button>' +
          '<button type="button" data-route="input-optional" aria-pressed="' + String(isInputOptional) + '">선택</button>' +
        '</div>';
    }

    nav.innerHTML =
      '<div class="demo-nav-track">' + buttonsHtml + '</div>' + subToggleHtml +
      '<button type="button" class="demo-nav-help" data-action="scenario-replay" aria-label="지금 단계 안내 다시 보기">?</button>';
  }

  // 시나리오 카드 — 각 단계 첫 진입 시 1회만, #app 밖(다크 오버레이)에 상황 설명을 띄운다.
  // forceOpen이 없으면 이미 본 단계는 조용히 건너뛴다(memory-only, localStorage 미사용).
  function renderScenarioCard(route, forceOpen) {
    var content = scenarioContent[route];
    if (!content) {
      return;
    }
    if (!forceOpen && state.scenarioSeen[route]) {
      return;
    }
    var layer;
    try {
      layer = document.getElementById("scenario-layer");
    } catch (lookupError) {
      // 테스트 하네스 등 #scenario-layer가 없는 최소 DOM 목업에서는 조용히 건너뛴다.
      return;
    }
    if (!layer) {
      return;
    }
    state.scenarioSeen[route] = true;
    state.scenarioOverlayOpen = true;
    state.scenarioFocusReturn = (document.activeElement && document.activeElement !== document.body)
      ? document.activeElement
      : null;
    layer.innerHTML =
      '<div class="scenario-overlay">' +
        '<div class="scenario-card" role="dialog" aria-modal="true" aria-label="' + content.eyebrow + '">' +
          '<p class="scenario-eyebrow">' + content.eyebrow + '</p>' +
          '<p class="scenario-body">' + content.body + '</p>' +
          '<p class="scenario-mission">' + content.mission + '</p>' +
          '<button type="button" class="scenario-start-btn" data-action="scenario-close">시작하기</button>' +
        '</div>' +
      '</div>';
    var startBtn = layer.querySelector ? layer.querySelector(".scenario-start-btn") : null;
    if (startBtn && startBtn.focus) {
      startBtn.focus();
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
  }

  function renderEntry() {
    app.innerHTML =
      '<section class="screen">' +
        '<div class="screen-inner messenger-shell">' +
          '<aside class="workspace-rail" aria-label="워크스페이스">' +
            '<p class="workspace-name">Product Lab</p>' +
            '<ul class="channel-list">' +
              '<li># 공지</li>' +
              '<li class="active"># q3-kickoff</li>' +
              '<li># 제품실험</li>' +
              '<li># 데이터지원</li>' +
            '</ul>' +
          '</aside>' +
          '<section class="channel-panel" aria-label="슬랙 스타일 채널">' +
            '<header class="channel-header"><h1># q3-kickoff</h1></header>' +
            '<div class="message-thread">' +
              '<article class="message">' +
                '<div class="avatar" aria-hidden="true" style="--avatar:#E0E7FF;--avatar-text:#4338CA">서</div>' +
                '<div>' +
                  '<div class="message-meta"><span class="message-author">서지우</span><span class="message-time">오전 10:04</span></div>' +
                  '<div class="schedule-card">' +
                    '<p class="card-kicker">회의 시간 정하기</p>' +
                    '<h2>' + data.meeting.title + '</h2>' +
                    '<div class="meeting-facts">' +
                      '<span class="fact-pill">1시간</span>' +
                      '<span class="fact-pill">' + data.meeting.deadline + '</span>' +
                      '<span class="fact-pill">참석자 6명</span>' +
                    '</div>' +
                    '<div class="participant-strip">' + renderParticipantRows() + '</div>' +
                    '<button class="btn" data-action="go-input">시간 정하기</button>' +
                  '</div>' +
                '</div>' +
              '</article>' +
            '</div>' +
          '</section>' +
        '</div>' +
      '</section>';
  }

  function renderParticipantRows() {
    return data.people.map(function (person) {
      var isOpen = state.openReasonId === person.id;
      return (
        '<div class="participant-row">' +
          '<button class="avatar-button ' + (person.attendance === "required" ? "is-required" : "is-optional") + '" data-action="toggle-reason" data-person-id="' + person.id + '" aria-label="' + person.name + ' 참석 이유 보기" aria-expanded="' + String(isOpen) + '"' + avatarVars(person) + '>' + initials(person.name) + '</button>' +
          '<div>' +
            '<div class="participant-main">' +
              '<span class="participant-name">' + person.name + '</span>' +
              '<span class="tag ' + (person.attendance === "required" ? "tag-required" : "tag-optional") + '">' + (person.attendance === "required" ? "필수" : "선택") + '</span>' +
              '<span class="helper-copy">' + person.role + '</span>' +
            '</div>' +
          '</div>' +
          (isOpen ? '<p class="reason-box">' + person.attendanceReason + '</p>' : '') +
        '</div>'
      );
    }).join("");
  }

  function renderInput() {
    var person = inputPersonForRoute();
    var optional = person.attendance === "optional";
    var optedOut = Boolean(state.inputOptOutByPerson[person.id]);
    app.innerHTML =
      '<section class="screen screen-mobile">' +
        '<div class="mobile-stage">' +
          '<div class="phone-frame" role="region" aria-label="참석자 입력 화면">' +
            '<div class="phone-status"><span>Slack 링크</span><span>' + person.name + '</span></div>' +
            '<div class="phone-body">' +
              '<section class="context-card compact">' +
                '<p class="eyebrow">Q3 프로젝트 킥오프 · ' + (person.attendance === "required" ? "필수" : "선택") + '</p>' +
                '<h1>다음 주 킥오프, 피하고 싶은 시간이 있나요?</h1>' +
                (optional ? '<p class="input-guidance">선택 참석이에요 — 어려우면 부담 없이 \'참석 어려움\'을 선택하세요. 결정사항은 따로 공유돼요</p>' : '') +
              '</section>' +
              '<section class="soft-editor">' +
                (optional ? renderOptOutControl(person, optedOut) : '') +
                renderInputLegend() +
                '<div class="mini-week-grid ' + (optedOut ? "is-disabled" : "") + '" aria-label="주간 입력 격자">' + renderMiniGrid(person, optedOut) + '</div>' +
              '</section>' +
              '<p class="privacy-note">누가 표시했는지는 주최자에게 보이지 않아요</p>' +
              '<button class="btn btn-full" data-action="go-compare">제출</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</section>';
  }

  function renderOptOutControl(person, optedOut) {
    return (
      '<div class="opt-out-control">' +
        '<button class="btn btn-secondary opt-out-button ' + (optedOut ? "is-active" : "") + '" data-action="toggle-opt-out" aria-pressed="' + String(optedOut) + '">참석 어려움</button>' +
        (optedOut ? '<p class="opt-out-message">정해지면 결과를 공유해드릴게요</p>' : '') +
      '</div>'
    );
  }

  function renderMiniGrid(person, optedOut) {
    var html = '<div class="mini-head"></div>';
    data.meeting.days.forEach(function (day) {
      html += '<div class="mini-head">' + day + '</div>';
    });

    var lunchStart = data.meeting.workHours.lunch[0];
    var lunchEnd = data.meeting.workHours.lunch[1];
    var lunchInserted = false;

    slotHours.forEach(function (hour) {
      if (!lunchInserted && hour === lunchEnd) {
        html +=
          '<div class="mini-time mini-time-lunch" aria-hidden="true">' + lunchStart + '</div>' +
          '<div class="mini-lunch-band" role="note" aria-label="' + lunchStart + '시 점심시간, 후보에서 제외">점심시간</div>';
        lunchInserted = true;
      }
      html += '<div class="mini-time">' + hour + '</div>';
      data.meeting.days.forEach(function (day) {
        var id = slotId(day, hour);
        var hard = participantHardForInput(person, day, hour);
        var soft = !hard && !optedOut && softSelectedForInput(person, id);
        var video = !hard && conditionalStatus(person, day);
        var disabled = hard || optedOut;
        var label = day + "요일 " + hour + "시, " + (hard ? "안 되는 시간" : optedOut ? "비활성화된 시간" : soft ? "피하고 싶은 시간" : "가능한 시간");
        if (video) {
          label += ", 화상 참여 가능";
        }
        html +=
          '<button class="mini-slot' + (hard ? " is-hard" : "") + (soft ? " is-soft" : "") + (video ? " has-video" : "") + '" ' +
          'data-action="toggle-soft" data-slot-id="' + id + '" aria-label="' + label + '" ' + (disabled ? "disabled" : "") + (soft ? ' title="표시한 시간이에요"' : "") + '>' +
            (video ? '<span class="mini-video-badge" aria-hidden="true"></span>' : '') +
          '</button>';
      });
    });

    return html;
  }

  function renderInputLegend() {
    return (
      '<div class="legend legend-input" role="group" aria-label="입력 범례">' +
        '<span class="legend-item"><span class="legend-swatch is-busy" aria-hidden="true"></span>일정 있음</span>' +
        '<span class="legend-item"><span class="legend-swatch is-preferred" aria-hidden="true"></span>피하고 싶어요</span>' +
        '<span class="legend-item"><span class="legend-swatch is-open" aria-hidden="true"></span>괜찮아요</span>' +
      '</div>'
    );
  }

  function renderCompare() {
    var featured = currentFeatured();
    if (!state.activeSlotId) {
      state.activeSlotId = featured.recommended.id;
    }
    app.innerHTML =
      '<section class="screen">' +
        '<div class="screen-inner">' +
          '<header class="compare-header">' +
            '<div>' +
              '<p class="eyebrow">주최자 서지우</p>' +
              '<h1 class="screen-title">추천 시간</h1>' +
              '<p class="screen-subtitle">모두 완벽한 시간은 없어요. 제일 무난한 순서로 정리했어요.</p>' +
              renderResponseLine() +
            '</div>' +
            renderSortToggle() +
          '</header>' +
          '<div class="desktop-layout">' +
            '<section class="panel" aria-label="주간 격자">' +
              '<header class="panel-header">' +
                '<h2>주간 격자</h2>' +
                renderLegend() +
              '</header>' +
              '<div class="schedule-grid">' + renderScheduleGrid(featured) + '</div>' +
              renderActiveSlotDetail() +
            '</section>' +
            '<aside>' +
              '<div class="recommend-list">' + renderRecommendCards() + '</div>' +
            '</aside>' +
          '</div>' +
        '</div>' +
      '</section>';
  }

  // 미응답은 비공개 제약이 아니라 진행 상태라서 이름을 보여도 된다 (자기 사례 000-6).
  // 미응답자의 시간 정보는 캘린더로만 아는 것 — 팝업에서 점선(미확정 문법)으로 표시.
  function unrespondedPeople() {
    return data.people.filter(function (person) {
      return person.responded === false;
    });
  }

  function renderResponseLine() {
    var waiting = unrespondedPeople();
    if (waiting.length === 0) {
      return '<p class="response-line">6명 모두 응답했어요</p>';
    }
    var respondedCount = data.people.length - waiting.length;
    var waitingNames = waiting.map(function (person) {
      return person.name + "님";
    }).join(", ");
    return (
      '<p class="response-line">' +
        respondedCount + '명 응답 · ' + waitingNames + ' 답 기다리는 중 — 캘린더 기준으로 먼저 계산했어요 ' +
        (state.reminderSent
          ? '<span class="remind-done">다시 알렸어요</span>'
          : '<button class="remind-btn" data-action="send-reminder">다시 알려주기</button>') +
      '</p>'
    );
  }

  function renderSortToggle() {
    return (
      '<div class="sort-toggle" role="group" aria-label="추천 정렬">' +
        '<button class="' + (state.sortMode === "recommended" ? "is-active" : "") + '" aria-pressed="' + String(state.sortMode === "recommended") + '" data-action="sort-mode" data-sort-mode="recommended">추천 순</button>' +
        '<button class="' + (state.sortMode === "availability" ? "is-active" : "") + '" aria-pressed="' + String(state.sortMode === "availability") + '" data-action="sort-mode" data-sort-mode="availability">가능한 사람 많은 순</button>' +
      '</div>'
    );
  }

  function renderLegend() {
    return (
      '<div class="legend" role="group" aria-label="격자 범례">' +
        '<span class="legend-item"><span class="legend-swatch is-unavailable" aria-hidden="true"></span>안 돼요</span>' +
        '<span class="legend-item"><span class="legend-ramp" aria-hidden="true"><span class="is-low"></span><span class="is-mid"></span><span class="is-high"></span></span>여유</span>' +
        '<span class="legend-item"><span class="legend-dot" aria-hidden="true"></span>피하고 싶은 표시 있음</span>' +
      '</div>'
    );
  }

  function renderScheduleGrid(featured) {
    var html = '<div class="grid-corner">시간</div>';
    data.meeting.days.forEach(function (day) {
      html += '<div class="grid-day">' + day + '</div>';
    });

    slotHours.forEach(function (hour) {
      html += '<div class="grid-time">' + String(hour).padStart(2, "0") + ':00</div>';
      data.meeting.days.forEach(function (day) {
        var slot = slotById(slotId(day, hour));
        var selected = state.selectedSlotId === slot.id;
        var recommended = slot.id === featured.recommended.id;
        var active = state.activeSlotId === slot.id;
        var open = state.openSlotId === slot.id;
        var unavailable = isUnavailableSlot(slot);
        // 감사 016-3: 격자 표면에도 부담 신호를 올린다 — 호버/팝업 뒤에만 숨기면
        // When2meet류 여유 히트맵과 첫인상이 같아져 이 도구의 차별점(소프트·비공개
        // 부담 반영)이 안 보인다. 인원수·이름은 여전히 절대 노출하지 않는다(k-익명).
        var privateBurden = !unavailable && burdenCount(slot) > 0;
        html +=
          '<button class="slot-cell availability-' + availabilityLevel(slot) + (unavailable ? " is-unavailable" : "") + (privateBurden ? " has-private-burden" : "") + (selected ? " is-selected" : "") + (recommended ? " is-recommended" : "") + (active ? " is-active" : "") + (open ? " is-open" : "") + '" ' +
          'data-action="select-grid-slot" data-slot-id="' + slot.id + '" aria-label="' + slotAria(slot, recommended) + '">' +
            (recommended && !unavailable ? '<span class="mini-tag">추천</span>' : '') +
            '<span class="slot-popover" role="dialog" aria-label="' + displayTime(slot) + ' 상세">' + renderSlotPopover(slot) + '</span>' +
          '</button>';
      });
    });

    return html;
  }

  function slotAria(slot, recommended) {
    var parts = [displayTime(slot)];
    if (isUnavailableSlot(slot)) {
      parts.push("안 돼요");
    } else {
      parts.push(slot.totalAvailable + "명 참석 가능");
      parts.push("여유 " + availabilityLevel(slot) + "단계");
    }
    if (burdenCount(slot) > 0) {
      parts.push("피하고 싶은 표시 있음");
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
  // Calendar busy is public scheduling information, so attendee names may appear with "못 옴".
  // BUT privately entered constraints (hard or soft) and inferred preferences are aggregate-only:
  // never show a person's name, or a count, beside private information anywhere (audit 012-1).
  // 팝업 아바타 상태 범례 — 지금 화면에 실제로 나타난 상태만 (없는 건 안 씀)
  function popoverStateHint(slot) {
    var hasAway = slot.busyConflicts.some(function (i) { return !i.private; });
    var hasPending = data.people.some(function (p) {
      return p.responded === false && !slot.busyConflicts.some(function (i) { return i.person.id === p.id && !i.private; });
    });
    var hasVideo = slot.conditional.length > 0;
    var parts = [];
    if (hasPending) { parts.push("? 아직 응답 전"); }
    if (hasAway) { parts.push("× 못 옴"); }
    if (hasVideo) { parts.push("카메라 화상"); }
    if (parts.length === 0) { return ""; }
    return '<span class="popover-hint">' + parts.join(" · ") + '</span>';
  }

  function renderSlotPopover(slot) {
    return (
      '<strong class="popover-title">' + slotStatusTitle(slot) + '</strong>' +
      '<span class="popover-avatar-stack">' + renderSlotAvatarStack(slot) + '</span>' +
      popoverStateHint(slot) +
      (hasPrivateBurden(slot) ? '<span class="popover-note">비공개로 피하고 싶다는 표시가 있어요</span>' : '') +
      (hasPrivateHardConflict(slot) ? '<span class="popover-note">비공개 사정으로 어려운 사람이 있어요</span>' : '')
    );
  }

  function renderSlotAvatarStack(slot) {
    return data.people.map(function (person) {
      var away = slot.busyConflicts.some(function (item) {
        return item.person.id === person.id && !item.private;
      });
      var video = !away && slot.conditional.some(function (item) {
        return item.person.id === person.id;
      });
      var unresponded = person.responded === false;
      var statusLabel = away ? "못 옴" : video ? "화상 참여" : "참석 가능";
      if (unresponded && !away) {
        statusLabel = "아직 응답 전 — 캘린더 기준";
      }
      return (
        '<span class="slot-avatar ' + (person.attendance === "required" ? "is-required" : "is-optional") + (away ? " is-away" : "") + (video ? " is-video" : "") + (unresponded && !away ? " is-unresponded" : "") + '" title="' + person.name + '"' + avatarVars(person) + '>' +
          '<span aria-hidden="true">' + shortInitial(person.name) + '</span>' +
          (away ? '<span class="avatar-badge is-away" aria-hidden="true">×</span>' : '') +
          (unresponded && !away ? '<span class="avatar-badge is-pending" aria-hidden="true">?</span>' : '') +
          (video ? '<span class="avatar-badge is-video" aria-hidden="true"></span>' : '') +
          '<span class="sr-only">' + person.name + " " + statusLabel + '</span>' +
        '</span>'
      );
    }).join("");
  }

  function slotStatusTitle(slot) {
    return displayTime(slot) + " · " + slot.totalAvailable + "명 참석 가능";
  }

  function slotStatusLine(slot) {
    var parts = [slotStatusTitle(slot)];
    if (isUnavailableSlot(slot)) {
      parts.push("안 돼요");
    }
    if (hasPrivateBurden(slot)) {
      parts.push("피하고 싶은 표시 있음");
    }
    if (slot.conditional.length > 0) {
      parts.push("화상 참여 있음");
    }
    return parts.join(" · ");
  }

  function renderActiveSlotDetail() {
    var slot = slotById(state.activeSlotId || state.selectedSlotId);
    return (
      '<div class="slot-detail-panel" data-slot-detail role="status">' + slotStatusLine(slot) + '</div>'
    );
  }

  function renderRecommendCards() {
    return orderedCards().map(function (card, index) {
      var slot = card.slot;
      var isOpen = state.openCardId === card.key;
      var rank = state.sortMode === "availability" ? card.availableRank : card.recommendedRank;
      return (
        '<article class="recommend-card ' + (state.selectedSlotId === slot.id ? "is-selected" : "") + '" data-card-id="' + slot.id + '">' +
          '<button class="card-summary" data-action="toggle-card" data-card-id="' + card.key + '" aria-expanded="' + String(isOpen) + '">' +
            '<span class="rank-label">' + rank + '</span>' +
            '<span class="card-time">' + displayTime(slot) + '</span>' +
            '<span class="card-copy">' + card.copy + '</span>' +
          '</button>' +
          '<div class="metric-row">' +
            '<span class="metric-pill">필수 ' + slot.requiredAvailable + '/' + requiredPeople().length + '</span>' +
            '<span class="metric-pill">선택 ' + slot.optionalAvailable + '/' + optionalPeople().length + '</span>' +
            (slot.conditional.length ? '<span class="metric-pill"><span class="video-icon" aria-hidden="true"></span>화상</span>' : '') +
          '</div>' +
          (isOpen ? '<p class="recommend-detail">' + card.detail + '</p>' : '') +
          '<button class="card-button' + (state.selectedSlotId === slot.id ? " is-chosen" : "") + '" data-action="choose-slot" data-slot-id="' + slot.id + '">' + (state.selectedSlotId === slot.id ? "✓ 선택됨" : "이 시간 선택") + '</button>' +
        '</article>'
      );
    }).join("");
  }

  function names(items) {
    return items.map(function (item) {
      return item.person.name + "님";
    }).join("과 ");
  }

  function renderConfirm() {
    var slot = slotById(state.selectedSlotId);
    app.innerHTML =
      '<section class="screen">' +
        '<div class="screen-inner">' +
          '<p class="eyebrow">확정 전 확인</p>' +
          '<h1 class="screen-title">이 시간으로 정할까요?</h1>' +
          '<div class="confirm-layout">' +
            '<section class="confirm-panel">' +
              '<div class="selected-time"><strong>' + displayTime(slot) + '</strong><span>1시간 · ' + data.meeting.title + '</span><button class="btn-ghost-dark" data-action="go-compare">다른 시간 보기</button></div>' +
              '<div class="attendee-status">' + renderAttendeeStatus(slot) + '</div>' +
              '<p class="confirm-section-label">확정 전 확인 — 주최자에게만 보여요</p>' +
              '<ul class="summary-list">' + renderSummary(slot) + '</ul>' +
              '<p class="privacy-note">비공개 정보는 노출하지 않아요</p>' +
              '<div class="button-row">' +
                '<button class="btn" data-action="post-confirm">이 시간으로 확정하기</button>' +
              '</div>' +
              '<div class="posted-message ' + (state.posted ? "is-visible" : "") + '" role="status">슬랙 채널에 확정 메시지를 올렸어요. 참석이 어려운 분에게는 결정 내용을 따로 공유해요. 시간을 바꿔야 하면 이 카드에서 다시 조율해요.</div>' +
            '</section>' +
            '<aside class="slack-preview">' +
              '<h2>#q3-kickoff 채널의 조율 카드에 올라가요</h2>' +
              renderSlackPreview(slot) +
            '</aside>' +
          '</div>' +
        '</div>' +
      '</section>';
  }

  function renderAttendeeStatus(slot) {
    if (hasPrivateHardConflict(slot)) {
      // 비공개 하드 제약이 있는 슬롯은 사람별 상태를 그리지 않는다 — 이름 결합 금지 (감사 012-1)
      return '<p class="privacy-note">이 시간은 비공개 사정 때문에 확정하기 어려워요. 다른 시간을 골라주세요.</p>';
    }
    return data.people.map(function (person) {
      var hardConflict = slot.busyConflicts.find(function (item) {
        return item.person.id === person.id;
      });
      var condition = slot.conditional.find(function (item) {
        return item.person.id === person.id;
      });
      var canAttend = !hardConflict;
      // 미응답자는 초록 '참석'으로 단정하지 않는다 — 캘린더 기준 추정임을 배지에도 반영 (F-004)
      var pending = person.responded === false && canAttend;
      var badge = pending ? "참석 예정" : canAttend ? "참석" : (person.attendance === "optional" ? "결과 공유" : "다른 시간 필요");
      var badgeClass = pending ? "is-pending" : (!canAttend && person.attendance === "optional" ? "replace" : "");
      var detail = person.attendance === "required" ? "필수" : "선택";
      if (pending) {
        detail += " · 응답 전이라 캘린더 기준이에요";
      }
      if (!canAttend && person.attendance === "optional") {
        detail = "정해지면 결과를 공유해요";
      }
      if (condition && canAttend) {
        detail = "화상으로 들어와요";
      }
      return (
        '<div class="status-row">' +
          '<div class="status-person">' +
            '<span class="person-dot ' + (person.attendance === "required" ? "is-required" : "is-optional") + '" aria-hidden="true"' + avatarVars(person) + '><span>' + shortInitial(person.name) + '</span></span>' +
            '<div><div class="status-name">' + person.name + '</div><div class="status-detail">' + detail + '</div></div>' +
          '</div>' +
          '<span class="status-badge ' + badgeClass + '">' + badge + '</span>' +
        '</div>'
      );
    }).join("");
  }

  function renderSummary(slot) {
    var items = [];
    if (slot.requiredUnavailable.length === 0) {
      items.push("필수 참석자는 모두 들어와요.");
    } else {
      items.push("필수 참석자 시간이 맞지 않아요.");
    }
    if (slot.optionalUnavailable.length > 0) {
      items.push(names(slot.optionalUnavailable) + "에게는 정해지면 결과를 공유해요.");
    } else {
      items.push("선택 참석자도 들어올 수 있어요. 정해지면 결과도 같이 공유해요.");
    }
    if (burdenCount(slot) > 0) {
      items.push("피하고 싶은 표시가 있어요. 개인 사유는 보이지 않아요.");
    }
    if (slot.conditional.length > 0) {
      items.push("화상으로 들어오는 참석자가 있어요.");
    }
    return items.map(function (item) {
      return "<li>" + item + "</li>";
    }).join("");
  }

  function renderSlackPreview(slot) {
    if (!state.posted) {
      return '<p class="empty-preview">확정하면 이 채널에 올라갈 메시지가 보여요.</p>';
    }
    return (
      '<div class="preview-message">' +
        '<div class="avatar" aria-hidden="true" style="--avatar:#E0E7FF;--avatar-text:#4338CA">서</div>' +
        '<div>' +
          '<div class="message-meta"><span class="message-author">서지우</span><span class="message-time">방금</span></div>' +
          '<strong>' + data.meeting.title + ' 시간이 정해졌어요</strong>' +
          '<p>' + displayTime(slot) + ' · 1시간</p>' +
          '<p class="helper-copy">참석이 어려운 분에게는 결정 내용을 따로 공유해요. 시간을 바꿔야 하면 이 카드에서 다시 조율해요.</p>' +
        '</div>' +
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
            duration: 360,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)"
          }
        );
      });
    });
  }

  app.addEventListener("click", function (event) {
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
    if (action === "go-input") {
      setRoute("input");
    }
    if (action === "go-entry") {
      setRoute("entry");
    }
    if (action === "go-compare") {
      state.posted = false;
      setRoute("compare");
    }
    if (action === "toggle-reason") {
      var personId = target.getAttribute("data-person-id");
      state.openReasonId = state.openReasonId === personId ? null : personId;
      render();
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
      var inputPerson = inputPersonForRoute();
      if (state.inputOptOutByPerson[inputPerson.id]) {
        return;
      }
      if (inputPerson.id === "haneul") {
        state.selectedSoftSlots[miniSlotId] = !softSelectedByDefault(miniSlotId);
      } else {
        state.optionalSoftSlots[miniSlotId] = !state.optionalSoftSlots[miniSlotId];
      }
      render();
    }
    if (action === "toggle-opt-out") {
      var optOutPerson = inputPersonForRoute();
      state.inputOptOutByPerson[optOutPerson.id] = !state.inputOptOutByPerson[optOutPerson.id];
      render();
    }
    if (action === "select-grid-slot") {
      state.selectedSlotId = target.getAttribute("data-slot-id");
      state.activeSlotId = state.selectedSlotId;
      state.openSlotId = state.selectedSlotId;
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
      render();
    }
    if (action === "choose-slot") {
      state.selectedSlotId = target.getAttribute("data-slot-id");
      state.activeSlotId = state.selectedSlotId;
      state.openSlotId = null;
      state.posted = false;
      setRoute("confirm");
    }
    if (action === "post-confirm") {
      state.posted = true;
      render();
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

  app.addEventListener("pointerup", function () {
    if (!state.dragActive) {
      return;
    }
    state.dragActive = false;
    if (state.dragMoved) {
      state.dragMoved = false;
      state.suppressNextSoftToggle = true;
      render();
    }
  });

  app.addEventListener("mouseover", function (event) {
    var cell = event.target.closest ? event.target.closest(".slot-cell") : null;
    if (!cell) {
      return;
    }
    state.activeSlotId = cell.getAttribute("data-slot-id");
    updateActiveSlotDetail();
  });

  app.addEventListener("focusin", function (event) {
    var cell = event.target.closest ? event.target.closest(".slot-cell") : null;
    if (!cell) {
      return;
    }
    state.activeSlotId = cell.getAttribute("data-slot-id");
    updateActiveSlotDetail();
  });

  function updateActiveSlotDetail() {
    if (!app.querySelector) {
      return;
    }
    var detail = app.querySelector("[data-slot-detail]");
    if (detail) {
      detail.innerHTML = slotStatusLine(slotById(state.activeSlotId || state.selectedSlotId));
    }
  }

  if (document.addEventListener) {
    document.addEventListener("click", function (event) {
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
        renderScenarioCard(state.route, true);
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
  if (String(window.location.search || "").indexOf("debug") !== -1) {
    window.PROTOTYPE_DEBUG = {
      featuredSlots: currentFeatured,
      cardOrder: cardOrder,
      scoreAllSlots: scoreAllSlots,
      render: render
    };
  }
  render();
})();
