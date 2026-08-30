(function(window){"use strict";
const MAX_BYTES=1048576,MIN_WIDTH=400,MIN_HEIGHT=400,TYPES=new Set(["image/png","image/jpeg"]);
async function validate(file){
 if(!file)throw Error("Select exactly one project logo.");
 if(!TYPES.has(file.type))throw Error("Logo must be PNG, JPG, or JPEG.");
 if(file.size<=0||file.size>MAX_BYTES)throw Error("Logo must not exceed 1 MB.");
 const url=URL.createObjectURL(file);
 try{const d=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res({width:i.naturalWidth,height:i.naturalHeight});i.onerror=()=>rej(Error("The selected image could not be decoded."));i.src=url;});
 if(d.width<MIN_WIDTH||d.height<MIN_HEIGHT)throw Error("Logo must be at least 400 × 400 pixels.");
 return Object.freeze({file,width:d.width,height:d.height,format:file.type==="image/png"?"png":"jpeg",size_bytes:file.size});
 }finally{URL.revokeObjectURL(url)}
}
window.AlbukhrProjectLogoValidator=Object.freeze({validate,MAX_BYTES,MIN_WIDTH,MIN_HEIGHT});
})(window);
