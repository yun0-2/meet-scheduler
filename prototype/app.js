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
    scenarioFocusReturn: null,
    toastVisible: false,
    toastFading: false,
    toastText: "피하고 싶은 시간을 보냈어요",
    composePosted: false,
    composeAdded: {},
    attendanceOverride: {},
    course: null,
    meetingTitle: null,
    meetingContext: "",
    durationHours: 1,
    composeQuery: "",
    composeSuggestOpen: false,
    composeMessage: "",
    bannerOpen: false
  };

  // 시나리오 카드 카피 — 상황 설명은 제품 화면(#app) 밖, 이 데모 레이어에서만.
  // 데모는 역할별 코스 2개: 주최자(요청→추천→확정), 참석자(입력→반영 확인).
  var scenarioByCourse = {
    host: {
      entry: {
        eyebrow: "1/3 · 주최자",
        body: "당신은 회의를 잡아야 하는 주최자예요.",
        mission: "회의 정보를 확인하고 참석자를 추가해 채널에 보내보세요."
      },
      compare: {
        eyebrow: "2/3 · 주최자",
        body: "며칠 뒤, 참석자들의 응답이 모였어요.",
        mission: "왜 이 시간이 1순위인지 이유를 눌러 확인해보세요."
      },
      confirm: {
        eyebrow: "3/3 · 주최자",
        body: "이제 확정하고 채널에 알릴 차례예요.",
        mission: "확정 후 채널 카드가 어떻게 바뀌는지 보세요."
      }
    },
    guest: {
      input: {
        eyebrow: "1/2 · 참석자",
        body: "동료가 보낸 조율 카드를 받았어요. 캘린더가 모르는 사정이 있죠.",
        mission: "피하고 싶은 시간을 칠하고 제출해보세요."
      },
      "input-optional": {
        eyebrow: "1/2 · 선택 참석자",
        body: "선택 참석자에게는 다른 선택지가 하나 더 있어요.",
        mission: "'참석 어려움'도 눌러보세요."
      },
      compare: {
        eyebrow: "2/2 · 참석자",
        body: "방금 남긴 표시가 추천에 반영됐어요. 이 화면은 주최자에게 보이는 화면이에요.",
        mission: "1순위의 이유에서 내 표시를 확인해보세요."
      }
    }
  };

  function scenarioContentFor(route) {
    if (state.course && scenarioByCourse[state.course][route]) {
      return scenarioByCourse[state.course][route];
    }
    return null;
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
      "목적: " + meetingTitle() + "의 방향을 정하고 다음 액션을 나눠요.",
      "",
      "Agenda",
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
    lines.push("안녕하세요, " + meetingTitle() + " 관련해서");
    lines.push("아래 안건으로 " + durationLabel() + " 정도 싱크를 맞추면 좋을 것 같습니다.");
    if (context) {
      lines.push("");
      lines.push(context);
    }
    lines.push("");
    lines.push("가능하신 시간을 카드에서 한번 표시해주세요.");
    return lines.join("\n");
  }

  // 사람 행 공용 문법 — 아바타 / [이름 + 필수·선택 태그] / 직책(회색).
  // 작성·게시 카드가 같은 두 줄 구조를 쓰도록 한 함수로 뽑음.
  function personIdentityBlock(person, attendance) {
    var isRequired = attendance === "required";
    return (
      '<span class="avatar" aria-hidden="true"' + avatarVars(person) + '>' + initials(person.name) + '</span>' +
      '<div class="compose-row-main">' +
        '<span class="compose-row-line">' +
          '<span class="compose-row-name">' + person.name + '</span>' +
          (isRequired ? '' : '<span class="tag tag-optional">선택</span>') +
        '</span>' +
        '<span class="compose-row-role">' + person.role + '</span>' +
      '</div>'
    );
  }

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

  function meetingDuration() {
    return state.durationHours || 1;
  }

  function durationLabel() {
    var map = { 0.5: "30분", 1: "1시간", 1.5: "90분", 2: "2시간" };
    return map[meetingDuration()] || "1시간";
  }

  // 회의가 점심시간(12–13)이나 근무 종료(18시)를 침범하면 그 시작 시각은 불가
  function slotBlockedByHours(start) {
    var end = start + meetingDuration();
    var lunchStart = data.meeting.workHours.lunch[0];
    var lunchEnd = lunchStart + 1;
    if (end > data.meeting.workHours.end) {
      return true;
    }
    return start < lunchEnd && end > lunchStart;
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
      return "6명이 낮에 다 올 수 있는 시간이에요.";
    }
    return "필수 참석자가 모두 가능한 시간 중 걸리는 게 가장 적어요.";
  }

  function primaryCardDetail(slot) {
    if (hasPrivateBurden(slot)) {
      // 과제 단서 "점심 직후 기피"는 사유(시간대)까지 밝힌다 — 누가·몇 명인지는 계속 숨긴다
      if (data.researchDefaults.postLunchDip.hours.indexOf(slot.start) >= 0) {
        return "점심 직후라 피하고 싶다는 표시가 있어요. 그래도 오후 중 가장 이른 시작이라 그나마 걸리는 게 가장 적어요.";
      }
      return "피하고 싶은 표시가 조금 있어요. 그래도 가장 무난한 시간이에요.";
    }
    return "캘린더 충돌과 피하고 싶은 표시를 같이 보니 가장 무난한 시간이에요.";
  }

  function runnerUpCardCopy(slot) {
    if (slot.optionalUnavailable.length > 0) {
      return "필수 4명은 다 괜찮아요. " + names(slot.optionalUnavailable) + "은 어려운데, 정해지면 결과만 알려드릴까요?";
    }
    return "다음으로 걸리는 게 적은 시간이에요.";
  }

  function runnerUpCardDetail(slot) {
    if (slot.optionalUnavailable.length > 0) {
      return "선택 참석자는 빠져도 회의 결정을 진행할 수 있어요. 대신 결과 공유를 같이 준비해요.";
    }
    return "추천 시간과 비교할 후보로 볼 수 있어요.";
  }

  function stressCardCopy(slot) {
    if (slot.conditional.length > 0) {
      // 비공개 제약은 인원수도 안 센다 (k-익명 원칙)
      return "다 되긴 하는데 금요일 늦은 오후예요. 끝나고 바로 다음 일정이 걸린다는 표시도 있어요.";
    }
    if (hasPrivateBurden(slot)) {
      return "다 되긴 하는데 피하고 싶은 표시가 있어요.";
    }
    return "가능 인원은 많지만 다른 후보보다 여유가 적어요.";
  }

  function stressCardDetail(slot) {
    // 화상은 벌점이 아니므로 강등 이유로 쓰지 않는다 — 진짜 이유(시간대·직후 일정)만
    return "가능 인원만 보면 좋아 보이지만, 걸리는 시간대와 바로 다음 일정까지 보면 여유가 적어요.";
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
    // 역할별 코스 구조: 주최자 저니(요청→추천→확정) 한 묶음, 참석자 저니(입력) 한 묶음.
    var groups = [
      { role: "주최자", steps: [
        { num: 1, hash: "entry", person: jiwoo, label: "요청", active: route === "entry" },
        { num: 2, hash: "compare", person: jiwoo, label: "추천", active: route === "compare" },
        { num: 3, hash: "confirm", person: jiwoo, label: "확정", active: route === "confirm" }
      ] },
      { role: "참석자", steps: [
        { num: 1, hash: isInputOptional ? "input-optional" : "input", person: inputPerson, label: "입력", active: route === "input" || isInputOptional }
      ] }
    ];

    function renderStepButton(step) {
      return (
        '<button type="button" class="demo-nav-btn" data-route="' + step.hash + '" aria-label="' + step.label + '"' + (step.active ? ' aria-current="page"' : '') + '>' +
          '<span class="demo-nav-label">' + step.label + '</span>' +
        '</button>'
      );
    }

    var buttonsHtml = groups.map(function (group) {
      return (
        '<div class="demo-nav-group" role="group" aria-label="' + group.role + ' 단계">' +
          '<span class="demo-nav-role-label" aria-hidden="true">' + group.role + '</span>' +
          group.steps.map(renderStepButton).join("") +
        '</div>'
      );
    }).join('<span class="demo-nav-divider" aria-hidden="true"></span>');

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
    // 코스 미선택 상태의 첫 진입 → 코스 선택 카드부터
    if (!state.course) {
      renderCourseChooser(forceOpen);
      return;
    }
    var content = scenarioContentFor(route);
    if (!content) {
      return;
    }
    var seenKey = state.course + ":" + route;
    if (!forceOpen && state.scenarioSeen[seenKey]) {
      return;
    }
    var layer = getScenarioLayer();
    if (!layer) {
      return;
    }
    state.scenarioSeen[seenKey] = true;
    openScenarioOverlay(layer,
      '<div class="scenario-card" role="dialog" aria-modal="true" aria-label="' + content.eyebrow + '">' +
        '<p class="scenario-eyebrow">' + content.eyebrow + '</p>' +
        '<p class="scenario-body">' + content.body + '</p>' +
        '<p class="scenario-mission">' + content.mission + '</p>' +
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
    var focusBtn = layer.querySelector ? layer.querySelector(".scenario-start-btn, .course-btn") : null;
    if (focusBtn && focusBtn.focus) {
      focusBtn.focus();
    }
  }

  function renderCourseChooser(forceOpen) {
    if (!forceOpen && state.scenarioSeen["course-chooser"]) {
      return;
    }
    var layer = getScenarioLayer();
    if (!layer) {
      return;
    }
    state.scenarioSeen["course-chooser"] = true;
    openScenarioOverlay(layer,
      '<div class="scenario-card" role="dialog" aria-modal="true" aria-label="데모 코스 선택">' +
        '<p class="scenario-eyebrow">3분 데모</p>' +
        '<p class="scenario-body">회의 시간을 정하는 두 입장을 각각 체험할 수 있어요.</p>' +
        '<div class="course-buttons">' +
          '<button type="button" class="course-btn" data-action="choose-course" data-course="host">주최자로 체험하기<span class="course-sub">요청 만들기 → 추천 → 확정</span></button>' +
          '<button type="button" class="course-btn" data-action="choose-course" data-course="guest">참석자로 체험하기<span class="course-sub">피하고 싶은 시간 남기기 → 반영 확인</span></button>' +
        '</div>' +
      '</div>');
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
    var jiwoo = getPerson("jiwoo");
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
            (state.composePosted ? renderMeetingBanner() : '') +
            '<div class="message-thread">' +
              '<article class="message">' +
                '<div class="avatar" aria-hidden="true"' + avatarVars(jiwoo) + '>' + initials(jiwoo.name) + '</div>' +
                '<div>' +
                  '<div class="message-meta"><span class="message-author">서지우</span><span class="message-time">오전 10:04</span></div>' +
                  (state.composePosted ? (renderPostedMessageText() + renderPostedCard()) : renderComposeCard(jiwoo)) +
                '</div>' +
              '</article>' +
            '</div>' +
          '</section>' +
        '</div>' +
      '</section>' +
      renderToast();
  }

  // 채널 상단 배너 — 예정 회의가 있으면 공지처럼 떠 있고, 펼치면 응답 현황
  function renderMeetingBanner() {
    var people = activePeople();
    var waiting = unrespondedPeople();
    var responded = people.length - waiting.length;
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
          '<span class="banner-title">예정 회의 · ' + meetingTitle() + '</span>' +
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
    var heading = state.composeQuery.trim()
      ? ""
      : '<p class="compose-suggest-label">' + meetingTitle() + ' 관련 일정에서 자주 함께한 동료</p>';
    if (items.length === 0) {
      return heading + '<p class="compose-suggest-empty">일치하는 동료가 없어요</p>';
    }
    return heading + items.map(renderCandidateRow).join("");
  }

  function renderComposeCard(jiwoo) {
    var addedCount = composeCandidates().filter(isComposeAdded).length;
    var addedRows = renderOrganizerRow(jiwoo) + composeCandidates().filter(isComposeAdded).map(renderAddedRow).join("");
    return (
      '<div class="schedule-card compose-card">' +
        '<p class="card-kicker">회의 시간 정하기</p>' +
        '<input class="compose-title-input" id="compose-title" type="text" value="' + escapeAttr(meetingTitle()) + '" aria-label="회의 이름" />' +
        '<p class="compose-section-label">설명 <span class="compose-section-caption">인비에 함께 나가요 — 비워두면 제안이 그대로</span></p>' +
        '<textarea class="compose-context-input" id="compose-context" rows="5" placeholder="' + escapeAttr(suggestedDescription()).replace(/\n/g, '&#10;') + '" aria-label="회의 설명">' + escapeText(state.meetingContext) + '</textarea>' +
        '<div class="meeting-facts">' +
          '<label class="fact-select-wrap">소요 시간 ' +
            '<select id="compose-duration" class="fact-select" aria-label="소요 시간">' +
              [[0.5, "30분"], [1, "1시간"], [1.5, "90분"], [2, "2시간"]].map(function (opt) {
                return '<option value="' + opt[0] + '"' + (meetingDuration() === opt[0] ? " selected" : "") + '>' + opt[1] + '</option>';
              }).join("") +
            '</select>' +
          '</label>' +
          '<span class="fact-pill">' + data.meeting.deadline + '</span>' +
        '</div>' +
        '<p class="compose-section-label">참석자</p>' +
        '<div class="compose-search-wrap">' +
          '<input class="compose-search-input" id="compose-search" type="text" value="' + escapeAttr(state.composeQuery) + '" placeholder="이름으로 추가" aria-label="참석자 검색" autocomplete="off" />' +
          '<div class="compose-suggestions' + (state.composeSuggestOpen ? " is-open" : "") + '" id="compose-suggestions">' + renderComposeSuggestions() + '</div>' +
        '</div>' +
        '<div class="compose-list">' + addedRows + '</div>' +
        '<p class="compose-section-label">채널에 보낼 메시지 <span class="compose-section-caption">비워두면 제안 문안이 그대로 나가요</span></p>' +
        '<textarea class="compose-message-input" id="compose-message" rows="7" aria-label="채널에 보낼 메시지" placeholder="' + escapeAttr(suggestedMessage()).replace(/\n/g, '&#10;') + '">' + escapeText(state.composeMessage) + '</textarea>' +
        '<button type="button" class="compose-accept-chip" data-action="compose-accept-message">제안 그대로 쓰기</button>' +
        '<button class="btn btn-full compose-send-btn" data-action="post-compose"' + (addedCount === 0 ? " disabled" : "") + '>채널에 보내기</button>' +
      '</div>'
    );
  }

  function renderOrganizerRow(jiwoo) {
    return (
      '<div class="compose-row is-organizer">' +
        personIdentityBlock(jiwoo, "required") +
      '</div>'
    );
  }

  function renderCandidateRow(person) {
    var reason = suggestReason[person.id];
    return (
      '<div class="compose-row">' +
        personIdentityBlock(person, effectiveAttendance(person)) +
        '<div class="compose-row-controls">' +
          (reason ? '<span class="compose-evidence-chip">' + reason + '</span>' : '') +
          '<button type="button" class="btn btn-secondary btn-small compose-add-btn" data-action="compose-add" data-person-id="' + person.id + '" aria-label="' + person.name + ' 참석자로 추가">+ 추가</button>' +
        '</div>' +
      '</div>'
    );
  }

  function renderAddedRow(person) {
    var attendance = effectiveAttendance(person);
    return (
      '<div class="compose-row is-added">' +
        personIdentityBlock(person, attendance) +
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
        '<p class="card-kicker">회의 시간 정하기</p>' +
        '<h2>' + meetingTitle() + '</h2>' +
        '<div class="meeting-facts">' +
          '<span class="fact-pill">' + durationLabel() + '</span>' +
          '<span class="fact-pill">' + data.meeting.deadline + '</span>' +
          '<span class="fact-pill">참석자 ' + activePeople().length + '명</span>' +
        '</div>' +
        '<div class="participant-strip">' + renderParticipantRows() + '</div>' +
        renderResponseStatusLine() +
        '<button class="btn" data-action="go-compare">추천 보기</button>' +
      '</div>'
    );
  }

  // 주최자가 채널 카드에서 보는 응답 현황
  function renderResponseStatusLine() {
    var people = activePeople();
    var waiting = unrespondedPeople();
    var responded = people.length - waiting.length;
    var text = "응답 " + responded + "/" + people.length;
    if (waiting.length > 0) {
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
    app.innerHTML =
      '<section class="screen screen-mobile">' +
        '<div class="mobile-stage">' +
          '<div class="phone-frame" role="region" aria-label="참석자 입력 화면">' +
            '<div class="phone-status"><span>Slack 링크</span><span>' + person.name + '</span></div>' +
            '<div class="phone-body">' +
              '<section class="context-card compact">' +
                '<p class="eyebrow">' + meetingTitle() + ' · ' + (effectiveAttendance(person) === "required" ? "필수" : "선택") + '</p>' +
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
        // 내 캘린더의 일정 — 본인 화면이라 비공개 하드(예: 학원)도 제목 노출 OK
        var hardInfo = participantHardForInput(person, day, hour);
        var hard = Boolean(hardInfo);
        var hardLabel = hard ? (hardInfo.title || hardInfo.label || "") : "";
        var soft = !hard && !optedOut && softSelectedForInput(person, id);
        var video = !hard && conditionalStatus(person, day);
        var disabled = hard || optedOut;
        var label = day + "요일 " + hour + "시, " + (hard ? (hardLabel ? hardLabel + " 일정이 있어요" : "안 되는 시간") : optedOut ? "비활성화된 시간" : soft ? "피하고 싶은 시간" : "가능한 시간");
        if (video) {
          label += ", 화상 참여 가능";
        }
        html +=
          '<button class="mini-slot' + (hard ? " is-hard" : "") + (soft ? " is-soft" : "") + (video ? " has-video" : "") + '" ' +
          'data-action="toggle-soft" data-slot-id="' + id + '" aria-label="' + label + '" ' + (disabled ? "disabled" : "") + (soft ? ' title="표시한 시간이에요"' : "") + '>' +
            (hard && hardLabel ? '<span class="mini-slot-label">' + escapeText(hardLabel) + '</span>' : '') +
            (video ? '<span class="mini-video-badge" aria-hidden="true"></span>' : '') +
          '</button>';
      });
    });

    return html;
  }

  function renderInputLegend() {
    return (
      '<div class="legend legend-input" role="group" aria-label="입력 범례">' +
        '<span class="legend-item"><span class="legend-swatch is-busy" aria-hidden="true"></span>내 일정</span>' +
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
              '<p class="screen-subtitle">모두 완벽한 시간은 없어요. 캘린더 일정과 직접 남긴 표시를 함께 보고, 걸리는 게 적은 순서로 정리했어요.</p>' +
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
      '</section>' +
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
    var waiting = unrespondedPeople();
    if (waiting.length === 0) {
      return '<p class="response-line">' + activePeople().length + '명 모두 응답했어요</p>';
    }
    var respondedCount = activePeople().length - waiting.length;
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
        '<button class="' + (state.sortMode === "recommended" ? "is-active" : "") + '" aria-pressed="' + String(state.sortMode === "recommended") + '" data-action="sort-mode" data-sort-mode="recommended">걸리는 게 적은 순</button>' +
        '<button class="' + (state.sortMode === "availability" ? "is-active" : "") + '" aria-pressed="' + String(state.sortMode === "availability") + '" data-action="sort-mode" data-sort-mode="availability">가능한 사람 많은 순</button>' +
      '</div>'
    );
  }

  function renderLegend() {
    return (
      '<div class="legend" role="group" aria-label="격자 범례">' +

        '<span class="legend-item"><span class="legend-ramp" aria-hidden="true"><span class="is-low"></span><span class="is-mid"></span><span class="is-high"></span></span>여유</span>' +
        '<span class="legend-item"><span class="legend-dot" aria-hidden="true"></span>피하고 싶은 표시 있음</span>' +
      '</div>'
    );
  }

  function renderScheduleGrid(featured) {
    // 후보 순위(카드와 동일 계산)를 격자 표면에 1:1로 연결
    var rankBySlot = {};
    recommendedCards().forEach(function (card) {
      rankBySlot[card.slot.id] = card.recommendedRank;
    });
    var html = '<div class="grid-corner">시간</div>';
    data.meeting.days.forEach(function (day) {
      html += '<div class="grid-day">' + day + '</div>';
    });

    var lunchStart = data.meeting.workHours.lunch[0];
    slotHours.forEach(function (hour) {
      if (hour === lunchStart + 1) {
        // 12시 점심 행 — 시스템이 잠근 시간은 회색 비활성 (격자 의미 체계 §4)
        html += '<div class="grid-time is-lunch">' + String(lunchStart).padStart(2, "0") + ':00</div>' +
          '<div class="grid-lunch-band" role="note" aria-label="' + lunchStart + '시 점심시간, 후보에서 제외">점심시간</div>';
      }
      html += '<div class="grid-time">' + String(hour).padStart(2, "0") + ':00</div>';
      data.meeting.days.forEach(function (day) {
        var slot = slotById(slotId(day, hour));
        var selected = state.selectedSlotId === slot.id;
        var recommended = slot.id === featured.recommended.id;
        var active = state.activeSlotId === slot.id;
        var open = state.openSlotId === slot.id;
        var unavailable = isUnavailableSlot(slot);
        // 격자 표면에도 부담 신호를 올린다 — 호버/팝업 뒤에만 숨기면
        // When2meet류 여유 히트맵과 첫인상이 같아져 이 도구의 차별점(소프트·비공개
        // 부담 반영)이 안 보인다. 인원수·이름은 여전히 절대 노출하지 않는다(k-익명).
        // 세모는 본인이 직접 남긴 표시(privateSoft)만 — 추론·통념까지 그리면
        // 후보마다 전부 표시가 붙는 부조리가 된다. 약한 신호는 카드 문장의 몫.
        var privateBurden = !unavailable && slot.privateSoft.length > 0;
        var rankLabel = !unavailable ? rankBySlot[slot.id] : null;
        html +=
          '<button class="slot-cell availability-' + availabilityLevel(slot) + (unavailable ? " is-unavailable" : "") + (privateBurden ? " has-private-burden" : "") + (selected ? " is-selected" : "") + (recommended ? " is-recommended" : "") + (active ? " is-active" : "") + (open ? " is-open" : "") + '" ' +
          'data-action="select-grid-slot" data-slot-id="' + slot.id + '" aria-label="' + slotAria(slot, recommended) + '">' +
            (rankLabel ? '<span class="rank-tag' + (rankLabel === "1순위" ? " is-first" : "") + '">' + rankLabel + '</span>' : '') +
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
    if (slot.privateSoft.length > 0) {
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

  function renderSlotPopover(slot) {
    // 아바타 회색 처리 문법 — 불참(회색 흐림)·미응답(반투명)은 범례 없이 읽힌다.
    // 이름별 설명 문장은 과설명이라 쓰지 않는다.
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
      (slot.privateSoft.length > 0 ? '<span class="popover-note">피하고 싶다는 표시가 있어요</span>' : '') +
      (hasPrivateHardConflict(slot) ? '<span class="popover-note">사정이 있어 어려운 사람이 있어요</span>' : '')
    );
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
          '<button class="card-button' + (index > 0 ? " is-secondary" : "") + (state.selectedSlotId === slot.id ? " is-chosen" : "") + '" data-action="choose-slot" data-slot-id="' + slot.id + '">' + (state.selectedSlotId === slot.id ? "✓ 선택됨" : "이 시간 선택") + '</button>' +
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
              '<div class="selected-time"><strong>' + displayTime(slot) + '</strong><span>' + durationLabel() + ' · ' + meetingTitle() + '</span><button class="btn-ghost-dark" data-action="go-compare">다른 시간 보기</button></div>' +
              '<div class="attendee-status">' + renderAttendeeStatus(slot) + '</div>' +
              '<p class="confirm-section-label">확정 전 확인 — 주최자에게만 보여요</p>' +
              '<ul class="summary-list">' + renderSummary(slot) + '</ul>' +
              '<p class="privacy-note">비공개 정보는 노출하지 않아요</p>' +
              '<div class="button-row">' +
                '<button class="btn" data-action="post-confirm"' + (state.posted ? " disabled" : "") + '>' + (state.posted ? "확정됨 ✓" : "이 시간으로 확정하기") + '</button>' +
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
      // 비공개 하드 제약이 있는 슬롯은 사람별 상태를 그리지 않는다 — 이름 결합 금지
      return '<p class="privacy-note">이 시간은 비공개 사정 때문에 확정하기 어려워요. 다른 시간을 골라주세요.</p>';
    }
    return activePeople().map(function (person) {
      var attendance = effectiveAttendance(person);
      var hardConflict = slot.busyConflicts.find(function (item) {
        return item.person.id === person.id;
      });
      var condition = slot.conditional.find(function (item) {
        return item.person.id === person.id;
      });
      var canAttend = !hardConflict;
      // 미응답자는 초록 '참석'으로 단정하지 않는다 — 캘린더 기준 추정임을 배지에도 반영 (F-004)
      var pending = person.responded === false && canAttend;
      var badge = pending ? "참석 예정" : canAttend ? "참석" : (attendance === "optional" ? "결과 공유" : "다른 시간 필요");
      var badgeClass = pending ? "is-pending" : (!canAttend && attendance === "optional" ? "replace" : "");
      var detail = attendance === "required" ? "필수" : "선택";
      if (pending) {
        detail += " · 응답 전이라 캘린더 기준이에요";
      }
      if (!canAttend && attendance === "optional") {
        detail = "정해지면 결과를 공유해요";
      }
      if (condition && canAttend) {
        detail = "화상으로 들어와요";
      }
      return (
        '<div class="status-row">' +
          '<div class="status-person">' +
            '<span class="person-dot ' + (attendance === "required" ? "is-required" : "is-optional") + '" aria-hidden="true"' + avatarVars(person) + '><span>' + initials(person.name) + '</span></span>' +
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
    var jiwoo = getPerson("jiwoo");
    return (
      '<div class="preview-message">' +
        '<div class="avatar" aria-hidden="true"' + avatarVars(jiwoo) + '>' + initials(jiwoo.name) + '</div>' +
        '<div>' +
          '<div class="message-meta"><span class="message-author">서지우</span><span class="message-time">방금</span></div>' +
          '<strong>' + meetingTitle() + ' 시간이 정해졌어요</strong>' +
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
    if (sel && sel.id === "compose-duration") {
      state.durationHours = parseFloat(sel.value);
      render();
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
      syncComposeMessagePlaceholder();
      return;
    }
    if (field.id === "compose-message") {
      // 직접 타이핑 = 자기 글. placeholder(제안 문안)는 브라우저가 알아서 숨긴다.
      state.composeMessage = field.value;
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
    // 검색 오버레이 바깥 클릭이면 닫는다 (오버레이 안 행 클릭은 wrap 안이라 유지)
    if (state.composeSuggestOpen) {
      var inWrap = event.target.closest ? event.target.closest(".compose-search-wrap") : null;
      if (!inWrap) {
        closeComposeSuggest();
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
    if (action === "go-input") {
      setRoute("input");
    }
    if (action === "go-entry") {
      setRoute("entry");
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
      // 연속 추가 — 오버레이는 열린 채로 두고 검색 입력으로 포커스 복귀
      state.composeSuggestOpen = true;
      render();
      var searchEl = document.getElementById && document.getElementById("compose-search");
      if (searchEl && searchEl.focus) {
        searchEl.focus();
      }
    }
    if (action === "compose-accept-message") {
      acceptSuggestedMessage();
    }
    if (action === "compose-remove") {
      var removeId = target.getAttribute("data-person-id");
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
    if (action === "post-compose") {
      if (target.disabled) {
        return;
      }
      state.composePosted = true;
      state.toastVisible = true;
      state.toastFading = false;
      state.toastText = "채널에 보냈어요";
      scheduleToastDismiss();
      if (window.location.hash !== "#compare") {
        setRoute("compare");
        return;
      }
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
    var cell = event.target.closest ? event.target.closest(".slot-cell") : null;
    if (!cell) {
      return;
    }
    state.activeSlotId = cell.getAttribute("data-slot-id");
    updateActiveSlotDetail();
  });

  app.addEventListener("focusin", function (event) {
    // 검색창에 포커스가 오면 제안 오버레이를 연다 (전체 재렌더 없이 클래스만 토글 — 포커스 보존)
    if (event.target && event.target.id === "compose-search") {
      openComposeSuggest();
      return;
    }
    var cell = event.target.closest ? event.target.closest(".slot-cell") : null;
    if (!cell) {
      return;
    }
    state.activeSlotId = cell.getAttribute("data-slot-id");
    updateActiveSlotDetail();
  });

  // 제안 수락 — value가 비어 있을 때 Tab/→ (keydown 캡처, 기본 포커스 이동 막음)
  app.addEventListener("keydown", function (event) {
    var field = event.target;
    if (!field || (event.key !== "Tab" && event.key !== "ArrowRight") || field.value) {
      return;
    }
    if (field.id === "compose-message") {
      event.preventDefault();
      acceptSuggestedMessage();
    } else if (field.id === "compose-context") {
      event.preventDefault();
      state.meetingContext = suggestedDescription();
      field.value = state.meetingContext;
      syncComposeMessagePlaceholder();
    }
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
      var courseBtn = event.target.closest ? event.target.closest("[data-action='choose-course']") : null;
      if (courseBtn) {
        state.course = courseBtn.getAttribute("data-course");
        closeScenarioCard();
        var target = state.course === "guest" ? "input" : "entry";
        if (("#" + target) === window.location.hash) {
          render();
          renderScenarioCard(target, false);
        } else {
          setRoute(target);
        }
        return;
      }
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
