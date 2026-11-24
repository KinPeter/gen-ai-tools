/**
 * The Image Uploads UI, shared by every image-uploads mount.
 * One factory takes the two parts that differ between mounts; everything
 * else (markup ids, status line, dialog copy) is identical on both pages,
 * so the page copy itself lives in each HTML file rather than here.
 *
 * The HTML pages load this file as an ES module (`type="module"`, which is
 * deferred, so the markup is parsed by the time the factory runs) and pass:
 *
 * @param {object} config
 * @param {string} config.apiBase  - API mount prefix, e.g. "/api/my-image-uploads"
 * @param {string} config.envVar   - folder env var named in the load-error hint,
 *                                    e.g. "AIGW_MY_IMAGE_UPLOADS_FOLDER"
 */
export function createImageUploadsUI({ apiBase, envVar }) {
  const listEl = document.getElementById("file-list");
  const emptyEl = document.getElementById("empty-state");
  const emptyTitleEl = document.getElementById("empty-title");
  const emptyHintEl = document.getElementById("empty-hint");
  const statusEl = document.getElementById("status-line");
  const refreshBtn = document.getElementById("refresh-btn");

  const FILE_ICON =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><circle cx="9" cy="9" r="1.7"/><path d="M20.5 15.5l-4-4a1.5 1.5 0 0 0-2.1 0l-6.4 6.4"/></svg>';

  let loading = false;
  let deleting = false; // a delete request is in flight
  let listError = false; // the list failed to load; its message is in the empty state
  const selected = new Set(); // filenames checked for deletion
  let fileCount = null; // files in the shown list; null = not loaded

  function el(tag, className, parent) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (parent) parent.appendChild(node);
    return node;
  }

  function showSkeleton() {
    listEl.replaceChildren(
      ...Array.from({ length: 6 }, () => {
        const li = el("li", "skeleton");
        el("span", "skel-check", li);
        el("span", "skel-icon", li);
        el("span", "skel-line", li);
        return li;
      }),
    );
  }

  function hideEmpty() {
    emptyEl.hidden = true;
  }

  function showEmpty(title, hint, { error = false } = {}) {
    emptyEl.hidden = false;
    emptyTitleEl.textContent = title;
    emptyHintEl.textContent = hint;
    emptyEl.classList.toggle("error", error);
  }

  function filesLabel(n) {
    return n === 1 ? "1 file" : `${n} files`;
  }

  /* One place renders the status line: deleting wins, then the load error,
         then loading, then the file count with the selection. */
  function renderStatus() {
    const parts = [];
    let error = false;
    if (deleting) {
      parts.push("Deleting…");
      if (selected.size) parts.push(`${selected.size} selected`);
    } else if (listError) {
      parts.push("Error");
      error = true;
    } else if (loading) {
      parts.push("Loading…");
    } else if (fileCount !== null) {
      parts.push(filesLabel(fileCount));
      if (selected.size) parts.push(`${selected.size} selected`);
    } else {
      parts.push("Ready");
    }
    statusEl.textContent = parts.join(" · ");
    statusEl.classList.toggle("error", error);
  }

  function setFileCount(count) {
    fileCount = count;
    listError = false;
    renderStatus();
  }

  /* One label per row: the checkbox and the whole row toggle the selection. */
  function renderFiles(files) {
    selected.clear();
    listEl.replaceChildren(
      ...files.map((name) => {
        const row = el("label", "file-item");
        const check = el("input", "row-check", row);
        check.type = "checkbox";
        check.dataset.name = name;
        const icon = el("span", "file-icon", row);
        icon.innerHTML = FILE_ICON; // static markup — no user data
        const label = el("span", "file-name", row);
        label.textContent = name;
        row.title = name;
        return row;
      }),
    );
    hideEmpty();
    setFileCount(files.length);
    updateDeleteBar();
  }

  function renderError(message) {
    selected.clear();
    listEl.replaceChildren();
    showEmpty(
      message,
      `Check the gateway and its ${envVar}, then press the refresh button.`,
      { error: true },
    );
    listError = true;
    updateDeleteBar(); // renders the status line as "Error"
  }

  async function loadFiles() {
    if (loading) return;
    loading = true;
    refreshBtn.disabled = true;
    if (!listEl.children.length && emptyEl.hidden) showSkeleton();
    setFileCount(null); // status: "Loading…" until the fetch resolves
    try {
      const res = await fetch(`${apiBase}/list`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        renderError((data && data.error) || `Request failed (${res.status})`);
        return;
      }
      const files = data && Array.isArray(data.files) ? data.files : [];
      if (!files.length) {
        renderFiles([]); // rows, count and selection all reset
        showEmpty(
          "No files yet",
          "Files added to this folder will appear here.",
        );
        return;
      }
      renderFiles(files);
    } catch {
      renderError("Could not reach the gateway — is it running?");
    } finally {
      loading = false;
      refreshBtn.disabled = false;
      renderStatus(); // leaves "Error" after a failed fetch, the count after success
    }
  }

  refreshBtn.addEventListener("click", loadFiles);

  /* ---- Upload: drop area + hidden file input ---- */

  const dropAreaEl = document.getElementById("drop-area");
  const uploadBtnEl = document.getElementById("upload-btn");
  const fileInputEl = document.getElementById("file-input");
  const dropMsgEl = document.getElementById("drop-msg");

  const INITIAL_LABEL = "Select a file to upload";
  let pendingFile = null;
  let uploading = false;
  let dragDepth = 0; // enter/leave fire for child elements too — depth keeps the highlight correct

  function setButtonLabel() {
    uploadBtnEl.textContent = pendingFile
      ? `Upload ${pendingFile.name}`
      : INITIAL_LABEL;
    uploadBtnEl.disabled = uploading;
  }

  function setDropMessage(text, { busy = false, error = false } = {}) {
    dropMsgEl.textContent = text;
    dropMsgEl.classList.toggle("busy", busy);
    dropMsgEl.classList.toggle("error", error);
  }

  function pickFile(file) {
    if (!file || uploading) return;
    pendingFile = file;
    setButtonLabel();
    setDropMessage("");
  }

  /* Back to the initial state: no file, no message, original label. */
  function resetDropArea() {
    pendingFile = null;
    setButtonLabel();
    setDropMessage("");
  }

  async function uploadPending(file) {
    if (uploading) return;
    uploading = true;
    setButtonLabel();
    setDropMessage("Uploading…", { busy: true });
    try {
      const form = new FormData();
      form.append("file", file); // field name is not assumed by the endpoint
      const res = await fetch(`${apiBase}/upload`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setDropMessage(
          (data && data.error) || `Upload failed (${res.status})`,
          { error: true },
        );
        return; // the file stays selected so the user can retry
      }
      resetDropArea();
      loadFiles(); // refresh the list — the saved/deduped name appears there
    } catch {
      setDropMessage("Could not reach the gateway — is it running?", {
        error: true,
      });
    } finally {
      uploading = false;
      setButtonLabel();
    }
  }

  uploadBtnEl.addEventListener("click", () => {
    if (uploading) return;
    if (pendingFile) {
      uploadPending(pendingFile);
      return;
    }
    fileInputEl.click();
  });

  fileInputEl.addEventListener("change", () => {
    const file = fileInputEl.files && fileInputEl.files[0];
    if (file) pickFile(file);
    fileInputEl.value = ""; // so the same file can be picked again later
  });

  /* A file dropped outside the panel would otherwise replace the page. */
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => e.preventDefault());

  dropAreaEl.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragDepth += 1;
    dropAreaEl.classList.add("drag-over");
  });
  dropAreaEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  });
  dropAreaEl.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropAreaEl.classList.remove("drag-over");
  });
  dropAreaEl.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropAreaEl.classList.remove("drag-over");
    const files = e.dataTransfer && e.dataTransfer.files;
    pickFile(files && files[0]);
  });

  /* ---- Deleting: row checkboxes, delete bar, confirm dialog ---- */

  const deleteBarEl = document.getElementById("delete-bar");
  const confirmDialog = document.getElementById("confirm-dialog");
  const confirmTitleEl = document.getElementById("confirm-title");
  const confirmListEl = document.getElementById("confirm-list");
  const confirmMoreEl = document.getElementById("confirm-more");
  const confirmMsgEl = document.getElementById("confirm-msg");
  const confirmBtnEl = document.getElementById("confirm-btn");
  const cancelBtnEl = document.getElementById("cancel-btn");

  const MAX_LISTED = 5; // names shown in the dialog before "+ n more selected files"
  let deleteError = false; // the last delete failed — the list may be out of date

  function checkedNames() {
    return [...listEl.querySelectorAll(".row-check:checked")].map(
      (box) => box.dataset.name,
    );
  }

  /* The row checkboxes hold the selection; this keeps the delete bar and the
         status line in step with them. While the dialog is open the modal itself
         keeps the bar inert, so only the empty selection disables it. */
  function updateDeleteBar() {
    deleteBarEl.disabled = checkedNames().length === 0;
    deleteBarEl.textContent = deleting
      ? "Deleting…"
      : `Delete (${checkedNames().length})`;
    deleteBarEl.classList.toggle("busy", deleting);
    renderStatus();
  }

  function filesPhrase(n) {
    return n === 1 ? "selected file" : "selected files";
  }

  function setConfirmMessage(text, { error = false } = {}) {
    confirmMsgEl.textContent = text;
    confirmMsgEl.classList.toggle("error", error);
  }

  function resetConfirmButtons() {
    confirmBtnEl.disabled = false;
    confirmBtnEl.textContent = "Delete";
    confirmBtnEl.classList.remove("busy");
    cancelBtnEl.disabled = false;
  }

  function openConfirm() {
    if (deleting || confirmDialog.open) return;
    const names = checkedNames();
    if (!names.length) return; // nothing checked
    deleteError = false;
    confirmTitleEl.textContent = `Delete ${names.length} ${
      names.length === 1 ? "file" : "files"
    }?`;
    confirmListEl.replaceChildren(
      ...names.slice(0, MAX_LISTED).map((name) => {
        const li = el("li");
        li.textContent = name;
        li.title = name;
        return li;
      }),
    );
    const extra = names.length - MAX_LISTED;
    if (extra > 0) {
      confirmMoreEl.textContent = `+ ${extra} more ${filesPhrase(extra)}`;
      confirmMoreEl.hidden = false;
    } else {
      confirmMoreEl.hidden = true;
    }
    resetConfirmButtons();
    setConfirmMessage("");
    confirmDialog.showModal(); // rows go inert, so the selection cannot change now
    updateDeleteBar(); // the Delete button is disabled while the dialog is open
  }

  /* Rows are labels: clicking one toggles its checkbox, so one delegated
         change listener covers every row. */
  listEl.addEventListener("change", (e) => {
    const box = e.target;
    if (!box.classList || !box.classList.contains("row-check")) return;
    if (box.checked) selected.add(box.dataset.name);
    else selected.delete(box.dataset.name);
    const row = box.closest(".file-item");
    if (row) row.classList.toggle("selected", box.checked);
    updateDeleteBar();
  });

  deleteBarEl.addEventListener("click", openConfirm);

  cancelBtnEl.addEventListener("click", () => {
    if (deleting) return;
    confirmDialog.close(); // the close listener refreshes after a failed delete
  });

  confirmBtnEl.addEventListener("click", () => {
    if (deleting) return;
    confirmBtnEl.disabled = true; // no double-press of Confirm
    performDelete(checkedNames());
  });

  /* Closing without confirming: after a failed delete the server state may
         differ from the shown list, so the refresh happens on close. */
  confirmDialog.addEventListener("close", () => {
    resetConfirmButtons(); // clean buttons for the next open
    updateDeleteBar();
    if (deleteError) loadFiles();
  });

  /* Escape fires cancel, a backdrop click lands on the dialog itself; both are
         ignored while files are being deleted. */
  confirmDialog.addEventListener("cancel", (e) => {
    if (deleting) e.preventDefault();
  });
  confirmDialog.addEventListener("click", (e) => {
    if (e.target !== confirmDialog || deleting) return;
    confirmDialog.close();
  });

  /* The delete request itself: the endpoint counts only what it actually removed
     and skips names it cannot delete, so a 200 means "refresh and see the
     truth"; anything below 200 — and a gateway that cannot be reached — is
     reported here as one `{ ok, error }` result so the caller only deals with
     states. Names below 200 may still have been removed server-side. */
  async function requestDelete(names) {
    try {
      const res = await fetch(`${apiBase}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: names }),
      });
      const data = await res.json().catch(() => null);
      return {
        ok: res.ok,
        error: (data && data.error) || `Delete failed (${res.status})`,
      };
    } catch {
      return {
        ok: false,
        error: "Could not reach the gateway — is it running?",
      };
    }
  }

  /* Confirming in the dialog moves the dialog, the bar and the list through
     their states. A failed delete keeps every check in place so a retry is one
     click away, and refreshes the list when the dialog closes because the
     server may have removed some of the files anyway. */
  async function performDelete(names) {
    if (deleting || !names.length) return;
    deleting = true;
    confirmBtnEl.disabled = true;
    cancelBtnEl.disabled = true;
    confirmBtnEl.textContent = "Deleting…";
    confirmBtnEl.classList.add("busy");
    updateDeleteBar(); // status line: "Deleting… · <n> selected"
    const { ok, error } = await requestDelete(names);
    deleting = false;
    if (!ok) {
      deleteError = true;
      setConfirmMessage(error, { error: true });
      resetConfirmButtons(); // the dialog is still open: retry or cancel
      updateDeleteBar();
      return;
    }
    deleteError = false;
    resetConfirmButtons(); // reset now, not when the deferred close event lands
    confirmDialog.close(); // → updateDeleteBar() + any error refresh on close
    loadFiles(); // refresh the list — the deleted names are gone from it
  }

  loadFiles();
}
