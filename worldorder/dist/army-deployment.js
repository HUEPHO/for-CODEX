// Compile the net tabletop arrangement into ordinary, authoritative moves.
// A temporary return left in reserve remains an invalid destination, so it
// cannot silently disappear when the player commits the form.
export function deploymentMoves(delta,smart=[]){
 const sources=Object.entries(delta).flatMap(([region,n])=>Array.from({length:Math.max(0,-n)},()=>region));
 const moves=Object.entries(delta).flatMap(([to,n])=>Array.from({length:Math.max(0,n)},()=>({from:sources.shift()||'reserve',to,spendSP:smart.includes(to)})));
 return moves.concat(sources.map(from=>({from,to:'reserve',spendSP:false})));
}
