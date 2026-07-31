/* balsatang/ 의 웹 자산을 www/ 로 복사한다.
   원본을 한 곳(balsatang/)에만 두기 위해 복사 방식을 쓴다 — 웹과 앱이 같은 코드를 공유. */
import { cp, rm, mkdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../balsatang');
const OUT = resolve(here, 'www');
/* 어드민은 앱에 포함하지 않는다 — 스토어 심사에서 불필요한 관리 기능은 감점 요인. */
const EXCLUDE = new Set(['admin']);

try {
  await access(SRC);
} catch {
  console.error(`[sync-web] 원본을 찾을 수 없습니다: ${SRC}`);
  process.exit(1);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await cp(SRC, OUT, {
  recursive: true,
  filter: (src) => !EXCLUDE.has(src.slice(SRC.length + 1).split('/')[0])
});
console.log(`[sync-web] ${SRC} → ${OUT} (제외: ${[...EXCLUDE].join(', ') || '없음'})`);
