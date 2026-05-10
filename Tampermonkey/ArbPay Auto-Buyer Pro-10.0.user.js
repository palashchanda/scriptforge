// ==UserScript==
// @name         ArbPay Auto-Buyer Pro
// @namespace    http://tampermonkey.net/
// @version      10.0
// @description  Auto-buyer for arbpay.me — calendar stats, incremental scan
// @author       Palash Chanda
// @match        https://arbpay.me/*
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    const fontLink = document.createElement("link");
    fontLink.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
    fontLink.rel = "stylesheet";
    document.head.appendChild(fontLink);

    const styleEl = document.createElement("style");
    styleEl.textContent = `
        @keyframes arb-pulse{0%,100%{box-shadow:0 0 8px rgba(59,130,246,0.3)}50%{box-shadow:0 0 22px rgba(59,130,246,0.7)}}
        .arb-scanning{animation:arb-pulse 1.5s ease-in-out infinite}
        .arb-btn{transition:all 0.2s cubic-bezier(0.4,0,0.2,1)}
        .arb-btn:hover{filter:brightness(1.15);transform:translateY(-1px)}
        .arb-btn:active{transform:translateY(0)}
        .arb-btn:disabled{filter:grayscale(1);opacity:0.5;cursor:not-allowed;transform:none!important}
        .arb-input:focus{border-color:rgba(59,130,246,0.5)!important;outline:none;box-shadow:0 0 0 2px rgba(59,130,246,0.12)}
        .arb-select:focus{border-color:rgba(59,130,246,0.5)!important;outline:none;box-shadow:0 0 0 2px rgba(59,130,246,0.12)}
        .arb-select{cursor:pointer}
        .arb-cal-day{display:flex;flex-direction:column;align-items:center;justify-content:center;height:26px;border-radius:5px;cursor:pointer;font-size:10px;font-weight:600;transition:background 0.15s,color 0.15s;position:relative;color:rgba(255,255,255,0.7);}
        .arb-cal-day:hover{background:rgba(59,130,246,0.18);color:#fff;}
        .arb-cal-day.today{border:1px solid rgba(59,130,246,0.55);color:#fff;}
        .arb-cal-day.selected{background:rgba(59,130,246,0.32);color:#fff;}
        .arb-cal-day.has-data::after{content:'';position:absolute;bottom:2px;width:3px;height:3px;border-radius:50%;background:#3b82f6;}
        .arb-cal-day.today.has-data::after,.arb-cal-day.selected.has-data::after{background:#93c5fd;}
        @keyframes arb-hero-glow{0%,100%{border-color:rgba(59,130,246,0.22);box-shadow:none}50%{border-color:rgba(59,130,246,0.55);box-shadow:0 0 22px rgba(59,130,246,0.14)}}
        .arb-hero-active{animation:arb-hero-glow 1.5s ease-in-out infinite}
        .arb-stat-card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:9px 10px;}
    `;
    document.head.appendChild(styleEl);

    const C = {
        accent: "#3b82f6", accentDim: "rgba(59,130,246,0.15)", accentBorder: "rgba(59,130,246,0.22)",
        bg: "rgba(8,10,22,0.96)", bgInput: "rgba(18,22,40,0.92)",
        text: "#fff", textDim: "rgba(255,255,255,0.42)", border: "rgba(255,255,255,0.1)",
        green: "#4ade80", red: "#f87171", blue: "#60a5fa",
        font: "'Inter',-apple-system,'Segoe UI',sans-serif",
        mono: "'SF Mono','Fira Code',Consolas,monospace",
    };

    const KEY_UPI          = "autobuy_selected_upi";
    const KEY_AMOUNT       = "autobuy_amount";
    const KEY_UPI_LIST     = "autobuy_upi_list";
    const KEY_CREDS        = "autobuy_creds";
    const KEY_MONTHLY_TXNS = "autobuy_monthly_txns_v1";
    const KEY_BUBBLE       = "autobuy_bubble";
    const KEY_POS          = "autobuy_position";
    const KEY_ACTIVE_TAB   = "autobuy_active_tab";
    const KEY_SCAN_STATE   = "autobuy_scan_state_v2";

    function getSpeed() { return { scanMs: 100, switchMs: 80, payMs: 60 }; }

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

    const TARGET_TABS = ["Default", "Large"];

    const SEL = {
        filterContainer: ".x-buyList-filter",
        filterItems:     ".x-buyList-filter .item",
        optionsList:     ".x-buyList-list",
        optionItem:      ".item.mb32",
        buyButton:       "button.x-btn",
        navTitle:        ".van-nav-bar__title span",
        bankList:        ".bank-list",
        paymentRow:      ".x-row.x-row-between",
        loginPhone:      ".phone-number .x-input",
        loginPassword:   ".pwd .x-input",
        loginBtn:        ".van-button--primary.x-btn",
        orderCountdown:  ".x-payment-top span",
        tranList:        ".x-tran-list .item",
        tranType:        ".head .type span",
        tranAmount:      ".money",
        tranTime:        ".time",
    };
    const PAYMENT_NAV_TITLE = "Select Method Payment";
    const COMPLETED_TITLE   = "Completed";

    // ── Date helpers ─────────────────────────────────────────────────────────
    function getISTDate()  { const n=new Date(); return new Date(n.getTime()+n.getTimezoneOffset()*60000+330*60000); }
    function getTodayKey() { const i=getISTDate(); return `${i.getFullYear()}-${String(i.getMonth()+1).padStart(2,"0")}-${String(i.getDate()).padStart(2,"0")}`; }
    function getMonthKey() { const i=getISTDate(); return `${i.getFullYear()}-${String(i.getMonth()+1).padStart(2,"0")}`; }
    function formatTimer(s) { if(s<=0) return ""; const m=Math.floor(s/60),r=s%60; if(m>0&&r>0) return `${m}m ${r}s`; return m>0?`${m}m`:`${r}s`; }
    const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    // ── Scan state ────────────────────────────────────────────────────────────
    function loadScanState()       { try { return JSON.parse(localStorage.getItem(KEY_SCAN_STATE)||"{}"); } catch { return {}; } }
    function saveScanState(s)      { localStorage.setItem(KEY_SCAN_STATE,JSON.stringify(s)); }
    function getMonthScan(mk)      { return loadScanState()[mk]||{complete:false,lastTime:null}; }
    function setMonthScan(mk,data) { const s=loadScanState(); s[mk]=data; saveScanState(s); }

    // ── Transaction storage ───────────────────────────────────────────────────
    function loadAllTxns()         { try { return JSON.parse(localStorage.getItem(KEY_MONTHLY_TXNS)||"{}"); } catch { return {}; } }
    function saveAllTxns(all)      { localStorage.setItem(KEY_MONTHLY_TXNS,JSON.stringify(all)); }
    function getMonthTxns(mk)      { return loadAllTxns()[mk]||[]; }
    function setMonthTxns(mk,txns) { const a=loadAllTxns(); a[mk]=txns; saveAllTxns(a); }

    // ── Stats computation ─────────────────────────────────────────────────────
    function computeStats(txns) {
        const s={buyCount:0,buyAmount:0,buyBonus:0,buyRebate:0,sellCount:0,sellAmount:0,sellReward:0};
        for(const t of txns){
            const ty=(t.type||"").toLowerCase().trim();
            if(ty==="buy")             { s.buyCount++;  s.buyAmount+=t.amount; }
            else if(ty==="buy-in bonus") s.buyBonus+=t.amount;
            else if(ty==="buy rebate")   s.buyRebate+=t.amount;
            else if(ty==="sell")       { s.sellCount++; s.sellAmount+=t.amount; }
            else if(ty==="sell reward")  s.sellReward+=t.amount;
        }
        s.earnings=s.buyRebate+s.buyBonus+s.sellReward;
        return s;
    }
    function getTxnsForDate(mk,dateKey) { return getMonthTxns(mk).filter(t=>t.time&&t.time.startsWith(dateKey)); }
    function getDatesWithData(mk) {
        const seen=new Set();
        getMonthTxns(mk).forEach(t=>{ if(t.time&&t.time.length>=10) seen.add(t.time.slice(0,10)); });
        return seen;
    }

    // ── UI state ──────────────────────────────────────────────────────────────
    let cycling=false, cycleTimer=null, scanTimer=null, cycleIndex=0;
    let paymentClicked=false;
    let buyTimerInterval=null, buyTimerSeconds=0, countdownInterval=null;
    let selectedUPI=localStorage.getItem(KEY_UPI)||null;
    let sessClicks=0;
    let completedWatched=false, completedWatchInterval=null, completedAlreadyCounted=false;
    let tranScanInProgress=false;
    let wasDragging=false;
    let pendingBuy=null; // { amount, dateKey, mk } — optimistic until next scan

    function saveCreds(p,pw)  { localStorage.setItem(KEY_CREDS,btoa(JSON.stringify({phone:p,password:pw}))); }
    function loadCreds()      { try { const r=localStorage.getItem(KEY_CREDS); return r?JSON.parse(atob(r)):null; } catch { return null; } }
    function savePos(l,t)     { if(l<50&&t<50) return; localStorage.setItem(KEY_POS,JSON.stringify({left:l,top:t})); }
    function loadPos()        { try { return JSON.parse(localStorage.getItem(KEY_POS)); } catch { return null; } }
    function clampToViewport(l,t,w,h) { return { left:Math.max(0,Math.min(l,window.innerWidth-w)), top:Math.max(0,Math.min(t,window.innerHeight-h)) }; }

    // ── UI helpers ────────────────────────────────────────────────────────────
    function makeRow(label) {
        const row=document.createElement("div");
        row.style.cssText="display:flex;justify-content:space-between;align-items:center;gap:8px;min-height:20px;padding:2px 6px;border-radius:6px;transition:background 0.15s;";
        const lbl=document.createElement("span");
        lbl.textContent=label;
        lbl.style.cssText=`color:${C.textDim};white-space:nowrap;font-size:10px;flex-shrink:0;font-weight:500;`;
        const val=document.createElement("span");
        val.style.cssText=`text-align:right;font-weight:600;font-size:11px;font-family:${C.mono};color:${C.text};`;
        row.append(lbl,val);
        row.addEventListener("mouseenter",()=>{row.style.background="rgba(255,255,255,0.03)";});
        row.addEventListener("mouseleave",()=>{row.style.background="transparent";});
        return {row,val};
    }
    function makeDivider() {
        const d=document.createElement("div");
        d.style.cssText=`border-top:1px solid ${C.accentBorder};margin:5px 0;`;
        return d;
    }
    function makeBtn(text,bg,onClick) {
        const btn=document.createElement("button");
        Object.assign(btn.style,{
            marginTop:"5px",width:"100%",padding:"7px 0",
            background:bg,color:C.text,border:"none",borderRadius:"8px",
            cursor:"pointer",fontFamily:C.font,fontSize:"11px",fontWeight:"700",letterSpacing:"0.4px",
        });
        btn.className="arb-btn"; btn.textContent=text;
        btn.addEventListener("click",onClick);
        return btn;
    }
    function makeInput(placeholder,type="text") {
        const inp=document.createElement("input");
        Object.assign(inp.style,{
            width:"100%",background:C.bgInput,color:C.text,
            border:`1px solid ${C.border}`,borderRadius:"8px",
            fontFamily:C.mono,fontSize:"11px",padding:"5px 8px",
            boxSizing:"border-box",transition:"all 0.2s",
        });
        inp.className="arb-input"; inp.type=type; inp.placeholder=placeholder;
        return inp;
    }
    function makeMiniRow(...labels) {
        const row=document.createElement("div");
        row.style.cssText="display:flex;gap:3px;margin-bottom:3px;";
        const vals={};
        labels.forEach(lbl=>{
            const cell=document.createElement("div");
            cell.style.cssText="flex:1;background:rgba(255,255,255,0.04);border-radius:5px;padding:3px 5px;min-width:0;";
            const l=document.createElement("div");
            l.style.cssText="font-size:7px;color:rgba(255,255,255,0.26);text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
            l.textContent=lbl;
            const v=document.createElement("div");
            v.style.cssText=`font-size:10px;font-weight:600;color:${C.text};font-family:${C.mono};`;
            v.textContent="—";
            cell.append(l,v); row.appendChild(cell); vals[lbl]=v;
        });
        return {row,vals};
    }
    function makeSectionHdr(label) {
        const wrap=document.createElement("div");
        wrap.style.cssText="display:flex;justify-content:space-between;align-items:baseline;padding:0 2px;margin-bottom:4px;";
        const title=document.createElement("span");
        title.style.cssText=`font-size:9px;font-weight:700;color:${C.textDim};text-transform:uppercase;letter-spacing:0.8px;`;
        title.textContent=label;
        const right=document.createElement("div");
        right.style.cssText="display:flex;align-items:baseline;gap:5px;";
        const count=document.createElement("span");
        count.style.cssText=`font-size:9px;color:${C.textDim};font-family:${C.mono};display:none;`;
        const total=document.createElement("span");
        total.style.cssText=`font-size:14px;font-weight:700;color:#4ade80;font-family:${C.mono};`;
        total.textContent="₹0.00";
        right.append(count,total); wrap.append(title,right); return {wrap,title,total,count};
    }
    function fmt2(n)   { return (n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }
    function fmtAmt(n) { return (n||0)>0?`₹${(n||0).toLocaleString()}`:"—"; }

    // ── Bubble ────────────────────────────────────────────────────────────────
    const bubble=document.createElement("div");
    Object.assign(bubble.style,{
        position:"fixed",zIndex:"999999",width:"52px",height:"52px",borderRadius:"50%",
        background:"linear-gradient(145deg,rgba(8,12,28,0.98),rgba(5,8,20,0.98))",
        border:`2px solid ${C.accent}`,color:C.text,fontFamily:C.mono,fontSize:"11px",
        display:"none",alignItems:"center",justifyContent:"center",flexDirection:"column",
        cursor:"pointer",pointerEvents:"auto",userSelect:"none",touchAction:"none",
        boxShadow:"0 6px 24px rgba(59,130,246,0.2),inset 0 1px rgba(255,255,255,0.08)",
        textAlign:"center",lineHeight:"1.3",transition:"all 0.3s cubic-bezier(0.4,0,0.2,1)",
    });
    document.body.appendChild(bubble);

    // ── Overlay ───────────────────────────────────────────────────────────────
    const overlay=document.createElement("div");
    Object.assign(overlay.style,{
        position:"fixed",zIndex:"999999",visibility:"hidden",
        background:C.bg,backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
        color:C.text,fontFamily:C.font,fontSize:"12px",
        padding:"12px",borderRadius:"14px",lineHeight:"1.7",width:"258px",
        pointerEvents:"auto",userSelect:"none",touchAction:"none",
        boxShadow:"0 12px 48px rgba(0,0,0,0.7),inset 0 1px rgba(255,255,255,0.05)",
        border:`1px solid ${C.accentBorder}`,transition:"background 0.3s",
    });
    document.body.appendChild(overlay);

    function applyPosition(l,t) {
        const cl=clampToViewport(l,t,258,560);
        overlay.style.left=`${cl.left}px`; overlay.style.top=`${cl.top}px`;
        bubble.style.left=`${cl.left}px`;  bubble.style.top=`${cl.top}px`;
    }
    const savedPos=loadPos();
    requestAnimationFrame(()=>{
        savedPos ? applyPosition(savedPos.left,savedPos.top) : applyPosition(window.innerWidth-266,8);
        overlay.style.visibility="visible";
    });

    // ── Header ────────────────────────────────────────────────────────────────
    const headerRow=document.createElement("div");
    headerRow.style.cssText=`display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;cursor:pointer;padding:6px 10px;background:rgba(59,130,246,0.08);border-radius:9px;border:1px solid rgba(59,130,246,0.16);transition:all 0.2s;`;
    headerRow.title="Click to minimize";
    const headerTitle=document.createElement("span");
    headerTitle.style.cssText=`font-size:12px;color:${C.accent};letter-spacing:2px;text-transform:uppercase;flex:1;font-weight:700;text-shadow:0 0 18px rgba(59,130,246,0.5);`;
    headerTitle.textContent="⚡ ARB AUTOBUY";
    const verSpan=document.createElement("span");
    verSpan.style.cssText=`font-size:9px;color:${C.textDim};font-weight:600;background:rgba(255,255,255,0.07);padding:2px 6px;border-radius:5px;`;
    verSpan.textContent="v10.0";
    headerRow.append(headerTitle,verSpan);
    headerRow.addEventListener("click",()=>setCollapsed(true));
    headerRow.addEventListener("mouseenter",()=>{headerRow.style.background="rgba(59,130,246,0.13)";});
    headerRow.addEventListener("mouseleave",()=>{headerRow.style.background="rgba(59,130,246,0.08)";});

    // ── Tab system ────────────────────────────────────────────────────────────
    const tabBar=document.createElement("div");
    tabBar.style.cssText="display:flex;gap:3px;margin-bottom:10px;background:rgba(0,0,0,0.25);padding:3px;border-radius:8px;";
    const tabContents={};
    function makeTab(id,label) {
        const btn=document.createElement("button");
        Object.assign(btn.style,{
            flex:"1",padding:"5px 4px",background:"transparent",color:C.textDim,
            border:"none",borderRadius:"6px",cursor:"pointer",fontFamily:C.font,
            fontSize:"10px",fontWeight:"600",letterSpacing:"0.8px",transition:"all 0.2s",
        });
        btn.textContent=label; btn.dataset.tabId=id; tabBar.appendChild(btn);
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
            btn.style.color=on?C.text:C.textDim;
            btn.style.background=on?"rgba(59,130,246,0.2)":"transparent";
        });
    }
    tabBar.addEventListener("click",e=>{ const id=e.target.dataset.tabId; if(id) switchTab(id); });

    // ── TAB: MAIN ─────────────────────────────────────────────────────────────
    const mainContent=makeTab("main","MAIN");

    // Hero card — big amount + UPI
    const heroCard=document.createElement("div");
    heroCard.style.cssText=`background:linear-gradient(135deg,rgba(59,130,246,0.07),rgba(99,102,241,0.04));border:1px solid rgba(59,130,246,0.22);border-radius:14px;padding:14px;margin-bottom:8px;`;

    const amtCaption=document.createElement("div");
    amtCaption.style.cssText=`font-size:8px;font-weight:700;color:${C.textDim};letter-spacing:2.5px;text-transform:uppercase;margin-bottom:8px;`;
    amtCaption.textContent="BUY AMOUNT";

    const amtHeroRow=document.createElement("div");
    amtHeroRow.style.cssText="display:flex;align-items:baseline;gap:3px;margin-bottom:14px;";

    const amtPrefix=document.createElement("span");
    amtPrefix.style.cssText=`font-size:28px;font-weight:700;color:${C.accent};font-family:${C.mono};line-height:1;`;
    amtPrefix.textContent="₹";

    const amountInput=document.createElement("input");
    Object.assign(amountInput.style,{
        flex:"1",minWidth:"0",background:"transparent",color:C.text,
        border:"none",outline:"none",
        fontFamily:C.mono,fontSize:"36px",fontWeight:"800",
        padding:"0",letterSpacing:"-1px",caretColor:C.accent,
    });
    amountInput.className="arb-input";
    amountInput.type="text";
    amountInput.value=amountRaw;
    amountInput.placeholder="110";
    amountInput.addEventListener("change",()=>{ amountRaw=amountInput.value.trim(); amountMatcher=buildMatcher(amountRaw); localStorage.setItem(KEY_AMOUNT,amountRaw); });
    amtHeroRow.append(amtPrefix,amountInput);

    const upiCaption=document.createElement("div");
    upiCaption.style.cssText=`font-size:8px;font-weight:700;color:${C.textDim};letter-spacing:2.5px;text-transform:uppercase;margin-bottom:6px;`;
    upiCaption.textContent="PAYMENT METHOD";

    const upiDropdown=document.createElement("select");
    Object.assign(upiDropdown.style,{
        width:"100%",background:"rgba(18,22,40,0.9)",color:C.text,
        border:`1px solid rgba(59,130,246,0.2)`,borderRadius:"9px",
        fontFamily:C.mono,fontSize:"10px",padding:"7px 10px",cursor:"pointer",
        boxSizing:"border-box",
    });
    upiDropdown.className="arb-select";
    const phOpt=document.createElement("option"); phOpt.value=""; phOpt.textContent="— not loaded —"; phOpt.disabled=true;
    upiDropdown.appendChild(phOpt); upiDropdown.value="";
    upiDropdown.addEventListener("change",()=>{ selectedUPI=upiDropdown.value; localStorage.setItem(KEY_UPI,selectedUPI); });

    heroCard.append(amtCaption,amtHeroRow,upiCaption,upiDropdown);

    // Stat cards: timer + clicks
    const statsGrid=document.createElement("div");
    statsGrid.style.cssText="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;";

    function makeStatCard(icon,label) {
        const card=document.createElement("div");
        card.className="arb-stat-card";
        const lbl=document.createElement("div");
        lbl.style.cssText=`font-size:8px;font-weight:600;color:${C.textDim};letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;`;
        lbl.textContent=`${icon}  ${label}`;
        const val=document.createElement("div");
        val.style.cssText=`font-size:20px;font-weight:700;color:${C.text};font-family:${C.mono};line-height:1;`;
        val.textContent="—";
        card.append(lbl,val);
        return {card,val};
    }
    const {card:timerCard,val:timerVal}=makeStatCard("⏱","TIMER");
    const {card:clicksCard,val:clicksVal}=makeStatCard("🖱","CLICKS");
    statsGrid.append(timerCard,clicksCard);

    // Detached status refs (used by setUI, not rendered in overlay)
    const statusDot=document.createElement("div");
    const statusVal=document.createElement("span");

    // Start/Stop button
    const startStopBtn=makeBtn("▶  START","linear-gradient(135deg,rgba(34,197,94,0.9),rgba(21,128,61,1))",toggleCycling);
    startStopBtn.disabled=true;
    startStopBtn.style.opacity="0.4";
    startStopBtn.style.cursor="not-allowed";
    startStopBtn.style.marginTop="0";
    startStopBtn.style.padding="11px 0";
    startStopBtn.style.fontSize="12px";
    startStopBtn.style.letterSpacing="1.5px";

    const loginSection=document.createElement("div"); loginSection.style.display="none";
    const credFields=document.createElement("div"); credFields.style.display="none";
    const phoneInp=makeInput("📱 Phone number");
    const passInp=makeInput("🔒 Password","password");
    const saveCredsBtn=makeBtn("💾 Save Credentials","linear-gradient(135deg,rgba(37,99,235,0.8),rgba(29,78,216,0.9))",()=>{
        const p=phoneInp.value.trim(),pw=passInp.value.trim();
        if(!p||!pw) return; saveCreds(p,pw); phoneInp.value=""; passInp.value="";
        credFields.style.display="none"; updateCredsBtn.textContent="✏️ Update credentials";
    });
    credFields.append(phoneInp,passInp,saveCredsBtn);
    const autoLoginBtn=makeBtn("🔐 Auto Login","linear-gradient(135deg,rgba(34,197,94,0.8),rgba(21,128,61,0.9))",()=>{ const c=loadCreds(); if(!c){credFields.style.display="block";return;} doAutoLogin(c); });
    const updateCredsBtn=makeBtn("✏️ Update credentials","linear-gradient(135deg,rgba(107,114,128,0.8),rgba(75,85,99,0.9))",()=>{
        const s=credFields.style.display!=="none"; credFields.style.display=s?"none":"block";
        updateCredsBtn.textContent=s?"✕ Cancel":"✏️ Update credentials";
    });
    loginSection.append(makeDivider(),credFields,autoLoginBtn,updateCredsBtn);
    mainContent.append(heroCard,statsGrid,startStopBtn,loginSection);

    // ── TAB: STATS ────────────────────────────────────────────────────────────
    const statsContent=makeTab("stats","STATS");

    let calViewDate=getISTDate();
    let calSelectedKey=getTodayKey();

    function getCalMK() {
        return `${calViewDate.getFullYear()}-${String(calViewDate.getMonth()+1).padStart(2,"0")}`;
    }

    // Calendar header (month nav)
    const calHeader=document.createElement("div");
    calHeader.style.cssText="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;";

    function makeNavBtn(ch) {
        const btn=document.createElement("button");
        btn.textContent=ch;
        Object.assign(btn.style,{
            background:"none",border:"none",color:C.textDim,cursor:"pointer",
            fontFamily:C.font,fontSize:"18px",fontWeight:"400",padding:"0 8px",lineHeight:"1",
            borderRadius:"5px",transition:"color 0.15s",
        });
        btn.addEventListener("mouseenter",()=>{btn.style.color=C.text;});
        btn.addEventListener("mouseleave",()=>{btn.style.color=C.textDim;});
        return btn;
    }
    const calPrevBtn=makeNavBtn("‹");
    const calNextBtn=makeNavBtn("›");
    const calMonthLabel=document.createElement("span");
    calMonthLabel.style.cssText=`font-size:11px;font-weight:700;color:${C.text};`;
    calHeader.append(calPrevBtn,calMonthLabel,calNextBtn);

    // Day-of-week header
    const calDowRow=document.createElement("div");
    calDowRow.style.cssText="display:grid;grid-template-columns:repeat(7,1fr);text-align:center;margin-bottom:1px;";
    ["M","T","W","T","F","S","S"].forEach(d=>{
        const cell=document.createElement("div");
        cell.textContent=d;
        cell.style.cssText=`font-size:9px;font-weight:600;color:${C.textDim};padding:2px 0;`;
        calDowRow.appendChild(cell);
    });

    // Calendar grid
    const calGrid=document.createElement("div");
    calGrid.style.cssText="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:8px;";

    // Day detail — compact flat section
    const {wrap:dayHdrWrap,title:dayTitle,total:dayTotal,count:dayCount}=makeSectionHdr("—");
    const {row:dRebRew,vals:dRebRewVals}=makeMiniRow("Rebate","Bonus","Sell Rwd");
    const dRebV=dRebRewVals["Rebate"],dBonV=dRebRewVals["Bonus"],dRewV=dRebRewVals["Sell Rwd"];
    dRebV.style.color="#fb923c"; dBonV.style.color="#60a5fa"; dRewV.style.color="#facc15";

    const daySection=document.createElement("div");
    daySection.style.cssText="margin-bottom:6px;";
    daySection.append(dayHdrWrap,dRebRew);

    // Month section — compact flat section
    const {wrap:mHdrWrap,title:mTitle,total:mTotal,count:mCount}=makeSectionHdr("Month");
    const {row:mRow1,vals:mRow1Vals}=makeMiniRow("Rebate","Bonus","Sell Rwd");
    const mRebV=mRow1Vals["Rebate"],mBonV=mRow1Vals["Bonus"],mRewV=mRow1Vals["Sell Rwd"];
    mRebV.style.color="#fb923c"; mBonV.style.color="#60a5fa"; mRewV.style.color="#facc15";

    const monthSection=document.createElement("div");
    monthSection.style.cssText="margin-bottom:5px;";
    monthSection.append(mHdrWrap,mRow1);

    const scanStateLabel=document.createElement("div");
    scanStateLabel.style.cssText=`font-size:9px;color:${C.textDim};text-align:center;padding:2px 0;`;

    const rescanBtn=makeBtn("↺ Full Scan","linear-gradient(135deg,rgba(59,130,246,0.7),rgba(37,99,235,0.8))",()=>{
        if(!isTransactionPage()){ alert("Navigate to Transaction page first."); return; }
        const mk=getMonthKey();
        setMonthScan(mk,{complete:false,lastTime:null});
        tranScanInProgress=false;
        runTransactionScan(true);
    });

    statsContent.append(calHeader,calDowRow,calGrid,makeDivider(),daySection,makeDivider(),monthSection,scanStateLabel,rescanBtn);

    // ── Calendar render ───────────────────────────────────────────────────────
    function renderDayDetail(dateKey) {
        const mk=dateKey.slice(0,7);
        const s=computeStats(getTxnsForDate(mk,dateKey));
        if(pendingBuy&&pendingBuy.dateKey===dateKey){ s.buyCount++; }
        const [,mo,da]=dateKey.split("-");
        dayTitle.textContent=`${MONTH_SHORT[parseInt(mo)-1]} ${parseInt(da)}`;
        dayTotal.textContent=`₹${fmt2(s.earnings)}`;
        if(s.buyCount>0){ dayCount.textContent=`${s.buyCount}×`; dayCount.style.display=""; }
        else { dayCount.style.display="none"; }
        dRebV.textContent=fmtAmt(s.buyRebate);
        dBonV.textContent=fmtAmt(s.buyBonus);
        dRewV.textContent=fmtAmt(s.sellReward);
    }

    function renderMonthTotal(mk) {
        const s=computeStats(getMonthTxns(mk));
        if(pendingBuy&&pendingBuy.mk===mk){ s.buyCount++; }
        const [yr,mo]=mk.split("-");
        mTitle.textContent=`${MONTH_SHORT[parseInt(mo)-1]} ${yr}`;
        mTotal.textContent=`₹${fmt2(s.earnings)}`;
        if(s.buyCount>0){ mCount.textContent=`${s.buyCount}×`; mCount.style.display=""; }
        else { mCount.style.display="none"; }
        mRebV.textContent=fmtAmt(s.buyRebate);
        mBonV.textContent=fmtAmt(s.buyBonus);
        mRewV.textContent=fmtAmt(s.sellReward);
        const scan=getMonthScan(mk);
        scanStateLabel.textContent=scan.complete?`✓ Complete · ${scan.lastTime||""}`:scan.lastTime?`↑ ${scan.lastTime}`:"Not scanned — visit Transactions";
    }

    function renderCalendar() {
        const mk=getCalMK();
        const todayKey=getTodayKey();
        const withData=getDatesWithData(mk);
        const yr=calViewDate.getFullYear(), mo=calViewDate.getMonth();
        calMonthLabel.textContent=`${MONTH_NAMES[mo]} ${yr}`;
        calGrid.innerHTML="";

        const firstDow=(new Date(yr,mo,1).getDay()+6)%7; // Mon=0
        const daysInMonth=new Date(yr,mo+1,0).getDate();
        const currentMk=getMonthKey();
        const isFuture=mk>currentMk;

        for(let i=0;i<firstDow;i++){
            calGrid.appendChild(document.createElement("div"));
        }
        for(let day=1;day<=daysInMonth;day++){
            const dateKey=`${yr}-${String(mo+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const cell=document.createElement("div");
            cell.className="arb-cal-day";
            if(isFuture||dateKey>todayKey) {
                cell.style.opacity="0.25"; cell.style.cursor="default";
            } else {
                if(dateKey===todayKey)        cell.classList.add("today");
                if(dateKey===calSelectedKey)  cell.classList.add("selected");
                if(withData.has(dateKey))     cell.classList.add("has-data");
                cell.addEventListener("click",()=>{
                    calSelectedKey=dateKey;
                    renderCalendar();
                    renderDayDetail(dateKey);
                });
            }
            const num=document.createElement("div"); num.textContent=day;
            cell.appendChild(num);
            calGrid.appendChild(cell);
        }
        renderMonthTotal(mk);
    }

    function navMonth(delta) {
        calViewDate=new Date(calViewDate.getFullYear(),calViewDate.getMonth()+delta,1);
        const mk=getCalMK();
        const todayInView=getTodayKey().startsWith(mk);
        if(todayInView) { calSelectedKey=getTodayKey(); }
        else { calSelectedKey=`${mk}-01`; }
        renderCalendar();
        renderDayDetail(calSelectedKey);
    }
    calPrevBtn.addEventListener("click",()=>navMonth(-1));
    calNextBtn.addEventListener("click",()=>navMonth(1));

    // ── Assemble ──────────────────────────────────────────────────────────────
    overlay.append(headerRow,tabBar,mainContent,statsContent);
    switchTab(activeTab);
    populateUPIDropdown(JSON.parse(localStorage.getItem(KEY_UPI_LIST)||"[]"));
    renderCalendar();
    renderDayDetail(calSelectedKey);

    // ── Collapse / Expand ─────────────────────────────────────────────────────
    let isBubble=localStorage.getItem(KEY_BUBBLE)==="1";
    function setCollapsed(collapsed) {
        isBubble=collapsed; localStorage.setItem(KEY_BUBBLE,collapsed?"1":"0");
        if(collapsed){ const r=overlay.getBoundingClientRect(); bubble.style.left=`${r.left}px`; bubble.style.top=`${r.top}px`; savePos(r.left,r.top); }
        else { const r=bubble.getBoundingClientRect(); const c=clampToViewport(r.left,r.top,258,overlay.offsetHeight||560); overlay.style.left=`${c.left}px`; overlay.style.top=`${c.top}px`; savePos(c.left,c.top); }
        overlay.style.display=collapsed?"none":"block";
        bubble.style.display=collapsed?"flex":"none";
        updateBubble();
    }
    function updateBubble() {
        if(!isBubble) return;
        if(cycling){
            bubble.innerHTML=`<div style="font-size:11px;font-weight:700;color:${C.accent};text-shadow:0 0 10px rgba(59,130,246,0.5)">${formatTimer(buyTimerSeconds)||"..."}</div>`;
            bubble.classList.add("arb-scanning");
        } else if(paymentClicked){
            bubble.innerHTML=`<div style="font-size:22px">💵</div>`;
            bubble.classList.remove("arb-scanning");
        } else {
            bubble.innerHTML=`<div style="font-size:22px;opacity:0.8">⏸️</div>`;
            bubble.classList.remove("arb-scanning");
        }
    }
    bubble.addEventListener("click",()=>{ if(!wasDragging) setCollapsed(false); });

    // ── Draggable ──────────────────────────────────────────────────────────────
    function makeDraggable(el,isOverlay) {
        let dragging=false,ox=0,oy=0,moved=false;
        const clickOnly=new Set([startStopBtn,upiDropdown,amountInput,autoLoginBtn,updateCredsBtn,saveCredsBtn,phoneInp,passInp,headerRow,headerTitle,tabBar,rescanBtn,calPrevBtn,calNextBtn]);
        function isClickOnly(t){ return clickOnly.has(t)||tabBar.contains(t)||headerRow.contains(t)||calGrid.contains(t)||calHeader.contains(t); }
        el.addEventListener("pointerdown",e=>{
            if(isClickOnly(e.target)) return;
            dragging=true; moved=false; wasDragging=false;
            ox=e.clientX-el.getBoundingClientRect().left; oy=e.clientY-el.getBoundingClientRect().top;
            el.setPointerCapture(e.pointerId); e.preventDefault();
        });
        el.addEventListener("pointermove",e=>{
            if(!dragging) return;
            const nl=e.clientX-ox, nt=e.clientY-oy;
            if(!moved&&Math.abs(nl-parseFloat(el.style.left||0))<3&&Math.abs(nt-parseFloat(el.style.top||0))<3) return;
            moved=true; wasDragging=true; el.style.left=`${nl}px`; el.style.top=`${nt}px`;
        });
        el.addEventListener("pointerup",()=>{
            if(!dragging) return; dragging=false;
            if(moved){ const r=el.getBoundingClientRect(); savePos(r.left,r.top);
                if(isOverlay){ bubble.style.left=`${r.left}px`; bubble.style.top=`${r.top}px`; }
                else { overlay.style.left=`${r.left}px`; overlay.style.top=`${r.top}px`; }
            }
            setTimeout(()=>{ wasDragging=false; },50);
        });
    }
    makeDraggable(overlay,true); makeDraggable(bubble,false);

    // ── Page detection ────────────────────────────────────────────────────────
    function getNavTitle()        { return document.querySelector(SEL.navTitle)?.innerText?.trim()||""; }
    function isPaymentPageLoaded(){ return getNavTitle()===PAYMENT_NAV_TITLE; }
    function isCompletedPage()    { return getNavTitle()===COMPLETED_TITLE||!!document.querySelector(".custom_statusInfo .done"); }
    function isLoginPage()        { return !!document.querySelector(SEL.loginPhone); }
    function isUTRPage()          { return !!document.querySelector(".x-payment-box-utr"); }
    function isBuyPage()          { return !!document.querySelector(SEL.filterContainer); }
    function isTransactionPage()  { const t=getNavTitle(); return t&&t.toLowerCase().includes("transaction"); }
    function hasOrderPendingDialog() {
        const popups=document.querySelectorAll('.van-popup:not([style*="display: none"]),.van-action-sheet:not([style*="display: none"]),.van-dialog:not([style*="display: none"])');
        for(const p of popups) if(p.textContent.includes("not been completed")||p.textContent.includes("Order not completed")) return true;
        return false;
    }

    // ── UPI helpers ───────────────────────────────────────────────────────────
    function populateUPIDropdown(list) {
        if(!list||!list.length) return;
        const prev=selectedUPI||upiDropdown.value; upiDropdown.innerHTML="";
        list.forEach(u=>{ const o=document.createElement("option"); o.value=u; o.textContent=u; upiDropdown.appendChild(o); });
        const m=[...upiDropdown.options].find(o=>o.value===prev);
        if(m){ upiDropdown.value=m.value; selectedUPI=m.value; }
        else { upiDropdown.selectedIndex=0; selectedUPI=upiDropdown.value; }
        localStorage.setItem(KEY_UPI,selectedUPI);
    }
    function fetchAndUpdateUPIList() {
        const bl=document.querySelector(SEL.bankList); if(!bl) return false;
        const fresh=[...bl.querySelectorAll(SEL.paymentRow)].filter(r=>r.querySelector(".upi")).map(r=>r.querySelector(".upi").innerText.trim()).filter(Boolean);
        if(!fresh.length) return false;
        localStorage.setItem(KEY_UPI_LIST,JSON.stringify(fresh)); populateUPIDropdown(fresh); return true;
    }
    function immediateUPIClick() {
        if(paymentClicked) return;
        const bl=document.querySelector(SEL.bankList);
        if(!bl){ setTimeout(immediateUPIClick,50); return; }
        const rows=[...bl.querySelectorAll(SEL.paymentRow)].filter(r=>r.querySelector(".upi"));
        if(!rows.length){ setTimeout(immediateUPIClick,50); return; }
        fetchAndUpdateUPIList();
        let target=rows[0];
        if(selectedUPI) for(const r of rows) if(r.querySelector(".upi")?.innerText?.trim()===selectedUPI){ target=r; break; }
        target.click(); paymentClicked=true; setUI("💳 Paying…"); startCountdownWatch();
    }

    // ── Transaction scan ──────────────────────────────────────────────────────
    function runTransactionScan(isFullScan=false) {
        if(tranScanInProgress) return;
        tranScanInProgress=true;

        const currentMk=getMonthKey();
        const cursor=isFullScan?null:(getMonthScan(currentMk).lastTime||null);
        const currentYear=String(getISTDate().getFullYear());

        const collected={}; // mk → txn[]
        const sessionSeen=new Set();
        let newestTime=null;
        let done=false;

        function parsePage() {
            const items=document.querySelectorAll(SEL.tranList);
            for(const item of items){
                const typeEl=item.querySelector(SEL.tranType);
                const amtEl=item.querySelector(SEL.tranAmount);
                // Sell Reward / Refund items use .val for time+order; Buy items use .time
                let timeEls=item.querySelectorAll(SEL.tranTime);
                if(!timeEls.length) timeEls=item.querySelectorAll('.val');
                const timeEl=timeEls[0];
                const orderEl=timeEls[timeEls.length-1];
                if(!typeEl||!amtEl||!timeEl) continue;
                const type=typeEl.innerText.replace(/[\s\u00a0]+/g,' ').trim();
                const timeStr=timeEl.innerText.trim();
                const amount=parseFloat(amtEl.innerText.replace(/[₹,]/g,""))||0;
                const orderNum=(orderEl&&orderEl!==timeEl)?orderEl.innerText.replace(/\s+/g," ").trim():"";
                if(!timeStr||timeStr.length<7) continue;
                const txnKey=`${type}|${orderNum||`${timeStr}|${amount}`}`;
                if(sessionSeen.has(txnKey)) continue;
                sessionSeen.add(txnKey);
                if(!newestTime) newestTime=timeStr;
                // Stop: hit cursor (incremental) or past this year (full)
                if(!isFullScan&&cursor&&timeStr<cursor){ done=true; break; }
                if(timeStr.slice(0,4)<currentYear){ done=true; break; }
                const mk=timeStr.slice(0,7);
                if(!collected[mk]) collected[mk]=[];
                collected[mk].push({type,amount,time:timeStr,order:orderNum});
            }
        }

        function txnKey(t) { return `${t.type||""}|${t.order||`${t.time}|${t.amount}`}`; }

        function mergeAndSave(isFinal) {
            const ts=new Date().toLocaleTimeString();
            Object.entries(collected).forEach(([mk,txns])=>{
                const existing=getMonthTxns(mk);
                const map=new Map(existing.map(t=>[txnKey(t),t]));
                let changed=false;
                txns.forEach(t=>{
                    const k=txnKey(t);
                    const ex=map.get(k);
                    if(!ex||ex.amount!==t.amount){ map.set(k,t); changed=true; }
                });
                if(!changed) return;
                const merged=[...map.values()].sort((a,b)=>b.time.localeCompare(a.time));
                setMonthTxns(mk,merged);
            });
            if(isFinal){
                const state=loadScanState();
                if(isFullScan){
                    Object.keys(collected).forEach(mk=>{
                        state[mk]=mk===currentMk?{complete:false,lastTime:newestTime||ts}:{complete:true,lastTime:ts};
                    });
                } else if(newestTime){
                    state[currentMk]={complete:false,lastTime:newestTime};
                }
                saveScanState(state);
                pendingBuy=null;
                tranScanInProgress=false;
            }
            renderCalendar();
            renderDayDetail(calSelectedKey);
        }

        function scrollStep(stuckCount=0) {
            parsePage();
            mergeAndSave(false); // live update after each scroll step
            if(done){ mergeAndSave(true); return; }
            const prevH=document.body.scrollHeight;
            window.scrollTo(0,prevH);
            setTimeout(()=>{
                if(document.body.scrollHeight>prevH){
                    setTimeout(()=>scrollStep(0),100);
                } else if(stuckCount<3){
                    setTimeout(()=>scrollStep(stuckCount+1),500);
                } else {
                    mergeAndSave(true);
                }
            },500);
        }

        // Scroll to top first so newest transactions (at top of virtual list)
        // are rendered in the DOM before parsePage() is called.
        window.scrollTo(0, 0);
        setTimeout(() => scrollStep(), 400);
    }

    // ── Buy cycle ─────────────────────────────────────────────────────────────
    function setUI(status) {
        let color=C.red, dotColor="#f87171", dotShadow="#f87171";
        if(cycling){ color=C.green; dotColor="#4ade80"; dotShadow="#4ade80"; }
        else if(status.includes("✅")||status.includes("💳")){ color=C.blue; dotColor="#60a5fa"; dotShadow="#60a5fa"; }
        else if(status.includes("⚠️")){ color=C.accent; dotColor=C.accent; dotShadow=C.accent; }
        statusVal.textContent=status.replace(/^[^a-zA-Z₹\d]+/,"").trim()||status;
        statusVal.style.color=color;
        statusDot.style.background=dotColor;
        statusDot.style.boxShadow=`0 0 6px ${dotShadow}`;
        timerVal.textContent=buyTimerSeconds>0?formatTimer(buyTimerSeconds):"—";
        clicksVal.textContent=sessClicks>0?`${sessClicks}`:"—";
        if(cycling){ startStopBtn.textContent="⏹  STOP"; startStopBtn.style.background="linear-gradient(135deg,#ef4444,#b91c1c)"; heroCard.classList.add("arb-hero-active"); }
        else{ if(!startStopBtn.disabled){ startStopBtn.textContent="▶  START"; startStopBtn.style.background="linear-gradient(135deg,rgba(34,197,94,0.9),rgba(21,128,61,1))"; } heroCard.classList.remove("arb-hero-active"); }
        updateBubble();
    }
    function flashOverlay(color) {
        overlay.style.background=color||C.accentDim;
        setTimeout(()=>{ overlay.style.background=C.bg; },500);
    }
    function setButtonEnabled(en) {
        startStopBtn.disabled=!en; startStopBtn.style.opacity=en?"1":"0.4";
        startStopBtn.style.cursor=en?"pointer":"not-allowed";
        if(!cycling) startStopBtn.style.background=en?"linear-gradient(135deg,rgba(34,197,94,0.85),rgba(21,128,61,0.9))":"rgba(50,50,50,0.6)";
    }
    function startBuyTimer() { buyTimerSeconds=0; clearInterval(buyTimerInterval); buyTimerInterval=setInterval(()=>{ buyTimerSeconds++; setUI("🔍 Searching..."); },1000); }
    function stopBuyTimer()  { clearInterval(buyTimerInterval); buyTimerInterval=null; }
    function startCountdownWatch() { clearInterval(countdownInterval); countdownInterval=setInterval(()=>{ if(!document.querySelector(SEL.orderCountdown)) clearInterval(countdownInterval); },1000); }
    function stopCountdownWatch()  { clearInterval(countdownInterval); }

    function playAlert() {
        try {
            const ctx=new(window.AudioContext||window.webkitAudioContext)();
            const osc=ctx.createOscillator(), gain=ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type="sine"; osc.frequency.setValueAtTime(880,ctx.currentTime);
            gain.gain.setValueAtTime(0,ctx.currentTime);
            gain.gain.linearRampToValueAtTime(1.5,ctx.currentTime+0.05);
            gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+1.2);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime+1.2);
        } catch(e){}
    }

    function getAmount(item)    { return parseFloat(item.getAttribute("maximumamount"))||0; }
    function isAvailable(item)  { const b=item.querySelector(SEL.buyButton); return b&&b.innerText.trim()==="Buy"&&!b.disabled; }
    function switchToTab(label) { for(const item of document.querySelectorAll(SEL.filterItems)) if(item.querySelector(".txt")?.innerText?.trim()===label){ item.click(); return true; } return false; }

    function startCompletedWatch() {
        if(completedWatched) return;
        completedWatched=true; completedAlreadyCounted=false;
        completedWatchInterval=setInterval(()=>{
            if(!isCompletedPage()) return;
            if(completedAlreadyCounted) return;
            completedAlreadyCounted=true;
            clearInterval(completedWatchInterval); stopCountdownWatch();
            const amtEl=document.querySelector(".info .item .fw500");
            const amt=amtEl?parseFloat(amtEl.innerText.replace(/[₹,]/g,"").trim())||0:0;
            if(amt>0){ pendingBuy={amount:amt,dateKey:getTodayKey(),mk:getMonthKey()}; renderCalendar(); renderDayDetail(calSelectedKey); }
            flashOverlay("rgba(0,180,80,0.25)");
            setUI("✅ Completed"); completedWatched=false;
        },500);
    }
    function stopCycling() {
        cycling=false; clearTimeout(cycleTimer); clearTimeout(scanTimer);
        stopBuyTimer(); playAlert(); setUI("✅ Found");
        immediateUPIClick(); startCompletedWatch();
    }
    function tryClickBuy() {
        const container=document.querySelector(SEL.optionsList); if(!container) return false;
        for(const item of container.querySelectorAll(SEL.optionItem)){
            const amt=getAmount(item);
            if(amountMatcher(amt)&&isAvailable(item)){
                const btn=item.querySelector(SEL.buyButton);
                if(btn){ btn.click(); sessClicks++; setUI(`🖱️ ₹${amt}`); return true; }
            }
        }
        return false;
    }
    function cycleStep() {
        if(!cycling) return;
        if(isPaymentPageLoaded()){ stopCycling(); return; }
        if(hasOrderPendingDialog()){ cycling=false; clearTimeout(cycleTimer); clearTimeout(scanTimer); stopBuyTimer(); setUI("⚠️ Order pending"); return; }
        const sp=getSpeed();
        switchToTab(TARGET_TABS[cycleIndex%TARGET_TABS.length]);
        scanTimer=setTimeout(()=>{
            if(!cycling) return;
            if(isPaymentPageLoaded()){ stopCycling(); return; }
            const clicked=tryClickBuy();
            if(clicked){
                cycleTimer=setTimeout(()=>{ if(!cycling) return; if(isPaymentPageLoaded()) stopCycling(); else { cycleIndex++; cycleStep(); } },sp.payMs);
            } else { cycleIndex++; cycleTimer=setTimeout(cycleStep,sp.switchMs); }
        },sp.scanMs);
    }
    function startCycling() {
        if(cycling) return;
        cycling=true; cycleIndex=0; paymentClicked=false;
        completedWatched=false; completedAlreadyCounted=false; sessClicks=0;
        startBuyTimer(); setUI("🔍 Searching..."); cycleStep();
    }
    function forceStop() { cycling=false; clearTimeout(cycleTimer); clearTimeout(scanTimer); stopBuyTimer(); setUI("⏹ Stopped"); }
    function toggleCycling() { if(cycling) forceStop(); else startCycling(); }

    function doAutoLogin(creds) {
        const phoneEl=document.querySelector(SEL.loginPhone);
        const passEl=document.querySelector(SEL.loginPassword);
        const btnEl=document.querySelector(SEL.loginBtn);
        if(!phoneEl||!passEl||!btnEl) return;
        function setNativeValue(el,val) { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set.call(el,val); el.dispatchEvent(new Event("input",{bubbles:true})); }
        setNativeValue(phoneEl,creds.phone); setNativeValue(passEl,creds.password);
        setTimeout(()=>btnEl.click(),300);
    }

    function observeFilterChanges() {
        const node=document.querySelector(SEL.filterContainer);
        if(!node){ setTimeout(observeFilterChanges,300); return; }
        new MutationObserver(()=>{}).observe(node,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
    }

    // ── Page watcher ──────────────────────────────────────────────────────────
    let sessionStarted=false, lastPayPage=false, lastTranPage=false, lastTranScanTime=0;
    const TRAN_RESCAN_MS=30000;
    function watchPage() {
        const onBuyPage=isBuyPage(), onLoginPage=isLoginPage(), onPayPage=isPaymentPageLoaded();
        const onUTRPage=isUTRPage(), onTranPage=isTransactionPage();

        if(!onBuyPage&&cycling) forceStop();
        setButtonEnabled(onBuyPage);
        if(onBuyPage&&!sessionStarted){ sessionStarted=true; observeFilterChanges(); setUI("⏹ Stopped"); }

        loginSection.style.display=onLoginPage?"block":"none";

        if(onPayPage){ fetchAndUpdateUPIList(); if(!lastPayPage) immediateUPIClick(); }
        lastPayPage=onPayPage;
        if(onUTRPage) fetchAndUpdateUPIList();

        if(onTranPage&&!tranScanInProgress){
            const now=Date.now();
            const mk=getMonthKey();
            const scan=getMonthScan(mk);
            // Scan on landing; then re-scan every 30s while staying on page
            if(!lastTranPage||now-lastTranScanTime>TRAN_RESCAN_MS){
                const delay=lastTranPage?0:600;
                setTimeout(()=>{
                    if(isTransactionPage()&&!tranScanInProgress){
                        lastTranScanTime=Date.now();
                        runTransactionScan(!scan.lastTime);
                    }
                },delay);
            }
        }
        lastTranPage=onTranPage;

        if(!cycling&&onBuyPage&&hasOrderPendingDialog()) setUI("⚠️ Order pending");
        if(!cycling&&!onPayPage&&!onTranPage&&!onBuyPage&&!onLoginPage) setUI("⏹ Stopped");

        setTimeout(watchPage,300);
    }

    window.addEventListener("resize",()=>{ const p=loadPos()||{left:window.innerWidth-266,top:8}; applyPosition(p.left,p.top); });

    setCollapsed(isBubble);
    setUI("⏹ Stopped");
    watchPage();
})();
