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

  function plural(n, word) {
    return n === 1 ? `1 ${word}` : `${n} ${word}s`;
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
      parts.push(plural(fileCount, "file"));
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
  const pendingListEl = document.getElementById("pending-list");
  const pendingMoreEl = document.getElementById("pending-more");
  const clearBtnEl = document.getElementById("clear-btn");

  const INITIAL_LABEL = "Select files to upload";
  const MAX_LISTED = 5; // names shown in a list before the "+ n files" overflow line
  let pendingFiles = []; // selected files waiting to be uploaded
  let uploading = false;
  let deferredFiles = null; // a selection made mid-upload, applied when the batch ends
  let dragDepth = 0; // enter/leave fire for child elements too — depth keeps the highlight correct

  function setButtonLabel() {
    uploadBtnEl.textContent = pendingFiles.length
      ? `Upload ${plural(pendingFiles.length, "file")}`
      : INITIAL_LABEL;
    uploadBtnEl.disabled = uploading;
    clearBtnEl.hidden = uploading || !pendingFiles.length;
  }

  function setDropMessage(text, { busy = false, error = false } = {}) {
    dropMsgEl.textContent = text;
    dropMsgEl.classList.toggle("busy", busy);
    dropMsgEl.classList.toggle("error", error);
  }

  /* The pending list mirrors the delete dialog's confirm list: up to MAX_LISTED
         names, then a "+ n files" overflow line. Hidden entirely when empty. */
  function renderPendingList() {
    if (!pendingFiles.length) {
      pendingListEl.hidden = true;
      pendingMoreEl.hidden = true;
      pendingListEl.replaceChildren();
      return;
    }
    pendingListEl.hidden = false;
    pendingListEl.replaceChildren(
      ...pendingFiles.slice(0, MAX_LISTED).map((file) => {
        const li = el("li");
        li.textContent = file.name;
        li.title = file.name;
        return li;
      }),
    );
    const extra = pendingFiles.length - MAX_LISTED;
    if (extra > 0) {
      pendingMoreEl.textContent = `+ ${plural(extra, "file")}`;
      pendingMoreEl.hidden = false;
    } else {
      pendingMoreEl.hidden = true;
    }
  }

  /* Back to the initial state: no files, no list, no message, original label. */
  function resetDropArea() {
    pendingFiles = [];
    renderPendingList();
    setDropMessage("");
    setButtonLabel();
  }

  /* Take a fresh selection, replacing whatever was pending. A selection made
         while the batch is in flight is held and applied when the batch ends
         instead of being silently discarded. */
  function selectFiles(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    if (uploading) {
      deferredFiles = files;
      setDropMessage(
        "Upload in progress — the new selection will apply when it ends",
        { busy: true },
      );
      return;
    }
    pendingFiles = files;
    renderPendingList();
    setButtonLabel();
    setDropMessage(""); // a fresh selection clears any previous error message
  }

  /* One file: returns null on success, otherwise the error to report. */
  async function uploadOne(file) {
    try {
      const form = new FormData();
      form.append("file", file); // field name is not assumed by the endpoint
      const res = await fetch(`${apiBase}/upload`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok)
        return (data && data.error) || `Upload failed (${res.status})`;
      return null;
    } catch {
      return "Could not reach the gateway — is it running?";
    }
  }

  /* The failure line: one "name: error" entry per failed file (up to
         MAX_LISTED, then a "+ n files failed" overflow) joined with " · " so a
         filename containing a comma cannot be misread. */
  function failureMessage(failed) {
    const listed = failed.slice(0, MAX_LISTED);
    const detail = listed
      .map(({ file, error }) => `${file.name}: ${error}`)
      .join(" · ");
    const more = failed.length - MAX_LISTED;
    const moreText = more > 0 ? ` · + ${plural(more, "file")} failed` : "";
    const word = plural(failed.length, "file");
    const retry =
      failed.length === 1
        ? "It stays selected — retry or clear"
        : "They stay selected — retry or clear";
    return `Failed to upload ${word} — ${detail}${moreText} — ${retry}`;
  }

  /* Each file uploads in turn; one failure does not stop the batch — the failed
         files stay selected so a retry is one click away. */
  async function uploadPending() {
    if (uploading || !pendingFiles.length) return;
    uploading = true;
    setButtonLabel();
    const files = pendingFiles;
    const failed = [];
    for (let i = 0; i < files.length; i++) {
      setDropMessage(`uploading ${i + 1} / ${files.length} files...`, {
        busy: true,
      });
      const error = await uploadOne(files[i]);
      if (error) failed.push({ file: files[i], error });
    }
    uploading = false;
    const deferred = deferredFiles;
    deferredFiles = null;
    if (deferred) {
      // A selection made mid-upload replaces whatever the batch left behind.
      pendingFiles = deferred;
      renderPendingList();
      setDropMessage("");
      setButtonLabel();
    } else if (failed.length) {
      pendingFiles = failed.map((f) => f.file);
      renderPendingList();
      setDropMessage(failureMessage(failed), { error: true });
      setButtonLabel();
    } else {
      resetDropArea();
    }
    loadFiles(); // refresh the list — even a partially failed batch may have saved files
  }

  uploadBtnEl.addEventListener("click", () => {
    if (uploading) return;
    if (pendingFiles.length) {
      uploadPending();
      return;
    }
    fileInputEl.click();
  });

  clearBtnEl.addEventListener("click", () => {
    if (uploading) return;
    resetDropArea();
  });

  fileInputEl.addEventListener("change", () => {
    const files = [...(fileInputEl.files || [])];
    fileInputEl.value = ""; // so the same files can be picked again later
    selectFiles(files);
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
    selectFiles(e.dataTransfer && e.dataTransfer.files);
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
    confirmTitleEl.textContent = `Delete ${plural(names.length, "file")}?`;
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
      confirmMoreEl.textContent = `+ ${extra} more ${plural(extra, "selected file")}`;
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
