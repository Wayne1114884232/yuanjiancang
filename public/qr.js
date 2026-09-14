(function(){
  const EXP=new Uint8Array(512),LOG=new Uint8Array(256);let x=1;
  for(let i=0;i<255;i++){EXP[i]=x;LOG[x]=i;x<<=1;if(x&256)x^=0x11d;}
  for(let i=255;i<512;i++)EXP[i]=EXP[i-255];
  const mul=(a,b)=>a&&b?EXP[LOG[a]+LOG[b]]:0;
  function generator(degree){let poly=[1];for(let i=0;i<degree;i++){const next=new Array(poly.length+1).fill(0);for(let j=0;j<poly.length;j++){next[j]^=poly[j];next[j+1]^=mul(poly[j],EXP[i]);}poly=next;}return poly;}
  function ecc(data,degree=20){const gen=generator(degree),out=new Array(degree).fill(0);for(const value of data){const factor=value^out[0];out.shift();out.push(0);for(let i=0;i<degree;i++)out[i]^=mul(gen[i+1],factor);}return out;}
  function bitsToBytes(text){const bytes=[...new TextEncoder().encode(text)];if(bytes.length>78)throw new Error('二维码文字过长');const bits=[],push=(value,count)=>{for(let i=count-1;i>=0;i--)bits.push((value>>>i)&1);};push(4,4);push(bytes.length,8);bytes.forEach(b=>push(b,8));const capacity=80*8;for(let i=0;i<Math.min(4,capacity-bits.length);i++)bits.push(0);while(bits.length%8)bits.push(0);const data=[];for(let i=0;i<bits.length;i+=8)data.push(bits.slice(i,i+8).reduce((n,b)=>(n<<1)|b,0));for(let pad=0;data.length<80;pad++)data.push(pad%2?0x11:0xec);return data.concat(ecc(data));}
  function bch(value,poly){let top=n=>{let d=0;while(n){d++;n>>>=1;}return d;},shift=top(value)-top(poly);while(shift>=0){value^=poly<<shift;shift=top(value)-top(poly);}return value;}
  function matrix(text){const size=33,m=Array.from({length:size},()=>Array(size).fill(false)),used=Array.from({length:size},()=>Array(size).fill(false)),set=(r,c,v)=>{if(r>=0&&c>=0&&r<size&&c<size){m[r][c]=Boolean(v);used[r][c]=true;}};
    const finder=(row,col)=>{for(let r=-1;r<=7;r++)for(let c=-1;c<=7;c++){const rr=row+r,cc=col+c;if(rr<0||cc<0||rr>=size||cc>=size)continue;set(rr,cc,r>=0&&r<=6&&c>=0&&c<=6&&(r===0||r===6||c===0||c===6||(r>=2&&r<=4&&c>=2&&c<=4)));}};
    finder(0,0);finder(0,size-7);finder(size-7,0);for(let i=8;i<size-8;i++){set(6,i,i%2===0);set(i,6,i%2===0);}for(let r=-2;r<=2;r++)for(let c=-2;c<=2;c++)set(26+r,26+c,Math.max(Math.abs(r),Math.abs(c))!==1);set(size-8,8,true);
    for(let i=0;i<15;i++){let vr,vc,hr,hc;if(i<6){vr=i;vc=8;}else if(i<8){vr=i+1;vc=8;}else{vr=size-15+i;vc=8;}if(i<8){hr=8;hc=size-i-1;}else if(i<9){hr=8;hc=15-i;}else{hr=8;hc=15-i-1;}used[vr][vc]=true;used[hr][hc]=true;}
    const code=bitsToBytes(text),mask=0;let byte=0,bit=7,row=size-1,inc=-1;for(let col=size-1;col>0;col-=2){if(col===6)col--;while(true){for(let offset=0;offset<2;offset++){const c=col-offset;if(!used[row][c]){let dark=byte<code.length&&((code[byte]>>>bit)&1)!==0;if((row+c)%2===0)dark=!dark;m[row][c]=dark;if(--bit<0){byte++;bit=7;}}}row+=inc;if(row<0||row>=size){row-=inc;inc=-inc;break;}}}
    const formatData=(1<<3)|mask,format=((formatData<<10)|bch(formatData<<10,0x537))^0x5412;for(let i=0;i<15;i++){const v=((format>>>i)&1)!==0;let vr,vc,hr,hc;if(i<6){vr=i;vc=8;}else if(i<8){vr=i+1;vc=8;}else{vr=size-15+i;vc=8;}if(i<8){hr=8;hc=size-i-1;}else if(i<9){hr=8;hc=15-i;}else{hr=8;hc=15-i-1;}m[vr][vc]=v;m[hr][hc]=v;}m[size-8][8]=true;return m;
  }
  function svg(text,scale=7){const grid=matrix(text),quiet=4,size=grid.length+quiet*2,path=[];for(let r=0;r<grid.length;r++)for(let c=0;c<grid.length;c++)if(grid[r][c])path.push(`M${c+quiet} ${r+quiet}h1v1h-1z`);return `<svg class="qr-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size*scale}" height="${size*scale}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${path.join('')}" fill="#000"/></svg>`;}
  window.ComponentQR={matrix,svg};
})();
