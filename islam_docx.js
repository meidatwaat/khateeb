/* محتوى من ملف الكلمات المرجعي (دفعة 1) + جمل وأسئلة من موسوعة المصطلحات. الترجمات العربية للأسئلة من تأليفي (تلخيص)، والجمل الإنجليزية بدون عربي في الملف الأصلي تُعرض مع الصوت فقط */
(function(){const M=JSON.parse(document.getElementById('islam-data').textContent);
M.items.forEach(it=>{const b=(window.KH_CONTENT=window.KH_CONTENT||{})['isl-'+it.k];if(!b)return;
if(it.t==='Sentence'){if(it.ar){if(!b.s.some(x=>x[0]===it.en))b.s.push([it.en,it.ar])}else{b.sx=b.sx||[];if(!b.sx.some(x=>x[0]===it.en))b.sx.push([it.en,''])}}
else{if(it.ar&&!b.w.some(x=>x[0].toLowerCase()===it.en.toLowerCase()))b.w.push([it.en,it.ar])}});
window.ISL_QA=M.qa;})();