import type { APIRoute } from 'astro';

const SCRIPT = `(function(){
  if (window.__edgepressResizerInstalled) return;
  window.__edgepressResizerInstalled = true;
  function findFrame(source){
    var frames = document.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === source) return frames[i];
    }
    return null;
  }
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || typeof data !== 'object') return;
    if (data.type !== 'edgepress:resize') return;
    var h = Number(data.height);
    if (!isFinite(h) || h <= 0) return;
    var frame = findFrame(ev.source);
    if (!frame) return;
    frame.style.height = h + 'px';
  }, false);
})();`;

export const GET: APIRoute = () => {
  return new Response(SCRIPT, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
