const { spawn } = require('node:child_process');
const path = require('node:path');
function supportsNode(version) {
  return /^v?\d+\.\d+\.\d+/.test(version) && Number(version.replace(/^v/, '').split('.')[0]) >= 22;
}
module.exports = { supportsNode };
if (require.main === module) {
  if (!supportsNode(process.version)) {
    console.error('Node.js 22 이상이 필요합니다. 현재 버전: ' + process.version + '\nhttps://nodejs.org/ko 에서 설치한 뒤 다시 실행하세요.');
    process.exitCode = 1;
  } else if (process.argv.includes('--check')) {
    console.log('실행 환경 확인 완료: ' + process.version);
  } else {
    const child = spawn(process.execPath, [path.join(__dirname, 'server.mjs'), '--open'], { stdio: 'inherit', windowsHide: true });
    child.on('error', () => { console.error('앱을 실행하지 못했습니다. 압축을 모두 풀었는지 확인하세요.'); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
  }
}
