import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const year='2024';
const school='한양대학교_영어A형';
const officialUrl='https://go.hanyang.ac.kr/file/download.do?menu=boardfile&file_no=2256';
const expected=[
  2,2,2,2,2,2,2,2,3,3,3,3,3,3,3,2,4,4,
  3,3,3,3,3,3,3,4,3,4,3,3,3,2,3,4,3
];
const questions=Array.from({length:35},(_,i)=>i+1);
const proof=JSON.parse(readFileSync(new URL('../data/verified/hanyang-2024-points.json',import.meta.url),'utf8'));

function database(file){
  const html=readFileSync(new URL('../'+file,import.meta.url),'utf8');
  const marker=file==='cumulative.html'?'window.EXAMDB=':'const ALL=';
  return {html,data:JSON.parse(html.split(marker)[1].split(/;\r?\n/)[0])};
}

function keymap(data){
  return Object.fromEntries(data.tagdb[year][school].map(q=>[q[0],{key:String(q[1])}]));
}

function student(km,{wrong=[],blank=[]}={}){
  const ans=Object.fromEntries(Object.entries(km).map(([q,value])=>[q,value.key]));
  for(const q of wrong)ans[q]=String(Number(km[q].key)%5+1);
  for(const q of blank)ans[q]=null;
  return {ans};
}

function application(file){
  const {html,data}=database(file);
  const api={ALL:data,CURYEAR:year,CURSCHOOL:school};
  const start=html.indexOf('function ptsInfo(');
  const end=html.indexOf(file==='omr-v2.html'?'const LEADERS_XY':'function reco(',start);
  assert.ok(start>=0&&end>start,file+': scoring helpers are present');
  runInNewContext(html.slice(start,end),api);
  const runStart=html.indexOf("CURSCHOOL=$('school').value",html.indexOf('function run(){'));
  const runEnd=html.indexOf('const ranked=',runStart);
  assert.ok(runStart>=0&&runEnd>runStart,file+': actual run() grading block is present');
  const grading=html.slice(runStart,runEnd);
  const km=keymap(data);
  api.$=()=>({value:school});
  api.keymap=()=>km;
  api.toast=message=>{throw new Error(message);};
  return {data,api,grade(options){
    const row=student(km,options);
    api.students=()=>[row];
    const result=runInNewContext('(function(){'+grading+'return {nq,qlist};})()',api);
    return {row,...result};
  }};
}

test('official proof contains all 35 printed questions and totals 100 points',()=>{
  assert.deepEqual(proof.items,expected);
  assert.deepEqual(proof.questions.map(q=>q.question),questions);
  assert.deepEqual(proof.questions.map(q=>q.points),expected);
  assert.equal(proof.items.reduce((sum,value)=>sum+value,0),100);
  assert.equal(proof.items.filter(value=>value===2).length,10);
  assert.equal(proof.items.filter(value=>value===3).length,20);
  assert.equal(proof.items.filter(value=>value===4).length,5);
  assert.match(proof.source.sha256,/^[a-f0-9]{64}$/i);
  assert.ok([proof.source.url,proof.source.official_url,proof.official_url].includes(officialUrl),
    'source records the official Hanyang PDF URL');
});

for(const file of ['omr-v2.html','omr.html','cumulative.html']){
  test(file+': embeds the complete official 2024 Hanyang weights and 100-point maximum',()=>{
    const {data}=database(file);
    const points=data.points[year][school];
    assert.deepEqual(data.tagdb[year][school].map(q=>Number(q[0])),questions);
    assert.deepEqual(points.items,expected);
    assert.equal(points.total,100);
    assert.equal(points.full,true);
    assert.equal(points.source.sha256,proof.source.sha256);
    for(let q=19;q<=25;q++)assert.equal(points.items[q-1],3,'Q'+q);
    assert.equal(points.items[25],4,'Q26');
  });
}

for(const file of ['omr-v2.html','omr.html']){
  test(file+': applies printed 2/3/4-point weights with 35 questions and a 100-point denominator',()=>{
    const {api}=application(file);
    const exam={year,stem:school,nq:35,qlist:questions};
    assert.equal(api.hasActualPoints(exam),true);
    assert.equal(api.scoreMax(exam),100);
    assert.equal(api.pointOf(1,exam),2);
    assert.equal(api.pointOf(19,exam),3);
    assert.equal(api.pointOf(26,exam),4);
    assert.equal(api.penaltyOf(19,exam),0);
    assert.equal(api.penaltyOf(26,exam),0);
    assert.equal(api.scoreText({score:100,correct:35},exam),'100/100점 · 정답 35/35문항');
    assert.equal(api.scoreText({score:97,correct:34},exam),'97/100점 · 정답 34/35문항');
    assert.equal(api.scoreText({score:96,correct:34},exam),'96/100점 · 정답 34/35문항');
    assert.equal(api.scoreText({score:0,correct:0},exam),'0/100점 · 정답 0/35문항');
  });

  test(file+': actual run() grading produces 100, 97 and 96 for the affected questions',()=>{
    const app=application(file);
    const perfect=app.grade();
    assert.equal(perfect.nq,35);
    assert.deepEqual(Array.from(perfect.qlist),questions);
    assert.equal(perfect.row.correct,35);
    assert.equal(perfect.row.score,100);
    assert.equal(perfect.row.pct,100);
    for(const [q,score] of [[1,98],[17,96],[19,97],[26,96]]){
      const {row}=app.grade({wrong:[q]});
      assert.equal(row.correct,34,'Q'+q);
      assert.equal(row.score,score,'Q'+q);
    }
  });

  test(file+': affected questions earn no points when wrong or blank, and all blank scores zero',()=>{
    const app=application(file);
    const affected=Array.from({length:8},(_,i)=>i+19);
    const wrong=app.grade({wrong:affected}).row;
    assert.equal(wrong.correct,27);
    assert.equal(wrong.score,75);
    const blank=app.grade({blank:affected}).row;
    assert.equal(blank.correct,27);
    assert.equal(blank.score,75);
    assert.equal(blank.blanks,8);
    const allblank=app.grade({blank:questions}).row;
    assert.equal(allblank.correct,0);
    assert.equal(allblank.score,0);
    assert.equal(allblank.blanks,35);
  });
}

test('cumulative score uses the same corrected weights, maximum and blank behavior',()=>{
  const {html,data}=database('cumulative.html');
  const api={DB:data};
  const pointStart=html.indexOf('function pointMap(');
  const scoreStart=html.indexOf('function score(student,');
  assert.ok(pointStart>=0&&scoreStart>pointStart);
  runInNewContext(html.slice(pointStart,html.indexOf('const norm',pointStart)),api);
  runInNewContext(html.slice(scoreStart,html.indexOf('/* 🔴 능력축',scoreStart)),api);
  const pm=api.pointMap(year,school,35);
  const km=keymap(data);
  assert.equal(pm.total,100);
  assert.equal(pm.uniform,false);
  assert.equal(pm.map[1],2);
  assert.equal(pm.map[19],3);
  assert.equal(pm.map[26],4);
  for(const [options,score,correct] of [
    [undefined,100,35],
    [{wrong:[19]},97,34],
    [{wrong:[26]},96,34],
    [{wrong:Array.from({length:8},(_,i)=>i+19)},75,27],
    [{blank:questions},0,0]
  ]){
    const result=api.score(student(km,options),km,pm);
    assert.equal(result.raw,score);
    assert.equal(result.correct,correct);
  }
});
