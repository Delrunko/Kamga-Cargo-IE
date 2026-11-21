const U=['zéro','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
const T=['','','vingt','trente','quarante','cinquante','soixante'];
function b100(n){
  if(n<20)return U[n];
  if(n<70){const t=Math.floor(n/10),u=n%10;return T[t]+(u===1?' et un':u?'-'+U[u]:'')}
  if(n<80){const r=n-60;return 'soixante'+(r===11?' et onze':'-'+U[r])}
  const r=n-80;return 'quatre-vingt'+(r?'-'+U[r]:'s');
}
function b1000(n){
  const h=Math.floor(n/100),r=n%100;
  if(!h)return b100(r);
  if(h===1)return 'cent'+(r?' '+b100(r):'');
  return U[h]+' cent'+(r?' '+b100(r):'s');
}
export function words(n){
  n=Math.round(+n||0);if(n===0)return 'zéro';
  const m=Math.floor(n/1e6),k=Math.floor((n%1e6)/1000),r=n%1000,o=[];
  if(m)o.push(b1000(m)+' million'+(m>1?'s':''));
  if(k)o.push(k===1?'mille':b1000(k).replace(/s$/,'')+' mille');
  if(r)o.push(b1000(r));
  return o.join(' ');
}
