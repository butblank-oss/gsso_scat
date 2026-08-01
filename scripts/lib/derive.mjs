/* 상세 화면(DETAIL)을 사실에서 자동으로 만든다.

   AI가 문장을 지어내면 검증할 수 없다. 그래서 AI는 라벨에서 두 가지만 뽑는다:
     - 보장성분표 숫자 (ga)
     - 원재료명 목록 (ingredients) — 표기 순서 그대로
   나머지 판정 카드·영양 프로파일·원료 분석·적합도는 전부 여기서 규칙으로 계산한다.
   같은 입력이면 언제나 같은 결과가 나오고, 게이트가 다시 돌려 대조할 수 있다.

   루브릭(점수)과 같은 원칙이다. 사실은 사람·AI가, 판단은 코드가.
*/
import { lookupIngredient } from './ingredients.mjs';
import { computeDmCarb } from './rubric.mjs';

/* '옥수수이에요' 처럼 어색하게 붙는 걸 막는다. 받침이 있으면 이에요, 없으면 예요. */
function iyeyo(word) {
  const last = String(word ?? '').trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code >= 0xAC00 && code <= 0xD7A3) {
    return (code - 0xAC00) % 28 ? `${word}이에요` : `${word}예요`;
  }
  return `${word}이에요`;   /* 영문·숫자로 끝나면 읽는 대로 이에요 */
}

/* ── 영양 프로파일 ─────────────────────────────────────── */
export function deriveNutrient(ga = {}, opts = {}) {
  const num = v => (v == null || v === '' ? null : Number(v));
  const protein = num(ga.protein), fat = num(ga.fat), fiber = num(ga.fiber);
  const ash = num(ga.ash), moisture = num(ga.moisture);
  let carb = null, dmCarb = null;
  if ([protein, fat, fiber, moisture].every(v => v != null)) {
    carb = Math.round((100 - (protein + fat + fiber + moisture)) * 10) / 10;
    dmCarb = computeDmCarb({ protein, fat, fiber, moisture });
  }
  return {
    protein, fat, fiber, moisture, ash, carb, dmCarb,
    meat: opts.meatRatio ?? null,
    calKg: num(ga.kcalPerKg),
    src: opts.src ?? 'label'
  };
}

/* ── 원료 목록 ─────────────────────────────────────────── */
/* 상위 5개를 주원료(main)로 본다. 사료 표기는 함량 많은 순이라 앞쪽이 실제 구성을 좌우한다. */
export function deriveIngredients(list = []) {
  return list.map((raw, i) => {
    const info = lookupIngredient(raw);
    return {
      rank: i + 1, main: i < 5, name: info.name,
      cat: info.cat, safe: info.safe, basis: info.basis,
      desc: info.desc, warn: info.warn, allergen: info.allergen
    };
  });
}

export function deriveDist(ingr = []) {
  const d = { safe: 0, caution: 0, danger: 0, unknown: 0, total: ingr.length };
  for (const i of ingr) d[i.safe === 'unknown' ? 'unknown' : i.safe]++;
  return d;
}

/* ── 기능성 원료 ───────────────────────────────────────── */
export function deriveFuncIngr(list = []) {
  const out = {};
  for (const raw of list) {
    const info = lookupIngredient(raw);
    if (!info.func) continue;
    const { key, ev } = info.func;
    (out[key] ??= []);
    if (out[key].some(x => x.n === info.name)) continue;
    out[key].push({ n: info.name, note: null, ev });
  }
  return out;
}

const FUNC_LABEL = {
  eye_tear: '눈물·피모', joint: '관절', digestive: '소화·장', immune: '면역·활력',
  heart: '심장', kidney: '신장', liver: '간', weight: '체중 관리',
  skin: '피부·피모', dental: '치아'
};

/* ── 판정 카드 ─────────────────────────────────────────── */
/* 기존 41종이 쓰던 category 를 그대로 쓴다: ingredient_quality, carb_level,
   additive_safety, nutrition_balance, price_value, functional_benefit */
export function deriveVerdict({ nutrient, ingr, dist, funcIngr, price, facts }) {
  const pos = [], cau = [], dan = [];
  const pct = v => `${Number(v).toFixed(1).replace(/\.0$/, '')}%`;

  /* 1번 원료 — 무엇으로 만든 사료인지가 가장 먼저 보여야 한다 */
  const first = ingr[0];
  if (first) {
    if (first.cat === 'meat' || first.cat === 'fish' || first.cat === 'organ') {
      pos.push({ icon: '🥩', category: 'ingredient_quality',
        title: first.cat === 'fish' ? '첫 번째 원료가 생선이에요' : '첫 번째 원료가 고기예요',
        body: `원재료 표기 맨 앞이 ${iyeyo(first.name)}. 함량이 가장 많다는 뜻이에요.` });
    } else if (first.cat === 'grain' || first.cat === 'legume') {
      cau.push({ icon: '🌾', category: 'ingredient_quality',
        title: '첫 번째 원료가 고기가 아니에요',
        body: `맨 앞이 ${iyeyo(first.name)}. 고기보다 ${first.cat === 'grain' ? '곡물' : '콩류'}로 더 많이 채웠다는 뜻이에요.` });
    }
  }

  /* 상위 5개 중 동물성 비중 */
  const top = ingr.filter(i => i.main);
  const animal = top.filter(i => ['meat', 'fish', 'organ'].includes(i.cat)).length;
  if (top.length >= 3 && animal >= 3) {
    pos.push({ icon: '💪', category: 'ingredient_quality',
      title: '주원료 대부분이 동물성이에요',
      body: `상위 ${top.length}개 중 ${animal}개가 고기·생선이에요.` });
  }

  /* 출처가 불투명한 원료.
     고기인데 어떤 동물인지 안 밝힌 건 위험으로, 곡물·식물성 충전재의 품목 미표기는
     주의로 나눈다. 둘을 같은 무게로 다루면 경고가 무뎌진다. */
  const opaqueMeat = ingr.filter(i => ['meat', 'fish', 'organ'].includes(i.cat) && i.safe === 'danger');
  if (opaqueMeat.length) {
    dan.push({ icon: '🚨', category: 'ingredient_quality',
      title: '출처가 불투명한 고기 원료가 있어요',
      body: `${opaqueMeat.map(v => v.name).join(', ')} — 어떤 동물의 어느 부위인지 표기되지 않았어요.` });
  }
  const opaquePlant = ingr.filter(i => i.warn === '원료 추적 불가' && !opaqueMeat.includes(i));
  if (opaquePlant.length) {
    cau.push({ icon: '🔍', category: 'ingredient_quality',
      title: '품목이 밝혀지지 않은 원료가 있어요',
      body: `${opaquePlant.map(v => v.name).join(', ')} — 어떤 곡물·식물인지 표기되지 않아 알러지 원인을 추적하기 어려워요.` });
  }

  /* 탄수화물 */
  const c = nutrient.dmCarb;
  if (c != null) {
    if (c <= 25) pos.push({ icon: '📉', category: 'carb_level',
      title: `탄수화물이 낮아요 (${pct(c)} 추정)`, body: '건물기준 25% 이하로 낮은 편이에요.' });
    else if (c <= 35) pos.push({ icon: '📊', category: 'carb_level',
      title: `탄수화물이 적당해요 (${pct(c)} 추정)`, body: '건물기준 25~35% 수준이에요.' });
    else if (c <= 44) cau.push({ icon: '📊', category: 'carb_level',
      title: `탄수화물이 조금 높아요 (${pct(c)} 추정)`, body: '건물기준 35~44% 수준이에요.' });
    else if (c <= 56) cau.push({ icon: '📊', category: 'carb_level',
      title: `탄수화물이 높아요 (${pct(c)} 추정)`, body: '건물기준 44~56% 수준이에요. 체중 관리가 필요한 아이는 주의하세요.' });
    else cau.push({ icon: '⚠️', category: 'carb_level',
      title: `탄수화물이 매우 높아요 (${pct(c)} 추정)`, body: '건물기준 56%를 넘어요. 곡물 비중이 큰 사료예요.' });
  }

  /* 단백질 */
  const pr = nutrient.protein;
  if (pr != null) {
    if (pr >= 32) pos.push({ icon: '🍖', category: 'nutrition_balance',
      title: `조단백이 높아요 (${pct(pr)})`, body: '프리미엄 사료 기준(28% 이상)을 넘어요.' });
    else if (pr < 18) cau.push({ icon: '🍖', category: 'nutrition_balance',
      title: `조단백이 낮아요 (${pct(pr)})`, body: 'AAFCO 성견 권장 최소치(18%)에 못 미쳐요.' });
  }

  /* 첨가물 */
  /* 출처 불투명한 고기는 위에서 따로 말했다. 여기서는 첨가물 쪽만 센다 —
     같은 원료로 카드를 두 장 만들면 실제보다 위험해 보인다. */
  const dangerIngr = ingr.filter(i => i.safe === 'danger' && !opaqueMeat.includes(i));
  if (dangerIngr.length) {
    dan.push({ icon: '☠️', category: 'additive_safety',
      title: `위험 성분 ${dangerIngr.length}개 포함`,
      body: `${dangerIngr.map(i => i.name).join(', ')} — 장기 급여 시 위험이 보고된 성분이에요.` });
  }
  const cautionN = facts?.cautionN ?? dist.caution;
  if (cautionN === 0 && !dangerIngr.length) {
    pos.push({ icon: '✅', category: 'additive_safety',
      title: '주의 성분이 없어요', body: '충전재·불명확한 첨가물이 확인되지 않았어요.' });
  } else if (cautionN >= 5) {
    cau.push({ icon: '⚡', category: 'additive_safety',
      title: `주의 성분 ${cautionN}개 포함`,
      body: '곡물 충전재·향미제 등 주의해서 볼 원료가 많은 편이에요.' });
  }

  /* 가성비 */
  const pKg = price?.pKg;
  if (pKg != null) {
    const man = Math.round(pKg / 100) / 100;
    if (pKg <= 10000) pos.push({ icon: '💰', category: 'price_value',
      title: `가성비가 좋아요 (kg당 ${pKg.toLocaleString('ko-KR')}원)`, body: 'kg당 1만원 이하예요.' });
    else if (pKg > 45000) cau.push({ icon: '💸', category: 'price_value',
      title: `가격이 높아요 (kg당 ${man}만원)`, body: 'kg당 4.5만원을 넘어요.' });
  }

  /* 기능성 */
  for (const [k, arr] of Object.entries(funcIngr)) {
    const proven = arr.filter(x => x.ev === 'proven');
    if (!proven.length) continue;
    pos.push({ icon: '🌿', category: 'functional_benefit',
      title: `${FUNC_LABEL[k] ?? k}에 도움되는 원료가 있어요`,
      body: `${proven.map(x => x.n).join(', ')} — 근거가 확인된 원료예요.` });
  }

  /* 모르는 원료가 많으면 그대로 말한다 */
  if (dist.unknown >= 3) {
    cau.push({ icon: '❓', category: 'ingredient_quality',
      title: `분류하지 못한 원료 ${dist.unknown}개`,
      body: '사전에 없는 원료라 안전성을 판단하지 않았어요.' });
  }
  return { pos, cau, dan };
}

/* ── 이런 아이에게 어떨까요 ────────────────────────────── */
export function deriveFit({ nutrient, ingr, dist, funcIngr }) {
  const fit = [], cau = [];
  const has = k => (funcIngr[k] ?? []).length > 0;
  const c = nutrient.dmCarb, fatV = nutrient.fat, pr = nutrient.protein;

  if (has('eye_tear')) fit.push({ concernType: 'eye_tear', label: '눈물·피부에 도움되는 원료가 들어있어요' });
  if (has('joint')) fit.push({ concernType: 'joint', label: '관절에 도움되는 원료가 들어있어요' });
  if (has('digestive')) fit.push({ concernType: 'digestive', label: '소화하기 좋은 원료 구성이에요' });
  if (has('immune')) fit.push({ concernType: 'immune', label: '면역에 도움되는 원료가 들어있어요' });
  if (has('kidney')) fit.push({ concernType: 'kidney', label: '신장 케어에 쓰이는 원료가 들어있어요' });
  if (has('liver')) fit.push({ concernType: 'liver', label: '간 건강에 쓰이는 원료가 들어있어요' });

  if (c != null && c <= 30 && dist.danger === 0)
    fit.push({ concernType: 'healthy', label: '탄수화물이 낮고 위험 성분이 없어요' });
  if (pr != null && pr >= 28)
    fit.push({ concernType: 'post_surgery', label: '단백질이 높아 회복기에 도움이 될 수 있어요' });

  if (c != null && c >= 45)
    cau.push({ concernType: 'weight', label: '탄수화물이 높아 체중 관리가 필요한 아이는 주의가 필요해요' });
  else if (fatV != null && fatV >= 18)
    cau.push({ concernType: 'weight', label: '지방이 높아 체중 관리가 필요한 아이는 주의가 필요해요' });

  const allergens = ingr.filter(i => i.allergen);
  if (allergens.length)
    cau.push({ concernType: 'allergy',
      label: `${allergens.slice(0, 3).map(i => i.name).join('·')} 같은 알러지 유발 가능 원료가 있어요` });

  if (dist.danger > 0)
    cau.push({ concernType: 'healthy', label: '위험 성분이 있어 장기 급여는 권하지 않아요' });

  const salt = ingr.some(i => i.name.includes('소금') || i.name.includes('염'));
  if (salt && pr != null && pr >= 30)
    cau.push({ concernType: 'kidney', label: '단백질과 나트륨이 있어 신장이 약한 아이는 상담이 필요해요' });

  return { fit, fitCaution: cau };
}

/* ── 한 번에 ───────────────────────────────────────────── */
export function deriveDetail({ ga, ingredients, facts, price, weightOptions, rxInfo }) {
  const nutrient = deriveNutrient(ga ?? {});
  const ingr = deriveIngredients(ingredients ?? []);
  const dist = deriveDist(ingr);
  const funcIngr = deriveFuncIngr(ingredients ?? []);
  const verdict = deriveVerdict({ nutrient, ingr, dist, funcIngr, price, facts });
  const { fit, fitCaution } = deriveFit({ nutrient, ingr, dist, funcIngr });

  const opts = (weightOptions ?? (price?.wgOptions ?? []))
    .slice().sort((a, b) => a - b)
    .map(g => ({ g, label: g >= 1000 ? `${Math.round(g / 100) / 10}kg` : `${g}g` }));

  return {
    rxInfo: rxInfo ?? null,
    weightOpts: opts,
    verdict, nutrient, ingr, funcIngr, dist,
    fit, fitCaution,
    prices: price?.p > 0
      ? [{ wg: price.wg, shop: price.shop, price: price.p, pKg: price.pKg,
           url: price.buyUrl ?? null, avail: true }]
      : [],
    recall: null
  };
}
