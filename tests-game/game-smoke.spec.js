import { expect, test } from '@playwright/test';

async function setupGame(page, config) {
  await page.evaluate((payload) => {
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

    app.pendingMeeting = null;
    app.pendingSummerPrep = null;
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
