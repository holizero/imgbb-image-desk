import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server.mjs';

async function withServer(run, upload) {
  const server = createApp({ upload }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try { await run(origin); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
function form(key = 'a'.repeat(32), type = 'image/png') { const data = new FormData(); data.set('key', key); data.set('image', new File([new Uint8Array([137, 80, 78, 71])], '한글 이미지.png', { type })); return data; }
test('첫 화면, 보안 헤더 및 임의 파일 접근 차단', async () => withServer(async origin => {
  const response = await fetch(origin); assert.equal(response.status, 200); assert.match(await response.text(), /이미지 서랍/); assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await fetch(`${origin}/server.mjs`)).status, 404);
  const status = await new Promise((resolve, reject) => { http.get(origin, { headers: { host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject); });
  assert.equal(status, 403);
}));
test('유효한 multipart 이미지, 키와 자동 삭제 기간을 전달', async () => {
  let called = false;
  await withServer(async origin => {
    const data = form(); data.set('expiration', '600');
    const response = await fetch(`${origin}/api/upload`, { method: 'POST', headers: { origin }, body: data });
    assert.equal(response.status, 200); assert.equal((await response.json()).data.id, 'abc'); assert.equal(called, true);
  }, async data => { called = true; assert.equal(data.get('key'), 'a'.repeat(32)); assert.equal(data.get('expiration'), '600'); assert.equal(data.get('image').name, '한글 이미지.png'); return Response.json({ success: true, data: { id: 'abc' } }); });
});
test('외부 출처, 잘못된 키·파일·자동 삭제 기간은 ImgBB 전송 전에 차단', async () => withServer(async origin => {
  const send = (data, source = origin) => fetch(`${origin}/api/upload`, { method: 'POST', headers: { origin: source }, body: data });
  assert.equal((await send(form(), 'https://evil.example')).status, 403);
  assert.equal((await send(form('bad'))).status, 400);
  assert.equal((await send(form('a'.repeat(32), 'text/html'))).status, 400);
  const data = form(); data.set('expiration', '59'); assert.equal((await send(data)).status, 400);
}, () => { assert.fail('잘못된 요청은 전송하지 않아야 함'); }));
test('초과 크기 이미지 차단', async () => withServer(async origin => {
  const data = form(); data.set('image', new File([new Uint8Array(32 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }));
  assert.equal((await fetch(`${origin}/api/upload`, { method: 'POST', headers: { origin }, body: data })).status, 413);
}, () => { assert.fail('초과 크기 파일은 전송하지 않아야 함'); }));
test('API 키와 서버 내부 오류를 응답에 노출하지 않음', async () => withServer(async origin => {
  const response = await fetch(`${origin}/api/upload`, { method: 'POST', headers: { origin }, body: form() });
  assert.equal(response.status, 502); const text = await response.text(); assert.doesNotMatch(text, /secret/); assert.match(text, /네트워크/);
}, () => { throw Error('secret key in upstream URL'); }));
test('ImgBB 요청 제한을 사용자가 이해할 수 있는 오류로 전달', async () => withServer(async origin => {
  const response = await fetch(`${origin}/api/upload`, { method: 'POST', headers: { origin }, body: form() });
  assert.equal(response.status, 429); assert.match((await response.json()).error, /요청이 많습니다/);
}, () => Response.json({ success: false }, { status: 429 })));

test('전송 후 응답 단절은 결과 불명으로 표시하며 키를 노출하지 않는다', async () => withServer(async origin => {
  const response=await fetch(`${origin}/api/upload`,{method:'POST',headers:{origin},body:form()});
  const result=await response.json(); assert.equal(result.uncertain,true); assert.equal(response.status,502); assert.ok(!JSON.stringify(result).includes('secret'));
},()=>{throw new TypeError('secret upstream disconnected');}));

test('재시도 정책 모듈 제공 및 명확한 요청 제한 응답은 결과 불명으로 분류하지 않는다', async () => withServer(async origin => {
  const module=await fetch(`${origin}/upload-policy.mjs`);assert.equal(module.status,200);assert.match(module.headers.get('content-type'),/javascript/);
  const response=await fetch(`${origin}/api/upload`,{method:'POST',headers:{origin},body:form()});
  assert.equal((await response.json()).uncertain,false);
},()=>Response.json({success:false},{status:429})));
