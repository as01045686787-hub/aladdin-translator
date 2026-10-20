/*
 * 도착정보 (통역 앱용) · v1 · 26-10-20-20시01분 · 방: 알라딘통역방
 * 출처: 알라딘 택시 앱 arrivals 화면(공항·열차 도착) 기능을 떼어 낸 것
 * - 공공데이터 키는 이 파일에 없음. 모든 조회는 중계 서버(ARRIVALS_API)로만 보냄.
 * - 사용: window.AladdinArrivals.open("airport") 또는 open("train")
 * - 공항: 인천(ICN)·김포(GMP)·김해(PUS), 국내선/국제선 구분. 인천만 실시간, 나머지는 시간표 기준.
 * - 열차: 서울역 → 부산역 (TAGO 시간표 기준).
 * - 도착 시각 큰 글씨, 출발 시각 작은 글씨. 현재 시각 이후만 표시.
 */
(function () {
  "use strict";

  /* ===== 설정: 중계 서버 주소만 넣으면 됨 ===== */
  const ARRIVALS_API = "https://polished-butterfly-9bf9.as01045686787.workers.dev";

  const AIRPORTS = [
    { name: "인천국제공항", code: "ICN" },
    { name: "김포공항", code: "GMP" },
    { name: "김해공항", code: "PUS" }
  ];
  const TRAIN_ROUTES = [
    { label: "서울역 → 부산역", from: "NAT010000", to: "NAT014445", arrName: "부산역" }
  ];

  /* ===== 화면 칸 (스타일 + 뼈대) ===== */
  const CSS = `
  #aa-ov{position:fixed;inset:0;z-index:99999;background:#fff;color:#000;display:none;flex-direction:column;font-family:'Pretendard',-apple-system,"Malgun Gothic",sans-serif;-webkit-user-select:none}
  #aa-ov.on{display:flex}
  #aa-ov header{display:grid;grid-template-columns:64px 1fr 96px;align-items:center;height:72px;padding:0 12px;border-bottom:2px solid #000}
  #aa-ov .aa-back{width:52px;height:52px;border:2px solid #000;border-radius:50%;background:#fff;color:#000;font-size:30px;font-weight:800;cursor:pointer;padding:0}
  #aa-ov .aa-title{font-size:28px;font-weight:900;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #aa-ov .aa-now{font-size:24px;font-weight:900;text-align:right;font-variant-numeric:tabular-nums}
  #aa-ov .aa-body{flex:1;overflow-y:auto;padding:16px 16px 40px}
  #aa-ov .aa-sec{font-size:24px;font-weight:900;margin:8px 0 14px}
  #aa-ov .aa-card{display:flex;align-items:center;justify-content:center;width:100%;min-height:96px;margin:0 0 12px;padding:0 12px;border:2px solid #000;border-radius:18px;background:#fff;color:#000;font-family:inherit;font-size:34px;font-weight:900;text-align:center;cursor:pointer;white-space:nowrap;overflow:hidden}
  #aa-ov .aa-card:active{background:#f0f0f0}
  #aa-ov .aa-row{border:2px solid #000;border-radius:18px;padding:14px 16px;margin-bottom:12px}
  #aa-ov .aa-line{display:flex;justify-content:space-between;align-items:center;gap:10px;white-space:nowrap}
  #aa-ov .aa-sm{font-size:24px;font-weight:800;overflow:hidden;text-overflow:ellipsis}
  #aa-ov .aa-dep{font-size:24px;font-weight:700}
  #aa-ov .aa-big{font-size:52px;font-weight:900;line-height:1.05;font-variant-numeric:tabular-nums}
  #aa-ov .aa-sub{font-size:20px;font-weight:600;margin-top:6px}
  #aa-ov .aa-empty{text-align:center;font-size:26px;font-weight:800;padding:40px 0}
  #aa-ov .aa-foot{text-align:center;font-size:16px;font-weight:600;padding:14px 0 0}`;

  const HTML = `
  <header>
    <button class="aa-back" data-aa="back" aria-label="뒤로">←</button>
    <div class="aa-title" id="aa-title"></div>
    <div class="aa-now" id="aa-now"></div>
  </header>
  <div class="aa-body" id="aa-body"></div>`;

  /* ===== 공통 함수 ===== */
  let ov = null, stack = [], cache = {};

  function nowText() {
    const d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function uniq(rows) {
    const seen = new Set();
    return rows.filter(r => { const k = r.no + r.arr + r.from; if (seen.has(k)) return false; seen.add(k); return true; });
  }
  async function loadJson(key, path) {
    if (cache[key] && Date.now() - cache[key].at < 60000) return cache[key].data;   // 1분 캐시
    const r = await fetch(ARRIVALS_API + path);
    if (!r.ok) throw new Error("http " + r.status);
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    cache[key] = { at: Date.now(), data };
    return data;
  }

  function build() {
    if (ov) return;
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    ov = document.createElement("div");
    ov.id = "aa-ov";
    ov.innerHTML = HTML;
    document.body.appendChild(ov);
    ov.addEventListener("click", onClick);
    setInterval(() => { document.getElementById("aa-now").textContent = nowText(); }, 30000);
  }

  function setTitle(t) { document.getElementById("aa-title").textContent = t; }
  function body() { return document.getElementById("aa-body"); }
  function setNow() { document.getElementById("aa-now").textContent = nowText(); }

  function push(st) { stack.push(st); show(st); }
  function back() {
    if (stack.length > 1) { stack.pop(); show(stack[stack.length - 1]); }
    else { close(); }
  }
  function close() { ov.classList.remove("on"); stack = []; }

  function show(st) {
    setNow();
    if (st.id === "home") {
      setTitle("도착 정보");
      body().innerHTML = `
        <button class="aa-card" data-aa="kind" data-kind="airport">✈️ 공항</button>
        <button class="aa-card" data-aa="kind" data-kind="train">🚆 열차</button>`;
    } else if (st.id === "airports") {
      setTitle("공항 선택");
      body().innerHTML = AIRPORTS.map(a =>
        `<button class="aa-card" data-aa="airport" data-code="${a.code}" data-name="${esc(a.name)}">${esc(a.name)}</button>`).join("");
    } else if (st.id === "scope") {
      setTitle(st.name);
      body().innerHTML = ["국내선", "국제선"].map(sc =>
        `<button class="aa-card" data-aa="scope" data-code="${st.code}" data-name="${esc(st.name)}" data-scope="${sc}">${sc}</button>`).join("");
    } else if (st.id === "routes") {
      setTitle("열차 노선");
      body().innerHTML = TRAIN_ROUTES.map((r, i) =>
        `<button class="aa-card" data-aa="route" data-i="${i}">${esc(r.label)}</button>`).join("");
    } else if (st.id === "result") {
      setTitle(st.title);
      body().innerHTML = '<div class="aa-empty">불러오는 중...</div>';
      renderResult(st);
    }
    body().scrollTop = 0;
  }

  /* ===== 도착 목록 ===== */
  async function renderResult(st) {
    const now = nowText();
    let rows = [], note = "";
    try {
      if (st.kind === "airport") {
        const d = await loadJson("airport:" + st.code, "/airport?code=" + st.code);
        rows = (d.rows || []).filter(r => r.dom === (st.scope === "국내선"));
        note = d.source === "realtime" ? "실시간 (지연 반영)" : "시간표 기준 (지연 미반영)";
      } else {
        const rt = TRAIN_ROUTES[st.i];
        const d = await loadJson("train:" + rt.from + rt.to, "/train?from=" + rt.from + "&to=" + rt.to);
        rows = (d.rows || []).map(r => ({ ...r, from: "서울역", sub: (r.kind || "") + " " + (r.no || "") }));
        note = "시간표 기준 (지연 미반영)";
      }
    } catch (e) {
      body().innerHTML = '<div class="aa-empty">정보를 불러오지 못했습니다</div>';
      return;
    }
    // 현재 시각 이후 도착만
    rows = uniq(rows.filter(r => r.arr >= now)).sort((x, y) => (x.arr < y.arr ? -1 : 1));

    const head = `<div class="aa-sub">${esc(note)}</div>`;
    if (!rows.length) {
      body().innerHTML = head + '<div class="aa-empty">현재 이후 도착 예정이 없습니다</div>';
      return;
    }
    body().innerHTML = head + rows.map(r => {
      const isTrain = st.kind === "train";
      const top = isTrain
        ? `<div class="aa-line"><span class="aa-sm">${esc(r.from)} 출발</span><span class="aa-dep">${esc(r.dep || "")}</span></div>`
        : `<div class="aa-line"><span class="aa-sm">${esc(r.from)}</span><span class="aa-sm">${esc(r.no || "")}</span></div>`;
      const label = isTrain ? esc(TRAIN_ROUTES[st.i].arrName) + " 도착" : "도착";
      const sub = isTrain ? esc(r.sub) : esc(r.airline || "") + (r.dom === true ? " · 국내선" : r.dom === false ? " · 국제선" : "");
      return `
        <div class="aa-row">
          ${top}
          <div class="aa-line"><span class="aa-sm">${label}</span><span class="aa-big">${esc(r.arr)}</span></div>
          <div class="aa-sub">${sub}</div>
        </div>`;
    }).join("") + `<div class="aa-foot">방: 알라딘통역방</div>`;
  }

  /* ===== 버튼 처리 ===== */
  function onClick(e) {
    const b = e.target.closest("[data-aa]");
    if (!b) return;
    const d = b.dataset;
    if (d.aa === "back") back();
    else if (d.aa === "kind") push({ id: d.kind === "airport" ? "airports" : "routes", kind: d.kind });
    else if (d.aa === "airport") push({ id: "scope", code: d.code, name: d.name });
    else if (d.aa === "scope") push({ id: "result", kind: "airport", code: d.code, scope: d.scope, title: d.name + " " + d.scope });
    else if (d.aa === "route") { const rt = TRAIN_ROUTES[+d.i]; push({ id: "result", kind: "train", i: +d.i, title: rt.label }); }
  }

  /* ===== 바깥에서 여는 입구 ===== */
  window.AladdinArrivals = {
    open(kind) {
      build();
      ov.classList.add("on");
      stack = [];
      if (kind === "airport" || kind === "train") { push({ id: "home" }); push({ id: kind === "airport" ? "airports" : "routes", kind }); }
      else push({ id: "home" });
    },
    close
  };
})();

/* 파일 끝 · 도착정보 (통역 앱용) · v1 · 26-10-20-20시01분 · 방: 알라딘통역방 */
