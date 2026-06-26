import {
  DIFFICULTY_CONFIG,
  STAFFS,
  STAFF_LABEL_TO_KEY,
  STAT_KEYS,
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

const STAFF_ORDER = STAFFS.map((staff) => staff.key);

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
    this.nPool = [];
    this.elements = {};
    this.pendingMeeting = null;
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
      hand: [],
      assignments: {},
      staffDecks: {
        leader: [],
        teacher: [],
        office: [],
      },
      stats: { ...config.initialStats },
      lastDrawId: null,
      log: [],
      usedTurns: [],
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
      'trainingArea',
      'actionArea',
      'meetingArea',
      'resultArea',
      'meetingSummary',
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
    this.nPool = buildNPool(this.cards, config.nPoolNames);

    if (!preserveState) {
      this.state = this.createInitialState(difficulty);
    } else {
      this.state.difficulty = difficulty;
      this.state.stats = { ...config.initialStats, ...this.state.stats };
      this.state.currentPoolType = TURN_CONFIG[this.state.turnIndex]?.poolType ?? '地域';
    }

    this.elements.activeDifficultyLabel.textContent = config.label;
    this.elements.previewDifficultyLabel.textContent = config.label;
    this.elements.turnDetailLabel.textContent = config.label;
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

  drawTrainingCard(category) {
    if (this.state.phase !== 'training' || this.state.trainingDrawsLeft <= 0) {
      return;
    }
    const turn = this.currentTurnConfig();
    const deck = this.trainingPools?.[turn.poolType]?.[category] ?? [];
    const card = deck.shift();
    if (!card) {
      this.log(`${turn.poolType} ${category} の山札が空です`, 'error');
      return;
    }
    const drawn = { ...card, instanceId: `${turn.turn}-${Date.now()}-${Math.random().toString(16).slice(2)}` };
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
    if (staffKey && !STAFF_ORDER.includes(staffKey)) {
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
      const applied = this.applyCard(card, staffKey, nextStats, '通常期');
      nextStats = applied.stats;
      resolution.push({
        type: 'assigned',
        card,
        staffKey,
        details: applied.details,
      });
    });

    const remainingStaff = STAFF_ORDER.filter((key) => !usedStaff.has(key));
    const nUsed = [];
    for (const staffKey of remainingStaff) {
      if (this.nPool.length === 0) {
        resolution.push({ type: 'n-missing', staffKey });
        continue;
      }
      const card = this.nPool.shift();
      const applied = this.applyCard(card, staffKey, nextStats, '通常期');
      nextStats = applied.stats;
      nUsed.push({ card, staffKey, details: applied.details });
      resolution.push({ type: 'n-assigned', card, staffKey, details: applied.details });
    }

    this.state.stats = nextStats;
    this.pendingMeeting = {
      assignedCards: this.state.hand
        .map((card, index) => ({ card, staffKey: this.state.assignments[index] ?? null }))
        .filter((entry) => entry.staffKey),
      nUsed,
      discarded: this.state.hand
        .map((card, index) => ({ card, staffKey: this.state.assignments[index] ?? null }))
        .filter((entry) => !entry.staffKey),
      statsBefore,
      statsAfter: nextStats,
      usedTurns: [...resolution],
    };

    this.state.phase = 'meeting';
    this.showStatusAnimation(resolution);
    this.log('教室行動を確定しました');
    this.render();
  }

  applyCard(card, staffKey, stats, seasonLabel) {
    let nextStats = { ...stats };
    const { stats: appliedStats, details } = applyEffectText(card, nextStats);
    nextStats = appliedStats;

    if (seasonLabel === '通常期') {
      if (card.category === '動員') {
        nextStats.experience += 2;
        details.push({ key: 'experience', delta: 2, label: '体験' });
      }
      if (card.category === '庶務') {
        nextStats.accounting += 2;
        details.push({ key: 'accounting', delta: 2, label: '経理' });
      }
    }

    return { stats: nextStats, details };
  }

  commitMeetingPhase() {
    if (this.state.phase !== 'meeting' || !this.pendingMeeting) {
      return;
    }

    for (const item of this.pendingMeeting.assignedCards) {
      this.state.staffDecks[item.staffKey].push(item.card);
    }

    for (const item of this.pendingMeeting.nUsed) {
      this.state.staffDecks[item.staffKey].push(item.card);
    }

    this.state.usedTurns.push({
      turn: this.currentTurnConfig().turn,
      stats: { ...this.state.stats },
    });

    this.pendingMeeting = null;
    this.state.hand = [];
    this.state.assignments = {};
    this.state.lastDrawId = null;

    if (this.state.turnIndex >= 3) {
      this.state.phase = 'result';
      this.render();
      this.log('4ターンが終了しました');
      return;
    }

    this.state.turnIndex += 1;
    this.state.phase = 'training';
    this.state.trainingDrawsLeft = 4;
    this.state.currentPoolType = TURN_CONFIG[this.state.turnIndex].poolType;
    this.render();
    this.log(`第${this.state.turnIndex + 1}ターンへ進みます`);
  }

  getStaffLabel(staffKey) {
    return STAFFS.find((staff) => staff.key === staffKey)?.label ?? staffKey;
  }

  render() {
    this.renderDifficultyButtons();
    this.renderTurnPill();
    this.renderStatus();
    this.renderPhaseAreas();
    this.renderTurnTimeline();
    this.renderMenu();
    this.renderPhaseOverlay();
    this.renderMeetingSummary();
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
    this.elements.poolPill.textContent = turn.phaseKind === 'training' ? `${turn.poolType} 研修` : `${turn.poolType} 準備`;
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
    this.elements.resultArea?.classList.toggle('hidden', phase !== 'result');
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
                ${['leader', 'teacher', 'office'].map((key) => {
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
    this.elements.staffGrid.innerHTML = STAFF_ORDER.map((staffKey) => {
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
    this.elements.menuDecks.innerHTML = STAFF_ORDER.map((staffKey) => {
      const deck = this.state.staffDecks[staffKey];
      const cards = deck.slice(-4).map((card) => `<li>${card.cardName} / ${card.rarity}</li>`).join('') || '<li>未蓄積</li>';
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
    if (!this.pendingMeeting) {
      this.elements.meetingSummary.innerHTML = '<div class="meeting-summary-item">行動確定後にここへ移動内容を表示します。</div>';
      return;
    }
    const assigned = this.pendingMeeting.assignedCards.map((item) => `${this.getStaffLabel(item.staffKey)}: ${item.card.cardName}`).join(' / ') || 'なし';
    const nUsed = this.pendingMeeting.nUsed.map((item) => `${this.getStaffLabel(item.staffKey)}: ${item.card.cardName}`).join(' / ') || 'なし';
    const discarded = this.pendingMeeting.discarded.map((item) => item.card.cardName).join(' / ') || 'なし';
    this.elements.meetingSummary.innerHTML = `
      <div class="meeting-summary-item">配置カード: ${assigned}</div>
      <div class="meeting-summary-item">N補完: ${nUsed}</div>
      <div class="meeting-summary-item">余りカード: ${discarded}</div>
    `;
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
    this.elements.phaseDescription.textContent = `${turn.season}の${turn.phase}。${turn.poolType}プールを使う${turn.phaseKind === 'training' ? '研修' : '講習'}です。${prepText}。`;
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
      return '';
    }).join('');

    this.elements.animationHeader.textContent = 'カード効果発動';
    this.elements.animationCards.innerHTML = lines;
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
