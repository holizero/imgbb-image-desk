import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadBatch, failureState, retryItem } from '../public/upload-policy.mjs';
import launcher from '../launcher.cjs';
test('새 파일을 전송해도 이전 실패·응답 불명 항목을 섞지 않는다', () => {
  const queue = [{state:'uncertain'}, {state:'failed'}, {state:'done'}, {state:'waiting',id:'new'}];
  assert.deepEqual(uploadBatch(queue).map(x=>x.id),['new']);
});
test('통신 단절·시간 초과·응답 해석 실패는 불확실로 남긴다', () => {
  for (const error of [new TypeError('Failed to fetch'),new DOMException('timeout','TimeoutError'),new SyntaxError('invalid json')]) assert.equal(failureState(error),'uncertain');
  assert.equal(failureState({uncertain:false}),'failed');
});
test('응답 불명 항목은 확인하기 전까지 재시도할 수 없다', () => {
  const item={state:'uncertain'};
  assert.equal(retryItem(item,false),false); assert.equal(item.state,'uncertain');
  assert.equal(retryItem(item,true),true); assert.equal(uploadBatch([item]).length,1);
  assert.equal(retryItem({state:'uploading'},true),false);
});
test('런처는 Node 18·20을 거부하고 22 이상을 허용한다', () => {
  for(const version of ['v18.20.8','v20.19.0','invalid'])assert.equal(launcher.supportsNode(version),false);
  for(const version of ['v22.0.0','v24.0.0','v25.9.0'])assert.equal(launcher.supportsNode(version),true);
});
