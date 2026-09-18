/* Mercator custom layer. Static Fresnel shader: no timer or repaint loop. */
window.createHologramLayer=(engine,records)=>({
 id:'hologram-pillars',type:'custom',renderingMode:'3d',
 onAdd(map,gl){this.map=map;
 const compile=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
 const vs=compile(gl.VERTEX_SHADER,`#version 300 es
 in vec3 position;uniform mat4 matrix;out vec3 n;out float height;
 void main(){n=normalize(vec3(position.xy,0.));height=position.z/650.;gl_Position=matrix*vec4(position,1.);}`);
 const fs=compile(gl.FRAGMENT_SHADER,`#version 300 es
 precision highp float;in vec3 n;in float height;uniform vec3 eye;uniform vec3 tint;out vec4 color;
 void main(){float fresnel=pow(1.-abs(dot(normalize(n),normalize(eye))),2.4);float bands=.84+.16*sin(height*160.);float fade=(1.-smoothstep(.65,1.,height));float alpha=(.035+.34*fresnel)*fade*bands;color=vec4(tint*(.65+.35*fresnel),alpha);}`);
 this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
 this.vaos=[];for(const steps of [12,32]){const data=[];for(let i=0;i<steps;i++){const a=i*Math.PI*2/steps,b=(i+1)*Math.PI*2/steps;const v=[[Math.cos(a)*22,Math.sin(a)*22,0],[Math.cos(b)*22,Math.sin(b)*22,0],[Math.cos(a)*22,Math.sin(a)*22,650],[Math.cos(b)*22,Math.sin(b)*22,650]];for(const k of [0,1,2,2,1,3])data.push(...v[k]);}const vao=gl.createVertexArray(),buffer=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);const loc=gl.getAttribLocation(this.program,'position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);this.vaos.push({vao,buffer,count:data.length/3});}gl.bindVertexArray(null);
 this.uniforms=Object.fromEntries(['matrix','eye','tint'].map(n=>[n,gl.getUniformLocation(this.program,n)]));
 },
 render(gl,args){if(this.map.getZoom()<7)return;const m=(args.defaultProjectionData?.mainMatrix||args),oldVAO=gl.getParameter(gl.VERTEX_ARRAY_BINDING),oldProgram=gl.getParameter(gl.CURRENT_PROGRAM),mask=gl.getParameter(gl.DEPTH_WRITEMASK),blend=gl.isEnabled(gl.BLEND),depth=gl.isEnabled(gl.DEPTH_TEST),cull=gl.isEnabled(gl.CULL_FACE),srcRGB=gl.getParameter(gl.BLEND_SRC_RGB),dstRGB=gl.getParameter(gl.BLEND_DST_RGB),srcAlpha=gl.getParameter(gl.BLEND_SRC_ALPHA),dstAlpha=gl.getParameter(gl.BLEND_DST_ALPHA);gl.useProgram(this.program);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.depthMask(false);
 const pitch=this.map.getPitch()*Math.PI/180,bearing=this.map.getBearing()*Math.PI/180;gl.uniform3f(this.uniforms.eye,Math.sin(bearing)*Math.sin(pitch),-Math.cos(bearing)*Math.sin(pitch),Math.cos(pitch));
 const mesh=this.vaos[this.map.getZoom()<12?0:1];gl.bindVertexArray(mesh.vao);
 for(const b of records){if(!this.map.getBounds().contains([b.location.lng,b.location.lat]))continue;const alt=this.map.queryTerrainElevation([b.location.lng,b.location.lat])||0,c=engine.MercatorCoordinate.fromLngLat([b.location.lng,b.location.lat],alt),scale=c.meterInMercatorCoordinateUnits(),matrix=new Float32Array(16);for(let row=0;row<4;row++){for(let col=0;col<3;col++)matrix[col*4+row]=m[col*4+row]*scale;matrix[12+row]=m[row]*c.x+m[4+row]*c.y+m[8+row]*c.z+m[12+row];}gl.uniformMatrix4fv(this.uniforms.matrix,false,matrix);gl.uniform3f(this.uniforms.tint,...(records.indexOf(b)%2?[.68,1,.36]:[.22,1,.86]));gl.drawArrays(gl.TRIANGLES,0,mesh.count);}
 gl.depthMask(mask);gl.blendFuncSeparate(srcRGB,dstRGB,srcAlpha,dstAlpha);for(const [cap,on] of [[gl.BLEND,blend],[gl.DEPTH_TEST,depth],[gl.CULL_FACE,cull]]){if(on)gl.enable(cap);else gl.disable(cap);}gl.bindVertexArray(oldVAO);gl.useProgram(oldProgram);
 },onRemove(map,gl){this.vaos.forEach(v=>{gl.deleteBuffer(v.buffer);gl.deleteVertexArray(v.vao);});gl.deleteProgram(this.program);}
});
