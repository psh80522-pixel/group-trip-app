/*
 * 캡처 서랍 → 여행매니저 장소 가져오기 (capture-import.js)
 * - 캡처 서랍의 [여행앱으로 보내기] 링크(#cd=...)로 열리면 가져오기 창을 자동으로 띄웁니다.
 * - 첫 화면의 [캡처 서랍에서 가져오기] 카드에서 복사한 코드를 붙여넣어도 됩니다.
 * - 일정표(v4): 캡처 서랍이 사진·PDF·엑셀에서 읽은 일정 → 새 여행 만들기/기존 여행에 더하기, 엑셀 복원 버튼에 사진·PDF가 오면 안내
 * - 보관함(#cdz=): 카카오 장소 검색으로 위치 확정, 일정 탭 '동선 근처 저장 장소'(우회 거리·내 주변·기간·방문 기록)
 * - 고른 여행·일차의 예상 일정(expected_places)에 시간 미정으로 추가합니다.
 * - v2: 캡처 서랍 '여행앱 보관함으로 보내기'(#cdz=…)로 저장 장소 전체를 보관함(trips/__capture_library__/places)에 동기화하고,
 *   일정 탭 지도 아래 '동선 근처 저장 장소'에서 일차별 동선(직선) 근처 장소를 추천합니다.
 * index.html의 메인 스크립트(db, tripsData 등) 뒤에 불러와야 합니다.
 */
(function () {
  'use strict';

  var PLACE_CATS = ['관광', '식당', '카페', '숙박', '장보기', '쇼핑', '교통비', '통신,보험', '휴게소', '출발/귀가', '기타'];

  function h(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function getDb() { try { return typeof db !== 'undefined' ? db : null; } catch (e) { return null; } }
  function getTrips() { try { return typeof tripsData !== 'undefined' && Array.isArray(tripsData) ? tripsData : []; } catch (e) { return []; } }
  function getCurrentTripId() { try { return typeof currentTripId !== 'undefined' ? currentTripId : null; } catch (e) { return null; } }
  function editLocked() { try { return typeof isEditLocked !== 'undefined' && isEditLocked; } catch (e) { return false; } }

  /* ---------- 받은 데이터 해석 ---------- */
  function b64urlToText(b64) {
    var s = String(b64).replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
    while (s.length % 4) s += '=';
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }
  function num(v) { var x = typeof v === 'string' ? parseFloat(v) : v; return (typeof x === 'number' && isFinite(x)) ? x : null; }
  function str(v, n) { return typeof v === 'string' ? v.trim().slice(0, n) : ''; }

  /** 링크 전체, '#cd=...' 조각, 'CD1:...' 코드 중 무엇을 받아도 장소 목록으로 바꿉니다. 실패하면 null. */
  function parsePayload(raw) {
    if (!raw) return null;
    var t = String(raw).trim();
    var m = t.match(/[#&?]cd=([A-Za-z0-9_\-]+)/) || t.match(/^CD1:([A-Za-z0-9_\-\s]+)$/) || t.match(/^([A-Za-z0-9_\-]{20,})$/);
    if (!m) return null;
    var data;
    try { data = JSON.parse(b64urlToText(m[1])); } catch (e) { return null; }
    if (!data || data.v !== 1 || !Array.isArray(data.p)) return null;
    var list = data.p.slice(0, 200).map(function (p) {
      var lat = num(p.y), lng = num(p.x);
      if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) { lat = null; lng = null; }
      return {
        name: str(p.n, 80) || '(이름 없음)',
        address: str(p.a, 160),
        region: str(p.r, 60),
        lat: lat, lng: lng,
        category: PLACE_CATS.indexOf(p.c) >= 0 ? p.c : '기타',
        phone: str(p.t, 40),
        memo: str(p.m, 300),
      };
    });
    return list.length ? list : null;
  }

  /* ---------- 스타일: 앱의 테마 변수(DESIGN.md v9)만 사용 ---------- */
  function injectStyle() {
    if (document.getElementById('cd-style')) return;
    var st = document.createElement('style');
    st.id = 'cd-style';
    st.textContent = [
      '.cd-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:0 14px;border-radius:var(--r,8px);border:1px solid var(--line-strong,rgba(17,17,17,.22));background:transparent;color:var(--g900,#111);font-weight:600;font-size:13px;cursor:pointer}',
      '.cd-btn.pri{background:var(--accent,#111);border-color:var(--accent,#111);color:var(--on-accent,#fff)}',
      '.cd-btn.blk{box-sizing:border-box;width:100%;min-height:46px;font-size:14px}',
      '.cd-btn:disabled{opacity:.45;cursor:default}',
      '#cd-modal{position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center}',
      '@media(min-width:640px){#cd-modal{align-items:center}}',
      '.cd-scrim{position:absolute;inset:0;background:rgba(0,0,0,.45)}',
      '.cd-panel{box-sizing:border-box;position:relative;width:100%;max-width:520px;max-height:90vh;display:flex;flex-direction:column;background:var(--bg,#F3F2EE);color:var(--g900,#111);border:1px solid var(--line,rgba(17,17,17,.1));border-radius:var(--r-lg,12px) var(--r-lg,12px) 0 0}',
      '@media(min-width:640px){.cd-panel{border-radius:var(--r-lg,12px)}}',
      '.cd-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 16px;border-bottom:1px solid var(--line,rgba(17,17,17,.1))}',
      '.cd-head h3{margin:0;font-family:var(--display);font-weight:600;font-size:18px;letter-spacing:-.03em}',
      '.cd-x{width:36px;height:36px;border-radius:var(--r,8px);border:1px solid var(--line-strong,rgba(17,17,17,.22));background:transparent;color:var(--g900,#111);cursor:pointer}',
      '.cd-body{overflow-y:auto;padding:14px 16px calc(18px + env(safe-area-inset-bottom,0px));display:grid;grid-template-columns:minmax(0,1fr);gap:12px}',
      '.cd-kick{font-family:var(--mono);font-size:10.5px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--pt,#8C2F3D)}',
      '.cd-p{margin:0;font-size:13px;color:var(--g600,#55524D);line-height:1.5}',
      '.cd-list{display:grid;grid-template-columns:minmax(0,1fr);gap:6px}',
      '.cd-row{min-width:0;box-sizing:border-box;display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--line,rgba(17,17,17,.1));border-radius:var(--r,8px);background:var(--card,#FBFAF8);cursor:pointer}',
      '.cd-row input{margin-top:3px;width:18px;height:18px;accent-color:var(--accent,#111)}',
      '.cd-nm{display:block;font-weight:600;font-size:14px;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cd-sb{display:block;font-family:var(--mono);font-size:11px;color:var(--g500,#74716B);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cd-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}',
      '.cd-lab{display:block;font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--g500,#74716B);margin-bottom:4px}',
      '.cd-sel,.cd-ta{box-sizing:border-box;width:100%;min-height:46px;padding:8px 10px;border:1px solid var(--line-strong,rgba(17,17,17,.22));border-radius:var(--r,8px);background:var(--card,#FBFAF8);color:var(--g900,#111);font-size:13px;font-weight:600}',
      '.cd-ta{font-family:var(--mono);font-weight:400;font-size:12px;min-height:96px;resize:vertical}',
      '.cd-msg{margin:0;font-size:12.5px;font-weight:600}',
      '.cd-msg.bad{color:var(--pt,#8C2F3D)} .cd-msg.ok{color:var(--g900,#111)}',
      '.cd-note{padding:10px 12px;border:1px solid var(--line,rgba(17,17,17,.1));border-radius:var(--r,8px);background:var(--card,#FBFAF8);font-size:12.5px}',
      '.cd-done{text-align:center;padding:10px 0;display:grid;gap:6px;justify-items:center}',
      '.cd-done .big{font-family:var(--display);font-weight:600;font-size:20px;letter-spacing:-.03em}',
      '.cd-home{display:flex;align-items:center;gap:12px}',
      '.cd-home .tx{flex:1;min-width:0}',
      '#cd-near{margin-top:10px;border-top:1px solid var(--line,rgba(17,17,17,.1));padding-top:10px}',
      '.cd-nearhead{box-sizing:border-box;width:100%;display:flex;align-items:center;gap:10px;min-height:44px;padding:4px 2px;background:transparent;border:0;color:var(--g900,#111);cursor:pointer;text-align:left}',
      '.cd-nearhead .tx{flex:1;min-width:0}',
      '.cd-nearhead .bi-en{font-family:var(--display);font-weight:600;font-size:15px;letter-spacing:-.03em}',
      '.cd-nearhead .bi-ko{font-size:11px;color:var(--g500,#74716B);margin-left:6px}',
      '.cd-count{font-family:var(--mono);font-size:11px;font-weight:500;padding:3px 8px;border-radius:var(--r,8px);border:1px solid var(--line,rgba(17,17,17,.1));color:var(--g900,#111);white-space:nowrap}',
      '.cd-count.on{background:var(--pt,#8C2F3D);border-color:var(--pt,#8C2F3D);color:var(--bg,#F3F2EE)}',
      '.cd-nearbody{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;padding-top:6px}',
      '.cd-chips{display:flex;flex-wrap:wrap;gap:6px}',
      '.cd-chip{min-height:32px;padding:0 10px;border-radius:var(--r,8px);border:1px solid var(--line,rgba(17,17,17,.1));background:transparent;color:var(--g600,#55524D);font-family:var(--mono);font-size:11.5px;cursor:pointer}',
      '.cd-chip.on{background:var(--accent,#111);border-color:var(--accent,#111);color:var(--on-accent,#fff)}',
      '.cd-nrow{min-width:0;display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid var(--line,rgba(17,17,17,.1));border-radius:var(--r,8px);background:var(--card,#FBFAF8)}',
      '.cd-nrow .tx{flex:1;min-width:0}',
      '.cd-nrow .cd-btn{min-height:36px;padding:0 10px;font-size:12px;white-space:nowrap}',
      '.cd-nrow .cd-btn.done{border-style:dashed;color:var(--g500,#74716B)}',
      '.cd-nrow.dim{opacity:.55}',
      '.cd-nm a{color:inherit;text-decoration:underline;text-decoration-color:var(--line,rgba(17,17,17,.2));text-underline-offset:3px}',
      '.cd-nrow .cd-sb{font-family:inherit;font-size:12px}',
      '.cd-sb.k{font-family:inherit;font-size:12px}',
      '.cd-chip.k{font-family:inherit;font-size:12.5px}',
      '.cd-ol{margin:0;padding-left:20px;list-style:decimal;display:grid;gap:4px;font-size:13px;color:var(--g600,#55524D);line-height:1.5}',
      '.cd-tag{font-size:11.5px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--g900,#111)}',
      '.cd-tag.pt{color:var(--pt,#8C2F3D)}',
      '.cd-foot{margin:0;font-size:12px;color:var(--g500,#74716B);line-height:1.6}',
      '.cd-link{border:0;background:none;padding:0;margin-left:4px;color:var(--g900,#111);font-size:12px;font-weight:600;text-decoration:underline;text-underline-offset:3px;cursor:pointer}',
      '.cd-ta{box-sizing:border-box;width:100%;font-family:var(--mono);font-size:11px;padding:8px;border:1px solid var(--line,rgba(17,17,17,.1));border-radius:var(--r,8px);background:var(--card,#FBFAF8);color:var(--g900,#111)}',
      '.cd-off{display:block;margin-top:2px;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--pt,#8C2F3D);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /** v1(장소 보내기)·v2(보관함 동기화), 압축(#cdz= / CDZ:) 모두 해석. 결과: {kind:'places', list} | {kind:'library', items, full} | {kind:'error', text} | null */
  async function parseAny(raw) {
    if (!raw) return null;
    var t = String(raw).trim();
    var mz = t.match(/[#&?]cdz=([A-Za-z0-9_\-]+)/) || t.match(/^CDZ:([A-Za-z0-9_\-\s]+)$/);
    var json = null;
    try {
      if (mz) {
        if (typeof DecompressionStream !== 'function') return { kind: 'error', text: '이 브라우저는 압축된 코드를 읽지 못합니다. 휴대폰 운영체제·브라우저를 최신으로 올려 주세요.' };
        var b64 = mz[1].replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, ''); while (b64.length % 4) b64 += '=';
        var bin = atob(b64), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        var txt = await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
        json = JSON.parse(txt);
      } else {
        var m = t.match(/[#&?]cd=([A-Za-z0-9_\-]+)/) || t.match(/^CD[12]:([A-Za-z0-9_\-\s]+)$/) || t.match(/^([A-Za-z0-9_\-]{20,})$/);
        if (!m) return null;
        json = JSON.parse(b64urlToText(m[1]));
      }
    } catch (e) { return null; }
    if (json && json.v === 1) { var list = parsePayload('#cd=' + textToB64url(JSON.stringify(json))); return list ? { kind: 'places', list: list } : null; }
    if (json && json.v === 2 && Array.isArray(json.p)) {
      var items = json.p.slice(0, 3000).map(function (p) {
        var lat = num(p.y), lng = num(p.x);
        if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
        var id = String(p.i || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
        if (!id) return null;
        return { id: id, name: str(p.n, 80) || '(이름 없음)', address: str(p.a, 160), region: str(p.r, 60), lat: lat, lng: lng,
          category: PLACE_CATS.indexOf(p.c) >= 0 ? p.c : '기타', drawerCat: str(p.k, 20), memo: str(p.m, 200),
          visited: p.s === 1, rating: [1, 2, 3, 4, 5].indexOf(p.t) >= 0 ? p.t : null, userLoc: p.u === 1,
          ps: /^\d{4}-\d{2}-\d{2}$/.test(p.ps) ? p.ps : null, pe: /^\d{4}-\d{2}-\d{2}$/.test(p.pe) ? p.pe : null };
      }).filter(Boolean);
      return { kind: 'library', items: items, full: json.full === true };
    }
    if (json && json.v === 4 && json.trip && Array.isArray(json.p)) {
      var dOK = function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : ''; };
      var places = json.p.slice(0, 300).map(function (p) {
        var name = str(p.n, 80); if (!name) return null;
        var lat = num(p.y), lng = num(p.x);
        if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) { lat = null; lng = null; }
        var day = Math.round(num(p.d) || 1);
        return { day: day >= 1 && day <= 60 ? day : 1, time: /^\d{2}:\d{2}$/.test(p.t || '') ? p.t : '', category: PLACE_CATS.indexOf(p.c) >= 0 ? p.c : '기타',
          name: name, address: str(p.a, 160), phone: str(p.ph, 30), budget: Math.max(0, Math.round(num(p.b) || 0)), memo: str(p.m, 200), lat: lat, lng: lng };
      }).filter(Boolean);
      var tr = json.trip;
      return { kind: 'plan', trip: { n: str(tr.n, 60), s: dOK(tr.s), e: dOK(tr.e), m: (num(tr.m) >= 1 && num(tr.m) <= 99) ? Math.round(num(tr.m)) : null, g: tr.g === 'global' ? 'global' : 'kr', a: str(tr.a, 30) }, places: places };
    }
    return null;
  }
  function textToB64url(t) {
    var bytes = new TextEncoder().encode(t), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /* ---------- 화면: 첫 화면 카드 ---------- */
  function injectHomeCard() {
    if (document.getElementById('cd-home-card')) return;
    var anchor = document.getElementById('all-trips-folder-section');
    if (!anchor) return;
    var sec = document.createElement('section');
    sec.id = 'cd-home-card';
    sec.className = 'bg-white p-4 rounded-2xl shadow-sm border border-slate-200';
    sec.innerHTML =
      '<div class="cd-home"><div class="tx"><h2 class="text-base font-extrabold text-slate-800 flex items-center gap-2"><i class="fa-solid fa-images"></i>' +
      '<span class="bi"><span class="bi-en">Capture Drawer</span><span class="bi-ko">캡처 서랍에서 가져오기</span></span></h2>' +
      '<p class="text-[11px] text-slate-500 mt-0.5">캡처 서랍에서 담은 장소·일정표를 여행에 넣습니다. <span id="cd-lib-count" class="cd-kick"></span></p></div>' +
      '<button type="button" id="cd-open-paste" class="cd-btn pri">붙여넣기</button></div>';
    anchor.parentNode.insertBefore(sec, anchor.nextSibling);
    document.getElementById('cd-open-paste').addEventListener('click', function () { openModal(null); });
  }

  /* ---------- 화면: 가져오기 창 ---------- */
  var state = { places: null, tripId: null };

  function closeModal() {
    var m = document.getElementById('cd-modal');
    if (m) m.remove();
    document.body.style.overflow = '';
  }

  function tripDays(trip) {
    if (!trip || !trip.startDate || !trip.endDate) return 1;
    var a = new Date(trip.startDate + 'T00:00:00'), b = new Date(trip.endDate + 'T00:00:00');
    var d = Math.round((b - a) / 86400000) + 1;
    return d >= 1 && d <= 60 ? d : 1;
  }
  function dayLabel(trip, i) {
    if (!trip || !trip.startDate) return i + '일차';
    var d = new Date(trip.startDate + 'T00:00:00'); d.setDate(d.getDate() + i - 1);
    return i + '일차 (' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + '일월화수목금토'[d.getDay()] + ')';
  }
  function sortedTrips() {
    return getTrips().slice().sort(function (a, b) {
      if (!!a.isCompleted !== !!b.isCompleted) return a.isCompleted ? 1 : -1;
      return String(b.startDate || '').localeCompare(String(a.startDate || ''));
    });
  }

  function openModal(places, blank) {
    closeModal();
    state.places = places;
    var wrap = document.createElement('div');
    wrap.id = 'cd-modal';
    wrap.innerHTML = '<div class="cd-scrim" data-cd-close="1"></div>' +
      '<div class="cd-panel" role="dialog" aria-modal="true" aria-labelledby="cd-title">' +
      '<div class="cd-head"><div><div class="cd-kick">From Capture Drawer</div><h3 id="cd-title">캡처 서랍에서 가져오기</h3></div>' +
      '<button type="button" data-cd-close="1" class="cd-x" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<div id="cd-body" class="cd-body"></div></div>';
    document.body.appendChild(wrap);
    document.body.style.overflow = 'hidden';
    wrap.addEventListener('click', function (e) { if (e.target.closest('[data-cd-close]')) closeModal(); });
    if (blank) return;
    if (places) renderPick(); else renderPaste();
  }

  function renderPaste(err) {
    var body = document.getElementById('cd-body');
    body.innerHTML =
      '<p class="cd-p">캡처 서랍의 <b>여행앱으로 보내기 → 코드 복사</b>로 복사한 코드나 링크를 붙여넣으세요.</p>' +
      '<textarea id="cd-paste" rows="4" class="cd-ta" placeholder="CD1:..."></textarea>' +
      (err ? '<p class="cd-msg bad">' + h(err) + '</p>' : '') +
      '<button type="button" id="cd-paste-go" class="cd-btn pri blk">불러오기</button>';
    document.getElementById('cd-paste-go').addEventListener('click', async function () {
      var r = await parseAny(document.getElementById('cd-paste').value);
      if (!r || r.kind === 'error') { renderPaste(r && r.text ? r.text : '코드를 읽지 못했습니다. 캡처 서랍에서 코드를 다시 복사해 주세요.'); return; }
      if (r.kind === 'library') { state.lib = r; renderLibrary(); return; }
      if (r.kind === 'plan') { state.plan = r; state.planMode = 'new'; renderPlanImport(); return; }
      state.places = r.list; renderPick();
    });
  }

  function renderPick(msg) {
    var body = document.getElementById('cd-body');
    var places = state.places || [];
    var trips = sortedTrips();
    if (!state.tripId || !trips.some(function (t) { return t.id === state.tripId; })) {
      var cur = getCurrentTripId();
      state.tripId = (cur && trips.some(function (t) { return t.id === cur; })) ? cur : (trips[0] ? trips[0].id : null);
    }
    var trip = trips.filter(function (t) { return t.id === state.tripId; })[0];
    var days = tripDays(trip), dayOpts = '';
    for (var i = 1; i <= days; i++) dayOpts += '<option value="' + i + '">' + h(dayLabel(trip, i)) + '</option>';

    var rows = places.map(function (p, i) {
      var sub = [p.region, p.address].filter(Boolean).join(' · ');
      return '<label class="cd-row">' +
        '<input type="checkbox" class="cd-chk" data-i="' + i + '" checked>' +
        '<span style="flex:1;min-width:0"><span class="cd-nm">' + h(p.name) + '</span>' +
        '<span class="cd-sb">' + h(p.category) + (sub ? ' · ' + h(sub) : '') + (p.lat === null ? ' · 좌표 없음' : '') + '</span></span></label>';
    }).join('');

    var tripSel = trips.length
      ? '<select id="cd-trip" class="cd-sel">' + trips.map(function (t) {
          return '<option value="' + h(t.id) + '"' + (t.id === state.tripId ? ' selected' : '') + '>' + h(t.name || '(이름 없음)') + (t.startDate ? ' · ' + h(t.startDate) : '') + (t.isCompleted ? ' (완료)' : '') + '</option>';
        }).join('') + '</select>'
      : '<p class="cd-note">아직 여행이 없습니다. 창을 닫고 [New Trip]으로 여행을 먼저 만든 뒤 다시 열어 주세요.</p>';

    body.innerHTML =
      '<p class="cd-p">받은 장소 <b>' + places.length + '곳</b> · 넣을 장소를 고르세요. 시간은 비워 두고 해당 일차 끝에 들어갑니다.</p>' +
      '<div class="cd-list">' + rows + '</div>' +
      '<div class="cd-two"><div><label class="cd-lab" for="cd-trip">Trip · 여행</label>' + tripSel + '</div>' +
      '<div><label class="cd-lab" for="cd-day">Day · 일차</label><select id="cd-day" class="cd-sel"' + (trip ? '' : ' disabled') + '>' + dayOpts + '</select></div></div>' +
      (msg ? '<p id="cd-msg" class="cd-msg ' + (msg.ok ? 'ok' : 'bad') + '">' + h(msg.text) + '</p>' : '') +
      '<button type="button" id="cd-import" class="cd-btn pri blk"' + (trip ? '' : ' disabled') + '>일정에 넣기</button>';

    var ts = document.getElementById('cd-trip');
    if (ts) ts.addEventListener('change', function () { state.tripId = ts.value; renderPick(); });
    document.getElementById('cd-import').addEventListener('click', doImport);
  }

  async function doImport() {
    var btn = document.getElementById('cd-import');
    var store = getDb();
    if (!store) { renderPick({ text: '여행 데이터에 연결되지 않았습니다. 화면 오른쪽 위가 [연결됨]인지 확인해 주세요.' }); return; }
    if (editLocked()) { renderPick({ text: '지금은 [잠금됨] 상태입니다. 오른쪽 위 잠금을 풀고 다시 눌러 주세요.' }); return; }
    var trip = getTrips().filter(function (t) { return t.id === state.tripId; })[0];
    if (!trip) return;
    if (trip.isCompleted) { renderPick({ text: '[여행완료]된 여행입니다. 여행 목록에서 [수정]으로 완료를 풀고 넣어 주세요.' }); return; }
    var picked = Array.prototype.slice.call(document.querySelectorAll('.cd-chk')).filter(function (c) { return c.checked; }).map(function (c) { return state.places[+c.dataset.i]; });
    if (!picked.length) { renderPick({ text: '넣을 장소를 하나 이상 고르세요.' }); return; }
    var day = Number(document.getElementById('cd-day').value || 1);
    btn.disabled = true; btn.textContent = '넣는 중…';
    try {
      var col = store.collection('trips').doc(trip.id).collection('expected_places');
      var existing = await col.get(), have = {};
      existing.forEach(function (d) { var n = (d.data() || {}).place_name; if (n) have[String(n).trim()] = 1; });
      var fresh = picked.filter(function (p) { return !have[p.name]; });
      var batch = store.batch();
      fresh.forEach(function (p) {
        batch.set(col.doc(), {
          day: day, time: '', category: p.category, place_name: p.name, phone: p.phone, address: p.address || p.region,
          budget: 0, memo: ('[캡처 서랍] ' + p.memo).trim(), manualKm: '', manualMins: '',
          lat: p.lat, lng: p.lng, visited: false, photos: [], alternatives: [],
        });
      });
      if (fresh.length) await batch.commit();
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      var skipped = picked.length - fresh.length;
      var body = document.getElementById('cd-body');
      body.innerHTML = '<div class="cd-done"><div class="cd-kick">Added</div>' +
        '<div class="big">' + h(trip.name) + ' ' + day + '일차에 ' + fresh.length + '곳을 넣었습니다</div>' +
        (skipped ? '<p class="cd-p">이미 일정에 있는 ' + skipped + '곳은 건너뛰었습니다.</p>' : '') +
        '<p class="cd-p">시간은 비어 있습니다. 일정에서 장소를 눌러 시간을 정해 주세요.</p></div>' +
        '<button type="button" id="cd-go" class="cd-btn pri blk">이 여행 일정 보기</button>';
      document.getElementById('cd-go').addEventListener('click', function () {
        closeModal();
        if (typeof window.selectTrip === 'function') window.selectTrip(trip.id, 'plan');
      });
    } catch (e) {
      renderPick({ text: '넣지 못했습니다: ' + (e && e.message ? e.message : e) });
    }
  }

  /* ---------- 보관함 동기화 (trips/__capture_library__/places) ---------- */
  var LIB_ID = '__capture_library__';
  var LIB = [];            // 실시간 보관함
  var libUnsub = null;
  var pendingVisit = {};
  function libCol(store) { return store.collection('trips').doc(LIB_ID).collection('places'); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function todayStr() { return ymd(new Date()); }
  function md(s) { return s ? s.slice(5).replace('-', '.') : ''; }
  function isKorea(lat, lng) { return lat > 32.8 && lat < 38.9 && lng > 124.5 && lng < 131.9; }
  function normName(s) { return String(s || '').toLowerCase().replace(/[\s()\[\]·.,'"!?~\-_\/&]/g, ''); }
  function hav(a1, o1, a2, o2) {
    var R = 6371, r = Math.PI / 180, da = (a2 - a1) * r, dO = (o2 - o1) * r;
    var x = Math.sin(da / 2) * Math.sin(da / 2) + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dO / 2) * Math.sin(dO / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  function sameName(a, b) {
    a = normName(a); b = normName(b);
    if (a.length < 2 || b.length < 2) return false;
    var s = a.length < b.length ? a : b, l = a.length < b.length ? b : a;
    if (s.length < 3) return s === l;   // '카페' 같은 짧은 이름은 완전히 같을 때만
    return l.indexOf(s) >= 0 && s.length / l.length >= 0.5;
  }

  /* 카카오 장소 검색 — 앱이 이미 쓰는 카카오 지도 SDK(services). 지도를 아직 안 열었으면 여기서 불러옵니다. */
  function kakaoReady() {
    return new Promise(function (res) {
      var k = window.kakao;
      if (!k || !k.maps) return res(null);
      if (k.maps.services && k.maps.services.Places) return res(k.maps.services);
      var done = false, t = setTimeout(function () { if (!done) { done = true; res(null); } }, 6000);
      try {
        k.maps.load(function () {
          if (done) return; done = true; clearTimeout(t);
          res(k.maps.services && k.maps.services.Places ? k.maps.services : null);
        });
      } catch (e) { done = true; clearTimeout(t); res(null); }
    });
  }
  function kSearch(svc, q, opt) {
    return new Promise(function (res) {
      var t = setTimeout(function () { res([]); }, 5000);
      try {
        new svc.Places().keywordSearch(q, function (data, status) {
          clearTimeout(t); res(status === svc.Status.OK && Array.isArray(data) ? data : []);
        }, opt || {});
      } catch (e) { clearTimeout(t); res([]); }
    });
  }
  /** 이름이 같은(포함 관계, 길이 절반 이상) 결과 중 AI 좌표에서 가까운 것 하나. 없으면 null — 억지로 맞추지 않습니다. */
  async function verifyPlace(svc, it) {
    function pick(data, maxKm) {
      for (var i = 0; i < data.length; i++) {
        var d = data[i], lat = num(d.y), lng = num(d.x);
        if (lat === null || lng === null || !sameName(it.name, d.place_name)) continue;
        if (hav(it.lat, it.lng, lat, lng) > maxKm) continue;
        return { lat: lat, lng: lng, address: d.road_address_name || d.address_name || '', phone: d.phone || '', url: d.place_url || '', kname: d.place_name || '' };
      }
      return null;
    }
    var hit = pick(await kSearch(svc, it.name, { location: new window.kakao.maps.LatLng(it.lat, it.lng), radius: 20000 }), 20);
    if (!hit && it.region) hit = pick(await kSearch(svc, it.region.split(/\s+/).slice(0, 2).join(' ') + ' ' + it.name), 40);
    return hit;
  }

  function renderLibrary(msg) {
    var body = document.getElementById('cd-body');
    if (!body) return;
    var r = state.lib || { items: [] }, mix = {};
    r.items.forEach(function (it) { mix[it.category] = (mix[it.category] || 0) + 1; });
    var mixTx = Object.keys(mix).sort(function (a, b) { return mix[b] - mix[a]; }).map(function (k) { return k + ' ' + mix[k]; }).join(' · ');
    var t = document.getElementById('cd-title'); if (t) t.textContent = '보관함으로 받기';
    body.innerHTML =
      '<p class="cd-p">캡처 서랍의 위치 있는 장소 <b>' + r.items.length + '곳</b>을 이 앱의 보관함에 저장합니다.' +
      (mixTx ? '<br><span class="cd-sb" style="white-space:normal">' + h(mixTx) + '</span>' : '') + '</p>' +
      '<p class="cd-note">국내 장소는 카카오 지도에서 같은 이름을 찾아 위치·전화번호를 확정합니다. 저장하면 일정 탭 지도 아래 <b>동선 근처 저장 장소</b>에서 추천합니다.' +
      (r.full ? ' 보관함은 이번 목록으로 바뀝니다.' : '') +
      '<br>이 앱 주소를 아는 일행도 보관함을 볼 수 있습니다.</p>' +
      (msg ? '<p class="cd-msg ' + (msg.ok ? 'ok' : 'bad') + '">' + h(msg.text) + '</p>' : '') +
      '<p class="cd-sb" id="cd-lib-prog" style="white-space:normal;min-height:1em"></p>' +
      '<button type="button" id="cd-lib-go" class="cd-btn pri blk"' + (r.items.length ? '' : ' disabled') + '>보관함에 저장</button>';
    document.getElementById('cd-lib-go').addEventListener('click', doLibrarySync);
  }
  function libProg(text) { var p = document.getElementById('cd-lib-prog'); if (p) p.textContent = text; }

  async function doLibrarySync() {
    var store = getDb(), r = state.lib;
    if (!store) { renderLibrary({ text: '여행 데이터에 연결되지 않았습니다. 화면 오른쪽 위가 [연결됨]인지 확인해 주세요.' }); return; }
    if (!r || !r.items.length) return;
    var btn = document.getElementById('cd-lib-go'); btn.disabled = true; btn.textContent = '저장하는 중…';
    try {
      var col = libCol(store), now = Date.now(), keep = {}, oldMap = {}, ops = [];
      var old = await col.get();
      old.forEach(function (d) { oldMap[d.id] = { ref: d.ref, v: d.data() || {} }; });
      libProg('카카오 지도 준비 중…');
      var svc = await kakaoReady();
      var st = { ok: 0, miss: 0, foreign: 0, user: 0 };
      for (var i = 0; i < r.items.length; i++) {
        var it = r.items[i], prev = (oldMap[it.id] || {}).v || {};
        var d = { name: it.name, address: it.address, region: it.region, lat: it.lat, lng: it.lng, aiLat: it.lat, aiLng: it.lng,
          category: it.category, drawerCat: it.drawerCat, memo: it.memo, drawerVisit: it.visited, rating: it.rating,
          periodStart: it.ps, periodEnd: it.pe, syncedAt: now };
        if (it.userLoc) { d.verified = 'user'; d.phone = ''; d.url = ''; d.kname = ''; st.user++; }
        else if (prev.verified === true && prev.name === it.name && Math.abs((num(prev.aiLat) || 0) - it.lat) < 1e-4 && Math.abs((num(prev.aiLng) || 0) - it.lng) < 1e-4) {
          d.lat = num(prev.lat); d.lng = num(prev.lng); d.address = prev.address || it.address; d.phone = prev.phone || ''; d.url = prev.url || ''; d.kname = prev.kname || ''; d.verified = true; st.ok++;
        } else if (!isKorea(it.lat, it.lng)) { d.verified = false; d.phone = ''; d.url = ''; d.kname = ''; st.foreign++; }
        else {
          var hit = null;
          if (svc) { libProg('카카오 지도로 위치 확인 중 ' + (i + 1) + ' / ' + r.items.length); hit = await verifyPlace(svc, it); }
          if (hit) { d.lat = hit.lat; d.lng = hit.lng; if (hit.address) d.address = hit.address; d.phone = hit.phone; d.url = hit.url; d.kname = hit.kname; d.verified = true; st.ok++; }
          else { d.verified = false; d.phone = ''; d.url = ''; d.kname = ''; st.miss++; }
        }
        keep[it.id] = 1;
        ops.push(['set', col.doc(it.id), d]);
      }
      var removed = 0;
      if (r.full) Object.keys(oldMap).forEach(function (id) { if (!keep[id]) { ops.push(['del', oldMap[id].ref]); removed++; } });
      libProg('저장하는 중…');
      for (var j = 0; j < ops.length; j += 400) {
        var b = store.batch();
        // merge: 여행앱에서 기록한 방문(visitedAt)은 지우지 않음
        ops.slice(j, j + 400).forEach(function (o) { if (o[0] === 'set') b.set(o[1], o[2], { merge: true }); else b.delete(o[1]); });
        await b.commit();
      }
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      var body = document.getElementById('cd-body');
      var vtx = [st.ok ? '카카오 지도로 위치 확인 ' + st.ok + '곳' : '', st.miss ? '확인 못 함 ' + st.miss + '곳(AI 추정 위치 사용)' : '',
        st.user ? '서랍에서 직접 고친 위치 ' + st.user + '곳' : '', st.foreign ? '해외 ' + st.foreign + '곳' : ''].filter(Boolean).join(' · ');
      body.innerHTML = '<div class="cd-done"><div class="cd-kick">Synced</div>' +
        '<div class="big">보관함에 ' + r.items.length + '곳을 저장했습니다</div>' +
        (vtx ? '<p class="cd-p">' + h(vtx) + (svc || !st.miss ? '' : ' — 카카오 지도를 불러오지 못했습니다') + '</p>' : '') +
        (removed ? '<p class="cd-p">서랍에 없는 ' + removed + '곳은 보관함에서 뺐습니다.</p>' : '') +
        '<p class="cd-p">여행을 열고 일정 탭 지도 아래 <b>동선 근처 저장 장소</b>를 눌러 보세요.</p></div>' +
        '<button type="button" id="cd-lib-close" class="cd-btn pri blk">확인</button>';
      document.getElementById('cd-lib-close').addEventListener('click', closeModal);
    } catch (e) {
      renderLibrary({ text: '저장하지 못했습니다: ' + (e && e.message ? e.message : e) });
    }
  }

  function watchLibrary() {
    var store = getDb();
    if (libUnsub || !store) return;
    try {
      libUnsub = libCol(store).onSnapshot(function (snap) {
        var arr = [];
        snap.forEach(function (d) {
          var v = d.data() || {};
          if (num(v.lat) === null || num(v.lng) === null) return;
          arr.push({ id: d.id, name: v.name || '', address: v.address || '', region: v.region || '', lat: num(v.lat), lng: num(v.lng),
            category: v.category || '기타', drawerCat: v.drawerCat || '', memo: v.memo || '', verified: v.verified, phone: v.phone || '',
            url: /^https:\/\/place\.map\.kakao\.com\//.test(v.url || '') ? v.url : '', kname: v.kname || '',
            visitedAt: v.visitedAt || '', drawerVisit: !!v.drawerVisit, rating: num(v.rating), ps: v.periodStart || '', pe: v.periodEnd || '' });
        });
        LIB = arr;
        var c = document.getElementById('cd-lib-count'); if (c) c.textContent = arr.length ? ' 보관함 ' + arr.length + '곳' : '';
        NEAR.sig = '';
      }, function () { libUnsub = null; });
    } catch (e) { libUnsub = null; }
  }

  /** 이 여행에서 [방문 완료]한 장소를 보관함에 '가봤음'으로 기록 (서랍으로 보낼 방문 기록 코드의 재료). */
  function syncVisits() {
    var store = getDb(), tid = getCurrentTripId();
    if (!store || !tid || !LIB.length) return;
    var byId = {}; LIB.forEach(function (it) { byId[it.id] = it; });
    getExpected().forEach(function (e) {
      if (!e || !e.visited) return;
      var it = (e.libId && byId[e.libId]) || LIB.filter(function (x) { return sameName(x.name, e.place_name) || (x.kname && sameName(x.kname, e.place_name)); })[0];
      if (!it || it.visitedAt || pendingVisit[it.id]) return;
      pendingVisit[it.id] = 1;
      libCol(store).doc(it.id).update({ visitedAt: todayStr(), visitTrip: tid }).catch(function () { delete pendingVisit[it.id]; });
    });
  }
  function visitCode() {
    var list = LIB.filter(function (it) { return it.visitedAt && !it.drawerVisit; });
    return { n: list.length, code: list.length ? 'CDV:' + textToB64url(JSON.stringify({ v: 3, d: list.map(function (it) { return [it.id, it.visitedAt]; }) })) : '' };
  }

  /* ---------- 동선 근처 저장 장소 (일정 탭) ---------- */
  // day: 0 전체 · N 일차 · -1 내 주변
  var NEAR = { open: false, km: 3, day: 0, sig: '', msg: '', here: null, locMsg: '', code: '' };
  try { var _k = Number(localStorage.getItem('cd-near-km')); if ([1, 3, 5, 10].indexOf(_k) >= 0) NEAR.km = _k; } catch (e) {}

  function getExpected() { try { return typeof expectedData !== 'undefined' && Array.isArray(expectedData) ? expectedData : []; } catch (e) { return []; } }
  function tripCompleted() { try { return typeof isCurrentTripCompleted !== 'undefined' && isCurrentTripCompleted; } catch (e) { return false; } }
  function curTrip() { var id = getCurrentTripId(); return getTrips().filter(function (t) { return t.id === id; })[0] || null; }
  function dayDate(trip, day) {
    if (!trip || !trip.startDate) return '';
    var d = new Date(trip.startDate + 'T00:00:00'); if (isNaN(d)) return '';
    d.setDate(d.getDate() + day - 1); return ymd(d);
  }
  function todayDay(trip) {
    if (!trip || !trip.startDate) return 0;
    var n = tripDays(trip), t = todayStr();
    for (var i = 1; i <= n; i++) if (dayDate(trip, i) === t) return i;
    return 0;
  }
  /** 기간 있는 장소: 그날이 기간 안이면 in, 지났으면 over, 아직이면 before. 기간 정보 없으면 ''. */
  function periodState(it, date) {
    if (!it.ps || !date) return '';
    var e = it.pe || it.ps;
    return date < it.ps ? 'before' : date > e ? 'over' : 'in';
  }
  function normT(t) { var m = String(t || '').match(/(\d{1,2})\s*:\s*(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : 9999; }
  function toXY(lat, lng, lat0) { return [lng * 111.32 * Math.cos(lat0 * Math.PI / 180), lat * 110.574]; }
  /** 동선(점 목록, 순서대로 직선 연결)에서 각 장소까지의 거리, 끼워 넣을 구간(seg), 그 구간에 넣을 때 더 걷는 거리(detour, km). */
  function routeMatch(pts, items, km) {
    if (!pts.length) return [];
    var lat0 = pts.reduce(function (a, p) { return a + p.lat; }, 0) / pts.length;
    var P = pts.map(function (p) { return toXY(p.lat, p.lng, lat0); }), segLen = [];
    for (var i = 0; i < P.length - 1; i++) segLen.push(Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]));
    function dist(u, v) { return Math.hypot(u[0] - v[0], u[1] - v[1]); }
    var out = [];
    items.forEach(function (it) {
      var q = toXY(it.lat, it.lng, lat0), best = { off: Infinity, along: 0, seg: -1 };
      if (P.length === 1) best = { off: dist(q, P[0]), along: 0, seg: -1 };
      var acc = 0;
      for (var j = 0; j < P.length - 1; j++) {
        var a = P[j], b = P[j + 1], L = segLen[j];
        var t = L ? ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / (L * L) : 0;
        t = Math.max(0, Math.min(1, t));
        var off = dist(q, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
        if (off < best.off) best = { off: off, along: acc + t * L, seg: j };
        acc += L;
      }
      if (best.off > km) return;
      var sg = best.seg;
      var detour = sg >= 0 ? Math.max(0, dist(P[sg], q) + dist(q, P[sg + 1]) - segLen[sg]) : 2 * best.off;
      out.push({ it: it, off: best.off, along: best.along, seg: sg, detour: detour, near: sg >= 0 ? sg : 0 });
    });
    return out.sort(function (a, b) { return a.along - b.along || a.off - b.off; });
  }
  function fmtKm(k) { return k < 1 ? Math.round(k * 1000 / 50) * 50 + 'm' : (Math.round(k * 10) / 10) + 'km'; }
  /** 두 일정 사이에 넣을 때의 시간: 앞뒤 시간의 중간(10분 단위). 뒤 일정 시간이 없으면 앞 일정 + 1시간. */
  function insertTime(a, b) {
    var ta = a ? normT(a.time) : 9999, tb = b ? normT(b.time) : 9999, t = -1;
    if (ta < 9999 && tb < 9999 && tb > ta) t = Math.round((ta + tb) / 20) * 10;
    else if (ta < 9999 && !b) t = ta + 60;
    if (t < 0 || t >= 24 * 60) return '';
    return pad2(Math.floor(t / 60)) + ':' + pad2(t % 60);
  }
  function excludeNames() {
    var names = {};
    getExpected().forEach(function (e) { if (e.place_name) names[normName(e.place_name)] = 1; });
    return LIB.filter(function (it) { return !names[normName(it.name)] && !(it.kname && names[normName(it.kname)]); });
  }

  /** 일차마다 그날 일정(시간순) 좌표를 직선으로 이은 동선을 만들고, 보관함 장소를 가장 덜 돌아가는 일차·구간 하나에 붙입니다. */
  function nearMatches() {
    var byDay = {}, trip = curTrip();
    getExpected().forEach(function (e) {
      var lat = num(e.lat), lng = num(e.lng), d = Number(e.day) || 1;
      if (lat === null || lng === null || (!lat && !lng)) return;
      (byDay[d] = byDay[d] || []).push({ lat: lat, lng: lng, t: normT(e.time), time: e.time || '', name: e.place_name || '' });
    });
    var cand = excludeNames(), best = {};
    Object.keys(byDay).forEach(function (d) {
      var pts = byDay[d].sort(function (a, b) { return a.t - b.t; });
      routeMatch(pts, cand, NEAR.km).forEach(function (m) {
        var cur = best[m.it.id];
        if (cur && cur.detour <= m.detour) return;
        var a = m.seg >= 0 ? pts[m.seg] : pts[0], b = m.seg >= 0 ? pts[m.seg + 1] : null;
        best[m.it.id] = { it: m.it, off: m.off, detour: m.detour, along: m.along, day: Number(d), a: a, b: b, single: m.seg < 0,
          time: m.seg >= 0 ? insertTime(a, b) : '', pstate: periodState(m.it, dayDate(trip, Number(d))) };
      });
    });
    var list = Object.keys(best).map(function (k) { return best[k]; });
    list.sort(function (x, y) { return dimRank(x) - dimRank(y) || x.day - y.day || x.along - y.along; });
    return { list: list, days: Object.keys(byDay).map(Number).sort(function (a, b) { return a - b; }), hasRoute: Object.keys(byDay).length > 0 };
  }
  function dimRank(m) { return m.pstate === 'over' || m.pstate === 'before' ? 1 : 0; }
  function hereMatches() {
    if (!NEAR.here) return [];
    var today = todayStr();
    return routeMatch([NEAR.here], excludeNames(), NEAR.km).map(function (m) {
      return { it: m.it, off: m.off, here: true, pstate: periodState(m.it, today) };
    }).sort(function (x, y) { return dimRank(x) - dimRank(y) || x.off - y.off; });
  }

  function ensureNearPanel() {
    var host = document.getElementById('plan-map-card');
    if (!host) return null;
    var el = document.getElementById('cd-near');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cd-near';
      host.appendChild(el);
      el.addEventListener('click', onNearClick);
    }
    return el;
  }

  function rowHtml(m, showDay, addDay) {
    var it = m.it;
    var name = it.url ? '<a href="' + h(it.url) + '" target="_blank" rel="noopener">' + h(it.name) + '</a>' : h(it.name);
    var bits = [h(it.drawerCat || it.category), h(it.region)];
    if (it.verified === false) bits.push('위치 추정');
    if (it.drawerVisit || it.visitedAt) bits.push('<span class="cd-tag">✓' + (it.rating ? ' ★' + it.rating : ' 가봤음') + '</span>');
    if (m.pstate === 'in') bits.push('<span class="cd-tag pt">기간 중</span>');
    else if (m.pstate === 'over') bits.push('<span class="cd-tag">' + md(it.pe || it.ps) + ' 종료</span>');
    else if (m.pstate === 'before') bits.push('<span class="cd-tag">' + md(it.ps) + '부터</span>');
    var day = showDay ? m.day + '일차 ' : '', where;
    if (m.here) where = '여기서 ' + fmtKm(m.off);
    else if (m.single) where = day + fmtKm(m.off) + ' · ' + h(m.a.name) + ' 근처';
    else where = day + (m.detour < 0.05 ? '동선 위' : '+' + fmtKm(m.detour)) + ' · ' + h(m.a.name) + ' → ' + h(m.b.name) + ' 사이';
    var btn = addDay ? '<button type="button" class="cd-btn" data-near="add" data-id="' + h(it.id) + '" data-day="' + addDay + '" data-time="' + h(m.time || '') + '">+ ' + addDay + '일차</button>' : '';
    return '<div class="cd-nrow' + (dimRank(m) ? ' dim' : '') + '"><span class="tx"><span class="cd-nm">' + name + '</span>' +
      '<span class="cd-sb">' + bits.filter(Boolean).join(' · ') + '</span>' +
      '<span class="cd-off">' + where + '</span></span>' + btn + '</div>';
  }

  function renderNear() {
    var el = ensureNearPanel();
    if (!el) return;
    if (!getCurrentTripId()) { el.hidden = true; return; }
    el.hidden = false;
    var trip = curTrip(), r = nearMatches(), here = NEAR.day === -1;
    if (NEAR.day > 0 && r.days.indexOf(NEAR.day) < 0) NEAR.day = 0;
    var shown = here ? hereMatches() : NEAR.day ? r.list.filter(function (m) { return m.day === NEAR.day; }) : r.list;
    var cnt = here ? shown.length : r.list.length;
    var head = '<button type="button" class="cd-nearhead" data-near="toggle" aria-expanded="' + NEAR.open + '">' +
      '<i class="fa-solid fa-route" style="color:var(--pt,#8C2F3D)"></i><span class="tx"><span class="bi-en">Nearby Saved</span><span class="bi-ko">동선 근처 저장 장소</span></span>' +
      '<span class="cd-count' + (cnt ? ' on' : '') + '">' + cnt + '곳</span>' +
      '<i class="fa-solid fa-chevron-' + (NEAR.open ? 'up' : 'down') + '" style="font-size:11px;color:var(--g500,#74716B)"></i></button>';
    if (!NEAR.open) { el.innerHTML = head; return; }
    var body;
    if (!LIB.length) {
      body = '<p class="cd-p">보관함이 비어 있습니다. 캡처 서랍 <b>Route · 동선</b> 탭 아래 <b>여행앱 보관함으로 보내기</b>를 누르면 저장한 장소가 여기로 옵니다.</p>';
    } else {
      var dayChips = '<button type="button" class="cd-chip' + (NEAR.day === 0 ? ' on' : '') + '" data-near="day" data-v="0">전체</button>' +
        r.days.map(function (d) { return '<button type="button" class="cd-chip' + (NEAR.day === d ? ' on' : '') + '" data-near="day" data-v="' + d + '">' + d + '일차</button>'; }).join('') +
        '<button type="button" class="cd-chip' + (here ? ' on' : '') + '" data-near="here"><i class="fa-solid fa-location-crosshairs"></i> 내 주변</button>';
      var kmChips = [1, 3, 5, 10].map(function (k) { return '<button type="button" class="cd-chip' + (NEAR.km === k ? ' on' : '') + '" data-near="km" data-v="' + k + '">' + k + 'km</button>'; }).join('');
      var rows, tday = todayDay(trip);
      if (here) {
        rows = NEAR.locMsg ? '<p class="cd-p">' + h(NEAR.locMsg) + '</p>'
          : shown.length ? shown.map(function (m) { return rowHtml(m, false, tday); }).join('')
          : '<p class="cd-p">지금 위치에서 ' + NEAR.km + 'km 안에 저장 장소가 없습니다.</p>';
      } else if (!r.hasRoute) {
        rows = '<p class="cd-p">이 여행 일정에 위치(좌표)가 있는 장소가 아직 없습니다. 일정을 추가하면 그 동선 근처의 저장 장소를 찾아 드립니다.</p>';
      } else {
        rows = shown.length ? shown.map(function (m) { return rowHtml(m, !NEAR.day, m.day); }).join('')
          : '<p class="cd-p">' + NEAR.km + 'km 안에 저장 장소가 없습니다. 거리를 넓혀 보세요.</p>';
      }
      var vc = visitCode();
      body = '<div class="cd-chips">' + dayChips + '</div><div class="cd-chips">' + kmChips + '</div>' +
        (NEAR.msg ? '<p class="cd-msg ' + (NEAR.msg.ok ? 'ok' : 'bad') + '">' + h(NEAR.msg.text) + '</p>' : '') +
        '<div class="cd-list">' + rows + '</div>' +
        '<p class="cd-foot">' + (here ? '현재 위치 기준 직선거리입니다.' : '+거리는 그 사이에 넣을 때 더 가는 직선거리입니다.') +
        (vc.n ? ' <button type="button" class="cd-link" data-near="vcode">방문 기록 ' + vc.n + '곳 서랍으로</button>' : '') + '</p>' +
        (NEAR.code ? '<textarea class="cd-ta" rows="2" readonly>' + h(NEAR.code) + '</textarea>' : '');
    }
    el.innerHTML = head + '<div class="cd-nearbody">' + body + '</div>';
  }

  function locate() {
    if (!navigator.geolocation) { NEAR.locMsg = '이 브라우저는 위치 기능을 지원하지 않습니다.'; renderNear(); return; }
    NEAR.locMsg = '현재 위치를 확인하는 중…'; NEAR.here = null; renderNear();
    navigator.geolocation.getCurrentPosition(function (p) {
      NEAR.here = { lat: p.coords.latitude, lng: p.coords.longitude, name: '현재 위치' }; NEAR.locMsg = ''; NEAR.sig = ''; renderNear();
    }, function () {
      NEAR.locMsg = '위치를 확인하지 못했습니다. 브라우저의 위치 권한을 허용해 주세요.'; NEAR.sig = ''; renderNear();
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  async function onNearClick(e) {
    if (e.target.closest('a')) return;
    var b = e.target.closest('[data-near]');
    if (!b) return;
    var k = b.dataset.near;
    if (k !== 'vcode') NEAR.code = '';
    if (k === 'toggle') { NEAR.open = !NEAR.open; NEAR.msg = ''; NEAR.code = ''; }
    else if (k === 'day') { NEAR.day = Number(b.dataset.v) || 0; NEAR.msg = ''; }
    else if (k === 'here') { NEAR.day = -1; NEAR.msg = ''; locate(); return; }
    else if (k === 'km') { NEAR.km = Number(b.dataset.v) || 3; try { localStorage.setItem('cd-near-km', String(NEAR.km)); } catch (er) {} }
    else if (k === 'vcode') {
      var vc = visitCode();
      try { await navigator.clipboard.writeText(vc.code); NEAR.code = ''; NEAR.msg = { ok: true, text: '복사했습니다. 캡처 서랍 동선 탭 › 여행앱 방문 기록 가져오기에 붙여넣으세요.' }; }
      catch (er) { NEAR.code = vc.code; NEAR.msg = { ok: true, text: '아래 코드를 길게 눌러 복사한 뒤 캡처 서랍에 붙여넣으세요.' }; }
    }
    else if (k === 'add') {
      var store = getDb(), tid = getCurrentTripId();
      var it = LIB.filter(function (x) { return x.id === b.dataset.id; })[0], day = Number(b.dataset.day) || 1, time = b.dataset.time || '';
      if (!store || !tid || !it) return;
      if (tripCompleted()) NEAR.msg = { text: '[여행완료]된 여행입니다. 완료를 풀고 넣어 주세요.' };
      else if (editLocked()) NEAR.msg = { text: '지금은 [잠금됨] 상태입니다. 오른쪽 위 잠금을 풀고 다시 눌러 주세요.' };
      else {
        b.disabled = true; b.textContent = '넣는 중…';
        try {
          await store.collection('trips').doc(tid).collection('expected_places').add({
            day: day, time: time, category: it.category, place_name: it.name, phone: it.phone || '', address: it.address || it.region,
            budget: 0, memo: ('[캡처 서랍] ' + (it.memo || '')).trim(), manualKm: '', manualMins: '',
            lat: it.lat, lng: it.lng, visited: false, photos: [], alternatives: [], libId: it.id,
          });
          NEAR.msg = { ok: true, text: it.name + ' → ' + day + '일차 ' + (time ? time + '에 넣었습니다.' : '에 넣었습니다 (시간 미정).') };
        } catch (er) { NEAR.msg = { text: '넣지 못했습니다: ' + (er && er.message ? er.message : er) }; }
      }
    }
    NEAR.sig = ''; renderNear();
  }

  function nearSig() {
    var exp = getExpected();
    return [getCurrentTripId(), LIB.map(function (x) { return x.id + x.lat + x.lng + x.visitedAt + x.drawerVisit + x.rating; }).join(','), NEAR.open, NEAR.km, NEAR.day,
      NEAR.here ? NEAR.here.lat + ',' + NEAR.here.lng : '', NEAR.locMsg,
      exp.map(function (e) { return e.id + ':' + e.day + ':' + e.time + ':' + e.lat + ':' + e.lng + ':' + e.place_name + ':' + e.visited; }).join('|'),
      !!document.getElementById('cd-near')].join('#');
  }
  function tick() {
    watchLibrary();
    syncVisits();
    var sg = nearSig();
    if (sg !== NEAR.sig) { NEAR.sig = sg; renderNear(); }
  }

  /* ---------- 일정표 받기 (캡처 서랍이 사진·PDF·엑셀에서 읽은 일정, v4) ---------- */
  var DRAWER_URL = 'https://claude.ai/artifact/GFDGGX26DH7fpSbS5V939H';
  function planDays(p) { var m = 1; p.places.forEach(function (x) { if (x.day > m) m = x.day; }); return m; }
  function renderPlanImport(msg) {
    var body = document.getElementById('cd-body');
    if (!body) return;
    var p = state.plan, t = p.trip, trips = sortedTrips().filter(function (x) { return !x.isCompleted; });
    var t0 = document.getElementById('cd-title'); if (t0) t0.textContent = '일정표 받기';
    if (state.planMode !== 'add' || !trips.length) state.planMode = state.planMode === 'add' && trips.length ? 'add' : 'new';
    if (state.planMode === 'add' && !trips.some(function (x) { return x.id === state.tripId; })) {
      var cur = getCurrentTripId(); state.tripId = trips.some(function (x) { return x.id === cur; }) ? cur : trips[0].id;
    }
    var byDay = {}; p.places.forEach(function (x) { byDay[x.day] = (byDay[x.day] || 0) + 1; });
    var dayTx = Object.keys(byDay).sort(function (a, b) { return a - b; }).map(function (d) { return d + '일차 ' + byDay[d]; }).join(' · ');
    var rows = p.places.slice(0, 40).map(function (x) {
      return '<div class="cd-row" style="cursor:default"><span style="flex:1;min-width:0"><span class="cd-nm">' + h(x.name) + '</span>' +
        '<span class="cd-sb k">' + x.day + '일차' + (x.time ? ' ' + h(x.time) : '') + ' · ' + h(x.category) + (x.lat === null ? '' : '') + '</span></span></div>';
    }).join('') + (p.places.length > 40 ? '<p class="cd-p">외 ' + (p.places.length - 40) + '곳</p>' : '');
    var modeSeg = '<div class="cd-chips" role="group" aria-label="넣을 곳">' +
      '<button type="button" class="cd-chip k' + (state.planMode === 'new' ? ' on' : '') + '" data-pm="new">새 여행으로 만들기</button>' +
      '<button type="button" class="cd-chip k' + (state.planMode === 'add' ? ' on' : '') + '" data-pm="add"' + (trips.length ? '' : ' disabled') + '>기존 여행에 더하기</button></div>';
    var target = state.planMode === 'new'
      ? '<div class="cd-two"><div><label class="cd-lab" for="cd-ps">Start · 시작일</label><input id="cd-ps" type="date" class="cd-sel" value="' + h(t.s || '') + '"></div>' +
        '<div><label class="cd-lab" for="cd-pm">People · 인원</label><input id="cd-pm" type="number" min="1" max="99" class="cd-sel" value="' + (t.m || 8) + '"></div></div>'
      : '<div><label class="cd-lab" for="cd-trip">Trip · 여행</label><select id="cd-trip" class="cd-sel">' + trips.map(function (x) {
          return '<option value="' + h(x.id) + '"' + (x.id === state.tripId ? ' selected' : '') + '>' + h(x.name || '(이름 없음)') + (x.startDate ? ' · ' + h(x.startDate) : '') + '</option>';
        }).join('') + '</select></div>';
    body.innerHTML =
      '<div><div class="cd-nm" style="font-size:16px;white-space:normal">' + h(t.n || '새 여행') + '</div>' +
      '<span class="cd-sb k" style="white-space:normal">' + h([t.s && t.e ? t.s + ' ~ ' + t.e : t.s, t.m ? t.m + '명' : '', '장소 ' + p.places.length + '곳', dayTx].filter(Boolean).join(' · ')) + '</span></div>' +
      '<div class="cd-list">' + rows + '</div>' + modeSeg + target +
      '<p class="cd-note">AI가 일정표에서 읽은 값입니다. 국내 장소는 카카오 지도에서 같은 이름을 찾아 위치·전화번호를 채웁니다. 넣은 뒤 일정 탭에서 시간·장소를 한 번 확인해 주세요.</p>' +
      (msg ? '<p class="cd-msg ' + (msg.ok ? 'ok' : 'bad') + '">' + h(msg.text) + '</p>' : '') +
      '<p class="cd-sb" id="cd-plan-prog" style="white-space:normal;min-height:1em"></p>' +
      '<button type="button" id="cd-plan-go" class="cd-btn pri blk">' + (state.planMode === 'new' ? '새 여행 만들기' : '이 여행에 더하기') + '</button>';
    body.querySelectorAll('[data-pm]').forEach(function (b) { b.addEventListener('click', function () { state.planMode = b.dataset.pm; renderPlanImport(); }); });
    var ts = document.getElementById('cd-trip'); if (ts) ts.addEventListener('change', function () { state.tripId = ts.value; });
    document.getElementById('cd-plan-go').addEventListener('click', doPlanImport);
  }

  async function verifyNoLoc(svc, name, area) {
    var data = await kSearch(svc, (area ? area + ' ' : '') + name);
    for (var i = 0; i < data.length; i++) {
      var d = data[i], lat = num(d.y), lng = num(d.x);
      if (lat === null || lng === null || !sameName(name, d.place_name)) continue;
      var addr = (d.road_address_name || '') + ' ' + (d.address_name || '');
      if (area && addr.indexOf(area) < 0 && String(d.place_name).indexOf(area) < 0) continue;
      return { lat: lat, lng: lng, address: d.road_address_name || d.address_name || '', phone: d.phone || '' };
    }
    return null;
  }

  async function doPlanImport() {
    var store = getDb(), p = state.plan, t = p.trip;
    if (!store) { renderPlanImport({ text: '여행 데이터에 연결되지 않았습니다. 화면 오른쪽 위가 [연결됨]인지 확인해 주세요.' }); return; }
    if (editLocked()) { renderPlanImport({ text: '지금은 [잠금됨] 상태입니다. 오른쪽 위 잠금을 풀고 다시 눌러 주세요.' }); return; }
    var isNew = state.planMode === 'new', tripId, tripName, start;
    if (isNew) {
      start = (document.getElementById('cd-ps') || {}).value || t.s;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '')) { renderPlanImport({ text: '시작일을 넣어 주세요.' }); return; }
      var mem = Number((document.getElementById('cd-pm') || {}).value) || t.m || 8;
      t.s = start; t.m = mem;
    }
    var btn = document.getElementById('cd-plan-go'); btn.disabled = true; btn.textContent = '넣는 중…';
    var prog = function (x) { var e = document.getElementById('cd-plan-prog'); if (e) e.textContent = x; };
    try {
      var have = {};
      if (isNew) {
        var end = t.e && t.e >= start ? t.e : (function () { var d = new Date(start + 'T00:00:00'); d.setDate(d.getDate() + planDays(p) - 1); return ymd(d); })();
        var payload = { name: t.n || '새 여행', region: t.g === 'global' ? 'global' : 'kr', subRegion: '', memberCount: t.m || 8, startDate: start, endDate: end, isCompleted: false };
        try { if (typeof inferTripSubRegion === 'function') payload.subRegion = inferTripSubRegion({ name: payload.name + ' ' + (t.a || ''), region: payload.region }) || ''; } catch (e) {}
        var ref = await store.collection('trips').add(payload);
        tripId = ref.id; tripName = payload.name;
      } else {
        var trip = getTrips().filter(function (x) { return x.id === state.tripId; })[0];
        if (!trip) return;
        if (trip.isCompleted) { renderPlanImport({ text: '[여행완료]된 여행입니다.' }); return; }
        tripId = trip.id; tripName = trip.name;
        var ex = await store.collection('trips').doc(tripId).collection('expected_places').get();
        ex.forEach(function (d) { var v = d.data() || {}; if (v.place_name) have[v.day + '|' + normName(v.place_name)] = 1; });
      }
      var domestic = t.g !== 'global', svc = domestic ? (prog('카카오 지도 준비 중…'), await kakaoReady()) : null, st = { ok: 0, ai: 0, none: 0, dup: 0 };
      var col = store.collection('trips').doc(tripId).collection('expected_places'), ops = [];
      for (var i = 0; i < p.places.length; i++) {
        var x = p.places[i];
        if (have[x.day + '|' + normName(x.name)]) { st.dup++; continue; }
        var lat = x.lat, lng = x.lng, address = x.address, phone = x.phone, hit = null;
        var skipSearch = x.category === '출발/귀가' || x.category === '교통비' || x.category === '통신,보험';
        if (svc && !skipSearch) {
          prog('카카오 지도로 위치 확인 중 ' + (i + 1) + ' / ' + p.places.length);
          hit = lat !== null && isKorea(lat, lng) ? await verifyPlace(svc, { name: x.name, lat: lat, lng: lng, region: t.a || '' }) : await verifyNoLoc(svc, x.name, t.a || '');
        }
        if (hit) { lat = hit.lat; lng = hit.lng; if (!address && hit.address) address = hit.address; if (!phone && hit.phone) phone = hit.phone; st.ok++; }
        else if (lat !== null) st.ai++; else st.none++;
        ops.push({ day: x.day, time: x.time || '', category: x.category, place_name: x.name, phone: phone || '', address: address || '',
          budget: x.budget || 0, memo: x.memo || '', manualKm: '', manualMins: '', lat: lat, lng: lng, visited: false, photos: [], alternatives: [] });
      }
      prog('저장하는 중…');
      for (var j = 0; j < ops.length; j += 400) {
        var b = store.batch();
        ops.slice(j, j + 400).forEach(function (d) { b.set(col.doc(), d); });
        await b.commit();
      }
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      var body = document.getElementById('cd-body');
      var vtx = [st.ok ? '카카오 지도로 위치 확인 ' + st.ok + '곳' : '', st.ai ? 'AI 추정 위치 ' + st.ai + '곳' : '', st.none ? '위치 없음 ' + st.none + '곳' : ''].filter(Boolean).join(' · ');
      body.innerHTML = '<div class="cd-done"><div class="cd-kick">' + (isNew ? 'Trip created' : 'Added') + '</div>' +
        '<div class="big">' + h(tripName) + '</div>' +
        '<p class="cd-p">' + (isNew ? '새 여행을 만들고 일정 ' : '이 여행에 일정 ') + ops.length + '곳을 넣었습니다.</p>' +
        (vtx ? '<p class="cd-p">' + h(vtx) + '</p>' : '') +
        (st.dup ? '<p class="cd-p">같은 일차에 이미 있는 ' + st.dup + '곳은 건너뛰었습니다.</p>' : '') +
        (st.none ? '<p class="cd-p">위치 없는 일정은 지도에 안 나옵니다. 일정에서 [수정] → 장소 검색으로 채워 주세요.</p>' : '') + '</div>' +
        '<button type="button" id="cd-go" class="cd-btn pri blk">이 여행 일정 보기</button>';
      document.getElementById('cd-go').addEventListener('click', function () {
        closeModal();
        setTimeout(function () { if (typeof window.selectTrip === 'function') window.selectTrip(tripId, 'plan'); }, 0);
      });
    } catch (e) {
      renderPlanImport({ text: '넣지 못했습니다: ' + (e && e.message ? e.message : e) });
    }
  }

  /* 엑셀 복원 버튼에 사진·PDF·다른 양식 엑셀을 넣으면: 캡처 서랍으로 안내 (백업 양식 엑셀은 원래 복원 그대로) */
  function isRestoreInput(el) { return el && el.tagName === 'INPUT' && el.type === 'file' && /restoreFromExcelFile/.test(el.getAttribute('onchange') || ''); }
  function openPlanGuide(fileName, why) {
    openModal(null, true);
    var t0 = document.getElementById('cd-title'); if (t0) t0.textContent = '일정표 파일 읽기';
    document.getElementById('cd-body').innerHTML =
      '<p class="cd-p"><b>' + h(fileName) + '</b> — ' + h(why) + '</p>' +
      '<p class="cd-p">사진·PDF·양식이 다른 엑셀 일정표는 AI가 읽어야 해서 <b>캡처 서랍</b>에서 처리합니다.</p>' +
      '<ol class="cd-ol"><li>아래 버튼으로 캡처 서랍을 엽니다</li><li>Add · 추가 탭 → <b>여행 일정표</b> → 이 파일 선택 → [일정 읽기]</li><li>[여행앱으로 보내기] → 이 앱에서 [새 여행 만들기]</li></ol>' +
      '<a class="cd-btn pri blk" href="' + DRAWER_URL + '" target="_blank" rel="noopener">캡처 서랍 열기</a>' +
      '<p class="cd-sb k" style="white-space:normal">캡처 서랍은 만든 사람의 Claude 계정에서만 열립니다.</p>';
  }
  function hookRestoreInput() {
    document.querySelectorAll('input[type=file]').forEach(function (el) {
      if (isRestoreInput(el) && el.accept.indexOf('.pdf') < 0) el.accept = '.xlsx,.xls,image/*,.pdf';
    });
  }
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!isRestoreInput(el) || el.__cdPass) return;
    var f = el.files && el.files[0];
    if (!f) return;
    var isImg = /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(f.name), isPdf = /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name);
    if (isImg || isPdf) {
      e.stopImmediatePropagation(); e.stopPropagation();
      openPlanGuide(f.name, isPdf ? 'PDF 파일입니다.' : '사진 파일입니다.'); el.value = ''; return;
    }
    if (!/\.(xlsx|xls)$/i.test(f.name) || typeof XLSX === 'undefined') return;
    // 엑셀이면 시트 이름만 먼저 보고: 백업 양식(여행목록 시트)이면 원래 복원으로 넘김
    e.stopImmediatePropagation(); e.stopPropagation();
    f.arrayBuffer().then(function (buf) {
      var names = [];
      try { names = XLSX.read(new Uint8Array(buf), { type: 'array', bookSheets: true }).SheetNames || []; } catch (er) {}
      if (names.indexOf('여행목록') >= 0 && typeof window.restoreFromExcelFile === 'function') window.restoreFromExcelFile({ target: el });
      else { openPlanGuide(f.name, '여행매니저 백업 양식(여행목록·예상일정 시트)이 아닌 엑셀입니다.'); el.value = ''; }
    });
  }, true);

  /* ---------- 링크로 열렸을 때 ---------- */
  async function handleHash() {
    if (!/[#&]cdz?=/.test(location.hash)) return;
    var r = await parseAny(location.hash);
    if (!r) return;
    var tries = 0;
    (function wait() {
      // 여행 목록·저장소 연결이 실시간으로 들어올 때까지 최대 4초 기다립니다.
      if ((getTrips().length && getDb()) || tries++ > 20) {
        if (r.kind === 'library') { openModal(null, true); state.lib = r; renderLibrary(); }
        else if (r.kind === 'plan') { openModal(null, true); state.plan = r; state.planMode = 'new'; renderPlanImport(); }
        else if (r.kind === 'error') { openModal(null); renderPaste(r.text); }
        else openModal(r.list);
      } else setTimeout(wait, 200);
    })();
  }

  function boot() { injectStyle(); injectHomeCard(); hookRestoreInput(); handleHash(); watchLibrary(); tick(); setInterval(tick, 800); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.addEventListener('hashchange', handleHash);
  window.CaptureImport = { parse: parsePayload, parseAny: parseAny, routeMatch: routeMatch, insertTime: insertTime, sameName: sameName, open: openModal, _lib: function () { return LIB; } };
})();
