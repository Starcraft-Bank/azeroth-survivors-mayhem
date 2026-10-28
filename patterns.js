globalThis.MAYHEM_PATTERNS={points(kind,count,rotation=0){
  const result=[];
  for(let i=0;i<count;i++){
    let x,y;
    if(kind===2){const a=rotation+Math.PI/4+(i/Math.max(1,count-1))*Math.PI*1.5;x=Math.cos(a)*7;y=Math.sin(a)*7;}
    else if(kind===3){const d=(Math.floor(i/4)+1)*5;const a=rotation+(i%4)*Math.PI/2;x=Math.cos(a)*d;y=Math.sin(a)*d;}
    else if(kind===4){const row=i%2,along=Math.floor(i/2);x=(along-(Math.ceil(count/2)-1)/2)*5;y=row?5:-5;const a=x;x=a*Math.cos(rotation)-y*Math.sin(rotation);y=a*Math.sin(rotation)+y*Math.cos(rotation);}
    else if(kind===5){const a=rotation+i*1.1,d=2+i*1.35;x=Math.cos(a)*d;y=Math.sin(a)*d;}
    else {const a=rotation+i*2.39996323,d=i===0?0:3+Math.sqrt(i)*2;x=Math.cos(a)*d;y=Math.sin(a)*d;}
    result.push([x,y]);
  }
  return result;
}};
