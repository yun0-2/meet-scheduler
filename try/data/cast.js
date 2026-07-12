window.CAST = {
  "$comment": "6인 캐스트 mock 데이터. 원본: plan/02-cast-final.md. 참석 무게(attendance)는 라벨이 아니라 안건과의 관계(attendanceReason)에서 파생된다. 프로토타입이 이 파일을 읽는다.",
  "meeting": {
    "title": "어드민 대시보드 킥오프",
    "durationMinutes": 60,
    "deadline": "다음 주 금요일까지",
    "workHours": {
      "start": 9,
      "end": 18,
      "lunch": [
        12,
        13
      ]
    },
    "days": [
      "월",
      "화",
      "수",
      "목",
      "금"
    ]
  },
  "people": [
    {
      "id": "jiwoo",
      "name": "서지우",
      "role": "PM · 주최자",
      "attendance": "required",
      "avatarColor": "#E0E7FF",
      "avatarText": "#4338CA",
      "responded": true,
      "attendanceReason": "안건을 발제하고 실행을 챙기는 주최자예요",
      "isOrganizer": true,
      "approvalRole": false,
      "busy": [
        {
          "day": "월",
          "start": 9,
          "end": 11,
          "title": "스프린트 플래닝"
        },
        {
          "day": "화",
          "start": 14,
          "end": 15,
          "title": "1:1"
        },
        {
          "day": "금",
          "start": 11,
          "end": 12,
          "title": "미팅"
        },
        {
          "day": "금",
          "start": 13,
          "end": 14,
          "title": "미팅"
        }
      ],
      "constraints": []
    },
    {
      "id": "taeho",
      "name": "김태호",
      "role": "팀장",
      "attendance": "required",
      "avatarColor": "#CCFBF1",
      "avatarText": "#0F766E",
      "responded": true,
      "attendanceReason": "킥오프 결정을 승인해야 해서 꼭 필요해요",
      "isOrganizer": false,
      "approvalRole": true,
      "busy": [
        {
          "day": "월",
          "start": 10,
          "end": 12,
          "title": "리더십 미팅"
        },
        {
          "day": "월",
          "start": 15,
          "end": 17,
          "title": "협력사 미팅"
        },
        {
          "day": "화",
          "start": 9,
          "end": 11,
          "title": "채용 인터뷰"
        },
        {
          "day": "수",
          "start": 14,
          "end": 17,
          "title": "임원보고 준비·보고"
        },
        {
          "day": "목",
          "start": 14,
          "end": 16,
          "title": "임원보고 후속"
        },
        {
          "day": "금",
          "start": 9,
          "end": 11,
          "title": "주간회의"
        }
      ],
      "constraints": [
        {
          "type": "soft",
          "visibility": "inferred",
          "rule": {
            "preferBefore": 12
          },
          "label": "오전 선호",
          "source": "최근 3개월 수락 이력에서 추론 (본인 선언 아님)"
        }
      ]
    },
    {
      "id": "minjun",
      "name": "박민준",
      "role": "핵심 실무자",
      "attendance": "required",
      "avatarColor": "#FCE7F3",
      "avatarText": "#BE185D",
      "responded": false,
      "attendanceReason": "킥오프 내용의 절반이 민준님 파트예요",
      "isOrganizer": false,
      "approvalRole": false,
      "busy": [
        {
          "day": "화",
          "start": 9,
          "end": 18,
          "title": "외근 (현장)"
        },
        {
          "day": "목",
          "start": 9,
          "end": 18,
          "title": "외근 (현장)"
        },
        {
          "day": "월",
          "start": 13,
          "end": 14,
          "title": "미팅"
        },
        {
          "day": "수",
          "start": 10,
          "end": 11,
          "title": "미팅"
        },
        {
          "day": "금",
          "start": 14,
          "end": 16,
          "title": "고객 미팅"
        }
      ],
      "constraints": []
    },
    {
      "id": "haneul",
      "name": "이하늘",
      "role": "주니어",
      "attendance": "required",
      "avatarColor": "#EDE9FE",
      "avatarText": "#6D28D9",
      "responded": true,
      "attendanceReason": "실무 배정을 직접 받아야 해요",
      "isOrganizer": false,
      "approvalRole": false,
      "busy": [
        {
          "day": "수",
          "start": 11,
          "end": 12,
          "title": "팀 스터디"
        }
      ],
      "constraints": [
        {
          "type": "soft",
          "visibility": "private",
          "rule": {
            "avoidStartAt": 13
          },
          "label": "점심 직후 부담",
          "source": "비공개 입력 — 화면에는 k-익명 집계로만 노출 (displayRules.kAnonymity 참조)"
        },
        {
          "type": "soft",
          "visibility": "private",
          "rule": {
            "unavailableAfter": 17
          },
          "label": "17시 이후 피하고 싶음",
          "source": "본인 상시 표시 — 바꿀 수 있음"
        }
      ]
    },
    {
      "id": "sua",
      "name": "정수아",
      "role": "데이터팀 · 협업부서",
      "attendance": "optional",
      "avatarColor": "#E0F2FE",
      "avatarText": "#0369A1",
      "responded": true,
      "attendanceReason": "정해진 내용만 확인해도 충분해요",
      "isOrganizer": false,
      "approvalRole": false,
      "busy": [
        {
          "day": "월",
          "start": 13,
          "end": 17,
          "title": "데이터팀 블록"
        },
        {
          "day": "화",
          "start": 9,
          "end": 12,
          "title": "분석 리뷰"
        },
        {
          "day": "수",
          "start": 9,
          "end": 12,
          "title": "쿼리 마감"
        },
        {
          "day": "수",
          "start": 14,
          "end": 16,
          "title": "미팅"
        },
        {
          "day": "목",
          "start": 10,
          "end": 12,
          "title": "미팅"
        },
        {
          "day": "금",
          "start": 9,
          "end": 11,
          "title": "주간 정리"
        }
      ],
      "constraints": [
        {
          "type": "note",
          "visibility": "private",
          "label": "결정사항만 확인해도 충분",
          "source": "비공개 입력 → 불참 보호장치(요약 공유) 트리거"
        }
      ]
    },
    {
      "id": "seyoung",
      "name": "오세영",
      "role": "시니어 · 도메인 전문가",
      "attendance": "optional",
      "avatarColor": "#DCFCE7",
      "avatarText": "#15803D",
      "responded": true,
      "attendanceReason": "의견은 미리 전달할 수도 있어요",
      "isOrganizer": false,
      "approvalRole": false,
      "busy": [
        {
          "day": "월",
          "start": 9,
          "end": 18,
          "title": "외부 컨퍼런스"
        },
        {
          "day": "수",
          "start": 9,
          "end": 10,
          "title": "미팅"
        }
      ],
      "constraints": [],
      "attendanceModes": [
        {
          "day": "금",
          "mode": "video",
          "label": "금요일은 화상으로 참여해요"
        }
      ]
    }
  ],
  "researchDefaults": {
    "$comment": "리서치 기반 기본 소프트 페널티. 설명 우선순위 3순위(타이브레이커)로만 사용 — 본인 입력·캘린더 하드보다 앞세우지 않는다 (레드팀 006-5)",
    "postLunchDip": {
      "hours": [
        13,
        14,
        15
      ],
      "weight": "low",
      "evidence": "14개 연구 메타리뷰: 14–16시 수행능력 저하"
    },
    "mondayMorning": {
      "day": "월",
      "before": 12,
      "weight": "low",
      "evidence": "밀린 업무 처리 시간대"
    },
    "fridayLateAfternoon": {
      "day": "금",
      "after": 15,
      "weight": "medium",
      "evidence": "집중 최저 15–18시 (Slack 설문 71%)"
    }
  },
  "displayRules": {
    "$comment": "레드팀 006 반영 — 프로토타입 UI가 반드시 지켜야 하는 표시 원칙",
    "kAnonymity": {
      "threshold": 3,
      "belowThresholdCopy": "이 시간대에 비공개 부담이 있어요",
      "aboveThresholdCopy": "{n}명이 이 시간대 부담을 표시했어요",
      "why": "6명 팀에서 '1명'은 특정 가능한 개인정보다"
    },
    "explanationPriority": [
      "1순위: 본인이 입력한 제약 (하드/소프트)",
      "2순위: 캘린더 하드 충돌 (busy)",
      "3순위: researchDefaults (타이브레이커로만, 단정 금지)"
    ],
    "recommendLabel": "현재 입력 기준 합의 비용이 가장 낮아요",
    "weightLanguage": "가중치는 직급이 아니라 승인 역할(approvalRole)·참석 구분(attendance)에서만 나온다. 숨은 제약은 직급 무관 동일 보호."
  },
  "keySlots": {
    "$comment": "지형 검증 결과 (plan/02). 하드코딩 금지 — 프로토타입은 이 값을 계산으로 재현해야 하며, 이 블록은 계산 결과의 기대값(테스트 픽스처)이다.",
    "recommended": {
      "day": "수",
      "start": 13,
      "why": "6인 전원 하드 OK 유일한 낮 슬롯. 비공개 소프트 부담 있음(k-익명 표시)"
    },
    "runnerUp": {
      "day": "수",
      "start": 9,
      "why": "필수 4인 부담 제로. 선택 2인 불가 → 불참 보호장치 제안"
    },
    "stressTest": {
      "day": "금",
      "start": 16,
      "why": "6/6 하드 OK — 인원수만 세는 로직의 1위. 비공개 부담·화상 제약으로 강등되는 스트레스 테스트 케이스"
    },
    "decisionFork": {
      "day": "월",
      "start": 16,
      "why": "승인 역할 참석 불가 → '승인 없이 진행?' 갈림길"
    }
  }
};
