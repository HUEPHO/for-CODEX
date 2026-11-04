// An investment belongs to its investor; the allied country remains with its host.
export function foreignInvestments(s,investor){return (s.players[investor].foreignInvestments||[]).filter(x=>x.host!==investor&&s.players[x.host]?.allies.includes(x.country));}
export function investedCountries(s,investor){const p=s.players[investor];return [...(p.fdi||[]).filter(id=>p.allies.includes(id)),...foreignInvestments(s,investor).map(x=>x.country)];}
export function foreignInvestmentOwners(s,host,country){return Object.keys(s.players).flatMap(investor=>{const count=foreignInvestments(s,investor).filter(x=>x.host===host&&x.country===country).length;return count?[{investor,count}]:[];});}
export function upgradeInvestmentCountry(s,host,previous,country){for(const p of Object.values(s.players))if(p.foreignInvestments)p.foreignInvestments=p.foreignInvestments.map(x=>x.host===host&&x.country===previous?{...x,country}:x);}
