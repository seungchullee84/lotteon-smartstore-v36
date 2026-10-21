export async function collectColorImages(page,product,log=()=>{}){
  product.colorImages={};
  const chips=await page.locator('a.gio_opt_img_list img[alt]').evaluateAll(es=>es.map(e=>e.alt));
  const compact=s=>s.replace(/\s/g,'');
  for(let i=0;i<product.colors.length;i++){
    const color=product.colors[i],alt=chips.find(x=>compact(x)===compact(color));
    if(!alt){product.warnings.push(color+': 색상별 사진을 확인하지 못했습니다.');continue;}
    const chip=page.locator('a.gio_opt_img_list').filter({has:page.getByAltText(alt,{exact:true})}).first();
    const current=await chip.evaluate(e=>e.classList.contains('selected'));
    const selector='img.product_image_tooltip_image_gio[data-image_no]';
    const before=await page.locator(selector).evaluateAll(es=>es.map(e=>e.src).join('|'));
    if(!current){
      const close=page.locator('[id^="bg-campaign-overlay"] .bg-campaign-button.close-now').filter({visible:true});
      if(await close.count())await close.last().click({timeout:3000});
      try{await chip.click({timeout:5000});}
      catch(error){if(!await close.count())throw error;await close.last().click({timeout:3000});await chip.click({timeout:5000});}
    }
    if(!current){
      try{await page.waitForFunction(({selector,before})=>Array.from(document.querySelectorAll(selector)).map(e=>e.src).join('|')!==before,{selector,before},{timeout:7000});}
      catch{product.warnings.push(color+': 사진 전환을 확인하지 못해 제외했습니다.');continue;}
    }
    await page.waitForTimeout(250);
    const urls=await page.locator(selector).evaluateAll(es=>[...new Set(es.map(e=>e.src.split('#')[0]))].filter(src=>new URL(src).origin==='https://www.giordano.co.kr'&&new URL(src).pathname.startsWith('/_data/attach/')).slice(0,2));
    product.colorImages[color]=urls;
    urls.forEach((url,j)=>product.images['color'+(i+1)+'_'+(j+1)]=url);
    if(urls.length<2)product.warnings.push(color+': 공식몰 사진이 '+urls.length+'장입니다.');
    log('색상별 상세사진: '+color+' '+urls.length+'장');
  }
}
