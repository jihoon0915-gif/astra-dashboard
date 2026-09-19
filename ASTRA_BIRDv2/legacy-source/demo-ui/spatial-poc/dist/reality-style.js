/* Original cartography using OpenFreeMap. Not a Mapbox style or asset. */
window.REALITY_PALETTES={
 dusk:{ground:'#354450',water:'#182f45',park:'#344e48',land:'#3b4b4c',road:'#a3a69d',minor:'#64757c',text:'#e7e9df',halo:'#354450',low:'#647989',high:'#c2b9a8',sky:'#343d59',horizon:'#a98c86',shadow:'#253748',highlight:'#c1b09a'},
 night:{ground:'#172732',water:'#0c1b2c',park:'#1b3534',land:'#23383b',road:'#c4b783',minor:'#3c515e',text:'#c6d5df',halo:'#172732',low:'#314c61',high:'#91b3c2',sky:'#091421',horizon:'#3c576b',shadow:'#102331',highlight:'#78929e'}
};
window.makeRealityStyle=async()=>{
 const response=await fetch('https://tiles.openfreemap.org/styles/bright');if(!response.ok)throw Error('OpenFreeMap style unavailable');const style=await response.json();
 // Preserve the provider's road hierarchy, Korean place names, sprites and glyphs.
 style.layers=style.layers.filter(l=>l.type!=='fill-extrusion');
 const dem={type:'raster-dem',tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],tileSize:256,encoding:'terrarium',maxzoom:11,attribution:'Terrain: <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Tilezen / sources</a>'};
 style.sources.dem={...dem};style.sources.reliefDem={...dem};
 const firstSymbol=style.layers.findIndex(l=>l.type==='symbol');
 const building=style.layers.find(l=>l['source-layer']==='building');
 if(building)style.layers.splice(firstSymbol<0?style.layers.length:firstSymbol,0,{id:'astra-buildings',type:'fill-extrusion',source:building.source,'source-layer':'building',minzoom:13.5,filter:['!=',['get','hide_3d'],true],paint:{'fill-extrusion-height':['interpolate',['linear'],['zoom'],13.5,0,14.7,['coalesce',['get','render_height'],8]],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':1,'fill-extrusion-vertical-gradient':true}});
 const waterIndex=style.layers.findIndex(l=>l['source-layer']==='water');style.layers.splice(Math.max(1,waterIndex),0,{id:'astra-relief',type:'hillshade',source:'reliefDem',paint:{'hillshade-exaggeration':.3,'hillshade-illumination-direction':310}});
 style.terrain={source:'dem',exaggeration:1.6};
 return style;
};
window.paintReality=(map,mode='dusk')=>{
 const p=window.REALITY_PALETTES[mode];
 for(const l of map.getStyle().layers){const key=(l.id+' '+(l['source-layer']||'')).toLowerCase();
 if(l.type==='background')map.setPaintProperty(l.id,'background-color',p.ground);
 if(l.type==='fill'){const color=/water/.test(key)?p.water:/park|forest|wood|grass|landcover/.test(key)?p.park:/building/.test(key)?p.low:p.land;map.setPaintProperty(l.id,'fill-color',color);}
 if(l.type==='line'){map.setPaintProperty(l.id,'line-color',/water/.test(key)?p.water:/casing|outline|boundary/.test(key)?p.ground:/motorway|trunk|primary/.test(key)?p.road:p.minor);}
 if(l.type==='symbol'&&l.layout?.['text-field']){map.setPaintProperty(l.id,'text-color',p.text);map.setPaintProperty(l.id,'text-halo-color',p.halo);map.setPaintProperty(l.id,'text-halo-width',1.3);}
 }
 if(map.getLayer('astra-buildings'))map.setPaintProperty('astra-buildings','fill-extrusion-color',['interpolate',['linear'],['coalesce',['get','render_height'],8],0,p.low,160,p.high]);
 map.setPaintProperty('astra-relief','hillshade-shadow-color',p.shadow);map.setPaintProperty('astra-relief','hillshade-highlight-color',p.highlight);map.setPaintProperty('astra-relief','hillshade-accent-color',p.park);
 map.setLight({anchor:'viewport',color:mode==='dusk'?'#ffddb0':'#c1e1ff',intensity:.55,position:[1.5,240,35]});
 map.setSky({'sky-color':p.sky,'horizon-color':p.horizon,'fog-color':p.ground,'sky-horizon-blend':.8,'horizon-fog-blend':.5,'fog-ground-blend':.35});
 document.body.dataset.mapLight=mode;
};
