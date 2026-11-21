// Animations GSAP (chargé via CDN dans index.html). Si GSAP est absent ou si
// l'utilisateur préfère moins de mouvement, l'appli fonctionne sans animation.
export const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
export const fx=f=>{const g=window.gsap;if(g&&!reduce())f(g)};
