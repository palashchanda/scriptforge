// ==UserScript==
// @name         ArbPay Auto-Buyer Pro
// @namespace    http://tampermonkey.net/
// @version      7.3
// @description  Professional auto-buyer for arbpay.me — premium UI, amount ranges, activity log, monthly reports
// @author       Palash Chanda
// @match        https://arbpay.me/*
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    // ── Inject Font ──────────────────────────────────────────────────────────
    const fontLink = document.createElement("link");
    fontLink.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
    fontLink.rel = "stylesheet";
    document.head.appendChild(fontLink);

    // ── Inject Styles ────────────────────────────────────────────────────────
    const styleEl = document.createElement("style");
    styleEl.textContent = `
        @keyframes arb-pulse{0%,100%{box-shadow:0 0 8px rgba(245,166,35,0.3)}50%{box-shadow:0 0 22px rgba(245,166,35,0.7)}}
        @keyframes arb-glow{0%,100%{opacity:1}50%{opacity:0.55}}
        .arb-scanning{animation:arb-pulse 1.5s ease-in-out infinite}
        .arb-log-entry{padding:2px 4px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:10px;line-height:1.5;font-family:'SF Mono','Fira Code',Consolas,monospace}
        .arb-log-scan{color:rgba(255,255,255,0.35)}.arb-log-switch{color:#60a5fa}.arb-log-found{color:#4ade80}
        .arb-log-error{color:#f87171}.arb-log-info{color:#fbbf24}.arb-log-pay{color:#a78bfa}
        .arb-btn{transition:all 0.15s ease}.arb-btn:hover{filter:brightness(1.15);transform:translateY(-1px)}.arb-btn:active{transform:translateY(0)}
        .arb-input:focus{border-color:rgba(245,166,35,0.5)!important;outline:none}
        .arb-select:focus{border-color:rgba(245,166,35,0.5)!important;outline:none}
        .arb-scroll::-webkit-scrollbar{width:4px}.arb-scroll::-webkit-scrollbar-track{background:transparent}
        .arb-scroll::-webkit-scrollbar-thumb{background:rgba(245,166,35,0.25);border-radius:2px}
    `;
    document.head.appendChild(styleEl);

    // ── Design Tokens ────────────────────────────────────────────────────────
    const C = {
        accent: "#F5A623", accentDim: "rgba(245,166,35,0.15)", accentBorder: "rgba(245,166,35,0.12)",
        bg: "rgba(12,12,20,0.92)", bgDark: "rgba(18,18,28,0.95)", bgInput: "rgba(25,25,40,0.8)",
        text: "#fff", textDim: "rgba(255,255,255,0.4)", border: "rgba(255,255,255,0.08)",
        green: "#4ade80", red: "#f87171", blue: "#60a5fa", purple: "#a78bfa",
        font: "'Inter',-apple-system,'Segoe UI',sans-serif",
        mono: "'SF Mono','Fira Code',Consolas,monospace",
    };

    // ── Storage Keys ─────────────────────────────────────────────────────────
    const KEY_UPI = "autobuy_selected_upi";
    const KEY_AMOUNT = "autobuy_amount";
    const KEY_UPI_LIST = "autobuy_upi_list";
    const KEY_CREDS = "autobuy_creds";
    const KEY_DAILY = "autobuy_daily_v4";
    const KEY_MONTHLY = "autobuy_monthly_v1";
    const KEY_MONTHLY_ALL = "autobuy_monthly_all_v1";
    const KEY_MONTHLY_TXNS = "autobuy_monthly_txns_v1"; // { "2026-04": [{type,amount,time,order},...] }
    const KEY_BUBBLE = "autobuy_bubble";
    const KEY_POS = "autobuy_position";
    const KEY_SPEED = "autobuy_speed";
    const KEY_ACTIVE_TAB = "autobuy_active_tab";
    const KEY_TRAN_LAST = "autobuy_tran_last_id";
    const KEY_TRAN_SCAN_DATE = "autobuy_tran_scan_date";

    // ── Speed Presets ────────────────────────────────────────────────────────
    const SPEED_PRESETS = {
        ultra: { label: "Ultra (1 ms)", scanMs: 1, switchMs: 1, payMs: 1 },
        fast:  { label: "Fast (15 ms)", scanMs: 15, switchMs: 10, payMs: 10 },
        medium:{ label: "Medium (50 ms)", scanMs: 50, switchMs: 30, payMs: 20 },
        slow:  { label: "Slow (150 ms)", scanMs: 150, switchMs: 100, payMs: 50 },
    };
    let currentSpeed = localStorage.getItem(KEY_SPEED) || "fast";
    if (!SPEED_PRESETS[currentSpeed]) currentSpeed = "fast";
    function getSpeed() { return SPEED_PRESETS[currentSpeed]; }

    // ── Amount Parsing ───────────────────────────────────────────────────────
    let amountRaw = localStorage.getItem(KEY_AMOUNT) || "110";
    let amountMatcher = buildMatcher(amountRaw);

    function buildMatcher(input) {
        const s = String(input).trim();
        if (!s) return () => false;
        if (s.includes(",")) {
            const vals = s.split(",").map(v => parseFloat(v.trim())).filter(n => !isNaN(n));
            if (vals.length) return a => vals.includes(a);
        }
        if (s.includes("-") && !s.startsWith("-")) {
            const p = s.split("-").map(v => parseFloat(v.trim()));
            if (p.length === 2 && !isNaN(p[0]) && !isNaN(p[1])) return a => a >= p[0] && a <= p[1];
        }
        const n = parseFloat(s);
        if (!isNaN(n)) return a => a === n;
        return () => false;
    }

    // ── Config ───────────────────────────────────────────────────────────────
    const TARGET_TABS = ["Default", "Large"];
    const DAILY_TIERS = [1, 3, 5, 7, 10];
    const BONUS_TIERS = [
        { min: 100, max: 300, rate: 0.06 },
        { min: 301, max: 1000, rate: 0.05 },
        { min: 1001, max: 2000, rate: 0.04 },
        { min: 2001, max: 50000, rate: 0.03 },
    ];

    // ── Selectors ────────────────────────────────────────────────────────────
    const SEL = {
        filterContainer: ".x-buyList-filter",
        filterItems: ".x-buyList-filter .item",
        optionsList: ".x-buyList-list",
        optionItem: ".item.mb32",
        buyButton: "button.x-btn",
        navTitle: ".van-nav-bar__title span",
        bankList: ".bank-list",
        paymentRow: ".x-row.x-row-between",
        loginPhone: ".phone-number .x-input",
        loginPassword: ".pwd .x-input",
        loginBtn: ".van-button--primary.x-btn",
        orderCountdown: ".x-payment-top span",
        completedAmount: ".info .item .fw500",
        tranList: ".x-tran-list .item",
        tranType: ".head .type span",
        tranAmount: ".money",
        tranTime: ".time",
        tranOrder: ".x-row.x-row-middle .time",
    };
    const PAYMENT_NAV_TITLE = "Select Method Payment";
    const COMPLETED_TITLE = "Completed";

    // ── Date Helpers ─────────────────────────────────────────────────────────
    function getISTDate() {
        const now = new Date();
        return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 330 * 60000);
    }
    function getTodayKey() {
        const n = new Date();
        return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
    }
    function getMonthKey() {
        const ist = getISTDate();
        return `${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,"0")}`;
    }
    function isToday(t) { return t && t.startsWith(getTodayKey()); }
    function isThisMonth(t) { return t && t.startsWith(getMonthKey()); }
    function isBeforeToday(t) { return t && t.slice(0,10) < getTodayKey(); }
    function formatTimer(s) {
        if (s <= 0) return "";
        const m = Math.floor(s/60), sec = s%60;
        if (m > 0 && sec > 0) return `${m}m ${sec}s`;
        return m > 0 ? `${m}m` : `${sec}s`;
    }

    // ── Daily Stats ──────────────────────────────────────────────────────────
    function makeEmptyDaily() { return { date:getTodayKey(), buyCount:0, buyTotal:0, buyBonus:0, buyRebate:0, sellCount:0, sellTotal:0 }; }
    function loadDaily() {
        try { const r=localStorage.getItem(KEY_DAILY); if(!r) return null; const d=JSON.parse(r); return d.date===getTodayKey()?d:null; } catch { return null; }
    }
    function saveDaily(d) { d.date=getTodayKey(); localStorage.setItem(KEY_DAILY,JSON.stringify(d)); }
    let daily = loadDaily() || makeEmptyDaily();

    // ── Monthly Stats ────────────────────────────────────────────────────────
    function makeEmptyMonthly(monthKey) { const mk=monthKey||getMonthKey(); return { month:mk, buyCount:0, buyAmount:0, buyBonus:0, buyRebate:0, sellCount:0, sellAmount:0, lastUpdated:null }; }
    function loadMonthly() {
        try { const r=localStorage.getItem(KEY_MONTHLY); if(!r) return null; const d=JSON.parse(r); return d.month===getMonthKey()?d:null; } catch { return null; }
    }
    function saveMonthly(m) { m.month=getMonthKey(); localStorage.setItem(KEY_MONTHLY,JSON.stringify(m)); }
    // Multi-month storage
    function loadAllMonthly() { try { return JSON.parse(localStorage.getItem(KEY_MONTHLY_ALL)||"{}"); } catch { return {}; } }
    function saveAllMonthly(all) { localStorage.setItem(KEY_MONTHLY_ALL,JSON.stringify(all)); }
    function getMonthData(mk) { const all=loadAllMonthly(); return all[mk]||makeEmptyMonthly(mk); }
    function setMonthData(mk,data) { const all=loadAllMonthly(); all[mk]=data; saveAllMonthly(all); }
    function getAllMonthKeys() { return Object.keys(loadAllMonthly()).sort().reverse(); }
    function loadAllTxns() { try { return JSON.parse(localStorage.getItem(KEY_MONTHLY_TXNS)||"{}"); } catch { return {}; } }
    function saveAllTxns(all) { localStorage.setItem(KEY_MONTHLY_TXNS,JSON.stringify(all)); }
    function getMonthTxns(mk) { return loadAllTxns()[mk]||[]; }
    function setMonthTxns(mk,txns) { const all=loadAllTxns(); all[mk]=txns; saveAllTxns(all); }
    let monthly = loadMonthly() || makeEmptyMonthly();

    function calcBonus(amount) {
        for (const t of BONUS_TIERS) if (amount >= t.min && amount <= t.max) return Math.round(amount*t.rate*100)/100;
        return 0;
    }

    // ── Activity Log ─────────────────────────────────────────────────────────
    const logEntries = [];
    const MAX_LOG = 200;
    let logContainer = null;
    function addLog(type, msg) {
        const now = new Date();
        const ts = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}`;
        logEntries.push({ ts, type, msg });
        if (logEntries.length > MAX_LOG) logEntries.shift();
        renderLog();
    }
    function renderLog() {
        if (!logContainer) return;
        logContainer.innerHTML = "";
        for (const e of logEntries) {
            const div = document.createElement("div");
            div.className = `arb-log-entry arb-log-${e.type}`;
            div.textContent = `${e.ts}  ${e.msg}`;
            logContainer.appendChild(div);
        }
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    // ── State ────────────────────────────────────────────────────────────────
    let cycling = false, cycleTimer = null, scanTimer = null, cycleIndex = 0;
    let paymentClicked = false, paymentRetries = 0;
    let buyTimerInterval = null, buyTimerSeconds = 0, countdownInterval = null;
    let selectedUPI = localStorage.getItem(KEY_UPI) || null;
    let sessClicks = 0;
    let completedWatched = false, completedWatchInterval = null, completedAlreadyCounted = false;
    let tranScanInProgress = false, tranLastTimestamp = localStorage.getItem(KEY_TRAN_LAST) || null;
    // tranFullScanDone: true once the deep scan for today has completed (resets each session/day)
    const lastScanDate = localStorage.getItem(KEY_TRAN_SCAN_DATE) || null;
    let tranFullScanDone = false; // deep daily scan not yet done this session
    let tranDailyDeepDone = lastScanDate === getTodayKey(); // true if already deep-scanned today
    const MAX_PAYMENT_RETRIES = 20;
    let wasDragging = false;

    // ── Credential Helpers ───────────────────────────────────────────────────
    function saveCreds(p,pw) { localStorage.setItem(KEY_CREDS, btoa(JSON.stringify({phone:p,password:pw}))); }
    function loadCreds() { try { const r=localStorage.getItem(KEY_CREDS); return r?JSON.parse(atob(r)):null; } catch { return null; } }

    // ── Position Helpers ─────────────────────────────────────────────────────
    function savePos(l,t) { if (l<50&&t<50) return; localStorage.setItem(KEY_POS,JSON.stringify({left:l,top:t})); }
    function loadPos() { try { return JSON.parse(localStorage.getItem(KEY_POS)); } catch { return null; } }
    function clampToViewport(l,t,w,h) {
        return { left:Math.max(0,Math.min(l,window.innerWidth-w)), top:Math.max(0,Math.min(t,window.innerHeight-h)) };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ██  UI CONSTRUCTION
    // ══════════════════════════════════════════════════════════════════════════

    // ── Bubble ───────────────────────────────────────────────────────────────
    const bubble = document.createElement("div");
    Object.assign(bubble.style, {
        position:"fixed",zIndex:"999999",width:"52px",height:"52px",borderRadius:"50%",
        background:`linear-gradient(135deg, rgba(20,20,35,0.95), rgba(12,12,20,0.98))`,
        border:`2px solid ${C.accentBorder}`,
        color:C.text,fontFamily:C.mono,fontSize:"11px",
        display:"none",alignItems:"center",justifyContent:"center",flexDirection:"column",
        cursor:"pointer",pointerEvents:"auto",userSelect:"none",touchAction:"none",
        boxShadow:"0 4px 20px rgba(0,0,0,0.6)",textAlign:"center",lineHeight:"1.3",
    });
    document.body.appendChild(bubble);

    // ── Overlay ──────────────────────────────────────────────────────────────
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
        position:"fixed",zIndex:"999999",visibility:"hidden",
        background:C.bg,backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
        color:C.text,fontFamily:C.font,fontSize:"12px",
        padding:"12px 14px",borderRadius:"14px",lineHeight:"1.7",width:"260px",
        pointerEvents:"auto",userSelect:"none",touchAction:"none",
        boxShadow:`0 8px 32px rgba(0,0,0,0.5), inset 0 1px rgba(255,255,255,0.05)`,
        border:`1px solid ${C.accentBorder}`,
        transition:"background 0.3s",
    });
    document.body.appendChild(overlay);

    // ── Position Init ────────────────────────────────────────────────────────
    function applyPosition(l,t) {
        const cl = clampToViewport(l,t,260,500);
        overlay.style.left=`${cl.left}px`; overlay.style.top=`${cl.top}px`;
        bubble.style.left=`${cl.left}px`; bubble.style.top=`${cl.top}px`;
    }
    const savedPos = loadPos();
    requestAnimationFrame(() => {
        savedPos ? applyPosition(savedPos.left,savedPos.top) : applyPosition(window.innerWidth-268,8);
        overlay.style.visibility="visible";
    });
    overlay.style.visibility="visible";

    // ── UI Helpers ────────────────────────────────────────────────────────────
    function makeRow(label) {
        const row=document.createElement("div");
        row.style.cssText="display:flex;justify-content:space-between;align-items:center;gap:6px;min-height:22px;";
        const lbl=document.createElement("span");
        lbl.textContent=label;
        lbl.style.cssText=`color:${C.textDim};white-space:nowrap;font-size:11px;flex-shrink:0;font-weight:500;`;
        const val=document.createElement("span");
        val.style.cssText=`text-align:right;font-weight:600;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:${C.mono};`;
        row.append(lbl,val);
        return {row,val};
    }
    function makeDivider() {
        const d=document.createElement("div");
        d.style.cssText=`border-top:1px solid ${C.accentBorder};margin:6px 0;`;
        return d;
    }
    function makeBtn(text,bg,onClick) {
        const btn=document.createElement("button");
        Object.assign(btn.style, {
            marginTop:"4px",width:"100%",padding:"6px 0",
            background:bg,color:C.text,border:"none",borderRadius:"8px",
            cursor:"pointer",fontFamily:C.font,fontSize:"12px",fontWeight:"600",
            letterSpacing:"0.3px",
        });
        btn.className="arb-btn";
        btn.textContent=text;
        btn.addEventListener("click",onClick);
        return btn;
    }
    function makeInput(placeholder,type="text") {
        const inp=document.createElement("input");
        Object.assign(inp.style, {
            width:"100%",background:C.bgInput,color:C.text,
            border:`1px solid ${C.border}`,borderRadius:"6px",
            fontFamily:C.mono,fontSize:"12px",padding:"4px 8px",
            boxSizing:"border-box",transition:"border-color 0.2s",
        });
        inp.className="arb-input";
        inp.type=type; inp.placeholder=placeholder;
        return inp;
    }

    // ── Header ───────────────────────────────────────────────────────────────
    const headerRow=document.createElement("div");
    headerRow.style.cssText="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;cursor:pointer;padding:2px 0;";
    headerRow.title="Click to minimize";
    const headerTitle=document.createElement("span");
    headerTitle.style.cssText=`font-size:11px;color:${C.accent};letter-spacing:1.5px;text-transform:uppercase;flex:1;font-weight:700;`;
    headerTitle.textContent="⚡ AR AutoBuy";
    const verSpan=document.createElement("span");
    verSpan.style.cssText=`font-size:9px;color:${C.textDim};font-weight:500;`;
    verSpan.textContent="v7.3";
    headerRow.append(headerTitle,verSpan);
    headerRow.addEventListener("click",()=>setCollapsed(true));

    // ── Tab System ───────────────────────────────────────────────────────────
    const tabBar=document.createElement("div");
    tabBar.style.cssText="display:flex;gap:2px;margin-bottom:8px;";
    const tabContents={};
    function makeTab(id,label) {
        const btn=document.createElement("button");
        Object.assign(btn.style, {
            flex:"1",padding:"4px 0",background:"transparent",
            color:C.textDim,border:"none",borderBottom:`2px solid transparent`,
            cursor:"pointer",fontFamily:C.font,fontSize:"10px",fontWeight:"600",
            letterSpacing:"0.5px",transition:"all 0.2s",
        });
        btn.textContent=label; btn.dataset.tabId=id;
        tabBar.appendChild(btn);
        const content=document.createElement("div"); content.style.display="none";
        tabContents[id]={btn,content};
        return content;
    }
    let activeTab=localStorage.getItem(KEY_ACTIVE_TAB)||"main";
    function switchTab(id) {
        activeTab=id; localStorage.setItem(KEY_ACTIVE_TAB,id);
        Object.entries(tabContents).forEach(([k,{btn,content}])=>{
            const on=k===id;
            content.style.display=on?"block":"none";
            btn.style.color=on?C.accent:C.textDim;
            btn.style.borderBottomColor=on?C.accent:"transparent";
        });
    }
    tabBar.addEventListener("click",e=>{ const id=e.target.dataset.tabId; if(id) switchTab(id); });

    // ══════════════════════════════════════════════════════════════════════════
    // ██  TAB 1: MAIN
    // ══════════════════════════════════════════════════════════════════════════
    const mainContent=makeTab("main","MAIN");

    const {row:statusRow,val:statusVal}=makeRow("Status");
    const {row:timerRow,val:timerVal}=makeRow("Timer");
    const {row:clicksRow,val:clicksVal}=makeRow("Clicks");
    const {row:speedRow}=makeRow("Speed");
    const speedSelect=document.createElement("select");
    Object.assign(speedSelect.style, {
        width:"130px",background:C.bgInput,color:C.text,
        border:`1px solid ${C.border}`,borderRadius:"6px",
        fontFamily:C.mono,fontSize:"11px",padding:"3px 6px",
    });
    speedSelect.className="arb-select";
    Object.entries(SPEED_PRESETS).forEach(([k,p])=>{
        const o=document.createElement("option"); o.value=k; o.textContent=p.label; speedSelect.appendChild(o);
    });
    speedSelect.value=currentSpeed;
    speedSelect.addEventListener("change",()=>{ currentSpeed=speedSelect.value; localStorage.setItem(KEY_SPEED,currentSpeed); });
    speedRow.removeChild(speedRow.lastChild); speedRow.appendChild(speedSelect);

    // Amount input (text for range support)
    const amountRow=document.createElement("div");
    amountRow.style.cssText="display:flex;justify-content:space-between;align-items:center;gap:6px;min-height:22px;";
    const amountLbl=document.createElement("span");
    amountLbl.textContent="Amount";
    amountLbl.style.cssText=`color:${C.textDim};white-space:nowrap;font-size:11px;flex-shrink:0;font-weight:500;`;
    const amountInput=document.createElement("input");
    Object.assign(amountInput.style, {
        width:"110px",background:C.bgInput,color:C.text,
        border:`1px solid ${C.border}`,borderRadius:"6px",
        fontFamily:C.mono,fontSize:"12px",padding:"3px 8px",textAlign:"right",
        transition:"border-color 0.2s",
    });
    amountInput.className="arb-input";
    amountInput.type="text"; amountInput.value=amountRaw;
    amountInput.placeholder="110 or 100-120";
    amountInput.addEventListener("change",()=>{
        amountRaw=amountInput.value.trim();
        amountMatcher=buildMatcher(amountRaw);
        localStorage.setItem(KEY_AMOUNT,amountRaw);
        addLog("info",`Amount set: ${amountRaw}`);
    });
    amountRow.append(amountLbl,amountInput);

    // UPI dropdown
    const upiRow=document.createElement("div");
    upiRow.style.cssText="display:flex;justify-content:space-between;align-items:center;gap:6px;min-height:22px;";
    const upiLbl=document.createElement("span");
    upiLbl.textContent="UPI";
    upiLbl.style.cssText=`color:${C.textDim};white-space:nowrap;font-size:11px;flex-shrink:0;font-weight:500;`;
    const upiDropdown=document.createElement("select");
    Object.assign(upiDropdown.style, {
        width:"150px",background:C.bgInput,color:C.text,
        border:`1px solid ${C.border}`,borderRadius:"6px",
        fontFamily:C.mono,fontSize:"11px",padding:"3px 6px",
    });
    upiDropdown.className="arb-select";
    const phOpt=document.createElement("option"); phOpt.value=""; phOpt.textContent="— not loaded —"; phOpt.disabled=true;
    upiDropdown.appendChild(phOpt); upiDropdown.value="";
    upiDropdown.addEventListener("change",()=>{ selectedUPI=upiDropdown.value; localStorage.setItem(KEY_UPI,selectedUPI); });
    upiRow.append(upiLbl,upiDropdown);

    const startStopBtn=makeBtn("▶  START","linear-gradient(135deg,rgba(34,197,94,0.85),rgba(21,128,61,0.9))",toggleCycling);
    startStopBtn.disabled=true; startStopBtn.style.opacity="0.4"; startStopBtn.style.cursor="not-allowed"; startStopBtn.style.marginTop="8px";

    // Login section
    const loginSection=document.createElement("div"); loginSection.style.display="none";
    const credFields=document.createElement("div"); credFields.style.display="none";
    const phoneInp=makeInput("Phone number");
    const passInp=makeInput("Password","password");
    const saveCredsBtn=makeBtn("💾 Save","rgba(26,74,122,0.8)",()=>{
        const p=phoneInp.value.trim(),pw=passInp.value.trim();
        if(!p||!pw) return; saveCreds(p,pw); phoneInp.value=""; passInp.value="";
        credFields.style.display="none"; updateCredsBtn.textContent="✏️ Update credentials";
    });
    credFields.append(phoneInp,passInp,saveCredsBtn);
    const autoLoginBtn=makeBtn("🔐 Auto Login","rgba(26,90,42,0.8)",()=>{
        const c=loadCreds(); if(!c){credFields.style.display="block";return;} doAutoLogin(c);
    });
    const updateCredsBtn=makeBtn("✏️ Update credentials","rgba(58,58,26,0.8)",()=>{
        const s=credFields.style.display!=="none"; credFields.style.display=s?"none":"block";
        updateCredsBtn.textContent=s?"✏️ Update credentials":"✕ Cancel";
    });
    loginSection.append(makeDivider(),credFields,autoLoginBtn,updateCredsBtn);

    mainContent.append(statusRow,timerRow,clicksRow,speedRow,makeDivider(),amountRow,upiRow,makeDivider(),startStopBtn,loginSection);

    // ══════════════════════════════════════════════════════════════════════════
    // ██  TAB 2: DAILY
    // ══════════════════════════════════════════════════════════════════════════
    const dailyContent=makeTab("daily","DAILY");
    const infoNote=document.createElement("div");
    infoNote.style.cssText=`font-size:10px;color:${C.textDim};text-align:center;padding:2px 0 6px;`;
    infoNote.textContent="ℹ️ Open Transaction page to update (deep scan once daily)";
    const {row:buysRow,val:buysVal}=makeRow("Buys");
    const {row:buyTotalRow,val:buyTotalVal}=makeRow("Buy amount");
    const {row:bonusRow,val:bonusVal}=makeRow("Buy-in bonus");
    const {row:rebateRow,val:rebateVal}=makeRow("Daily Rebate");
    const {row:sellCountRow,val:sellCountVal}=makeRow("Sell total");
    const {row:soldRow,val:soldVal}=makeRow("Sell orders");

    // Tier pills
    const tiersRow=document.createElement("div");
    tiersRow.style.cssText="display:flex;justify-content:space-between;align-items:center;gap:4px;min-height:22px;padding:2px 0;";
    const tierLbl=document.createElement("span");
    tierLbl.style.cssText=`color:${C.textDim};white-space:nowrap;font-size:11px;flex-shrink:0;font-weight:500;`;
    tierLbl.textContent="Tasks";
    const tierPills=document.createElement("div"); tierPills.style.cssText="display:flex;gap:4px;";
    const tierSpans={};
    DAILY_TIERS.forEach(tier=>{
        const pill=document.createElement("span");
        pill.style.cssText=`display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700;
            background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.3);transition:all 0.4s;font-family:${C.mono};`;
        pill.textContent=tier; tierSpans[tier]=pill; tierPills.appendChild(pill);
    });
    tiersRow.append(tierLbl,tierPills);
    const allDoneBanner=document.createElement("div");
    allDoneBanner.style.cssText=`display:none;text-align:center;font-size:11px;font-weight:700;color:${C.green};padding:2px 0;margin-bottom:4px;`;
    allDoneBanner.textContent="✅ All tasks done!";

    function allTiersComplete() { return daily.buyCount >= DAILY_TIERS[DAILY_TIERS.length-1]; }
    function updateTierPills() {
        const done=allTiersComplete();
        DAILY_TIERS.forEach(tier=>{
            const p=tierSpans[tier];
            if(daily.buyCount>=tier){p.style.background="rgba(34,197,94,0.7)";p.style.color="#fff";}
            else{p.style.background="rgba(255,255,255,0.08)";p.style.color="rgba(255,255,255,0.3)";}
        });
        allDoneBanner.style.display=done?"block":"none";
        tiersRow.style.display=done?"none":"flex";
    }
    dailyContent.append(infoNote,buysRow,buyTotalRow,bonusRow,rebateRow,tiersRow,allDoneBanner,makeDivider(),sellCountRow,soldRow);

    // ══════════════════════════════════════════════════════════════════════════
    // ██  TAB 3: MONTHLY
    // ══════════════════════════════════════════════════════════════════════════
    const monthlyContent=makeTab("monthly","MONTH");

    // Month selector row
    const monthSelectorRow=document.createElement("div");
    monthSelectorRow.style.cssText="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px;";
    const monthSelectorLbl=document.createElement("span");
    monthSelectorLbl.style.cssText=`color:${C.textDim};font-size:11px;font-weight:500;white-space:nowrap;`;
    monthSelectorLbl.textContent="Month";
    const monthSelect=document.createElement("select");
    Object.assign(monthSelect.style,{
        flex:"1",background:C.bgInput,color:C.text,
        border:`1px solid ${C.border}`,borderRadius:"6px",
        fontFamily:C.mono,fontSize:"11px",padding:"3px 6px",
    });
    monthSelect.className="arb-select";
    function rebuildMonthSelector() {
        const cur=monthSelect.value||getMonthKey();
        monthSelect.innerHTML="";
        const keys=getAllMonthKeys();
        if(!keys.includes(getMonthKey())) keys.unshift(getMonthKey());
        keys.forEach(k=>{const o=document.createElement("option");o.value=k;o.textContent=k;monthSelect.appendChild(o);});
        monthSelect.value=keys.includes(cur)?cur:keys[0];
    }
    rebuildMonthSelector();
    let viewingMonth=monthSelect.value;
    monthSelect.addEventListener("change",()=>{ viewingMonth=monthSelect.value; refreshMonthlyDisplay(); });
    monthSelectorRow.append(monthSelectorLbl,monthSelect);

    const monthLabel=document.createElement("div");
    monthLabel.style.cssText=`font-size:10px;color:${C.textDim};text-align:center;padding:0 0 4px;`;
    const {row:mBuysRow,val:mBuysVal}=makeRow("Buys");
    const {row:mBuyAmtRow,val:mBuyAmtVal}=makeRow("Buy amount");
    const {row:mBonusRow,val:mBonusVal}=makeRow("Bonus earned");
    const {row:mRebateRow,val:mRebateVal}=makeRow("Rebate earned");
    const {row:mSellRow,val:mSellVal}=makeRow("Sell total");
    const {row:mSellAmtRow,val:mSellAmtVal}=makeRow("Sell orders");
    const {row:mUpdatedRow,val:mUpdatedVal}=makeRow("Last updated");

    function refreshMonthlyDisplay() {
        const mk=viewingMonth||getMonthKey();
        const isCurrentMonth=(mk===getMonthKey());
        const data=isCurrentMonth?monthly:getMonthData(mk);
        monthLabel.textContent=data.lastUpdated?`Updated: ${data.lastUpdated}`:"Not scanned yet";
        mBuysVal.textContent=data.buyCount>0?`${data.buyCount}`:"";
        mBuyAmtVal.textContent=data.buyAmount>0?`₹${data.buyAmount.toLocaleString()}`:"";
        mBonusVal.textContent=data.buyBonus>0?`₹${data.buyBonus.toLocaleString()}`:"";
        mRebateVal.textContent=data.buyRebate>0?`₹${data.buyRebate.toLocaleString()}`:"";
        mSellVal.textContent=data.sellAmount>0?`₹${data.sellAmount.toLocaleString()}`:"";
        mSellAmtVal.textContent=data.sellCount>0?`${data.sellCount}`:"";
        mUpdatedVal.textContent=data.lastUpdated||"—";
        mUpdatedVal.style.fontSize="10px";
    }

    const scanMonthBtn=makeBtn("📊 Scan Full Month","rgba(60,60,120,0.8)",()=>{
        if(!isTransactionPage()){addLog("error","Navigate to Transaction page first");return;}
        tranScanInProgress=false; parseTransactionPage(true);
        addLog("info","Full month scan started...");
    });

    function exportMonthCSV() {
        const mk=viewingMonth||getMonthKey();
        const txns=getMonthTxns(mk);
        if(!txns.length){addLog("error","No transaction data for "+mk+". Run a full scan first.");return;}
        const header=["Date","Time","Type","Amount (INR)","Order Number"];
        const dataRows=txns.map(t=>{
            const parts=t.time.split(" ");
            const date=parts[0]||"";
            const time=parts[1]||"";
            // Escape fields that may contain commas
            const safe=v=>String(v).includes(",")?`"${v}"`:String(v);
            return [safe(date),safe(time),safe(t.type),t.amount,safe(t.order)];
        });
        const csv=[header,...dataRows].map(r=>r.join(",")).join("\n");
        const blob=new Blob([csv],{type:"text/csv"});
        const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
        a.download=`arbpay_${mk}.csv`; a.click();
        addLog("info",`Exported ${txns.length} transactions for ${mk}`);
    }
    const exportCSVBtn=makeBtn("⬇️ Export CSV","rgba(20,80,60,0.8)",exportMonthCSV);

    monthlyContent.append(monthSelectorRow,monthLabel,mBuysRow,mBuyAmtRow,mBonusRow,mRebateRow,makeDivider(),mSellRow,mSellAmtRow,makeDivider(),mUpdatedRow,scanMonthBtn,exportCSVBtn);

    // ══════════════════════════════════════════════════════════════════════════
    // ██  TAB 4: LOG
    // ══════════════════════════════════════════════════════════════════════════
    const logContent=makeTab("log","LOG");
    logContainer=document.createElement("div");
    logContainer.className="arb-scroll";
    Object.assign(logContainer.style, {
        maxHeight:"280px",overflowY:"auto",overflowX:"hidden",
        background:"rgba(0,0,0,0.3)",borderRadius:"6px",padding:"4px",
    });
    const clearLogBtn=makeBtn("🗑️ Clear","rgba(80,30,30,0.6)",()=>{ logEntries.length=0; renderLog(); });
    logContent.append(logContainer,clearLogBtn);

    // ══════════════════════════════════════════════════════════════════════════
    // ██  ASSEMBLE OVERLAY
    // ══════════════════════════════════════════════════════════════════════════
    overlay.append(headerRow,tabBar,mainContent,dailyContent,monthlyContent,logContent);
    switchTab(activeTab);
    populateUPIDropdown(JSON.parse(localStorage.getItem(KEY_UPI_LIST)||"[]"));

    // ── Collapse / Expand ────────────────────────────────────────────────────
    let isBubble=localStorage.getItem(KEY_BUBBLE)==="1";
    function setCollapsed(collapsed) {
        isBubble=collapsed; localStorage.setItem(KEY_BUBBLE,collapsed?"1":"0");
        if(collapsed){const r=overlay.getBoundingClientRect();bubble.style.left=`${r.left}px`;bubble.style.top=`${r.top}px`;savePos(r.left,r.top);}
        else{const r=bubble.getBoundingClientRect();const c=clampToViewport(r.left,r.top,260,overlay.offsetHeight||500);overlay.style.left=`${c.left}px`;overlay.style.top=`${c.top}px`;savePos(c.left,c.top);}
        overlay.style.display=collapsed?"none":"block";
        bubble.style.display=collapsed?"flex":"none";
        updateBubble();
    }
    function updateBubble() {
        if(!isBubble) return;
        if(cycling){
            const t=formatTimer(buyTimerSeconds);
            bubble.innerHTML=`<div style="font-size:12px;font-weight:700;color:${C.accent}">${t||"..."}</div>`;
            bubble.style.background=`linear-gradient(135deg,rgba(20,20,35,0.95),rgba(12,12,20,0.98))`;
            bubble.classList.add("arb-scanning");
        } else if(paymentClicked){
            bubble.innerHTML=`<div style="font-size:22px">💵</div>`;
            bubble.classList.remove("arb-scanning");
        } else {
            bubble.innerHTML=`<div style="font-size:22px">⏸️</div>`;
            bubble.classList.remove("arb-scanning");
        }
    }
    bubble.addEventListener("click",()=>{ if(!wasDragging) setCollapsed(false); });

    // ── Draggable ────────────────────────────────────────────────────────────
    function makeDraggable(el,isOverlay) {
        let dragging=false,ox=0,oy=0,moved=false;
        const clickOnly=new Set([startStopBtn,upiDropdown,amountInput,speedSelect,autoLoginBtn,updateCredsBtn,saveCredsBtn,phoneInp,passInp,headerRow,headerTitle,tabBar,scanMonthBtn,clearLogBtn,monthSelect,exportCSVBtn]);
        function isClickOnly(t){return clickOnly.has(t)||tabBar.contains(t)||headerRow.contains(t)||logContainer.contains(t);}
        el.addEventListener("pointerdown",e=>{
            if(isClickOnly(e.target))return;
            dragging=true;moved=false;wasDragging=false;
            ox=e.clientX-el.getBoundingClientRect().left;
            oy=e.clientY-el.getBoundingClientRect().top;
            el.setPointerCapture(e.pointerId); e.preventDefault();
        });
        el.addEventListener("pointermove",e=>{
            if(!dragging)return;
            const nl=e.clientX-ox,nt=e.clientY-oy;
            if(!moved&&Math.abs(nl-parseFloat(el.style.left||0))<3&&Math.abs(nt-parseFloat(el.style.top||0))<3) return;
            moved=true;wasDragging=true;el.style.left=`${nl}px`;el.style.top=`${nt}px`;
        });
        el.addEventListener("pointerup",()=>{
            if(!dragging)return; dragging=false;
            if(moved){const r=el.getBoundingClientRect();savePos(r.left,r.top);
                if(isOverlay){bubble.style.left=`${r.left}px`;bubble.style.top=`${r.top}px`;}
                else{overlay.style.left=`${r.left}px`;overlay.style.top=`${r.top}px`;}
            }
            setTimeout(()=>{wasDragging=false;},50);
        });
    }
    makeDraggable(overlay,true); makeDraggable(bubble,false);

    // ══════════════════════════════════════════════════════════════════════════
    // ██  LOGIC
    // ══════════════════════════════════════════════════════════════════════════

    function setUI(status) {
        daily=loadDaily()||makeEmptyDaily();
        monthly=loadMonthly()||makeEmptyMonthly();
        let color=C.red;
        if(cycling) color=C.green;
        else if(status.includes("✅")||status.includes("💳")) color=C.blue;
        else if(status.includes("⚠️")) color=C.accent;
        statusVal.textContent=status; statusVal.style.color=color;
        timerVal.textContent=buyTimerSeconds>0?formatTimer(buyTimerSeconds):"";
        clicksVal.textContent=sessClicks>0?`${sessClicks}`:"";
        // Daily
        buysVal.textContent=daily.buyCount>0?`${daily.buyCount}`:"";
        buyTotalVal.textContent=daily.buyTotal>0?`₹${daily.buyTotal.toLocaleString()}`:"";
        bonusVal.textContent=daily.buyBonus>0?`₹${daily.buyBonus.toLocaleString()}`:"";
        rebateVal.textContent=daily.buyRebate>0?`₹${daily.buyRebate.toLocaleString()}`:"";
        sellCountVal.textContent=daily.sellTotal>0?`₹${daily.sellTotal.toLocaleString()}`:"";
        soldVal.textContent=daily.sellCount>0?`${daily.sellCount}`:"";
        updateTierPills();
        // Monthly
        refreshMonthlyDisplay();
        // Buttons
        if(cycling){startStopBtn.textContent="⏹  STOP";startStopBtn.style.background="linear-gradient(135deg,#ef4444,#b91c1c)";}
        else if(!startStopBtn.disabled){startStopBtn.textContent="▶  START";startStopBtn.style.background="linear-gradient(135deg,rgba(34,197,94,0.85),rgba(21,128,61,0.9))";}
        updateBubble();
    }
    function flashOverlay(color="rgba(245,166,35,0.2)") {
        overlay.style.background=color;
        setTimeout(()=>{overlay.style.background=C.bg;updateBubble();},700);
    }
    function setButtonEnabled(en) {
        startStopBtn.disabled=!en; startStopBtn.style.opacity=en?"1":"0.4";
        startStopBtn.style.cursor=en?"pointer":"not-allowed";
        if(!cycling) startStopBtn.style.background=en?"linear-gradient(135deg,rgba(34,197,94,0.85),rgba(21,128,61,0.9))":"rgba(50,50,50,0.6)";
    }

    // ── Timers ───────────────────────────────────────────────────────────────
    function startBuyTimer() { buyTimerSeconds=0; clearInterval(buyTimerInterval); buyTimerInterval=setInterval(()=>{buyTimerSeconds++;setUI("🔍 Searching...");},1000); }
    function stopBuyTimer() { clearInterval(buyTimerInterval); buyTimerInterval=null; }
    function startCountdownWatch() { clearInterval(countdownInterval); countdownInterval=setInterval(()=>{if(!document.querySelector(SEL.orderCountdown)) clearInterval(countdownInterval);},1000); }
    function stopCountdownWatch() { clearInterval(countdownInterval); }

    // ── Audio ────────────────────────────────────────────────────────────────
    function playAlert() {
        try {
            const ctx=new(window.AudioContext||window.webkitAudioContext)();
            const osc=ctx.createOscillator(),gain=ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type="sine"; osc.frequency.setValueAtTime(880,ctx.currentTime);
            gain.gain.setValueAtTime(0,ctx.currentTime);
            gain.gain.linearRampToValueAtTime(1.5,ctx.currentTime+0.05);
            gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+1.2);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime+1.2);
        } catch(e){}
    }

    // ── Core Helpers ─────────────────────────────────────────────────────────
    function getAmount(item) { return parseFloat(item.getAttribute("maximumamount"))||0; }
    function isAvailable(item) { const b=item.querySelector(SEL.buyButton); return b&&b.innerText.trim()==="Buy"&&!b.disabled; }
    function switchToTab(label) {
        for(const item of document.querySelectorAll(SEL.filterItems))
            if(item.querySelector(".txt")?.innerText?.trim()===label){item.click();return true;}
        return false;
    }
    function getNavTitle() { return document.querySelector(SEL.navTitle)?.innerText?.trim()||""; }
    function isPaymentPageLoaded() { return getNavTitle()===PAYMENT_NAV_TITLE; }
    function isCompletedPage() { return getNavTitle()===COMPLETED_TITLE||!!document.querySelector(".custom_statusInfo .done"); }
    function isLoginPage() { return !!document.querySelector(SEL.loginPhone); }
    function isUTRPage() { return !!document.querySelector(".x-payment-box-utr"); }
    function isBuyPage() { return !!document.querySelector(SEL.filterContainer); }
    function isTransactionPage() { const t=getNavTitle(); return t&&t.toLowerCase().includes("transaction"); }

    // ── Dialog Detection ─────────────────────────────────────────────────────
    function hasOrderPendingDialog() {
        const popups=document.querySelectorAll('.van-popup:not([style*="display: none"]),.van-action-sheet:not([style*="display: none"]),.van-dialog:not([style*="display: none"])');
        for(const p of popups) if(p.textContent.includes("not been completed")||p.textContent.includes("Order not completed")) return true;
        return false;
    }

    // ── UPI ──────────────────────────────────────────────────────────────────
    function populateUPIDropdown(list) {
        if(!list||!list.length) return;
        const prev=selectedUPI||upiDropdown.value;
        upiDropdown.innerHTML="";
        list.forEach(u=>{const o=document.createElement("option");o.value=u;o.textContent=u;upiDropdown.appendChild(o);});
        const m=[...upiDropdown.options].find(o=>o.value===prev);
        if(m){upiDropdown.value=m.value;selectedUPI=m.value;}
        else{upiDropdown.selectedIndex=0;selectedUPI=upiDropdown.value;}
        localStorage.setItem(KEY_UPI,selectedUPI);
    }
    function fetchAndUpdateUPIList() {
        const bl=document.querySelector(SEL.bankList); if(!bl) return false;
        const fresh=[...bl.querySelectorAll(SEL.paymentRow)].filter(r=>r.querySelector(".upi")).map(r=>r.querySelector(".upi").innerText.trim()).filter(Boolean);
        if(!fresh.length) return false;
        localStorage.setItem(KEY_UPI_LIST,JSON.stringify(fresh));
        populateUPIDropdown(fresh); return true;
    }
    function immediateUPIClick() {
        if(paymentClicked) return;
        const bl=document.querySelector(SEL.bankList);
        if(!bl){setTimeout(immediateUPIClick,50);return;}
        const rows=[...bl.querySelectorAll(SEL.paymentRow)].filter(r=>r.querySelector(".upi"));
        if(!rows.length){setTimeout(immediateUPIClick,50);return;}
        fetchAndUpdateUPIList();
        let target=rows[0];
        if(selectedUPI) for(const r of rows) if(r.querySelector(".upi")?.innerText?.trim()===selectedUPI){target=r;break;}
        target.click(); paymentClicked=true;
        setUI("💳 Paying…"); addLog("pay",`Selected UPI: ${selectedUPI||"first available"}`);
        startCountdownWatch();
    }

    // ── Transaction Reader (Enhanced for Monthly) ────────────────────────────
    function parseTransactionPage(fullScan=false) {
        if(tranScanInProgress) return;
        tranScanInProgress=true;
        const freshDaily=makeEmptyDaily();
        const freshMonthly=makeEmptyMonthly();
        // Multi-month accumulator: { "2026-03": {...}, "2026-04": {...}, ... }
        const freshAllMonths={};
        // Per-month raw transactions accumulator (fullScan only)
        const freshAllTxns={};
        const items=document.querySelectorAll(SEL.tranList);
        let newestTimestamp=null, hitStop=false;

        for(const item of items) {
            const typeEl=item.querySelector(SEL.tranType);
            const amtEl=item.querySelector(SEL.tranAmount);
            const timeEls=item.querySelectorAll(SEL.tranTime);
            // First .time = timestamp, last .time.x-row = order number
            const timeEl=timeEls[0];
            const orderEl=timeEls[timeEls.length-1];
            if(!typeEl||!amtEl||!timeEl) continue;
            const type=typeEl.innerText.trim();
            const timeStr=timeEl.innerText.trim();
            const amount=parseFloat(amtEl.innerText.replace(/[₹,]/g,""))||0;
            const orderNum=orderEl&&orderEl!==timeEl?orderEl.innerText.replace(/\s+/g," ").trim():"";
            if(!newestTimestamp) newestTimestamp=timeStr;

            // Stop conditions
            if(fullScan) {
                // Stop at year boundary — no point going further back
                if(timeStr && timeStr.length>=4 && timeStr.slice(0,4) < String(new Date().getFullYear())){hitStop=true;break;}
            } else {
                if(tranLastTimestamp&&timeStr===tranLastTimestamp&&!isToday(timeStr)){hitStop=true;break;}
                if(isBeforeToday(timeStr)){hitStop=true;break;}
            }

            // Daily (today only)
            if(isToday(timeStr)) {
                if(type==="Buy"){freshDaily.buyCount++;freshDaily.buyTotal+=amount;}
                else if(type==="Buy-in bonus") freshDaily.buyBonus+=amount;
                else if(type==="Buy Rebate") freshDaily.buyRebate+=amount;
                else if(type==="Sell"){freshDaily.sellCount++;freshDaily.sellTotal+=amount;}
            }
            // Current month live tracking
            if(isThisMonth(timeStr)) {
                if(type==="Buy"){freshMonthly.buyCount++;freshMonthly.buyAmount+=amount;}
                else if(type==="Buy-in bonus") freshMonthly.buyBonus+=amount;
                else if(type==="Buy Rebate") freshMonthly.buyRebate+=amount;
                else if(type==="Sell"){freshMonthly.sellCount++;freshMonthly.sellAmount+=amount;}
            }
            // All-months accumulator (fullScan only)
            if(fullScan && timeStr && timeStr.length>=7) {
                const mk=timeStr.slice(0,7);
                if(!freshAllMonths[mk]) freshAllMonths[mk]=makeEmptyMonthly(mk);
                const fm=freshAllMonths[mk];
                if(type==="Buy"){fm.buyCount++;fm.buyAmount+=amount;}
                else if(type==="Buy-in bonus") fm.buyBonus+=amount;
                else if(type==="Buy Rebate") fm.buyRebate+=amount;
                else if(type==="Sell"){fm.sellCount++;fm.sellAmount+=amount;}
                // Store raw transaction row
                if(!freshAllTxns[mk]) freshAllTxns[mk]=[];
                freshAllTxns[mk].push({type,amount,time:timeStr,order:orderNum});
            }
        }

        // Save daily if we found data
        if(freshDaily.buyCount>0||freshDaily.buyBonus>0||freshDaily.buyRebate>0||freshDaily.sellCount>0||freshDaily.sellTotal>0) {
            daily=freshDaily; saveDaily(daily);
        }
        // Save what we have so far each pass
        if(fullScan&&(freshMonthly.buyCount>0||freshMonthly.buyBonus>0||freshMonthly.sellCount>0)) {
            freshMonthly.lastUpdated=new Date().toLocaleTimeString();
            monthly=freshMonthly; saveMonthly(monthly);
            const ts=new Date().toLocaleTimeString();
            Object.entries(freshAllMonths).forEach(([mk,data])=>{
                data.lastUpdated=ts; setMonthData(mk,data);
            });
            // Save raw transactions per month (merge with any existing to handle partial scrolls)
            Object.entries(freshAllTxns).forEach(([mk,txns])=>{
                // Deduplicate by order number (keep unique orders)
                const existing=getMonthTxns(mk);
                const seen=new Set(existing.map(t=>t.order||t.time+t.amount));
                const merged=[...existing,...txns.filter(t=>!seen.has(t.order||t.time+t.amount))];
                merged.sort((a,b)=>b.time.localeCompare(a.time));
                setMonthTxns(mk,merged);
            });
            rebuildMonthSelector();
            refreshMonthlyDisplay();
        }

        if(hitStop||items.length===0) {
            if(newestTimestamp){tranLastTimestamp=newestTimestamp;localStorage.setItem(KEY_TRAN_LAST,newestTimestamp);}
            tranFullScanDone=true; tranScanInProgress=false;
            // Log completion and mark daily deep scan done (fullScan only)
            if(fullScan) {
                const months=Object.keys(freshAllMonths);
                addLog("info",`Deep scan done: ${months.length} month(s) — ${months.join(", ")}`);
                localStorage.setItem(KEY_TRAN_SCAN_DATE, getTodayKey());
                tranDailyDeepDone=true;
            }
            setUI(cycling?"🔍 Searching...":"⏹ Stopped"); return;
        }
        window.scrollTo(0,document.body.scrollHeight);
        setTimeout(()=>{tranScanInProgress=false;parseTransactionPage(fullScan);},150);
    }

    // ── Completed Watcher ────────────────────────────────────────────────────
    function startCompletedWatch() {
        if(completedWatched) return;
        completedWatched=true; completedAlreadyCounted=false;
        completedWatchInterval=setInterval(()=>{
            if(!isCompletedPage()) return;
            if(completedAlreadyCounted) return;
            completedAlreadyCounted=true;
            clearInterval(completedWatchInterval); stopCountdownWatch();
            const amtEl=document.querySelector(SEL.completedAmount);
            let amt=0;
            if(amtEl) amt=parseFloat(amtEl.innerText.replace(/[₹,]/g,"").trim())||0;
            daily=loadDaily()||makeEmptyDaily();
            monthly=loadMonthly()||makeEmptyMonthly();
            const prevCount=daily.buyCount;
            daily.buyCount++; daily.buyTotal+=amt; daily.buyBonus+=calcBonus(amt);
            monthly.buyCount++; monthly.buyAmount+=amt; monthly.buyBonus+=calcBonus(amt);
            saveDaily(daily); saveMonthly(monthly);
            for(const tier of DAILY_TIERS) if(prevCount<tier&&daily.buyCount>=tier){flashOverlay("rgba(245,166,35,0.4)");break;}
            flashOverlay("rgba(0,180,80,0.3)");
            setUI("✅ Completed");
            addLog("found",`Order completed: ₹${amt.toLocaleString()}`);
            completedWatched=false;
        },500);
    }

    // ── Cycle Core ───────────────────────────────────────────────────────────
    function stopCycling() {
        cycling=false; clearTimeout(cycleTimer); clearTimeout(scanTimer);
        stopBuyTimer(); playAlert(); setUI("✅ Found");
        addLog("found","Buy clicked! Auto-selecting payment...");
        immediateUPIClick(); startCompletedWatch();
    }
    function tryClickBuy() {
        const container=document.querySelector(SEL.optionsList);
        if(!container) return false;
        for(const item of container.querySelectorAll(SEL.optionItem)) {
            const amt=getAmount(item);
            if(amountMatcher(amt)&&isAvailable(item)) {
                const btn=item.querySelector(SEL.buyButton);
                if(btn){btn.click();sessClicks++;setUI(`🖱️ ₹${amt}`);addLog("found",`Matched ₹${amt} — clicking Buy`);return true;}
            }
        }
        return false;
    }
    function cycleStep() {
        if(!cycling) return;
        if(isPaymentPageLoaded()){stopCycling();return;}
        if(hasOrderPendingDialog()){
            cycling=false;clearTimeout(cycleTimer);clearTimeout(scanTimer);stopBuyTimer();
            playAlert();setUI("⚠️ Order pending");addLog("error","Order not completed dialog detected!");return;
        }
        const sp=getSpeed();
        const label=TARGET_TABS[cycleIndex%TARGET_TABS.length];
        switchToTab(label);
        addLog("switch",`→ ${label} tab`);
        scanTimer=setTimeout(()=>{
            if(!cycling) return;
            if(isPaymentPageLoaded()){stopCycling();return;}
            const clicked=tryClickBuy();
            if(clicked){
                cycleTimer=setTimeout(()=>{
                    if(!cycling) return;
                    if(isPaymentPageLoaded()) stopCycling();
                    else{cycleIndex++;cycleStep();}
                },sp.payMs);
            } else {
                cycleIndex++;
                cycleTimer=setTimeout(cycleStep,sp.switchMs);
            }
        },sp.scanMs);
    }
    function startCycling() {
        if(cycling) return;
        cycling=true;cycleIndex=0;paymentClicked=false;paymentRetries=0;
        completedWatched=false;completedAlreadyCounted=false;sessClicks=0;
        startBuyTimer();setUI("🔍 Searching...");
        addLog("info",`Started scanning for: ${amountRaw}`);
        cycleStep();
    }
    function forceStop() {
        cycling=false;clearTimeout(cycleTimer);clearTimeout(scanTimer);stopBuyTimer();setUI("⏹ Stopped");
        addLog("info","Stopped manually");
    }
    function toggleCycling() { if(cycling) forceStop(); else startCycling(); }

    // ── Auto-Login ───────────────────────────────────────────────────────────
    function doAutoLogin(creds) {
        const phoneEl=document.querySelector(SEL.loginPhone);
        const passEl=document.querySelector(SEL.loginPassword);
        const btnEl=document.querySelector(SEL.loginBtn);
        if(!phoneEl||!passEl||!btnEl) return;
        function setNativeValue(el,val) {
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set.call(el,val);
            el.dispatchEvent(new Event("input",{bubbles:true}));
        }
        setNativeValue(phoneEl,creds.phone); setNativeValue(passEl,creds.password);
        setTimeout(()=>btnEl.click(),300);
        addLog("info","Auto-login attempted");
    }

    // ── Observer ──────────────────────────────────────────────────────────────
    function observeFilterChanges() {
        const node=document.querySelector(SEL.filterContainer);
        if(!node){setTimeout(observeFilterChanges,300);return;}
        new MutationObserver(()=>{}).observe(node,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
    }

    // ── Page Watcher ─────────────────────────────────────────────────────────
    let sessionStarted=false,lastTransactionScan=0,lastPayPage=false,lastTranPage=false;
    function watchPage() {
        const onBuyPage=isBuyPage(),onLoginPage=isLoginPage(),onPayPage=isPaymentPageLoaded();
        const onUTRPage=isUTRPage(),onTranPage=isTransactionPage();

        if(!onBuyPage&&cycling) forceStop();
        setButtonEnabled(onBuyPage);

        if(onBuyPage&&!sessionStarted){sessionStarted=true;observeFilterChanges();setUI("⏹ Stopped");addLog("info","Buy page loaded, ready");}

        loginSection.style.display=onLoginPage?"block":"none";

        if(onPayPage){fetchAndUpdateUPIList();if(!lastPayPage) immediateUPIClick();}
        lastPayPage=onPayPage;
        if(onUTRPage) fetchAndUpdateUPIList();

        // Transaction page scan
        if(onTranPage) {
            const now=Date.now();
            const isFirstVisit=!lastTranPage;
            // First visit of the day: deep full scan (all months). After that: incremental.
            const needDeepScan=!tranDailyDeepDone;
            const scanInterval=tranFullScanDone?3000:500;
            if(now-lastTransactionScan>scanInterval){
                lastTransactionScan=now; tranScanInProgress=false;
                parseTransactionPage(needDeepScan||!tranFullScanDone||isFirstVisit);
            }
        }
        lastTranPage=onTranPage;

        // Dialog detection (only when not cycling — watchPage handles it; cycleStep also checks)
        if(!cycling&&onBuyPage&&hasOrderPendingDialog()){
            playAlert(); setUI("⚠️ Order pending");
        }

        if(!cycling&&!onPayPage&&!onTranPage) setUI("⏹ Stopped");
        setTimeout(watchPage,300);
    }

    // ── Resize ───────────────────────────────────────────────────────────────
    window.addEventListener("resize",()=>{
        const pos=loadPos()||{left:window.innerWidth-268,top:8};
        applyPosition(pos.left,pos.top);
    });

    // ── Init ─────────────────────────────────────────────────────────────────
    setCollapsed(isBubble);
    setUI("⏹ Stopped");
    addLog("info","ArbPay Auto-Buyer v7.3 loaded");
    watchPage();
})();