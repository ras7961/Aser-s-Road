/* Aser's Road: the normal scrolling website, built from content.js */
'use strict';

/* ---------- Normal website (built from CONTENT) ---------- */
function buildSite() {
  const c = CONTENT;
  $('#site').innerHTML = `
  <header class="s-head"><div class="wrap">
    <div class="s-brand">${esc(c.name)}</div>
    <nav class="s-nav" aria-label="Sections">
      <button data-go="s-works">Works</button><button data-go="s-exp">Experience</button><button data-go="s-about">About</button><button data-go="s-contact">Contact</button>
    </nav>
    <button class="s-back" id="backBtn" type="button">Back to the road</button>
  </div></header>
  <main>
    <section class="wrap s-hero">
      <div class="k">${esc(c.hello)}</div>
      <h1><span>${esc(c.name)}</span></h1>
      <p class="role">${esc(c.tagline)}</p>
      <p>${esc(c.intro)}</p>
    </section>
    <section class="wrap s-sec" id="s-works"><h2>Works</h2>
      <div class="work">${c.works.map((w) => `<article><h3>${esc(w.title)}</h3><p>${esc(w.desc)}</p><ul class="tags">${w.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></article>`).join('')}</div>
    </section>
    <section class="wrap s-sec" id="s-exp"><h2>Experience</h2>
      <div class="jobs">${c.experience.map((j) => `<div class="job"><div class="y">${esc(j.years)}</div><h3>${esc(j.role)}</h3><div class="o">${esc(j.org)}</div><div class="pl">${esc(j.place)}</div>${j.desc ? `<p>${esc(j.desc)}</p>` : ''}</div>`).join('')}</div>
    </section>
    <section class="wrap s-sec about" id="s-about"><h2>About</h2>
      <div>${c.about.story.map((p) => `<p>${esc(p)}</p>`).join('')}
        ${c.about.skillGroups.map((g) => `<div class="sk"><div class="skn">${esc(g.name)}</div><ul class="tags">${g.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}
        <ul class="tags" style="margin-top:10px">${c.about.facts.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
    </section>
    <section class="wrap s-sec s-contact" id="s-contact"><h2>Contact</h2>
      <div><p style="margin:0 0 8px;font-size:14px">${esc(c.contact.cta)}</p>
        <div class="mail" id="siteMail">${esc(c.contact.email)}</div>
        <button class="s-copy" id="siteCopy" type="button">Copy email</button>
        <ul><li><span>Phone</span>${esc(c.contact.phone)}</li>${c.contact.links.map((l) => `<li><span>${esc(l.label)}</span>${esc(l.value)}</li>`).join('')}</ul></div>
    </section>
  </main>
  <footer class="wrap s-foot">Placeholder content. Edit the CONTENT object in the page source to publish your own.</footer>`;
  document.querySelectorAll('.s-nav button').forEach((b) => b.addEventListener('click', () => { const t = document.getElementById(b.dataset.go); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  $('#backBtn').addEventListener('click', () => setSiteMode(false));
  $('#siteCopy').addEventListener('click', (e) => copyText(c.contact.email, $('#siteMail'), e.currentTarget));
}
