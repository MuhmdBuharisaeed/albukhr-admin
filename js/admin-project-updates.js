/* ALBUKHR Admin Project Updates Publisher — Mainnet only.
 * Authorization: Supabase Admin Auth + AAL2 in the browser, independently
 * re-verified by the trusted API. Project scope comes only from publisher grants.
 * Writes: API gateway only. Image bytes use a one-time Storage signed upload token.
 */
(function (window, document) {
  "use strict";

  const API_BASE = "https://albukhr-api.onrender.com/api/project-updates";
  const MAINNET = "mainnet";
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const $ = (id) => document.getElementById(id);

  let auth = null;
  let supabase = null;
  let accessToken = null;
  let projects = [];
  let selectedProjectId = null;
  let nextCursor = null;
  let feedHasMore = false;
  let selectedFile = null;
  let previewUrl = null;
  let publishing = false;

  function setStatus(message, type) {
    const element = $("pageStatus");
    if (!element) return;
    element.textContent = String(message || "");
    element.className = "status-bar" + (type ? " " + type : "");
  }

  function setFeedStatus(message, type) {
    const element = $("feedStatus");
    if (!element) return;
    element.textContent = String(message || "");
    element.className = "feed-status" + (type ? " " + type : "");
  }

  function fail(message) {
    throw new Error(String(message || "Project Updates publisher error."));
  }

  function assertMainnet() {
    const environment = window.ALBukhrEnvironment;
    if (!environment || typeof environment.isKnown !== "function" || typeof environment.isMainnet !== "function" || !environment.isKnown() || !environment.isMainnet()) {
      fail("Project Updates Admin is available only on the approved ALBUKHR Mainnet Admin host.");
    }
    if (!window.ALBUKHR_SUPABASE || String(window.ALBUKHR_SUPABASE.network || "").toLowerCase() !== MAINNET) {
      fail("The Admin Supabase Core is not connected to Mainnet.");
    }
  }

  function normalizeResponse(response, fallbackMessage) {
    let payload = response;
    if (!payload || typeof payload !== "object") fail(fallbackMessage || "The API returned an invalid response.");
    if (payload.success !== true) {
      const error = new Error(String(payload.error || fallbackMessage || "The request was rejected."));
      error.code = String(payload.code || "PROJECT_UPDATES_REQUEST_FAILED");
      error.status = Number(payload.status || 0);
      throw error;
    }
    if (String(payload.network || "").toLowerCase() !== MAINNET) fail("The API returned a non-Mainnet response.");
    return payload.data;
  }

  async function currentToken() {
    const session = await auth.getSession();
    const token = String(session && session.access_token || "").trim();
    if (!token) fail("Your Admin session has expired. Sign in again.");
    accessToken = token;
    return token;
  }

  async function apiRequest(path, options) {
    const settings = options || {};
    const method = String(settings.method || "GET").toUpperCase();
    const token = await currentToken();
    const headers = {
      "Accept": "application/json",
      "Authorization": "Bearer " + token,
      "x-albukhr-auth-provider": "supabase-auth"
    };
    const request = { method, headers, cache: "no-store", credentials: "omit" };
    if (settings.body !== undefined) {
      headers["Content-Type"] = "application/json";
      request.body = JSON.stringify(settings.body);
    }

    const response = await fetch(API_BASE + path, request);
    let payload;
    try { payload = await response.json(); }
    catch (_) { fail("Project Updates API returned an unreadable response."); }

    if (!response.ok) {
      const message = String(payload && payload.error || "Project Updates API request failed.");
      const error = new Error(message);
      error.code = String(payload && payload.code || "PROJECT_UPDATES_REQUEST_FAILED");
      error.status = response.status;
      throw error;
    }
    return normalizeResponse(payload, "Project Updates API request failed.");
  }

  function setSecurityBadge(value) {
    const element = $("securityBadge");
    if (element) element.textContent = value;
  }

  async function verifyAdmin() {
    assertMainnet();
    auth = window.AlbukhrSupabaseAdminAuth;
    if (!auth) fail("ALBUKHR Admin Auth Core is unavailable.");

    await auth.init();
    const admin = await auth.requireAdmin({ redirect: false, preserveSessionOnContextError: true });
    if (!admin) {
      window.location.replace("admin-login.html");
      return false;
    }
    if (admin.is_admin !== true || String(admin.status || "").toLowerCase() !== "active") {
      fail("An active ALBUKHR Admin account is required.");
    }

    const mfa = await auth.ensureMfa();
    if (admin.mfa_required !== false && !mfa?.verified) {
      window.location.replace("admin-mfa.html");
      return false;
    }

    supabase = window.ALBUKHR_SUPABASE.client;
    if (!supabase || !supabase.auth || !supabase.auth.mfa) fail("Mainnet Supabase Auth is unavailable.");
    const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error) throw assurance.error;
    if (String(assurance.data && assurance.data.currentLevel || "").toLowerCase() !== "aal2") {
      window.location.replace("admin-mfa.html");
      return false;
    }

    await currentToken();
    // The API independently verifies the JWT, AAL2 and active admin status.
    return true;
  }

  function projectLabel(project) {
    const type = String(project.project_type || "project").toUpperCase();
    const code = String(project.project_code || "").trim();
    return String(project.name || "Unnamed Project") + (code ? " — " + code : "") + " (" + type + ")";
  }

  async function loadProjects() {
    const select = $("projectSelect");
    const button = $("refreshProjectsButton");
    if (button) button.disabled = true;
    if (select) {
      select.disabled = true;
      select.replaceChildren(new Option("Loading authorized projects…", ""));
    }
    try {
      const result = await apiRequest("/publisher-projects");
      if (!Array.isArray(result)) fail("The publisher-project discovery response is invalid.");
      projects = result.filter((project) => project && String(project.network || "").toLowerCase() === MAINNET && ["approved", "active"].includes(String(project.status || "").toLowerCase()));
      if (select) select.replaceChildren();
      if (!projects.length) {
        selectedProjectId = null;
        $("workspace").hidden = true;
        $("emptyPanel").hidden = false;
        if (select) select.replaceChildren(new Option("No publisher grants found", ""));
        setStatus("No active Mainnet publisher grants were returned for this Admin identity.", "error");
        return;
      }

      const requestedId = new URLSearchParams(window.location.search).get("project_id");
      selectedProjectId = projects.some((project) => String(project.project_id) === selectedProjectId)
        ? selectedProjectId
        : (projects.some((project) => String(project.project_id) === requestedId) ? requestedId : String(projects[0].project_id));

      projects.forEach((project) => {
        const option = new Option(projectLabel(project), String(project.project_id));
        select.appendChild(option);
      });
      select.value = selectedProjectId;
      select.disabled = false;
      $("workspace").hidden = false;
      $("emptyPanel").hidden = true;
      renderProjectMeta();
      await loadFeed(true);
      setStatus("Admin AAL2 verified. Publisher projects loaded from the trusted Mainnet API.", "success");
    } catch (error) {
      console.error("[ALBUKHR PROJECT UPDATES] Publisher project discovery failed:", error);
      if (error && error.code === "AAL2_REQUIRED") {
        window.location.replace("admin-mfa.html");
        return;
      }
      if (error && ["AUTH_TOKEN_INVALID", "AUTH_TOKEN_REQUIRED", "ADMIN_ACCESS_REQUIRED"].includes(error.code)) {
        window.location.replace("admin-login.html");
        return;
      }
      setStatus(error && error.message || "Unable to load publisher projects.", "error");
      if (select) select.replaceChildren(new Option("Unable to load authorized projects", ""));
    } finally {
      if (button) button.disabled = false;
    }
  }

  function currentProject() {
    return projects.find((project) => String(project.project_id) === String(selectedProjectId)) || null;
  }

  function renderProjectMeta() {
    const project = currentProject();
    const element = $("projectMeta");
    if (!project || !element) return;
    element.textContent = [String(project.project_type || "").toUpperCase(), String(project.status || "").toUpperCase(), "Publisher grant: " + String(project.grant_source || "active")].filter(Boolean).join(" • ");
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Date unavailable";
    return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function safeImageUrl(value) {
    try {
      const url = new URL(String(value || ""), window.location.href);
      return url.protocol === "https:" ? url.href : "";
    } catch (_) { return ""; }
  }

  function addText(parent, tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = String(value == null ? "" : value);
    parent.appendChild(node);
    return node;
  }

  function renderFeedItems(items, prepend) {
    const list = $("feedList");
    if (!list) return;
    if (!prepend) list.replaceChildren();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const card = document.createElement("article");
      card.className = "feed-card";
      const imageUrl = safeImageUrl(item && item.image_url);
      if (imageUrl) {
        const image = document.createElement("img");
        image.src = imageUrl;
        image.alt = String(item.title || "Project update") + " evidence image";
        image.loading = "lazy";
        image.decoding = "async";
        image.referrerPolicy = "no-referrer";
        image.addEventListener("error", () => image.remove(), { once: true });
        card.appendChild(image);
      } else {
        const placeholder = document.createElement("div");
        placeholder.className = "empty-feed";
        placeholder.textContent = "Evidence image unavailable";
        card.appendChild(placeholder);
      }

      const content = document.createElement("div");
      content.className = "feed-card-content";
      const meta = document.createElement("div");
      meta.className = "feed-meta";
      addText(meta, "span", "type-pill", String(item.update_kind || "update").replace(/_/g, " ").toUpperCase());
      addText(meta, "span", "source-pill", String(item.source_label || "project_provided").replace(/_/g, " ").toUpperCase());
      addText(meta, "span", "feed-date", formatDate(item.published_at));
      content.appendChild(meta);
      addText(content, "h3", "", item.title || "Project update");
      addText(content, "p", "", item.body || "");
      const counts = document.createElement("div");
      counts.className = "feed-counts";
      addText(counts, "span", "", "Likes: " + Number(item.like_count || 0));
      addText(counts, "span", "", "Dislikes: " + Number(item.dislike_count || 0));
      addText(counts, "span", "", "Comments: " + Number(item.comments_count || 0));
      content.appendChild(counts);
      card.appendChild(content);
      if (prepend) list.insertBefore(card, list.firstChild);
      else list.appendChild(card);
    });
  }

  async function loadFeed(reset) {
    const project = currentProject();
    if (!project) return;
    const button = $("refreshFeedButton");
    const more = $("loadMoreButton");
    if (button) button.disabled = true;
    if (more) more.disabled = true;
    if (reset) {
      nextCursor = null;
      feedHasMore = false;
      $("feedList").replaceChildren();
      setFeedStatus("Loading published updates…");
    }
    try {
      const query = new URLSearchParams({ project_id: String(project.project_id), limit: "20", sort: "latest" });
      if (!reset && nextCursor) query.set("cursor", nextCursor);
      const url = API_BASE + "/feed?" + query.toString();
      const response = await fetch(url, { method: "GET", headers: { "Accept": "application/json" }, cache: "no-store", credentials: "omit" });
      let payload;
      try { payload = await response.json(); } catch (_) { fail("Project Updates feed returned an unreadable response."); }
      if (!response.ok) throw new Error(String(payload && payload.error || "Unable to load the project timeline."));
      const data = normalizeResponse(payload, "Unable to load the project timeline.");
      const items = Array.isArray(data && data.items) ? data.items : [];
      renderFeedItems(items, !reset);
      nextCursor = data && data.next_cursor || null;
      feedHasMore = data && data.has_more === true && Boolean(nextCursor);
      if (more) more.hidden = !feedHasMore;
      setFeedStatus(items.length ? (reset ? "Showing the latest published updates." : "Older updates loaded.") : "No published updates are available for this project yet.");
    } catch (error) {
      console.error("[ALBUKHR PROJECT UPDATES] Feed load failed:", error);
      setFeedStatus(error && error.message || "Unable to load published updates.", "error");
    } finally {
      if (button) button.disabled = false;
      if (more) more.disabled = false;
    }
  }

  function updateCounters() {
    if ($("titleCount")) $("titleCount").textContent = String($("updateTitle").value.length) + " / 160";
    if ($("bodyCount")) $("bodyCount").textContent = String($("updateBody").value.length) + " / 10,000";
    validateComposer();
  }

  function validateFile(file) {
    if (!file) return "Select one evidence image.";
    if (!ALLOWED_IMAGE_TYPES.has(String(file.type || "").toLowerCase())) return "Use a JPEG, PNG or WEBP image.";
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_IMAGE_BYTES) return "The image must be no larger than 10 MiB.";
    return "";
  }

  function validateComposer() {
    const project = currentProject();
    const title = String($("updateTitle")?.value || "").trim();
    const body = String($("updateBody")?.value || "").trim();
    const fileError = validateFile(selectedFile);
    const valid = Boolean(project && title.length >= 1 && title.length <= 160 && body.length >= 1 && body.length <= 10000 && !fileError && !publishing);
    const button = $("publishButton");
    if (button) button.disabled = !valid;
    if ($("publishHint") && !publishing) {
      $("publishHint").textContent = fileError || (!project ? "Select an authorized project." : (!title || !body ? "Complete the title and update details." : "Ready to publish to " + project.name + "."));
    }
    return valid;
  }

  function clearImage() {
    selectedFile = null;
    const input = $("updateImage");
    if (input) input.value = "";
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    $("imagePreviewWrap").hidden = true;
    $("imagePreview").removeAttribute("src");
    $("imageName").textContent = "";
    $("imageInfo").textContent = "";
    validateComposer();
  }

  function selectImage(file) {
    const problem = validateFile(file);
    if (problem) {
      clearImage();
      setStatus(problem, "error");
      return;
    }
    selectedFile = file;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    $("imagePreview").src = previewUrl;
    $("imageName").textContent = file.name;
    $("imageInfo").textContent = (file.size / 1024 / 1024).toFixed(2) + " MiB · " + file.type;
    $("imagePreviewWrap").hidden = false;
    setStatus("Evidence image selected. The server will verify the uploaded bytes before publication.");
    validateComposer();
  }

  async function publish(event) {
    event.preventDefault();
    if (publishing || !validateComposer()) return;
    const project = currentProject();
    const file = selectedFile;
    const title = String($("updateTitle").value || "").trim();
    const body = String($("updateBody").value || "").trim();
    const updateKind = String($("updateKind").value || "progress");
    const button = $("publishButton");

    publishing = true;
    if (button) button.disabled = true;
    button.textContent = "Preparing secure upload…";
    if ($("publishHint")) $("publishHint").textContent = "Creating a one-time Mainnet upload intent…";

    try {
      const intent = await apiRequest("/projects/" + encodeURIComponent(project.project_id) + "/upload-intents", {
        method: "POST",
        body: { content_type: file.type, file_size_bytes: file.size }
      });
      if (!intent || !intent.bucket || !intent.path || !intent.token || !intent.upload_intent_id) fail("The API did not return a complete secure upload intent.");

      button.textContent = "Uploading evidence image…";
      if ($("publishHint")) $("publishHint").textContent = "Uploading image to the one-time signed path…";
      const uploadResult = await supabase.storage.from(intent.bucket).uploadToSignedUrl(intent.path, intent.token, file, { contentType: file.type });
      if (uploadResult.error) throw uploadResult.error;

      button.textContent = "Publishing update…";
      if ($("publishHint")) $("publishHint").textContent = "The trusted API is validating the image and publisher permission…";
      await apiRequest("/projects/" + encodeURIComponent(project.project_id) + "/updates", {
        method: "POST",
        body: { upload_intent_id: intent.upload_intent_id, update_kind: updateKind, title, body }
      });

      $("updateTitle").value = "";
      $("updateBody").value = "";
      $("updateKind").value = "progress";
      clearImage();
      updateCounters();
      setStatus("Project update published successfully. The public timeline has been refreshed.", "success");
      await loadFeed(true);
    } catch (error) {
      console.error("[ALBUKHR PROJECT UPDATES] Publish failed:", error);
      const message = error && error.message || "The update could not be published.";
      setStatus(message, "error");
      if ($("publishHint")) $("publishHint").textContent = message;
    } finally {
      publishing = false;
      if (button) button.textContent = "Publish update";
      validateComposer();
    }
  }

  function bind() {
    $("projectSelect")?.addEventListener("change", async (event) => {
      selectedProjectId = String(event.target.value || "");
      renderProjectMeta();
      await loadFeed(true);
      validateComposer();
    });
    $("refreshProjectsButton")?.addEventListener("click", loadProjects);
    $("refreshFeedButton")?.addEventListener("click", () => loadFeed(true));
    $("loadMoreButton")?.addEventListener("click", () => {
      if (feedHasMore) void loadFeed(false);
    });
    $("updateTitle")?.addEventListener("input", updateCounters);
    $("updateBody")?.addEventListener("input", updateCounters);
    $("updateKind")?.addEventListener("change", validateComposer);
    $("updateImage")?.addEventListener("change", (event) => selectImage(event.target.files && event.target.files[0]));
    $("removeImageButton")?.addEventListener("click", clearImage);
    $("publishForm")?.addEventListener("submit", publish);
    $("logoutButton")?.addEventListener("click", async () => {
      try { await auth?.signOut(); } finally { window.location.replace("admin-login.html"); }
    });
  }

  async function initialize() {
    try {
      const verified = await verifyAdmin();
      if (!verified) return;
      setSecurityBadge("ADMIN AAL2 VERIFIED");
      bind();
      await loadProjects();
      updateCounters();
    } catch (error) {
      console.error("[ALBUKHR PROJECT UPDATES INIT]", error);
      const message = String(error && error.message || error || "Project Updates authorization failed.");
      setStatus(message, "error");
      setSecurityBadge("AUTHORIZATION FAILED");
      if (/mfa|aal2|factor|authenticator/i.test(message)) {
        window.location.replace("admin-mfa.html");
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})(window, document);
