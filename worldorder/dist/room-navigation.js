// Screen changes never issue room commands or release a player's seat.
export function initialRoomScreen(url){
 const parsed=new URL(url),screen=parsed.searchParams.get('screen');
 return ['lobby','room','game'].includes(screen)?screen:parsed.searchParams.has('room')?'game':'lobby';
}
export function resolvedRoomScreen(screen,room,{steam=false}={}){
 if(screen==='lobby')return 'lobby';
 if(room)return screen==='room'||!room.state||!room.seat?'room':'game';
 return steam?'lobby':'game';
}
export function roomScreenUrl(url,screen){
 const next=new URL(url);next.searchParams.set('screen',screen);return next;
}
