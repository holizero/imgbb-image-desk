import { uploadBatch, failureState, retryItem } from './upload-policy.mjs';
const $ = (selector) => document.querySelector(selector);
const HISTORY = 'image-desk.history.v1', KEY = 'image-desk.key.v1';
let records = [], apiKey = '', queue = [], view = 'all', busy = false, selected = new Set(), toastTimer, storageFailed = false;
const allowedTypes = /^image\/(jpeg|png|gif|webp|bmp|x-bmp|x-ms-bmp|tiff|avif|heic|heif)$/;
const icon = (name) => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); const use = document.createElementNS(svg.namespaceURI, 'use'); use.setAttribute('href', `#i-${name}`); svg.append(use); return svg; };
function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function button(text, className, action, symbol) { const node = el('button', className); node.type = 'button'; if (symbol) node.append(icon(symbol)); if (text) node.append(document.createTextNode(text)); node.onclick = action; return node; }
function toast(message, error = false) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').className = error ? 'error' : ''; $('#toast').hidden = false; toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5500); }
function safeURL(value, hosts) { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && hosts.includes(url.hostname) ? url.href : ''; } catch { return ''; } }
function normalizeRecord(item) {
  if (!item || typeof item !== 'object') return null;
  const url = safeURL(item.url, ['i.ibb.co']);
  if (!url || typeof item.id !== 'string' || !/^[\w-]{1,100}$/.test(item.id)) return null;
  return { id: item.id, name: String(item.name || '이름 없는 이미지').slice(0, 250), url, thumb: safeURL(item.thumb, ['i.ibb.co']) || url, viewer: safeURL(item.viewer, ['ibb.co']), deleteUrl: safeURL(item.deleteUrl, ['ibb.co']), size: Math.max(0, Number(item.size) || 0), width: Math.max(0, Number(item.width) || 0), height: Math.max(0, Number(item.height) || 0), createdAt: Number.isFinite(item.createdAt) && item.createdAt > 0 && item.createdAt < 8640000000000000 ? item.createdAt : Date.now(), expiration: Math.max(0, Number(item.expiration) || 0), favorite: item.favorite === true };
}
try { const saved = JSON.parse(localStorage.getItem(HISTORY) || '[]'); if (!Array.isArray(saved)) throw Error(); records = saved.map(normalizeRecord).filter(Boolean); apiKey = sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || ''; $('#remember-key').checked = !!localStorage.getItem(KEY); } catch { toast('브라우저 저장소를 읽지 못했습니다. 설정에서 백업을 복원할 수 있습니다.', true); }
function persist() { try { localStorage.setItem(HISTORY, JSON.stringify(records)); storageFailed = false; return true; } catch { storageFailed = true; toast('브라우저에 이력을 저장하지 못했습니다. 창을 닫기 전에 백업을 내보내 주세요.', true); return false; } }
const bytes = (size) => size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
const date = (value) => new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
function updateKeyStatus() { $('#key-status').classList.toggle('ready', !!apiKey); $('#key-status span:last-child').textContent = apiKey ? 'API 키 설정됨' : 'API 키 설정 필요'; }
function openSettings() { $('#api-key').value = apiKey; $('#settings-dialog').showModal(); }
async function copy(text) { try { await navigator.clipboard.writeText(text); toast('클립보드에 복사했습니다.'); } catch { toast('클립보드에 접근하지 못했습니다. 이미지 상세 화면에서 링크를 직접 복사해 주세요.', true); } }
function linkButton(text, url, className = 'button secondary') { const a = el('a', className, text); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
function render() {
  $('#nav-count').textContent = records.length;
  $('#favorite-count').textContent = records.filter(r => r.favorite).length;
  const term = $('#search').value.trim().toLocaleLowerCase('ko');
  const filtered = records.filter(r => (view !== 'favorites' || r.favorite) && r.name.toLocaleLowerCase('ko').includes(term));
  const sort = $('#sort').value;
  filtered.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'ko') : sort === 'size' ? b.size - a.size : sort === 'oldest' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt);
  $('#image-count').textContent = `${filtered.length}개`;
  $('#storage-summary').textContent = records.length ? `총 ${records.length}개 · ${bytes(records.reduce((s, r) => s + r.size, 0))} 업로드` : '아직 담긴 이미지가 없어요';
  $('#empty').hidden = filtered.length > 0;
  $('#empty h3').textContent = term ? '검색 결과가 없습니다' : view === 'favorites' ? '마음에 드는 이미지를 모아보세요' : '첫 번째 이미지를 담아보세요';
  $('#empty p').textContent = term ? '다른 이미지 이름으로 검색해 보세요.' : view === 'favorites' ? '이미지의 별 버튼을 누르면 여기에 모입니다.' : '업로드한 이미지와 공유 링크가 여기에 모입니다. 위 영역에 이미지를 놓으면 바로 시작할 수 있어요.';
  $('#choose-empty').hidden = !!term || view === 'favorites';
  $('#gallery').replaceChildren();
  for (const item of filtered) {
    const card = el('article', `card${selected.has(item.id) ? ' selected' : ''}`);
    const visual = el('div', 'card-visual');
    const image = el('img', 'card-preview'); image.src = item.thumb; image.alt = item.name; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.tabIndex = 0; image.onclick = () => showDetail(item); image.onkeydown = (event) => { if (event.key === 'Enter') showDetail(item); };
    const checkbox = el('input', 'card-check'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(item.id); checkbox.setAttribute('aria-label', `${item.name} 선택`); checkbox.onchange = () => { if (checkbox.checked) selected.add(item.id); else selected.delete(item.id); render(); };
    const favorite = button('', `icon-button card-favorite${item.favorite ? ' is-favorite' : ''}`, () => { item.favorite = !item.favorite; persist(); render(); }, 'star'); favorite.setAttribute('aria-label', `${item.name} 즐겨찾기 ${item.favorite ? '해제' : '추가'}`); favorite.setAttribute('aria-pressed', String(item.favorite));
    visual.append(image, checkbox, favorite);
    const body = el('div', 'card-body'); const title = el('h3', 'card-title', item.name); title.title = item.name;
    const meta = el('div', 'card-meta'); meta.append(el('span', '', `${bytes(item.size)}${item.width ? ` · ${item.width} × ${item.height}` : ''}`), el('span', '', date(item.createdAt)));
    const bottom = el('div', 'card-bottom'); bottom.append(button('링크 복사', 'text-button copy-card', () => copy(item.url), 'link'), button('상세 보기', 'text-button', () => showDetail(item)));
    body.append(title, meta, bottom); card.append(visual, body); $('#gallery').append(card);
  }
  $('#selection-bar').hidden = !selected.size; $('#selection-count').textContent = `${selected.size}개 선택됨`;
}
function showDetail(item) {
  const container = $('#detail-content'); container.replaceChildren();
  const heading = el('div', 'dialog-heading'); const title = el('h2', '', item.name); const close = button('', 'icon-button', () => $('#detail-dialog').close(), 'close'); close.setAttribute('aria-label', '닫기'); heading.append(title, close);
  const image = el('img', 'detail-image'); image.src = item.url; image.alt = item.name; image.referrerPolicy = 'no-referrer';
  const expires = item.expiration ? ` · 자동 삭제 예정: ${new Date(item.createdAt + item.expiration * 1000).toLocaleString('ko-KR')}` : '';
  const meta = el('p', 'detail-meta', `${bytes(item.size)} · ${item.width} × ${item.height} · ${date(item.createdAt)} 업로드${expires}`);
  const row = el('div', 'link-row'); const format = el('select'); format.setAttribute('aria-label', '링크 형식');
  for (const [value, label] of [['url', '원본 링크'], ['viewer', '공유 페이지'], ['markdown', '마크다운'], ['html', 'HTML'], ['bbcode', '게시판 코드']]) { const option = el('option', '', label); option.value = value; format.append(option); }
  const input = el('input'); input.readOnly = true; input.setAttribute('aria-label', '공유 링크');
  const escapedName = item.name.replace(/[\[\]<>"&]/g, '');
  format.onchange = () => { input.value = format.value === 'markdown' ? `![${escapedName}](${item.url})` : format.value === 'html' ? `<img src="${item.url}" alt="${escapedName}">` : format.value === 'bbcode' ? `[img]${item.url}[/img]` : format.value === 'viewer' ? item.viewer || item.url : item.url; }; format.onchange();
  row.append(format, input, button('복사', 'button primary', () => copy(input.value)));
  const actions = el('div', 'detail-actions'); actions.append(linkButton('원본 열기 ↗', item.url));
  if (item.deleteUrl) actions.append(linkButton('ImgBB 삭제 페이지 ↗', item.deleteUrl));
  actions.append(button('이력에서 삭제', 'text-button danger', () => confirmRemoval([item.id])));
  container.append(heading, image, meta, row, actions, el('p', 'help', 'ImgBB 삭제 페이지에서 서버 이미지를 삭제할 수 있습니다. 이력 삭제는 현재 브라우저 기록만 지웁니다.')); $('#detail-dialog').showModal();
}
let pendingRemoval = [];
function confirmRemoval(ids) { pendingRemoval = ids; $('#confirm-title').textContent = `${ids.length}개 이미지를 이력에서 삭제할까요?`; $('#confirm-dialog').showModal(); }
$('#confirm-no').onclick = () => $('#confirm-dialog').close();
$('#confirm-yes').onclick = () => { records = records.filter(r => !pendingRemoval.includes(r.id)); pendingRemoval.forEach(id => selected.delete(id)); persist(); render(); $('#confirm-dialog').close(); $('#detail-dialog').close(); toast('브라우저의 이력을 삭제했습니다.'); };
function addFiles(files) {
  let invalid = 0, duplicate = 0;
  for (const file of files) {
    if (!allowedTypes.test(file.type) || file.size === 0 || file.size > 32 * 1024 * 1024) { invalid++; continue; }
    if (queue.some(q => q.file.name === file.name && q.file.size === file.size && q.file.lastModified === file.lastModified && q.state !== 'done')) { duplicate++; continue; }
    queue.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), state: 'waiting', message: '업로드 대기 중' });
  }
  if (invalid) toast(`${invalid}개 파일 제외: 지원하는 이미지 형식 및 32MB 이하 파일인지 확인해 주세요.`, true);
  else if (duplicate) toast(`이미 대기 중인 ${duplicate}개 파일은 제외했습니다.`);
  renderQueue(); $('#file-input').value = '';
}
function removeQueue(id) { queue = queue.filter(q => { if (q.id === id) { URL.revokeObjectURL(q.preview); return false; } return true; }); renderQueue(); }
function renderQueue() {
  $('#queue-panel').hidden = !queue.length; $('#queue-count').textContent = `${queue.length}개`; $('#queue-list').replaceChildren();
  for (const item of queue) {
    const row = el('div', 'queue-item'); const image = el('img', 'queue-thumb'); image.src = item.preview; image.alt = '';
    const info = el('div', 'queue-info'); info.append(el('div', 'queue-name', item.file.name), el('div', `queue-state ${item.state}`, `${bytes(item.file.size)} · ${item.message}`)); row.append(image, info);
    if (['failed', 'uncertain'].includes(item.state)) {
      const retry = button(item.state === 'uncertain' ? '확인 후 재시도' : '재시도 예약', 'text-button', () => {
        if (busy) return;
        const confirmed = item.state !== 'uncertain' || window.confirm('ImgBB에서 이 이미지가 업로드되지 않았는지 확인하셨나요? 이미 저장된 이미지를 다시 전송하면 중복 업로드됩니다. 미업로드를 확인한 경우에만 확인을 누르세요.');
        if (retryItem(item, confirmed)) renderQueue();
      });
      retry.disabled = busy; row.append(retry);
    }
    if (item.state !== 'uploading') { const remove = button('', 'icon-button', () => removeQueue(item.id), 'close'); remove.setAttribute('aria-label', `${item.file.name} 대기열에서 제거`); row.append(remove); }
    $('#queue-list').append(row);
  }
  $('#upload-button').disabled = busy || !uploadBatch(queue).length;
  $('#upload-button').lastChild.textContent = busy ? '업로드 중…' : '대기 항목 업로드'; $('#expiration').disabled = busy;
}
$('#upload-button').onclick = async () => {
  if (busy) return;
  if (!apiKey) { openSettings(); toast('API 키를 먼저 설정해 주세요.'); return; }
  busy = true; const batch = uploadBatch(queue); const expiration = $('#expiration').value; const batchKey = apiKey; let succeeded = 0;
  renderQueue();
  for (const item of batch) {
    if (!queue.includes(item)) continue;
    item.state = 'uploading'; item.message = 'ImgBB로 전송 중…'; renderQueue();
    try {
      const form = new FormData(); form.set('key', batchKey); form.set('image', item.file); if (expiration) form.set('expiration', expiration);
      const response = await fetch('/api/upload', { method: 'POST', body: form, signal: AbortSignal.timeout(135000) }); const result = await response.json(); if (!response.ok) { const error = new Error(result.error || '업로드에 실패했습니다.'); error.uncertain = result.uncertain ?? response.status >= 500; throw error; }
      const data = result.data;
      const record = normalizeRecord({ id: data.id, name: item.file.name, url: data.url, thumb: data.thumb?.url || data.display_url, viewer: data.url_viewer, deleteUrl: data.delete_url, size: data.size || item.file.size, width: data.width, height: data.height, createdAt: Number(data.time) * 1000 || Date.now(), expiration: Number(data.expiration) || Number(expiration) || 0 });
      if (!record) throw new Error('ImgBB 응답을 읽지 못했습니다. 서버에서 업로드 여부를 확인해 주세요.');
      records = [record, ...records.filter(r => r.id !== record.id)]; persist(); item.state = 'done'; item.message = '업로드 완료'; succeeded++; render();
    } catch (error) { item.state = failureState(error); item.message = item.state === 'uncertain' ? '결과 확인 필요: ImgBB에서 미업로드를 확인한 뒤 이 항목만 재시도하세요.' : error.message; }
    renderQueue();
  }
  busy = false; renderQueue(); if (storageFailed) toast('업로드 이력을 브라우저에 저장하지 못했습니다. 설정에서 백업을 내보내 주세요.', true); else if (succeeded) toast(`${succeeded}개 이미지를 업로드했습니다.`); else toast('업로드하지 못했습니다. 대기열의 오류 내용을 확인해 주세요.', true);
};
$('#clear-queue').onclick = () => { for (const item of [...queue]) if (item.state === 'done') removeQueue(item.id); };
for (const id of ['choose-top', 'choose-empty']) $(`#${id}`).onclick = () => $('#file-input').click();
$('#file-input').onchange = event => addFiles(event.target.files);
$('#dropzone').onclick = () => $('#file-input').click();
$('#dropzone').onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('#file-input').click(); } };
let dragDepth = 0;
document.addEventListener('dragover', event => event.preventDefault());
document.addEventListener('drop', event => { event.preventDefault(); dragDepth = 0; $('#dropzone').classList.remove('dragging'); if (!document.querySelector('dialog[open]')) addFiles(event.dataTransfer.files); });
$('#dropzone').ondragenter = event => { event.preventDefault(); dragDepth++; $('#dropzone').classList.add('dragging'); };
$('#dropzone').ondragleave = () => { if (--dragDepth <= 0) $('#dropzone').classList.remove('dragging'); };
document.addEventListener('paste', event => { if (document.querySelector('dialog[open]') || ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return; const files = [...(event.clipboardData?.files || [])]; if (files.length) { event.preventDefault(); addFiles(files); } });
document.querySelectorAll('[data-view]').forEach(node => { node.onclick = () => { view = node.dataset.view; selected.clear(); document.querySelectorAll('[data-view]').forEach(n => n.classList.toggle('active', n === node)); $('#page-title').replaceChildren(document.createTextNode(view === 'favorites' ? '즐겨찾기' : '모든 이미지'), el('span', 'title-dot', '.')); render(); }; });
$('#search').oninput = render; $('#sort').onchange = render;
$('#copy-selected').onclick = () => copy(records.filter(r => selected.has(r.id)).map(r => r.url).join('\n'));
$('#remove-selected').onclick = () => confirmRemoval([...selected]);
$('#deselect').onclick = () => { selected.clear(); render(); };
$('#settings-button').onclick = openSettings; $('#key-status').onclick = openSettings;
$('.close-dialog').onclick = () => $('#settings-dialog').close();
$('#toggle-key').onclick = () => { const show = $('#api-key').type === 'password'; $('#api-key').type = show ? 'text' : 'password'; $('#toggle-key').textContent = show ? '숨기기' : '표시'; };
$('#settings-dialog').addEventListener('close', () => { $('#api-key').value = ''; $('#api-key').type = 'password'; $('#toggle-key').textContent = '표시'; });
$('#settings-form').onsubmit = event => {
  event.preventDefault(); const key = $('#api-key').value.trim();
  if (key && !/^[a-fA-F0-9]{32}$/.test(key)) { toast('API 키는 32자리 영문·숫자(16진수)인지 확인해 주세요.', true); return; }
  apiKey = key;
  try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); if (key) ($('#remember-key').checked ? localStorage : sessionStorage).setItem(KEY, key); } catch { toast('API 키를 저장하지 못했습니다. 현재 화면에서만 사용합니다.', true); }
  updateKeyStatus(); $('#settings-dialog').close(); toast(key ? '설정을 저장했습니다. 업로드를 시작해 보세요.' : 'API 키를 지웠습니다.');
};
$('#forget-key').onclick = () => { apiKey = ''; $('#api-key').value = ''; $('#remember-key').checked = false; try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch {} updateKeyStatus(); toast('저장된 API 키를 지웠습니다.'); };
$('#export-button').onclick = () => { const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), images: records }, null, 2)], { type: 'application/json' })); const a = el('a'); a.href = url; a.download = `이미지서랍-백업-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast('백업 파일을 내보냈습니다.'); };
$('#import-button').onclick = () => $('#import-input').click();
$('#import-input').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error('백업 파일은 20MB 이하로 선택해 주세요.');
    const data = JSON.parse(await file.text()); if (data.version !== 1 || !Array.isArray(data.images)) throw new Error('이미지 서랍에서 내보낸 백업 파일을 선택해 주세요.');
    const imported = data.images.map(normalizeRecord); if (imported.some(r => !r)) throw new Error('백업에 올바르지 않은 이미지 정보가 있습니다.');
    const ids = new Set(records.map(r => r.id)); let added = 0; for (const item of imported) { if (!ids.has(item.id)) { records.push(item); ids.add(item.id); added++; } }
    const saved = persist(); render(); if (saved) toast(`${added}개 이력을 가져왔습니다. 중복 항목은 제외했습니다.`);
  } catch (error) { toast(error instanceof SyntaxError ? '올바른 JSON 백업 파일이 아닙니다.' : error.message, true); }
  event.target.value = '';
};
updateKeyStatus(); render();
window.addEventListener('beforeunload', event => { if (busy || queue.some(item => item.state === 'uncertain')) { event.preventDefault(); event.returnValue = ''; } });
