(async function () {
  const container = document.getElementById("sites");
  const updated = document.getElementById("updated");

  try {
    // Cache-bust so updates show quickly
    const res = await fetch(`/assets/sites.json?v=${Date.now()}`);
    if (!res.ok) throw new Error(`Failed to load sites.json (${res.status})`);

    const data = await res.json();
    const sites = Array.isArray(data.sites) ? data.sites : [];

    if (!sites.length) {
      container.innerHTML = `<div class="card"><h2>No sites yet</h2><p>Add folders + update assets/sites.json.</p></div>`;
      return;
    }

    // Sort by name
    sites.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    container.innerHTML = sites.map(s => {
      const path = s.path.endsWith("/") ? s.path : (s.path + "/");
      return `
        <article class="card">
          <h2>${escapeHtml(s.name || s.path)}</h2>
          <p>${escapeHtml(s.description || "")}</p>
          <a href="${path}">Open site</a>
        </article>
      `;
    }).join("");

    if (data.updated) updated.textContent = `Updated: ${data.updated}`;
  } catch (e) {
    container.innerHTML = `<div class="card"><h2>Couldn’t load sites</h2><p>${escapeHtml(e.message)}</p></div>`;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[m]));
  }
})();
