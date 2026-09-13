(async function(){
  try {
    if (typeof DecompressionStream === 'undefined') throw new Error('DecompressionStream is unavailable.');
    const parts = ['/engine-data/part-01.txt','/engine-data/part-02.txt','/engine-data/part-03.txt','/engine-data/part-04.txt','/engine-data/part-05.txt','/engine-data/part-06.txt'];
    const base64 = (await Promise.all(parts.map(async (url) => {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Cannot load ${url}: ${response.status}`);
      return response.text();
    }))).join('');
    const binary = atob(base64);
    const compressed = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
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
