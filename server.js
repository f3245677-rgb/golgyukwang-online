const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const rooms = new Map();

function code(){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c=""; do { c=""; for(let i=0;i<6;i++) c+=chars[Math.floor(Math.random()*chars.length)]; } while(rooms.has(c));
  return c;
}
function send(ws,msg){ if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(msg)); }
function broadcast(room,msg,except){ for(const p of room.players) if(p!==except) send(p.ws,msg); }

const server=http.createServer((req,res)=>{
  res.writeHead(200,{"content-type":"application/json; charset=utf-8"});
  res.end(JSON.stringify({ok:true,service:"golgyukwang-online",rooms:rooms.size}));
});
const wss=new WebSocket.Server({server});

wss.on("connection",ws=>{
  let player=null;
  ws.on("message",raw=>{
    let m; try{m=JSON.parse(raw.toString())}catch(e){return}
    if(m.type==="create" && !player){
      const id=code(), room={players:[]}; rooms.set(id,room); player={ws,room:id,role:1}; room.players.push(player);
      send(ws,{type:"welcome",room:id,role:1}); return;
    }
    if(m.type==="join" && !player){
      const id=String(m.room||"").toUpperCase(), room=rooms.get(id);
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
