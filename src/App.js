import { useState, useRef, useCallback, useEffect } from "react";
import { db, storage } from "./firebase";
import {
  collection, addDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, Timestamp
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
 
const MEMBERS = [
  { name: "ひでお", color: "#3B82F6" },
  { name: "しのぶ", color: "#EC4899" },
  { name: "家族",   color: "#10B981" },
  { name: "その他", color: "#F59E0B" },
];
 
const HOLIDAYS = {
  "2025-01-01":"元日","2025-01-13":"成人の日","2025-02-11":"建国記念の日",
  "2025-02-23":"天皇誕生日","2025-02-24":"振替休日","2025-03-20":"春分の日",
  "2025-04-29":"昭和の日","2025-05-03":"憲法記念日","2025-05-04":"みどりの日",
  "2025-05-05":"こどもの日","2025-05-06":"振替休日","2025-07-21":"海の日",
  "2025-08-11":"山の日","2025-09-15":"敬老の日","2025-09-23":"秋分の日",
  "2025-10-13":"スポーツの日","2025-11-03":"文化の日","2025-11-23":"勤労感謝の日","2025-11-24":"振替休日",
  "2026-01-01":"元日","2026-01-12":"成人の日","2026-02-11":"建国記念の日",
  "2026-02-23":"天皇誕生日","2026-03-20":"春分の日","2026-04-29":"昭和の日",
  "2026-05-03":"憲法記念日","2026-05-04":"みどりの日","2026-05-05":"こどもの日",
  "2026-05-06":"振替休日","2026-07-20":"海の日","2026-08-11":"山の日",
  "2026-09-21":"敬老の日","2026-09-23":"秋分の日","2026-10-12":"スポーツの日",
  "2026-11-03":"文化の日","2026-11-23":"勤労感謝の日",
  "2027-01-01":"元日","2027-01-11":"成人の日","2027-02-11":"建国記念の日",
  "2027-02-23":"天皇誕生日","2027-03-21":"春分の日","2027-03-22":"振替休日",
  "2027-04-29":"昭和の日","2027-05-03":"憲法記念日","2027-05-04":"みどりの日",
  "2027-05-05":"こどもの日","2027-07-19":"海の日","2027-08-11":"山の日",
  "2027-09-20":"敬老の日","2027-09-23":"秋分の日","2027-10-11":"スポーツの日",
  "2027-11-03":"文化の日","2027-11-23":"勤労感謝の日",
};
 
const C = {
  bg:"#000", surface:"#1C1C1E", border:"#2C2C2E",
  text:"#fff", subtext:"#8E8E93", dimtext:"#48484A",
  sun:"#FF453A", sat:"#3B82F6", prevNextBg:"#111",
};
 
const CELL_H = 90;
const DAY_ROW_H = 29;
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
 
function Grid({ year, month, events, filterMember, detailDay, setDetailDay }){
  const ds=d=>`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const evOn=d=>events.filter(e=>e.date===ds(d)&&(filterMember===null||e.member===filterMember));
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
          const hol=isCur?HOLIDAYS[ds(d)]:null;
          const isRed=col===0||!!hol;
          const maxEv=hol?2:3;
          const vis=dayEvs.slice(0,maxEv);
          const hid=dayEvs.length-maxEv;
          return (
            <div key={idx} onClick={()=>{if(!isCur)return;setDetailDay(sel?null:d);}}
              style={{
                borderRight:col<6?`1px solid ${C.border}`:"none",
                borderBottom:`1px solid ${C.border}`,
                padding:"3px 2px",cursor:isCur?"pointer":"default",
                background:sel?"#1A2940":!isCur?C.prevNextBg:"transparent",
                boxSizing:"border-box",overflow:"hidden",height:CELL_H,
              }}>
              <div style={{display:"flex",justifyContent:"center",marginBottom:2}}>
                <div style={{
                  width:26,height:26,borderRadius:"50%",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:15,fontWeight:todCell?800:700,
                  color:!isCur?"#3A3A3A":todCell?"#000":isRed?C.sun:col===6?C.sat:"#fff",
                  background:todCell?"#fff":"transparent",
                }}>{d}</div>
              </div>
              {isCur&&<>
                {hol&&<div style={{fontSize:10,fontWeight:700,color:C.sun,marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingLeft:1}}>{hol}</div>}
                <div style={{display:"flex",flexDirection:"column",gap:1}}>
                  {vis.map((ev,vi)=>(
                    <div key={ev.id} style={{position:"relative"}}>
                      <div style={{
                        background:MEMBERS[ev.member]?.color||"#888",color:"#fff",
                        fontSize:9.5,fontWeight:600,lineHeight:"17px",height:"17px",
                        paddingLeft:3,borderRadius:2,
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                        width:"100%",boxSizing:"border-box",
                      }}>{ev.title}</div>
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
 
function SwipeCalendar({ onSwipe, children }){
  const outerRef=useRef(null);
  const startY=useRef(0);
  const curDy=useRef(0);
  const active=useRef(false);
  const animating=useRef(false);
  const move=useCallback((dy,anim)=>{
    const el=outerRef.current; if(!el)return;
    el.style.transition=anim?"transform 0.9s cubic-bezier(0.32,0.72,0,1)":"none";
    el.style.transform=`translateY(${dy}px)`;
    curDy.current=dy;
  },[]);
  const onTS=e=>{if(animating.current)return;startY.current=e.touches[0].clientY;active.current=true;move(0,false);};
  const onTM=e=>{if(!active.current||animating.current)return;move((e.touches[0].clientY-startY.current)*0.92,false);};
  const onTE=()=>{
    if(!active.current||animating.current)return;
    active.current=false;
    const dy=curDy.current,h=outerRef.current?.offsetHeight||600;
    if(Math.abs(dy)>h*0.25){
      animating.current=true;
      const dir=dy<0?1:-1;
      move(dy<0?-h:h,true);
      setTimeout(()=>{
        onSwipe(dir);
        requestAnimationFrame(()=>{
          move(dir>0?h:-h,false);
          requestAnimationFrame(()=>{
            move(0,true);
            setTimeout(()=>{animating.current=false;},900);
          });
        });
      },380);
    } else { move(0,true); }
  };
  return (
    <div style={{overflow:"hidden",touchAction:"none"}} onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}>
      <div ref={outerRef}>{children}</div>
    </div>
  );
}
 
const navBtn={width:34,height:34,borderRadius:"50%",background:"#1C1C1E",border:"none",fontSize:18,cursor:"pointer",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"};
const lbl={fontSize:11,fontWeight:700,color:"#8E8E93",letterSpacing:"0.08em",marginBottom:8};
const inp={width:"100%",padding:"12px 14px",borderRadius:12,fontSize:14,boxSizing:"border-box",outline:"none"};
 
export default function App(){
  const today=new Date();
  const [year,setYear]=useState(today.getFullYear());
  const [month,setMonth]=useState(today.getMonth());
  const [events,setEvents]=useState([]);
  const [loading,setLoading]=useState(true);
  const [uploading,setUploading]=useState(false);
  const [showModal,setShowModal]=useState(false);
  const [selDate,setSelDate]=useState(null);
  const [form,setForm]=useState({title:"",member:0,note:"",photos:[]});
  const [detailDay,setDetailDay]=useState(null);
  const [filter,setFilter]=useState(null);
  const [memberOrder,setMemberOrder]=useState([0,1,2,3]);
  const [lightbox,setLightbox]=useState(null);
  const fileInputRef=useRef(null);
 
  const [dragIdx,setDragIdx]=useState(null);
  const [dragOver,setDragOver]=useState(null);
  const [ghost,setGhost]=useState({label:"",color:"",x:0,y:0,visible:false});
  const lpTimer=useRef(null);
  const dragRef=useRef(null);
  const didDrag=useRef(false);
  const orderRef=useRef([0,1,2,3]);
 
  const [mDragIdx,setMDragIdx]=useState(null);
  const [mDragOver,setMDragOver]=useState(null);
  const [mGhost,setMGhost]=useState({label:"",color:"",x:0,y:0,visible:false});
  const mLpTimer=useRef(null);
  const mDragRef=useRef(null);
  const mDidDrag=useRef(false);
 
  // Firestoreリアルタイム取得
  useEffect(()=>{
    const q=query(collection(db,"events"),orderBy("createdAt","asc"));
    const unsub=onSnapshot(q,snap=>{
      setEvents(snap.docs.map(d=>({id:d.id,...d.data()})));
      setLoading(false);
    });
    return ()=>unsub();
  },[]);
 
  const toWareki=y=>y>=2019?`令和${y-2018}年`:y>=1989?`平成${y-1988}年`:`${y}年`;
  const shiftMonth=d=>{setDetailDay(null);const nm=addMonth(year,month,d);setYear(nm.y);setMonth(nm.m);};
  const applyOrder=o=>{orderRef.current=o;setMemberOrder(o);};
 
  const makeHandlers=(mi,isModal)=>{
    const ref=isModal?mDragRef:dragRef;
    const lpT=isModal?mLpTimer:lpTimer;
    const setDI=isModal?setMDragIdx:setDragIdx;
    const setDO=isModal?setMDragOver:setDragOver;
    const setG=isModal?setMGhost:setGhost;
    const didD=isModal?mDidDrag:didDrag;
    const mi_color=MEMBERS[mi]?.color||"#888";
    const mi_name=MEMBERS[mi]?.name||"";
    return {
      onTouchStart:(e)=>{
        didD.current=false;
        const t=e.touches[0];
        lpT.current=setTimeout(()=>{
          ref.current=mi;setDI(mi);
          setG({label:mi_name,color:mi_color,x:t.clientX,y:t.clientY,visible:true});
          if(navigator.vibrate)navigator.vibrate(30);
        },450);
      },
      onTouchMove:(e)=>{
        if(ref.current===null){clearTimeout(lpT.current);return;}
        didD.current=true;
        const t=e.touches[0];
        setG(g=>({...g,x:t.clientX,y:t.clientY}));
        const el=document.elementFromPoint(t.clientX,t.clientY);
        const v=Number(el?.dataset?.[isModal?"mdx":"dx"]);
        if(!isNaN(v)&&v>=0&&v<MEMBERS.length)setDO(v);
      },
      onTouchEnd:()=>{
        clearTimeout(lpT.current);
        const from=ref.current;
        if(from!==null){
          (isModal?setMDragOver:setDragOver)(latest=>{
            if(latest!==null&&from!==latest){
              const no=[...orderRef.current];
              const fi=no.indexOf(from),ti=no.indexOf(latest);
              if(fi>=0&&ti>=0){no.splice(fi,1);no.splice(ti,0,from);applyOrder(no);}
            }
            return null;
          });
        } else if(!didD.current){
          if(isModal)setForm(f=>({...f,member:mi}));
          else setFilter(p=>p===mi?null:mi);
        }
        ref.current=null;setDI(null);setG(g=>({...g,visible:false}));
      },
    };
  };
 
  const ds=d=>`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const evOn=d=>events.filter(e=>e.date===ds(d)&&(filter===null||e.member===filter));
  const openAdd=d=>{setSelDate(d);setForm({title:"",member:0,note:"",photos:[]});setDetailDay(null);setShowModal(true);};
 
  const uploadPhotos=async(files)=>{
    const urls=[];
    for(const file of files){
      const storageRef=ref(storage,`photos/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef,file);
      const url=await getDownloadURL(storageRef);
      urls.push(url);
    }
    return urls;
  };
 
  const handlePhotoPick=(e)=>{
    const files=Array.from(e.target.files);
    files.forEach(file=>{
      const reader=new FileReader();
      reader.onload=ev=>{
        setForm(f=>({...f,photos:[...f.photos,{url:ev.target.result,file}]}));
      };
      reader.readAsDataURL(file);
    });
    e.target.value="";
  };
 
  const addEv=async()=>{
    if(!form.title.trim())return;
    setUploading(true);
    try{
      const photoFiles=form.photos.filter(p=>p.file).map(p=>p.file);
      const photoUrls=photoFiles.length>0?await uploadPhotos(photoFiles):[];
      await addDoc(collection(db,"events"),{
        title:form.title,
        date:ds(selDate),
        member:+form.member,
        note:form.note,
        photos:photoUrls,
        createdAt:Timestamp.now(),
      });
      setShowModal(false);
    }catch(e){
      console.error(e);
      alert("保存に失敗しました");
    }
    setUploading(false);
  };
 
  const delEv=async(id)=>{ await deleteDoc(doc(db,"events",id)); };
 
  if(loading) return (
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:C.subtext,fontSize:14}}>
      読み込み中...
    </div>
  );
 
  return (
    <div style={{fontFamily:"'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif",background:C.bg,color:C.text,minHeight:"100vh"}}>
 
      <div style={{padding:"12px 16px 0",display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
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
 
      <div style={{display:"flex",gap:6,padding:"10px 16px",overflowX:"auto",userSelect:"none",WebkitUserSelect:"none"}}>
        <button onClick={()=>setFilter(null)} style={{padding:"6px 18px",borderRadius:20,fontSize:13,fontWeight:700,border:"none",background:filter===null?"#48484A":C.surface,color:filter===null?"#fff":C.subtext,whiteSpace:"nowrap",cursor:"pointer",flexShrink:0}}>全員</button>
        {memberOrder.map(mi=>{
          const m=MEMBERS[mi]; if(!m)return null;
          const h=makeHandlers(mi,false);
          return (
            <button key={mi} data-dx={String(mi)} {...h}
              style={{padding:"6px 18px",borderRadius:20,fontSize:13,fontWeight:700,border:"none",background:filter===mi?m.color:C.surface,color:filter===mi?"#fff":C.subtext,whiteSpace:"nowrap",cursor:"grab",flexShrink:0,WebkitUserSelect:"none",WebkitTouchCallout:"none",touchAction:"none",opacity:dragIdx===mi?0.45:1,transform:dragOver===mi?"scale(1.1)":"scale(1)",transition:"transform 0.15s,opacity 0.15s"}}
            ><span>{m.name}</span>{PAW[mi]&&<span style={{fontSize:"0.9em",marginLeft:3}}>{PAW[mi]}</span>}</button>
          );
        })}
      </div>
 
      {ghost.visible&&<div style={{position:"fixed",left:ghost.x,top:ghost.y,transform:"translate(-50%,-50%) scale(1.15)",zIndex:999,pointerEvents:"none",background:ghost.color,color:"#fff",fontSize:13,fontWeight:700,padding:"6px 18px",borderRadius:20,boxShadow:"0 6px 24px rgba(0,0,0,0.5)",opacity:0.92}}>{ghost.label}</div>}
 
      <div style={{position:"relative"}}>
        <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:260,opacity:0.15,userSelect:"none",filter:"grayscale(1) brightness(3)",pointerEvents:"none",zIndex:0}}>🐾</div>
        <SwipeCalendar onSwipe={shiftMonth}>
          <Grid year={year} month={month} events={events} filterMember={filter} detailDay={detailDay} setDetailDay={setDetailDay}/>
        </SwipeCalendar>
      </div>
 
      {detailDay&&(
        <div style={{borderTop:`1px solid ${C.border}`,padding:"14px 16px",background:C.bg}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:700}}>{month+1}月{detailDay}日</div>
            <button onClick={()=>openAdd(detailDay)} style={{background:C.surface,color:C.text,border:"none",borderRadius:20,padding:"8px 20px",fontSize:14,fontWeight:700,cursor:"pointer"}}>＋ 追加</button>
          </div>
          {evOn(detailDay).map(ev=>(
            <div key={ev.id} style={{display:"flex",flexDirection:"column",gap:8,padding:"10px 12px",borderRadius:12,background:C.surface,marginBottom:6,borderLeft:`3px solid ${MEMBERS[ev.member]?.color||"#888"}`}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700}}>{ev.title}</div>
                  <div style={{fontSize:11,color:C.subtext}}>{MEMBERS[ev.member]?.name}{ev.note?`・${ev.note}`:""}</div>
                </div>
                <button onClick={()=>delEv(ev.id)} style={{background:"none",border:"none",color:C.dimtext,fontSize:18,cursor:"pointer"}}>×</button>
              </div>
              {ev.photos&&ev.photos.length>0&&(
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {ev.photos.map((p,i)=>(
                    <img key={i} src={p} onClick={()=>setLightbox(p)} style={{width:60,height:60,objectFit:"cover",borderRadius:6,cursor:"pointer"}} alt=""/>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
 
      {showModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}} onClick={e=>e.target===e.currentTarget&&setShowModal(false)}>
          <div style={{background:C.surface,borderRadius:"24px 24px 0 0",padding:"24px 20px 48px",width:"100%",maxWidth:480,overflowY:"auto",maxHeight:"90vh"}}>
            <div style={{width:36,height:4,borderRadius:2,background:C.border,margin:"0 auto 20px"}}/>
            {mGhost.visible&&<div style={{position:"fixed",left:mGhost.x,top:mGhost.y,transform:"translate(-50%,-50%) scale(1.15)",zIndex:999,pointerEvents:"none",background:mGhost.color,color:"#fff",fontSize:13,fontWeight:700,padding:"6px 18px",borderRadius:20,boxShadow:"0 6px 24px rgba(0,0,0,0.5)",opacity:0.92}}>{mGhost.label}</div>}
            <div style={{fontSize:16,fontWeight:800,marginBottom:20}}>{month+1}月{selDate}日に追加</div>
            <div style={{marginBottom:14}}>
              <div style={lbl}>タイトル</div>
              <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="予定を入力" style={{...inp,background:C.bg,color:C.text,border:`1px solid ${C.border}`}}/>
            </div>
            <div style={{marginBottom:14}}>
              <div style={lbl}>だれ？</div>
              <div style={{display:"flex",gap:6,userSelect:"none",WebkitUserSelect:"none"}}>
                {memberOrder.map(mi=>{
                  const m=MEMBERS[mi]; if(!m)return null;
                  const h=makeHandlers(mi,true);
                  return (
                    <button key={mi} data-mdx={String(mi)} {...h}
                      style={{flex:1,padding:"10px 0",borderRadius:12,border:"none",background:form.member===mi?m.color:C.bg,color:form.member===mi?"#fff":C.subtext,fontSize:14,fontWeight:700,cursor:"pointer",WebkitUserSelect:"none",WebkitTouchCallout:"none",touchAction:"none",opacity:mDragIdx===mi?0.45:1,transform:mDragOver===mi?"scale(1.1)":"scale(1)",transition:"transform 0.15s,opacity 0.15s"}}
                    >{m.name}{PAW[mi]&&<span style={{fontSize:"0.85em",marginLeft:2}}>{PAW[mi]}</span>}</button>
                  );
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
            <button onClick={addEv} disabled={uploading} style={{width:"100%",padding:14,borderRadius:14,background:uploading?"#555":"#fff",color:"#000",border:"none",fontSize:15,fontWeight:800,cursor:uploading?"not-allowed":"pointer"}}>
              {uploading?"保存中...":"追加する"}
            </button>
          </div>
        </div>
      )}
 
      {lightbox&&(
        <div onClick={()=>setLightbox(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16}}>
          <img src={lightbox} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",borderRadius:8}} alt=""/>
          <button onClick={()=>setLightbox(null)} style={{position:"absolute",top:20,right:20,background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",fontSize:22,width:40,height:40,borderRadius:"50%",cursor:"pointer"}}>×</button>
        </div>
      )}
    </div>
  );
}