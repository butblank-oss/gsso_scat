/* 채점 기준. AI가 아니라 코드가 점수를 매긴다.
   수집 AI의 일은 "사실을 출처와 함께 뽑아오는 것"까지고, 점수는 여기서 계산한다.
   기준 근거는 docs/DATA-POLICY.md 4장 참고. */

/* 탄수화물 — 건물기준 탄수(%). 낮을수록 좋다. */
export function rateCarb(dmCarb) {
  if (dmCarb == null) return null;
  if (dmCarb <= 25) return 5;
  if (dmCarb <= 35) return 4;
  if (dmCarb <= 44) return 3;
  if (dmCarb <= 56) return 2;
  return 1;
}

/* 원료 — 조단백(%)이 기준. 다만 1번 원료가 곡물이면 3점을 넘지 못한다. */
export function rateQuality(protein, firstIngrCat) {
  if (protein == null) return null;
  let s = protein >= 32 ? 5 : protein >= 25 ? 4 : protein >= 16 ? 3 : 2;
  if (firstIngrCat === 'grain') s = Math.min(s, 3);
  return s;
}

/* 첨가물 — 주의 성분 개수. 위험 성분이 하나라도 있으면 3점을 넘지 못한다. */
export function rateAdditive(cautionN, dangerN) {
  if (cautionN == null) return null;
  let s = cautionN === 0 ? 5 : cautionN <= 2 ? 4 : cautionN <= 4 ? 3 : 2;
  if ((dangerN ?? 0) > 0) s = Math.min(s, 3);
  return s;
}

/* 가성비 — kg당 가격(원). 타입과 무관한 절대 구간.
   구간은 기존 41종의 채점을 최대한 재현하도록 맞췄다(90% 일치). */
export function rateValue(pKg) {
  if (pKg == null) return null;
  if (pKg <= 10000) return 5;
  if (pKg <= 16000) return 4;
  if (pKg <= 32000) return 3;
  if (pKg <= 45000) return 2;
  return 1;
}

/* 사실(facts)에서 ratings 전체를 계산한다.
   facts = { dmCarb, protein, firstIngrCat, cautionN, dangerN, pKg } */
export function rateAll(facts) {
  /* pKg 가 없으면 value 는 null 이 된다. 가격 확보 전에도 나머지 3개는 채점된다. */
  return {
    quality: rateQuality(facts.protein, facts.firstIngrCat),
    carb: rateCarb(facts.dmCarb),
    additive: rateAdditive(facts.cautionN, facts.dangerN),
    value: rateValue(facts.pKg)
  };
}

/* 게이트가 쓰는 설명문 — 왜 이 점수인지 사람에게 보여준다. */
export const RUBRIC_TEXT = {
  quality: '조단백 32%↑=5, 25%↑=4, 16%↑=3, 그 미만=2. 1번 원료가 곡물이면 최대 3점',
  carb: '건물기준 탄수 25%↓=5, 35%↓=4, 44%↓=3, 56%↓=2, 초과=1',
  additive: '주의 성분 0개=5, 1~2개=4, 3~4개=3, 5개↑=2. 위험 성분 있으면 최대 3점',
  value: 'kg당 1만원↓=5, 1.6만원↓=4, 3.2만원↓=3, 4.5만원↓=2, 초과=1'
};

/* 사실 항목의 필수 키 — 이게 없으면 채점을 검증할 수 없다. */
export const REQUIRED_FACT_KEYS = ['dmCarb', 'protein', 'firstIngrCat', 'cautionN', 'dangerN'];

/* 건물기준 탄수 계산. 기존 41종이 쓰는 방식과 동일하게 조회분은 제외한다
   (41종 중 34종이 조회분 미표기이고, 표기된 건도 계산에 반영되지 않았다).
   조회분을 빼면 dmCarb 가 약 9%p 낮아져 루브릭 경계가 어긋난다. */
export function computeDmCarb({ protein, fat, fiber, moisture }) {
  if ([protein, fat, fiber, moisture].some(v => v == null)) return null;
  const carb = 100 - (protein + fat + fiber + moisture);
  return Math.round((carb / (100 - moisture)) * 1000) / 10;
}
