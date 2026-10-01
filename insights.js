const DATA_URL="/data/latest.json";
const HISTORY_URL="/data/history/";
const MAX_CONCURRENT=12;

const grid=document.getElementById("insights-grid");
const meta=document.getElementById("insights-meta");

function fmtPct(v){return Number.isFinite(v)?(v>=0?"+":"")+v.toFixed(2)+"%":"—";}
function fmtNum(v){return Number.isFinite(v)?new Intl.NumberFormat("en-US").format(Math.round(v)):"—";}
function sd(a){
  if(a.length<2)return null;
  const m=a.reduce((s,x)=>s+x,0)/a.length;
  return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1));
}
function avgAbs(a){return a.length?a.reduce((s,x)=>s+Math.abs(x),0)/a.length:null;}
function returns(series){
  const p=(series||[]).map(x=>Number(x[1])).filter(Number.isFinite);
  const r=[];
  for(let i=1;i<p.length;i++) if(p[i-1]>0) r.push(p[i]/p[i-1]-1);
  return r;
}
async function mapLimit(items,limit,fn){
  const out=new Array(items.length); let next=0;
  async function worker(){
    while(true){
      const i=next++;
      if(i>=items.length)return;
      out[i]=await fn(items[i]);
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));
  return out;
}
function row(x,value,label){
  return `<button class="insight-stock" data-ticker="${x.ticker}">
    <span class="insight-rank">#${label}</span>
    <span class="insight-stock-main"><strong>${x.ticker}</strong><small>${x.company}</small></span>
    <span class="insight-stock-value">${value}</span>
  </button>`;
}
function card(title,desc,items,formatter,method){
  const body=items.length?items.map((x,i)=>row(x,formatter(x),i+1)).join(""):'<div class="insight-empty">No qualifying data available.</div>';
  return `<article class="insight-result-card">
    <div class="insight-result-head"><div><h3>${title}</h3><p>${desc}</p></div><span>${method}</span></div>
    <div class="insight-stock-list">${body}</div>
  </article>`;
}
function go(t){window.location.href="../stock/"+encodeURIComponent(t);}

async function load(){
  try{
    const payload=await fetch(DATA_URL+"?t="+Date.now()).then(r=>r.json());
    const stocks=payload.stocks||{};
    const tickers=Object.keys(stocks);
    meta.textContent=`Analyzing ${tickers.length} stocks and available historical price data…`;

    const histories=await mapLimit(tickers,MAX_CONCURRENT,async ticker=>{
      try{
        const h=await fetch(HISTORY_URL+encodeURIComponent(ticker)+".json").then(r=>r.json());
        return {ticker,h};
      }catch{return {ticker,h:null};}
    });

    const calc=[];
    histories.forEach(({ticker,h})=>{
      const d=stocks[ticker]; if(!d||!h)return;
      const s5=h["5Y"]||[],s1=h["1M"]||[];
      const p5=s5.map(x=>Number(x[1])).filter(Number.isFinite);
      const r5=returns(s5),r1=returns(s1);
      const high=Number(d.week52_high),low=Number(d.week52_low),price=Number(d.price);
      calc.push({
        ...d,ticker,price:Number.isFinite(price)?price:null,volume:Number(d.volume)||0,
        stable:sd(r5),volatility:avgAbs(r5),
        growth:p5.length>1&&p5[0]>0?(p5[p5.length-1]/p5[0]-1):null,
        recent:r1.length&&Number(s1[0][1])>0?(Number(s1.at(-1)[1])/Number(s1[0][1])-1):null,
        high52:high,low52:low,
        fromHigh:Number.isFinite(price)&&high>0?(price/high-1):null,
        fromLow:Number.isFinite(price)&&low>0?(price/low-1):null,
        range52:high>0&&low>0?(high/low-1):null
      });
    });

    const asc=k=>calc.filter(x=>Number.isFinite(x[k])).sort((a,b)=>a[k]-b[k]).slice(0,10);
    const desc=k=>calc.filter(x=>Number.isFinite(x[k])).sort((a,b)=>b[k]-a[k]).slice(0,10);
    const high52=calc.filter(x=>Number.isFinite(x.fromHigh)).sort((a,b)=>b.fromHigh-a.fromHigh).slice(0,10);
    const low52=calc.filter(x=>Number.isFinite(x.fromLow)).sort((a,b)=>a.fromLow-b.fromLow).slice(0,10);

    const sections=[
      card("Top Stable Stocks","Lowest standard deviation of daily returns over the available historical series.",asc("stable"),x=>(x.stable*100).toFixed(2)+"%","Daily-return SD"),
      card("Top Dividend Stocks","Dividend history is not currently included in the site's data files.",[],x=>"—","Data unavailable"),
      card("Growth Stocks","Highest price growth from the first to the latest observation in the available historical series.",desc("growth"),x=>fmtPct(x.growth*100),"Available history"),
      card("Most Traded","Highest latest reported trading volume.",desc("volume"),x=>fmtNum(x.volume),"Latest volume"),
      card("52-Week Highs & Lows","Stocks closest to their current 52-week high or low. High proximity is shown first, followed by low proximity.",high52.slice(0,5),x=>fmtPct(x.fromHigh*100),"Near high"),
      card("Lowest Volatility","Lowest average absolute daily return over the available historical series.",asc("volatility"),x=>(x.volatility*100).toFixed(2)+"%","Avg. abs. return"),
      card("Strongest Recent Performers","Highest price return over the latest available 1-month series.",desc("recent"),x=>fmtPct(x.recent*100),"1 month"),
      card("More Screens","Stocks with the widest current 52-week price range, calculated as high ÷ low − 1.",desc("range52"),x=>fmtPct(x.range52*100),"52-week range")
    ];

    grid.innerHTML=sections.join("");
    // Add the 5 low-side entries below the high-side 52-week screen.
    const highLow=grid.children[4];
    if(highLow){
      highLow.querySelector(".insight-result-head p").textContent="Five stocks closest to their 52-week high and five closest to their 52-week low.";
      highLow.querySelector(".insight-stock-list").innerHTML=
        high52.slice(0,5).map((x,i)=>row(x,fmtPct(x.fromHigh*100),i+1)).join("")+
        low52.slice(0,5).map((x,i)=>row(x,fmtPct(x.fromLow*100),"L"+(i+1))).join("");
    }
    meta.textContent=`Updated ${payload.updated_at?new Date(payload.updated_at).toLocaleString():"from available data"} · ${calc.length} stocks with historical files`;
    grid.querySelectorAll(".insight-stock").forEach(b=>b.addEventListener("click",()=>go(b.dataset.ticker)));
  }catch(err){
    console.error(err);
    meta.textContent="Unable to load Insights data.";
    grid.innerHTML='<div class="insight-empty">Please refresh the page and try again.</div>';
  }
}
load();