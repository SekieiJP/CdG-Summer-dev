export const STAFFS = [
  { key: 'leader', label: '室長' },
  { key: 'teacher', label: '講師' },
  { key: 'office', label: '事務' },
];

export const STAFF_LABEL_TO_KEY = Object.fromEntries(
  STAFFS.map((staff) => [staff.label, staff.key]),
);

export const TRAINING_CATEGORIES = ['動員', '教務', '応対', '庶務'];

export const TURN_CONFIG = [
  {
    turn: 1,
    title: '5月下旬',
    season: '通常期',
    phase: '研修',
    poolType: '地域',
    phaseKind: 'training',
    prepCount: 0,
  },
  {
    turn: 2,
    title: '6月上旬',
    season: '通常期',
    phase: '研修',
    poolType: '全校',
    phaseKind: 'training',
    prepCount: 0,
  },
  {
    turn: 3,
    title: '6月下旬',
    season: '通常期',
    phase: '研修',
    poolType: '地域',
    phaseKind: 'training',
    prepCount: 0,
  },
  {
    turn: 4,
    title: '7月上旬',
    season: '通常期',
    phase: '研修',
    poolType: '全校',
    phaseKind: 'training',
    prepCount: 0,
  },
  {
    turn: 5,
    title: '前期1日目',
    season: '講習期',
    phase: '準備',
    poolType: '地域',
    phaseKind: 'prep',
    prepCount: 3,
  },
  {
    turn: 6,
    title: '前期2日目',
    season: '講習期',
    phase: '教室行動',
    poolType: '地域',
    phaseKind: 'summer',
    prepCount: 0,
  },
  {
    turn: 7,
    title: '前期3日目',
    season: '講習期',
    phase: '教室行動',
    poolType: '地域',
    phaseKind: 'summer',
    prepCount: 0,
  },
  {
    turn: 8,
    title: '中期1日目',
    season: '講習期',
    phase: '教室行動',
    poolType: '全校',
    phaseKind: 'summer',
    prepCount: 0,
  },
  {
    turn: 9,
    title: '中期2日目',
    season: '講習期',
    phase: '教室会議',
    poolType: '全校',
    phaseKind: 'summer',
    prepCount: 0,
  },
  {
    turn: 10,
    title: '後期1日目',
    season: '講習期',
    phase: '準備',
    poolType: '地域',
    phaseKind: 'prep',
    prepCount: 2,
  },
  {
    turn: 11,
    title: '後期2日目',
    season: '講習期',
    phase: '教室行動',
    poolType: '地域',
    phaseKind: 'summer',
    prepCount: 0,
  },
  {
    turn: 12,
    title: '後期3日目',
    season: '講習期',
    phase: '教室行動',
    poolType: '全校',
    phaseKind: 'summer',
    prepCount: 0,
  },
  {
    turn: 13,
    title: '後期4日目',
    season: '講習期',
    phase: '結果',
    poolType: '全校',
    phaseKind: 'result',
    prepCount: 0,
  },
];

export const DIFFICULTY_CONFIG = {
  fresh: {
    label: 'FRESH',
    cardCsv: './data/cards_fresh.csv',
    rankCsv: './data/rankFresh.csv',
    initialStats: {
      experience: 0,
      enrollment: 0,
      satisfaction: 3,
      accounting: 3,
    },
    nPoolNames: ['問合対応の基本', '問合対応の基本', '質問対応の基本', '生徒面談の基本', '経理精算の基本'],
  },
  pro: {
    label: 'PRO',
    cardCsv: './data/cards_pro.csv',
    rankCsv: './data/rankPro.csv',
    initialStats: {
      experience: 0,
      enrollment: 0,
      satisfaction: 3,
      accounting: 5,
    },
    nPoolNames: ['問合対応の基本', '問合対応の基本', '質問対応の基本', '生徒面談の基本', '経理精算の基本'],
  },
};

export const STAT_KEYS = [
  { key: 'experience', label: '体験', short: '体' },
  { key: 'enrollment', label: '入塾', short: '入' },
  { key: 'satisfaction', label: '満足', short: '満' },
  { key: 'accounting', label: '経理', short: '経' },
];

