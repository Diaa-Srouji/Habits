// The one shared state object. Modules import it and mutate it (never reassign it).
// The current page lives in the address (#/, #/c/<id>, #/h/<id>), see router.js. S.open mirrors the open habit page.
export const S={habits:[],cats:[]};
export function resetState(){for(const k of Object.keys(S))delete S[k];S.habits=[];S.cats=[]}
