/*
 * 캡처 서랍 → 여행매니저 장소 가져오기 (capture-import.js)
 * - 캡처 서랍의 [여행앱으로 보내기] 링크(#cd=...)로 열리면 가져오기 창을 자동으로 띄웁니다.
 * - 첫 화면의 [캡처 서랍에서 가져오기] 카드에서 복사한 코드를 붙여넣어도 됩니다.
 * - 고른 여행·일차의 예상 일정(expected_places)에 시간 미정으로 추가합니다.
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
      '.cd-home .tx{flex:1;min-width:0}'
    ].join('\n');
    document.head.appendChild(st);
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
      '<p class="text-[11px] text-slate-500 mt-0.5">캡처 서랍에서 담은 맛집·장소를 여행 일정에 넣습니다.</p></div>' +
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

  function openModal(places) {
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
    if (places) renderPick(); else renderPaste();
  }

  function renderPaste(err) {
    var body = document.getElementById('cd-body');
    body.innerHTML =
      '<p class="cd-p">캡처 서랍의 <b>여행앱으로 보내기 → 코드 복사</b>로 복사한 코드나 링크를 붙여넣으세요.</p>' +
      '<textarea id="cd-paste" rows="4" class="cd-ta" placeholder="CD1:..."></textarea>' +
      (err ? '<p class="cd-msg bad">' + h(err) + '</p>' : '') +
      '<button type="button" id="cd-paste-go" class="cd-btn pri blk">불러오기</button>';
    document.getElementById('cd-paste-go').addEventListener('click', function () {
      var list = parsePayload(document.getElementById('cd-paste').value);
      if (!list) { renderPaste('코드를 읽지 못했습니다. 캡처 서랍에서 코드를 다시 복사해 주세요.'); return; }
      state.places = list; renderPick();
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

  /* ---------- 링크로 열렸을 때 ---------- */
  function handleHash() {
    var list = parsePayload(location.hash);
    if (!list) return;
    var tries = 0;
    (function wait() {
      // 여행 목록이 실시간으로 들어올 때까지 최대 4초 기다립니다.
      if (getTrips().length || tries++ > 20) openModal(list);
      else setTimeout(wait, 200);
    })();
  }

  function boot() { injectStyle(); injectHomeCard(); handleHash(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.addEventListener('hashchange', handleHash);
  window.CaptureImport = { parse: parsePayload, open: openModal };
})();
