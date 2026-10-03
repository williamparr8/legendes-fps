// Viseurs en surimpression (SVG 100×100, centré, unité = 1 % de la plus petite dimension de l'écran) : un par arme.
// Le réticule est au centre de l'écran ; le cadre se raccorde à l'arme, abaissée en ADS (viewmodel.js).
const D = '#14171c', CY = '#5fe6ff', RD = '#ff3030';
const wrap = (inner) => `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style="position:absolute;left:50%;top:50%;height:100vmin;width:100vmin;transform:translate(-50%,-50%)">${inner}</svg>`;
const dot = `<circle cx="50" cy="50" r="0.45" fill="${RD}"/><circle cx="50" cy="50" r="1.1" fill="none" stroke="${RD}" stroke-width="0.25" opacity=".8"/>`;

export const OPTICS = {
  // fusil d'assaut : viseur holographique à cadre ouvert, bande cyan, réticule en cercle
  rifle: wrap(`<rect x="33" y="35" width="3.6" height="29" fill="${D}"/><rect x="63.4" y="35" width="3.6" height="29" fill="${D}"/>`
    + `<rect x="31" y="62" width="38" height="7" rx="1" fill="${D}"/><rect x="36" y="64.4" width="28" height="1.5" fill="${CY}"/>`
    + `<path d="M36.6 35.5H63.4" stroke="${CY}" stroke-width="0.25" opacity=".5"/>`
    + `<circle cx="50" cy="50" r="3.4" fill="none" stroke="${RD}" stroke-width="0.35"/><path d="M50 44.8v2.2M50 53v2.2M44.8 50h2.2M53 50h2.2" stroke="${RD}" stroke-width="0.3"/>${dot}`),
  // mitraillette : viseur annulaire, cercle noir à liseré cyan, point rouge
  smg: wrap(`<circle cx="50" cy="50" r="12" fill="rgba(120,220,255,0.05)" stroke="${D}" stroke-width="3"/>`
    + `<circle cx="50" cy="50" r="10.3" fill="none" stroke="${CY}" stroke-width="0.5" opacity=".9"/>`
    + `<path d="M43.5 63.2h13l1.6 6.3H41.9z" fill="${D}"/><rect x="45" y="66" width="10" height="1.2" fill="${CY}"/>${dot}`),
  // fusil à pompe : cornes ouvertes, bande cyan, repère rouge
  shotgun: wrap(`<polygon points="31,65 33.5,43 38,35.5 40,37.2 37.4,44.5 38,65" fill="${D}"/><polygon points="69,65 66.5,43 62,35.5 60,37.2 62.6,44.5 62,65" fill="${D}"/>`
    + `<rect x="31" y="62.5" width="38" height="6.5" rx="1" fill="${D}"/><rect x="36" y="64.6" width="28" height="1.4" fill="${CY}"/>`
    + `<path d="M48.2 53.2 50 51l1.8 2.2" fill="none" stroke="${RD}" stroke-width="0.4"/>${dot}`),
  // lance-roquettes : réticule à coins, cadre bas
  launcher: wrap(`<path d="M39 40.5v-3h3M61 40.5v-3h-3M39 59.5v3h3M61 59.5v3h-3" fill="none" stroke="${CY}" stroke-width="0.6"/>`
    + `<rect x="30" y="64" width="40" height="6" rx="1" fill="${D}"/><rect x="38" y="66.2" width="24" height="1.3" fill="${CY}"/>`
    + `<path d="M50 45v3.2M50 51.8V55M45 50h3.2M51.8 50H55" stroke="${RD}" stroke-width="0.35"/>${dot}`),
  // lunette de sniper : disque noir autour, barres épaisses, ligne rouge graduée (repères de chute)
  sniper: wrap(`<rect x="12" y="48.6" width="15" height="2.8" fill="#000"/><rect x="73" y="48.6" width="15" height="2.8" fill="#000"/>`
    + `<rect x="48.7" y="74" width="2.6" height="14" fill="#000"/><rect x="48.9" y="12" width="2.2" height="12" fill="#000"/>`
    + `<g stroke="${RD}" fill="none"><path stroke-width="0.25" d="M50 26V74M27 50H73"/>`
    + `<g stroke-width="0.35"><path d="M47.5 56h5M46.5 61h7M45.5 66h9M44.5 71h11"/><path d="M56 48.6v2.8M62 48.6v2.8M68 48.6v2.8M44 48.6v2.8M38 48.6v2.8M32 48.6v2.8"/></g></g>`
    + `<path d="M48.4 24.5h3.2L50 27.4zM48.4 75.5h3.2L50 72.6zM24.5 48.4v3.2L27.4 50zM75.5 48.4v3.2L72.6 50z" fill="${RD}"/>${dot}`
    + `<circle cx="50" cy="50" r="37" fill="none" stroke="#000" stroke-width="0.6"/>`),
};
export const OPTIC_STYLE = { sniper: 'background:radial-gradient(circle at center,transparent 0,transparent 37vmin,#000 37.4vmin)' };
