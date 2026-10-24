import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const publicRoot = new URL('./public/', import.meta.url);
const MAX_IMAGE = 32 * 1024 * 1024;
const types = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
types['/upload-policy.mjs'] = ['upload-policy.mjs', 'text/javascript; charset=utf-8'];

export function createApp({ upload = (form, signal) => fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: form, signal }) } = {}) {
  return http.createServer(async (req, res) => {
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || '')) return json(403, { error: '로컬 주소로 접속해 주세요.' });
    if (req.url === '/api/upload' && req.method === 'POST') {
      if (req.headers.origin !== `http://${req.headers.host}`) return json(403, { error: '허용되지 않은 요청입니다.' });
      if (!req.headers['content-type']?.startsWith('multipart/form-data;')) return json(400, { error: '이미지 파일을 선택해 주세요.' });
      let forwarded = false;
      try {
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > MAX_IMAGE + 65536) return json(413, { error: '이미지는 최대 32MB까지 업로드할 수 있습니다.' }); chunks.push(chunk); }
        const form = await new Request('http://localhost', { method: 'POST', headers: { 'content-type': req.headers['content-type'] }, body: Buffer.concat(chunks) }).formData();
        const key = form.get('key'); const file = form.get('image'); const expiration = form.get('expiration');
        if (typeof key !== 'string' || !/^[a-fA-F0-9]{32}$/.test(key)) return json(400, { error: 'API 키는 32자리 영문·숫자(16진수)여야 합니다.' });
        if (!(file instanceof File) || !/^image\/(jpeg|png|gif|webp|bmp|x-bmp|x-ms-bmp|tiff|avif|heic|heif)$/.test(file.type) || file.size === 0) return json(400, { error: '지원하는 이미지 파일을 선택해 주세요.' });
        if (file.size > MAX_IMAGE) return json(413, { error: '이미지는 최대 32MB까지 업로드할 수 있습니다.' });
        if (expiration !== null && (!/^\d+$/.test(expiration) || Number(expiration) < 60 || Number(expiration) > 15552000)) return json(400, { error: '자동 삭제 기간이 올바르지 않습니다.' });
        const outgoing = new FormData(); outgoing.set('key', key); outgoing.set('image', file, file.name); if (expiration) outgoing.set('expiration', expiration);
        forwarded = true;
        const upstream = await upload(outgoing, AbortSignal.timeout(120000));
        const result = await upstream.json();
        if (!upstream.ok || !result.success) return json(upstream.status === 429 ? 429 : 502, { uncertain: upstream.status >= 500 || upstream.ok, error: upstream.status === 429 ? '요청이 많습니다. 잠시 후 다시 시도해 주세요.' : 'ImgBB 업로드에 실패했습니다. API 키와 파일을 확인해 주세요.' });
        return json(200, { data: result.data });
      } catch (error) {
        return json(502, { uncertain: forwarded, error: error.name === 'TimeoutError' ? '업로드 시간이 초과되었습니다. ImgBB에서 업로드 여부를 확인해 주세요.' : '업로드를 완료하지 못했습니다. 네트워크 연결을 확인해 주세요.' });
      }
    }
    if (req.method !== 'GET' || !types[req.url]) return json(404, { error: '페이지를 찾을 수 없습니다.' });
    try {
      const [name, type] = types[req.url];
      res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' blob: data: https://i.ibb.co; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      res.end(await readFile(new URL(name, publicRoot)));
    } catch { json(500, { error: '앱 파일을 읽을 수 없습니다.' }); }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || 3210);
  const server = createApp();
  server.on('error', (error) => { console.error(error.code === 'EADDRINUSE' ? `${port}번 포트가 사용 중입니다. 다른 PORT를 지정해 주세요.` : '서버를 시작하지 못했습니다.'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`이미지 서랍 실행 중: ${url}`);
    if (process.platform === 'win32' && process.argv.includes('--open')) {
      const browser = spawn('explorer.exe', [url], { detached: true, stdio: 'ignore', windowsHide: true });
      browser.on('error', () => console.log(`브라우저에서 ${url} 주소를 열어 주세요.`)); browser.unref();
    }
  });
}
