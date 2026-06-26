export function parseCsv(text) {
  const rows = [];
  let row = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === ',' && !quoted) {
      row.push(current);
      current = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
      continue;
    }
    current += char;
  }

  if (current !== '' || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows;
}

export function normalizeCardNo(cardNo) {
  const value = Number.parseInt(String(cardNo ?? '').trim(), 10);
  return Number.isNaN(value) ? null : String(value);
}

export function buildCards(csvText) {
  const rows = parseCsv(csvText.trim());
  const [header, ...body] = rows;
  const hasCardNo = header?.some((item) => String(item).includes('cardNo'));
  return body
    .map((row) => row.map((cell) => String(cell ?? '').trim()))
    .filter((row) => row.some(Boolean))
    .map((row) => {
      const [category, rarity, cardName, topEffect = '', effect = '', cardNo = null] = row;
      return {
        category,
        rarity,
        cardName,
        topEffect,
        effect,
        cardNo: hasCardNo ? cardNo : null,
      };
    })
    .filter((card) => card.category && card.rarity && card.cardName);
}

export function shuffle(list) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function cloneCard(card) {
  return JSON.parse(JSON.stringify(card));
}

export function buildTrainingPools(cards, categories) {
  const pools = {
    地域: {},
    全校: {},
  };

  for (const category of categories) {
    const grouped = {
      R: cards.filter((card) => card.category === category && card.rarity === 'R'),
      SR: cards.filter((card) => card.category === category && card.rarity === 'SR'),
      SSR: cards.filter((card) => card.category === category && card.rarity === 'SSR'),
    };

    const srCards = shuffle(grouped.SR);
    const half = Math.floor(srCards.length / 2);

    pools.地域[category] = shuffle([
      ...grouped.R.map(cloneCard),
      ...srCards.slice(0, half).map(cloneCard),
    ]);
    pools.全校[category] = shuffle([
      ...grouped.SSR.map(cloneCard),
      ...srCards.slice(half).map(cloneCard),
    ]);
  }

  return pools;
}

export function buildNPool(cards, names) {
  const byName = new Map(cards.map((card) => [card.cardName, card]));
  return names
    .map((name, index) => {
      const source = byName.get(name);
      return source
        ? { ...cloneCard(source), poolIndex: index + 1 }
        : null;
    })
    .filter(Boolean);
}

export function iconUrl(card, suffix = '') {
  const normalized = normalizeCardNo(card?.cardNo);
  if (!normalized) {
    return '';
  }
  const iconNo = String(normalized).padStart(2, '0');
  return `./data/cardIcon/icon${iconNo}.png${suffix}`;
}

export function readCondition(card, stats) {
  const matches = [...String(card?.effect ?? '').matchAll(/[〈<]([^〉>]+)[〉>]/g)];
  if (matches.length === 0) {
    return true;
  }

  return matches.every((match) => {
    const raw = match[1].replace(/\s+/g, '');
    const parsed = raw.match(/(体験|入塾|満足|経理)(\d+)(以上|以下)/);
    if (!parsed) {
      return true;
    }
    const [, label, valueText, direction] = parsed;
    const value = Number(valueText);
    const statKey = ({
      体験: 'experience',
      入塾: 'enrollment',
      満足: 'satisfaction',
      経理: 'accounting',
    })[label];
    const current = stats[statKey] ?? 0;
    return direction === '以上' ? current >= value : current <= value;
  });
}

export function applyEffectText(card, stats) {
  const result = { ...stats };
  const details = [];
  const body = String(card?.effect ?? '').replace(/【[^】]+】/g, '');
  const segments = body.split(/[。．]/).map((part) => part.trim()).filter(Boolean);

  for (const segment of segments) {
    if (!readCondition({ effect: segment }, result)) {
      continue;
    }
    const setMatch = segment.match(/(体験|入塾|満足|経理)を(-?\d+)にする/);
    if (setMatch) {
      const [, label, valueText] = setMatch;
      const key = ({
        体験: 'experience',
        入塾: 'enrollment',
        満足: 'satisfaction',
        経理: 'accounting',
      })[label];
      const value = Number(valueText);
      details.push({ key, delta: value - result[key], label });
      result[key] = value;
    }

    const addMatches = [...segment.matchAll(/(体験|入塾|満足|経理)([+-]\d+)/g)];
    for (const match of addMatches) {
      const [, label, deltaText] = match;
      const key = ({
        体験: 'experience',
        入塾: 'enrollment',
        満足: 'satisfaction',
        経理: 'accounting',
      })[label];
      const delta = Number(deltaText);
      result[key] += delta;
      details.push({ key, delta, label });
    }
  }

  return { stats: result, details };
}

export function getStaffKeysForCard(card) {
  const match = String(card?.effect ?? '').match(/【([^】]+)】/);
  if (!match) {
    return ['leader', 'teacher', 'office'];
  }

  const tokens = match[1].split(/[・、,／\/]/).map((value) => value.trim()).filter(Boolean);
  const map = new Map([
    ['室長', 'leader'],
    ['講師', 'teacher'],
    ['事務', 'office'],
  ]);

  const keys = tokens.map((token) => map.get(token)).filter(Boolean);
  return keys.length > 0 ? [...new Set(keys)] : ['leader', 'teacher', 'office'];
}

export function formatDelta(delta) {
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta}`;
}

