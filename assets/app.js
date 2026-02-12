(async function () {
  const cardsEl = document.getElementById("cards");
  const updatedEl = document.getElementById("updated");
  const yearEl = document.getElementById("year");
  const searchEl = document.getElementById("search");

  yearEl.textContent = String(new Date().getFullYear());

  let sites = [];
  try {
    const res = await fetch(`/assets/sites.json?v=${Date.now()}`);
    if (!res.ok) throw new Error(`Failed to load sites.json (HTTP ${res.status})`);
    const data = await res.json();
    updatedEl.textContent = `Updated: ${data.updated || "—"}`;
    sites = Array.isArray(data.sites) ? data.sites : [];
  } catch (e) {
    cardsEl.innerHTML = `<div class="card"><h3>Couldn’t load site list</h3><p>${escapeHtml(e.message)}</p></div>`;
    return;
  }

  function render(filterText = "") {
    const q = (filterText || "").trim().toLowerCase();

    const filtered = sites
      .slice()
      .sort((a,b) => (a.name||"").localeCompare(b.name||""))
      .filter(s => {
        if (!q) return true;
        const hay = `${s.id} ${s.name} ${s.description||""} ${s.tag||""}`.toLowerCase();
        return hay.includes(q);
      });

    if (!filtered.length) {
      cardsEl.innerHTML = `<div class="card"><h3>No matches</h3><p>Try a different search.</p></div>`;
      return;
    }

    cardsEl.innerHTML = filtered.map(s => {
      const path = (s.path || "/").endsWith("/") ? s.path : (s.path + "/");
      const tag = s.tag || "Demo";
      const desc = s.description || "";
      const logo = s.logoUrl
        ? `<img class="logo" src="${escapeAttr(s.logoUrl)}" alt="${escapeAttr(s.name)} logo" loading="lazy" />`
        : `<div class="logo" aria-hidden="true"></div>`;

      return `
        <article class="card">
          <div class="card-head">
            ${logo}
            <div>
              <h3>${escapeHtml(s.name || s.id)}</h3>
              <div style="opacity:.7;font-size:12px;">${escapeHtml(path)}</div>
            </div>
          </div>

          <p>${escapeHtml(desc)}</p>

          <div class="row">
            <span class="tag">${escapeHtml(tag)}</span>
            <a class="btn" href="${path}">Open</a>
          </div>
        </article>
      `;
    }).join("");
  }

  searchEl?.addEventListener("input", () => render(searchEl.value));
  render();

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }
  function escapeAttr(str) {
    return String(str).replace(/"/g, "&quot;");
  }
})();
