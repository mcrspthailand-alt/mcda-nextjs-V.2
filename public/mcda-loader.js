(async function(){
  try {
    const parts = ['/engine/part-01.txt', '/engine/part-02.txt', '/engine/part-03.txt', '/engine/part-04.txt', '/engine/part-05.txt', '/engine/part-06.txt'];
    const source = (await Promise.all(parts.map(async (url) => {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Cannot load ${url}: ${response.status}`);
      return response.text();
    }))).join('');
    const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const engine = document.createElement('script');
    engine.src = blobUrl;
    engine.onload = () => URL.revokeObjectURL(blobUrl);
    document.head.appendChild(engine);
  } catch (error) {
    console.error('MCDA engine bootstrap failed', error);
    const toast = document.getElementById('toast');
    if (toast) { toast.textContent = 'ไม่สามารถโหลด MCDA engine ได้ กรุณารีเฟรชหน้าเว็บ'; toast.classList.add('show'); }
  }
})();
