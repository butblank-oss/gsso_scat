#!/usr/bin/env node
/* 게이트 1 — 기계 검사.
   AI 판단이 아니라 코드가 참·거짓을 판정한다. 하나라도 실패하면 그 항목은 탈락.

   사용:
     node scripts/gate1-validate.mjs                 형식·수식·출처 구조만 검사
     node scripts/gate1-validate.mjs --live          출처 URL 실제 접속까지 검사
     node scripts/gate1-validate.mjs --json out.json 결과를 파일로 저장
*/
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENUM, SOURCE_GRADE, computeScore, PRICE_KG, TTL_DAYS, daysSince,
  REQUIRED_ITEM_FIELDS, REQUIRED_FOOD_FIELDS, REQUIRED_RATING_KEYS, isHttpUrl, norm, loadFoods
} from './lib/schema.mjs';
import { rateAll, RUBRIC_TEXT, REQUIRED_FACT_KEYS } from './lib/rubric.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STAGING = join(ROOT, 'data/staging');
const LIVE = process.argv.includes('--live');
const jsonAt = process.argv.indexOf('--json');


function checkItem(item, published, seen) {
  const fail = [];
  const warn = [];
  const F = (code, msg) => fail.push({ code, msg });
  const W = (code, msg) => warn.push({ code, msg });

  for (const k of REQUIRED_ITEM_FIELDS) {
    if (item[k] == null) F('E_ITEM_FIELD', `항목 필드 누락: ${k}`);
  }
  if (fail.length) return { fail, warn };

  const p = item.proposed;
  const srcs = item.sources;
  const ev = item.evidence;

  /* --- 1. 필수 필드 --- */
  for (const k of REQUIRED_FOOD_FIELDS) {
    if (p[k] == null) F('E_FIELD', `사료 필드 누락: ${k}`);
  }

  /* --- 2. enum --- */
  const single = { type: p.type, country: p.country, ico: p.ico };
  for (const [k, v] of Object.entries(single)) {
    if (v != null && !ENUM[k].includes(v)) F('E_ENUM', `${k} 허용값 아님: ${v}`);
  }
  for (const k of ['ages', 'sizes', 'func', 'concerns']) {
    if (!Array.isArray(p[k])) { F('E_ENUM', `${k} 는 배열이어야 합니다`); continue; }
    for (const v of p[k]) if (!ENUM[k].includes(v)) F('E_ENUM', `${k} 허용값 아님: ${v}`);
  }
  if (p.price && p.price.shop && !ENUM.shop.includes(p.price.shop)) {
    F('E_ENUM', `shop 허용값 아님: ${p.price.shop}`);
  }
  if (typeof p.rx !== 'boolean') F('E_TYPE', 'rx 는 true/false 여야 합니다');

  /* --- 3. ratings --- */
  for (const k of REQUIRED_RATING_KEYS) {
    const v = p.ratings?.[k];
    if (!Number.isInteger(v) || v < 1 || v > 5) F('E_RATING', `ratings.${k} 는 1~5 정수여야 합니다 (현재: ${v})`);
  }

  /* --- 3.5 ratings 도 계산값이어야 한다 —
     AI는 사실(facts)만 뽑고, 점수는 루브릭이 매긴다. 제출값이 다르면 탈락. --- */
  const facts = p.facts;
  if (!facts) {
    F('E_FACTS_NONE', 'facts 가 없습니다 — 채점을 검증할 수 없습니다');
  } else {
    for (const k of REQUIRED_FACT_KEYS) {
      if (facts[k] == null) F('E_FACTS', `facts.${k} 누락 — 채점 검증에 필요합니다`);
    }
    const expect = rateAll({ ...facts, pKg: p.price?.pKg });
    for (const k of REQUIRED_RATING_KEYS) {
      if (expect[k] == null) continue;
      if (p.ratings?.[k] !== expect[k]) {
        F('E_RATING_RUBRIC',
          `ratings.${k} 가 채점 기준과 다릅니다. 제출 ${p.ratings?.[k]} / 기준 ${expect[k]} — ${RUBRIC_TEXT[k]}`);
      }
    }
  }

  /* --- 4. score 는 계산값이어야 한다 (AI가 매기면 안 됨) --- */
  if (p.ratings && REQUIRED_RATING_KEYS.every(k => Number.isInteger(p.ratings[k]))) {
    const expect = computeScore(p.ratings);
    if (p.score != null && Math.abs(p.score - expect) > 0.05) {
      F('E_SCORE', `score 가 공식과 다릅니다. 제출 ${p.score} / 계산 ${expect}`);
    }
  }

  /* --- 5. 가격 수식과 범위 --- */
  const pr = p.price || {};
  if (!(pr.p > 0)) F('E_PRICE', `가격이 유효하지 않습니다: ${pr.p}`);
  if (!(pr.wg > 0)) F('E_PRICE', `중량(g)이 유효하지 않습니다: ${pr.wg}`);
  if (pr.p > 0 && pr.wg > 0) {
    const expect = Math.round(pr.p / (pr.wg / 1000));
    if (pr.pKg != null && Math.abs(pr.pKg - expect) / expect > 0.01) {
      F('E_PRICE_CALC', `pKg 계산 불일치. 제출 ${pr.pKg} / 계산 ${expect}`);
    }
    if (expect < PRICE_KG.min || expect > PRICE_KG.max) {
      F('E_PRICE_RANGE', `kg당 ${expect.toLocaleString()}원 — 상식 범위(${PRICE_KG.min.toLocaleString()}~${PRICE_KG.max.toLocaleString()}) 밖입니다`);
    }
  }

  /* --- 6. 출처 구조 --- */
  if (!Array.isArray(srcs) || srcs.length === 0) {
    F('E_SRC_NONE', '출처가 없습니다');
  } else {
    srcs.forEach((s, i) => {
      if (!ENUM.sourceRole.includes(s.role)) F('E_SRC_ROLE', `sources[${i}].role 허용값 아님: ${s.role}`);
      if (!isHttpUrl(s.url)) F('E_SRC_URL', `sources[${i}].url 형식 오류: ${s.url}`);
      if (!s.fetchedAt) F('E_SRC_DATE', `sources[${i}] 확인 시각 누락`);
    });
    /* 성분 근거: A등급 1곳 이상, 없으면 B등급 2곳 이상 — DATA-POLICY 3.2 */
    const gA = srcs.filter(s => SOURCE_GRADE[s.role] === 'A').length;
    const gB = srcs.filter(s => SOURCE_GRADE[s.role] === 'B').length;
    if (gA < 1 && gB < 2) {
      F('E_SRC_GRADE', `성분 근거 부족 — A등급 ${gA}곳, B등급 ${gB}곳 (A 1곳 또는 B 2곳 필요)`);
    }
    /* 가격 근거: 판매처 1곳 */
    if (!srcs.some(s => s.role === 'retail')) F('E_SRC_PRICE', '가격 근거(판매처 출처)가 없습니다');

    /* 유효기간 */
    for (const s of srcs) {
      if (!s.fetchedAt) continue;
      const age = daysSince(s.fetchedAt);
      const ttl = s.role === 'retail' ? TTL_DAYS.price : TTL_DAYS.spec;
      if (age > ttl) W('W_STALE', `sources[${srcs.indexOf(s)}] 확인일이 ${Math.floor(age)}일 지났습니다 (유효 ${ttl}일)`);
    }
  }

  /* --- 7. 근거 인용 — 값마다 어느 출처의 어느 문장인지 --- */
  const needEvidence = [...REQUIRED_FACT_KEYS.map(k => `facts.${k}`), 'price.p'];
  for (const key of needEvidence) {
    const e = ev?.[key];
    if (!e) { F('E_EV_NONE', `근거 누락: ${key}`); continue; }
    if (!Number.isInteger(e.src) || !srcs?.[e.src]) F('E_EV_SRC', `${key} 의 출처 번호가 잘못됨: ${e.src}`);
    if (!e.quote || String(e.quote).trim().length < 2) F('E_EV_QUOTE', `${key} 의 인용문이 비어 있습니다`);
  }

  /* --- 8. 중복 --- */
  const key = norm(p.brand) + '|' + norm(p.name);
  if (published.some(f => norm(f.brand) + '|' + norm(f.name) === key)) {
    F('E_DUP', `이미 등록된 사료입니다: ${p.brand} ${p.name}`);
  }
  if (seen.has(key)) F('E_DUP_BATCH', `같은 배치 안에서 중복: ${p.brand} ${p.name}`);
  seen.add(key);

  return { fail, warn };
}

/* 출처 URL이 살아 있는지, 그 페이지에 브랜드명이 실제로 있는지 확인한다. */
async function checkLive(item) {
  const fail = [];
  for (const [i, s] of (item.sources || []).entries()) {
    if (!isHttpUrl(s.url)) continue;
    try {
      const res = await fetch(s.url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (!res.ok) { fail.push({ code: 'E_URL_DEAD', msg: `sources[${i}] HTTP ${res.status}: ${s.url}` }); continue; }
      const body = (await res.text()).toLowerCase();
      const brand = norm(item.proposed?.brand);
      if (brand && !norm(body).includes(brand)) {
        fail.push({ code: 'E_URL_BRAND', msg: `sources[${i}] 페이지에 브랜드명("${item.proposed.brand}")이 없습니다: ${s.url}` });
      }
    } catch (err) {
      fail.push({ code: 'E_URL_FETCH', msg: `sources[${i}] 접속 실패 (${err.name}): ${s.url}` });
    }
  }
  return fail;
}

/* --- 실행 --- */
const { all: published } = await loadFoods(ROOT);
let files = [];
try {
  files = (await readdir(STAGING)).filter(f => f.endsWith('.json') && !f.startsWith('_'));
} catch { /* 폴더 없음 = 검사할 것 없음 */ }

const report = { checkedAt: new Date().toISOString(), live: LIVE, batches: [], pass: 0, failCount: 0 };
const seen = new Set();

for (const file of files) {
  const batch = JSON.parse(await readFile(join(STAGING, file), 'utf-8'));
  const out = { file, batchId: batch.batchId ?? null, items: [] };
  for (const item of batch.items ?? []) {
    const { fail, warn } = checkItem(item, published, seen);
    if (LIVE && fail.length === 0) fail.push(...await checkLive(item));
    const ok = fail.length === 0;
    out.items.push({
      stagingId: item.stagingId,
      label: `${item.proposed?.brand ?? '?'} ${item.proposed?.name ?? '?'}`,
      gate1: ok ? 'pass' : 'fail',
      fail, warn
    });
    ok ? report.pass++ : report.failCount++;
  }
  report.batches.push(out);
}

/* --- 출력 --- */
const line = '─'.repeat(60);
console.log(`\n게이트 1 · 기계 검사${LIVE ? ' (URL 실접속 포함)' : ''}`);
console.log(line);
if (!report.batches.length) console.log('검사할 스테이징 파일이 없습니다.');
for (const b of report.batches) {
  console.log(`\n[${b.file}]`);
  for (const it of b.items) {
    console.log(`  ${it.gate1 === 'pass' ? '✅' : '❌'} ${it.label}`);
    for (const f of it.fail) console.log(`       ✗ ${f.msg}`);
    for (const w of it.warn) console.log(`       ⚠ ${w.msg}`);
  }
}
console.log(`\n${line}\n통과 ${report.pass} · 탈락 ${report.failCount}\n`);

if (jsonAt > -1 && process.argv[jsonAt + 1]) {
  await writeFile(process.argv[jsonAt + 1], JSON.stringify(report, null, 2));
}
process.exit(report.failCount > 0 ? 1 : 0);
