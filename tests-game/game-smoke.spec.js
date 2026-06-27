import { expect, test } from '@playwright/test';

async function setupGame(page, config) {
  await page.evaluate(async (payload) => {
    const app = window.__summerGame;
    if (!app) {
      throw new Error('game app is not ready');
    }

    const cloneCard = (name) => {
      const source = app.cards.find((card) => card.cardName === name);
      if (!source) {
        throw new Error(`card not found: ${name}`);
      }
      const card = JSON.parse(JSON.stringify(source));
      card.instanceId = `${name}-${Math.random().toString(16).slice(2)}`;
      return card;
    };

    if (payload.difficulty) {
      await app.loadDifficulty(payload.difficulty, { preserveState: false });
    }

    if (typeof payload.turnIndex === 'number') {
      app.state.turnIndex = payload.turnIndex;
      app.refreshTurnStateForCurrentTurn();
    }

    if (payload.phase) {
      app.state.phase = payload.phase;
    }

    if (typeof payload.trainingDrawsLeft === 'number') {
      app.state.trainingDrawsLeft = payload.trainingDrawsLeft;
    }

    if (typeof payload.summerPrepTotal === 'number') {
      app.state.summerPrepTotal = payload.summerPrepTotal;
    }

    if (typeof payload.summerPrepCompleted === 'number') {
      app.state.summerPrepCompleted = payload.summerPrepCompleted;
    }

    if (payload.hand) {
      app.state.hand = payload.hand.map(cloneCard);
      app.state.lastDrawId = app.state.hand[0]?.instanceId ?? null;
    }

    if (payload.assignments) {
      app.state.assignments = { ...payload.assignments };
    }

    if (payload.staffDecks) {
      for (const [staffKey, names] of Object.entries(payload.staffDecks)) {
        app.state.staffDecks[staffKey] = names.map(cloneCard);
      }
    }

    if (payload.staffFlipped) {
      for (const [staffKey, cardNames] of Object.entries(payload.staffFlipped)) {
        app.state.staffFlipped[staffKey] = new Set(
          app.state.staffDecks[staffKey]
            .filter((card) => cardNames.includes(card.cardName))
            .map((card) => card.instanceId),
        );
      }
    }

    if (payload.staffMidRestRecord) {
      app.state.staffMidRestRecord = {
        ...app.state.staffMidRestRecord,
        ...payload.staffMidRestRecord,
      };
    }

    if (payload.summerActionSelections) {
      app.state.summerActionSelections = {
        ...app.state.summerActionSelections,
        ...payload.summerActionSelections,
      };
    }

    if (payload.albaChoiceIndex !== undefined) {
      app.state.albaChoiceIndex = payload.albaChoiceIndex;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'tokens')) {
      app.state.tokens = payload.tokens ? { ...payload.tokens } : payload.tokens;
    }

    if (payload.trainingPools) {
      for (const [poolType, categories] of Object.entries(payload.trainingPools)) {
        for (const [category, names] of Object.entries(categories)) {
          app.trainingPools[poolType][category] = names.map(cloneCard);
        }
      }
    }

    if (payload.trainingDiscards) {
      for (const [poolType, categories] of Object.entries(payload.trainingDiscards)) {
        for (const [category, names] of Object.entries(categories)) {
          app.trainingDiscards[poolType][category] = names.map(cloneCard);
        }
      }
    }

    app.pendingMeeting = payload.pendingMeeting ?? null;
    app.pendingSummerPrep = payload.pendingSummerPrep ?? null;
    app.pendingSummerInspiration = payload.pendingSummerInspiration ?? null;
    if (Object.prototype.hasOwnProperty.call(payload, 'summerMeetingSelectionId')) {
      app.state.summerMeetingSelectionId = payload.summerMeetingSelectionId;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'summerMeetingInspirationSelectionId')) {
      app.state.summerMeetingInspirationSelectionId = payload.summerMeetingInspirationSelectionId;
    }
    app.render();
  }, config);
}

test('通常期の教室行動でアルバイト講師候補を選んで次ターンへ進める', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    phase: 'action',
    trainingDrawsLeft: 0,
    hand: [
      '元塾生に講習案内',
      '宿題チェック',
      '提出書類ファイリング',
      '休み時間トーク',
    ],
    assignments: {
      0: 'leader',
      1: 'teacher',
      2: 'office',
    },
  });

  await expect(page.locator('#actionArea')).toBeVisible();
  await page.locator('#actionConfirm').click();

  await expect(page.locator('#meetingArea')).toBeVisible();
  await expect(page.locator('#meetingChoices .meeting-card-button')).toHaveCount(1);
  await page.locator('#meetingChoices .meeting-card-button').click();
  await page.locator('#meetingConfirm').click();

  await expect(page.locator('#turnPill')).toContainText('第2ターン');
  await expect(page.locator('#menuDecks')).toContainText('アルバイト講師');
});

test('PRO開始時のトークン表示とFRESH非表示を切り替えられる', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'pro',
    tokens: { passion: 3, inspiration: 0, organize: 0 },
  });

  await expect(page.locator('#tokenDisplay')).toBeVisible();
  await expect(page.locator('#tokenDisplay')).toContainText('情熱 3');
  await expect(page.locator('#tokenDisplay')).toContainText('発想 0');
  await expect(page.locator('#tokenDisplay')).toContainText('整理 0');

  await setupGame(page, {
    difficulty: 'fresh',
    tokens: null,
  });

  await expect(page.locator('#tokenDisplay')).toBeHidden();
});

test('講習期準備でトップ3枚から1枚を交換できる', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    turnIndex: 4,
    phase: 'summer-prep',
    summerPrepTotal: 1,
    summerPrepCompleted: 0,
    staffDecks: {
      leader: ['問合対応の基本'],
      teacher: ['質問対応の基本'],
      office: ['生徒面談の基本'],
      alba: ['経理精算の基本'],
    },
    trainingPools: {
      地域: {
        動員: ['チラシ折り', '元塾生に講習案内', '兄弟紹介'],
      },
    },
    trainingDiscards: {
      地域: {
        動員: [],
      },
    },
  });

  await expect(page.locator('#summerPrepPanel')).toBeVisible();
  await page.locator('#summerDeckChoices [data-summer-category="動員"]').click();

  await expect(page.locator('#summerCandidateArea .summer-card-button')).toHaveCount(3);
  await page.locator('#summerCandidateArea .summer-card-button').first().click();
  await page.locator('#summerDeckGrid [data-summer-target-staff="leader"][data-summer-target-index="0"]').click();

  await expect(page.locator('#summerActionPanel')).toBeVisible();
  await expect(page.locator('#summerDeckGrid')).toContainText('チラシ折り');
});

test('通常期と講習期のカード効果でトークンが即時反映される', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'pro',
    tokens: { passion: 3, inspiration: 0, organize: 0 },
    phase: 'action',
    trainingDrawsLeft: 0,
    hand: [
      'テスト予想問題的中！',
      '設問の急所は？教材研究',
      '季節のデコレーション',
    ],
    assignments: {
      0: 'leader',
      1: 'teacher',
      2: 'office',
    },
  });

  await page.locator('#actionConfirm').click();
  await expect(page.locator('#tokenDisplay')).toContainText('情熱 5');
  await expect(page.locator('#tokenDisplay')).toContainText('発想 1');
  await expect(page.locator('#tokenDisplay')).toContainText('整理 1');
  await expect(page.locator('#logMessages')).toContainText('情熱発動: 情熱+1');
  await expect(page.locator('#logMessages')).toContainText('発想発動: 発想+1');
  await expect(page.locator('#logMessages')).toContainText('整理発動: 整理+1');

  await setupGame(page, {
    difficulty: 'pro',
    tokens: { passion: 1, inspiration: 0, organize: 0 },
    turnIndex: 5,
    phase: 'summer-action',
    staffDecks: {
      leader: ['明るく広く！教室リフォーム'],
      teacher: [],
      office: [],
      alba: [],
    },
  });

  await page.locator('#summerDeckGrid [data-summer-use-staff="leader"]').click();
  await page.locator('#summerActionConfirm').click();
  await expect(page.locator('#tokenDisplay')).toContainText('情熱 0');
  await expect(page.locator('#tokenDisplay')).toContainText('発想 1');
  await expect(page.locator('#tokenDisplay')).toContainText('整理 2');
  await expect(page.locator('#logMessages')).toContainText('疲労発動: 情熱-1');
});

test('講習期のSRは使用で裏返り、休憩で復活する', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    turnIndex: 5,
    phase: 'summer-action',
    staffDecks: {
      leader: ['できるまで居残り！'],
      teacher: [],
      office: [],
      alba: [],
    },
    summerActionSelections: {
      leader: null,
      teacher: null,
      office: null,
      alba: null,
    },
  });

  await page.locator('#summerDeckGrid [data-summer-use-staff="leader"]').click();
  await page.locator('#summerActionConfirm').click();
  await expect(page.locator('#summerDeckGrid .summer-deck-card-button.flipped')).toHaveCount(1);

  await page.locator('#summerMeetingConfirm').click();
  await expect(page.locator('#turnPill')).toContainText('第7ターン');

  await page.locator('#summerActionConfirm').click();
  await page.locator('#summerMeetingConfirm').click();
  await expect(page.locator('#summerDeckGrid .summer-deck-card-button.flipped')).toHaveCount(0);
});

test('中期1日目と2日目の両方を休むとSSRが復活する', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    turnIndex: 7,
    phase: 'summer-action',
    staffDecks: {
      leader: ['卒業生からの手紙'],
      teacher: [],
      office: [],
      alba: [],
    },
    staffFlipped: {
      leader: ['卒業生からの手紙'],
    },
    staffMidRestRecord: {
      leader: { mid1: null, mid2: null },
    },
  });

  await page.locator('#summerActionConfirm').click();
  await page.locator('#summerMeetingConfirm').click();
  await expect(page.locator('#summerDeckGrid .summer-deck-card-button.flipped')).toHaveCount(1);

  await page.locator('#summerActionConfirm').click();
  await page.locator('#summerMeetingConfirm').click();
  await expect(page.locator('#summerDeckGrid .summer-deck-card-button.flipped')).toHaveCount(0);
  await expect(page.locator('#turnPill')).toContainText('第10ターン');
});

test('講習期会議で情熱1のSR復活を複数回実行できる', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'pro',
    tokens: { passion: 3, inspiration: 0, organize: 0 },
    turnIndex: 5,
    phase: 'summer-action',
    staffDecks: {
      leader: ['できるまで居残り！', '教材発注', '問合対応の基本'],
      teacher: [],
      office: [],
      alba: [],
    },
    staffFlipped: {
      leader: ['できるまで居残り！', '教材発注'],
    },
    summerActionSelections: {
      leader: null,
      teacher: null,
      office: null,
      alba: null,
    },
  });

  await page.locator('#summerDeckGrid [data-summer-use-staff="leader"]').filter({ hasText: '問合対応の基本' }).click();
  await page.locator('#summerActionConfirm').click();

  await expect(page.locator('#summerMeetingPanel')).toBeVisible();
  await expect(page.locator('#summerMeetingRevivalPanel')).toBeVisible();
  await expect(page.locator('#summerMeetingRevivalTargets .summer-revival-target-button')).toHaveCount(2);

  await page.locator('#summerMeetingRevivalTargets .summer-revival-target-button').filter({ hasText: 'できるまで居残り！' }).click();
  await page.locator('#summerMeetingRevivalConfirm').click();
  await expect(page.locator('#tokenDisplay')).toContainText('情熱 2');
  await expect(page.locator('#summerMeetingPanel')).toBeVisible();
  await expect(page.locator('#summerMeetingRevivalTargets .summer-revival-target-button')).toHaveCount(1);
  await expect(page.locator('#summerMeetingSummary')).toContainText('できるまで居残り！');
  await expect(page.locator('#logMessages')).toContainText('情熱復活: できるまで居残り！ / 情熱-1');

  await page.locator('#summerMeetingRevivalTargets .summer-revival-target-button').filter({ hasText: '教材発注' }).click();
  await page.locator('#summerMeetingRevivalConfirm').click();
  await expect(page.locator('#tokenDisplay')).toContainText('情熱 1');
  await expect(page.locator('#summerMeetingSummary')).toContainText('教材発注');

  await page.locator('#summerMeetingConfirm').click();
  await expect(page.locator('#turnPill')).toContainText('第7ターン');
});

test('講習期会議で情熱3のSSR復活を実行できる', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'pro',
    tokens: { passion: 3, inspiration: 0, organize: 0 },
    turnIndex: 5,
    phase: 'summer-action',
    staffDecks: {
      leader: ['明るく広く！教室リフォーム', '経理精算の基本'],
      teacher: [],
      office: [],
      alba: [],
    },
    staffFlipped: {
      leader: ['明るく広く！教室リフォーム'],
    },
  });

  await page.locator('#summerDeckGrid [data-summer-use-staff="leader"]').filter({ hasText: '経理精算の基本' }).click();
  await page.locator('#summerActionConfirm').click();

  await expect(page.locator('#summerMeetingRevivalPanel')).toBeVisible();
  await expect(page.locator('#summerMeetingRevivalTargets .summer-revival-target-button')).toHaveCount(1);

  await page.locator('#summerMeetingRevivalTargets .summer-revival-target-button').filter({ hasText: '明るく広く！教室リフォーム' }).click();
  await page.locator('#summerMeetingRevivalConfirm').click();
  await expect(page.locator('#tokenDisplay')).toContainText('情熱 0');
  await expect(page.locator('#summerMeetingSummary')).toContainText('明るく広く！教室リフォーム');
  await expect(page.locator('#logMessages')).toContainText('情熱復活: 明るく広く！教室リフォーム / 情熱-3');

  await page.locator('#summerMeetingConfirm').click();
  await expect(page.locator('#turnPill')).toContainText('第7ターン');
});

test('講習期会議で発想1の追加獲得を実行できる', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'pro',
    tokens: { passion: 3, inspiration: 1, organize: 0 },
    turnIndex: 5,
    phase: 'summer-meeting',
    pendingMeeting: {
      kind: 'summer',
      usedCards: [],
      statsBefore: { experience: 0, enrollment: 0, satisfaction: 3, accounting: 5 },
      statsAfter: { experience: 0, enrollment: 0, satisfaction: 3, accounting: 5 },
      revivedCards: [],
      resolution: [],
    },
    staffDecks: {
      leader: ['問合対応の基本'],
      teacher: [],
      office: [],
      alba: [],
    },
    trainingPools: {
      地域: {
        動員: ['チラシ折り', '元塾生に講習案内', '兄弟紹介'],
      },
    },
    trainingDiscards: {
      地域: {
        動員: [],
      },
    },
  });

  await expect(page.locator('#summerMeetingInspirationPanel')).toBeVisible();
  await page.locator('#summerMeetingInspirationChoices [data-summer-meeting-pool="地域"][data-summer-meeting-category="動員"]').click();
  await expect(page.locator('#summerMeetingInspirationCandidateArea .summer-card-button')).toHaveCount(3);
  await page.locator('#summerMeetingInspirationCandidateArea .summer-card-button').first().click();
  await page.locator('#summerDeckGrid [data-summer-meeting-target-staff="leader"]').click();

  await expect(page.locator('#tokenDisplay')).toContainText('発想 0');
  await expect(page.locator('#summerMeetingSummary')).toContainText('チラシ折り');
  await expect(page.locator('#summerDeckGrid')).toContainText('チラシ折り');
  await expect(page.locator('#logMessages')).toContainText('発想追加: チラシ折り を 室長 デッキに追加 / 発想-1');
  await page.evaluate(() => {
    const app = window.__summerGame;
    const added = app.state.staffDecks.leader.at(-1);
    if (!added?.instanceId) {
      throw new Error('added card instanceId missing');
    }
  });
});

test('未選択の2枚は同じ山の捨て札へ戻る', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'pro',
    tokens: { passion: 3, inspiration: 1, organize: 0 },
    turnIndex: 5,
    phase: 'summer-meeting',
    pendingMeeting: {
      kind: 'summer',
      usedCards: [],
      statsBefore: { experience: 0, enrollment: 0, satisfaction: 3, accounting: 5 },
      statsAfter: { experience: 0, enrollment: 0, satisfaction: 3, accounting: 5 },
      revivedCards: [],
      resolution: [],
    },
    staffDecks: {
      leader: [],
      teacher: [],
      office: [],
      alba: [],
    },
    trainingPools: {
      地域: {
        動員: ['チラシ折り', '元塾生に講習案内', '兄弟紹介'],
      },
    },
    trainingDiscards: {
      地域: {
        動員: [],
      },
    },
  });

  await page.locator('#summerMeetingInspirationChoices [data-summer-meeting-pool="地域"][data-summer-meeting-category="動員"]').click();
  await page.locator('#summerMeetingInspirationCandidateArea .summer-card-button').first().click();
  await page.locator('#summerDeckGrid [data-summer-meeting-target-staff="leader"]').click();

  const discarded = await page.evaluate(() => {
    const app = window.__summerGame;
    return app.trainingDiscards.地域.動員.map((card) => card.cardName);
  });
  expect(discarded).toEqual(['元塾生に講習案内', '兄弟紹介']);
});

test('FRESHでは発想追加UIが表示されない', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'fresh',
    tokens: null,
    turnIndex: 5,
    phase: 'summer-meeting',
    pendingMeeting: {
      kind: 'summer',
      usedCards: [],
      statsBefore: { experience: 0, enrollment: 0, satisfaction: 3, accounting: 3 },
      statsAfter: { experience: 0, enrollment: 0, satisfaction: 3, accounting: 3 },
      revivedCards: [],
      resolution: [],
    },
    staffDecks: {
      leader: ['できるまで居残り！'],
      teacher: [],
      office: [],
      alba: [],
    },
    staffFlipped: {
      leader: ['できるまで居残り！'],
    },
  });

  await expect(page.locator('#summerMeetingPanel')).toBeVisible();
  await expect(page.locator('#summerMeetingInspirationPanel')).toBeHidden();
  await expect(page.locator('#tokenDisplay')).toBeHidden();
});

test('FRESHでは情熱復活UIが表示されない', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'fresh',
    tokens: null,
    turnIndex: 5,
    phase: 'summer-meeting',
    staffDecks: {
      leader: ['できるまで居残り！'],
      teacher: [],
      office: [],
      alba: [],
    },
    staffFlipped: {
      leader: ['できるまで居残り！'],
    },
  });

  await expect(page.locator('#summerMeetingPanel')).toBeVisible();
  await expect(page.locator('#summerMeetingRevivalPanel')).toBeHidden();
  await expect(page.locator('#tokenDisplay')).toBeHidden();
});
