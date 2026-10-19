import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const proof=JSON.parse(readFileSync(new URL('../data/verified/ajou-2024-points.json',import.meta.url),'utf8'));
function database(file) {
  const html=readFileSync(new URL('../'+file,import.meta.url),'utf8');
  const marker=file==='cumulative.html'?'window.EXAMDB=':'const ALL=';
  return {html,data:JSON.parse(html.split(marker)[1].split(/;\r?\n/)[0])};
}
function scoring(file) {
  const {html,data}=database(file);
  const start=html.indexOf('function ptsInfo(');
  const end=html.indexOf(file==='omr-v2.html'?'const LEADERS_XY':'function reco(',start);
  assert.ok(start>=0&&end>start);
  const context={ALL:data,CURYEAR:'2024',CURSCHOOL:proof.school};
  runInNewContext(html.slice(start,end),context);
  return context;
}
test('verified source covers every printed question and totals exactly 50 points',()=>{
  assert.deepEqual(proof.questions.map(q=>q.question),Array.from({length:50},(_,i)=>i+1));
  assert.deepEqual(proof.questions.map(q=>q.points),proof.items);
  assert.equal(proof.items.reduce((sum,p)=>sum+Math.round(p*10),0),500);
  assert.equal(proof.items.filter(p=>p===0.8).length,11);
  assert.equal(proof.items.filter(p=>p===1).length,17);
  assert.equal(proof.items.filter(p=>p===1.1).length,22);
});
for(const file of ['omr-v2.html','omr.html','cumulative.html']) {
  test(file+': embeds the complete PDF-verified 2024 Ajou points',()=>{
    const {data}=database(file);
    const points=data.points['2024'][proof.school];
    assert.deepEqual(points.items,proof.items);
    assert.equal(points.total,50);
    assert.equal(points.full,true);
    assert.equal(points.source.sha256,proof.source.sha256);
  });
}
for(const file of ['omr-v2.html','omr.html']) {
  test(file+': weighted points differ from the number correct, with the correct 50-point denominator',()=>{
    const api=scoring(file);
    const exam={year:'2024',stem:proof.school,nq:50,qlist:Array.from({length:50},(_,i)=>i+1)};
    assert.equal(api.hasActualPoints(exam),true);
    assert.equal(api.scoreMax(exam),50);
    assert.equal(api.pointOf(1,exam),0.8);
    assert.equal(api.pointOf(6,exam),1.1);
    assert.equal(api.pointOf(7,exam),1);
    assert.equal(api.scoreText({score:4,correct:5},exam),'4/50점 · 정답 5/50문항');
    assert.equal(api.scoreText({score:5.5,correct:5},exam),'5.5/50점 · 정답 5/50문항');
    assert.equal(api.scoreText({score:50,correct:50},exam),'50/50점 · 정답 50/50문항');
    assert.equal(api.scoreText({score:0,correct:0},exam),'0/50점 · 정답 0/50문항');
    assert.match(api.pointsNotice(exam),/공식 배점.*50점/);
    if(api.isP100)assert.equal(api.isP100(exam),false);
  });
  test(file+': previously verified 2025 Ajou scoring remains unchanged',()=>{
    const api=scoring(file);
    const exam={year:'2025',stem:proof.school,nq:50,qlist:Array.from({length:50},(_,i)=>i+1)};
    assert.equal(api.hasActualPoints(exam),true);
    assert.equal(api.pointOf(1,exam),0.8);
    assert.equal(api.scoreText({score:4,correct:5},exam),'4/50점 · 정답 5/50문항');
  });
}
test('cumulative analysis uses weighted points for equal-correct-count students',()=>{
  const {html,data}=database('cumulative.html');
  const context={DB:data};
  const pointStart=html.indexOf('function pointMap(');
  const scoreStart=html.indexOf('function score(student,');
  runInNewContext(html.slice(pointStart,html.indexOf('const norm',pointStart)),context);
  runInNewContext(html.slice(scoreStart,html.indexOf('/* 🔴 능력축',scoreStart)),context);
  const pm=context.pointMap('2024',proof.school,50);
  const key=Object.fromEntries(data.tagdb['2024'][proof.school].map(q=>[q[0],{key:String(q[1])}]));
  const student=questions=>({ans:Object.fromEntries(questions.map(q=>[q,key[q].key]))});
  assert.equal(context.score(student([1,2,3,4,5]),key,pm).raw,4);
  assert.equal(context.score(student([6,15,16,17,18]),key,pm).raw,5.5);
  assert.equal(pm.total,50);
});
