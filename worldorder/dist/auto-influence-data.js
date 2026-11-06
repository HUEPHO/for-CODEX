// TTS sheet 262, CardID 26200–26219. Rows are US / EU / RU / CN.
// Region letters and T (army), A/E/R/C (trade), x are the supplied GMNotes.
const notes=['MECN-RTAT','MCAS-xTTR','EAMP-ERTT','EMNA-TxTx','ENCS-TTER','EPSC-TCET','NEAP-TTCR','NACS-TxTE','NSPC-TCTR','ANEM-xRTA','NECM-CTTA','NPES-ETCx','CENP-TRxT','SNEP-TTER','PNEA-RTTT','PEAC-TxET','PCSA-TRCT','PMNE-TATE','PANC-CRTT','MNEP-xATT'];
const players=['US','EU','RU','CN'],trade={A:'US',E:'EU',R:'RU',C:'CN'};
export const AUTO_INFLUENCE_CARDS=notes.map((note,index)=>{
 const [regions,effects]=note.split('-');
 return {id:index,sourceCardId:26200+index,rows:players.map((owner,i)=>({owner,region:regions[i],army:effects[i]==='T',trade:trade[effects[i]]||null}))};
});
