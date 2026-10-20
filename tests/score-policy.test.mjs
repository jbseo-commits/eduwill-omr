import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function app(file){
  const html=readFileSync(new URL('../'+file,import.meta.url),'utf8');
  const data=JSON.parse(html.split('const ALL=')[1].split(/;\r?\n/)[0]);
  const api={ALL:data};const start=html.indexOf('function ptsInfo(');
  runInNewContext(html.slice(start,html.indexOf(file==='omr-v2.html'?'const LEADERS_XY':'function reco(',start)),api);
  const context=(year,stem)=>{const qs=data.tagdb[year][stem];return {year,stem,nq:qs.length,qlist:qs.map(q=>Number(q[0]))};};
  return {data,api,context};
}
for(const file of ['omr-v2.html','omr.html']){
  const {data,api,context}=app(file);
  test(file+': every unverified exam uses equal weights with the school maximum, even when has=true',()=>{
    let fallback=0,verified=0;
    for(const [year,schools] of Object.entries(data.tagdb))for(const stem of Object.keys(schools)){
      const d=context(year,stem);
      if(api.hasActualPoints(d)){verified++;continue;}
      fallback++;
      const max=stem.startsWith('세종대학교')?200:stem.startsWith('인하대학교')?70:stem.startsWith('아주대학교')?50:100;
      assert.equal(api.scoreMax(d),max,year+' '+stem);
      assert.equal(api.hasScorePoints(d),true);
      assert.equal(api.hasUniformPoints(d),true);
      assert.equal(api.pointOf(d.qlist[0],d),max/d.nq);
      assert.equal(api.fmtScore(d.qlist.reduce((sum,q)=>sum+api.pointOf(q,d),0),d),String(max));
      assert.match(api.pointsNotice(d),new RegExp(max+'점 균등 배점'));
    }
    assert.equal(fallback,87);assert.equal(verified,67);
  });
  test(file+': thirty of forty gives 75/100 points and retains the independent correct count',()=>{
    for(const stem of ['가톨릭대학교_인문계_A형','서울여자대학교_영어_오전반','홍익대학교_서울_인문_A형']){
      const d=context('2026',stem);const score=30*api.pointOf(1,d);
      assert.equal(api.scoreText({score,correct:30},d),'75/100점 · 정답 30/40문항');
      assert.equal(api.scoreText({score:0,correct:0},d),'0/100점 · 정답 0/40문항');
    }
  });
  test(file+': summary-only point metadata and a 33-question paper are proportionally scored',()=>{
    const a=context('2023','경희대학교_인문체육계열');
    if(file==='omr-v2.html')assert.equal(data.points['2023'][a.stem].has,true);
    assert.equal(api.hasActualPoints(a),false);
    assert.equal(api.scoreText({score:20*api.pointOf(1,a),correct:20},a),'50/100점 · 정답 20/40문항');
    const b=context('2025','덕성여자대학교_영어1교시');
    assert.equal(api.scoreText({score:11*api.pointOf(1,b),correct:11},b),'33.3/100점 · 정답 11/33문항');
  });
  test(file+': unverified Ajou and Inha keep 50 and 70-point scales',()=>{
    const ajou=context('2023','아주대학교_인문계열');
    assert.equal(api.scoreText({score:25*api.pointOf(1,ajou),correct:25},ajou),'25/50점 · 정답 25/50문항');
    const inha=context('2026','인하대학교_영어_인문(예체능)');
    assert.equal(api.scoreText({score:20*api.pointOf(1,inha),correct:20},inha),'35/70점 · 정답 20/40문항');
  });
}
const html=readFileSync(new URL('../cumulative.html',import.meta.url),'utf8');
const DB=JSON.parse(html.split('window.EXAMDB=')[1].split(/;\r?\n/)[0]);
const cum={DB};let start=html.indexOf('function pointMap(');
runInNewContext(html.slice(start,html.indexOf('const norm',start)),cum);
start=html.indexOf('function score(student,');runInNewContext(html.slice(start,html.indexOf('/* 🔴 능력축',start)),cum);
test('cumulative scoring uses 100-point equal weights for missing and summary-only weights',()=>{
  for(const stem of ['가톨릭대학교_영어A형','경희대학교_인문체육계열']){
    const pm=cum.pointMap('2023',stem,40);assert.equal(pm.total,100);assert.equal(pm.uniform,true);
    const km=Object.fromEntries(DB.tagdb['2023'][stem].map(q=>[q[0],{key:String(q[1])}]));
    const ans=Object.fromEntries(Object.keys(km).slice(0,30).map(q=>[q,km[q].key]));
    assert.equal(cum.score({ans},km,pm).raw,75);
  }
});
test('cumulative exception scales and question-number alignment retain verified weights',()=>{
  const inha=cum.pointMap('2026','인하대학교_영어_인문(예체능)',40);assert.equal(inha.total,70);assert.equal(inha.map[1],1.75);
  const ajou=cum.pointMap('2023','아주대학교_인문계열',50);assert.equal(ajou.total,50);assert.equal(ajou.map[1],1);
  const hanyang=cum.pointMap('2022','한양대학교_영어A형',40);assert.equal(hanyang.map[41],3);assert.equal(hanyang.map[1],undefined);
});
test('cumulative Sejong uses its 200-point maximum, quarter deduction and no blank deduction',()=>{
  const stem='세종대학교_인문계A형';const pm=cum.pointMap('2025',stem,60);assert.equal(pm.total,200);
  const km=Object.fromEntries(DB.tagdb['2025'][stem].map(q=>[q[0],{key:String(q[1])}]));
  const ans=Object.fromEntries(Object.keys(km).map(q=>[q,km[q].key]));
  ans[11]=String(Number(km[11].key)%4+1);assert.equal(cum.score({ans},km,pm).raw,195.25);
  delete ans[11];assert.equal(cum.score({ans},km,pm).raw,196.2);
});
