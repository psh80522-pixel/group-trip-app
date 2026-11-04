/*
 * 캡처 서랍 → 여행매니저 장소 가져오기 (capture-import.js)
 * - 캡처 서랍의 [여행앱으로 보내기] 링크(#cd=...)로 열리면 가져오기 창을 자동으로 띄웁니다.
 * - 첫 화면의 [캡처 서랍에서 가져오기] 카드에서 복사한 코드를 붙여넣어도 됩니다.
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
          category: PLACE_CATS.indexOf(p.c) >= 0 ? p.c : '기타', drawerCat: str(p.k, 20), memo: str(p.m, 200) };
      }).filter(Boolean);
      return { kind: 'library', items: items, full: json.full === true };
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
      '<p class="text-[11px] text-slate-500 mt-0.5">캡처 서랍에서 담은 맛집·장소를 여행 일정에 넣습니다. <span id="cd-lib-count" class="cd-kick"></span></p></div>' +
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
  function libCol(store) { return store.collection('trips').doc(LIB_ID).collection('places'); }

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
      '<p class="cd-note">저장하면 일정 탭 지도 아래 <b>Nearby Saved · 동선 근처 저장 장소</b>에서 일차별 동선 근처 장소를 추천합니다.' +
      (r.full ? ' 보관함은 이번 목록으로 <b>통째로 바뀝니다</b>(서랍에서 지운 장소는 여기서도 빠짐).' : '') +
      '<br>이 앱 주소를 아는 일행도 보관함을 볼 수 있습니다.</p>' +
      (msg ? '<p class="cd-msg ' + (msg.ok ? 'ok' : 'bad') + '">' + h(msg.text) + '</p>' : '') +
      '<button type="button" id="cd-lib-go" class="cd-btn pri blk"' + (r.items.length ? '' : ' disabled') + '>보관함에 저장</button>';
    document.getElementById('cd-lib-go').addEventListener('click', doLibrarySync);
  }

  async function doLibrarySync() {
    var store = getDb(), r = state.lib;
    if (!store) { renderLibrary({ text: '여행 데이터에 연결되지 않았습니다. 화면 오른쪽 위가 [연결됨]인지 확인해 주세요.' }); return; }
    if (!r || !r.items.length) return;
    var btn = document.getElementById('cd-lib-go'); btn.disabled = true; btn.textContent = '저장하는 중…';
    try {
      var col = libCol(store), now = Date.now(), keep = {}, ops = [];
      r.items.forEach(function (it) {
        keep[it.id] = 1;
        ops.push(['set', col.doc(it.id), { name: it.name, address: it.address, region: it.region, lat: it.lat, lng: it.lng,
          category: it.category, drawerCat: it.drawerCat, memo: it.memo, syncedAt: now }]);
      });
      var removed = 0;
      if (r.full) {
        var old = await col.get();
        old.forEach(function (d) { if (!keep[d.id]) { ops.push(['del', d.ref]); removed++; } });
      }
      for (var i = 0; i < ops.length; i += 400) {
        var b = store.batch();
        ops.slice(i, i + 400).forEach(function (o) { if (o[0] === 'set') b.set(o[1], o[2]); else b.delete(o[1]); });
        await b.commit();
      }
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      var body = document.getElementById('cd-body');
      body.innerHTML = '<div class="cd-done"><div class="cd-kick">Synced</div>' +
        '<div class="big">보관함에 ' + r.items.length + '곳을 저장했습니다</div>' +
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
        snap.forEach(function (d) { var v = d.data() || {}; if (num(v.lat) !== null && num(v.lng) !== null) arr.push({ id: d.id, name: v.name || '', address: v.address || '', region: v.region || '', lat: num(v.lat), lng: num(v.lng), category: v.category || '기타', drawerCat: v.drawerCat || '', memo: v.memo || '' }); });
        LIB = arr;
        var c = document.getElementById('cd-lib-count'); if (c) c.textContent = arr.length ? ' 보관함 ' + arr.length + '곳' : '';
        NEAR.sig = '';
      }, function () { libUnsub = null; });
    } catch (e) { libUnsub = null; }
  }

  /* ---------- 동선 근처 저장 장소 (일정 탭) ---------- */
  var NEAR = { open: false, km: 3, day: 0, sig: '', msg: '' };
  try { var _k = Number(localStorage.getItem('cd-near-km')); if ([1, 3, 5, 10].indexOf(_k) >= 0) NEAR.km = _k; } catch (e) {}

  function getExpected() { try { return typeof expectedData !== 'undefined' && Array.isArray(expectedData) ? expectedData : []; } catch (e) { return []; } }
  function tripCompleted() { try { return typeof isCurrentTripCompleted !== 'undefined' && isCurrentTripCompleted; } catch (e) { return false; } }
  function normT(t) { var m = String(t || '').match(/(\d{1,2})\s*:\s*(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : 9999; }
  function toXY(lat, lng, lat0) { return [lng * 111.32 * Math.cos(lat0 * Math.PI / 180), lat * 110.574]; }
  /** 동선(점 목록, 순서대로 직선 연결)에서 각 장소까지 가장 가까운 거리(km)와 동선상 위치. */
  function routeMatch(pts, items, km) {
    if (!pts.length) return [];
    var lat0 = pts.reduce(function (a, p) { return a + p.lat; }, 0) / pts.length;
    var P = pts.map(function (p) { return toXY(p.lat, p.lng, lat0); }), segLen = [];
    for (var i = 0; i < P.length - 1; i++) segLen.push(Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]));
    var out = [];
    items.forEach(function (it) {
      var q = toXY(it.lat, it.lng, lat0), best = { off: Infinity, along: 0, near: 0 };
      if (P.length === 1) best = { off: Math.hypot(q[0] - P[0][0], q[1] - P[0][1]), along: 0, near: 0 };
      var acc = 0;
      for (var j = 0; j < P.length - 1; j++) {
        var a = P[j], b = P[j + 1], L = segLen[j];
        var t = L ? ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / (L * L) : 0;
        t = Math.max(0, Math.min(1, t));
        var x = a[0] + t * (b[0] - a[0]), y = a[1] + t * (b[1] - a[1]), off = Math.hypot(q[0] - x, q[1] - y);
        if (off < best.off) best = { off: off, along: acc + t * L, near: t < 0.5 ? j : j + 1 };
        acc += L;
      }
      if (best.off <= km) out.push({ it: it, off: best.off, along: best.along, near: best.near });
    });
    return out.sort(function (a, b) { return a.along - b.along || a.off - b.off; });
  }
  function fmtKm(k) { return k < 1 ? Math.round(k * 1000) + 'm' : (Math.round(k * 10) / 10) + 'km'; }

  /** 일차마다 그날 일정(시간순) 좌표를 직선으로 이은 동선을 만들고, 보관함 장소를 가장 가까운 일차 하나에 붙입니다. */
  function nearMatches() {
    var exp = getExpected(), names = {}, byDay = {};
    exp.forEach(function (e) {
      if (e.place_name) names[String(e.place_name).trim()] = 1;
      var lat = num(e.lat), lng = num(e.lng), d = Number(e.day) || 1;
      if (lat === null || lng === null || (!lat && !lng)) return;
      (byDay[d] = byDay[d] || []).push({ lat: lat, lng: lng, t: normT(e.time), name: e.place_name || '' });
    });
    var cand = LIB.filter(function (it) { return !names[String(it.name).trim()]; });
    var best = {};
    Object.keys(byDay).forEach(function (d) {
      var pts = byDay[d].sort(function (a, b) { return a.t - b.t; });
      routeMatch(pts, cand, NEAR.km).forEach(function (m) {
        var cur = best[m.it.id];
        if (!cur || m.off < cur.off) best[m.it.id] = { it: m.it, off: m.off, along: m.along, day: Number(d), nearName: (pts[m.near] || {}).name || '' };
      });
    });
    var list = Object.keys(best).map(function (k) { return best[k]; });
    list.sort(function (a, b) { return a.day - b.day || a.along - b.along; });
    return { list: list, days: Object.keys(byDay).map(Number).sort(function (a, b) { return a - b; }), hasRoute: Object.keys(byDay).length > 0 };
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

  function renderNear() {
    var el = ensureNearPanel();
    if (!el) return;
    if (!getCurrentTripId()) { el.hidden = true; return; }
    el.hidden = false;
    var r = nearMatches(), shown = NEAR.day ? r.list.filter(function (m) { return m.day === NEAR.day; }) : r.list;
    if (NEAR.day && r.days.indexOf(NEAR.day) < 0) { NEAR.day = 0; shown = r.list; }
    var head = '<button type="button" class="cd-nearhead" data-near="toggle" aria-expanded="' + NEAR.open + '">' +
      '<i class="fa-solid fa-route" style="color:var(--pt,#8C2F3D)"></i><span class="tx"><span class="bi-en">Nearby Saved</span><span class="bi-ko">동선 근처 저장 장소</span></span>' +
      '<span class="cd-count' + (r.list.length ? ' on' : '') + '">' + r.list.length + '곳</span>' +
      '<i class="fa-solid fa-chevron-' + (NEAR.open ? 'up' : 'down') + '" style="font-size:11px;color:var(--g500,#74716B)"></i></button>';
    if (!NEAR.open) { el.innerHTML = head; return; }
    var body;
    if (!LIB.length) {
      body = '<p class="cd-p">보관함이 비어 있습니다. 캡처 서랍 <b>Route · 동선</b> 탭 아래 <b>여행앱 보관함으로 보내기</b>를 누르면 저장한 장소가 여기로 옵니다.</p>';
    } else if (!r.hasRoute) {
      body = '<p class="cd-p">이 여행 일정에 위치(좌표)가 있는 장소가 아직 없습니다. 일정을 추가하면 그 동선 근처의 저장 장소를 찾아 드립니다.</p>';
    } else {
      var dayChips = '<button type="button" class="cd-chip' + (NEAR.day ? '' : ' on') + '" data-near="day" data-v="0">전체</button>' +
        r.days.map(function (d) { return '<button type="button" class="cd-chip' + (NEAR.day === d ? ' on' : '') + '" data-near="day" data-v="' + d + '">' + d + '일차</button>'; }).join('');
      var kmChips = [1, 3, 5, 10].map(function (k) { return '<button type="button" class="cd-chip' + (NEAR.km === k ? ' on' : '') + '" data-near="km" data-v="' + k + '">' + k + 'km</button>'; }).join('');
      var rows = shown.length ? shown.map(function (m) {
        var it = m.it, sub = [it.drawerCat || it.category, it.region].filter(Boolean).join(' · ');
        return '<div class="cd-nrow"><span class="tx"><span class="cd-nm">' + h(it.name) + '</span>' +
          '<span class="cd-sb">' + h(sub) + '</span>' +
          '<span class="cd-off">' + m.day + '일차 동선에서 ' + fmtKm(m.off) + (m.nearName ? ' · ' + h(m.nearName) + ' 근처' : '') + '</span></span>' +
          '<button type="button" class="cd-btn" data-near="add" data-id="' + h(it.id) + '" data-day="' + m.day + '">+ ' + m.day + '일차</button></div>';
      }).join('') : '<p class="cd-p">' + NEAR.km + 'km 안에 저장 장소가 없습니다. 거리를 넓혀 보세요.</p>';
      body = '<div class="cd-chips">' + dayChips + '</div><div class="cd-chips">' + kmChips + '</div>' +
        (NEAR.msg ? '<p class="cd-msg ' + (NEAR.msg.ok ? 'ok' : 'bad') + '">' + h(NEAR.msg.text) + '</p>' : '') +
        '<div class="cd-list">' + rows + '</div>' +
        '<p class="cd-p" style="font-size:12px">거리는 일정 장소를 시간순으로 이은 직선 기준입니다. 실제 도로 거리와 다릅니다.</p>';
    }
    el.innerHTML = head + '<div class="cd-nearbody">' + body + '</div>';
  }

  async function onNearClick(e) {
    var b = e.target.closest('[data-near]');
    if (!b) return;
    var k = b.dataset.near;
    if (k === 'toggle') { NEAR.open = !NEAR.open; NEAR.msg = ''; }
    else if (k === 'day') { NEAR.day = Number(b.dataset.v) || 0; }
    else if (k === 'km') { NEAR.km = Number(b.dataset.v) || 3; try { localStorage.setItem('cd-near-km', String(NEAR.km)); } catch (er) {} }
    else if (k === 'add') {
      var store = getDb(), tid = getCurrentTripId();
      var it = LIB.filter(function (x) { return x.id === b.dataset.id; })[0], day = Number(b.dataset.day) || 1;
      if (!store || !tid || !it) return;
      if (tripCompleted()) NEAR.msg = { text: '[여행완료]된 여행입니다. 완료를 풀고 넣어 주세요.' };
      else if (editLocked()) NEAR.msg = { text: '지금은 [잠금됨] 상태입니다. 오른쪽 위 잠금을 풀고 다시 눌러 주세요.' };
      else {
        b.disabled = true; b.textContent = '넣는 중…';
        try {
          await store.collection('trips').doc(tid).collection('expected_places').add({
            day: day, time: '', category: it.category, place_name: it.name, phone: '', address: it.address || it.region,
            budget: 0, memo: ('[캡처 서랍] ' + (it.memo || '')).trim(), manualKm: '', manualMins: '',
            lat: it.lat, lng: it.lng, visited: false, photos: [], alternatives: [],
          });
          NEAR.msg = { ok: true, text: it.name + ' → ' + day + '일차에 넣었습니다 (시간 미정).' };
        } catch (er) { NEAR.msg = { text: '넣지 못했습니다: ' + (er && er.message ? er.message : er) }; }
      }
    }
    NEAR.sig = ''; renderNear();
  }

  function nearSig() {
    var exp = getExpected();
    return [getCurrentTripId(), LIB.length, LIB.length ? LIB[0].id + LIB[LIB.length - 1].id : '', NEAR.open, NEAR.km, NEAR.day,
      exp.map(function (e) { return e.id + ':' + e.day + ':' + e.time + ':' + e.lat + ':' + e.lng + ':' + e.place_name; }).join('|'),
      !!document.getElementById('cd-near')].join('#');
  }
  function tick() {
    watchLibrary();
    var sg = nearSig();
    if (sg !== NEAR.sig) { NEAR.sig = sg; renderNear(); }
  }

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
        else if (r.kind === 'error') { openModal(null); renderPaste(r.text); }
        else openModal(r.list);
      } else setTimeout(wait, 200);
    })();
  }

  function boot() { injectStyle(); injectHomeCard(); handleHash(); watchLibrary(); tick(); setInterval(tick, 800); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.addEventListener('hashchange', handleHash);
  window.CaptureImport = { parse: parsePayload, parseAny: parseAny, routeMatch: routeMatch, open: openModal, _lib: function () { return LIB; } };
})();
