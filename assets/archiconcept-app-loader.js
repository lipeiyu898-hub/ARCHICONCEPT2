const sourceLink = document.getElementById("archiconcept-app-source");

if (!sourceLink) {
  throw new Error("ARCHICONCEPT app source link is missing.");
}

const response = await fetch(sourceLink.href);
if (!response.ok) {
  throw new Error(`Unable to load ARCHICONCEPT app source: HTTP ${response.status}`);
}

let source = await response.text();

const replaceOnce = (needle, replacement, label) => {
  if (!source.includes(needle)) {
    throw new Error(`ARCHICONCEPT redline patch failed: ${label}`);
  }
  source = source.replace(needle, replacement);
};

replaceOnce(
  'source:"manual_draw",status:Ce',
  'source:window.__ARCHICONCEPT_REDLINE_SOURCE__||"manual_draw",status:Ce',
  "boundary source"
);

replaceOnce(
  'redoRedline=()=>{We.length!==0&&window.confirm("\\u786e\\u8ba4\\u91cd\\u505a\\u5f53\\u524d\\u7528\\u5730\\u7ea2\\u7ebf\\uff1f\\u5f53\\u524d\\u7ea2\\u7ebf\\u5c06\\u88ab\\u6e05\\u9664\\u5e76\\u91cd\\u65b0\\u7ed8\\u5236\\u3002")&&(redlineUndo.current=[],redlineRedo.current=[],Ot([]),vn("\\u7f16\\u8f91\\u4e2d"),setRedlineMode("node"),setRedlineHistoryTick(T=>T+1))}',
  'redoRedline=()=>{const v=redlineRedo.current.pop();v&&(redlineUndo.current.push({points:cloneRedline(We),status:Ce}),Ot(cloneRedline(v.points)),vn(v.status),setRedlineHistoryTick(T=>T+1))}',
  "redo behavior"
);

replaceOnce(
  'children:"\\u91cd\\u505a\\u7ea2\\u7ebf"',
  'children:"\\u91cd\\u505a"',
  "redo label"
);

replaceOnce(
  'Ui=()=>{if(We.length<3)return;const v=[];',
  'Ui=()=>{if(We.length<3)return;const T=window.__ARCHICONCEPT_VALIDATE_REDLINE__?.(We,Ws,window.__ARCHICONCEPT_REDLINE_SOURCE__||"manual_draw");if(T){cn(T);return}const v=[];',
  "confirmation validation"
);

replaceOnce(
  '},[We]);const[Gr,hr]=k.useState',
  '},[We]);k.useEffect(()=>{const v={points:We.map(T=>({lng:T.lng,lat:T.lat})),areaM2:Ws,perimeterM:_i,status:Ce};window.__ARCHICONCEPT_REDLINE_STATE__=v;window.dispatchEvent(new CustomEvent("archiconcept:redline-state",{detail:v}))},[We,Ws,_i,Ce]);const[Gr,hr]=k.useState',
  "redline state bridge"
);

replaceOnce(
  '},undoRedline=()=>{const v=redlineUndo.current.pop();',
  '},imageImportEffect=k.useEffect(()=>{const v=T=>{const V=T.detail||{};let q=[];if(Array.isArray(V.geoPoints))q=V.geoPoints.map(I=>({lng:Number(I.lng),lat:Number(I.lat)})).filter(I=>Number.isFinite(I.lng)&&Number.isFinite(I.lat));else if(Array.isArray(V.points)){const I=Math.max(.2,Number(V.aspect)||1),X=Gr.width*.62,J=Gr.height*.62;let Ne=Math.min(X,J*I),Ee=Ne/I;Ee>J&&(Ee=J,Ne=Ee*I);const Ae=(Gr.width-Ne)/2,Ke=(Gr.height-Ee)/2;q=V.points.map(Nt=>{const hn=Ae+Number(Nt.x)*Ne,jn=Ke+Number(Nt.y)*Ee;if(fe&&ss.current&&window.AMap&&ss.current.containerToLngLat){const Bt=ss.current.containerToLngLat(new window.AMap.Pixel(hn,jn));return{lng:Bt.getLng(),lat:Bt.getLat()}}return ao(hn,jn)})}if(q.length<3){cn("\\u8f6e\\u5ed3\\u5bfc\\u5165\\u5730\\u56fe\\u5931\\u8d25\\u3002");return}window.__ARCHICONCEPT_REDLINE_SOURCE__="image_import";commitRedline(q,"\\u7f16\\u8f91\\u4e2d")};return window.addEventListener("archiconcept:redline-import",v),()=>window.removeEventListener("archiconcept:redline-import",v)},[Gr,fe,me]),undoRedline=()=>{const v=redlineUndo.current.pop();',
  "image import bridge"
);

const blobUrl = URL.createObjectURL(
  new Blob([source, "\n//# sourceURL=archiconcept-runtime.js"], {
    type: "text/javascript"
  })
);

try {
  await import(blobUrl);
} finally {
  URL.revokeObjectURL(blobUrl);
}
