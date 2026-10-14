const P=()=>new Proxy(function(){},{get:(t,k)=>k==='data'?new Uint8ClampedArray(4*256*256):k==='width'||k==='height'?256:P(),apply:()=>P(),set:()=>true});
globalThis.document={createElement:()=>P(),createElementNS:()=>P()};
globalThis.window={devicePixelRatio:1};
globalThis.Image=class{};
