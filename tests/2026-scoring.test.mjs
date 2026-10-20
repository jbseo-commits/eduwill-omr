import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const proof=JSON.parse(readFileSync(new URL('../data/verified/2026-points.json',import.meta.url),'utf8'));
const verified=proof.exams.filter(e=>e.status==='verified');
const expected={
  가천대학교_영어:{total:100,boundaries:{1:1.2,8:1.2,9:2.1,13:2.1,14:2.4,21:2.4,22:3.1,31:3.1,32:3.3,40:3.3}},
  '건국대학교_영어(인문예체능)':{total:100,boundaries:{1:2,20:2,21:3,40:3}},
  성균관대학교_인문계_A형:{total:100,boundaries:{1:1.9,5:1.9,6:1.8,10:1.8,11:2,20:2,21:2.1,22:2,24:2.1,50:2}},
  세종대학교_인문계_A형:{total:200,boundaries:{1:2.8,10:2.8,11:3.8,15:3.8,16:3.2,30:3.2,31:2.8,45:2.8,46:4.2,60:4.2}},
  아주대학교_인문계열:{total:50,boundaries:{1:0.8,4:1,7:1.1,33:0.8,50:1.1}},
  중앙대학교_영어_A형:{total:100,boundaries:{1:2,20:2,21:3,28:3,29:2.5,32:2.5,33:3,36:3,37:3.5,40:3.5}},
  '한국외국어대학교_T1-1_영어_A형':{total:100,boundaries:{1:1,13:1,14:1.5,17:1.5,18:2,30:2,31:2.5,40:2.5,41:3,50:3}},
  한국외국어대학교_T2_영어_A형:{total:100,boundaries:{1:1,13:1,14:1.5,17:1.5,18:2,30:2,31:2.5,40:2.5,41:3,50:3}},
  한양대학교_서울_영어_A:{total:100,boundaries:{1:2,9:2,10:3,15:3,16:2,17:2,18:3,23:3,24:2,25:3,26:2,27:2,28:3,40:2}},
};
function application(file){
  const html=readFileSync(new URL('../'+file,import.meta.url),'utf8');
  const data=JSON.parse(html.split('const ALL=')[1].split(/;\r?\n/)[0]);
  const api={ALL:data};
  const start=html.indexOf('function ptsInfo(');
  const end=html.indexOf(file==='omr-v2.html'?'const LEADERS_XY':'function reco(',start);
  runInNewContext(html.slice(start,end),api);
  return {data,api};
}
test('proof records all 11 universities, nine verified exam variants, and three unprinted variants',()=>{
  assert.equal(new Set(proof.exams.map(e=>e.school.split('_')[0])).size,11);
  assert.equal(verified.length,9);
  assert.deepEqual(verified.map(e=>e.school).sort(),Object.keys(expected).sort());
  assert.equal(proof.exams.filter(e=>e.status==='not_printed_in_provided_pdf').length,3);
  assert.equal(verified.reduce((n,e)=>n+e.items.length,0),420);
  for(const e of verified){
    assert.deepEqual(e.questions.map(q=>q.question),Array.from({length:e.n},(_,i)=>i+1));
    assert.deepEqual(e.questions.map(q=>q.points),e.items);
    assert.equal(e.items.reduce((sum,p)=>sum+Math.round(p*10),0),expected[e.school].total*10);
  }
});
for(const file of ['omr-v2.html','omr.html']){
  const {data,api}=application(file);
  for(const e of verified){
    test(file+': '+e.school+' uses the printed weights, boundaries and correct maximum',()=>{
      const d={year:'2026',stem:e.school,nq:e.n,qlist:Array.from({length:e.n},(_,i)=>i+1)};
      const points=data.points['2026'][e.school];
      assert.equal(api.hasActualPoints(d),true);
      assert.equal(api.scoreMax(d),expected[e.school].total);
      assert.deepEqual(points.items,e.items);
      assert.equal(points.source.sha256,proof.sources[e.source].sha256);
      for(const [q,value] of Object.entries(expected[e.school].boundaries))assert.equal(api.pointOf(Number(q),d),value,'Q'+q);
      assert.match(api.pointsNotice(d),/제공자료 배점/);
      assert.equal(api.fmtScore(e.items.reduce((a,b)=>a+b,0),d),String(expected[e.school].total));
      const scoreA=api.pointOf(1,d),other=e.items.findIndex(p=>p!==scoreA)+1;
      assert.notEqual(api.fmtScore(scoreA,d),api.fmtScore(api.pointOf(other,d),d));
    });
  }
  test(file+': Catholic, Seoul Women and Hongik have no assumed actual weights',()=>{
    for(const e of proof.exams.filter(e=>e.status==='not_printed_in_provided_pdf')){
      const d={year:'2026',stem:e.school,nq:e.n,qlist:Array.from({length:e.n},(_,i)=>i+1)};
      assert.equal(api.hasActualPoints(d),false);
      assert.equal(api.pointsNotice(d),'');
    }
  });
  test(file+': Sejong preserves a quarter-weight wrong-answer deduction; blank earns zero',()=>{
    const d={year:'2026',stem:'세종대학교_인문계_A형',nq:60,qlist:Array.from({length:60},(_,i)=>i+1)};
    for(const q of [1,11,16,31,46])assert.equal(api.penaltyOf(q,d),api.pointOf(q,d)/4);
    assert.equal(api.fmtScore(200-api.pointOf(1,d)-api.penaltyOf(1,d),d),'196.5');
    assert.equal(api.fmtScore(200-api.pointOf(1,d),d),'197.2');
    assert.equal(api.penaltyOf(1,{year:'2026',stem:'가천대학교_영어',nq:40,qlist:Array.from({length:40},(_,i)=>i+1)}),0);
  });
  test(file+': fractional deductions round half up despite accumulated floating-point noise',()=>{
    const d={year:'2026',stem:'세종대학교_인문계_A형',nq:60,qlist:Array.from({length:60},(_,i)=>i+1)};
    assert.equal(api.fmtScore(195.24999999999986,d),'195.3');
    assert.equal(api.fmtScore(194.7499999999999,d),'194.8');
    assert.equal(api.fmtScore(0.15,d),'0.2');
    assert.equal(api.fmtScore(36.70000000000002,d),'36.7');
    for(let units=0;units<=4000;units++){
      const expected=Math.floor((units+1)/2)/10;
      assert.equal(Number(api.fmtScore(units/20,d)),expected,'score '+units+'/20');
    }
  });
}
