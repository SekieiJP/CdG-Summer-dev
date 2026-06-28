import { expect, test } from '@playwright/test';

async function waitForGameReady(page) {
  await page.waitForFunction(() => {
    const app = window.__summerGame;
    return !!app && Array.isArray(app.cards) && app.cards.length > 0;
  });
}

async function setupGame(page, config) {
  await waitForGameReady(page);
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

    if (payload.stats) {
      app.state.stats = {
        ...app.state.stats,
        ...payload.stats,
      };
    }

    if (payload.usedTurns) {
      app.state.usedTurns = payload.usedTurns.map((entry) => ({ ...entry }));
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
        ...Object.fromEntries(
          Object.entries(payload.summerActionSelections).map(([staffKey, value]) => [
            staffKey,
            Array.isArray(value) ? [...value] : value,
          ]),
        ),
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

    if (payload.nPool) {
      app.nPool = payload.nPool.map(cloneCard);
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

async function getCardInstanceId(page, staffKey, cardName) {
  return page.evaluate(({ staffKey, cardName }) => {
    const app = window.__summerGame;
    const card = app?.state.staffDecks?.[staffKey]?.find((item) => item.cardName === cardName);
    return card?.instanceId ?? null;
  }, { staffKey, cardName });
}

async function getCardNo(page, staffKey, cardName) {
  return page.evaluate(({ staffKey, cardName }) => {
    const app = window.__summerGame;
    const card = app?.state.staffDecks?.[staffKey]?.find((item) => item.cardName === cardName)
      ?? app?.cards?.find((item) => item.cardName === cardName);
    return card?.cardNo ?? null;
  }, { staffKey, cardName });
}

async function waitForStatusAnimationToClose(page) {
  await page.waitForFunction(() => {
    const overlay = document.querySelector('#statusOverlay');
    return !overlay || overlay.classList.contains('hidden');
  });
}

async function expectTurnState(page, { turn, title, phase }) {
  await expect(page.locator('#turnPill')).toContainText(`第${turn}ターン`);
  await expect(page.locator('#turnPill')).toContainText(title);
  await expect(page.locator('#phasePill')).toContainText(phase);
}

async function drawTrainingTurnByCalcMode(page) {
  for (let index = 0; index < 4; index += 1) {
    const cardNo = await page.evaluate(() => {
      const app = window.__summerGame;
      const turn = app?.currentTurnConfig?.();
      const categories = ['動員', '教務', '応対', '庶務'];
      for (const category of categories) {
        const deck = app?.trainingPools?.[turn?.poolType]?.[category] ?? [];
        if (deck.length > 0) {
          return String(deck[0].cardNo);
        }
        const discard = app?.trainingDiscards?.[turn?.poolType]?.[category] ?? [];
        if (discard.length > 0) {
          return String(discard[0].cardNo);
        }
      }
      return null;
    });

    expect(cardNo).not.toBeNull();
    await page.locator('#trainingCalcCardInput').fill(cardNo);
    await page.locator('#trainingCalcSubmit').click();
    await expect.poll(async () => page.evaluate(() => window.__summerGame.state.hand.length)).toBe(index + 1);
  }

  await expect(page.locator('#actionArea')).toBeVisible();
  await expect(page.locator('#actionCalcPanel')).toBeVisible();
}

function buildBestNormalAssignments(hand) {
  const staffOrder = ['leader', 'teacher', 'office'];
  let best = { count: -1, assignments: {} };

  const dfs = (index, usedStaff, assignments) => {
    if (index >= hand.length) {
      const count = Object.keys(assignments).length;
      if (count > best.count) {
        best = { count, assignments: { ...assignments } };
      }
      return;
    }

    dfs(index + 1, usedStaff, assignments);

    for (const staffKey of hand[index].allowedStaff) {
      if (!staffOrder.includes(staffKey) || usedStaff.has(staffKey)) {
        continue;
      }
      usedStaff.add(staffKey);
      assignments[index] = staffKey;
      dfs(index + 1, usedStaff, assignments);
      delete assignments[index];
      usedStaff.delete(staffKey);
    }
  };

  dfs(0, new Set(), {});
  return best.assignments;
}

async function resolveNormalTurnByCalcMode(page) {
  const actionPlan = await page.evaluate(() => {
    const app = window.__summerGame;
    return {
      hand: app.state.hand.map((card) => ({
        cardNo: String(card.cardNo),
        allowedStaff: app.allowedStaffForCard(card),
      })),
      nPool: app.nPool.map((card) => String(card.cardNo)),
    };
  });

  const assignments = buildBestNormalAssignments(actionPlan.hand);
  const usedStaff = new Set(Object.values(assignments));
  const remainingStaff = ['leader', 'teacher', 'office'].filter((staffKey) => !usedStaff.has(staffKey));

  for (const [indexText, staffKey] of Object.entries(assignments)) {
    await page.locator(`[data-calc-hand-index="${indexText}"]`).selectOption(staffKey);
  }

  for (const [index, staffKey] of remainingStaff.entries()) {
    const cardNo = actionPlan.nPool[index];
    if (!cardNo) {
      continue;
    }
    await page.locator(`[data-calc-n-staff="${staffKey}"]`).fill(cardNo);
  }

  await page.locator('#actionConfirm').click();
  await expect(page.locator('#meetingArea')).toBeVisible();
  await waitForStatusAnimationToClose(page);

  const albaChoices = page.locator('#meetingChoices .meeting-card-button');
  if (await albaChoices.count()) {
    await albaChoices.first().click();
  }
  await page.locator('#meetingConfirm').click();
}

async function progressSummerPrepByCalcMode(page, expectedTotal) {
  for (let completed = 0; completed < expectedTotal; completed += 1) {
    await expect(page.locator('#summerPrepPanel')).toBeVisible();
    await expect(page.locator('#summerPrepCounter')).toContainText(`準備 ${completed + 1}/${expectedTotal}`);

    const category = await page.evaluate(() => {
      const app = window.__summerGame;
      const turn = app?.currentTurnConfig?.();
      const categories = ['動員', '教務', '応対', '庶務'];
      return categories.find((item) => {
        const deckCount = app?.trainingPools?.[turn?.poolType]?.[item]?.length ?? 0;
        const discardCount = app?.trainingDiscards?.[turn?.poolType]?.[item]?.length ?? 0;
        return deckCount + discardCount >= 3;
      }) ?? null;
    });

    expect(category).not.toBeNull();
    await page.locator(`#summerDeckChoices [data-summer-category="${category}"]`).click();

    const candidateNo = await page.evaluate(() => {
      const app = window.__summerGame;
      return String(app?.pendingSummerPrep?.candidates?.[0]?.cardNo ?? '');
    });
    expect(candidateNo).not.toBe('');
    await page.locator('#summerPrepCalcCandidateInput').fill(candidateNo);
    await page.locator('#summerDiscardButton').click();
  }

  await expect(page.locator('#summerActionPanel')).toBeVisible();
}

async function progressSummerActionByCalcMode(page) {
  for (const staffKey of ['leader', 'teacher', 'office', 'alba']) {
    await page.locator(`[data-calc-summer-staff="${staffKey}"]`).fill('休む');
  }
  await page.locator('#summerActionConfirm').click();
  await expect(page.locator('#summerMeetingPanel')).toBeVisible();
  await waitForStatusAnimationToClose(page);
  await page.locator('#summerMeetingConfirm').click();
}

test('通常期の教室行動でアルバイト講師候補を選んで次ターンへ進める', async ({ page }) => {
  await page.goto('/');
  await waitForGameReady(page);
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
  await waitForGameReady(page);
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

test('計算機モードのトグル状態をLocalStorageから復元できる', async ({ page }) => {
  await page.goto('/');
  await waitForGameReady(page);

  await expect(page.locator('#calcModeToggle')).not.toBeChecked();
  await page.locator('label[for="calcModeToggle"]').click();

  await expect.poll(async () => page.evaluate(() => window.localStorage.getItem('cdg_summer_calc_mode'))).toBe('1');

  await page.reload();
  await waitForGameReady(page);

  await expect(page.locator('#calcModeToggle')).toBeChecked();
});

test('ヘッダーのフェーズ詳細は初期非表示から現在ターン情報を開閉できる', async ({ page }) => {
  await page.goto('/');
  await waitForGameReady(page);
  await page.locator('#startGame').click();

  const phaseOverlay = page.locator('#phaseOverlay');
  const menuOverlay = page.locator('#menuOverlay');

  await expect(phaseOverlay).toBeHidden();
  await expect(phaseOverlay).toHaveAttribute('aria-hidden', 'true');
  await expect(menuOverlay).toBeHidden();
  await expect(menuOverlay).toHaveAttribute('aria-hidden', 'true');

  await page.locator('#summaryToggle').click();

  await expect(phaseOverlay).toBeVisible();
  await expect(phaseOverlay).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#phaseName')).toContainText('第1ターン');
  await expect(page.locator('#turnDetailLabel')).toHaveText('5月下旬');
  await expect(page.locator('#turnDetailSeason')).toHaveText('通常期');
  await expect(page.locator('#turnDetailPhase')).toHaveText('研修');
  await expect(page.locator('#phaseDescription')).toContainText('通常期の研修');

  await page.locator('#phaseOverlay [data-close="#phaseOverlay"]').click();
  await expect(phaseOverlay).toBeHidden();
  await expect(phaseOverlay).toHaveAttribute('aria-hidden', 'true');
});

test('ヘッダーのメニューは13ターン予定と現在ターン強調を表示して閉じられる', async ({ page }) => {
  await page.goto('/');
  await waitForGameReady(page);
  await page.locator('#startGame').click();

  const menuOverlay = page.locator('#menuOverlay');

  await expect(menuOverlay).toBeHidden();
  await expect(menuOverlay).toHaveAttribute('aria-hidden', 'true');

  await page.locator('#menuToggle').click();

  await expect(menuOverlay).toBeVisible();
  await expect(menuOverlay).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#menuDecks')).toBeVisible();
  await expect(page.locator('#scheduleList')).toBeVisible();
  await expect(page.locator('#scheduleList .schedule-item')).toHaveCount(13);
  await expect(page.locator('#scheduleList')).toContainText('第13ターン');
  await expect(page.locator('#scheduleList .schedule-item.active')).toHaveCount(1);
  await expect(page.locator('#scheduleList .schedule-item.active')).toContainText('第1ターン');

  await page.locator('#menuOverlay [data-close="#menuOverlay"]').click();
  await expect(menuOverlay).toBeHidden();
  await expect(menuOverlay).toHaveAttribute('aria-hidden', 'true');
});

test('計算機モードではカード番号入力で通常期研修カードを獲得し不正入力は進行しない', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('cdg_summer_calc_mode', '1');
  });
  await page.goto('/');
  await waitForGameReady(page);
  await page.locator('#startGame').click();

  await setupGame(page, {
    turnIndex: 0,
    phase: 'training',
    trainingDrawsLeft: 4,
    trainingPools: {
      地域: {
        動員: ['チラシ折り'],
      },
    },
    trainingDiscards: {
      地域: {
        動員: [],
      },
    },
  });

  await expect(page.locator('#trainingChoices [data-category]')).toHaveCount(0);
  await expect(page.locator('#trainingCalcCardInput')).toBeVisible();

  await page.locator('#trainingCalcCardInput').fill('9999');
  await page.locator('#trainingCalcSubmit').click();

  await expect(page.locator('#logMessages .log-error').first()).toContainText('カード番号 9999 は存在しません');
  await expect.poll(async () => page.evaluate(() => ({
    handCount: window.__summerGame.state.hand.length,
    trainingDrawsLeft: window.__summerGame.state.trainingDrawsLeft,
    phase: window.__summerGame.state.phase,
  }))).toEqual({
    handCount: 0,
    trainingDrawsLeft: 4,
    phase: 'training',
  });

  await page.locator('#trainingCalcCardInput').fill('6');
  await page.locator('#trainingCalcSubmit').click();

  await expect(page.locator('#handGrid')).toContainText('チラシ折り');
  await expect.poll(async () => page.evaluate(() => ({
    handNames: window.__summerGame.state.hand.map((card) => card.cardName),
    trainingDrawsLeft: window.__summerGame.state.trainingDrawsLeft,
    phase: window.__summerGame.state.phase,
  }))).toEqual({
    handNames: ['チラシ折り'],
    trainingDrawsLeft: 3,
    phase: 'training',
  });
});

test('計算機モードの通常期教室行動では非並行カードの重複配置をエラーで止める', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('cdg_summer_calc_mode', '1');
  });
  await page.goto('/');
  await waitForGameReady(page);
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
  });

  await expect(page.locator('#actionCalcPanel')).toBeVisible();
  await page.locator('[data-calc-hand-index="0"]').selectOption('teacher');
  await page.locator('[data-calc-hand-index="1"]').selectOption('teacher');
  await page.locator('#actionConfirm').click();

  await expect(page.locator('#logMessages .log-error').first()).toContainText('追加配置できるのは並行カードのみです');
  await expect.poll(async () => page.evaluate(() => ({
    phase: window.__summerGame.state.phase,
    stats: window.__summerGame.state.stats,
  }))).toEqual({
    phase: 'action',
    stats: {
      experience: 0,
      enrollment: 0,
      satisfaction: 3,
      accounting: 3,
    },
  });
});

test('計算機モードの通常期教室行動では並行カード重複配置とNカード番号指定を解決できる', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('cdg_summer_calc_mode', '1');
  });
  await page.goto('/');
  await waitForGameReady(page);
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'pro',
    phase: 'action',
    trainingDrawsLeft: 0,
    hand: [
      'チラシ折り',
      '宿題チェック',
      '提出書類ファイリング',
      '休み時間トーク',
    ],
    nPool: [
      '問合対応の基本',
      '経理精算の基本',
      '質問対応の基本',
    ],
  });

  await expect(page.locator('#actionCalcPanel')).toBeVisible();
  await page.locator('[data-calc-hand-index="0"]').selectOption('leader');
  await page.locator('[data-calc-hand-index="1"]').selectOption('teacher');
  await page.locator('[data-calc-hand-index="2"]').selectOption('teacher');
  await page.locator('[data-calc-n-staff="office"]').fill('5');
  await page.locator('#actionConfirm').click();

  await expect(page.locator('#meetingArea')).toBeVisible();
  await expect(page.locator('#meetingChoices .meeting-card-button')).toHaveCount(1);
  await expect.poll(async () => page.evaluate(() => ({
    phase: window.__summerGame.state.phase,
    stats: window.__summerGame.state.stats,
    nPoolCount: window.__summerGame.nPool.length,
    assignedStaff: window.__summerGame.pendingMeeting.assignedCards.map((item) => item.staffKey),
    nUsed: window.__summerGame.pendingMeeting.nUsed.map((item) => ({
      staffKey: item.staffKey,
      cardNo: item.card.cardNo,
    })),
  }))).toEqual({
    phase: 'meeting',
    stats: {
      experience: 4,
      enrollment: 2,
      satisfaction: 3,
      accounting: 13,
    },
    nPoolCount: 2,
    assignedStaff: ['leader', 'teacher', 'teacher'],
    nUsed: [
      { staffKey: 'office', cardNo: '5' },
    ],
  });
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

test('計算機モードの講習期準備では候補番号と交換先入力で既存フローへ合流できる', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('cdg_summer_calc_mode', '1');
  });
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

  await page.locator('#summerDeckChoices [data-summer-category="動員"]').click();
  await expect(page.locator('#summerPrepCalcCandidateInput')).toBeVisible();

  await page.locator('#summerPrepCalcCandidateInput').fill('6');
  await page.locator('#summerPrepCalcStaffSelect').selectOption('leader');
  await page.locator('#summerPrepCalcSlotInput').fill('1');
  await page.locator('#summerPrepCalcSubmit').click();

  await expect(page.locator('#summerActionPanel')).toBeVisible();
  await expect(page.locator('#summerDeckGrid')).toContainText('チラシ折り');
});

test('計算機モードの講習期準備では候補にないカード番号指定をエラーで止める', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('cdg_summer_calc_mode', '1');
  });
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

  await page.locator('#summerDeckChoices [data-summer-category="動員"]').click();
  await page.locator('#summerPrepCalcCandidateInput').fill('9999');
  await page.locator('#summerPrepCalcStaffSelect').selectOption('leader');
  await page.locator('#summerPrepCalcSlotInput').fill('1');
  await page.locator('#summerPrepCalcSubmit').click();

  await expect(page.locator('#logMessages .log-error').first()).toContainText('トップ3枚候補にカード番号 9999 は存在しません');
  await expect.poll(async () => page.evaluate(() => window.__summerGame.state.phase)).toBe('summer-prep');
  await expect(page.locator('#summerPrepPanel')).toBeVisible();
});

test('計算機モードの講習期準備では高レア交換先をエラーで止める', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('cdg_summer_calc_mode', '1');
  });
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    turnIndex: 4,
    phase: 'summer-prep',
    summerPrepTotal: 1,
    summerPrepCompleted: 0,
    staffDecks: {
      leader: ['兄弟紹介'],
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

  await page.locator('#summerDeckChoices [data-summer-category="動員"]').click();
  await page.locator('#summerPrepCalcCandidateInput').fill('6');
  await page.locator('#summerPrepCalcStaffSelect').selectOption('leader');
  await page.locator('#summerPrepCalcSlotInput').fill('1');
  await page.locator('#summerPrepCalcSubmit').click();

  await expect(page.locator('#logMessages .log-error').first()).toContainText('交換先カードは同レアリティ以下のみ指定できます');
  await expect.poll(async () => page.evaluate(() => window.__summerGame.state.phase)).toBe('summer-prep');
});

test('計算機モードの講習期準備では交換可能カードがない場合に除外だけ成立する', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('cdg_summer_calc_mode', '1');
  });
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    turnIndex: 4,
    phase: 'summer-prep',
    summerPrepTotal: 1,
    summerPrepCompleted: 0,
    staffDecks: {
      leader: ['兄弟紹介'],
      teacher: ['兄弟紹介'],
      office: ['兄弟紹介'],
      alba: ['兄弟紹介'],
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

  await page.locator('#summerDeckChoices [data-summer-category="動員"]').click();
  await page.locator('#summerPrepCalcCandidateInput').fill('6');
  await page.locator('#summerPrepCalcStaffSelect').selectOption('leader');
  await page.locator('#summerPrepCalcSlotInput').fill('1');
  await page.locator('#summerPrepCalcSubmit').click();

  await expect(page.locator('#logMessages .log-error').first()).toContainText('交換可能なカードがないため「交換せず除外」だけ選べます');
  await expect.poll(async () => page.evaluate(() => window.__summerGame.state.phase)).toBe('summer-prep');

  await page.locator('#summerDiscardButton').click();

  await expect(page.locator('#summerActionPanel')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => ({
    phase: window.__summerGame.state.phase,
    leaderDeck: window.__summerGame.state.staffDecks.leader.map((card) => card.cardName),
    discarded: window.__summerGame.trainingDiscards['地域']['動員'].map((card) => card.cardName),
  }))).toEqual({
    phase: 'summer-action',
    leaderDeck: ['兄弟紹介'],
    discarded: ['元塾生に講習案内', '兄弟紹介', 'チラシ折り'],
  });
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

test('計算機モードの講習期教室行動では裏返しカード番号指定をエラーで止める', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('cdg_summer_calc_mode', '1');
  });
  await page.goto('/');
  await waitForGameReady(page);
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
    staffFlipped: {
      leader: ['できるまで居残り！'],
    },
  });

  const leaderCardNo = await getCardNo(page, 'leader', 'できるまで居残り！');
  await expect(page.locator('#calcSummerActionleader')).toBeVisible();
  await page.locator('#calcSummerActionleader').fill(String(leaderCardNo));
  await page.locator('#calcSummerActionteacher').fill('休む');
  await page.locator('#calcSummerActionoffice').fill('休む');
  await page.locator('#calcSummerActionalba').fill('休む');
  await page.locator('#summerActionConfirm').click();

  await expect(page.locator('#logMessages .log-error').first()).toContainText('室長のカード番号');
  await expect(page.locator('#logMessages .log-error').first()).toContainText('裏返しのため使えません');
  await expect.poll(async () => page.evaluate(() => ({
    phase: window.__summerGame.state.phase,
    flippedCount: window.__summerGame.state.staffFlipped.leader.size,
  }))).toEqual({
    phase: 'summer-action',
    flippedCount: 1,
  });
});

test('計算機モードの講習期教室行動では複数番号入力と休む指定で既存復活処理へ合流できる', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('cdg_summer_calc_mode', '1');
  });
  await page.goto('/');
  await waitForGameReady(page);
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'pro',
    turnIndex: 5,
    phase: 'summer-action',
    stats: {
      experience: 0,
      enrollment: 0,
      satisfaction: 0,
      accounting: 0,
    },
    staffDecks: {
      leader: ['元塾生に講習案内', 'チラシ折り'],
      teacher: ['できるまで居残り！'],
      office: ['生徒面談の基本'],
      alba: [],
    },
    staffFlipped: {
      teacher: ['できるまで居残り！'],
    },
  });

  const leaderCardNo1 = await getCardNo(page, 'leader', '元塾生に講習案内');
  const leaderCardNo2 = await getCardNo(page, 'leader', 'チラシ折り');
  await page.locator('#calcSummerActionleader').fill(`${leaderCardNo1},${leaderCardNo2}`);
  await page.locator('#calcSummerActionteacher').fill('休む');
  await page.locator('#calcSummerActionoffice').fill('休む');
  await page.locator('#calcSummerActionalba').fill('休む');
  await page.locator('#summerActionConfirm').click();

  await expect(page.locator('#summerMeetingPanel')).toBeVisible();
  await expect(page.locator('#summerMeetingSummary')).toContainText('室長: 元塾生に講習案内');
  await expect(page.locator('#summerMeetingSummary')).toContainText('室長: チラシ折り');
  await expect(page.locator('#summerMeetingSummary')).toContainText('休憩: 講師 / 事務 / アルバイト講師');
  await expect.poll(async () => page.evaluate(() => ({
    phase: window.__summerGame.state.phase,
    usedCards: window.__summerGame.pendingMeeting.usedCards.map((item) => item.card.cardName),
    revivedCards: window.__summerGame.pendingMeeting.revivedCards.map((item) => item.card.cardName),
    teacherFlippedCount: window.__summerGame.state.staffFlipped.teacher.size,
    staffRestActivity: window.__summerGame.state.staffRestActivity,
  }))).toEqual({
    phase: 'summer-meeting',
    usedCards: ['元塾生に講習案内', 'チラシ折り'],
    revivedCards: ['できるまで居残り！'],
    teacherFlippedCount: 0,
    staffRestActivity: {
      leader: true,
      teacher: false,
      office: false,
      alba: false,
    },
  });
});

test('講習期の並行カードは同一スタッフへ追加選択して同ターンに2枚使える', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'pro',
    turnIndex: 5,
    phase: 'summer-action',
    stats: {
      experience: 0,
      enrollment: 0,
      satisfaction: 0,
      accounting: 0,
    },
    staffDecks: {
      leader: ['元塾生に講習案内', 'チラシ折り'],
      teacher: [],
      office: [],
      alba: [],
    },
  });

  await page.locator('#summerDeckGrid [data-summer-use-staff="leader"]').filter({ hasText: '元塾生に講習案内' }).click();
  await page.locator('#summerDeckGrid [data-summer-use-staff="leader"]').filter({ hasText: 'チラシ折り' }).click();

  await expect(page.locator('#summerActionGrid')).toContainText('選択中: 元塾生に講習案内 / チラシ折り');
  await page.locator('#summerActionConfirm').click();
  await expect(page.locator('#summerMeetingSummary')).toContainText('室長: 元塾生に講習案内');
  await expect(page.locator('#summerMeetingSummary')).toContainText('室長: チラシ折り');
  await expect(page.locator('#statusExperience')).toContainText('7');
});

test('講習期の2枚目に並行でないカードを追加選択しようとすると拒否される', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'pro',
    turnIndex: 5,
    phase: 'summer-action',
    staffDecks: {
      leader: ['元塾生に講習案内', '校門前ビラ配り'],
      teacher: [],
      office: [],
      alba: [],
    },
  });

  await page.locator('#summerDeckGrid [data-summer-use-staff="leader"]').filter({ hasText: '元塾生に講習案内' }).click();
  await page.locator('#summerDeckGrid [data-summer-use-staff="leader"]').filter({ hasText: '校門前ビラ配り' }).click();

  await expect(page.locator('#summerActionGrid')).toContainText('選択中: 元塾生に講習案内');
  await expect(page.locator('#summerActionGrid')).not.toContainText('選択中: 元塾生に講習案内 / 校門前ビラ配り');
  await expect(page.locator('#logMessages')).toContainText('追加配置できるのは並行カードのみです');
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

test('計算機モードの講習期会議では裏返しSR/SSRのカード番号指定で情熱復活できる', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('cdg_summer_calc_mode', '1');
  });
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'pro',
    tokens: { passion: 4, inspiration: 0, organize: 0 },
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
      leader: ['できるまで居残り！', '明るく広く！教室リフォーム', '問合対応の基本'],
      teacher: [],
      office: [],
      alba: [],
    },
    staffFlipped: {
      leader: ['できるまで居残り！', '明るく広く！教室リフォーム'],
    },
  });

  const invalidNo = await getCardNo(page, 'leader', '問合対応の基本');
  const srNo = await getCardNo(page, 'leader', 'できるまで居残り！');
  const ssrNo = await getCardNo(page, 'leader', '明るく広く！教室リフォーム');

  await page.locator('#summerMeetingRevivalCalcCardInput').fill(String(invalidNo));
  await page.locator('#summerMeetingRevivalCalcSubmit').click();

  await expect(page.locator('#logMessages .log-error').first()).toContainText(`復活可能カードにカード番号 ${invalidNo} は存在しません`);
  await expect(page.locator('#tokenDisplay')).toContainText('情熱 4');

  await page.locator('#summerMeetingRevivalCalcCardInput').fill(String(srNo));
  await page.locator('#summerMeetingRevivalCalcSubmit').click();
  await expect(page.locator('#tokenDisplay')).toContainText('情熱 3');
  await expect(page.locator('#summerMeetingSummary')).toContainText('できるまで居残り！');

  await page.locator('#summerMeetingRevivalCalcCardInput').fill(String(ssrNo));
  await page.locator('#summerMeetingRevivalCalcSubmit').click();
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

test('計算機モードの講習期会議では山札とトップ3候補番号を指定して発想追加できる', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('cdg_summer_calc_mode', '1');
  });
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

  await page.locator('#summerMeetingInspirationCalcPoolSelect').selectOption('地域');
  await page.locator('#summerMeetingInspirationCalcCategorySelect').selectOption('動員');
  await page.locator('#summerMeetingInspirationCalcCardInput').fill('9999');
  await page.locator('#summerMeetingInspirationCalcStaffSelect').selectOption('leader');
  await page.locator('#summerMeetingInspirationCalcSubmit').click();

  await expect(page.locator('#logMessages .log-error').first()).toContainText('トップ3枚候補にカード番号 9999 は存在しません');
  await expect.poll(async () => page.evaluate(() => ({
    phase: window.__summerGame.state.phase,
    token: window.__summerGame.state.tokens.inspiration,
    leaderDeck: window.__summerGame.state.staffDecks.leader.map((card) => card.cardName),
  }))).toEqual({
    phase: 'summer-meeting',
    token: 1,
    leaderDeck: ['問合対応の基本'],
  });

  await page.locator('#summerMeetingInspirationCalcCardInput').fill('6');
  await page.locator('#summerMeetingInspirationCalcStaffSelect').selectOption('leader');
  await page.locator('#summerMeetingInspirationCalcSubmit').click();

  await expect(page.locator('#tokenDisplay')).toContainText('発想 0');
  await expect(page.locator('#summerMeetingSummary')).toContainText('追加: 室長: チラシ折り');
  await expect(page.locator('#summerDeckGrid')).toContainText('チラシ折り');
  await expect(page.locator('#logMessages')).toContainText('発想追加: チラシ折り を 室長 デッキに追加 / 発想-1');
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

test('通常期の保存状態はリロード後も手札と山札順を復帰する', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    turnIndex: 0,
    phase: 'training',
    trainingDrawsLeft: 4,
    trainingPools: {
      地域: {
        動員: ['チラシ折り', '元塾生に講習案内', '校門前ビラ配り', '心を掴む1日見学'],
      },
    },
    trainingDiscards: {
      地域: {
        動員: [],
      },
    },
  });

  await page.locator('#trainingChoices [data-category="動員"]').click();
  await page.locator('#trainingChoices [data-category="動員"]').click();
  await expect(page.locator('#handGrid')).toContainText('チラシ折り');
  await expect(page.locator('#handGrid')).toContainText('元塾生に講習案内');

  await page.reload();
  await expect(page.locator('#startOverlay')).toBeHidden();
  await expect(page.locator('#trainingArea')).toBeVisible();
  await expect(page.locator('#handGrid')).toContainText('チラシ折り');
  await expect(page.locator('#handGrid')).toContainText('元塾生に講習案内');

  await page.locator('#trainingChoices [data-category="動員"]').click();
  await expect(page.locator('#handGrid')).toContainText('校門前ビラ配り');
  expect(pageErrors).toEqual([]);
});

test('講習期会議途中の保存状態はSetと候補山札順を復帰する', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'pro',
    turnIndex: 5,
    phase: 'summer-meeting',
    tokens: { passion: 3, inspiration: 1, organize: 0 },
    pendingMeeting: {
      kind: 'summer',
      usedCards: [],
      statsBefore: { experience: 0, enrollment: 0, satisfaction: 3, accounting: 5 },
      statsAfter: { experience: 0, enrollment: 0, satisfaction: 3, accounting: 5 },
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

  const beforeReload = await page.evaluate(() => {
    const app = window.__summerGame;
    return {
      flipped: app.state.staffFlipped.leader.has(app.state.staffDecks.leader[0].instanceId),
      candidates: app.pendingSummerInspiration.candidates.map((card) => card.cardName),
    };
  });
  expect(beforeReload.flipped).toBe(true);
  expect(beforeReload.candidates).toEqual(['チラシ折り', '元塾生に講習案内', '兄弟紹介']);

  await page.reload();
  await expect(page.locator('#summerArea')).toBeVisible();
  await expect(page.locator('#summerMeetingPanel')).toBeVisible();
  await expect(page.locator('#summerMeetingInspirationPanel')).toBeVisible();
  await expect(page.locator('#summerMeetingInspirationCandidateArea .summer-card-button')).toHaveCount(3);
  await expect(page.locator('#summerDeckGrid')).toContainText('裏返し');

  const afterReload = await page.evaluate(() => {
    const app = window.__summerGame;
    return {
      flipped: app.state.staffFlipped.leader.has(app.state.staffDecks.leader[0].instanceId),
      candidates: app.pendingSummerInspiration?.candidates.map((card) => card.cardName) ?? [],
      selected: app.pendingSummerInspiration?.selectedCandidateId ?? null,
    };
  });
  expect(afterReload.flipped).toBe(true);
  expect(afterReload.candidates).toEqual(['チラシ折り', '元塾生に講習案内', '兄弟紹介']);
  expect(afterReload.selected).not.toBeNull();
  expect(pageErrors).toEqual([]);
});

test('不正JSONや旧形式の保存は新規開始へフォールバックする', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#startOverlay')).toBeVisible();
  await expect(page.locator('#previewDifficultyLabel')).toContainText('FRESH');

  await page.evaluate(() => {
    localStorage.setItem('cdg_summer_state', 'not-json');
  });

  await page.reload();
  await expect(page.locator('#startOverlay')).toBeVisible();

  const firstSave = await page.evaluate(() => JSON.parse(localStorage.getItem('cdg_summer_state')));
  expect(firstSave.version).toBe(1);
  expect(firstSave.state.difficulty).toBe('fresh');

  await page.evaluate(() => {
    localStorage.setItem('cdg_summer_state', JSON.stringify({ state: { difficulty: 'pro' } }));
  });

  await page.reload();
  await expect(page.locator('#startOverlay')).toBeVisible();

  const secondSave = await page.evaluate(() => JSON.parse(localStorage.getItem('cdg_summer_state')));
  expect(secondSave.version).toBe(1);
  expect(secondSave.state.difficulty).toBe('fresh');
  expect(pageErrors).toEqual([]);
});

test('講習期会議で整理1を使って通常カードを削除できる', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'pro',
    tokens: { passion: 3, inspiration: 0, organize: 1 },
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
      teacher: ['教材発注'],
      office: [],
      alba: [],
    },
  });

  const targetId = await getCardInstanceId(page, 'leader', '問合対応の基本');

  await expect(page.locator('#summerMeetingOrganizePanel')).toBeVisible();
  await page.locator(`#summerMeetingOrganizeTargets [data-summer-organize-id="${targetId}"]`).click();
  await page.locator('#summerMeetingOrganizeConfirm').click();

  await expect(page.locator('#tokenDisplay')).toContainText('整理 0');
  await expect(page.locator('#summerMeetingSummary')).toContainText('削除: 室長: 問合対応の基本');
  await expect(page.locator('#summerDeckGrid')).not.toContainText('問合対応の基本');
  await expect(page.locator('#logMessages')).toContainText('整理削除: 問合対応の基本 を 室長 デッキから削除 / 整理-1');
});

test('講習期会議で裏返しSRを削除するとstaffFlippedからも消える', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'pro',
    tokens: { passion: 3, inspiration: 0, organize: 1 },
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
      leader: ['できるまで居残り！', '問合対応の基本'],
      teacher: [],
      office: [],
      alba: [],
    },
    staffFlipped: {
      leader: ['できるまで居残り！'],
    },
  });

  const targetId = await getCardInstanceId(page, 'leader', 'できるまで居残り！');

  await page.locator(`#summerMeetingOrganizeTargets [data-summer-organize-id="${targetId}"]`).click();
  await page.locator('#summerMeetingOrganizeConfirm').click();

  await expect(page.locator('#summerDeckGrid')).not.toContainText('できるまで居残り！');
  await expect(page.locator('#logMessages')).toContainText('整理削除: できるまで居残り！ を 室長 デッキから削除 / 整理-1');
  await page.evaluate(({ targetId }) => {
    const app = window.__summerGame;
    if (app.state.staffFlipped.leader.has(targetId)) {
      throw new Error('flipped id still present');
    }
  }, { targetId });
});

test('計算機モードの講習期会議ではスタッフ別デッキ内のカード番号指定で整理削除できる', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('cdg_summer_calc_mode', '1');
  });
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'pro',
    tokens: { passion: 3, inspiration: 0, organize: 1 },
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
      teacher: ['教材発注'],
      office: [],
      alba: [],
    },
  });

  await page.locator('#summerMeetingOrganizeCalcCardInput').fill('9999');
  await page.locator('#summerMeetingOrganizeCalcSubmit').click();
  await expect(page.locator('#logMessages .log-error').first()).toContainText('スタッフ別デッキにカード番号 9999 は存在しません');
  await expect(page.locator('#tokenDisplay')).toContainText('整理 1');

  const targetNo = await getCardNo(page, 'leader', '問合対応の基本');
  await page.locator('#summerMeetingOrganizeCalcCardInput').fill(String(targetNo));
  await page.locator('#summerMeetingOrganizeCalcSubmit').click();

  await expect(page.locator('#tokenDisplay')).toContainText('整理 0');
  await expect(page.locator('#summerMeetingSummary')).toContainText('削除: 室長: 問合対応の基本');
  await expect(page.locator('#summerDeckGrid')).not.toContainText('問合対応の基本');
  await expect(page.locator('#logMessages')).toContainText('整理削除: 問合対応の基本 を 室長 デッキから削除 / 整理-1');
});

test('FRESHでは整理削除UIが表示されず、整理不足では削除できない', async ({ page }) => {
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

  await expect(page.locator('#summerMeetingOrganizePanel')).toBeHidden();

  await setupGame(page, {
    difficulty: 'pro',
    tokens: { passion: 3, inspiration: 0, organize: 0 },
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

  const targetId = await getCardInstanceId(page, 'leader', 'できるまで居残り！');
  await page.evaluate(({ targetId }) => {
    const app = window.__summerGame;
    app.state.summerMeetingOrganizeSelectionId = targetId;
    app.useSummerMeetingOrganizeRemoval();
  }, { targetId });

  await expect(page.locator('#logMessages')).toContainText('整理が足りません');
  await page.evaluate(({ targetId }) => {
    const app = window.__summerGame;
    if (app.state.staffDecks.leader.length !== 1 || !app.state.staffDecks.leader.some((card) => card.instanceId === targetId)) {
      throw new Error('card changed unexpectedly');
    }
  }, { targetId });
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

test('FRESH結果で通常ケースの内訳とランクを表示する', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'fresh',
    turnIndex: 12,
    phase: 'result',
    stats: {
      experience: 10,
      enrollment: 14,
      satisfaction: 14,
      accounting: 15,
    },
    usedTurns: Array.from({ length: 13 }, (_, index) => ({ turn: index + 1 })),
  });

  await expect(page.locator('#resultArea')).toBeVisible();
  await expect(page.locator('#resultRank')).toContainText('A');
  await expect(page.locator('#resultTurn')).toContainText('基礎合計 7');
  await expect(page.locator('#resultTurn')).toContainText('表示スコア 7');
  await expect(page.locator('#resultSummary')).toContainText('退塾');
  await expect(page.locator('#resultSummary')).toContainText('1');
  await expect(page.locator('#resultSummary')).toContainText('入退差');
  await expect(page.locator('#resultSummary')).toContainText('13');
  await expect(page.locator('#resultSummary')).toContainText('退塾点');
  await expect(page.locator('#resultSummary')).toContainText('+1');
  await expect(page.locator('#resultSummary')).toContainText('動員点');
  await expect(page.locator('#resultSummary')).toContainText('入退差点');
});

test('FRESH結果で表示スコア9以上はS+になる', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'fresh',
    turnIndex: 12,
    phase: 'result',
    stats: {
      experience: 12,
      enrollment: 24,
      satisfaction: 15,
      accounting: 15,
    },
    usedTurns: Array.from({ length: 13 }, (_, index) => ({ turn: index + 1 })),
  });

  await expect(page.locator('#resultRank')).toContainText('S+');
  await expect(page.locator('#resultTurn')).toContainText('基礎合計 8');
  await expect(page.locator('#resultTurn')).toContainText('表示スコア 9');
  await expect(page.locator('#resultSummary')).toContainText('合計 / 表示スコア');
  await expect(page.locator('#resultSummary')).toContainText('8 / 9');
});

test('FRESH結果で低スコア時はEランクになる', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'fresh',
    turnIndex: 12,
    phase: 'result',
    stats: {
      experience: 0,
      enrollment: 0,
      satisfaction: 3,
      accounting: 3,
    },
    usedTurns: Array.from({ length: 13 }, (_, index) => ({ turn: index + 1 })),
  });

  await expect(page.locator('#resultRank')).toContainText('E');
  await expect(page.locator('#resultTurn')).toContainText('基礎合計 -3');
  await expect(page.locator('#resultTurn')).toContainText('表示スコア -3');
  await expect(page.locator('#resultSummary')).toContainText('退塾');
  await expect(page.locator('#resultSummary')).toContainText('24');
  await expect(page.locator('#resultSummary')).toContainText('入退差');
  await expect(page.locator('#resultSummary')).toContainText('-24');
});

test('PRO結果で4観点内訳と称号を表示する', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'pro',
    turnIndex: 12,
    phase: 'result',
    stats: {
      experience: 40,
      enrollment: 32,
      satisfaction: 15,
      accounting: 15,
    },
    usedTurns: Array.from({ length: 13 }, (_, index) => ({ turn: index + 1 })),
  });

  await expect(page.locator('#resultArea')).toBeVisible();
  await expect(page.locator('#resultRank')).toContainText('A+');
  await expect(page.locator('#resultTurn')).toContainText('合計 11');
  await expect(page.locator('#resultTurn')).toContainText('称号 最優秀教室ノミネート！');
  await expect(page.locator('#resultSummary')).toContainText('体験');
  await expect(page.locator('#resultSummary')).toContainText('入塾');
  await expect(page.locator('#resultSummary')).toContainText('満足');
  await expect(page.locator('#resultSummary')).toContainText('経理');
  await expect(page.locator('#resultSummary')).toContainText('退塾');
  await expect(page.locator('#resultSummary')).toContainText('0');
  await expect(page.locator('#resultSummary')).toContainText('入退差');
  await expect(page.locator('#resultSummary')).toContainText('32');
  await expect(page.locator('#resultSummary')).toContainText('動員点');
  await expect(page.locator('#resultSummary')).toContainText('+4');
  await expect(page.locator('#resultSummary')).toContainText('退塾点');
  await expect(page.locator('#resultSummary')).toContainText('+1');
  await expect(page.locator('#resultSummary')).toContainText('入退差点');
  await expect(page.locator('#resultSummary')).toContainText('+6');
  await expect(page.locator('#resultSummary')).toContainText('満足点');
  await expect(page.locator('#resultSummary')).toContainText('合計');
  await expect(page.locator('#resultSummary')).toContainText('称号');
});

test('PRO結果で総合ランク閾値ちょうどの14点はS+になる', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'pro',
    turnIndex: 12,
    phase: 'result',
    stats: {
      experience: 45,
      enrollment: 48,
      satisfaction: 25,
      accounting: 15,
    },
    usedTurns: Array.from({ length: 13 }, (_, index) => ({ turn: index + 1 })),
  });

  await expect(page.locator('#resultRank')).toContainText('S+');
  await expect(page.locator('#resultTurn')).toContainText('合計 14');
  await expect(page.locator('#resultSummary')).toContainText('全社最優秀教室！！');
});

test('PRO結果でCSVの称号列をそのまま表示する', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'pro',
    turnIndex: 12,
    phase: 'result',
    stats: {
      experience: 50,
      enrollment: 48,
      satisfaction: 35,
      accounting: 15,
    },
    usedTurns: Array.from({ length: 13 }, (_, index) => ({ turn: index + 1 })),
  });

  await expect(page.locator('#resultRank')).toContainText('SS');
  await expect(page.locator('#resultTurn')).toContainText('称号 社史に残る偉業達成！！');
  await expect(page.locator('#resultSummary')).toContainText('rankSummerPro.csv');
});

test('結果画面で難易度別ハイスコアを保存して表示する', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await page.evaluate(() => {
    localStorage.removeItem('cdg_summer_highscore_fresh');
  });

  await setupGame(page, {
    difficulty: 'fresh',
    turnIndex: 12,
    phase: 'result',
    stats: {
      experience: 12,
      enrollment: 26,
      satisfaction: 15,
      accounting: 15,
    },
    usedTurns: Array.from({ length: 13 }, (_, index) => ({ turn: index + 1 })),
  });

  await expect(page.locator('#resultSummary')).toContainText('ハイスコア更新');
  await expect(page.locator('#resultSummary')).not.toContainText('自己ベスト');

  const highscore = await page.evaluate(() => JSON.parse(localStorage.getItem('cdg_summer_highscore_fresh')));
  expect(highscore.score).toBe(8);
  expect(highscore.rank).toBe('S');
  expect(highscore.turns).toBe(13);
});

test('既存ハイスコアより低い結果では上書きしない', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await page.evaluate(() => {
    localStorage.setItem('cdg_summer_highscore_pro', JSON.stringify({
      difficulty: 'pro',
      rank: 'SS',
      score: 17,
      title: '社史に残る偉業達成！！',
      turns: 13,
    }));
  });

  await setupGame(page, {
    difficulty: 'pro',
    turnIndex: 12,
    phase: 'result',
    stats: {
      experience: 40,
      enrollment: 32,
      satisfaction: 15,
      accounting: 15,
    },
    usedTurns: Array.from({ length: 13 }, (_, index) => ({ turn: index + 1 })),
  });

  await expect(page.locator('#resultSummary')).toContainText('自己ベスト');
  await expect(page.locator('#resultSummary')).not.toContainText('ハイスコア更新');
  await expect(page.locator('#resultSummary')).toContainText('17');
  await expect(page.locator('#resultSummary')).toContainText('SS / 社史に残る偉業達成！！');

  const highscore = await page.evaluate(() => JSON.parse(localStorage.getItem('cdg_summer_highscore_pro')));
  expect(highscore.score).toBe(17);
  expect(highscore.rank).toBe('SS');
});

test('第13ターンの講習期行動後は会議を経て結果画面へ遷移し、usedTurnsは13件になる', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'fresh',
    turnIndex: 12,
    phase: 'summer-action',
    stats: {
      experience: 6,
      enrollment: 8,
      satisfaction: 10,
      accounting: 11,
    },
    usedTurns: Array.from({ length: 12 }, (_, index) => ({ turn: index + 1 })),
    staffDecks: {
      leader: ['問合対応の基本'],
      teacher: ['質問対応の基本'],
      office: ['生徒面談の基本'],
      alba: ['経理精算の基本'],
    },
    summerActionSelections: {
      leader: null,
      teacher: null,
      office: null,
      alba: null,
    },
  });

  const hasOnlyPlayableTurns = await page.evaluate(async () => {
    const { TURN_CONFIG } = await import('/js/config.js');
    return TURN_CONFIG.length === 13 && TURN_CONFIG.every((turn) => turn.phaseKind !== 'result');
  });
  expect(hasOnlyPlayableTurns).toBe(true);

  await expect(page.locator('#turnPill')).toContainText('第13ターン');
  await expect(page.locator('#phasePill')).toContainText('教室会議');
  await expect(page.locator('#summerActionPanel')).toBeVisible();

  await page.locator('#summerActionConfirm').click();
  await expect(page.locator('#summerMeetingPanel')).toBeVisible();

  await page.locator('#summerMeetingConfirm').click();
  await expect(page.locator('#resultArea')).toBeVisible();
  await expect(page.locator('#summerArea')).toBeHidden();
  await expect(page.locator('#resultTurn')).toContainText('13ターン完了');
  await expect(page.locator('#turnTimeline [data-turn]')).toHaveCount(13);
  await expect(page.locator('#turnTimeline')).not.toContainText('14');

  const stateSnapshot = await page.evaluate(() => {
    const app = window.__summerGame;
    return {
      phase: app.state.phase,
      turnIndex: app.state.turnIndex,
      usedTurnsLength: app.state.usedTurns.length,
      lastTurn: app.state.usedTurns.at(-1)?.turn ?? null,
    };
  });

  expect(stateSnapshot).toEqual({
    phase: 'result',
    turnIndex: 12,
    usedTurnsLength: 13,
    lastTurn: 13,
  });
});

test('PROの低スコアでも最終ターンから結果画面へ遷移してFランクになる', async ({ page }) => {
  await page.goto('/');
  await page.locator('#startGame').click();

  await setupGame(page, {
    difficulty: 'pro',
    turnIndex: 12,
    phase: 'summer-action',
    stats: {
      experience: 0,
      enrollment: 0,
      satisfaction: 3,
      accounting: 5,
    },
    usedTurns: Array.from({ length: 12 }, (_, index) => ({ turn: index + 1 })),
    staffDecks: {
      leader: ['問合対応の基本'],
      teacher: ['質問対応の基本'],
      office: ['生徒面談の基本'],
      alba: ['経理精算の基本'],
    },
    summerActionSelections: {
      leader: null,
      teacher: null,
      office: null,
      alba: null,
    },
    tokens: { passion: 3, inspiration: 0, organize: 0 },
  });

  await page.locator('#summerActionConfirm').click();
  await expect(page.locator('#summerMeetingPanel')).toBeVisible();

  await page.locator('#summerMeetingConfirm').click();
  await expect(page.locator('#resultArea')).toBeVisible();
  await expect(page.locator('#resultRank')).toContainText('F');
  await expect(page.locator('#resultTurn')).toContainText('合計 -13');
  await expect(page.locator('#resultTurn')).toContainText('13ターン完了');
  await expect(page.locator('#resultSummary')).toContainText('退塾');
  await expect(page.locator('#resultSummary')).toContainText('22');
  await expect(page.locator('#resultSummary')).toContainText('達成ならず');
});

test('FRESHの計算機モードで13ターン通しスモークを画面操作で完走できる', async ({ page }) => {
  await page.goto('/');
  await waitForGameReady(page);

  await page.locator('#difficultyFresh').click();
  await page.locator('label[for="calcModeToggle"]').click();
  await expect(page.locator('#calcModeToggle')).toBeChecked();
  await page.locator('#startGame').click();

  await expectTurnState(page, { turn: 1, title: '5月下旬', phase: '通常期 / 研修' });

  for (const [turn, title] of [[1, '5月下旬'], [2, '6月上旬'], [3, '6月下旬'], [4, '7月上旬']]) {
    await expectTurnState(page, { turn, title, phase: '通常期 / 研修' });
    await drawTrainingTurnByCalcMode(page);
    await resolveNormalTurnByCalcMode(page);
  }

  await expectTurnState(page, { turn: 5, title: '前期1日目', phase: '講習期 / 準備' });
  await progressSummerPrepByCalcMode(page, 3);
  await expectTurnState(page, { turn: 5, title: '前期1日目', phase: '講習期 / 準備' });
  await progressSummerActionByCalcMode(page);

  await expectTurnState(page, { turn: 6, title: '前期2日目', phase: '講習期 / 教室行動' });
  await progressSummerActionByCalcMode(page);

  await expectTurnState(page, { turn: 7, title: '前期3日目', phase: '講習期 / 教室行動' });
  await progressSummerActionByCalcMode(page);

  await expectTurnState(page, { turn: 8, title: '中期1日目', phase: '講習期 / 教室行動' });
  await progressSummerActionByCalcMode(page);

  await expectTurnState(page, { turn: 9, title: '中期2日目', phase: '講習期 / 教室会議' });
  await progressSummerActionByCalcMode(page);

  await expectTurnState(page, { turn: 10, title: '後期1日目', phase: '講習期 / 準備' });
  await progressSummerPrepByCalcMode(page, 2);
  await expectTurnState(page, { turn: 10, title: '後期1日目', phase: '講習期 / 準備' });
  await progressSummerActionByCalcMode(page);

  await expectTurnState(page, { turn: 11, title: '後期2日目', phase: '講習期 / 教室行動' });
  await progressSummerActionByCalcMode(page);

  await expectTurnState(page, { turn: 12, title: '後期3日目', phase: '講習期 / 教室行動' });
  await progressSummerActionByCalcMode(page);

  await expectTurnState(page, { turn: 13, title: '後期4日目', phase: '講習期 / 教室会議' });
  await progressSummerActionByCalcMode(page);

  await expect(page.locator('#resultArea')).toBeVisible();
  await expect(page.locator('#summerArea')).toBeHidden();
  await expect(page.locator('#resultTurn')).toContainText('13ターン完了');

  await expect.poll(async () => page.evaluate(() => ({
    phase: window.__summerGame.state.phase,
    usedTurnsLength: window.__summerGame.state.usedTurns.length,
    lastTurn: window.__summerGame.state.usedTurns.at(-1)?.turn ?? null,
  }))).toEqual({
    phase: 'result',
    usedTurnsLength: 13,
    lastTurn: 13,
  });
});
