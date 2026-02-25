// ===== Landing + Archived list logic =====
(async function () {
  const cardsEl = document.getElementById("cards");
  const updatedEl = document.getElementById("updated");
  const archivedCountEl = document.getElementById("archivedCount");
  const yearEl = document.getElementById("year");
  const searchEl = document.getElementById("search");

  const view = (document.body?.dataset?.view || "active").toLowerCase(); // active | archived
  const isArchivedView = view === "archived";

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
    if (cardsEl) cardsEl.innerHTML = `<div class="card"><h3>Couldn’t load site list</h3></div>`;
    return;
  }

  function issueUrlForArchiveAction(site, action) {
    // action: "archive" | "restore"
    const verb = action === "restore" ? "Restore" : "Archive";
    const title = `${verb} company: ${site.name}`;
    const body = [
      `### Company archive request`,
      ``,
      `**Company id:** ${site.id}`,
      `**Company name:** ${site.name}`,
      `**Action:** ${action}`,
      ``,
      `---`,
      `Created from the GitHub Pages ${isArchivedView ? "Archived" : "Landing"} page.`
    ].join("\n");

    return (
      `https://github.com/cjrolfe/cjrolfe.github.io/issues/new` +
      `?title=${encodeURIComponent(title)}` +
      `&labels=${encodeURIComponent("archive-company")}` +
      `&body=${encodeURIComponent(body)}`
    );
  }

  function issueUrlForDeleteAction(site) {
    const title = `Delete company: ${site.name}`;
    const body = [
      `### Company delete request`,
      ``,
      `**Company id:** ${site.id}`,
      `**Company name:** ${site.name}`,
      `**Action:** delete`,
      ``,
      `---`,
      `Created from the GitHub Pages Archived page.`
    ].join("\n");

    return (
      `https://github.com/cjrolfe/cjrolfe.github.io/issues/new` +
      `?title=${encodeURIComponent(title)}` +
      `&labels=${encodeURIComponent("archive-company")}` +
      `&body=${encodeURIComponent(body)}`
    );
  }

  function render(filterText = "") {
    const q = (filterText || "").toLowerCase();

    // Filter by archived flag based on the page
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
      const actionUrl = issueUrlForArchiveAction(s, action);

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
            <a class="btn ghost" href="${actionUrl}" target="_blank" rel="noreferrer">${actionLabel}</a>
            ${isArchivedView && s.id !== "company-template" ? `<a class="btn ghost" href="${issueUrlForDeleteAction(s)}" target="_blank" rel="noreferrer">Delete</a>` : ""}
          </div>
        </article>
      `;
    }).join("");
  }

  searchEl?.addEventListener("input", () => render(searchEl.value));
  render(searchEl?.value || "");
})();


// ===== Create new company modal logic (Issue → Action creates site + AI summary) =====
(function () {
  const openBtn = document.getElementById("openCreate");
  const modal = document.getElementById("createModal");
  const closeBtn = document.getElementById("closeCreate");

  const form = document.getElementById("createCompanyForm");
  const createBtn = document.getElementById("createIssue");

  const nameEl = document.getElementById("companyName");
  const urlEl = document.getElementById("companyUrl");
  const toneEl = document.getElementById("tone");

  const nameErrorEl = document.getElementById("nameError");
  const urlErrorEl = document.getElementById("urlError");

  const dialog = modal?.querySelector?.(".modal");

  if (!openBtn || !modal || !closeBtn || !form || !createBtn || !nameEl || !dialog) return;

  let lastFocused = null;

  function getFocusable() {
    const focusables = dialog.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    return Array.from(focusables).filter((el) => {
      // Only keep elements that are actually visible
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

    // Allow "example.com" or "www.example.com" by adding https://
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
      if (urlErrorEl) urlErrorEl.textContent = "That doesn’t look like a valid website address.";
      urlEl?.setAttribute("aria-invalid", "true");
      urlEl?.focus();
      return null;
    }

    return {
      name: rawName,
      url: normalizedUrl || "",
      tone: (toneEl?.value || "Professional").trim(),
    };
  }

  function setOpen(isOpen) {
    modal.hidden = !isOpen;
    document.body.classList.toggle("modal-open", isOpen);

    if (isOpen) {
      lastFocused = document.activeElement;
      clearErrors();
      // Let the browser paint first so focus doesn't scroll oddly on mobile
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

  // Focus trap + Escape
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

  // Submit (Enter key inside inputs will naturally submit)
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const data = validate();
    if (!data) return;

    const title = `Create company: ${data.name}`;
    const body = [
      `### Company request`,
      ``,
      `**Company name:** ${data.name}`,
      `**Website:** ${data.url || "-"}`,
      `**Tone:** ${data.tone}`,
      ``,
      `---`,
      `Created from the GitHub Pages index modal.`
    ].join("\n");

    const issueUrl =
      `https://github.com/cjrolfe/cjrolfe.github.io/issues/new` +
      `?title=${encodeURIComponent(title)}` +
      `&labels=${encodeURIComponent("create-company")}` +
      `&body=${encodeURIComponent(body)}`;

    window.open(issueUrl, "_blank", "noopener");
    setOpen(false);
  });
})();
