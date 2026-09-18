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

const path = require("path");
const fs = require("fs");

const MIME = {
  ".html":"text/html; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".json":"application/json; charset=utf-8",
  ".png":"image/png",
  ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg",
  ".gif":"image/gif",
  ".svg":"image/svg+xml",
  ".webp":"image/webp",
  ".ico":"image/x-icon",
  ".txt":"text/plain; charset=utf-8"
};

const server=http.createServer((req,res)=>{
  const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);

  // 웹 링크로 접속하면 게임을 바로 보여준다.
  if(requestPath === "/" || requestPath === "/index.html"){
    const file = path.join(__dirname, "index.html");
    return fs.readFile(file, (err,data)=>{
      if(err){
        res.writeHead(500,{"content-type":"text/plain; charset=utf-8"});
        return res.end("index.html을 불러오지 못했습니다.");
      }
      res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-cache"});
      res.end(data);
    });
  }

  // 기존 상태 확인 주소도 유지한다.
  if(requestPath === "/api/status" || requestPath === "/health"){
    res.writeHead(200,{"content-type":"application/json; charset=utf-8"});
    return res.end(JSON.stringify({ok:true,service:"golgyukwang-online",rooms:rooms.size}));
  }

  // 게임에서 사용하는 정적 파일 제공.
  const root = path.resolve(__dirname);
  const file = path.resolve(root, "." + requestPath);
  if(file !== root && !file.startsWith(root + path.sep)){
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.stat(file, (err,stat)=>{
    if(err || !stat.isFile()){
      res.writeHead(404,{"content-type":"text/plain; charset=utf-8"});
      return res.end("Not found");
    }
    const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    res.writeHead(200,{"content-type":type});
    fs.createReadStream(file).pipe(res);
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
    if(["selection","map","input","snapshot","start"].includes(m.type)){m.from=player.role;broadcast(room,m,ws);}
  });
  ws.on("close",()=>{
    if(!player)return; const room=rooms.get(player.room); if(!room)return;
    room.players=room.players.filter(p=>p!==player); broadcast(room,{type:"peer_left"}); if(room.players.length===0)rooms.delete(player.room);
  });
});

server.listen(PORT,()=>console.log(`Golgyukwang online server listening on ${PORT}`));
