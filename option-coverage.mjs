export const optionKey=(kind,value)=>kind+':'+String(value).replace(/\s/g,'');
export class OptionCoverage{
 constructor(p){this.expected=new Set([...(p.colors||[]).map(x=>optionKey('색상',x)),...(p.sizes||[]).map(x=>optionKey('사이즈',x))]);if(!this.expected.size)throw Error('확인할 색상·사이즈가 없습니다.');this.done=new Set();}
 has(kind,value){return this.done.has(optionKey(kind,value));}
 mark(kind,value){const key=optionKey(kind,value);if(!this.expected.has(key))throw Error('수집 정보에 없는 옵션입니다: '+key);this.done.add(key);}
 get complete(){return this.done.size===this.expected.size;}
 get missing(){return [...this.expected].filter(k=>!this.done.has(k));}
}
