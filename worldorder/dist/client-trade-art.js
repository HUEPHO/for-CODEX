// Original TTS CommerceCard faces/backs. Sources and hashes are recorded in
// references/trade-card-art-sources.json. No state or gameplay is stored here.
export const COMMERCE_CARD_ART=Object.freeze({
 US:Object.freeze([{front:'assets/commerce-US-1.png',back:'assets/commerce-US-back.png'},{front:'assets/commerce-US-1.png',back:'assets/commerce-US-back.png'}]),
 CN:Object.freeze([{front:'assets/commerce-CN-1.png',back:'assets/commerce-CN-back.png'},{front:'assets/commerce-CN-1.png',back:'assets/commerce-CN-back.png'}]),
 EU:Object.freeze([{front:'assets/commerce-EU-1.png',back:'assets/commerce-EU-back.png'},{front:'assets/commerce-EU-1.png',back:'assets/commerce-EU-back.png'}]),
 RU:Object.freeze([{front:'assets/commerce-RU-1.png',back:'assets/commerce-RU-back.png'},{front:'assets/commerce-RU-2.png',back:'assets/commerce-RU-back.png'},{front:'assets/commerce-RU-3.png',back:'assets/commerce-RU-back.png'}])
});
export function commerceCardArt(owner,index,ready){
 const art=COMMERCE_CARD_ART[owner]?.[index];
 return art?(ready===true?art.front:art.back):'';
}
