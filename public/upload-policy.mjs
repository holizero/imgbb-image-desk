export const uploadBatch = queue => queue.filter(item => item.state === 'waiting');
export function failureState(error) { return error.uncertain === false ? 'failed' : 'uncertain'; }
export function retryItem(item, confirmed) {
  if (!['failed', 'uncertain'].includes(item.state) || (item.state === 'uncertain' && !confirmed)) return false;
  item.state = 'waiting'; item.message = '사용자가 재시도 예약함'; return true;
}
