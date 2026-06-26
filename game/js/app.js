import {
  DIFFICULTY_CONFIG,
  NORMAL_STAFF_KEYS,
  STAFFS,
  STAT_KEYS,
  SUMMER_STAFF_KEYS,
  TRAINING_CATEGORIES,
  TURN_CONFIG,
} from './config.js';
import {
  applyEffectText,
  buildCards,
  buildNPool,
  buildTrainingPools,
  formatDelta,
  getStaffKeysForCard,
  iconUrl,
  shuffle,
} from './data.js';

const NORMAL_STAFF_ORDER = [...NORMAL_STAFF_KEYS];
const SUMMER_STAFF_ORDER = [...SUMMER_STAFF_KEYS];
const RARITY_ORDER = { N: 0, R: 1, SR: 2, SSR: 3 };
const SUMMER_TOKEN_LABELS = {
  passion: '情熱',
  inspiration: '発想',
  organize: '整理',
};

function createMap(keys, factory) {
  return Object.fromEntries(keys.map((key) => [key, factory(key)]));
}

function makeInstanceId(prefix = 'card') {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textToHtml(value) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function rarityRank(rarity) {
  return RARITY_ORDER[rarity] ?? 0;
}

function cloneCardWithId(card, prefix = 'deck') {
  return {
    ...card,
    instanceId: card.instanceId ?? makeInstanceId(prefix),
  };
}

function sumStats(stats) {
  return STAT_KEYS.reduce((acc, item) => acc + (stats[item.key] ?? 0), 0);
}

function loadText(path) {
  return fetch(path).then((response) => {
    if (!response.ok) {
      throw new Error(`fetch failed: ${path}`);
    }
    return response.text();
  });
}

export class SummerGameApp {
  constructor(root) {
    this.root = root;
    this.state = this.createInitialState('fresh');
    this.cards = [];
    this.rankRows = [];
    this.trainingPools = null;
    this.trainingDiscards = null;
    this.nPool = [];
    this.elements = {};
    this.pendingMeeting = null;
    this.pendingSummerPrep = null;
    this.binded = false;
    this.statusAnimationTimer = null;
  }

  createInitialState(difficulty) {
    const config = DIFFICULTY_CONFIG[difficulty];
    return {
      difficulty,
      turnIndex: 0,
      phase: 'training',
      trainingDrawsLeft: 4,
      currentPoolType: TURN_CONFIG[0].poolType,
      tokens: difficulty === 'pro'
        ? { passion: 3, inspiration: 0, organize: 0 }
        : null,
      summerPrepCompleted: 0,
      summerPrepTotal: 0,
      hand: [],
      assignments: {},
      staffDecks: {
        leader: [],
        teacher: [],
        office: [],
        alba: [],
      },
      staffFlipped: {
        leader: new Set(),
        teacher: new Set(),
        office: new Set(),
        alba: new Set(),
      },
      staffRestActivity: {
        leader: false,
        teacher: false,
        office: false,
        alba: false,
      },
      staffMidRestRecord: {
        leader: { mid1: null, mid2: null },
        teacher: { mid1: null, mid2: null },
        office: { mid1: null, mid2: null },
        alba: { mid1: null, mid2: null },
      },
      summerActionSelections: {
        leader: null,
        teacher: null,
        office: null,
        alba: null,
      },
      stats: { ...config.initialStats },
      lastDrawId: null,
      log: [],
      usedTurns: [],
      albaChoiceIndex: null,
    };
  }

  async init() {
    this.cacheElements();
    this.bindEvents();
    await this.loadDifficulty(this.state.difficulty, { preserveState: false });
    this.render();
  }

  cacheElements() {
    const ids = [
      'app',
      'title',
      'difficultyFresh',
      'difficultyPro',
      'startGame',
      'summaryToggle',
      'menuToggle',
      'turnPill',
      'phasePill',
      'poolPill',
      'statusExperience',
      'statusEnrollment',
      'statusSatisfaction',
      'statusAccounting',
      'rankInfoExperience',
      'rankInfoEnrollment',
      'rankInfoSatisfaction',
      'rankInfoAccounting',
      'tokenDisplay',
      'trainingArea',
      'actionArea',
      'meetingArea',
      'resultArea',
      'meetingSummary',
      'meetingChoices',
      'trainingChoices',
      'handGrid',
      'handGridAction',
      'staffGrid',
      'nPoolSummary',
      'actionConfirm',
      'meetingConfirm',
      'resultSummary',
      'resultRank',
      'resultTurn',
      'phaseOverlay',
      'phaseName',
      'phaseDescription',
      'menuOverlay',
      'menuDecks',
      'scheduleList',
      'statusOverlay',
      'animationHeader',
      'animationCards',
      'animationClose',
      'logMessages',
      'turnTimeline',
      'previewDifficultyLabel',
      'activeDifficultyLabel',
      'turnDetailLabel',
      'turnDetailSeason',
      'turnDetailPhase',
      'turnDetailPool',
      'turnDetailPrep',
      'nPoolCount',
      'summerArea',
      'summerPhaseTitle',
      'summerPhaseDescription',
      'summerPrepCounter',
      'summerPrepDeckLabel',
      'summerPrepPanel',
      'summerDeckChoices',
      'summerCandidateArea',
      'summerDiscardButton',
      'summerActionPanel',
      'summerActionGrid',
      'summerActionConfirm',
      'summerMeetingPanel',
      'summerMeetingSummary',
      'summerMeetingConfirm',
      'summerDeckGrid',
    ];

    for (const id of ids) {
      this.elements[id] = document.getElementById(id);
    }
  }

  bindEvents() {
    if (this.binded) {
      return;
    }
    this.binded = true;

    this.elements.difficultyFresh?.addEventListener('click', () => this.setDifficulty('fresh'));
    this.elements.difficultyPro?.addEventListener('click', () => this.setDifficulty('pro'));
    this.elements.startGame?.addEventListener('click', () => this.startGame());
    this.elements.summaryToggle?.addEventListener('click', () => this.togglePhaseOverlay());
    this.elements.menuToggle?.addEventListener('click', () => this.toggleMenuOverlay());
    this.elements.animationClose?.addEventListener('click', () => this.hideStatusAnimation());
    this.elements.actionConfirm?.addEventListener('click', () => this.resolveActionPhase());
    this.elements.meetingConfirm?.addEventListener('click', () => this.commitMeetingPhase());
    this.elements.summerActionConfirm?.addEventListener('click', () => this.resolveSummerActionPhase());
    this.elements.summerMeetingConfirm?.addEventListener('click', () => this.commitMeetingPhase());
    this.elements.summerDiscardButton?.addEventListener('click', () => this.discardSummerPrepSelection());

    this.elements.phaseOverlay?.addEventListener('click', (event) => {
      if (event.target?.dataset?.close === '#phaseOverlay' || event.target === this.elements.phaseOverlay) {
        this.hidePhaseOverlay();
      }
    });

    this.elements.menuOverlay?.addEventListener('click', (event) => {
      if (event.target?.dataset?.close === '#menuOverlay' || event.target === this.elements.menuOverlay) {
        this.hideMenuOverlay();
      }
    });

    this.elements.meetingChoices?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-meeting-alba-index]');
      if (!button) {
        return;
      }
      this.selectAlbaMeetingCandidate(Number(button.dataset.meetingAlbaIndex));
    });

    this.elements.summerDeckChoices?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-summer-category]');
      if (!button) {
        return;
      }
      this.startSummerPrepSelection(button.dataset.summerCategory);
    });

    this.elements.summerCandidateArea?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-summer-candidate-id]');
      if (!button) {
        return;
      }
      this.selectSummerPrepCandidate(button.dataset.summerCandidateId);
    });

    this.elements.summerDeckGrid?.addEventListener('click', (event) => {
      const targetButton = event.target.closest('[data-summer-target]');
      if (targetButton) {
        this.exchangeSummerPrepTarget(targetButton.dataset.summerTargetStaff, Number(targetButton.dataset.summerTargetIndex));
        return;
      }
      const useButton = event.target.closest('[data-summer-use]');
      if (useButton) {
        this.selectSummerActionCard(useButton.dataset.summerUseStaff, useButton.dataset.summerUseId);
        return;
      }
      const restButton = event.target.closest('[data-summer-rest]');
      if (restButton) {
        this.setSummerRest(restButton.dataset.summerRest);
      }
    });
  }

  async loadDifficulty(difficulty, { preserveState }) {
    const config = DIFFICULTY_CONFIG[difficulty];
    const [cardCsv, rankCsv] = await Promise.all([
      loadText(config.cardCsv),
      loadText(config.rankCsv),
    ]);
    this.cards = buildCards(cardCsv);
    this.rankRows = this.parseRankCsv(rankCsv);
    this.trainingPools = buildTrainingPools(this.cards, TRAINING_CATEGORIES);
    this.trainingDiscards = createMap(['地域', '全校'], () => createMap(TRAINING_CATEGORIES, () => []));
    this.nPool = buildNPool(this.cards, config.nPoolNames);

    if (!preserveState) {
      this.state = this.createInitialState(difficulty);
    } else {
      this.state.difficulty = difficulty;
      this.state.stats = { ...config.initialStats, ...this.state.stats };
      this.state.currentPoolType = TURN_CONFIG[this.state.turnIndex]?.poolType ?? '地域';
      this.state.tokens = difficulty === 'pro'
        ? (this.state.tokens ?? { passion: 3, inspiration: 0, organize: 0 })
        : null;
    }

    this.elements.activeDifficultyLabel.textContent = config.label;
    this.elements.previewDifficultyLabel.textContent = config.label;
    this.elements.turnDetailLabel.textContent = config.label;
    this.pendingSummerPrep = null;
    this.summerPrepTotal = 0;
  }

  parseRankCsv(csvText) {
    const [header, ...rows] = csvText.trim().split(/\r?\n/).map((row) => row.split(','));
    const indexMap = new Map(header.map((value, index) => [value.trim(), index]));
    return rows
      .filter((row) => row.some((cell) => cell.trim()))
      .map((row) => ({
        rank: row[indexMap.get('ランク')]?.trim() ?? '',
        experience: Number(row[indexMap.get('体験基準')] ?? 0),
        enrollment: Number(row[indexMap.get('入塾基準')] ?? 0),
        satisfaction: Number(row[indexMap.get('満足基準')] ?? 0),
        accounting: Number(row[indexMap.get('経理基準')] ?? 0),
      }));
  }

  startGame() {
    this.hideStartOverlay();
    this.render();
    this.log('ゲームを開始しました');
  }

  hideStartOverlay() {
    document.getElementById('startOverlay')?.classList.add('hidden');
  }

  setDifficulty(difficulty) {
    const current = this.state.difficulty;
    this.elements.difficultyFresh?.classList.toggle('selected', difficulty === 'fresh');
    this.elements.difficultyPro?.classList.toggle('selected', difficulty === 'pro');
    if (current === difficulty && this.cards.length > 0) {
      return;
    }
    this.loadDifficulty(difficulty, { preserveState: false }).then(() => {
      this.render();
      this.log(`${DIFFICULTY_CONFIG[difficulty].label} を選択しました`);
    });
  }

  currentTurnConfig() {
    return TURN_CONFIG[this.state.turnIndex];
  }

  currentTurnKind() {
    return this.currentTurnConfig()?.season === '講習期' ? 'summer' : 'normal';
  }

  currentSummerTurnType() {
    return this.currentTurnConfig()?.phaseKind ?? 'training';
  }

  isSummerPhase() {
    return this.state.phase.startsWith('summer');
  }

  createEmptySummerActionSelections() {
    return createMap(SUMMER_STAFF_ORDER, () => null);
  }

  createEmptySummerFlipMap() {
    return createMap(SUMMER_STAFF_ORDER, () => new Set());
  }

  createEmptySummerRestMap() {
    return createMap(SUMMER_STAFF_ORDER, () => false);
  }

  createEmptySummerMidRestMap() {
    return createMap(SUMMER_STAFF_ORDER, () => ({ mid1: null, mid2: null }));
  }

  refreshTurnStateForCurrentTurn() {
    const turn = this.currentTurnConfig();
    if (!turn) {
      return;
    }
    this.state.currentPoolType = turn.poolType;
    this.pendingMeeting = null;
    this.pendingSummerPrep = null;
    this.state.albaChoiceIndex = null;

    if (turn.season === '通常期') {
      this.state.phase = 'training';
      this.state.trainingDrawsLeft = 4;
      this.state.hand = [];
      this.state.assignments = {};
      this.state.lastDrawId = null;
      return;
    }

    if (turn.phaseKind === 'prep') {
      this.state.phase = 'summer-prep';
      this.state.summerPrepTotal = turn.prepCount;
      this.state.summerPrepCompleted = 0;
      this.state.summerActionSelections = this.createEmptySummerActionSelections();
      this.state.staffRestActivity = this.createEmptySummerRestMap();
      return;
    }

    if (turn.phaseKind === 'summer') {
      this.state.phase = 'summer-action';
      this.state.summerPrepTotal = 0;
      this.state.summerPrepCompleted = 0;
      this.pendingSummerPrep = null;
      this.state.summerActionSelections = this.createEmptySummerActionSelections();
      this.state.staffRestActivity = this.createEmptySummerRestMap();
      return;
    }

    this.state.phase = 'result';
    this.state.summerPrepTotal = 0;
    this.state.summerPrepCompleted = 0;
  }

  moveToNextTurn() {
    const nextIndex = this.state.turnIndex + 1;
    this.pendingMeeting = null;
    this.pendingSummerPrep = null;
    if (nextIndex >= TURN_CONFIG.length) {
      this.state.phase = 'result';
      this.render();
      return;
    }

    this.state.turnIndex = nextIndex;
    this.refreshTurnStateForCurrentTurn();
    this.render();
    this.log(`第${this.state.turnIndex + 1}ターンへ進みます`);
  }

  currentRankFor(statKey) {
    const value = this.state.stats[statKey] ?? 0;
    let current = this.rankRows[0] ?? { rank: '-' };
    let next = null;
    for (const row of this.rankRows) {
      if (value >= row[statKey]) {
        current = row;
      } else {
        next = row;
        break;
      }
    }
    return { current, next };
  }

  drawFromTrainingPool(poolType, category) {
    const deck = this.trainingPools?.[poolType]?.[category] ?? [];
    const discard = this.trainingDiscards?.[poolType]?.[category] ?? [];
    if (deck.length === 0 && discard.length > 0) {
      deck.push(...shuffle(discard));
      discard.length = 0;
    }
    return deck.shift() ?? null;
  }

  drawSummerPrepCandidates(poolType, category) {
    const candidates = [];
    for (let i = 0; i < 3; i += 1) {
      const card = this.drawFromTrainingPool(poolType, category);
      if (!card) {
        break;
      }
      candidates.push(cloneCardWithId(card, 'prep'));
    }
    return candidates;
  }

  drawTrainingCard(category) {
    if (this.state.phase !== 'training' || this.state.trainingDrawsLeft <= 0) {
      return;
    }
    const turn = this.currentTurnConfig();
    const card = this.drawFromTrainingPool(turn.poolType, category);
    if (!card) {
      this.log(`${turn.poolType} ${category} の山札が空です`, 'error');
      return;
    }
    const drawn = cloneCardWithId(card, `turn${turn.turn}`);
    this.state.hand.push(drawn);
    this.state.lastDrawId = drawn.instanceId;
    this.state.trainingDrawsLeft -= 1;
    this.log(`研修で ${drawn.cardName} を獲得しました`);
    if (this.state.trainingDrawsLeft === 0) {
      this.state.phase = 'action';
    }
    this.render();
  }

  selectedAssignment(handIndex) {
    return this.state.assignments[handIndex] ?? '';
  }

  allowedStaffForCard(card) {
    return getStaffKeysForCard(card);
  }

  setAssignment(handIndex, staffKey) {
    if (this.state.phase !== 'action') {
      return;
    }
    if (staffKey && !NORMAL_STAFF_ORDER.includes(staffKey)) {
      return;
    }
    this.state.assignments[handIndex] = staffKey;
    this.renderHandGrid();
    this.updateActionConfirmState();
  }

  assignmentsAreUnique() {
    const seen = new Set();
    for (const staffKey of Object.values(this.state.assignments)) {
      if (!staffKey) {
        continue;
      }
      if (seen.has(staffKey)) {
        return false;
      }
      seen.add(staffKey);
    }
    return true;
  }

  resolveActionPhase() {
    if (this.state.phase !== 'action') {
      return;
    }
    if (!this.assignmentsAreUnique()) {
      this.log('同じスタッフに複数カードは割り当てられません', 'error');
      return;
    }

    const resolution = [];
    const usedStaff = new Set();
    const statsBefore = { ...this.state.stats };
    let nextStats = { ...this.state.stats };
    let nextTokens = this.state.tokens ? { ...this.state.tokens } : this.state.tokens;
    const validAssignments = {};

    for (const [indexText, staffKey] of Object.entries(this.state.assignments)) {
      const index = Number(indexText);
      const card = this.state.hand[index];
      if (!card || !staffKey) {
        continue;
      }
      if (!this.allowedStaffForCard(card).includes(staffKey)) {
        this.log(`${card.cardName} は ${this.getStaffLabel(staffKey)} に置けません`, 'error');
        return;
      }
      validAssignments[index] = staffKey;
    }

    this.state.assignments = validAssignments;

    this.state.hand.forEach((card, index) => {
      const staffKey = this.state.assignments[index];
      if (!staffKey) {
        return;
      }
      usedStaff.add(staffKey);
      const applied = this.applyCard(card, staffKey, nextStats, '通常期', nextTokens);
      nextStats = applied.stats;
      nextTokens = applied.tokens;
      resolution.push({
        type: 'assigned',
        card,
        staffKey,
        details: applied.details,
      });
    });

    const remainingStaff = NORMAL_STAFF_ORDER.filter((key) => !usedStaff.has(key));
    const nUsed = [];
    for (const staffKey of remainingStaff) {
      if (this.nPool.length === 0) {
        resolution.push({ type: 'n-missing', staffKey });
        continue;
      }
      const card = this.nPool.shift();
      const applied = this.applyCard(card, staffKey, nextStats, '通常期', nextTokens);
      nextStats = applied.stats;
      nextTokens = applied.tokens;
      nUsed.push({ card, staffKey, details: applied.details });
      resolution.push({ type: 'n-assigned', card, staffKey, details: applied.details });
    }

    this.state.stats = nextStats;
    this.state.tokens = nextTokens;
    const discarded = this.state.hand
      .map((card, index) => ({ card, staffKey: this.state.assignments[index] ?? null, handIndex: index }))
      .filter((entry) => !entry.staffKey);
    const albaCandidates = discarded.filter((entry) => {
      const allowed = this.allowedStaffForCard(entry.card);
      return ['R', 'SR'].includes(entry.card.rarity) && (allowed.includes('teacher') || allowed.length === NORMAL_STAFF_ORDER.length);
    });
    this.pendingMeeting = {
      kind: 'normal',
      assignedCards: this.state.hand
        .map((card, index) => ({ card, staffKey: this.state.assignments[index] ?? null }))
        .filter((entry) => entry.staffKey),
      nUsed,
      discarded,
      albaCandidates,
      statsBefore,
      statsAfter: nextStats,
      usedTurns: [...resolution],
    };

    this.state.phase = 'meeting';
    this.showStatusAnimation(resolution);
    this.log('教室行動を確定しました');
    this.render();
  }

  selectAlbaMeetingCandidate(index) {
    if (this.state.phase !== 'meeting' || !this.pendingMeeting?.albaCandidates?.[index]) {
      return;
    }
    this.state.albaChoiceIndex = index;
    this.renderMeetingSummary();
  }

  startSummerPrepSelection(category) {
    const turn = this.currentTurnConfig();
    if (this.state.phase !== 'summer-prep' || !turn) {
      return;
    }
    const candidates = this.drawSummerPrepCandidates(turn.poolType, category);
    if (candidates.length === 0) {
      this.log(`${turn.poolType} ${category} の山札が空です`, 'error');
      return;
    }
    this.pendingSummerPrep = {
      poolType: turn.poolType,
      category,
      candidates,
      selectedCandidateId: null,
    };
    this.render();
  }

  selectSummerPrepCandidate(candidateId) {
    if (this.state.phase !== 'summer-prep' || !this.pendingSummerPrep) {
      return;
    }
    if (!this.pendingSummerPrep.candidates.some((card) => card.instanceId === candidateId)) {
      return;
    }
    this.pendingSummerPrep.selectedCandidateId = candidateId;
    this.renderSummerPrepPanel();
    this.renderSummerDeckGrid();
  }

  discardSummerPrepSelection() {
    if (this.state.phase !== 'summer-prep' || !this.pendingSummerPrep) {
      return;
    }
    if (!this.pendingSummerPrep.selectedCandidateId) {
      this.log('交換する候補カードを先に選んでください', 'error');
      return;
    }
    this.finalizeSummerPrepSelection({ discardOnly: true });
  }

  exchangeSummerPrepTarget(staffKey, targetIndex) {
    if (this.state.phase !== 'summer-prep' || !this.pendingSummerPrep || !this.pendingSummerPrep.selectedCandidateId) {
      return;
    }
    const candidate = this.pendingSummerPrep.candidates.find((card) => card.instanceId === this.pendingSummerPrep.selectedCandidateId);
    if (!candidate) {
      return;
    }
    const targetCard = this.state.staffDecks?.[staffKey]?.[targetIndex];
    if (!targetCard) {
      return;
    }
    if (rarityRank(targetCard.rarity) > rarityRank(candidate.rarity)) {
      this.log(`同レアリティ以下のカードしか交換できません`, 'error');
      return;
    }
    this.finalizeSummerPrepSelection({ staffKey, targetIndex, discardOnly: false });
  }

  finalizeSummerPrepSelection({ staffKey = null, targetIndex = null, discardOnly }) {
    if (!this.pendingSummerPrep) {
      return;
    }
    const { candidates, selectedCandidateId } = this.pendingSummerPrep;
    const selectedCandidate = candidates.find((card) => card.instanceId === selectedCandidateId);
    if (!selectedCandidate) {
      return;
    }
    const rejected = candidates.filter((card) => card.instanceId !== selectedCandidateId);
    const discardBucket = this.trainingDiscards[this.pendingSummerPrep.poolType][this.pendingSummerPrep.category];
    discardBucket.push(...rejected.map((card) => ({ ...card })));

    const resolution = [{
      type: discardOnly ? 'summer-prep-discard' : 'summer-prep-exchange',
      card: selectedCandidate,
    }];

    if (!discardOnly && staffKey !== null && targetIndex !== null) {
      const targetCard = this.state.staffDecks[staffKey][targetIndex];
      const replaced = cloneCardWithId(selectedCandidate, 'summer');
      this.state.staffDecks[staffKey][targetIndex] = replaced;
      this.log(`${selectedCandidate.cardName} を ${this.getStaffLabel(staffKey)} に交換しました`);
      if (targetCard) {
        resolution.push({ type: 'summer-prep-target', card: targetCard, staffKey, targetIndex });
      }
    } else {
      discardBucket.push({ ...selectedCandidate });
      this.log(`${selectedCandidate.cardName} を捨てました`);
    }

    this.pendingMeeting = {
      kind: 'summer-prep',
      resolution,
    };
    this.pendingSummerPrep = null;
    this.state.summerPrepCompleted += 1;
    if (this.state.summerPrepCompleted >= this.state.summerPrepTotal) {
      this.state.phase = 'summer-action';
      this.state.summerPrepTotal = 0;
      this.state.summerPrepCompleted = 0;
      this.state.summerActionSelections = this.createEmptySummerActionSelections();
      this.state.staffRestActivity = this.createEmptySummerRestMap();
      this.pendingMeeting = null;
      this.log('講習期の準備が完了しました');
      this.render();
      return;
    }

    this.log('講習期の準備を進めました');
    this.render();
  }

  selectSummerActionCard(staffKey, cardId) {
    if (this.state.phase !== 'summer-action' || !SUMMER_STAFF_ORDER.includes(staffKey)) {
      return;
    }
    const card = this.state.staffDecks?.[staffKey]?.find((item) => item.instanceId === cardId);
    if (!card || this.isSummerCardFlipped(staffKey, card)) {
      return;
    }
    this.state.summerActionSelections[staffKey] = cardId;
    this.renderSummerActionGrid();
    this.renderSummerDeckGrid();
    this.updateSummerActionConfirmState();
  }

  setSummerRest(staffKey) {
    if (this.state.phase !== 'summer-action' || !SUMMER_STAFF_ORDER.includes(staffKey)) {
      return;
    }
    this.state.summerActionSelections[staffKey] = null;
    this.renderSummerActionGrid();
    this.renderSummerDeckGrid();
    this.updateSummerActionConfirmState();
  }

  isSummerCardFlipped(staffKey, card) {
    return !!card?.instanceId && this.state.staffFlipped?.[staffKey]?.has(card.instanceId);
  }

  resolveSummerActionPhase() {
    if (this.state.phase !== 'summer-action') {
      return;
    }

    const statsBefore = { ...this.state.stats };
    let nextStats = { ...this.state.stats };
    let nextTokens = this.state.tokens ? { ...this.state.tokens } : this.state.tokens;
    const resolution = [];
    const usedCards = [];
    const restMap = createMap(SUMMER_STAFF_ORDER, () => false);

    for (const staffKey of SUMMER_STAFF_ORDER) {
      const cardId = this.state.summerActionSelections[staffKey];
      const card = cardId ? this.state.staffDecks[staffKey].find((item) => item.instanceId === cardId) : null;
      if (!card) {
        restMap[staffKey] = false;
        continue;
      }

      restMap[staffKey] = true;
      const applied = this.applyCard(card, staffKey, nextStats, '講習期', nextTokens);
      nextStats = applied.stats;
      nextTokens = applied.tokens;
      usedCards.push({ staffKey, card, details: applied.details });
      resolution.push({ type: 'summer-used', staffKey, card, details: applied.details });
      if (card.rarity === 'SR' || card.rarity === 'SSR') {
        this.state.staffFlipped[staffKey].add(card.instanceId);
      }
    }

    this.state.stats = nextStats;
    this.state.tokens = nextTokens;
    this.state.staffRestActivity = restMap;
    const revivedCards = this.applySummerRevival();

    this.pendingMeeting = {
      kind: 'summer',
      usedCards,
      statsBefore,
      statsAfter: nextStats,
      revivedCards,
      resolution,
    };
    this.state.phase = 'summer-meeting';
    this.showStatusAnimation([...resolution, ...revivedCards.map((item) => ({ type: 'summer-revival', ...item }))]);
    this.log('講習期の教室行動を確定しました');
    this.render();
  }

  applySummerRevival() {
    const turn = this.currentTurnConfig();
    const revivedCards = [];
    if (turn?.season !== '講習期') {
      return revivedCards;
    }
    for (const staffKey of SUMMER_STAFF_ORDER) {
      const rested = !this.state.staffRestActivity[staffKey];
      if (rested) {
        const deck = this.state.staffDecks[staffKey] ?? [];
        for (const card of deck) {
          if (card.rarity === 'SR' && this.state.staffFlipped[staffKey].delete(card.instanceId)) {
            revivedCards.push({ type: 'summer-revival-sr', staffKey, card });
          }
        }
      }

      const record = this.state.staffMidRestRecord[staffKey] ?? { mid1: null, mid2: null };
      if (turn.turn === 8) {
        record.mid1 = rested;
      } else if (turn.turn === 9) {
        record.mid2 = rested;
        if (record.mid1 === true && record.mid2 === true) {
          const deck = this.state.staffDecks[staffKey] ?? [];
          for (const card of deck) {
            if (card.rarity === 'SSR' && this.state.staffFlipped[staffKey].delete(card.instanceId)) {
              revivedCards.push({ type: 'summer-revival-ssr', staffKey, card });
            }
          }
        }
      }
      this.state.staffMidRestRecord[staffKey] = record;
    }
    return revivedCards;
  }

  applyCard(card, staffKey, stats, seasonLabel, tokens = null) {
    let nextStats = { ...stats };
    const tokenState = tokens ? { ...tokens } : tokens;
    const {
      stats: appliedStats,
      details,
      tokens: appliedTokens,
      tokenDetails,
    } = applyEffectText(card, nextStats, {
      difficulty: this.state.difficulty,
      tokens: tokenState,
    });
    nextStats = appliedStats;
    const nextTokens = appliedTokens ?? tokenState;

    for (const detail of tokenDetails ?? []) {
      this.log(`${detail.source}発動: ${SUMMER_TOKEN_LABELS[detail.token] ?? detail.token}${formatDelta(detail.delta)}`);
    }

    if (seasonLabel === '通常期') {
      if (card.category === '動員') {
        nextStats.experience += 2;
        details.push({ key: 'experience', delta: 2, label: '体験' });
      }
      if (card.category === '庶務') {
        nextStats.accounting += 2;
        details.push({ key: 'accounting', delta: 2, label: '経理' });
      }
    } else if (seasonLabel === '講習期') {
      if (card.category === '教務') {
        nextStats.enrollment += 2;
        details.push({ key: 'enrollment', delta: 2, label: '入塾' });
      }
      if (card.category === '応対') {
        nextStats.satisfaction += 2;
        details.push({ key: 'satisfaction', delta: 2, label: '満足' });
      }
    }

    return { stats: nextStats, details, tokens: nextTokens, tokenDetails };
  }

  commitMeetingPhase() {
    if (!this.pendingMeeting) {
      return;
    }

    if (this.pendingMeeting.kind === 'summer') {
      this.state.usedTurns.push({
        turn: this.currentTurnConfig().turn,
        stats: { ...this.state.stats },
      });
      this.pendingMeeting = null;
      this.state.hand = [];
      this.state.assignments = {};
      this.state.lastDrawId = null;
      this.state.albaChoiceIndex = null;
      this.moveToNextTurn();
      return;
    }

    if (this.pendingMeeting.kind === 'normal') {
      for (const item of this.pendingMeeting.assignedCards) {
        this.state.staffDecks[item.staffKey].push(cloneCardWithId(item.card, item.staffKey));
      }

      for (const item of this.pendingMeeting.nUsed) {
        this.state.staffDecks[item.staffKey].push(cloneCardWithId(item.card, item.staffKey));
      }

      const albaCandidate = this.pendingMeeting.albaCandidates?.[this.state.albaChoiceIndex ?? -1];
      if (albaCandidate) {
        this.state.staffDecks.alba = [cloneCardWithId(albaCandidate.card, 'alba')];
        this.log(`${albaCandidate.card.cardName} をアルバイト講師デッキに移しました`);
      }

      this.state.usedTurns.push({
        turn: this.currentTurnConfig().turn,
        stats: { ...this.state.stats },
      });

      this.pendingMeeting = null;
      this.state.hand = [];
      this.state.assignments = {};
      this.state.lastDrawId = null;
      this.state.albaChoiceIndex = null;
      this.moveToNextTurn();
    }
  }

  getStaffLabel(staffKey) {
    return STAFFS.find((staff) => staff.key === staffKey)?.label ?? staffKey;
  }

  render() {
    this.renderDifficultyButtons();
    this.renderTurnPill();
    this.renderStatus();
    this.renderTokenDisplay();
    this.renderPhaseAreas();
    this.renderTurnTimeline();
    this.renderMenu();
    this.renderPhaseOverlay();
    this.renderMeetingSummary();
    this.renderSummerArea();
    this.renderResult();
    this.renderNPool();
    this.renderHandGrid();
    this.renderStaffGrid();
    this.renderTrainingChoices();
    this.updateActionConfirmState();
  }

  renderDifficultyButtons() {
    const isFresh = this.state.difficulty === 'fresh';
    this.elements.difficultyFresh?.classList.toggle('selected', isFresh);
    this.elements.difficultyPro?.classList.toggle('selected', !isFresh);
  }

  renderTurnPill() {
    const turn = this.currentTurnConfig();
    if (!turn) {
      return;
    }
    this.elements.turnPill.textContent = `第${turn.turn}ターン ${turn.title}`;
    this.elements.phasePill.textContent = `${turn.season} / ${turn.phase}`;
    this.elements.poolPill.textContent = turn.phaseKind === 'training'
      ? `${turn.poolType} 研修`
      : turn.phaseKind === 'prep'
        ? `${turn.poolType} 準備`
        : turn.phaseKind === 'summer'
          ? `${turn.poolType} 講習`
          : '結果';
    this.elements.turnDetailLabel.textContent = `${turn.title}`;
    this.elements.turnDetailSeason.textContent = turn.season;
    this.elements.turnDetailPhase.textContent = turn.phase;
    this.elements.turnDetailPool.textContent = turn.poolType;
    this.elements.turnDetailPrep.textContent = `${turn.prepCount}回`;
  }

  renderStatus() {
    const values = [
      ['statusExperience', 'experience'],
      ['statusEnrollment', 'enrollment'],
      ['statusSatisfaction', 'satisfaction'],
      ['statusAccounting', 'accounting'],
    ];

    for (const [elementId, key] of values) {
      const element = this.elements[elementId];
      if (element) {
        element.textContent = String(this.state.stats[key] ?? 0);
      }
      this.renderRankCard(key);
    }
  }

  renderTokenDisplay() {
    if (!this.elements.tokenDisplay) {
      return;
    }
    const tokens = this.state.tokens;
    const visible = this.state.difficulty === 'pro' && !!tokens;
    this.elements.tokenDisplay.classList.toggle('hidden', !visible);
    if (!visible) {
      this.elements.tokenDisplay.innerHTML = '';
      return;
    }

    this.elements.tokenDisplay.innerHTML = [
      { key: 'passion', label: '情熱', className: 'token-passion' },
      { key: 'inspiration', label: '発想', className: 'token-inspiration' },
      { key: 'organize', label: '整理', className: 'token-organize' },
    ].map((entry) => `
      <span class="token-chip ${entry.className}">${entry.label} ${tokens[entry.key] ?? 0}</span>
    `).join('');
  }

  renderRankCard(statKey) {
    const elementMap = {
      experience: this.elements.rankInfoExperience,
      enrollment: this.elements.rankInfoEnrollment,
      satisfaction: this.elements.rankInfoSatisfaction,
      accounting: this.elements.rankInfoAccounting,
    };
    const container = elementMap[statKey];
    if (!container) {
      return;
    }
    const { current, next } = this.currentRankFor(statKey);
    const value = this.state.stats[statKey] ?? 0;
    const progress = container.querySelector('.rank-progress-fill');
    const label = container.querySelector('.rank-label');
    const deficit = container.querySelector('.rank-deficit');
    label.textContent = current.rank || '-';
    const start = current[statKey] ?? 0;
    const end = next?.[statKey] ?? start;
    const ratio = end > start ? ((value - start) / (end - start)) * 100 : 100;
    progress.style.width = `${Math.max(0, Math.min(100, ratio))}%`;
    if (next) {
      deficit.textContent = `次のランクまであと${Math.max(0, end - value)}`;
      deficit.classList.remove('hidden');
    } else {
      deficit.textContent = '最高ランク';
      deficit.classList.remove('hidden');
    }
  }

  renderPhaseAreas() {
    const phase = this.state.phase;
    this.elements.trainingArea?.classList.toggle('hidden', phase !== 'training');
    this.elements.actionArea?.classList.toggle('hidden', phase !== 'action');
    this.elements.meetingArea?.classList.toggle('hidden', phase !== 'meeting');
    this.elements.summerArea?.classList.toggle('hidden', !this.isSummerPhase());
    this.elements.resultArea?.classList.toggle('hidden', phase !== 'result');
    this.elements.summerPrepPanel?.classList.toggle('hidden', phase !== 'summer-prep');
    this.elements.summerActionPanel?.classList.toggle('hidden', phase !== 'summer-action');
    this.elements.summerMeetingPanel?.classList.toggle('hidden', phase !== 'summer-meeting');
  }

  renderTurnTimeline() {
    if (!this.elements.turnTimeline) {
      return;
    }
    this.elements.turnTimeline.innerHTML = TURN_CONFIG.map((turn) => {
      const active = turn.turn === this.currentTurnConfig().turn;
      return `
        <button type="button" class="turn-chip ${active ? 'active' : ''}" data-turn="${turn.turn}">
          <span class="turn-chip-no">${turn.turn}</span>
          <span class="turn-chip-title">${turn.title}</span>
        </button>
      `;
    }).join('');

    this.elements.turnTimeline.querySelectorAll('[data-turn]').forEach((button) => {
      button.addEventListener('click', () => this.openPhaseOverlay(Number(button.dataset.turn)));
    });
  }

  renderTrainingChoices() {
    if (!this.elements.trainingChoices) {
      return;
    }
    const turn = this.currentTurnConfig();
    const pool = this.trainingPools?.[turn.poolType] ?? {};
    this.elements.trainingChoices.innerHTML = TRAINING_CATEGORIES.map((category) => {
      const count = pool[category]?.length ?? 0;
      return `
        <button type="button" class="choice-button category-${category}" data-category="${category}">
          <span class="choice-label">${category}</span>
          <span class="choice-count">${count}枚</span>
        </button>
      `;
    }).join('');

    this.elements.trainingChoices.querySelectorAll('[data-category]').forEach((button) => {
      button.addEventListener('click', () => this.drawTrainingCard(button.dataset.category));
    });
  }

  renderHandGrid() {
    if (!this.elements.handGrid) {
      return;
    }
    const slots = Array.from({ length: 4 }, (_, index) => this.state.hand[index] ?? null);
    const html = slots
      .map((card, index) => {
        if (!card) {
          return `<article class="hand-slot empty"><div class="slot-placeholder">手札${index + 1}</div></article>`;
        }
        const allowed = this.allowedStaffForCard(card);
        const assigned = this.selectedAssignment(index);
        const disabledOptions = new Set(Object.values(this.state.assignments).filter(Boolean));

        return `
          <article class="hand-slot ${card.instanceId === this.state.lastDrawId ? 'is-new' : ''}">
            <div class="card-frame">
              <img class="card-thumbnail" src="${iconUrl(card, `?v=${card.cardNo ?? ''}`)}" alt="">
              <div class="card-header">
                <span class="card-name">${card.cardName}</span>
                <span class="card-rarity rarity-${card.rarity}">${card.rarity}</span>
              </div>
              <div class="card-body">
                <div class="card-meta">
                  <span class="card-category-text category-${card.category}">${card.category}</span>
                </div>
                <p class="card-effect">${card.topEffect || card.effect}</p>
              </div>
            </div>
            <label class="assignment-select">
              <span>配置先</span>
              <select data-hand-index="${index}" ${this.state.phase !== 'action' ? 'disabled' : ''}>
                <option value="" ${!assigned ? 'selected' : ''}>未使用</option>
                ${NORMAL_STAFF_ORDER.map((key) => {
                  const disabled = !allowed.includes(key) || (disabledOptions.has(key) && assigned !== key);
                  return `<option value="${key}" ${assigned === key ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${this.getStaffLabel(key)}</option>`;
                }).join('')}
              </select>
            </label>
          </article>
        `;
      })
      .join('');

    this.elements.handGrid.innerHTML = html;
    if (this.elements.handGridAction) {
      this.elements.handGridAction.innerHTML = html;
    }

    document.querySelectorAll('select[data-hand-index]').forEach((select) => {
      select.addEventListener('change', () => {
        this.setAssignment(Number(select.dataset.handIndex), select.value || '');
      });
    });
  }

  renderStaffGrid() {
    if (!this.elements.staffGrid) {
      return;
    }
    const cards = this.pendingMeeting?.assignedCards ?? [];
    const nUsed = this.pendingMeeting?.nUsed ?? [];
    this.elements.staffGrid.innerHTML = NORMAL_STAFF_ORDER.map((staffKey) => {
      const directCard = cards.find((item) => item.staffKey === staffKey)?.card ?? null;
      const nCard = nUsed.find((item) => item.staffKey === staffKey)?.card ?? null;
      const card = directCard || nCard;
      const deckCount = this.state.staffDecks[staffKey]?.length ?? 0;
      return `
        <article class="staff-slot">
          <div class="staff-slot-head">
            <strong>${this.getStaffLabel(staffKey)}</strong>
            <span class="staff-deck-count">${deckCount}枚</span>
          </div>
          <div class="staff-slot-body ${card ? 'filled' : ''}">
            ${card ? `
              <div class="staff-card">
                <span class="staff-card-name">${card.cardName}</span>
                <span class="staff-card-note">${card.rarity} / ${card.category}</span>
              </div>
            ` : `<span class="slot-placeholder">未配置</span>`}
          </div>
        </article>
      `;
    }).join('');
  }

  renderNPool() {
    if (!this.elements.nPoolSummary) {
      return;
    }
    const remaining = this.nPool.length;
    this.elements.nPoolSummary.innerHTML = `
      <span class="token-chip token-organize">Nプール ${remaining}枚</span>
      <span class="token-chip token-inspiration">未割当スタッフへ自動補完</span>
      <span class="token-chip token-passion">Nは職種制限なし</span>
    `;
    if (this.elements.nPoolCount) {
      this.elements.nPoolCount.textContent = String(remaining);
    }
  }

  renderMenu() {
    if (!this.elements.menuDecks) {
      return;
    }
    this.elements.menuDecks.innerHTML = SUMMER_STAFF_ORDER.map((staffKey) => {
      const deck = this.state.staffDecks[staffKey];
      const cards = deck.slice(-4).map((card) => `<li>${card.cardName} / ${card.rarity}${this.isSummerCardFlipped(staffKey, card) ? ' / 裏返し' : ''}</li>`).join('') || '<li>未蓄積</li>';
      return `
        <section class="deck-column">
          <h3>${this.getStaffLabel(staffKey)}</h3>
          <p>${deck.length}枚</p>
          <ul>${cards}</ul>
        </section>
      `;
    }).join('');

    if (this.elements.scheduleList) {
      this.elements.scheduleList.innerHTML = TURN_CONFIG.map((turn) => `
        <li class="schedule-item ${turn.turn === this.currentTurnConfig().turn ? 'active' : ''}">
          <strong>第${turn.turn}ターン</strong>
          <span>${turn.title} / ${turn.season} / ${turn.phase}</span>
        </li>
      `).join('');
    }
  }

  renderMeetingSummary() {
    if (!this.elements.meetingSummary) {
      return;
    }
    if (!this.pendingMeeting || this.pendingMeeting.kind !== 'normal') {
      this.elements.meetingSummary.innerHTML = '<div class="meeting-summary-item">行動確定後にここへ移動内容を表示します。</div>';
      if (this.elements.meetingChoices) {
        this.elements.meetingChoices.innerHTML = '';
      }
      return;
    }
    const assigned = this.pendingMeeting.assignedCards.map((item) => `${this.getStaffLabel(item.staffKey)}: ${item.card.cardName}`).join(' / ') || 'なし';
    const nUsed = this.pendingMeeting.nUsed.map((item) => `${this.getStaffLabel(item.staffKey)}: ${item.card.cardName}`).join(' / ') || 'なし';
    const discarded = this.pendingMeeting.discarded.map((item) => item.card.cardName).join(' / ') || 'なし';
    const albaCandidates = this.pendingMeeting.albaCandidates ?? [];
    const albaChoice = albaCandidates[this.state.albaChoiceIndex ?? -1] ?? null;
    this.elements.meetingSummary.innerHTML = `
      <div class="meeting-summary-item">配置カード: ${assigned}</div>
      <div class="meeting-summary-item">N補完: ${nUsed}</div>
      <div class="meeting-summary-item">余りカード: ${discarded}</div>
      <div class="meeting-summary-item">アルバイト講師候補: ${albaChoice ? `${albaChoice.card.cardName}` : '未選択'}</div>
    `;
    if (this.elements.meetingChoices) {
      this.elements.meetingChoices.innerHTML = albaCandidates.length > 0
        ? albaCandidates.map((entry, index) => {
          const selected = this.state.albaChoiceIndex === index;
          const card = entry.card;
          return `
            <button type="button" class="meeting-card-button ${selected ? 'selected' : ''}" data-meeting-alba-index="${index}">
              <div class="summer-card-top">
                <span class="summer-card-name">${card.cardName}</span>
                <span class="card-rarity rarity-${card.rarity}">${card.rarity}</span>
              </div>
              <div class="summer-card-desc">${textToHtml(card.topEffect || card.effect)}</div>
            </button>
          `;
        }).join('')
        : '<div class="meeting-summary-item">アルバイト講師候補はありません。</div>';
    }
  }

  renderSummerArea() {
    if (!this.isSummerPhase()) {
      if (this.elements.summerDeckGrid) {
        this.elements.summerDeckGrid.innerHTML = '';
      }
      if (this.elements.summerActionGrid) {
        this.elements.summerActionGrid.innerHTML = '';
      }
      if (this.elements.summerCandidateArea) {
        this.elements.summerCandidateArea.innerHTML = '';
      }
      return;
    }

    const turn = this.currentTurnConfig();
    if (this.elements.summerPhaseTitle) {
      this.elements.summerPhaseTitle.textContent = turn?.phaseKind === 'prep'
        ? '講習期 準備'
        : turn?.phaseKind === 'summer'
          ? '講習期 教室行動'
          : '講習期 教室会議';
    }
    if (this.elements.summerPhaseDescription) {
      this.elements.summerPhaseDescription.textContent = turn?.phaseKind === 'prep'
        ? '山札のトップ3枚を見て1枚を交換するか捨てます。'
        : turn?.phaseKind === 'summer'
          ? '各スタッフの講習デッキから1枚ずつ使うか、休憩します。'
          : '休憩したスタッフの SR / SSR を復活させます。';
    }
    if (this.elements.summerPrepCounter) {
      const total = this.state.summerPrepTotal || turn?.prepCount || 0;
      const completed = this.state.summerPrepCompleted || 0;
      this.elements.summerPrepCounter.textContent = total > 0 ? `準備 ${Math.min(completed + 1, total)}/${total}` : '-';
    }
    if (this.elements.summerPrepDeckLabel) {
      this.elements.summerPrepDeckLabel.textContent = turn ? `${turn.poolType} プール` : '-';
    }

    this.renderSummerPrepPanel();
    this.renderSummerActionGrid();
    this.renderSummerDeckGrid();
    this.renderSummerMeetingSummary();
    this.updateSummerActionConfirmState();
  }

  renderSummerPrepPanel() {
    if (!this.elements.summerCandidateArea || !this.elements.summerDeckChoices) {
      return;
    }
    if (this.state.phase !== 'summer-prep') {
      this.elements.summerDeckChoices.innerHTML = '';
      this.elements.summerCandidateArea.innerHTML = '';
      if (this.elements.summerDiscardButton) {
        this.elements.summerDiscardButton.disabled = true;
      }
      return;
    }

    const turn = this.currentTurnConfig();
    const pool = this.trainingPools?.[turn.poolType] ?? {};
    this.elements.summerDeckChoices.innerHTML = TRAINING_CATEGORIES.map((category) => {
      const count = pool[category]?.length ?? 0;
      return `
        <button type="button" class="choice-button category-${category}" data-summer-category="${category}">
          <span class="choice-label">${category}</span>
          <span class="choice-count">${count}枚</span>
        </button>
      `;
    }).join('');

    if (!this.pendingSummerPrep) {
      this.elements.summerCandidateArea.innerHTML = '<div class="meeting-summary-item">山札を1つ選んでください。</div>';
      this.elements.summerDiscardButton.disabled = true;
      return;
    }

    const selectedId = this.pendingSummerPrep.selectedCandidateId;
    this.elements.summerCandidateArea.innerHTML = `
      <div class="meeting-summary-item">選択中: ${this.pendingSummerPrep.category}</div>
      <div class="summer-candidate-grid">
        ${this.pendingSummerPrep.candidates.map((card) => `
          <button type="button" class="summer-card-button ${selectedId === card.instanceId ? 'selected' : ''}" data-summer-candidate-id="${card.instanceId}">
            <div class="summer-card-top">
              <span class="summer-card-name">${card.cardName}</span>
              <span class="card-rarity rarity-${card.rarity}">${card.rarity}</span>
            </div>
            <div class="summer-card-meta">
              <span class="card-category-text category-${card.category}">${card.category}</span>
              <span class="summer-card-desc">${textToHtml(card.topEffect || card.effect)}</span>
            </div>
          </button>
        `).join('')}
      </div>
      <div class="meeting-summary-item">交換先を選んでから「交換せず捨てる」か、カードを交換してください。</div>
    `;
    if (this.elements.summerDiscardButton) {
      this.elements.summerDiscardButton.disabled = !selectedId;
    }
  }

  renderSummerActionGrid() {
    if (!this.elements.summerActionGrid) {
      return;
    }
    if (this.state.phase !== 'summer-action') {
      this.elements.summerActionGrid.innerHTML = '';
      return;
    }

    this.elements.summerActionGrid.innerHTML = SUMMER_STAFF_ORDER.map((staffKey) => {
      const selectedId = this.state.summerActionSelections[staffKey];
      const selectedCard = selectedId ? this.state.staffDecks[staffKey].find((card) => card.instanceId === selectedId) : null;
      const deckCount = this.state.staffDecks[staffKey]?.length ?? 0;
      return `
        <article class="summer-action-column">
          <div class="summer-action-column-head">
            <strong>${this.getStaffLabel(staffKey)}</strong>
            <span class="summer-deck-count">${deckCount}枚</span>
          </div>
          <div class="summer-action-note">${selectedCard ? `選択中: ${selectedCard.cardName}` : '休憩中'}</div>
        </article>
      `;
    }).join('');
  }

  renderSummerDeckGrid() {
    if (!this.elements.summerDeckGrid) {
      return;
    }
    if (!this.isSummerPhase()) {
      this.elements.summerDeckGrid.innerHTML = '';
      return;
    }

    const mode = this.state.phase;
    const prepCandidate = this.pendingSummerPrep?.selectedCandidateId
      ? this.pendingSummerPrep.candidates.find((card) => card.instanceId === this.pendingSummerPrep.selectedCandidateId)
      : null;

    this.elements.summerDeckGrid.innerHTML = SUMMER_STAFF_ORDER.map((staffKey) => {
      const deck = this.state.staffDecks[staffKey] ?? [];
      const selectionId = this.state.summerActionSelections[staffKey];
      return `
        <article class="summer-deck-column">
          <div class="summer-deck-column-head">
            <strong class="summer-deck-title">${this.getStaffLabel(staffKey)}</strong>
            <span class="summer-deck-count">${deck.length}枚</span>
          </div>
          <div class="summer-deck-cards">
            ${deck.length > 0 ? deck.map((card, index) => {
              const flipped = this.isSummerCardFlipped(staffKey, card);
              if (mode === 'summer-action') {
                return `
                  <button type="button" class="summer-deck-card-button ${selectionId === card.instanceId ? 'selected' : ''} ${flipped ? 'flipped' : ''} ${flipped ? 'disabled' : ''}" data-summer-use data-summer-use-staff="${staffKey}" data-summer-use-id="${card.instanceId}" ${flipped ? 'disabled' : ''}>
                    <div class="summer-card-top">
                      <span class="summer-card-name">${card.cardName}</span>
                      <span class="card-rarity rarity-${card.rarity}">${card.rarity}</span>
                    </div>
                    <div class="summer-card-meta">
                      <span class="card-category-text category-${card.category}">${card.category}</span>
                      <span class="summer-deck-card-badge">${flipped ? '裏返し' : '使用可'}</span>
                    </div>
                    <div class="summer-card-desc">${textToHtml(card.topEffect || card.effect)}</div>
                  </button>
                `;
              }
              if (mode === 'summer-prep') {
                const eligible = !!prepCandidate && rarityRank(card.rarity) <= rarityRank(prepCandidate.rarity);
                return `
                  <button type="button" class="summer-deck-card-button ${eligible ? '' : 'disabled'}" data-summer-target data-summer-target-staff="${staffKey}" data-summer-target-index="${index}" ${eligible ? '' : 'disabled'}>
                    <div class="summer-card-top">
                      <span class="summer-card-name">${card.cardName}</span>
                      <span class="card-rarity rarity-${card.rarity}">${card.rarity}</span>
                    </div>
                    <div class="summer-card-meta">
                      <span class="card-category-text category-${card.category}">${card.category}</span>
                      <span class="summer-deck-card-badge">${flipped ? '裏返し' : eligible ? '交換可' : '不可'}</span>
                    </div>
                    <div class="summer-card-desc">${textToHtml(card.topEffect || card.effect)}</div>
                  </button>
                `;
              }
              return `
                <div class="summer-deck-card-button ${flipped ? 'flipped' : ''}">
                  <div class="summer-card-top">
                    <span class="summer-card-name">${card.cardName}</span>
                    <span class="card-rarity rarity-${card.rarity}">${card.rarity}</span>
                  </div>
                  <div class="summer-card-meta">
                    <span class="card-category-text category-${card.category}">${card.category}</span>
                    <span class="summer-deck-card-badge">${flipped ? '裏返し' : '保有中'}</span>
                  </div>
                  <div class="summer-card-desc">${textToHtml(card.topEffect || card.effect)}</div>
                </div>
              `;
            }).join('') : '<div class="meeting-summary-item">カードなし</div>'}
          </div>
          ${mode === 'summer-action' ? `<div class="summer-deck-actions"><button type="button" class="summer-rest-button ${this.state.summerActionSelections[staffKey] === null ? 'active' : ''}" data-summer-rest="${staffKey}">休む</button></div>` : ''}
        </article>
      `;
    }).join('');
  }

  renderSummerMeetingSummary() {
    if (!this.elements.summerMeetingSummary) {
      return;
    }
    if (this.state.phase !== 'summer-meeting' || this.pendingMeeting?.kind !== 'summer') {
      this.elements.summerMeetingSummary.innerHTML = '<div class="meeting-summary-item">教室行動の確定後に復活処理を表示します。</div>';
      return;
    }

    const used = this.pendingMeeting.usedCards.map((item) => `${this.getStaffLabel(item.staffKey)}: ${item.card.cardName}`).join(' / ') || 'なし';
    const rested = SUMMER_STAFF_ORDER.filter((staffKey) => !this.state.staffRestActivity[staffKey]).map((staffKey) => this.getStaffLabel(staffKey)).join(' / ') || 'なし';
    const revived = this.pendingMeeting.revivedCards.map((item) => `${this.getStaffLabel(item.staffKey)}: ${item.card.cardName}`).join(' / ') || 'なし';
    this.elements.summerMeetingSummary.innerHTML = `
      <div class="meeting-summary-item">使用: ${used}</div>
      <div class="meeting-summary-item">休憩: ${rested}</div>
      <div class="meeting-summary-item">復活: ${revived}</div>
    `;
  }

  updateSummerActionConfirmState() {
    if (!this.elements.summerActionConfirm) {
      return;
    }
    this.elements.summerActionConfirm.disabled = this.state.phase !== 'summer-action';
  }

  renderPhaseOverlay(turnIndex = this.currentTurnConfig().turn) {
    if (!this.elements.phaseOverlay) {
      return;
    }
    const turn = TURN_CONFIG[turnIndex - 1];
    if (!turn) {
      return;
    }
    const prepText = turn.prepCount > 0 ? `準備フェーズ ${turn.prepCount}回` : '準備フェーズなし';
    this.elements.phaseName.textContent = `第${turn.turn}ターン ${turn.title}`;
    if (turn.season === '通常期') {
      this.elements.phaseDescription.textContent = `${turn.season}の${turn.phase}。${turn.poolType}プールを使う研修です。${prepText}。`;
    } else if (turn.phaseKind === 'prep') {
      this.elements.phaseDescription.textContent = `${turn.season}の準備。${turn.poolType}プールから3枚見て交換するか捨てます。${prepText}。`;
    } else if (turn.phaseKind === 'summer') {
      this.elements.phaseDescription.textContent = `${turn.season}の教室行動。4つの講習デッキから1枚ずつ使うか休憩します。${prepText}。`;
    } else if (turn.phaseKind === 'result') {
      this.elements.phaseDescription.textContent = '結果画面。累積した4指標からランクを表示します。';
    } else {
      this.elements.phaseDescription.textContent = `${turn.season}の教室会議。休憩したスタッフの SR / SSR を復活させます。${prepText}。`;
    }
  }

  renderResult() {
    if (this.state.phase !== 'result' || !this.elements.resultSummary) {
      return;
    }
    const total = sumStats(this.state.stats);
    this.elements.resultSummary.innerHTML = STAT_KEYS.map((item) => {
      const { current } = this.currentRankFor(item.key);
      return `
        <li class="result-item">
          <span class="result-label">${item.label}</span>
          <span class="result-value">${this.state.stats[item.key] ?? 0}</span>
          <span class="result-rank">${current.rank}</span>
        </li>
      `;
    }).join('');
    this.elements.resultRank.textContent = `合計 ${total}`;
    this.elements.resultTurn.textContent = `${this.state.usedTurns.length}ターン完了`;
  }

  updateActionConfirmState() {
    if (!this.elements.actionConfirm) {
      return;
    }
    const active = this.state.phase === 'action' && this.state.hand.some((_, index) => this.state.assignments[index]);
    this.elements.actionConfirm.disabled = !active;
  }

  togglePhaseOverlay() {
    if (this.elements.phaseOverlay?.classList.contains('hidden')) {
      this.openPhaseOverlay(this.currentTurnConfig().turn);
    } else {
      this.hidePhaseOverlay();
    }
  }

  toggleMenuOverlay() {
    if (this.elements.menuOverlay?.classList.contains('hidden')) {
      this.showMenuOverlay();
    } else {
      this.hideMenuOverlay();
    }
  }

  openPhaseOverlay(turnIndex) {
    this.renderPhaseOverlay(turnIndex);
    this.elements.phaseOverlay?.classList.remove('hidden');
    this.elements.phaseOverlay?.setAttribute('aria-hidden', 'false');
  }

  hidePhaseOverlay() {
    this.elements.phaseOverlay?.classList.add('hidden');
    this.elements.phaseOverlay?.setAttribute('aria-hidden', 'true');
  }

  showMenuOverlay() {
    this.renderMenu();
    this.elements.menuOverlay?.classList.remove('hidden');
    this.elements.menuOverlay?.setAttribute('aria-hidden', 'false');
  }

  hideMenuOverlay() {
    this.elements.menuOverlay?.classList.add('hidden');
    this.elements.menuOverlay?.setAttribute('aria-hidden', 'true');
  }

  showStatusAnimation(resolution) {
    if (!this.elements.statusOverlay) {
      return;
    }
    if (this.statusAnimationTimer) {
      window.clearTimeout(this.statusAnimationTimer);
      this.statusAnimationTimer = null;
    }
    const lines = resolution.map((item) => {
      if (item.type === 'assigned' || item.type === 'n-assigned') {
        const deltas = item.details.map((detail) => `${detail.label}${formatDelta(detail.delta)}`).join('、') || '変化なし';
        return `<div class="animation-card-item">${item.card.cardName} / ${this.getStaffLabel(item.staffKey)} / ${deltas}</div>`;
      }
      if (item.type === 'n-missing') {
        return `<div class="animation-card-item">${this.getStaffLabel(item.staffKey)} は Nプール枯渇のため空欄</div>`;
      }
      if (item.type === 'summer-used') {
        const deltas = item.details.map((detail) => `${detail.label}${formatDelta(detail.delta)}`).join('、') || '変化なし';
        return `<div class="animation-card-item">${item.card.cardName} / ${this.getStaffLabel(item.staffKey)} / ${deltas}</div>`;
      }
      if (item.type === 'summer-revival') {
        return `<div class="animation-card-item">${this.getStaffLabel(item.staffKey)} の ${item.card.cardName} が復活しました</div>`;
      }
      if (item.type === 'summer-revival-sr') {
        return `<div class="animation-card-item">${this.getStaffLabel(item.staffKey)} の SR が復活しました</div>`;
      }
      if (item.type === 'summer-revival-ssr') {
        return `<div class="animation-card-item">${this.getStaffLabel(item.staffKey)} の SSR が復活しました</div>`;
      }
      if (item.type === 'summer-prep-exchange') {
        return `<div class="animation-card-item">${item.card.cardName} を交換候補に選びました</div>`;
      }
      if (item.type === 'summer-prep-discard') {
        return `<div class="animation-card-item">${item.card.cardName} を捨てました</div>`;
      }
      return '';
    }).join('');

    this.elements.animationHeader.textContent = 'カード効果発動';
    this.elements.animationCards.innerHTML = lines || '<div class="animation-card-item">変化なし</div>';
    this.elements.statusOverlay.classList.remove('hidden');
    this.statusAnimationTimer = window.setTimeout(() => {
      this.hideStatusAnimation();
    }, 900);
  }

  hideStatusAnimation() {
    if (this.statusAnimationTimer) {
      window.clearTimeout(this.statusAnimationTimer);
      this.statusAnimationTimer = null;
    }
    this.elements.statusOverlay?.classList.add('hidden');
  }

  log(message, kind = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-message log-${kind}`;
    entry.textContent = message;
    this.elements.logMessages?.prepend(entry);
  }
}
