import { useState, useRef, useCallback, useEffect } from "react";
import { db, storage } from "./firebase";
import {
  collection, addDoc, deleteDoc, doc, updateDoc,
  onSnapshot, query, orderBy, Timestamp
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

const MEMBERS = [
  { name: "ひでお", color: "#3B82F6" },
  { name: "しのぶ", color: "#EC4899" },
  { name: "家族",   color: "#10B981" },
  { name: "その他", color: "#F59E0B" },
];

const GOOGLE_API_KEY = "AIzaSyAbZslohJc4kcK3c9LWX1o13oUOVCvw4jQ";
const HOLIDAY_CALENDAR_ID = "ja.japanese%23holiday%40group.v.calendar.google.com";

async function fetchHolidays(year) {
  const timeMin = `${year}-01-01T00:00:00Z`;
  const timeMax = `${year+1}-01-01T00:00:00Z`;
  const url = `https://www.googleapis.com/calendar/v3/calendars/${HOLIDAY_CALENDAR_ID}/events?key=${GOOGLE_API_KEY}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&maxResults=50`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const map = {};
    (data.items || []).forEach(item => {
      const date = item.start?.date;
      if (date) map[date] = item.summary;
    });
    return map;
  } catch(e) {
    console.error("祝日取得失敗", e);
    return {};
  }
}

const C = {
  bg:"#000", surface:"#1C1C1E", border:"#2C2C2E",
  text:"#fff", subtext:"#8E8E93", dimtext:"#48484A",
  sun:"#FF453A", sat:"#3B82F6", prevNextBg:"#111",
};

const CELL_H = 90;
const DAYS = ["日","月","火","水","木","金","土"];
const PAW = ["🐾","🐾","",""];

function getDaysInMonth(y,m){ return new Date(y,m+1,0).getDate(); }
function getFirstDay(y,m){ return new Date(y,m,1).getDay(); }
function addMonth(y,m,d){ const dt=new Date(y,m+d,1); return {y:dt.getFullYear(),m:dt.getMonth()}; }

function buildCells(y,m){
  const fd=getFirstDay(y,m), dim=getDaysInMonth(y,m);
  const prev=addMonth(y,m,-1), pd=getDaysInMonth(prev.y,prev.m);
  const cells=[];
  for(let i=0;i<fd;i++) cells.push({d:pd-fd+i+1,type:"prev"});
  for(let d=1;d<=dim;d++) cells.push({d,type:"cur"});
  const rem=(7-(cells.length%7))%7;
  for(let d=1;d<=rem;d++) cells.push({d,type:"next"});
  return cells;
}

function loadMemberOrder(){
  try{
    const s=localStorage.getItem("memberOrder");
    if(!s) return [0,1,2,3];
    const parsed=JSON.parse(s);
    const valid=Array.isArray(parsed)&&parsed.length===4&&parsed.every(v=>v>=0&&v<4)&&new Set(parsed).size===4;
    return valid?parsed:[0,1,2,3];
  }catch{ return [0,1,2,3]; }
}
function saveMemberOrder(order){
  try{ localStorage.setItem("memberOrder",JSON.stringify(order)); }catch{}
}

function loadEvOrder(dateStr){
  try{ const s=localStorage.getItem(`evOrder_${dateStr}`); return s?JSON.parse(s):[]; }catch{ return []; }
}
function saveEvOrder(dateStr,ids){
  try{ localStorage.setItem(`evOrder_${dateStr}`,JSON.stringify(ids)); }catch{}
}
function sortEvsByOrder(evs,dateStr){
  const ids=loadEvOrder(dateStr);
  if(!ids.length) return evs;
  const indexed=evs.map(e=>({e,i:ids.indexOf(e.id)}));
  indexed.sort((a,b)=>{
    if(a.i===-1&&b.i===-1) return 0;
    if(a.i===-1) return 1;
    if(b.i===-1) return -1;
    return a.i-b.i;
  });
  return indexed.map(x=>x.e);
}

// SplashScreen
function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState("before");

  useEffect(() => {
    const t0 = setTimeout(() => setPhase("in"),   80);
    const t1 = setTimeout(() => setPhase("hold"), 880);
    const t2 = setTimeout(() => setPhase("out"),  1880);
    const t3 = setTimeout(() => onDone(),          2680);
    return () => [t0, t1, t2, t3].forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const opacity = (phase === "before" || phase === "out") ? 0 : 1;
  const transition = (phase === "in" || phase === "out") ? "opacity 0.8s ease" : "none";

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "#000",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      opacity,
      transition,
    }}>
      <img
        src="/family-calendar/logo512.png"
        alt="IKEDA FAMILY CALENDAR"
        style={{
          width: 140,
          height: 140,
          objectFit: "contain",
          borderRadius: 32,
        }}
      />
    </div>
  );
}


function ConfirmDialog({ message, onOk, onCancel }){
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:24}}>
      <div style={{background:"#1C1C1E",borderRadius:18,width:"100%",maxWidth:320,overflow:"hidden"}}>
        <div style={{padding:"24px 20px 16px",textAlign:"center"}}>
          <div style={{fontSize:17,fontWeight:700,color:"#fff",marginBottom:8}}>予定を削除</div>
          <div style={{fontSize:14,color:"#8E8E93",lineHeight:1.6}}>{message}</div>
        </div>
        <div style={{borderTop:"1px solid #2C2C2E",display:"flex"}}>
          <button onClick={onCancel} style={{flex:1,padding:16,background:"none",border:"none",borderRight:"1px solid #2C2C2E",color:"#8E8E93",fontSize:16,fontWeight:600,cursor:"pointer"}}>キャンセル</button>
          <button onClick={onOk} style={{flex:1,padding:16,background:"none",border:"none",color:"#FF453A",fontSize:16,fontWeight:700,cursor:"pointer"}}>削除</button>
        </div>
      </div>
    </div>
  );
}

function Grid({ year, month, events, filterMember, detailDay, setDetailDay, holidays, evOrderVer }){
  const ds=d=>`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const evOn=d=>{
    const dateStr=ds(d);
    const raw=events.filter(e=>e.date===dateStr&&(filterMember===null||e.member===filterMember));
    return sortEvsByOrder(raw,dateStr);
  };
  const tod=new Date();
  const isToday=d=>d===tod.getDate()&&month===tod.getMonth()&&year===tod.getFullYear();
  const cells=buildCells(year,month);
  return (
    <div style={{background:C.bg}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderTop:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`}}>
        {DAYS.map((w,i)=>(
          <div key={i} style={{textAlign:"center",padding:"6px 0",fontSize:11,fontWeight:600,color:i===0?C.sun:i===6?C.sat:C.subtext}}>{w}</div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
        {cells.map(({d,type},idx)=>{
          const col=idx%7, isCur=type==="cur";
          const dayEvs=isCur?evOn(d):[];
          const todCell=isCur&&isToday(d);
          const sel=isCur&&detailDay===d;
          const hol=isCur?holidays[ds(d)]:null;
          const isRed=col===0||!!hol;
          const maxEv=hol?2:3;
          const vis=dayEvs.slice(0,maxEv);
          const hid=dayEvs.length-maxEv;
          return (
            <div key={idx} onClick={()=>{if(!isCur)return;setDetailDay(sel?null:d);}}
              style={{borderRight:col<6?`1px solid ${C.border}`:"none",borderBottom:`1px solid ${C.border}`,padding:"3px 2px",cursor:isCur?"pointer":"default",background:sel?"#1A2940":!isCur?C.prevNextBg:"transparent",boxSizing:"border-box",overflow:"hidden",height:CELL_H}}>
              <div style={{display:"flex",justifyContent:"center",marginBottom:2}}>
                <div style={{width:26,height:26,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:todCell?800:700,color:!isCur?"#3A3A3A":todCell?"#000":isRed?C.sun:col===6?C.sat:"#fff",background:todCell?"#fff":"transparent"}}>{d}</div>
              </div>
              {isCur&&<>
                {hol&&<div style={{fontSize:10,fontWeight:700,color:C.sun,marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingLeft:1}}>{hol}</div>}
                <div style={{display:"flex",flexDirection:"column",gap:1}}>
                  {vis.map((ev,vi)=>(
                    <div key={ev.id} style={{position:"relative"}}>
                      <div style={{background:MEMBERS[ev.member]?.color||"#888",color:"#fff",fontSize:9.5,fontWeight:600,lineHeight:"17px",height:"17px",paddingLeft:3,borderRadius:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",width:"100%",boxSizing:"border-box"}}>{ev.title}</div>
                      {hid>0&&vi===vis.length-1&&(
                        <div style={{position:"absolute",right:0,top:0,background:"rgba(0,0,0,0.55)",color:"#fff",fontSize:9,fontWeight:700,lineHeight:"17px",height:"17px",padding:"0 3px",borderRadius:"0 2px 2px 0"}}>+{hid}</div>
                      )}
                    </div>
                  ))}
                </div>
              </>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SwipeCalendar({ onSwipe, children, disabled }){
  const outerRef=useRef(null);
  const fadeRef=useRef(null);
  const startY=useRef(0);
  const lastY=useRef(0);
  const velocity=useRef(0);
  const curDy=useRef(0);
  const active=useRef(false);
  const lastTime=useRef(0);

  const setTranslate=useCallback((dy,anim)=>{
    const el=outerRef.current; if(!el)return;
    el.style.transition=anim?"transform 0.4s cubic-bezier(0.25,1,0.5,1)":"none";
    el.style.transform=`translateY(${dy}px)`;
    curDy.current=dy;
  },[]);

  const setFade=(opacity,duration)=>{
    const el=fadeRef.current; if(!el)return;
    el.style.transition=`opacity ${duration}s ease`;
    el.style.opacity=String(opacity);
  };

  const onTS=e=>{
    if(disabled)return;
    startY.current=e.touches[0].clientY;lastY.current=e.touches[0].clientY;
    velocity.current=0;lastTime.current=Date.now();active.current=true;setTranslate(0,false);
  };
  const onTM=e=>{
    if(!active.current||disabled)return;
    const y=e.touches[0].clientY;const now=Date.now();const dt=now-lastTime.current||1;
    velocity.current=(y-lastY.current)/dt;lastY.current=y;lastTime.current=now;setTranslate(y-startY.current,false);
  };
  const doSwipe=dir=>{
    const h=outerRef.current?.offsetHeight||600;
    setTranslate(dir>0?-h:h,true);setFade(0,0.2);
    setTimeout(()=>{setTranslate(0,false);onSwipe(dir);requestAnimationFrame(()=>{setFade(0,0);requestAnimationFrame(()=>setFade(1,1.2));});},420);
  };
  const onTE=()=>{
    if(!active.current||disabled)return;active.current=false;
    const dy=curDy.current;const h=outerRef.current?.offsetHeight||600;const vel=velocity.current;
    if(dy<-(h*0.22)||vel<-0.4)doSwipe(1);
    else if(dy>(h*0.22)||vel>0.4)doSwipe(-1);
    else setTranslate(0,true);
  };

  return (
    <div style={{overflow:"hidden",touchAction:disabled?"none":"none"}} onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}>
      <div ref={outerRef}><div ref={fadeRef} style={{opacity:1}}>{children}</div></div>
    </div>
  );
}

const navBtn={width:34,height:34,borderRadius:"50%",background:"#1C1C1E",border:"none",fontSize:18,cursor:"pointer",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"};
const lbl={fontSize:11,fontWeight:700,color:"#8E8E93",letterSpacing:"0.08em",marginBottom:8};
const inp={width:"100%",padding:"12px 14px",borderRadius:12,fontSize:16,boxSizing:"border-box",outline:"none"};

// ── 予定ドラッグ並び替えフック ──────────────────────────
function useEvDrag({ events, filter, ds, setEvOrderVer, openEdit }) {
  const [evDragIdx,setEvDragIdx]=useState(null);
  const [evDragOver,setEvDragOver]=useState(null);
  const [evGhost,setEvGhost]=useState({label:"",color:"",x:0,y:0,visible:false});
  const evDragRef=useRef(null);
  const evLpTimer=useRef(null);
  const evDidDrag=useRef(false);
  const lockScroll=useRef(false);

  const getSortedEvs=(d)=>{
    const dateStr=ds(d);
    const raw=events.filter(e=>e.date===dateStr&&(filter===null||e.member===filter));
    return sortEvsByOrder(raw,dateStr);
  };

  const makeHandlers=(idx,sortedEvs,dateStr)=>{
    const onTouchStart=(e)=>{
      evDidDrag.current=false;
      const t=e.touches[0];
      const ev=sortedEvs[idx];
      evLpTimer.current=setTimeout(()=>{
        lockScroll.current=true;
        document.body.style.overflow="hidden";
        document.documentElement.style.overflow="hidden";
        evDragRef.current=idx;
        setEvDragIdx(idx);
        setEvGhost({label:ev.title,color:MEMBERS[ev.member]?.color||"#888",x:t.clientX,y:t.clientY,visible:true});
        if(navigator.vibrate)navigator.vibrate(30);
      },400);
    };

    const onTouchMove=(e)=>{
      if(evDragRef.current===null){
        clearTimeout(evLpTimer.current);
        return;
      }
      e.preventDefault();
      evDidDrag.current=true;
      const t=e.touches[0];
      setEvGhost(g=>({...g,x:t.clientX,y:t.clientY}));
      const el=document.elementFromPoint(t.clientX,t.clientY);
      const target=el?.closest("[data-evidx]");
      if(target){
        const v=Number(target.dataset.evidx);
        if(!isNaN(v)&&v>=0&&v<sortedEvs.length) setEvDragOver(v);
      }
    };

    const onTouchEnd=()=>{
      clearTimeout(evLpTimer.current);
      if(lockScroll.current){
        lockScroll.current=false;
        document.body.style.overflow="";
        document.documentElement.style.overflow="";
      }
      const from=evDragRef.current;
      if(from!==null){
        setEvDragOver(latest=>{
          if(latest!==null&&from!==latest){
            const newEvs=[...sortedEvs];
            const[moved]=newEvs.splice(from,1);
            newEvs.splice(latest,0,moved);
            saveEvOrder(dateStr,newEvs.map(e=>e.id));
            setEvOrderVer(v=>v+1);
          }
          return null;
        });
      } else if(!evDidDrag.current){
        openEdit(sortedEvs[idx]);
      }
      evDragRef.current=null;
      setEvDragIdx(null);
      setEvGhost(g=>({...g,visible:false}));
    };

    return { onTouchStart, onTouchMove, onTouchEnd };
  };

  return { evDragIdx, evDragOver, evGhost, getSortedEvs, makeHandlers };
}

export default function App(){
  const today=new Date();
  const [year,setYear]=useState(today.getFullYear());
  const [month,setMonth]=useState(today.getMonth());
  const [holidays,setHolidays]=useState({});
  const [events,setEvents]=useState([]);
  const [loading,setLoading]=useState(true);
  const [uploading,setUploading]=useState(false);

  // ── スプラッシュ制御 ──
  const [splashDone, setSplashDone] = useState(false);
  const [appVisible, setAppVisible] = useState(false);

  const handleSplashDone = useCallback(() => {
    setSplashDone(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setAppVisible(true))
    );
  }, []);

  const [modalMode,setModalMode]=useState(null);
  const [editTarget,setEditTarget]=useState(null);
  const [selDate,setSelDate]=useState(null);
  const [form,setForm]=useState({title:"",member:0,note:"",photos:[]});

  const [detailDay,setDetailDay]=useState(null);
  const [filter,setFilter]=useState(null);
  const [memberOrder,setMemberOrder]=useState(loadMemberOrder);
  const [lightbox,setLightbox]=useState(null);
  const fileInputRef=useRef(null);
  const [confirmTarget,setConfirmTarget]=useState(null);
  const [evOrderVer,setEvOrderVer]=useState(0);

  const [modalOffset,setModalOffset]=useState(0);
  const isDragging=useRef(false);
  const modalStartY=useRef(0);

  const onModalTouchStart=(e)=>{
    const el=e.currentTarget;
    if(el.scrollTop>0)return;
    isDragging.current=true;
    modalStartY.current=e.touches[0].clientY;
    setModalOffset(0);
  };
  const onModalTouchMove=(e)=>{
    if(!isDragging.current)return;
    const dy=e.touches[0].clientY-modalStartY.current;
    if(dy<0)return;
    setModalOffset(dy);
  };
  const onModalTouchEnd=(e)=>{
    if(!isDragging.current)return;
    isDragging.current=false;
    const dy=e.changedTouches[0].clientY-modalStartY.current;
    if(dy>120){setModalOffset(window.innerHeight);setTimeout(()=>{setModalMode(null);setModalOffset(0);},320);}
    else setModalOffset(0);
  };

  const [dragIdx,setDragIdx]=useState(null);
  const [dragOver,setDragOver]=useState(null);
  const [ghost,setGhost]=useState({label:"",color:"",x:0,y:0,visible:false});
  const lpTimer=useRef(null);
  const dragRef=useRef(null);
  const didDrag=useRef(false);
  const orderRef=useRef(loadMemberOrder());
  const [mDragIdx,setMDragIdx]=useState(null);
  const [mDragOver,setMDragOver]=useState(null);
  const [mGhost,setMGhost]=useState({label:"",color:"",x:0,y:0,visible:false});
  const mLpTimer=useRef(null);
  const mDragRef=useRef(null);
  const mDidDrag=useRef(false);

  useEffect(()=>{
    document.body.style.background="#000";
    document.documentElement.style.background="#000";
    return()=>{document.body.style.background="";document.documentElement.style.background="";};
  },[]);

  useEffect(()=>{
    const open=modalMode||lightbox||confirmTarget;
    if(open){document.body.style.overflow="hidden";document.documentElement.style.overflow="hidden";}
    else{document.body.style.overflow="";document.documentElement.style.overflow="";}
    return()=>{document.body.style.overflow="";document.documentElement.style.overflow="";};
  },[modalMode,lightbox,confirmTarget]);

  useEffect(()=>{
    const q=query(collection(db,"events"),orderBy("createdAt","asc"));
    const unsub=onSnapshot(q,snap=>{setEvents(snap.docs.map(d=>({id:d.id,...d.data()})));setLoading(false);});
    return()=>unsub();
  },[]);

  useEffect(()=>{
    const years=[year-1,year,year+1];
    Promise.all(years.map(y=>fetchHolidays(y))).then(results=>setHolidays(Object.assign({},...results)));
  },[year]);

  const toWareki=y=>y>=2019?`令和${y-2018}年`:y>=1989?`平成${y-1988}年`:`${y}年`;
  const shiftMonth=d=>{setDetailDay(null);const nm=addMonth(year,month,d);setYear(nm.y);setMonth(nm.m);};
  const applyOrder=o=>{orderRef.current=o;setMemberOrder(o);saveMemberOrder(o);};

  const makeHandlers=(mi,isModal)=>{
    const rf=isModal?mDragRef:dragRef;
    const lpT=isModal?mLpTimer:lpTimer;
    const setDI=isModal?setMDragIdx:setDragIdx;
    const setDO=isModal?setMDragOver:setDragOver;
    const setG=isModal?setMGhost:setGhost;
    const didD=isModal?mDidDrag:didDrag;
    const mi_color=MEMBERS[mi]?.color||"#888";
    const mi_name=MEMBERS[mi]?.name||"";
    return {
      onTouchStart:(e)=>{
        didD.current=false;const t=e.touches[0];
        lpT.current=setTimeout(()=>{rf.current=mi;setDI(mi);setG({label:mi_name,color:mi_color,x:t.clientX,y:t.clientY,visible:true});if(navigator.vibrate)navigator.vibrate(30);},450);
      },
      onTouchMove:(e)=>{
        if(rf.current===null){clearTimeout(lpT.current);return;}
        didD.current=true;const t=e.touches[0];setG(g=>({...g,x:t.clientX,y:t.clientY}));
        const el=document.elementFromPoint(t.clientX,t.clientY);
        const v=Number(el?.dataset?.[isModal?"mdx":"dx"]);
        if(!isNaN(v)&&v>=0&&v<MEMBERS.length)setDO(v);
      },
      onTouchEnd:()=>{
        clearTimeout(lpT.current);const from=rf.current;
        if(from!==null){
          (isModal?setMDragOver:setDragOver)(latest=>{
            if(latest!==null&&from!==latest){const no=[...orderRef.current];const fi=no.indexOf(from),ti=no.indexOf(latest);if(fi>=0&&ti>=0){no.splice(fi,1);no.splice(ti,0,from);applyOrder(no);}}
            return null;
          });
        }else if(!didD.current){
          if(isModal)setForm(f=>({...f,member:mi}));else setFilter(p=>p===mi?null:mi);
        }
        rf.current=null;setDI(null);setG(g=>({...g,visible:false}));
      },
    };
  };

  const ds=d=>`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;

  const openAdd=d=>{setSelDate(d);setForm({title:"",member:0,note:"",photos:[]});setEditTarget(null);setDetailDay(null);setModalOffset(0);setModalMode("add");};
  const openEdit=ev=>{setForm({title:ev.title,member:ev.member,note:ev.note||"",photos:(ev.photos||[]).map(u=>({url:u,file:null}))});setEditTarget(ev);setModalOffset(0);setModalMode("edit");};

  const { evDragIdx, evDragOver, evGhost, getSortedEvs, makeHandlers: makeEvHandlers } = useEvDrag({
    events, filter, ds, setEvOrderVer, openEdit,
  });

  const uploadPhotos=async(files)=>{
    const urls=[];
    for(const file of files){const storageRef=ref(storage,`photos/${Date.now()}_${file.name}`);await uploadBytes(storageRef,file);const url=await getDownloadURL(storageRef);urls.push(url);}
    return urls;
  };

  const handlePhotoPick=(e)=>{
    Array.from(e.target.files).forEach(file=>{const reader=new FileReader();reader.onload=ev=>setForm(f=>({...f,photos:[...f.photos,{url:ev.target.result,file}]}));reader.readAsDataURL(file);});
    e.target.value="";
  };

  const addEv=async()=>{
    if(!form.title.trim())return;setUploading(true);
    try{
      const photoUrls=form.photos.filter(p=>p.file).length>0?await uploadPhotos(form.photos.filter(p=>p.file).map(p=>p.file)):[];
      await addDoc(collection(db,"events"),{title:form.title,date:ds(selDate),member:+form.member,note:form.note,photos:photoUrls,createdAt:Timestamp.now()});
      setModalMode(null);
    }catch(e){console.error(e);alert("保存に失敗しました");}
    setUploading(false);
  };

  const saveEdit=async()=>{
    if(!form.title.trim()||!editTarget)return;setUploading(true);
    try{
      const existingUrls=form.photos.filter(p=>!p.file).map(p=>p.url);
      const newUrls=form.photos.filter(p=>p.file).length>0?await uploadPhotos(form.photos.filter(p=>p.file).map(p=>p.file)):[];
      await updateDoc(doc(db,"events",editTarget.id),{title:form.title,member:+form.member,note:form.note,photos:[...existingUrls,...newUrls]});
      setModalMode(null);
    }catch(e){console.error(e);alert("更新に失敗しました");}
    setUploading(false);
  };

  const execDelete=async()=>{
    if(!confirmTarget)return;
    await deleteDoc(doc(db,"events",confirmTarget.id));
    setConfirmTarget(null);
    setModalMode(null);
  };



  const showModal=modalMode==="add"||modalMode==="edit";
  const isEdit=modalMode==="edit";
  const dateLabel=isEdit
    ?`${editTarget?.date?.slice(5,7).replace(/^0/,"")}月${editTarget?.date?.slice(8,10).replace(/^0/,"")}日を編集`
    :`${month+1}月${selDate}日に追加`;

  return (
    <div style={{fontFamily:"'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif",background:C.bg,color:C.text,minHeight:"100vh",overflowX:"hidden"}}>

      {/* スプラッシュ（Firestore読み込み完了前でも表示継続） */}
      {!splashDone && <SplashScreen onDone={handleSplashDone}/>}

      {/* App本体：スプラッシュ完了後にフェードイン */}
      <div style={{
        opacity: appVisible ? 1 : 0,
        transition: "opacity 0.8s ease",
        pointerEvents: appVisible ? "auto" : "none",
      }}>

        {loading && (
          <div style={{
            position:"fixed",inset:0,
            display:"flex",alignItems:"center",justifyContent:"center",
            color:"#8E8E93",fontSize:14,background:C.bg,zIndex:5
          }}>読み込み中...</div>
        )}

        {/* ヘッダー */}
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:10,background:C.bg,height:211,display:"flex",flexDirection:"column",justifyContent:"flex-start"}}>
          <div style={{textAlign:"center",paddingTop:22,paddingBottom:10,fontSize:11,fontWeight:700,letterSpacing:"0.22em",color:"#8E8E93",userSelect:"none"}}>IKEDA FAMILY CALENDAR</div>
          <div style={{padding:"0 16px",display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:10,marginTop:16}}>
            <div>
              <div style={{fontSize:12,color:C.subtext,fontWeight:600,lineHeight:1}}>{year}</div>
              <div style={{fontSize:42,fontWeight:800,letterSpacing:"-0.03em",lineHeight:1,margin:"2px 0"}}>{month+1}月</div>
              <div style={{fontSize:12,color:C.subtext,fontWeight:600,lineHeight:1}}>{toWareki(year)}</div>
            </div>
            <div style={{display:"flex",gap:6,paddingBottom:4}}>
              <button onClick={()=>shiftMonth(-1)} style={navBtn}>‹</button>
              <button onClick={()=>shiftMonth(1)} style={navBtn}>›</button>
            </div>
          </div>
          <div style={{display:"flex",gap:6,padding:"14px 16px 6px",overflowX:"auto",userSelect:"none",WebkitUserSelect:"none"}}>
            <button onClick={()=>setFilter(null)} style={{padding:"6px 18px",borderRadius:20,fontSize:13,fontWeight:700,border:"none",background:filter===null?"#48484A":C.surface,color:filter===null?"#fff":C.subtext,whiteSpace:"nowrap",cursor:"pointer",flexShrink:0}}>全員</button>
            {memberOrder.map(mi=>{
              const m=MEMBERS[mi];if(!m)return null;
              const h=makeHandlers(mi,false);
              return(<button key={mi} data-dx={String(mi)} {...h} style={{padding:"6px 18px",borderRadius:20,fontSize:13,fontWeight:700,border:"none",background:filter===mi?m.color:C.surface,color:filter===mi?"#fff":C.subtext,whiteSpace:"nowrap",cursor:"grab",flexShrink:0,WebkitUserSelect:"none",WebkitTouchCallout:"none",touchAction:"manipulation",opacity:dragIdx===mi?0.45:1,transform:dragOver===mi?"scale(1.1)":"scale(1)",transition:"transform 0.15s,opacity 0.15s"}}><span>{m.name}</span>{PAW[mi]&&<span style={{fontSize:"0.9em",marginLeft:3}}>{PAW[mi]}</span>}</button>);
            })}
          </div>
        </div>

        {ghost.visible&&<div style={{position:"fixed",left:ghost.x,top:ghost.y,transform:"translate(-50%,-50%) scale(1.15)",zIndex:999,pointerEvents:"none",background:ghost.color,color:"#fff",fontSize:13,fontWeight:700,padding:"6px 18px",borderRadius:20,boxShadow:"0 6px 24px rgba(0,0,0,0.5)",opacity:0.92}}>{ghost.label}</div>}
        {evGhost.visible&&<div style={{position:"fixed",left:evGhost.x,top:evGhost.y,transform:"translate(-50%,-50%) scale(1.1)",zIndex:999,pointerEvents:"none",background:evGhost.color,color:"#fff",fontSize:13,fontWeight:700,padding:"7px 16px",borderRadius:10,boxShadow:"0 6px 24px rgba(0,0,0,0.6)",opacity:0.92,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{evGhost.label}</div>}

        <div style={{height:211}}/>

        <div style={{position:"relative"}}>
          <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:260,opacity:0.15,userSelect:"none",filter:"grayscale(1) brightness(3)",pointerEvents:"none",zIndex:0}}>🐾</div>
          <SwipeCalendar onSwipe={shiftMonth} disabled={evDragIdx!==null}>
            <Grid year={year} month={month} events={events} filterMember={filter} detailDay={detailDay} setDetailDay={setDetailDay} holidays={holidays} evOrderVer={evOrderVer}/>
          </SwipeCalendar>
        </div>

        {/* 詳細パネル */}
        {detailDay&&(()=>{
          const dateStr=ds(detailDay);
          const sortedEvs=getSortedEvs(detailDay);
          return(
            <div style={{borderTop:`1px solid ${C.border}`,padding:"14px 16px",background:C.bg}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontSize:13,fontWeight:700}}>{month+1}月{detailDay}日</div>
                <button onClick={()=>openAdd(detailDay)} style={{background:C.surface,color:C.text,border:"none",borderRadius:20,padding:"8px 20px",fontSize:14,fontWeight:700,cursor:"pointer"}}>＋ 追加</button>
              </div>
              {sortedEvs.length===0&&<div style={{color:C.subtext,fontSize:13,padding:"8px 0"}}>予定なし</div>}
              {sortedEvs.map((ev,idx)=>{
                const handlers=makeEvHandlers(idx,sortedEvs,dateStr);
                return(
                  <EvCard
                    key={ev.id}
                    ev={ev}
                    idx={idx}
                    isDragging={evDragIdx===idx}
                    isOver={evDragOver===idx}
                    handlers={handlers}
                  />
                );
              })}
              {sortedEvs.length>0&&<div style={{fontSize:11,color:C.dimtext,textAlign:"center",marginTop:4,paddingBottom:8}}>長押しで並び替え・タップで編集</div>}
            </div>
          );
        })()}

        {/* 追加/編集モーダル */}
        {showModal&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100,overflow:"hidden"}} onClick={e=>e.target===e.currentTarget&&setModalMode(null)}>
            <div
              style={{background:isEdit?"#12122A":C.surface,borderRadius:"24px 24px 0 0",padding:"24px 20px 32px",width:"100%",maxWidth:480,maxHeight:"85vh",overflowY:"auto",WebkitOverflowScrolling:"touch",overscrollBehavior:"contain",transform:`translateY(${modalOffset}px)`,transition:isDragging.current?"none":"transform 0.32s cubic-bezier(0.25,1,0.5,1)"}}
              onTouchStart={onModalTouchStart} onTouchMove={onModalTouchMove} onTouchEnd={onModalTouchEnd}
            >
              <div style={{width:36,height:4,borderRadius:2,background:C.border,margin:"0 auto 20px"}}/>
              {mGhost.visible&&<div style={{position:"fixed",left:mGhost.x,top:mGhost.y,transform:"translate(-50%,-50%) scale(1.15)",zIndex:999,pointerEvents:"none",background:mGhost.color,color:"#fff",fontSize:13,fontWeight:700,padding:"6px 18px",borderRadius:20,boxShadow:"0 6px 24px rgba(0,0,0,0.5)",opacity:0.92}}>{mGhost.label}</div>}

              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
                <div style={{fontSize:16,fontWeight:800}}>{dateLabel}</div>
                {isEdit&&<div style={{fontSize:11,color:"#7B7BFF",fontWeight:700,background:"rgba(123,123,255,0.15)",padding:"4px 10px",borderRadius:20}}>編集中</div>}
              </div>

              <div style={{marginBottom:14}}>
                <div style={lbl}>タイトル</div>
                <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="予定を入力" style={{...inp,background:C.bg,color:C.text,border:`1px solid ${C.border}`}}/>
              </div>
              <div style={{marginBottom:14}}>
                <div style={lbl}>だれ？</div>
                <div style={{display:"flex",gap:6,userSelect:"none",WebkitUserSelect:"none"}}>
                  {memberOrder.map(mi=>{
                    const m=MEMBERS[mi];if(!m)return null;
                    const h=makeHandlers(mi,true);
                    return(<button key={mi} data-mdx={String(mi)} {...h} style={{flex:1,padding:"10px 0",borderRadius:12,border:"none",background:form.member===mi?m.color:C.bg,color:form.member===mi?"#fff":C.subtext,fontSize:14,fontWeight:700,cursor:"pointer",WebkitUserSelect:"none",WebkitTouchCallout:"none",touchAction:"manipulation",opacity:mDragIdx===mi?0.45:1,transform:mDragOver===mi?"scale(1.1)":"scale(1)",transition:"transform 0.15s,opacity 0.15s"}}>{m.name}{PAW[mi]&&<span style={{fontSize:"0.85em",marginLeft:2}}>{PAW[mi]}</span>}</button>);
                  })}
                </div>
              </div>
              <div style={{marginBottom:14}}>
                <div style={lbl}>メモ（任意）</div>
                <input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="場所・時間など" style={{...inp,background:C.bg,color:C.text,border:`1px solid ${C.border}`}}/>
              </div>
              <div style={{marginBottom:24}}>
                <div style={lbl}>写真（任意）</div>
                <input ref={fileInputRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handlePhotoPick}/>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {form.photos.map((p,i)=>(
                    <div key={i} style={{position:"relative",width:72,height:72}}>
                      <img src={p.url} style={{width:72,height:72,objectFit:"cover",borderRadius:8}} onClick={()=>setLightbox(p.url)} alt=""/>
                      <button onClick={()=>setForm(f=>({...f,photos:f.photos.filter((_,j)=>j!==i)}))} style={{position:"absolute",top:-6,right:-6,width:20,height:20,borderRadius:"50%",background:"#FF453A",border:"none",color:"#fff",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                    </div>
                  ))}
                  <button onClick={()=>fileInputRef.current?.click()} style={{width:72,height:72,borderRadius:8,border:`2px dashed ${C.border}`,background:"transparent",color:C.subtext,fontSize:28,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>＋</button>
                </div>
              </div>

              {isEdit?(
                <div style={{display:"flex",gap:10}}>
                  <button
                    onClick={()=>setConfirmTarget({id:editTarget.id,title:editTarget.title})}
                    disabled={uploading}
                    style={{flex:1,padding:14,borderRadius:14,background:"rgba(255,69,58,0.15)",color:"#FF453A",border:"1px solid rgba(255,69,58,0.3)",fontSize:15,fontWeight:800,cursor:"pointer"}}
                  >削除</button>
                  <button
                    onClick={saveEdit}
                    disabled={uploading}
                    style={{flex:2,padding:14,borderRadius:14,background:uploading?"#555":"#7B7BFF",color:"#fff",border:"none",fontSize:15,fontWeight:800,cursor:uploading?"not-allowed":"pointer"}}
                  >{uploading?"更新中...":"更新する"}</button>
                </div>
              ):(
                <button onClick={addEv} disabled={uploading}
                  style={{width:"100%",padding:14,borderRadius:14,background:uploading?"#555":"#fff",color:"#000",border:"none",fontSize:15,fontWeight:800,cursor:uploading?"not-allowed":"pointer"}}>
                  {uploading?"保存中...":"追加する"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* 削除確認 */}
        {confirmTarget&&(
          <ConfirmDialog
            message={`「${confirmTarget.title}」を削除しますか？`}
            onOk={execDelete}
            onCancel={()=>setConfirmTarget(null)}
          />
        )}

        {/* ライトボックス */}
        {lightbox&&(
          <div onClick={()=>setLightbox(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16,overflow:"hidden"}}>
            <img src={lightbox} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",borderRadius:8}} alt=""/>
            <button onClick={()=>setLightbox(null)} style={{position:"absolute",top:20,right:20,background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",fontSize:22,width:40,height:40,borderRadius:"50%",cursor:"pointer"}}>×</button>
          </div>
        )}

      </div>{/* /appVisible wrapper */}
    </div>
  );
}

// ── 予定カード ────────────────────────────────────────────────
function EvCard({ ev, idx, isDragging, isOver, handlers }){
  const cardRef=useRef(null);

  useEffect(()=>{
    const el=cardRef.current;
    if(!el)return;
    el.addEventListener("touchstart",handlers.onTouchStart,{passive:true});
    el.addEventListener("touchmove",handlers.onTouchMove,{passive:false});
    el.addEventListener("touchend",handlers.onTouchEnd,{passive:true});
    return()=>{
      el.removeEventListener("touchstart",handlers.onTouchStart);
      el.removeEventListener("touchmove",handlers.onTouchMove);
      el.removeEventListener("touchend",handlers.onTouchEnd);
    };
  });

  return(
    <div
      ref={cardRef}
      data-evidx={String(idx)}
      style={{
        display:"flex",flexDirection:"column",gap:8,
        padding:"10px 12px",borderRadius:12,background:C.surface,
        marginBottom:6,
        borderLeft:`3px solid ${MEMBERS[ev.member]?.color||"#888"}`,
        opacity:isDragging?0.35:1,
        transform:isOver?"scale(1.02)":"scale(1)",
        transition:"transform 0.12s,opacity 0.12s",
        cursor:"pointer",
        WebkitUserSelect:"none",
        userSelect:"none",
        touchAction:"none",
      }}
    >
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{color:C.dimtext,fontSize:15,userSelect:"none",flexShrink:0,lineHeight:1}}>☰</div>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700}}>{ev.title}</div>
          <div style={{fontSize:11,color:C.subtext}}>{MEMBERS[ev.member]?.name}{ev.note?`・${ev.note}`:""}</div>
        </div>
      </div>
      {ev.photos&&ev.photos.length>0&&(
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {ev.photos.map((p,i)=>(
            <img key={i} src={p} style={{width:60,height:60,objectFit:"cover",borderRadius:6,cursor:"pointer"}} alt=""/>
          ))}
        </div>
      )}
    </div>
  );
}
