// ===== Landing + Archived list logic =====
(async function () {
  const cardsEl = document.getElementById("cards");
  const updatedEl = document.getElementById("updated");
  const archivedCountEl = document.getElementById("archivedCount");
  const yearEl = document.getElementById("year");
  const searchEl = document.getElementById("search");

  const view = (document.body?.dataset?.view || "active").toLowerCase(); // active | archived
  const isArchivedView = view === "archived";

  const API_BASE = window.SWORDTHAIN_API || "";

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  let sites = [];
  try {
    const res = await fetch(`/assets/sites.json?v=${Date.now()}`);
    const data = await res.json();
    if (updatedEl) updatedEl.textContent = `Updated: ${data.updated || "—"}`;
    sites = Array.isArray(data.sites) ? data.sites : [];
    const archivedCount = sites.filter(s => !!s.archived).length;
    if (archivedCountEl) {
      archivedCountEl.textContent = `Archived: ${archivedCount}`;
      archivedCountEl.style.display = archivedCount > 0 ? "" : "none";
    }

  } catch (e) {
    if (cardsEl) cardsEl.innerHTML = `<div class="card"><h3>Couldn't load site list</h3></div>`;
    return;
  }

  async function callArchiveApi(action, companyId) {
    const res = await fetch(`${API_BASE}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, companyId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function render(filterText = "") {
    const q = (filterText || "").toLowerCase();

    const subset = sites.filter(s => {
      const isArchived = !!s.archived;
      return isArchivedView ? isArchived : !isArchived;
    });

    const filtered = subset.filter(s => {
      const hay = `${s.name} ${s.description} ${s.tag} ${s.id}`.toLowerCase();
      return hay.includes(q);
    });

    if (!cardsEl) return;

    if (filtered.length === 0) {
      cardsEl.innerHTML = `<div class="card"><h3>No ${isArchivedView ? "archived" : "active"} companies found</h3></div>`;
      return;
    }

    cardsEl.innerHTML = filtered.map(s => {
      const action = isArchivedView ? "restore" : "archive";
      const actionLabel = isArchivedView ? "Restore" : "Archive";

      const archiveBtn = API_BASE
        ? `<button type="button" class="btn ghost btn-archive" data-action="${action}" data-company-id="${s.id}">${actionLabel}</button>`
        : ``;

      const deleteBtn = isArchivedView && s.id !== "company-template" && API_BASE
        ? `<button type="button" class="btn ghost btn-delete" data-company-id="${s.id}">Delete</button>`
        : ``;

      return `
        <article class="card">
          <div class="card-head">
            <img class="logo" src="${s.logoUrl}" alt="${s.name} logo" />
            <div>
              <h3>${s.name}</h3>
              <div style="opacity:.7;font-size:12px;">/${s.id}/</div>
            </div>
          </div>
          <p>${s.description || ""}</p>
          <div class="row row-actions">
            <span class="tag">${s.tag || "Demo"}</span>
            ${!isArchivedView ? `<a class="btn" href="${s.path}">Open</a>` : ""}
            ${archiveBtn}
            ${deleteBtn || ""}
          </div>
        </article>
      `;
    }).join("");

    // Attach delegated handlers
    cardsEl.querySelectorAll(".btn-archive").forEach(btn => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.action;
        const companyId = btn.dataset.companyId;
        btn.disabled = true;
        btn.textContent = "...";
        try {
          await callArchiveApi(action, companyId);
          window.location.reload();
        } catch (e) {
          btn.disabled = false;
          btn.textContent = action === "restore" ? "Restore" : "Archive";
          alert(e.message || "Request failed");
        }
      });
    });

    cardsEl.querySelectorAll(".btn-delete").forEach(btn => {
      btn.addEventListener("click", async () => {
        const companyId = btn.dataset.companyId;
        if (!confirm(`Permanently delete ${companyId}? This cannot be undone.`)) return;
        btn.disabled = true;
        btn.textContent = "...";
        try {
          await callArchiveApi("delete", companyId);
          window.location.reload();
        } catch (e) {
          btn.disabled = false;
          btn.textContent = "Delete";
          alert(e.message || "Request failed");
        }
      });
    });
  }

  searchEl?.addEventListener("input", () => render(searchEl.value));
  render(searchEl?.value || "");
})();


// ===== Create new company modal logic (API creates site + AI summary) =====
(function () {
  const openBtn = document.getElementById("openCreate");
  const modal = document.getElementById("createModal");
  const closeBtn = document.getElementById("closeCreate");

  const form = document.getElementById("createCompanyForm");
  const createBtn = document.getElementById("createIssue");

  const nameEl = document.getElementById("companyName");
  const urlEl = document.getElementById("companyUrl");
  const toneEl = document.getElementById("tone");
  const demoDescEl = document.getElementById("demoDescription");

  const nameErrorEl = document.getElementById("nameError");
  const urlErrorEl = document.getElementById("urlError");

  const dialog = modal?.querySelector?.(".modal");
  const API_BASE = window.SWORDTHAIN_API || "";

  if (!openBtn || !modal || !closeBtn || !form || !createBtn || !nameEl || !demoDescEl || !dialog) return;

  let lastFocused = null;

  function getFocusable() {
    const focusables = dialog.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    return Array.from(focusables).filter((el) => {
      return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    });
  }

  function clearErrors() {
    if (nameErrorEl) nameErrorEl.textContent = "";
    if (urlErrorEl) urlErrorEl.textContent = "";
    nameEl.removeAttribute("aria-invalid");
    urlEl?.removeAttribute("aria-invalid");
  }

  function normalizeUrl(raw) {
    const trimmed = (raw || "").trim();
    if (!trimmed) return "";
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    let parsed;
    try {
      parsed = new URL(withScheme);
    } catch (e) {
      return null;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  }

  function validate() {
    clearErrors();
    const rawName = (nameEl.value || "").trim();
    const rawUrl = (urlEl?.value || "").trim();

    if (!rawName) {
      if (nameErrorEl) nameErrorEl.textContent = "Please enter a company name.";
      nameEl.setAttribute("aria-invalid", "true");
      nameEl.focus();
      return null;
    }

    const normalizedUrl = normalizeUrl(rawUrl);
    if (rawUrl && !normalizedUrl) {
      if (urlErrorEl) urlErrorEl.textContent = "That doesn't look like a valid website address.";
      urlEl?.setAttribute("aria-invalid", "true");
      urlEl?.focus();
      return null;
    }

    return {
      name: rawName,
      url: normalizedUrl || "",
      tone: (toneEl?.value || "Professional").trim(),
      demoDescription: (demoDescEl?.value || "").trim(),
    };
  }

  function setOpen(isOpen) {
    modal.hidden = !isOpen;
    document.body.classList.toggle("modal-open", isOpen);

    if (isOpen) {
      lastFocused = document.activeElement;
      clearErrors();
      setTimeout(() => nameEl.focus(), 0);
    } else {
      clearErrors();
      if (lastFocused && typeof lastFocused.focus === "function") {
        setTimeout(() => lastFocused.focus(), 0);
      }
      lastFocused = null;
    }
  }

  setOpen(false);

  openBtn.addEventListener("click", () => setOpen(true));
  closeBtn.addEventListener("click", () => setOpen(false));

  modal.addEventListener("click", (e) => {
    if (e.target === modal) setOpen(false);
  });

  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key !== "Tab") return;

    const focusables = getFocusable();
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const data = validate();
    if (!data) return;

    if (!API_BASE) {
      alert("API is not configured. Set window.SWORDTHAIN_API.");
      return;
    }

    const origLabel = createBtn.textContent;
    createBtn.disabled = true;
    createBtn.textContent = "Creating…";

    try {
      const res = await fetch(`${API_BASE}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          website: data.url || "",
          tone: data.tone,
          demoDescription: data.demoDescription || "",
        }),
      });

      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(result.error || `Request failed (${res.status})`);
      }

      setOpen(false);
      window.location.reload();
    } catch (err) {
      createBtn.disabled = false;
      createBtn.textContent = origLabel;
      const msg = err.message || "Request failed";
      if (nameErrorEl) nameErrorEl.textContent = msg + (msg.includes("fetch") ? " Check API URL and CORS." : "");
    }
  });
})();
