const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const rooms = new Map();

function code(){
  let c=""; do { c=String(Math.floor(1000 + Math.random()*9000)); } while(rooms.has(c));
  return c;
}
function send(ws,msg){ if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(msg)); }
function broadcast(room,msg,except){ for(const p of room.players) if(p!==except) send(p.ws,msg); }

const fs = require("fs");
const path = require("path");

const server=http.createServer((req,res)=>{
  const urlPath = (req.url || "/").split("?")[0];

  // Health/status endpoints.
  if(urlPath === "/health" || urlPath === "/api/status"){
    res.writeHead(200,{"content-type":"application/json; charset=utf-8"});
    res.end(JSON.stringify({ok:true,service:"golgyukwang-online",rooms:rooms.size}));
    return;
  }

  // Serve the game and its assets from this Render service.
  const root = path.resolve(__dirname);
  let relativePath = urlPath === "/" || urlPath === "/index.html"
    ? "index.html"
    : decodeURIComponent(urlPath).replace(/^\/+/, "");

  const filePath = path.resolve(root, relativePath);
  if(filePath !== root && !filePath.startsWith(root + path.sep)){
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath,(err,st)=>{
    if(err || !st.isFile()){
      res.writeHead(404,{"content-type":"text/plain; charset=utf-8"});
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html":"text/html; charset=utf-8",
      ".js":"application/javascript; charset=utf-8",
      ".css":"text/css; charset=utf-8",
      ".json":"application/json; charset=utf-8",
      ".png":"image/png",
      ".jpg":"image/jpeg",
      ".jpeg":"image/jpeg",
      ".gif":"image/gif",
      ".webp":"image/webp",
      ".svg":"image/svg+xml",
      ".ico":"image/x-icon",
      ".wav":"audio/wav",
      ".mp3":"audio/mpeg",
      ".ogg":"audio/ogg"
    };

    res.writeHead(200,{"content-type":types[ext] || "application/octet-stream"});
    fs.createReadStream(filePath).pipe(res);
  });
});
const wss=new WebSocket.Server({server});

// Render 무료 인스턴스의 WebSocket 유휴 끊김을 막기 위한 heartbeat
const heartbeat=setInterval(()=>{
  wss.clients.forEach(ws=>{
    if(ws.isAlive===false){ try{ws.terminate()}catch(e){}; return; }
    ws.isAlive=false;
    try{ws.ping()}catch(e){}
  });
},20000);
wss.on("close",()=>clearInterval(heartbeat));


wss.on("connection",ws=>{
  ws.isAlive=true;
  ws.on("pong",()=>{ws.isAlive=true});
  let player=null;
  ws.on("message",raw=>{
    let m; try{m=JSON.parse(raw.toString())}catch(e){return}
    if(m.type==="create" && !player){
      const id=code(), room={players:[]}; rooms.set(id,room); player={ws,room:id,role:1}; room.players.push(player);
      send(ws,{type:"welcome",room:id,role:1}); return;
    }
    if(m.type==="join" && !player){
      const id=String(m.room||"").replace(/\D/g,"").slice(0,4), room=rooms.get(id);
      if(!/^\d{4}$/.test(id)){send(ws,{type:"error",message:"4자리 숫자 방 코드를 입력해주세요."});return}
      if(!room){send(ws,{type:"error",message:"방을 찾을 수 없습니다."});return}
      if(room.players.length>=2){send(ws,{type:"error",message:"방이 가득 찼습니다."});return}
      player={ws,room:id,role:2}; room.players.push(player); send(ws,{type:"welcome",room:id,role:2}); broadcast(room,{type:"peer_joined"},ws); return;
    }
    if(!player)return;
    const room=rooms.get(player.room); if(!room)return;
    if(["selection","map","input","snapshot","start","game_over"].includes(m.type)){m.from=player.role;broadcast(room,m,ws);}
  });
  ws.on("close",()=>{
    if(!player)return; const room=rooms.get(player.room); if(!room)return;
    room.players=room.players.filter(p=>p!==player); broadcast(room,{type:"peer_left"}); if(room.players.length===0)rooms.delete(player.room);
  });
});

server.listen(PORT,()=>console.log(`Golgyukwang online server listening on ${PORT}`));
