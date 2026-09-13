(async function(){
  try {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser does not support DecompressionStream.');
    }
    const response = await fetch('/mcda-engine.js.gz', { cache: 'no-store' });
    if (!response.ok || !response.body) throw new Error(`Cannot load MCDA engine: ${response.status}`);
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
    const source = await new Response(stream).text();
    const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const engine = document.createElement('script');
    engine.src = blobUrl;
    engine.onload = () => URL.revokeObjectURL(blobUrl);
    document.head.appendChild(engine);
  } catch (error) {
    console.error('MCDA engine bootstrap failed', error);
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = 'ไม่สามารถโหลด MCDA engine ได้ กรุณาใช้ Chrome / Edge รุ่นใหม่แล้วรีเฟรชหน้าเว็บ';
      toast.classList.add('show');
    }
  }
})();
