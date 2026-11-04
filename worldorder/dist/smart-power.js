// World in Turmoil pp.6–7: SP is spent as part of the corresponding action.
export function validateSP(s,count){if(!Number.isInteger(count)||count<0)throw Error('SP数量必须为非负整数');if(count&&(!s.config.wit||!Number.isInteger(s.players[s.current].smart)||s.players[s.current].smart<count))throw Error('未启用SP或可用SP不足');return count;}
