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
  normalizeCardNo,
  parseCsv,
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
const SAVE_KEY = 'cdg_summer_state';
const CALC_MODE_KEY = 'cdg_summer_calc_mode';
const HIGHSCORE_KEY_PREFIX = 'cdg_summer_highscore_';
const SAVE_VERSION = 1;

function createMap(keys, factory) {
  return Object.fromEntries(keys.map((key) => [key, factory(key)]));
}

function cloneJson(value) {
  if (value === undefined || value === null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function cloneCardList(cards) {
  return Array.isArray(cards) ? cards.map((card) => cloneJson(card)) : [];
}

function toStringSet(values) {
  return new Set(Array.isArray(values) ? values.filter((value) => typeof value === 'string') : []);
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

function parseOptionalNumber(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatScore(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatSignedScore(value) {
  if (value > 0) {
    return `+${value}`;
  }
  return String(value);
}

function normalizeSummerSelectionValue(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string');
  }
  if (typeof value === 'string' && value) {
    return [value];
  }
  return [];
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
    this.pendingSummerInspiration = null;
    this.startOverlayHidden = false;
    this.binded = false;
    this.statusAnimationTimer = null;
    this.resultHighscore = null;
    this.calcModeEnabled = false;
    this.calcActionNAssignments = {};
    this.calcSummerActionEntries = {};
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
      summerMeetingOrganizeSelectionId: null,
      summerActionSelections: {
        leader: [],
        teacher: [],
        office: [],
        alba: [],
      },
      stats: { ...config.initialStats },
      lastDrawId: null,
      log: [],
      usedTurns: [],
      albaChoiceIndex: null,
      summerMeetingSelectionId: null,
      summerMeetingInspirationSelectionId: null,
    };
  }

  async init() {
    this.cacheElements();
    this.bindEvents();
    this.calcModeEnabled = this.readCalcModePreference();
    const savedState = this.readSavedGameState();
    const savedDifficulty = savedState?.state?.difficulty;
    const difficulty = DIFFICULTY_CONFIG[savedDifficulty] ? savedDifficulty : this.state.difficulty;
    await this.loadDifficulty(difficulty, { preserveState: false });
    if (savedState && this.applySavedGameState(savedState)) {
      this.startOverlayHidden = !!savedState.startOverlayHidden;
    }
    this.syncStartOverlay();
    this.render();
  }

  cacheElements() {
    const ids = [
      'app',
      'title',
      'difficultyFresh',
      'difficultyPro',
      'calcModeToggle',
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
      'trainingCalcCardInput',
      'trainingCalcSubmit',
      'handGrid',
      'handGridAction',
      'staffGrid',
      'nPoolSummary',
      'actionCalcPanel',
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
      'summerMeetingRevivalPanel',
      'summerMeetingRevivalStatus',
      'summerMeetingRevivalTargets',
      'summerMeetingRevivalConfirm',
      'summerMeetingOrganizePanel',
      'summerMeetingOrganizeStatus',
      'summerMeetingOrganizeTargets',
      'summerMeetingOrganizeConfirm',
      'summerMeetingInspirationPanel',
      'summerMeetingInspirationStatus',
      'summerMeetingInspirationChoices',
      'summerMeetingInspirationCandidateArea',
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
    this.elements.calcModeToggle?.addEventListener('change', (event) => {
      this.setCalcModeEnabled(event.target.checked);
    });
    this.elements.startGame?.addEventListener('click', () => this.startGame());
    this.elements.summaryToggle?.addEventListener('click', () => this.togglePhaseOverlay());
    this.elements.menuToggle?.addEventListener('click', () => this.toggleMenuOverlay());
    this.elements.animationClose?.addEventListener('click', () => this.hideStatusAnimation());
    this.elements.actionConfirm?.addEventListener('click', () => this.resolveActionPhase());
    this.elements.meetingConfirm?.addEventListener('click', () => this.commitMeetingPhase());
    this.elements.summerActionConfirm?.addEventListener('click', () => this.resolveSummerActionPhase());
    this.elements.summerMeetingRevivalConfirm?.addEventListener('click', () => this.useSummerMeetingPassionRevival());
    this.elements.summerMeetingOrganizeConfirm?.addEventListener('click', () => this.useSummerMeetingOrganizeRemoval());
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

    this.elements.summerMeetingRevivalTargets?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-summer-revival-id]');
      if (!button) {
        return;
      }
      this.selectSummerMeetingRevivalCandidate(button.dataset.summerRevivalId);
    });

    this.elements.summerMeetingOrganizeTargets?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-summer-organize-id]');
      if (!button) {
        return;
      }
      this.selectSummerMeetingOrganizeCandidate(button.dataset.summerOrganizeId);
    });

    this.elements.summerMeetingInspirationChoices?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-summer-meeting-pool]');
      if (!button) {
        return;
      }
      this.startSummerMeetingInspirationSelection(button.dataset.summerMeetingPool, button.dataset.summerMeetingCategory);
    });

    this.elements.summerMeetingInspirationCandidateArea?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-summer-meeting-candidate-id]');
      if (!button) {
        return;
      }
      this.selectSummerMeetingInspirationCandidate(button.dataset.summerMeetingCandidateId);
    });

    this.elements.summerDeckGrid?.addEventListener('click', (event) => {
      const targetButton = event.target.closest('[data-summer-target]');
      if (targetButton) {
        this.exchangeSummerPrepTarget(targetButton.dataset.summerTargetStaff, Number(targetButton.dataset.summerTargetIndex));
        return;
      }
      const inspirationTargetButton = event.target.closest('[data-summer-meeting-target]');
      if (inspirationTargetButton) {
        this.finalizeSummerMeetingInspirationSelection(inspirationTargetButton.dataset.summerMeetingTargetStaff);
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
    this.pendingMeeting = null;
    this.pendingSummerPrep = null;
    this.pendingSummerInspiration = null;
    this.summerPrepTotal = 0;
    this.state.summerMeetingSelectionId = null;
    this.state.summerMeetingOrganizeSelectionId = null;
    this.state.summerMeetingInspirationSelectionId = null;
    this.calcActionNAssignments = {};
    this.calcSummerActionEntries = {};
  }

  parseRankCsv(csvText) {
    const [header, ...rows] = parseCsv(csvText.trim());
    const indexMap = new Map(header.map((value, index) => [String(value).trim(), index]));
    const readCell = (row, name) => row[indexMap.get(name)];
    const readNumber = (row, name) => parseOptionalNumber(readCell(row, name));
    return rows
      .map((row) => row.map((cell) => String(cell ?? '').trim()))
      .filter((row) => row.some(Boolean))
      .map((row) => ({
        rank: readCell(row, 'ランク') ?? '',
        experienceThreshold: readNumber(row, '体験基準'),
        enrollmentThreshold: readNumber(row, '入塾基準'),
        satisfactionThreshold: readNumber(row, '満足基準'),
        accountingThreshold: readNumber(row, '経理基準'),
        thresholds: {
          experience: readNumber(row, '体験基準'),
          enrollment: readNumber(row, '入塾基準'),
          satisfaction: readNumber(row, '満足基準'),
          accounting: readNumber(row, '経理基準'),
        },
        scores: {
          satisfaction: readNumber(row, '満足スコア'),
          mobilization: readNumber(row, '動員スコア'),
          withdrawal: readNumber(row, '退塾スコア'),
          enrollmentDiff: readNumber(row, '入退差スコア'),
        },
        withdrawalThreshold: readNumber(row, '退塾基準'),
        enrollmentDiffThreshold: readNumber(row, '入退差基準'),
        rankThreshold: readNumber(row, 'ランク基準スコア'),
        title: readCell(row, '称号') ?? '',
      }));
  }

  syncStartOverlay() {
    if (this.startOverlayHidden) {
      this.hideStartOverlay();
      return;
    }
    this.showStartOverlay();
  }

  showStartOverlay() {
    document.getElementById('startOverlay')?.classList.remove('hidden');
  }

  readCalcModePreference() {
    try {
      const raw = window.localStorage?.getItem(CALC_MODE_KEY);
      return raw === '1' || raw === 'true';
    } catch {
      return false;
    }
  }

  persistCalcModePreference() {
    try {
      window.localStorage?.setItem(CALC_MODE_KEY, this.calcModeEnabled ? '1' : '0');
    } catch {
      // 保存不能でもゲーム継続を優先する。
    }
  }

  setCalcModeEnabled(enabled) {
    this.calcModeEnabled = !!enabled;
    if (this.elements.calcModeToggle) {
      this.elements.calcModeToggle.checked = this.calcModeEnabled;
    }
    this.persistCalcModePreference();
    this.render();
  }

  readSavedGameState() {
    try {
      const raw = window.localStorage?.getItem(SAVE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!this.isValidSavedGameState(parsed)) {
        this.clearSavedGameState();
        return null;
      }
      return parsed;
    } catch {
      this.clearSavedGameState();
      return null;
    }
  }

  isValidSavedGameState(payload) {
    if (!isPlainObject(payload) || payload.version !== SAVE_VERSION || !isPlainObject(payload.state)) {
      return false;
    }
    const { state } = payload;
    if (!DIFFICULTY_CONFIG[state.difficulty]) {
      return false;
    }
    if (!Number.isInteger(state.turnIndex) || state.turnIndex < 0 || state.turnIndex >= TURN_CONFIG.length) {
      return false;
    }
    if (typeof state.phase !== 'string') {
      return false;
    }
    if (!Number.isInteger(state.trainingDrawsLeft) || !Number.isInteger(state.summerPrepCompleted) || !Number.isInteger(state.summerPrepTotal)) {
      return false;
    }
    if (state.difficulty === 'pro' ? !isPlainObject(state.tokens) : state.tokens !== null) {
      return false;
    }
    if (!Array.isArray(state.hand) || !isPlainObject(state.assignments) || !isPlainObject(state.staffDecks) || !isPlainObject(state.staffFlipped) || !isPlainObject(state.staffRestActivity) || !isPlainObject(state.staffMidRestRecord) || !isPlainObject(state.summerActionSelections) || !Array.isArray(state.log) || !Array.isArray(state.usedTurns)) {
      return false;
    }
    if (!isPlainObject(payload.trainingPools) || !isPlainObject(payload.trainingDiscards) || !Array.isArray(payload.nPool)) {
      return false;
    }
    if (payload.pendingMeeting !== null && !isPlainObject(payload.pendingMeeting)) {
      return false;
    }
    if (payload.pendingSummerPrep !== null && !isPlainObject(payload.pendingSummerPrep)) {
      return false;
    }
    if (payload.pendingSummerInspiration !== null && !isPlainObject(payload.pendingSummerInspiration)) {
      return false;
    }
    return true;
  }

  applySavedGameState(payload) {
    if (!this.isValidSavedGameState(payload)) {
      return false;
    }

    const { state } = payload;
    const difficulty = state.difficulty;
    this.state = this.createInitialState(difficulty);
    this.state.difficulty = difficulty;
    this.state.turnIndex = state.turnIndex;
    this.state.phase = state.phase;
    this.state.trainingDrawsLeft = Number.isInteger(state.trainingDrawsLeft)
      ? state.trainingDrawsLeft
      : this.state.trainingDrawsLeft;
    this.state.currentPoolType = typeof state.currentPoolType === 'string'
      ? state.currentPoolType
      : (TURN_CONFIG[state.turnIndex]?.poolType ?? '地域');
    this.state.tokens = state.tokens === null ? null : cloneJson(state.tokens);
    this.state.summerPrepCompleted = Number.isInteger(state.summerPrepCompleted) ? state.summerPrepCompleted : 0;
    this.state.summerPrepTotal = Number.isInteger(state.summerPrepTotal) ? state.summerPrepTotal : 0;
    this.state.hand = cloneCardList(state.hand);
    this.state.assignments = isPlainObject(state.assignments) ? { ...state.assignments } : {};
    this.state.staffDecks = createMap(SUMMER_STAFF_ORDER, (staffKey) => cloneCardList(state.staffDecks?.[staffKey]));
    this.state.staffFlipped = createMap(SUMMER_STAFF_ORDER, (staffKey) => toStringSet(state.staffFlipped?.[staffKey]));
    this.state.staffRestActivity = createMap(SUMMER_STAFF_ORDER, (staffKey) => !!state.staffRestActivity?.[staffKey]);
    this.state.staffMidRestRecord = createMap(SUMMER_STAFF_ORDER, (staffKey) => {
      const record = state.staffMidRestRecord?.[staffKey];
      return {
        mid1: record?.mid1 ?? null,
        mid2: record?.mid2 ?? null,
      };
    });
    this.state.summerMeetingOrganizeSelectionId = state.summerMeetingOrganizeSelectionId ?? null;
    this.state.summerActionSelections = createMap(
      SUMMER_STAFF_ORDER,
      (staffKey) => normalizeSummerSelectionValue(state.summerActionSelections?.[staffKey]),
    );
    this.state.stats = isPlainObject(state.stats) ? { ...this.state.stats, ...state.stats } : this.state.stats;
    this.state.lastDrawId = state.lastDrawId ?? null;
    this.state.log = Array.isArray(state.log) ? cloneJson(state.log) : [];
    this.state.usedTurns = Array.isArray(state.usedTurns) ? cloneJson(state.usedTurns) : [];
    this.state.albaChoiceIndex = state.albaChoiceIndex ?? null;
    this.state.summerMeetingSelectionId = state.summerMeetingSelectionId ?? null;
    this.state.summerMeetingInspirationSelectionId = state.summerMeetingInspirationSelectionId ?? null;
    this.trainingPools = createMap(['地域', '全校'], (poolType) => createMap(TRAINING_CATEGORIES, (category) => cloneCardList(payload.trainingPools?.[poolType]?.[category])));
    this.trainingDiscards = createMap(['地域', '全校'], (poolType) => createMap(TRAINING_CATEGORIES, (category) => cloneCardList(payload.trainingDiscards?.[poolType]?.[category])));
    this.nPool = cloneCardList(payload.nPool);
    this.pendingMeeting = payload.pendingMeeting ? cloneJson(payload.pendingMeeting) : null;
    this.pendingSummerPrep = payload.pendingSummerPrep ? cloneJson(payload.pendingSummerPrep) : null;
    this.pendingSummerInspiration = payload.pendingSummerInspiration ? cloneJson(payload.pendingSummerInspiration) : null;
    this.startOverlayHidden = !!payload.startOverlayHidden;
    return true;
  }

  buildSavedGameState() {
    return {
      version: SAVE_VERSION,
      startOverlayHidden: this.startOverlayHidden,
      state: {
        difficulty: this.state.difficulty,
        turnIndex: this.state.turnIndex,
        phase: this.state.phase,
        trainingDrawsLeft: this.state.trainingDrawsLeft,
        currentPoolType: this.state.currentPoolType,
        tokens: cloneJson(this.state.tokens),
        summerPrepCompleted: this.state.summerPrepCompleted,
        summerPrepTotal: this.state.summerPrepTotal,
        hand: cloneCardList(this.state.hand),
        assignments: cloneJson(this.state.assignments),
        staffDecks: createMap(SUMMER_STAFF_ORDER, (staffKey) => cloneCardList(this.state.staffDecks?.[staffKey])),
        staffFlipped: createMap(SUMMER_STAFF_ORDER, (staffKey) => [...(this.state.staffFlipped?.[staffKey] ?? new Set())]),
        staffRestActivity: cloneJson(this.state.staffRestActivity),
        staffMidRestRecord: cloneJson(this.state.staffMidRestRecord),
        summerMeetingOrganizeSelectionId: this.state.summerMeetingOrganizeSelectionId,
        summerActionSelections: cloneJson(this.state.summerActionSelections),
        stats: cloneJson(this.state.stats),
        lastDrawId: this.state.lastDrawId,
        log: cloneJson(this.state.log),
        usedTurns: cloneJson(this.state.usedTurns),
        albaChoiceIndex: this.state.albaChoiceIndex,
        summerMeetingSelectionId: this.state.summerMeetingSelectionId,
        summerMeetingInspirationSelectionId: this.state.summerMeetingInspirationSelectionId,
      },
      trainingPools: createMap(['地域', '全校'], (poolType) => createMap(TRAINING_CATEGORIES, (category) => cloneCardList(this.trainingPools?.[poolType]?.[category]))),
      trainingDiscards: createMap(['地域', '全校'], (poolType) => createMap(TRAINING_CATEGORIES, (category) => cloneCardList(this.trainingDiscards?.[poolType]?.[category]))),
      nPool: cloneCardList(this.nPool),
      pendingMeeting: this.pendingMeeting ? cloneJson(this.pendingMeeting) : null,
      pendingSummerPrep: this.pendingSummerPrep ? cloneJson(this.pendingSummerPrep) : null,
      pendingSummerInspiration: this.pendingSummerInspiration ? cloneJson(this.pendingSummerInspiration) : null,
    };
  }

  persistGameState() {
    try {
      window.localStorage?.setItem(SAVE_KEY, JSON.stringify(this.buildSavedGameState()));
    } catch {
      // 保存不能でもゲーム継続を優先する。
    }
  }

  clearSavedGameState() {
    try {
      window.localStorage?.removeItem(SAVE_KEY);
    } catch {
      // 破損した保存は無視する。
    }
  }

  highscoreKeyFor(difficulty = this.state.difficulty) {
    return `${HIGHSCORE_KEY_PREFIX}${difficulty}`;
  }

  readHighscore(difficulty = this.state.difficulty) {
    try {
      const raw = window.localStorage?.getItem(this.highscoreKeyFor(difficulty));
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!isPlainObject(parsed) || typeof parsed.score !== 'number') {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  persistHighscore(result) {
    if (!result || typeof result.score !== 'number') {
      return null;
    }

    const previous = this.readHighscore(result.difficulty);
    const shouldReplace = !previous
      || result.score > previous.score
      || (result.score === previous.score && result.turns < (previous.turns ?? Number.POSITIVE_INFINITY));
    const next = shouldReplace ? result : previous;

    if (shouldReplace) {
      try {
        window.localStorage?.setItem(this.highscoreKeyFor(result.difficulty), JSON.stringify(next));
      } catch {
        // 保存不能でも表示は続行する。
      }
    }

    return {
      previous,
      current: next,
      isNew: shouldReplace,
    };
  }

  startGame() {
    this.startOverlayHidden = true;
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
    return createMap(SUMMER_STAFF_ORDER, () => []);
  }

  getSummerActionSelectionIds(staffKey) {
    return normalizeSummerSelectionValue(this.state.summerActionSelections?.[staffKey]);
  }

  cardHasParallelEffect(card) {
    return /並行|🤹/.test(`${card?.topEffect ?? ''} ${card?.effect ?? ''}`);
  }

  isCalcNormalActionMode() {
    return this.calcModeEnabled && this.state.phase === 'action' && this.currentTurnConfig()?.season === '通常期';
  }

  isCalcSummerPrepMode() {
    return this.calcModeEnabled && this.state.phase === 'summer-prep' && this.currentTurnConfig()?.season === '講習期';
  }

  isCalcSummerActionMode() {
    return this.calcModeEnabled && this.state.phase === 'summer-action' && this.currentTurnConfig()?.season === '講習期';
  }

  isCalcSummerMeetingMode() {
    return this.calcModeEnabled && this.state.phase === 'summer-meeting' && this.currentTurnConfig()?.season === '講習期';
  }

  setCalcActionNAssignment(staffKey, cardNo) {
    if (!NORMAL_STAFF_ORDER.includes(staffKey)) {
      return;
    }
    this.calcActionNAssignments[staffKey] = String(cardNo ?? '').trim();
  }

  getCalcActionNAssignment(staffKey) {
    return String(this.calcActionNAssignments?.[staffKey] ?? '').trim();
  }

  setCalcSummerActionEntry(staffKey, value) {
    if (!SUMMER_STAFF_ORDER.includes(staffKey)) {
      return;
    }
    this.calcSummerActionEntries[staffKey] = String(value ?? '');
  }

  getCalcSummerActionEntry(staffKey) {
    return String(this.calcSummerActionEntries?.[staffKey] ?? '');
  }

  findCardInListByNo(cards, cardNo) {
    const normalized = normalizeCardNo(cardNo);
    if (!normalized) {
      return null;
    }
    const index = cards.findIndex((card) => normalizeCardNo(card.cardNo) === normalized);
    if (index < 0) {
      return null;
    }
    return {
      normalized,
      index,
      card: cards[index],
    };
  }

  findSummerPrepEligibleTargets(candidate) {
    if (!candidate) {
      return [];
    }
    return SUMMER_STAFF_ORDER.flatMap((staffKey) => (
      (this.state.staffDecks?.[staffKey] ?? [])
        .map((card, index) => ({ card, staffKey, targetIndex: index }))
        .filter((entry) => rarityRank(entry.card.rarity) <= rarityRank(candidate.rarity))
    ));
  }

  resolveSummerPrepCandidateSelection(cardNo) {
    if (!this.pendingSummerPrep) {
      return null;
    }
    const raw = String(cardNo ?? '').trim();
    if (raw) {
      const matched = this.findCardInListByNo(this.pendingSummerPrep.candidates, raw);
      if (!matched) {
        const normalized = normalizeCardNo(raw);
        const target = normalized ?? raw ?? '(空欄)';
        this.log(`計算機モード: トップ3枚候補にカード番号 ${target} は存在しません`, 'error');
        return null;
      }
      return matched.card;
    }
    if (!this.pendingSummerPrep.selectedCandidateId) {
      this.log('計算機モード: トップ3枚候補からカード番号を入力してください', 'error');
      return null;
    }
    const selected = this.pendingSummerPrep.candidates.find((card) => card.instanceId === this.pendingSummerPrep.selectedCandidateId);
    if (!selected) {
      this.log('計算機モード: 選択中の候補カードを解決できませんでした', 'error');
      return null;
    }
    return selected;
  }

  submitCalcSummerPrepExchange() {
    if (!this.isCalcSummerPrepMode() || !this.pendingSummerPrep) {
      return;
    }
    const candidateInput = this.elements.summerCandidateArea?.querySelector('#summerPrepCalcCandidateInput');
    const staffSelect = this.elements.summerCandidateArea?.querySelector('#summerPrepCalcStaffSelect');
    const slotInput = this.elements.summerCandidateArea?.querySelector('#summerPrepCalcSlotInput');
    const candidate = this.resolveSummerPrepCandidateSelection(candidateInput?.value ?? '');
    if (!candidate) {
      return;
    }

    const eligibleTargets = this.findSummerPrepEligibleTargets(candidate);
    if (eligibleTargets.length === 0) {
      this.log('計算機モード: 交換可能なカードがないため「交換せず除外」だけ選べます', 'error');
      return;
    }

    const staffKey = String(staffSelect?.value ?? '').trim();
    if (!SUMMER_STAFF_ORDER.includes(staffKey)) {
      this.log(`計算機モード: 交換先スタッフ ${staffKey || '(空欄)'} は無効です`, 'error');
      return;
    }

    const rawSlot = String(slotInput?.value ?? '').trim();
    const slotNumber = Number(rawSlot);
    if (!Number.isInteger(slotNumber) || slotNumber <= 0) {
      this.log('計算機モード: 交換先カード位置は 1 以上の整数で入力してください', 'error');
      return;
    }
    const targetIndex = slotNumber - 1;
    const targetCard = this.state.staffDecks?.[staffKey]?.[targetIndex];
    if (!targetCard) {
      this.log(`計算機モード: ${this.getStaffLabel(staffKey)} のカード位置 ${slotNumber} にはカードがありません`, 'error');
      return;
    }
    if (rarityRank(targetCard.rarity) > rarityRank(candidate.rarity)) {
      this.log('計算機モード: 交換先カードは同レアリティ以下のみ指定できます', 'error');
      return;
    }

    this.pendingSummerPrep.selectedCandidateId = candidate.instanceId;
    this.finalizeSummerPrepSelection({ staffKey, targetIndex, discardOnly: false });
  }

  findSummerMeetingCandidateByNo(candidates, cardNo, missingMessage, duplicateMessage) {
    const normalized = normalizeCardNo(cardNo);
    if (!normalized) {
      this.log(missingMessage.replace('{cardNo}', '(空欄)'), 'error');
      return null;
    }
    const matches = candidates.filter((item) => normalizeCardNo(item.card.cardNo) === normalized);
    if (matches.length === 0) {
      this.log(missingMessage.replace('{cardNo}', normalized), 'error');
      return null;
    }
    if (matches.length > 1) {
      this.log(duplicateMessage.replace('{cardNo}', normalized), 'error');
      return null;
    }
    return matches[0];
  }

  submitCalcSummerMeetingRevival() {
    if (!this.isCalcSummerMeetingMode()) {
      return;
    }
    const input = this.elements.summerMeetingRevivalPanel?.querySelector('#summerMeetingRevivalCalcCardInput');
    const candidate = this.findSummerMeetingCandidateByNo(
      this.getSummerMeetingRevivalCandidates(),
      input?.value ?? '',
      '計算機モード: 復活可能カードにカード番号 {cardNo} は存在しません',
      '計算機モード: 復活可能カードにカード番号 {cardNo} が複数あります',
    );
    if (!candidate) {
      return;
    }
    this.state.summerMeetingSelectionId = candidate.card.instanceId;
    this.useSummerMeetingPassionRevival();
  }

  submitCalcSummerMeetingInspiration() {
    if (!this.isCalcSummerMeetingMode()) {
      return;
    }
    const panel = this.elements.summerMeetingInspirationPanel;
    const poolType = String(panel?.querySelector('#summerMeetingInspirationCalcPoolSelect')?.value ?? '').trim();
    const category = String(panel?.querySelector('#summerMeetingInspirationCalcCategorySelect')?.value ?? '').trim();
    const candidateNo = panel?.querySelector('#summerMeetingInspirationCalcCardInput')?.value ?? '';
    const staffKey = String(panel?.querySelector('#summerMeetingInspirationCalcStaffSelect')?.value ?? '').trim();

    if (!['地域', '全校'].includes(poolType) || !TRAINING_CATEGORIES.includes(category)) {
      this.log('計算機モード: 発想追加の山札を正しく選択してください', 'error');
      return;
    }
    if (!SUMMER_STAFF_ORDER.includes(staffKey)) {
      this.log(`計算機モード: 追加先スタッフ ${staffKey || '(空欄)'} は無効です`, 'error');
      return;
    }

    if (!this.pendingSummerInspiration) {
      this.startSummerMeetingInspirationSelection(poolType, category);
      if (!this.pendingSummerInspiration) {
        return;
      }
    } else if (this.pendingSummerInspiration.poolType !== poolType || this.pendingSummerInspiration.category !== category) {
      this.log('先に選択中の発想カードを確定してください', 'error');
      return;
    }

    const candidate = this.findSummerMeetingCandidateByNo(
      this.pendingSummerInspiration.candidates.map((card) => ({ card })),
      candidateNo,
      '計算機モード: トップ3枚候補にカード番号 {cardNo} は存在しません',
      '計算機モード: トップ3枚候補にカード番号 {cardNo} が複数あります',
    );
    if (!candidate) {
      return;
    }

    this.pendingSummerInspiration.selectedCandidateId = candidate.card.instanceId;
    this.state.summerMeetingInspirationSelectionId = candidate.card.instanceId;
    this.finalizeSummerMeetingInspirationSelection(staffKey);
  }

  submitCalcSummerMeetingOrganize() {
    if (!this.isCalcSummerMeetingMode()) {
      return;
    }
    const input = this.elements.summerMeetingOrganizePanel?.querySelector('#summerMeetingOrganizeCalcCardInput');
    const candidate = this.findSummerMeetingCandidateByNo(
      this.getSummerMeetingOrganizeCandidates(),
      input?.value ?? '',
      '計算機モード: スタッフ別デッキにカード番号 {cardNo} は存在しません',
      '計算機モード: スタッフ別デッキにカード番号 {cardNo} が複数あります',
    );
    if (!candidate) {
      return;
    }
    this.state.summerMeetingOrganizeSelectionId = candidate.card.instanceId;
    this.useSummerMeetingOrganizeRemoval();
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
    this.pendingSummerInspiration = null;
    this.state.albaChoiceIndex = null;
    this.state.summerMeetingSelectionId = null;
    this.state.summerMeetingOrganizeSelectionId = null;
    this.state.summerMeetingInspirationSelectionId = null;

    if (turn.season === '通常期') {
      this.state.phase = 'training';
      this.state.trainingDrawsLeft = 4;
      this.state.hand = [];
      this.state.assignments = {};
      this.state.lastDrawId = null;
      this.calcActionNAssignments = {};
      this.calcSummerActionEntries = {};
      return;
    }

    if (turn.phaseKind === 'prep') {
      this.state.phase = 'summer-prep';
      this.state.summerPrepTotal = turn.prepCount;
      this.state.summerPrepCompleted = 0;
      this.state.summerActionSelections = this.createEmptySummerActionSelections();
      this.state.staffRestActivity = this.createEmptySummerRestMap();
      this.calcSummerActionEntries = {};
      return;
    }

    if (turn.phaseKind === 'summer') {
      this.state.phase = 'summer-action';
      this.state.summerPrepTotal = 0;
      this.state.summerPrepCompleted = 0;
      this.pendingSummerPrep = null;
      this.pendingSummerInspiration = null;
      this.state.summerActionSelections = this.createEmptySummerActionSelections();
      this.state.staffRestActivity = this.createEmptySummerRestMap();
      this.calcSummerActionEntries = {};
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
    this.pendingSummerInspiration = null;
    this.state.summerMeetingSelectionId = null;
    this.state.summerMeetingOrganizeSelectionId = null;
    this.state.summerMeetingInspirationSelectionId = null;
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
      const threshold = row.thresholds?.[statKey];
      if (threshold === null || threshold === undefined) {
        continue;
      }
      if (value >= threshold) {
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

  getTrainingPoolAvailableCount(poolType, category) {
    const deck = this.trainingPools?.[poolType]?.[category] ?? [];
    const discard = this.trainingDiscards?.[poolType]?.[category] ?? [];
    return deck.length + discard.length;
  }

  drawSummerMeetingInspirationCandidates(poolType, category) {
    const deck = this.trainingPools?.[poolType]?.[category] ?? [];
    const discard = this.trainingDiscards?.[poolType]?.[category] ?? [];
    const total = deck.length + discard.length;
    if (total < 3) {
      return null;
    }

    let refillCards = [];
    if (deck.length < 3 && discard.length > 0) {
      refillCards = shuffle(discard);
    }

    if (deck.length + refillCards.length < 3) {
      return null;
    }

    if (deck.length < 3 && refillCards.length > 0) {
      deck.push(...refillCards);
      discard.length = 0;
    }

    const candidates = [];
    for (let i = 0; i < 3; i += 1) {
      const card = deck.shift();
      if (!card) {
        return null;
      }
      candidates.push(cloneCardWithId(card, 'meeting-inspiration'));
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

  findTrainingCardByNo(cardNo) {
    const normalized = normalizeCardNo(cardNo);
    if (!normalized) {
      return null;
    }
    const turn = this.currentTurnConfig();
    if (!turn) {
      return null;
    }
    const poolType = turn.poolType;
    for (const category of TRAINING_CATEGORIES) {
      const deck = this.trainingPools?.[poolType]?.[category] ?? [];
      const deckIndex = deck.findIndex((card) => normalizeCardNo(card.cardNo) === normalized);
      if (deckIndex >= 0) {
        return { normalized, poolType, category, bucket: deck, index: deckIndex };
      }
      const discard = this.trainingDiscards?.[poolType]?.[category] ?? [];
      const discardIndex = discard.findIndex((card) => normalizeCardNo(card.cardNo) === normalized);
      if (discardIndex >= 0) {
        return { normalized, poolType, category, bucket: discard, index: discardIndex };
      }
    }
    return null;
  }

  drawTrainingCardByCardNo(cardNo) {
    if (this.state.phase !== 'training' || this.state.trainingDrawsLeft <= 0) {
      return;
    }
    const matched = this.findTrainingCardByNo(cardNo);
    const turn = this.currentTurnConfig();
    if (!matched) {
      const normalized = normalizeCardNo(cardNo);
      const target = normalized ?? (String(cardNo ?? '').trim() || '(空欄)');
      this.log(`計算機モード: ${turn?.poolType ?? '-'}プールにカード番号 ${target} は存在しません`, 'error');
      return;
    }
    const [card] = matched.bucket.splice(matched.index, 1);
    if (!card) {
      this.log(`計算機モード: カード番号 ${matched.normalized} の取得に失敗しました`, 'error');
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
    this.render();
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

  collectStandardActionAssignments() {
    if (!this.assignmentsAreUnique()) {
      this.log('同じスタッフに複数カードは割り当てられません', 'error');
      return null;
    }

    const validAssignments = {};
    for (const [indexText, staffKey] of Object.entries(this.state.assignments)) {
      const index = Number(indexText);
      const card = this.state.hand[index];
      if (!card || !staffKey) {
        continue;
      }
      if (!this.allowedStaffForCard(card).includes(staffKey)) {
        this.log(`${card.cardName} は ${this.getStaffLabel(staffKey)} に置けません`, 'error');
        return null;
      }
      validAssignments[index] = staffKey;
    }

    return { validAssignments, explicitNSelections: {} };
  }

  collectCalcActionAssignments() {
    const validAssignments = {};
    const perStaff = createMap(NORMAL_STAFF_ORDER, () => []);

    for (const [indexText, staffKey] of Object.entries(this.state.assignments)) {
      const index = Number(indexText);
      if (!staffKey) {
        continue;
      }
      const card = this.state.hand[index];
      if (!card) {
        this.log(`計算機モード: 手札${index + 1} にカードがありません`, 'error');
        return null;
      }
      if (!NORMAL_STAFF_ORDER.includes(staffKey)) {
        this.log(`計算機モード: 手札${index + 1} の配置先 ${staffKey} は無効です`, 'error');
        return null;
      }
      if (!this.allowedStaffForCard(card).includes(staffKey)) {
        this.log(`${card.cardName} は ${this.getStaffLabel(staffKey)} に置けません`, 'error');
        return null;
      }
      validAssignments[index] = staffKey;
      perStaff[staffKey].push({ card });
    }

    for (const staffKey of NORMAL_STAFF_ORDER) {
      const entries = perStaff[staffKey];
      if (entries.length <= 1) {
        continue;
      }
      const invalidExtra = entries.slice(1).find((entry) => !this.cardHasParallelEffect(entry.card));
      if (invalidExtra) {
        this.log(`${this.getStaffLabel(staffKey)} に追加配置できるのは並行カードのみです`, 'error');
        return null;
      }
    }

    const usedStaff = new Set(Object.values(validAssignments));
    const remainingStaff = NORMAL_STAFF_ORDER.filter((key) => !usedStaff.has(key));
    const nTargets = remainingStaff.slice(0, this.nPool.length);
    const explicitNSelections = {};
    const remainingNPool = [...this.nPool];
    for (const staffKey of nTargets) {
      const raw = this.getCalcActionNAssignment(staffKey);
      if (!raw) {
        this.log(`計算機モード: ${this.getStaffLabel(staffKey)} に使う Nカード番号を入力してください`, 'error');
        return null;
      }
      const matched = this.findCardInListByNo(remainingNPool, raw);
      const normalized = normalizeCardNo(raw);
      const target = normalized ?? (String(raw).trim() || '(空欄)');
      if (!matched) {
        this.log(`計算機モード: Nプールにカード番号 ${target} は存在しません`, 'error');
        return null;
      }
      remainingNPool.splice(matched.index, 1);
      explicitNSelections[staffKey] = matched.normalized;
    }

    return { validAssignments, explicitNSelections };
  }

  resolveActionPhase() {
    if (this.state.phase !== 'action') {
      return;
    }
    const actionPlan = this.isCalcNormalActionMode()
      ? this.collectCalcActionAssignments()
      : this.collectStandardActionAssignments();
    if (!actionPlan) {
      return;
    }

    const resolution = [];
    const usedStaff = new Set();
    const statsBefore = { ...this.state.stats };
    let nextStats = { ...this.state.stats };
    let nextTokens = this.state.tokens ? { ...this.state.tokens } : this.state.tokens;
    this.state.assignments = actionPlan.validAssignments;

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
      let card = null;
      if (this.isCalcNormalActionMode()) {
        const matched = this.findCardInListByNo(this.nPool, actionPlan.explicitNSelections[staffKey]);
        if (!matched) {
          this.log(`計算機モード: ${this.getStaffLabel(staffKey)} に指定した Nカードを解決できませんでした`, 'error');
          return;
        }
        [card] = this.nPool.splice(matched.index, 1);
      } else {
        card = this.nPool.shift();
      }
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
    this.render();
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

  startSummerMeetingInspirationSelection(poolType, category) {
    if (this.state.difficulty !== 'pro' || this.state.phase !== 'summer-meeting' || this.pendingMeeting?.kind !== 'summer') {
      return;
    }
    if (this.pendingSummerInspiration) {
      this.log('先に選択中の発想カードを確定してください', 'error');
      return;
    }
    if (!['地域', '全校'].includes(poolType) || !TRAINING_CATEGORIES.includes(category)) {
      return;
    }
    if ((this.state.tokens?.inspiration ?? 0) <= 0) {
      this.log('発想が足りません', 'error');
      return;
    }
    const candidates = this.drawSummerMeetingInspirationCandidates(poolType, category);
    if (!candidates) {
      this.log(`${poolType} ${category} の候補が足りません`, 'error');
      return;
    }
    this.pendingSummerInspiration = {
      poolType,
      category,
      candidates,
      selectedCandidateId: null,
    };
    this.state.summerMeetingInspirationSelectionId = null;
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
    this.render();
  }

  discardSummerPrepSelection() {
    if (this.state.phase !== 'summer-prep' || !this.pendingSummerPrep) {
      return;
    }
    if (this.isCalcSummerPrepMode()) {
      const candidateInput = this.elements.summerCandidateArea?.querySelector('#summerPrepCalcCandidateInput');
      const candidate = this.resolveSummerPrepCandidateSelection(candidateInput?.value ?? '');
      if (!candidate) {
        return;
      }
      this.pendingSummerPrep.selectedCandidateId = candidate.instanceId;
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
    const selectedIds = this.getSummerActionSelectionIds(staffKey);
    if (selectedIds.includes(cardId)) {
      this.state.summerActionSelections[staffKey] = selectedIds.filter((id) => id !== cardId);
      this.render();
      return;
    }
    if (selectedIds.length > 0 && !this.cardHasParallelEffect(card)) {
      this.log('追加配置できるのは並行カードのみです', 'error');
      return;
    }
    this.state.summerActionSelections[staffKey] = [...selectedIds, cardId];
    this.render();
  }

  setSummerRest(staffKey) {
    if (this.state.phase !== 'summer-action' || !SUMMER_STAFF_ORDER.includes(staffKey)) {
      return;
    }
    this.state.summerActionSelections[staffKey] = [];
    if (this.isCalcSummerActionMode()) {
      this.setCalcSummerActionEntry(staffKey, '休む');
    }
    this.render();
  }

  isSummerCardFlipped(staffKey, card) {
    return !!card?.instanceId && this.state.staffFlipped?.[staffKey]?.has(card.instanceId);
  }

  collectCalcSummerActionSelections() {
    const selections = this.createEmptySummerActionSelections();

    for (const staffKey of SUMMER_STAFF_ORDER) {
      const raw = this.getCalcSummerActionEntry(staffKey).trim();
      if (!raw) {
        this.log(`計算機モード: ${this.getStaffLabel(staffKey)} は「休む」または使うカード番号を入力してください`, 'error');
        return null;
      }
      if (raw === '休む') {
        selections[staffKey] = [];
        continue;
      }

      const numbers = raw
        .split(/[,\s、]+/)
        .map((value) => value.trim())
        .filter(Boolean);
      if (numbers.length === 0) {
        this.log(`計算機モード: ${this.getStaffLabel(staffKey)} は「休む」または使うカード番号を入力してください`, 'error');
        return null;
      }

      const usedIds = [];
      const seenIds = new Set();
      for (let index = 0; index < numbers.length; index += 1) {
        const cardNo = numbers[index];
        const matched = this.findCardInListByNo(this.state.staffDecks?.[staffKey] ?? [], cardNo);
        const normalized = normalizeCardNo(cardNo) ?? cardNo;
        if (!matched) {
          this.log(`計算機モード: ${this.getStaffLabel(staffKey)} デッキにカード番号 ${normalized} は存在しません`, 'error');
          return null;
        }
        if (this.isSummerCardFlipped(staffKey, matched.card)) {
          this.log(`計算機モード: ${this.getStaffLabel(staffKey)}のカード番号 ${matched.normalized} は裏返しのため使えません`, 'error');
          return null;
        }
        if (seenIds.has(matched.card.instanceId)) {
          this.log(`計算機モード: ${this.getStaffLabel(staffKey)} のカード番号 ${matched.normalized} が重複しています`, 'error');
          return null;
        }
        if (index >= 1 && !this.cardHasParallelEffect(matched.card)) {
          this.log(`計算機モード: ${this.getStaffLabel(staffKey)} に追加使用できるのは並行カードのみです`, 'error');
          return null;
        }
        seenIds.add(matched.card.instanceId);
        usedIds.push(matched.card.instanceId);
      }

      selections[staffKey] = usedIds;
    }

    return selections;
  }

  resolveSummerActionPhase() {
    if (this.state.phase !== 'summer-action') {
      return;
    }

    if (this.isCalcSummerActionMode()) {
      const selections = this.collectCalcSummerActionSelections();
      if (!selections) {
        return;
      }
      this.state.summerActionSelections = selections;
    }

    const statsBefore = { ...this.state.stats };
    let nextStats = { ...this.state.stats };
    let nextTokens = this.state.tokens ? { ...this.state.tokens } : this.state.tokens;
    const resolution = [];
    const usedCards = [];
    const restMap = createMap(SUMMER_STAFF_ORDER, () => false);

    for (const staffKey of SUMMER_STAFF_ORDER) {
      const selectedIds = this.getSummerActionSelectionIds(staffKey);
      const cards = selectedIds
        .map((cardId) => this.state.staffDecks[staffKey].find((item) => item.instanceId === cardId))
        .filter(Boolean);
      if (cards.length === 0) {
        restMap[staffKey] = false;
        continue;
      }

      restMap[staffKey] = true;
      for (const card of cards) {
        const applied = this.applyCard(card, staffKey, nextStats, '講習期', nextTokens);
        nextStats = applied.stats;
        nextTokens = applied.tokens;
        usedCards.push({ staffKey, card, details: applied.details });
        resolution.push({ type: 'summer-used', staffKey, card, details: applied.details });
        if (card.rarity === 'SR' || card.rarity === 'SSR') {
          this.state.staffFlipped[staffKey].add(card.instanceId);
        }
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
    this.state.summerMeetingSelectionId = null;
    this.pendingSummerInspiration = null;
    this.state.summerMeetingInspirationSelectionId = null;
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
      if (this.pendingSummerInspiration) {
        this.log('発想追加を先に確定してください', 'error');
        return;
      }
      this.state.usedTurns.push({
        turn: this.currentTurnConfig().turn,
        stats: { ...this.state.stats },
      });
      this.pendingMeeting = null;
      this.state.summerMeetingSelectionId = null;
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

  calculateFreshResult() {
    const experience = this.state.stats.experience ?? 0;
    const enrollment = this.state.stats.enrollment ?? 0;
    const satisfaction = this.state.stats.satisfaction ?? 0;
    const accounting = this.state.stats.accounting ?? 0;
    const withdrawal = Math.max(0, 15 - satisfaction) + Math.max(0, 15 - accounting);
    const enrollmentDiff = enrollment - withdrawal;

    let withdrawalPoints = 0;
    if (withdrawal >= 4) {
      withdrawalPoints = -3;
    } else if (withdrawal <= 1) {
      withdrawalPoints = 1;
    }

    let mobilizationPoints = 0;
    if (experience >= 12) {
      mobilizationPoints = 2;
    } else if (experience >= 10) {
      mobilizationPoints = 1;
    }

    let enrollmentDiffPoints = 0;
    for (const row of this.rankRows) {
      const threshold = row.enrollmentDiffThreshold;
      const score = row.scores?.enrollmentDiff;
      if (threshold === null || threshold === undefined || score === null || score === undefined) {
        continue;
      }
      if (enrollmentDiff >= threshold) {
        enrollmentDiffPoints = score;
      }
    }

    const baseTotal = withdrawalPoints + mobilizationPoints + enrollmentDiffPoints;
    let displayScore = baseTotal;
    let splusBreakdown = null;
    if (baseTotal === 8) {
      const expUsed = Math.min(experience, 30);
      const diffUsed = Math.min(enrollmentDiff, 30);
      const rawExpBonus = 0.5 * (expUsed - 12) / 18;
      const rawDiffBonus = 1.5 * (diffUsed - 12) / 18;
      displayScore = Math.round((8 + rawExpBonus + rawDiffBonus) * 10) / 10;
      splusBreakdown = {
        expUsed,
        diffUsed,
        expBonus: Math.round(rawExpBonus * 10) / 10,
        diffBonus: Math.round(rawDiffBonus * 10) / 10,
      };
    }

    let overallRank = 'E';
    if (displayScore >= 9) {
      overallRank = 'S+';
    } else if (displayScore >= 8) {
      overallRank = 'S';
    } else if (displayScore >= 7) {
      overallRank = 'A';
    } else if (displayScore >= 5) {
      overallRank = 'B';
    } else if (displayScore >= 4) {
      overallRank = 'C';
    } else if (displayScore >= 1) {
      overallRank = 'D';
    }

    return {
      withdrawal,
      enrollmentDiff,
      withdrawalPoints,
      mobilizationPoints,
      enrollmentDiffPoints,
      baseTotal,
      displayScore,
      overallRank,
      splusBreakdown,
    };
  }

  findThresholdScore({ value, thresholdKey, scoreKey, direction = 'gte' }) {
    let matchedScore = 0;
    for (const row of this.rankRows) {
      const threshold = row[thresholdKey];
      const score = row.scores?.[scoreKey];
      if (threshold === null || threshold === undefined || score === null || score === undefined) {
        continue;
      }
      const matched = direction === 'lte' ? value <= threshold : value >= threshold;
      if (matched) {
        matchedScore = score;
      }
    }
    return matchedScore;
  }

  calculateProResult() {
    const experience = this.state.stats.experience ?? 0;
    const enrollment = this.state.stats.enrollment ?? 0;
    const satisfaction = this.state.stats.satisfaction ?? 0;
    const accounting = this.state.stats.accounting ?? 0;
    const withdrawal = Math.max(0, 15 - satisfaction) + Math.max(0, 15 - accounting);
    const enrollmentDiff = enrollment - withdrawal;
    const mobilizationPoints = this.findThresholdScore({
      value: experience,
      thresholdKey: 'experienceThreshold',
      scoreKey: 'mobilization',
      direction: 'gte',
    });
    const withdrawalPoints = this.findThresholdScore({
      value: withdrawal,
      thresholdKey: 'withdrawalThreshold',
      scoreKey: 'withdrawal',
      direction: 'lte',
    });
    const enrollmentDiffPoints = this.findThresholdScore({
      value: enrollmentDiff,
      thresholdKey: 'enrollmentDiffThreshold',
      scoreKey: 'enrollmentDiff',
      direction: 'gte',
    });
    const satisfactionPoints = this.findThresholdScore({
      value: satisfaction,
      thresholdKey: 'satisfactionThreshold',
      scoreKey: 'satisfaction',
      direction: 'gte',
    });
    const total = mobilizationPoints + withdrawalPoints + enrollmentDiffPoints + satisfactionPoints;

    let overallRow = this.rankRows[0] ?? { rank: '-', title: '', rankThreshold: Number.NEGATIVE_INFINITY };
    for (const row of this.rankRows) {
      const threshold = row.rankThreshold;
      if (threshold === null || threshold === undefined) {
        continue;
      }
      if (total >= threshold) {
        overallRow = row;
      }
    }

    return {
      withdrawal,
      enrollmentDiff,
      mobilizationPoints,
      withdrawalPoints,
      enrollmentDiffPoints,
      satisfactionPoints,
      total,
      overallRank: overallRow.rank ?? '-',
      title: overallRow.title ?? '',
    };
  }

  buildResultSnapshot() {
    if (this.state.difficulty === 'fresh') {
      const freshResult = this.calculateFreshResult();
      return {
        difficulty: 'fresh',
        rank: freshResult.overallRank,
        score: freshResult.displayScore,
        turns: this.state.usedTurns.length,
      };
    }

    const proResult = this.calculateProResult();
    return {
      difficulty: 'pro',
      rank: proResult.overallRank,
      score: proResult.total,
      title: proResult.title,
      turns: this.state.usedTurns.length,
    };
  }

  syncResultHighscore() {
    if (this.state.phase !== 'result') {
      this.resultHighscore = null;
      return;
    }
    this.resultHighscore = this.persistHighscore(this.buildResultSnapshot());
  }

  buildHighscoreResultItem() {
    const best = this.resultHighscore?.current;
    if (!best) {
      return '';
    }

    const label = this.resultHighscore?.isNew ? 'ハイスコア更新' : '自己ベスト';
    const titleText = best.title ? ` / ${escapeHtml(best.title)}` : '';
    return `
      <li class="result-item result-item-accent">
        <span class="result-label">${label}</span>
        <span class="result-value">${formatScore(best.score)}</span>
        <span class="result-rank">${best.rank}${titleText}</span>
      </li>
    `;
  }

  renderFreshResult() {
    const freshResult = this.calculateFreshResult();
    this.elements.resultRank.innerHTML = `
      <span class="result-rank-label">総合ランク</span>
      <span class="result-rank-badge rank-${freshResult.overallRank.replace('+', 'plus')}">${freshResult.overallRank}</span>
    `;
    this.elements.resultTurn.innerHTML = `
      <span>基礎合計 ${freshResult.baseTotal}</span>
      <span>表示スコア ${formatScore(freshResult.displayScore)}</span>
      <span>${this.state.usedTurns.length}ターン完了</span>
    `;
    this.elements.resultSummary.innerHTML = [
      ...STAT_KEYS.map((item) => {
        const { current } = this.currentRankFor(item.key);
        return `
          <li class="result-item">
            <span class="result-label">${item.label}</span>
            <span class="result-value">${this.state.stats[item.key] ?? 0}</span>
            <span class="result-rank">${current.rank}</span>
          </li>
        `;
      }),
      `
        <li class="result-item">
          <span class="result-label">退塾</span>
          <span class="result-value">${freshResult.withdrawal}</span>
          <span class="result-rank">15-満足 / 15-経理</span>
        </li>
      `,
      `
        <li class="result-item">
          <span class="result-label">入退差</span>
          <span class="result-value">${freshResult.enrollmentDiff}</span>
          <span class="result-rank">入塾-退塾</span>
        </li>
      `,
      `
        <li class="result-item">
          <span class="result-label">退塾点</span>
          <span class="result-value">${formatSignedScore(freshResult.withdrawalPoints)}</span>
          <span class="result-rank">退塾 ${freshResult.withdrawal}</span>
        </li>
      `,
      `
        <li class="result-item">
          <span class="result-label">動員点</span>
          <span class="result-value">${formatSignedScore(freshResult.mobilizationPoints)}</span>
          <span class="result-rank">体験 ${this.state.stats.experience ?? 0}</span>
        </li>
      `,
      `
        <li class="result-item">
          <span class="result-label">入退差点</span>
          <span class="result-value">${formatSignedScore(freshResult.enrollmentDiffPoints)}</span>
          <span class="result-rank">入退差 ${freshResult.enrollmentDiff}</span>
        </li>
      `,
      `
        <li class="result-item result-item-accent">
          <span class="result-label">合計 / 表示スコア</span>
          <span class="result-value">${freshResult.baseTotal} / ${formatScore(freshResult.displayScore)}</span>
          <span class="result-rank">${freshResult.splusBreakdown
            ? `体験+${formatScore(freshResult.splusBreakdown.expBonus)} 入退差+${formatScore(freshResult.splusBreakdown.diffBonus)}`
            : `総合ランク ${freshResult.overallRank}`}</span>
        </li>
      `,
      this.buildHighscoreResultItem(),
    ].join('');
  }

  renderProResult() {
    const proResult = this.calculateProResult();
    const rankClass = String(proResult.overallRank ?? '').replace(/\+/g, 'plus');
    this.elements.resultRank.innerHTML = `
      <span class="result-rank-label">総合ランク</span>
      <span class="result-rank-badge rank-${rankClass}">${proResult.overallRank}</span>
    `;
    this.elements.resultTurn.innerHTML = `
      <span>合計 ${proResult.total}</span>
      <span>称号 ${escapeHtml(proResult.title || '-')}</span>
      <span>${this.state.usedTurns.length}ターン完了</span>
    `;
    this.elements.resultSummary.innerHTML = [
      ...STAT_KEYS.map((item) => {
        const { current } = this.currentRankFor(item.key);
        return `
          <li class="result-item">
            <span class="result-label">${item.label}</span>
            <span class="result-value">${this.state.stats[item.key] ?? 0}</span>
            <span class="result-rank">${current.rank}</span>
          </li>
        `;
      }),
      `
        <li class="result-item">
          <span class="result-label">退塾</span>
          <span class="result-value">${proResult.withdrawal}</span>
          <span class="result-rank">max(0,15-満足)+max(0,15-経理)</span>
        </li>
      `,
      `
        <li class="result-item">
          <span class="result-label">入退差</span>
          <span class="result-value">${proResult.enrollmentDiff}</span>
          <span class="result-rank">入塾-退塾</span>
        </li>
      `,
      `
        <li class="result-item">
          <span class="result-label">動員点</span>
          <span class="result-value">${formatSignedScore(proResult.mobilizationPoints)}</span>
          <span class="result-rank">体験 ${this.state.stats.experience ?? 0}</span>
        </li>
      `,
      `
        <li class="result-item">
          <span class="result-label">退塾点</span>
          <span class="result-value">${formatSignedScore(proResult.withdrawalPoints)}</span>
          <span class="result-rank">退塾 ${proResult.withdrawal}</span>
        </li>
      `,
      `
        <li class="result-item">
          <span class="result-label">入退差点</span>
          <span class="result-value">${formatSignedScore(proResult.enrollmentDiffPoints)}</span>
          <span class="result-rank">入退差 ${proResult.enrollmentDiff}</span>
        </li>
      `,
      `
        <li class="result-item">
          <span class="result-label">満足点</span>
          <span class="result-value">${formatSignedScore(proResult.satisfactionPoints)}</span>
          <span class="result-rank">満足 ${this.state.stats.satisfaction ?? 0}</span>
        </li>
      `,
      `
        <li class="result-item result-item-accent">
          <span class="result-label">合計</span>
          <span class="result-value">${proResult.total}</span>
          <span class="result-rank">総合ランク ${proResult.overallRank}</span>
        </li>
      `,
      `
        <li class="result-item">
          <span class="result-label">称号</span>
          <span class="result-value">${escapeHtml(proResult.title || '-')}</span>
          <span class="result-rank">rankSummerPro.csv</span>
        </li>
      `,
      this.buildHighscoreResultItem(),
    ].join('');
  }

  render() {
    this.renderDifficultyButtons();
    this.syncStartOverlay();
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
    this.renderActionCalcPanel();
    this.updateActionConfirmState();
    this.renderLogMessages();
    this.persistGameState();
  }

  renderDifficultyButtons() {
    const isFresh = this.state.difficulty === 'fresh';
    this.elements.difficultyFresh?.classList.toggle('selected', isFresh);
    this.elements.difficultyPro?.classList.toggle('selected', !isFresh);
    if (this.elements.calcModeToggle) {
      this.elements.calcModeToggle.checked = this.calcModeEnabled;
    }
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

  renderLogMessages() {
    if (!this.elements.logMessages) {
      return;
    }
    this.elements.logMessages.innerHTML = (this.state.log ?? []).map((entry) => {
      const message = typeof entry === 'string' ? entry : entry?.message ?? '';
      const kind = typeof entry === 'string' ? 'info' : entry?.kind ?? 'info';
      return `<div class="log-message log-${kind}">${escapeHtml(message)}</div>`;
    }).join('');
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
    const start = current.thresholds?.[statKey] ?? 0;
    const end = next?.thresholds?.[statKey] ?? start;
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
    if (this.calcModeEnabled) {
      const totalCards = TRAINING_CATEGORIES.reduce(
        (sum, category) => sum + this.getTrainingPoolAvailableCount(turn.poolType, category),
        0,
      );
      this.elements.trainingChoices.innerHTML = `
        <div class="calc-action-inputs">
          <div class="calc-input-group">
            <div class="calc-slot-row">
              <label for="trainingCalcCardInput">カード番号</label>
              <input
                id="trainingCalcCardInput"
                class="calc-card-input"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                placeholder="例: 6"
                autocomplete="off"
              >
            </div>
            <div class="calc-preview">
              <div class="calc-preview-card"><span>対象プール</span><br>${turn.poolType} / 残り ${totalCards} 枚</div>
            </div>
            <button id="trainingCalcSubmit" class="btn-primary" type="button">カードを獲得</button>
          </div>
        </div>
      `;
      const input = this.elements.trainingChoices.querySelector('#trainingCalcCardInput');
      const submit = this.elements.trainingChoices.querySelector('#trainingCalcSubmit');
      if (submit) {
        submit.addEventListener('click', () => this.drawTrainingCardByCardNo(input?.value ?? ''));
      }
      if (input) {
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            this.drawTrainingCardByCardNo(input.value);
          }
        });
      }
      return;
    }
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
    const calcNote = this.isCalcNormalActionMode()
      ? '未割当スタッフへ番号指定で補完'
      : '未割当スタッフへ自動補完';
    this.elements.nPoolSummary.innerHTML = `
      <span class="token-chip token-organize">Nプール ${remaining}枚</span>
      <span class="token-chip token-inspiration">${calcNote}</span>
      <span class="token-chip token-passion">Nは職種制限なし</span>
    `;
    if (this.elements.nPoolCount) {
      this.elements.nPoolCount.textContent = String(remaining);
    }
  }

  renderActionCalcPanel() {
    if (!this.elements.actionCalcPanel) {
      return;
    }
    const active = this.isCalcNormalActionMode();
    this.elements.actionCalcPanel.classList.toggle('hidden', !active);
    if (!active) {
      this.elements.actionCalcPanel.innerHTML = '';
      return;
    }

    const usedStaff = new Set(Object.values(this.state.assignments).filter(Boolean));
    const remainingStaff = NORMAL_STAFF_ORDER.filter((key) => !usedStaff.has(key));
    const nTargets = remainingStaff.slice(0, this.nPool.length);
    const nMissing = remainingStaff.slice(this.nPool.length);

    this.elements.actionCalcPanel.innerHTML = `
      <div class="calc-input-group">
        <div class="calc-slot-row"><strong>計算機入力</strong><span>手札4枚の配置先と、未割当スタッフの Nカード番号を指定します。</span></div>
        ${Array.from({ length: 4 }, (_, index) => {
          const card = this.state.hand[index];
          if (!card) {
            return `
              <div class="calc-slot-row">
                <label>手札${index + 1}</label>
                <input class="calc-card-input" type="text" value="未取得" disabled>
              </div>
            `;
          }
          const assigned = this.selectedAssignment(index);
          return `
            <div class="calc-slot-row">
              <label for="calcActionHand${index}">手札${index + 1}</label>
              <span class="calc-preview-card">No.${normalizeCardNo(card.cardNo) ?? '-'} ${card.cardName}</span>
              <select id="calcActionHand${index}" data-calc-hand-index="${index}">
                <option value="" ${!assigned ? 'selected' : ''}>未使用</option>
                ${NORMAL_STAFF_ORDER.map((staffKey) => `
                  <option value="${staffKey}" ${assigned === staffKey ? 'selected' : ''}>${this.getStaffLabel(staffKey)}</option>
                `).join('')}
              </select>
            </div>
          `;
        }).join('')}
        ${nTargets.length > 0 ? `
          <div class="calc-slot-row"><strong>Nプール指定</strong><span>残り ${this.nPool.length} 枚からスタッフ別にカード番号を入力します。</span></div>
          ${nTargets.map((staffKey) => `
            <div class="calc-slot-row">
              <label for="calcActionN${staffKey}">${this.getStaffLabel(staffKey)}</label>
              <input
                id="calcActionN${staffKey}"
                class="calc-card-input"
                data-calc-n-staff="${staffKey}"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                placeholder="例: 5"
                autocomplete="off"
                value="${this.getCalcActionNAssignment(staffKey)}"
              >
            </div>
          `).join('')}
        ` : ''}
        ${nMissing.length > 0 ? `
          <div class="calc-slot-row">
            <label>Nプール切れ</label>
            <span class="calc-preview-card">${nMissing.map((staffKey) => this.getStaffLabel(staffKey)).join(' / ')} は空欄のまま進みます。</span>
          </div>
        ` : ''}
      </div>
    `;

    this.elements.actionCalcPanel.querySelectorAll('[data-calc-hand-index]').forEach((select) => {
      select.addEventListener('change', () => {
        this.setAssignment(Number(select.dataset.calcHandIndex), select.value || '');
      });
    });
    this.elements.actionCalcPanel.querySelectorAll('[data-calc-n-staff]').forEach((input) => {
      input.addEventListener('input', () => {
        this.setCalcActionNAssignment(input.dataset.calcNStaff, input.value);
      });
    });
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
      if (this.elements.summerMeetingInspirationPanel) {
        this.elements.summerMeetingInspirationPanel.classList.add('hidden');
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
          ? '各スタッフの講習デッキから1枚ずつ使うか、並行カードを追加して使うか、休憩します。'
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
    this.renderSummerMeetingRevivalPanel();
    this.renderSummerMeetingOrganizePanel();
    this.renderSummerMeetingInspirationPanel();
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
    const selectedCandidate = selectedId
      ? this.pendingSummerPrep.candidates.find((card) => card.instanceId === selectedId)
      : null;
    const calcMode = this.isCalcSummerPrepMode();
    const eligibleTargets = this.findSummerPrepEligibleTargets(selectedCandidate);
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
      ${calcMode ? `
        <div class="calc-input-group">
          <div class="calc-slot-row"><strong>計算機入力</strong><span>トップ3枚からカード番号を1枚選び、交換先スタッフとカード位置を入力します。</span></div>
          <div class="calc-slot-row">
            <label for="summerPrepCalcCandidateInput">候補カード番号</label>
            <input
              id="summerPrepCalcCandidateInput"
              class="calc-card-input"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              placeholder="例: 6"
              autocomplete="off"
              value="${selectedCandidate ? escapeHtml(normalizeCardNo(selectedCandidate.cardNo) ?? '') : ''}"
            >
          </div>
          <div class="calc-slot-row">
            <label for="summerPrepCalcStaffSelect">交換先スタッフ</label>
            <select id="summerPrepCalcStaffSelect">
              <option value="">選択してください</option>
              ${SUMMER_STAFF_ORDER.map((staffKey) => `
                <option value="${staffKey}">${this.getStaffLabel(staffKey)}</option>
              `).join('')}
            </select>
          </div>
          <div class="calc-slot-row">
            <label for="summerPrepCalcSlotInput">カード位置</label>
            <input
              id="summerPrepCalcSlotInput"
              class="calc-card-input"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              placeholder="例: 1"
              autocomplete="off"
            >
          </div>
          <div class="calc-slot-row">
            <span class="calc-preview-card">${selectedCandidate ? `交換可能: ${eligibleTargets.length}枚` : '候補カード番号を入力すると交換可否を判定します。'}${selectedCandidate && eligibleTargets.length === 0 ? ' / この候補は除外のみ可能です。' : ''}</span>
            <button id="summerPrepCalcSubmit" class="btn-primary" type="button" ${selectedCandidate && eligibleTargets.length === 0 ? 'disabled' : ''}>入力で交換</button>
          </div>
        </div>
      ` : '<div class="meeting-summary-item">交換先を選んでから「交換せず捨てる」か、カードを交換してください。</div>'}
    `;
    if (this.elements.summerDiscardButton) {
      this.elements.summerDiscardButton.disabled = !selectedId;
    }
    if (calcMode) {
      if (this.elements.summerDiscardButton) {
        this.elements.summerDiscardButton.disabled = false;
      }
      const submit = this.elements.summerCandidateArea.querySelector('#summerPrepCalcSubmit');
      const candidateInput = this.elements.summerCandidateArea.querySelector('#summerPrepCalcCandidateInput');
      const slotInput = this.elements.summerCandidateArea.querySelector('#summerPrepCalcSlotInput');
      submit?.addEventListener('click', () => this.submitCalcSummerPrepExchange());
      [candidateInput, slotInput].forEach((input) => {
        input?.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            this.submitCalcSummerPrepExchange();
          }
        });
      });
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
      const calcValue = escapeHtml(this.getCalcSummerActionEntry(staffKey));
      const calcMode = this.isCalcSummerActionMode();
      const selectedCards = this.getSummerActionSelectionIds(staffKey)
        .map((selectedId) => this.state.staffDecks[staffKey].find((card) => card.instanceId === selectedId))
        .filter(Boolean);
      const deckCount = this.state.staffDecks[staffKey]?.length ?? 0;
      return `
        <article class="summer-action-column">
          <div class="summer-action-column-head">
            <strong>${this.getStaffLabel(staffKey)}</strong>
            <span class="summer-deck-count">${deckCount}枚</span>
          </div>
          <div class="summer-action-note">${selectedCards.length > 0 ? `選択中: ${selectedCards.map((card) => card.cardName).join(' / ')}` : '休憩中'}</div>
          ${calcMode ? `
            <div class="calc-input-group">
              <div class="calc-slot-row">
                <label for="calcSummerAction${staffKey}">使うカード番号</label>
                <input
                  id="calcSummerAction${staffKey}"
                  class="calc-card-input"
                  data-calc-summer-staff="${staffKey}"
                  type="text"
                  inputmode="text"
                  placeholder="例: 6,8 / 休む"
                  autocomplete="off"
                  value="${calcValue}"
                >
              </div>
              <div class="calc-slot-row">
                <span class="calc-preview-card">番号はこのデッキ内のみ有効。2枚目以降は並行カードのみ。</span>
                <button type="button" class="summer-rest-button ${this.getCalcSummerActionEntry(staffKey).trim() === '休む' ? 'active' : ''}" data-summer-rest="${staffKey}">休む</button>
              </div>
            </div>
          ` : ''}
        </article>
      `;
    }).join('');

    if (this.isCalcSummerActionMode()) {
      this.elements.summerActionGrid.querySelectorAll('[data-calc-summer-staff]').forEach((input) => {
        input.addEventListener('input', () => {
          this.setCalcSummerActionEntry(input.dataset.calcSummerStaff, input.value);
        });
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            this.resolveSummerActionPhase();
          }
        });
      });
    }
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
      const selectionIds = this.getSummerActionSelectionIds(staffKey);
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
                  <button type="button" class="summer-deck-card-button ${selectionIds.includes(card.instanceId) ? 'selected' : ''} ${flipped ? 'flipped' : ''} ${flipped ? 'disabled' : ''}" data-summer-use data-summer-use-staff="${staffKey}" data-summer-use-id="${card.instanceId}" ${flipped ? 'disabled' : ''}>
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
          ${mode === 'summer-meeting' ? `
            <div class="summer-deck-actions">
              <button type="button" class="summer-rest-button ${this.pendingSummerInspiration?.selectedCandidateId && (this.state.tokens?.inspiration ?? 0) > 0 ? '' : 'active'}" data-summer-meeting-target data-summer-meeting-target-staff="${staffKey}" ${(this.pendingSummerInspiration?.selectedCandidateId && (this.state.tokens?.inspiration ?? 0) > 0) ? '' : 'disabled'}>
                このデッキへ追加
              </button>
            </div>
          ` : ''}
          ${mode === 'summer-action' ? `<div class="summer-deck-actions"><button type="button" class="summer-rest-button ${selectionIds.length === 0 ? 'active' : ''}" data-summer-rest="${staffKey}">休む</button></div>` : ''}
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
    const organized = this.pendingMeeting.organizeRemovedCards?.map((item) => `${this.getStaffLabel(item.staffKey)}: ${item.card.cardName}`).join(' / ') || 'なし';
    const added = this.pendingMeeting.inspirationAcquiredCards?.map((item) => `${this.getStaffLabel(item.staffKey)}: ${item.card.cardName}`).join(' / ') || 'なし';
    this.elements.summerMeetingSummary.innerHTML = `
      <div class="meeting-summary-item">使用: ${used}</div>
      <div class="meeting-summary-item">休憩: ${rested}</div>
      <div class="meeting-summary-item">復活: ${revived}</div>
      <div class="meeting-summary-item">削除: ${organized}</div>
      <div class="meeting-summary-item">追加: ${added}</div>
    `;
  }

  getSummerMeetingOrganizeCandidates() {
    if (this.state.phase !== 'summer-meeting' || this.pendingMeeting?.kind !== 'summer') {
      return [];
    }

    const candidates = [];
    for (const staffKey of SUMMER_STAFF_ORDER) {
      for (const card of this.state.staffDecks?.[staffKey] ?? []) {
        candidates.push({ staffKey, card });
      }
    }
    return candidates;
  }

  getSummerMeetingSelectedOrganizeCandidate() {
    const selectedId = this.state.summerMeetingOrganizeSelectionId;
    if (!selectedId) {
      return null;
    }
    return this.getSummerMeetingOrganizeCandidates().find((item) => item.card.instanceId === selectedId) ?? null;
  }

  selectSummerMeetingOrganizeCandidate(instanceId) {
    if (this.pendingSummerInspiration) {
      this.log('発想追加を先に確定してください', 'error');
      return;
    }
    if ((this.state.tokens?.organize ?? 0) < 1) {
      this.log('整理が足りません', 'error');
      return;
    }

    const candidate = this.getSummerMeetingOrganizeCandidates().find((item) => item.card.instanceId === instanceId);
    if (!candidate) {
      return;
    }

    this.state.summerMeetingOrganizeSelectionId = instanceId;
    this.render();
  }

  useSummerMeetingOrganizeRemoval() {
    if (this.state.difficulty !== 'pro' || this.state.phase !== 'summer-meeting' || this.pendingMeeting?.kind !== 'summer') {
      return;
    }
    if (this.pendingSummerInspiration) {
      this.log('発想追加を先に確定してください', 'error');
      return;
    }

    const candidate = this.getSummerMeetingSelectedOrganizeCandidate();
    if (!candidate) {
      this.log('整理の対象を選んでください', 'error');
      return;
    }

    const tokens = this.state.tokens;
    if (!tokens || (tokens.organize ?? 0) < 1) {
      this.log('整理が足りません', 'error');
      return;
    }

    const deck = this.state.staffDecks?.[candidate.staffKey];
    if (!Array.isArray(deck)) {
      return;
    }

    const cardIndex = deck.findIndex((card) => card.instanceId === candidate.card.instanceId);
    if (cardIndex < 0) {
      this.log('選択したカードは対象外です', 'error');
      this.renderSummerMeetingOrganizePanel();
      return;
    }

    const [removedCard] = deck.splice(cardIndex, 1);
    const wasFlipped = !!this.state.staffFlipped?.[candidate.staffKey]?.delete(removedCard.instanceId);
    this.state.tokens = {
      ...tokens,
      organize: (tokens.organize ?? 0) - 1,
    };
    this.state.summerMeetingOrganizeSelectionId = null;
    this.pendingMeeting.organizeRemovedCards = this.pendingMeeting.organizeRemovedCards ?? [];
    this.pendingMeeting.organizeRemovedCards.push({
      type: 'summer-organize-remove',
      staffKey: candidate.staffKey,
      card: removedCard,
      flipped: wasFlipped,
    });
    this.log(`整理削除: ${removedCard.cardName} を ${this.getStaffLabel(candidate.staffKey)} デッキから削除 / 整理-1`);
    this.showStatusAnimation([
      {
        type: 'summer-organize-remove',
        staffKey: candidate.staffKey,
        card: removedCard,
        flipped: wasFlipped,
      },
    ]);
    this.render();
  }

  renderSummerMeetingInspirationPanel() {
    if (!this.elements.summerMeetingInspirationPanel || !this.elements.summerMeetingInspirationStatus || !this.elements.summerMeetingInspirationChoices || !this.elements.summerMeetingInspirationCandidateArea) {
      return;
    }

    const visible = this.state.phase === 'summer-meeting' && this.pendingMeeting?.kind === 'summer' && this.state.difficulty === 'pro' && !!this.state.tokens;
    this.elements.summerMeetingInspirationPanel.classList.toggle('hidden', !visible);
    if (!visible) {
      this.elements.summerMeetingInspirationStatus.innerHTML = '';
      this.elements.summerMeetingInspirationChoices.innerHTML = '';
      this.elements.summerMeetingInspirationCandidateArea.innerHTML = '';
      return;
    }

    const inspiration = this.state.tokens?.inspiration ?? 0;
    const selected = this.pendingSummerInspiration;
    const selectedId = selected?.selectedCandidateId ?? null;

    this.elements.summerMeetingInspirationStatus.innerHTML = [
      `<div class="meeting-summary-item">残り発想: ${inspiration}</div>`,
      `<div class="meeting-summary-item">選択山札: ${selected ? `${selected.poolType} / ${selected.category}` : '未選択'}</div>`,
      `<div class="meeting-summary-item">候補数: ${selected ? selected.candidates.length : 0}</div>`,
      ...(this.isCalcSummerMeetingMode() ? [`
        <div class="calc-input-group">
          <div class="calc-slot-row"><strong>計算機入力</strong><span>山札、トップ3枚候補のカード番号、追加先スタッフを指定します。</span></div>
          <div class="calc-slot-row">
            <label for="summerMeetingInspirationCalcPoolSelect">山札</label>
            <select id="summerMeetingInspirationCalcPoolSelect">
              ${['地域', '全校'].map((poolType) => `
                <option value="${poolType}" ${selected?.poolType === poolType ? 'selected' : ''}>${poolType}</option>
              `).join('')}
            </select>
          </div>
          <div class="calc-slot-row">
            <label for="summerMeetingInspirationCalcCategorySelect">カテゴリ</label>
            <select id="summerMeetingInspirationCalcCategorySelect">
              ${TRAINING_CATEGORIES.map((category) => `
                <option value="${category}" ${selected?.category === category ? 'selected' : ''}>${category}</option>
              `).join('')}
            </select>
          </div>
          <div class="calc-slot-row">
            <label for="summerMeetingInspirationCalcCardInput">候補カード番号</label>
            <input
              id="summerMeetingInspirationCalcCardInput"
              class="calc-card-input"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              placeholder="例: 6"
              autocomplete="off"
              value="${selectedId ? escapeHtml(normalizeCardNo(selected?.candidates.find((card) => card.instanceId === selectedId)?.cardNo) ?? '') : ''}"
            >
          </div>
          <div class="calc-slot-row">
            <label for="summerMeetingInspirationCalcStaffSelect">追加先スタッフ</label>
            <select id="summerMeetingInspirationCalcStaffSelect">
              <option value="">選択してください</option>
              ${SUMMER_STAFF_ORDER.map((staffKey) => `
                <option value="${staffKey}">${this.getStaffLabel(staffKey)}</option>
              `).join('')}
            </select>
          </div>
          <div class="calc-slot-row">
            <span class="calc-preview-card">候補番号は指定した山札のトップ3枚のみ有効です。</span>
            <button id="summerMeetingInspirationCalcSubmit" class="btn-primary" type="button">入力で追加</button>
          </div>
        </div>
      `] : []),
    ].join('');

    this.elements.summerMeetingInspirationChoices.innerHTML = ['地域', '全校'].flatMap((poolType) => (
      TRAINING_CATEGORIES.map((category) => {
        const count = this.getTrainingPoolAvailableCount(poolType, category);
        const disabled = inspiration < 1 || count < 3 || !!this.pendingSummerInspiration;
        return `
          <button type="button" class="choice-button category-${category} ${disabled ? 'disabled' : ''}" data-summer-meeting-pool="${poolType}" data-summer-meeting-category="${category}" ${disabled ? 'disabled' : ''}>
            <span class="choice-label">${poolType} ${category}</span>
            <span class="choice-count">${count}枚</span>
          </button>
        `;
      })
    )).join('');

    if (this.isCalcSummerMeetingMode()) {
      const submit = this.elements.summerMeetingInspirationPanel.querySelector('#summerMeetingInspirationCalcSubmit');
      const cardInput = this.elements.summerMeetingInspirationPanel.querySelector('#summerMeetingInspirationCalcCardInput');
      submit?.addEventListener('click', () => this.submitCalcSummerMeetingInspiration());
      cardInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.submitCalcSummerMeetingInspiration();
        }
      });
    }

    if (!selected) {
      this.elements.summerMeetingInspirationCandidateArea.innerHTML = '<div class="meeting-summary-item">山札を1つ選んでください。</div>';
      return;
    }

    this.elements.summerMeetingInspirationCandidateArea.innerHTML = `
      <div class="meeting-summary-item">選択中: ${selected.poolType} / ${selected.category}</div>
      <div class="summer-candidate-grid">
        ${selected.candidates.map((card) => `
          <button type="button" class="summer-card-button ${selectedId === card.instanceId ? 'selected' : ''}" data-summer-meeting-candidate-id="${card.instanceId}">
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
      <div class="meeting-summary-item">追加先はデッキ下部のボタンで選びます。</div>
    `;
  }

  renderSummerMeetingOrganizePanel() {
    if (!this.elements.summerMeetingOrganizePanel || !this.elements.summerMeetingOrganizeStatus || !this.elements.summerMeetingOrganizeTargets) {
      return;
    }

    const visible = this.state.phase === 'summer-meeting' && this.pendingMeeting?.kind === 'summer' && this.state.difficulty === 'pro' && !!this.state.tokens;
    this.elements.summerMeetingOrganizePanel.classList.toggle('hidden', !visible);
    if (!visible) {
      this.elements.summerMeetingOrganizeStatus.innerHTML = '';
      this.elements.summerMeetingOrganizeTargets.innerHTML = '';
      if (this.elements.summerMeetingOrganizeConfirm) {
        this.elements.summerMeetingOrganizeConfirm.disabled = true;
        this.elements.summerMeetingOrganizeConfirm.textContent = '選択カードを削除';
      }
      return;
    }

    const organize = this.state.tokens?.organize ?? 0;
    const selected = this.getSummerMeetingSelectedOrganizeCandidate();
    const candidates = this.getSummerMeetingOrganizeCandidates();
    const lockedByInspiration = !!this.pendingSummerInspiration;

    this.elements.summerMeetingOrganizeStatus.innerHTML = [
      `<div class="meeting-summary-item">残り整理: ${organize}</div>`,
      `<div class="meeting-summary-item">削除候補: ${candidates.length}件</div>`,
      `<div class="meeting-summary-item">${lockedByInspiration ? '発想追加の候補選択中は整理を使えません。' : '任意のスタッフ別デッキから1枚を削除できます。'}</div>`,
      ...(this.isCalcSummerMeetingMode() ? [`
        <div class="calc-input-group">
          <div class="calc-slot-row"><strong>計算機入力</strong><span>削除したいスタッフ別デッキ内カードの番号を指定します。</span></div>
          <div class="calc-slot-row">
            <label for="summerMeetingOrganizeCalcCardInput">対象カード番号</label>
            <input
              id="summerMeetingOrganizeCalcCardInput"
              class="calc-card-input"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              placeholder="例: 5"
              autocomplete="off"
            >
            <button id="summerMeetingOrganizeCalcSubmit" class="btn-secondary" type="button">入力で削除</button>
          </div>
        </div>
      `] : []),
    ].join('');

    this.elements.summerMeetingOrganizeTargets.innerHTML = candidates.length > 0
      ? SUMMER_STAFF_ORDER.map((staffKey) => {
        const deck = this.state.staffDecks?.[staffKey] ?? [];
        const staffCards = deck.map((card) => {
          const flipped = this.isSummerCardFlipped(staffKey, card);
          const selectedClass = selected?.card.instanceId === card.instanceId ? 'selected' : '';
          const disabled = organize < 1 || lockedByInspiration;
          return `
            <button type="button" class="summer-deck-card-button ${selectedClass} ${flipped ? 'flipped' : ''} ${disabled ? 'disabled' : ''}" data-summer-organize-id="${card.instanceId}" data-summer-organize-staff="${staffKey}" ${disabled ? 'disabled' : ''}>
              <div class="summer-card-top">
                <span class="summer-card-name">${card.cardName}</span>
                <span class="card-rarity rarity-${card.rarity}">${card.rarity}</span>
              </div>
              <div class="summer-card-meta">
                <span class="card-category-text category-${card.category}">${card.category}</span>
                <span class="summer-deck-card-badge">${flipped ? '裏返し' : '削除可'}</span>
              </div>
              <div class="summer-card-desc">${textToHtml(card.topEffect || card.effect)}</div>
            </button>
          `;
        }).join('') || '<div class="meeting-summary-item">カードなし</div>';

        return `
          <article class="summer-organize-column">
            <div class="summer-deck-column-head">
              <strong class="summer-deck-title">${this.getStaffLabel(staffKey)}</strong>
              <span class="summer-deck-count">${deck.length}枚</span>
            </div>
            <div class="summer-organize-card-list">
              ${staffCards}
            </div>
          </article>
        `;
      }).join('')
      : '<div class="meeting-summary-item">対象なし</div>';

    if (this.elements.summerMeetingOrganizeConfirm) {
      const disabled = !selected || organize < 1 || lockedByInspiration;
      this.elements.summerMeetingOrganizeConfirm.disabled = disabled;
      this.elements.summerMeetingOrganizeConfirm.textContent = '選択カードを削除';
    }
    if (this.isCalcSummerMeetingMode()) {
      const submit = this.elements.summerMeetingOrganizePanel.querySelector('#summerMeetingOrganizeCalcSubmit');
      const input = this.elements.summerMeetingOrganizePanel.querySelector('#summerMeetingOrganizeCalcCardInput');
      submit?.addEventListener('click', () => this.submitCalcSummerMeetingOrganize());
      input?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.submitCalcSummerMeetingOrganize();
        }
      });
    }
  }

  getSummerMeetingPassionCost(card) {
    if (!card) {
      return null;
    }
    if (card.rarity === 'SR') {
      return 1;
    }
    if (card.rarity === 'SSR') {
      return 3;
    }
    return null;
  }

  getSummerMeetingRevivalCandidates() {
    if (this.state.phase !== 'summer-meeting' || this.pendingMeeting?.kind !== 'summer') {
      return [];
    }

    const candidates = [];
    for (const staffKey of SUMMER_STAFF_ORDER) {
      for (const card of this.state.staffDecks?.[staffKey] ?? []) {
        if (!this.state.staffFlipped?.[staffKey]?.has(card.instanceId)) {
          continue;
        }
        const cost = this.getSummerMeetingPassionCost(card);
        if (!cost) {
          continue;
        }
        candidates.push({ staffKey, card, cost });
      }
    }
    return candidates;
  }

  getSummerMeetingSelectedCandidate() {
    const selectedId = this.state.summerMeetingSelectionId;
    if (!selectedId) {
      return null;
    }
    return this.getSummerMeetingRevivalCandidates().find((item) => item.card.instanceId === selectedId) ?? null;
  }

  selectSummerMeetingRevivalCandidate(instanceId) {
    const candidate = this.getSummerMeetingRevivalCandidates().find((item) => item.card.instanceId === instanceId);
    if (!candidate) {
      return;
    }
    this.state.summerMeetingSelectionId = instanceId;
    this.render();
  }

  selectSummerMeetingInspirationCandidate(instanceId) {
    if (!this.pendingSummerInspiration) {
      return;
    }
    if (!this.pendingSummerInspiration.candidates.some((card) => card.instanceId === instanceId)) {
      return;
    }
    this.pendingSummerInspiration.selectedCandidateId = instanceId;
    this.state.summerMeetingInspirationSelectionId = instanceId;
    this.render();
  }

  finalizeSummerMeetingInspirationSelection(staffKey) {
    if (this.state.difficulty !== 'pro' || this.state.phase !== 'summer-meeting' || this.pendingMeeting?.kind !== 'summer') {
      return;
    }
    if (!this.pendingSummerInspiration) {
      return;
    }
    if (!SUMMER_STAFF_ORDER.includes(staffKey)) {
      return;
    }
    const candidate = this.pendingSummerInspiration.candidates.find((card) => card.instanceId === this.pendingSummerInspiration.selectedCandidateId);
    if (!candidate) {
      this.log('発想追加の対象を選んでください', 'error');
      return;
    }

    const tokens = this.state.tokens;
    if (!tokens || (tokens.inspiration ?? 0) < 1) {
      this.log('発想が足りません', 'error');
      return;
    }

    const targetDeck = this.state.staffDecks[staffKey];
    if (!Array.isArray(targetDeck)) {
      return;
    }

    const discardBucket = this.trainingDiscards[this.pendingSummerInspiration.poolType][this.pendingSummerInspiration.category];
    const rejected = this.pendingSummerInspiration.candidates.filter((card) => card.instanceId !== candidate.instanceId);
    discardBucket.push(...rejected.map((card) => ({ ...card })));

    const addedCard = cloneCardWithId(candidate, staffKey);
    targetDeck.push(addedCard);
    this.state.tokens = {
      ...tokens,
      inspiration: (tokens.inspiration ?? 0) - 1,
    };
    this.pendingMeeting.inspirationAcquiredCards = this.pendingMeeting.inspirationAcquiredCards ?? [];
    this.pendingMeeting.inspirationAcquiredCards.push({
      type: 'summer-inspiration-add',
      staffKey,
      poolType: this.pendingSummerInspiration.poolType,
      category: this.pendingSummerInspiration.category,
      card: addedCard,
      sourceCard: candidate,
      discarded: rejected,
    });
    this.log(`発想追加: ${candidate.cardName} を ${this.getStaffLabel(staffKey)} デッキに追加 / 発想-1`);
    this.pendingSummerInspiration = null;
    this.state.summerMeetingInspirationSelectionId = null;
    this.render();
  }

  useSummerMeetingPassionRevival() {
    if (this.state.difficulty !== 'pro' || this.state.phase !== 'summer-meeting' || this.pendingMeeting?.kind !== 'summer') {
      return;
    }

    const candidate = this.getSummerMeetingSelectedCandidate();
    if (!candidate) {
      this.log('情熱復活の対象を選んでください', 'error');
      return;
    }

    const tokens = this.state.tokens;
    if (!tokens || (tokens.passion ?? 0) < candidate.cost) {
      this.log('情熱が足りません', 'error');
      return;
    }

    const flippedSet = this.state.staffFlipped?.[candidate.staffKey];
    if (!flippedSet?.has(candidate.card.instanceId)) {
      this.log('選択したカードは対象外です', 'error');
      this.renderSummerMeetingRevivalPanel();
      return;
    }

    flippedSet.delete(candidate.card.instanceId);
    this.state.tokens = {
      ...tokens,
      passion: (tokens.passion ?? 0) - candidate.cost,
    };
    this.state.summerMeetingSelectionId = null;
    this.pendingMeeting.revivedCards.push({
      type: candidate.card.rarity === 'SSR' ? 'summer-revival-ssr' : 'summer-revival-sr',
      mode: 'passion',
      staffKey: candidate.staffKey,
      card: candidate.card,
      cost: candidate.cost,
    });
    this.log(`情熱復活: ${candidate.card.cardName} / 情熱-${candidate.cost}`);
    this.render();
  }

  renderSummerMeetingRevivalPanel() {
    if (!this.elements.summerMeetingRevivalPanel || !this.elements.summerMeetingRevivalStatus || !this.elements.summerMeetingRevivalTargets) {
      return;
    }

    const visible = this.state.phase === 'summer-meeting' && this.pendingMeeting?.kind === 'summer' && this.state.difficulty === 'pro' && !!this.state.tokens;
    this.elements.summerMeetingRevivalPanel.classList.toggle('hidden', !visible);
    if (!visible) {
      this.elements.summerMeetingRevivalStatus.innerHTML = '';
      this.elements.summerMeetingRevivalTargets.innerHTML = '';
      if (this.elements.summerMeetingRevivalConfirm) {
        this.elements.summerMeetingRevivalConfirm.disabled = true;
        this.elements.summerMeetingRevivalConfirm.textContent = '選択カードを復活';
      }
      return;
    }

    const candidates = this.getSummerMeetingRevivalCandidates();
    const selected = this.getSummerMeetingSelectedCandidate();
    const passion = this.state.tokens?.passion ?? 0;
    const totalCost = candidates.reduce((sum, item) => sum + item.cost, 0);
    this.elements.summerMeetingRevivalStatus.innerHTML = [
      `<div class="meeting-summary-item">残り情熱: ${passion}</div>`,
      `<div class="meeting-summary-item">復活可能: ${candidates.length}件</div>`,
      `<div class="meeting-summary-item">必要情熱合計: ${totalCost}</div>`,
      ...(this.isCalcSummerMeetingMode() ? [`
        <div class="calc-input-group">
          <div class="calc-slot-row"><strong>計算機入力</strong><span>復活したい裏返し SR / SSR のカード番号を指定します。</span></div>
          <div class="calc-slot-row">
            <label for="summerMeetingRevivalCalcCardInput">対象カード番号</label>
            <input
              id="summerMeetingRevivalCalcCardInput"
              class="calc-card-input"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              placeholder="例: 41"
              autocomplete="off"
            >
            <button id="summerMeetingRevivalCalcSubmit" class="btn-secondary" type="button">入力で復活</button>
          </div>
        </div>
      `] : []),
    ].join('');

    this.elements.summerMeetingRevivalTargets.innerHTML = candidates.length > 0
      ? candidates.map((item) => {
        const selectedClass = selected?.card.instanceId === item.card.instanceId ? 'selected' : '';
        return `
          <button type="button" class="summer-revival-target-button ${selectedClass}" data-summer-revival-id="${item.card.instanceId}">
            <div class="summer-card-top">
              <span class="summer-card-name">${item.card.cardName}</span>
              <span class="card-rarity rarity-${item.card.rarity}">${item.card.rarity}</span>
            </div>
            <div class="summer-card-meta">
              <span class="card-category-text category-${item.card.category}">${this.getStaffLabel(item.staffKey)}</span>
              <span class="summer-deck-card-badge">情熱${item.cost}</span>
            </div>
            <div class="summer-card-desc">${textToHtml(item.card.topEffect || item.card.effect)}</div>
          </button>
        `;
      }).join('')
      : '<div class="meeting-summary-item">対象なし</div>';

    if (this.elements.summerMeetingRevivalConfirm) {
      this.elements.summerMeetingRevivalConfirm.disabled = !selected || selected.cost > passion;
      this.elements.summerMeetingRevivalConfirm.textContent = selected
        ? `情熱${selected.cost}で復活`
        : '選択カードを復活';
    }
    if (this.isCalcSummerMeetingMode()) {
      const submit = this.elements.summerMeetingRevivalPanel.querySelector('#summerMeetingRevivalCalcSubmit');
      const input = this.elements.summerMeetingRevivalPanel.querySelector('#summerMeetingRevivalCalcCardInput');
      submit?.addEventListener('click', () => this.submitCalcSummerMeetingRevival());
      input?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.submitCalcSummerMeetingRevival();
        }
      });
    }
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
      this.elements.phaseDescription.textContent = `${turn.season}の教室行動。4つの講習デッキから1枚ずつ使うか、並行カードを追加して使うか休憩します。${prepText}。`;
    } else if (turn.phaseKind === 'result') {
      this.elements.phaseDescription.textContent = '結果画面。累積した4指標からランクを表示します。';
    } else {
      this.elements.phaseDescription.textContent = `${turn.season}の教室会議。休憩したスタッフの SR / SSR を復活させます。PROでは発想追加と整理削除も行えます。${prepText}。`;
    }
  }

  renderResult() {
    if (this.state.phase !== 'result' || !this.elements.resultSummary) {
      return;
    }
    this.syncResultHighscore();
    if (this.state.difficulty === 'fresh') {
      this.renderFreshResult();
      return;
    }
    this.renderProResult();
  }

  updateActionConfirmState() {
    if (!this.elements.actionConfirm) {
      return;
    }
    const active = this.isCalcNormalActionMode()
      ? this.state.phase === 'action'
      : this.state.phase === 'action' && this.state.hand.some((_, index) => this.state.assignments[index]);
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
      if (item.type === 'summer-organize-remove') {
        return `<div class="animation-card-item">${this.getStaffLabel(item.staffKey)} の ${item.card.cardName} を削除しました</div>`;
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
    this.state.log = [{ message, kind }, ...(this.state.log ?? [])];
    this.renderLogMessages();
    this.persistGameState();
  }
}
