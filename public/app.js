const state = {
  branches: [],
  departments: [],
  templates: [],
  activeTemplate: null,
  dashboard: null,
  history: [],
  users: [],
  currentPage: "dashboard",
  auth: JSON.parse(localStorage.getItem("inspection-auth") || "null"),
};

const branchSelect = document.querySelector("#branchSelect");
const departmentSelect = document.querySelector("#departmentSelect");
const checklistRows = document.querySelector("#checklistRows");
const formScore = document.querySelector("#formScore");
const formStatus = document.querySelector("#formStatus");
const scoreDetail = document.querySelector("#scoreDetail");
const inspectionForm = document.querySelector("#inspectionForm");
const saveStatus = document.querySelector("#saveStatus");
const dashboardMonth = document.querySelector("#dashboardMonth");
const templateBranchSelect = document.querySelector("#templateBranchSelect");
const templateDepartmentSelect = document.querySelector("#templateDepartmentSelect");
const templateNameInput = document.querySelector("#templateNameInput");
const templateEditorRows = document.querySelector("#templateEditorRows");
const templateStatus = document.querySelector("#templateStatus");
const loginForm = document.querySelector("#loginForm");
const userBox = document.querySelector("#userBox");
const userLabel = document.querySelector("#userLabel");
const branchStatus = document.querySelector("#branchStatus");
const branchEditorRows = document.querySelector("#branchEditorRows");
const departmentStatus = document.querySelector("#departmentStatus");
const departmentEditorRows = document.querySelector("#departmentEditorRows");
const pageTitle = document.querySelector("#pageTitle");
const signatureCanvas = document.querySelector("#signatureCanvas");
const clearSignatureBtn = document.querySelector("#clearSignatureBtn");
const managerAckDate = document.querySelector("#managerAckDate");
const loginRequired = document.querySelector("#loginRequired");
const historyBranchFilter = document.querySelector("#historyBranchFilter");
const historyMonthFilter = document.querySelector("#historyMonthFilter");
const historyYearFilter = document.querySelector("#historyYearFilter");
const inspectionDetailPanel = document.querySelector("#inspectionDetailPanel");
const inspectionDetailTitle = document.querySelector("#inspectionDetailTitle");
const inspectionDetailContent = document.querySelector("#inspectionDetailContent");
const annualDepartmentSelect = document.querySelector("#annualDepartmentSelect");
const annualYearInput = document.querySelector("#annualYearInput");
const annualStatus = document.querySelector("#annualStatus");
const annualSummaryHead = document.querySelector("#annualSummaryHead");
const annualSummaryRows = document.querySelector("#annualSummaryRows");
const userStatus = document.querySelector("#userStatus");
const userEditorRows = document.querySelector("#userEditorRows");
let editingTemplate = null;
let hasSignature = false;
let drawingSignature = false;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function syncInspectionMonthFromDate() {
  const inspectionDate = document.querySelector("#inspectionDate").value;
  if (inspectionDate) document.querySelector("#inspectionMonth").value = inspectionDate.slice(0, 7);
}

function statusForScore(score, maxScore = 5) {
  const value = Number(score || 0);
  if (value >= 3) return ["pass", "ผ่าน"];
  if (value === 2) return ["fix", "แก้ไข"];
  return ["risk", "แก้ไขเร่งด่วน"];
}

function statusForPercent(percent) {
  if (percent >= 80) return ["pass", "ผ่าน"];
  if (percent >= 70) return ["fix", "ต้องแก้ไข"];
  return ["risk", "ความเสี่ยง"];
}

async function api(path, options) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(state.auth?.token ? { Authorization: `Bearer ${state.auth.token}` } : {}),
    },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "เกิดข้อผิดพลาด");
  return payload;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (file.size > 8 * 1024 * 1024) return reject(new Error("ไฟล์แนบต้องไม่เกิน 8 MB"));
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: reader.result });
    reader.onerror = () => reject(new Error("อ่านไฟล์แนบไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

function showEvidence({ title, caption, path, type }) {
  const src = path || "./assets/pb1.jpg";
  window.open(src, "_blank");
}

function isAdmin() {
  return state.auth?.user?.role === "Admin";
}

function sortedDepartments() {
  return [...state.departments].sort((a, b) => {
    const codeCompare = a.code.localeCompare(b.code, "th", {
      numeric: true,
      sensitivity: "base",
    });
    if (codeCompare !== 0) return codeCompare;
    return a.name.localeCompare(b.name, "th", { sensitivity: "base" });
  });
}

function departmentGroupCode(departmentCode) {
  const parts = String(departmentCode || "").split("-");
  return parts.length > 1 ? parts.slice(1).join("-") : String(departmentCode || "");
}

function annualDepartmentGroups() {
  const groups = new Map();
  sortedDepartments().forEach((department) => {
    const groupCode = departmentGroupCode(department.code);
    const current = groups.get(groupCode) || {
      code: groupCode,
      names: new Set(),
      branchCount: 0,
    };
    current.names.add(department.name);
    current.branchCount += 1;
    groups.set(groupCode, current);
  });

  return [...groups.values()].sort((a, b) => a.code.localeCompare(b.code, "th", {
    numeric: true,
    sensitivity: "base",
  }));
}

function renderAuth() {
  const admin = isAdmin();
  loginForm.hidden = Boolean(state.auth);
  userBox.hidden = !state.auth;
  userLabel.textContent = state.auth ? `${state.auth.user.name} (${state.auth.user.role})` : "";
  loginRequired.hidden = Boolean(state.auth);
  pageTitle.textContent = "ระบบตรวจรายงานและประเมิณ 5 ส";
  document.querySelector(".nav-list").hidden = !state.auth;
  document.querySelector(".sidebar-note").hidden = !state.auth;
  document.querySelectorAll(".admin-only").forEach((element) => {
    element.hidden = !admin || element.dataset.page !== state.currentPage;
  });
  document.querySelectorAll(".admin-nav").forEach((element) => {
    element.hidden = !admin;
  });
  showPage(state.auth ? state.currentPage : "");
}

function showPage(page) {
  state.currentPage = page || state.currentPage;
  document.querySelectorAll("[data-page-link]").forEach((link) => {
    link.classList.toggle("active", link.dataset.pageLink === state.currentPage);
  });
  document.querySelectorAll(".page-section").forEach((section) => {
    const adminBlocked = section.classList.contains("admin-only") && !isAdmin();
    section.hidden = !state.auth || adminBlocked || section.dataset.page !== state.currentPage;
  });
  loginRequired.hidden = Boolean(state.auth);
  if (state.currentPage === "history" && state.auth) loadHistory();
  if (state.currentPage === "annual" && state.auth) loadAnnualSummary();
  if (state.currentPage === "admin" && isAdmin()) loadUsers();
  if (state.currentPage === "entry") setTimeout(resizeSignatureCanvas, 0);
}

async function validateAuth() {
  if (!state.auth?.token) return;
  try {
    const result = await api("/api/me");
    if (!result.user) {
      state.auth = null;
      localStorage.removeItem("inspection-auth");
    } else {
      state.auth.user = result.user;
      localStorage.setItem("inspection-auth", JSON.stringify(state.auth));
    }
  } catch {
    state.auth = null;
    localStorage.removeItem("inspection-auth");
  }
}

function renderSelectors() {
  branchSelect.innerHTML = state.branches
    .map((branch) => `<option value="${branch.code}">${branch.code} - ${branch.name}</option>`)
    .join("");
  renderInspectionDepartmentSelect();
  templateBranchSelect.innerHTML = state.branches
    .map((branch) => `<option value="${branch.code}">${branch.code} - ${branch.name}</option>`)
    .join("");
  renderTemplateDepartmentSelect();
  historyBranchFilter.innerHTML = `<option value="">ทุกสาขา</option>${state.branches
    .map((branch) => `<option value="${branch.code}">${branch.code} - ${branch.name}</option>`)
    .join("")}`;
  annualDepartmentSelect.innerHTML = annualDepartmentGroups()
    .map((group) => {
      const names = [...group.names].join(" / ");
      return `<option value="${group.code}">${names} (${group.branchCount} สาขา)</option>`;
    })
    .join("");
}

function renderTemplateDepartmentSelect() {
  const branchCode = (templateBranchSelect.value || "").toUpperCase();
  const filteredDepartments = sortedDepartments().filter((department) =>
    department.code.toUpperCase().startsWith(branchCode),
  );

  if (!filteredDepartments.length) {
    templateDepartmentSelect.innerHTML = `<option value="">ไม่มีแผนกของสาขานี้</option>`;
    templateDepartmentSelect.disabled = true;
    editingTemplate = null;
    templateNameInput.value = "";
    templateEditorRows.innerHTML = "";
    return;
  }

  templateDepartmentSelect.disabled = false;
  templateDepartmentSelect.innerHTML = filteredDepartments
    .map((department) => `<option value="${department.code}">${department.name}</option>`)
    .join("");
}

function renderInspectionDepartmentSelect() {
  const branchCode = (branchSelect.value || "").toUpperCase();
  const filteredDepartments = sortedDepartments().filter((department) =>
    department.code.toUpperCase().startsWith(branchCode),
  );

  if (!filteredDepartments.length) {
    departmentSelect.innerHTML = `<option value="">ไม่มีแผนกของสาขานี้</option>`;
    departmentSelect.disabled = true;
    state.activeTemplate = null;
    checklistRows.innerHTML = "";
    updateFormScore();
    return;
  }

  departmentSelect.disabled = false;
  departmentSelect.innerHTML = filteredDepartments
    .map((department) => `<option value="${department.code}">${department.name}</option>`)
    .join("");
}

function renderBranchEditor() {
  branchEditorRows.innerHTML = state.branches
    .map((branch) => `
      <tr data-code="${branch.code}">
        <td><strong>${branch.code}</strong></td>
        <td><input class="branch-name" type="text" value="${escapeAttr(branch.name)}" /></td>
        <td><button class="ghost-button" type="button" data-action="save-branch">บันทึก</button></td>
        <td><button class="row-button" type="button" data-action="delete-branch">X</button></td>
      </tr>
    `)
    .join("");
}

function renderDepartmentEditor() {
  departmentEditorRows.innerHTML = sortedDepartments()
    .map((department) => `
      <tr data-code="${department.code}">
        <td><strong>${department.code}</strong></td>
        <td><input class="department-name" type="text" value="${escapeAttr(department.name)}" /></td>
        <td>${department.templateId}</td>
        <td><button class="ghost-button" type="button" data-action="save-department">บันทึก</button></td>
        <td><button class="row-button" type="button" data-action="delete-department">X</button></td>
      </tr>
    `)
    .join("");
}

function renderTemplates() {
  document.querySelector("#templateList").innerHTML = state.templates
    .map((template) => {
      const department = state.departments.find((item) => item.code === template.departmentCode);
      return `
        <div class="template-item">
          <strong>${template.name}</strong>
          <span>${department?.name || template.departmentCode} / ${template.itemCount} หัวข้อ</span>
        </div>
      `;
    })
    .join("");
}

async function refreshBootstrap() {
  const bootstrap = await api("/api/bootstrap");
  state.branches = bootstrap.branches;
  state.departments = bootstrap.departments;
  state.templates = bootstrap.templates;
  renderSelectors();
  renderTemplates();
  renderBranchEditor();
  renderDepartmentEditor();
}

async function loadTemplateForDepartment() {
  const department = state.departments.find((item) => item.code === departmentSelect.value);
  if (!department) {
    state.activeTemplate = null;
    checklistRows.innerHTML = "";
    updateFormScore();
    return;
  }
  state.activeTemplate = await api(`/api/templates/${encodeURIComponent(department.templateId)}`);
  renderChecklist();
}

async function loadTemplateEditor() {
  const department = state.departments.find((item) => item.code === templateDepartmentSelect.value);
  if (!department) {
    editingTemplate = null;
    templateNameInput.value = "";
    templateEditorRows.innerHTML = "";
    return;
  }
  editingTemplate = await api(`/api/templates/${encodeURIComponent(department.templateId)}`);
  templateNameInput.value = editingTemplate.name;
  renderTemplateEditorRows();
}

async function handleTemplateBranchChange() {
  renderTemplateDepartmentSelect();
  await loadTemplateEditor();
}

function renderTemplateEditorRows() {
  if (!editingTemplate) {
    templateEditorRows.innerHTML = "";
    return;
  }

  templateEditorRows.innerHTML = editingTemplate.items
    .map((item, index) => `
      <tr data-id="${item.id}">
        <td>${index + 1}</td>
        <td><input class="template-title" type="text" value="${escapeAttr(item.title)}" /></td>
        <td><input class="template-max-score" type="number" min="1" max="10" value="${item.maxScore}" /></td>
        <td><input class="template-weight" type="number" min="1" max="10" value="${item.weight}" /></td>
        <td><button class="row-button" type="button" data-action="delete-template-item">X</button></td>
      </tr>
    `)
    .join("");
}

function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function collectTemplateEditorItems() {
  return [...templateEditorRows.querySelectorAll("tr")].map((row, index) => ({
    id: row.dataset.id || `${editingTemplate.departmentCode}-${Date.now()}-${index}`,
    category: "ทั่วไป",
    title: row.querySelector(".template-title").value,
    maxScore: Number(row.querySelector(".template-max-score").value || 5),
    weight: Number(row.querySelector(".template-weight").value || 5),
  }));
}

function addTemplateItem() {
  if (!editingTemplate) return;
  editingTemplate.items.push({
    id: `${editingTemplate.departmentCode}-${Date.now()}`,
    itemNo: editingTemplate.items.length + 1,
    category: "ทั่วไป",
    title: "",
    maxScore: 5,
    weight: 5,
  });
  renderTemplateEditorRows();
}

async function saveTemplate() {
  if (!editingTemplate) return;
  if (!isAdmin()) {
    templateStatus.textContent = "ต้อง login Admin";
    templateStatus.className = "status-pill error";
    return;
  }
  templateStatus.textContent = "Saving...";
  templateStatus.className = "status-pill";

  try {
    const updated = await api(`/api/templates/${encodeURIComponent(editingTemplate.id)}`, {
      method: "PUT",
      body: JSON.stringify({
        name: templateNameInput.value,
        items: collectTemplateEditorItems(),
      }),
    });
    editingTemplate = updated;
    const summary = state.templates.find((template) => template.id === updated.id);
    if (summary) {
      summary.name = updated.name;
      summary.itemCount = updated.items.length;
    }
    renderTemplates();
    renderTemplateEditorRows();
    if (state.activeTemplate?.id === updated.id) {
      state.activeTemplate = updated;
      renderChecklist();
    }
    templateStatus.textContent = "Saved";
    templateStatus.className = "status-pill saved";
  } catch (error) {
    templateStatus.textContent = error.message;
    templateStatus.className = "status-pill error";
  }
}

async function login(event) {
  event.preventDefault();
  try {
    const auth = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: document.querySelector("#usernameInput").value,
        password: document.querySelector("#passwordInput").value,
      }),
    });
    state.auth = auth;
    localStorage.setItem("inspection-auth", JSON.stringify(auth));
    renderAuth();
    renderBranchEditor();
  } catch (error) {
    saveStatus.textContent = error.message;
    saveStatus.className = "status-pill error";
  }
}

async function logout() {
  try {
    await api("/api/logout", { method: "POST", body: "{}" });
  } catch {}
  state.auth = null;
  localStorage.removeItem("inspection-auth");
  renderAuth();
}

async function addBranch() {
  if (!isAdmin()) return;
  branchStatus.textContent = "Saving...";
  branchStatus.className = "status-pill";
  try {
    const branch = await api("/api/branches", {
      method: "POST",
      body: JSON.stringify({
        code: document.querySelector("#branchCodeInput").value,
        name: document.querySelector("#branchNameInput").value,
      }),
    });
    state.branches.push(branch);
    document.querySelector("#branchCodeInput").value = "";
    document.querySelector("#branchNameInput").value = "";
    renderSelectors();
    renderBranchEditor();
    await refreshDashboard();
    branchStatus.textContent = "Saved";
    branchStatus.className = "status-pill saved";
  } catch (error) {
    branchStatus.textContent = error.message;
    branchStatus.className = "status-pill error";
  }
}

async function saveBranch(row) {
  const code = row.dataset.code;
  branchStatus.textContent = "Saving...";
  branchStatus.className = "status-pill";
  try {
    const branch = await api(`/api/branches/${encodeURIComponent(code)}`, {
      method: "PUT",
      body: JSON.stringify({
        name: row.querySelector(".branch-name").value,
      }),
    });
    const index = state.branches.findIndex((item) => item.code === branch.code);
    if (index >= 0) state.branches[index] = branch;
    renderSelectors();
    renderBranchEditor();
    updateBranchImage();
    await refreshDashboard();
    branchStatus.textContent = "Saved";
    branchStatus.className = "status-pill saved";
  } catch (error) {
    branchStatus.textContent = error.message;
    branchStatus.className = "status-pill error";
  }
}

async function deleteBranch(row) {
  const code = row.dataset.code;
  branchStatus.textContent = "Deleting...";
  branchStatus.className = "status-pill";
  try {
    await api(`/api/branches/${encodeURIComponent(code)}`, {
      method: "DELETE",
      body: "{}",
    });
    state.branches = state.branches.filter((branch) => branch.code !== code);
    renderSelectors();
    renderBranchEditor();
    updateBranchImage();
    await refreshDashboard();
    branchStatus.textContent = "Deleted";
    branchStatus.className = "status-pill saved";
  } catch (error) {
    branchStatus.textContent = error.message;
    branchStatus.className = "status-pill error";
  }
}

async function addDepartment() {
  if (!isAdmin()) return;
  departmentStatus.textContent = "Saving...";
  departmentStatus.className = "status-pill";
  try {
    await api("/api/departments", {
      method: "POST",
      body: JSON.stringify({
        code: document.querySelector("#departmentCodeInput").value,
        name: document.querySelector("#departmentNameInput").value,
      }),
    });
    document.querySelector("#departmentCodeInput").value = "";
    document.querySelector("#departmentNameInput").value = "";
    await refreshBootstrap();
    await loadTemplateEditor();
    departmentStatus.textContent = "Saved";
    departmentStatus.className = "status-pill saved";
  } catch (error) {
    departmentStatus.textContent = error.message;
    departmentStatus.className = "status-pill error";
  }
}

async function saveDepartment(row) {
  if (!isAdmin()) return;
  departmentStatus.textContent = "Saving...";
  departmentStatus.className = "status-pill";
  try {
    await api(`/api/departments/${encodeURIComponent(row.dataset.code)}`, {
      method: "PUT",
      body: JSON.stringify({
        name: row.querySelector(".department-name").value,
      }),
    });
    await refreshBootstrap();
    await loadTemplateEditor();
    departmentStatus.textContent = "Saved";
    departmentStatus.className = "status-pill saved";
  } catch (error) {
    departmentStatus.textContent = error.message;
    departmentStatus.className = "status-pill error";
  }
}

async function deleteDepartment(row) {
  if (!isAdmin()) return;
  departmentStatus.textContent = "Deleting...";
  departmentStatus.className = "status-pill";
  try {
    await api(`/api/departments/${encodeURIComponent(row.dataset.code)}`, {
      method: "DELETE",
      body: "{}",
    });
    await refreshBootstrap();
    await loadTemplateEditor();
    departmentStatus.textContent = "Deleted";
    departmentStatus.className = "status-pill saved";
  } catch (error) {
    departmentStatus.textContent = error.message;
    departmentStatus.className = "status-pill error";
  }
}

function renderUsers() {
  userEditorRows.innerHTML = state.users
    .map((user) => `
      <tr data-username="${escapeAttr(user.username)}">
        <td><strong>${user.username}</strong></td>
        <td><input class="user-name" type="text" value="${escapeAttr(user.name)}" /></td>
        <td>
          <select class="user-role">
            ${["Inspector", "Executive", "Admin"].map((role) => `<option value="${role}" ${user.role === role ? "selected" : ""}>${role}</option>`).join("")}
          </select>
        </td>
        <td><input class="user-password" type="text" placeholder="เว้นว่างถ้าไม่เปลี่ยน" /></td>
        <td><button class="ghost-button" type="button" data-action="save-user">บันทึก</button></td>
        <td><button class="row-button" type="button" data-action="delete-user">X</button></td>
      </tr>
    `)
    .join("");
}

async function loadUsers() {
  if (!isAdmin()) return;
  try {
    state.users = await api("/api/users");
    renderUsers();
  } catch (error) {
    userStatus.textContent = error.message;
    userStatus.className = "status-pill error";
  }
}

async function addUser() {
  if (!isAdmin()) return;
  userStatus.textContent = "Saving...";
  userStatus.className = "status-pill";
  try {
    const user = await api("/api/users", {
      method: "POST",
      body: JSON.stringify({
        username: document.querySelector("#newUsernameInput").value,
        password: document.querySelector("#newPasswordInput").value,
        name: document.querySelector("#newUserNameInput").value,
        role: document.querySelector("#newUserRoleInput").value,
      }),
    });
    state.users.push(user);
    document.querySelector("#newUsernameInput").value = "";
    document.querySelector("#newPasswordInput").value = "";
    document.querySelector("#newUserNameInput").value = "";
    renderUsers();
    userStatus.textContent = "Saved";
    userStatus.className = "status-pill saved";
  } catch (error) {
    userStatus.textContent = error.message;
    userStatus.className = "status-pill error";
  }
}

async function saveUser(row) {
  userStatus.textContent = "Saving...";
  userStatus.className = "status-pill";
  try {
    const username = row.dataset.username;
    const user = await api(`/api/users/${encodeURIComponent(username)}`, {
      method: "PUT",
      body: JSON.stringify({
        name: row.querySelector(".user-name").value,
        role: row.querySelector(".user-role").value,
        password: row.querySelector(".user-password").value,
      }),
    });
    const index = state.users.findIndex((item) => item.username === username);
    if (index >= 0) state.users[index] = user;
    renderUsers();
    userStatus.textContent = "Saved";
    userStatus.className = "status-pill saved";
  } catch (error) {
    userStatus.textContent = error.message;
    userStatus.className = "status-pill error";
  }
}

async function deleteUser(row) {
  userStatus.textContent = "Deleting...";
  userStatus.className = "status-pill";
  try {
    const username = row.dataset.username;
    await api(`/api/users/${encodeURIComponent(username)}`, { method: "DELETE", body: "{}" });
    state.users = state.users.filter((user) => user.username !== username);
    renderUsers();
    userStatus.textContent = "Deleted";
    userStatus.className = "status-pill saved";
  } catch (error) {
    userStatus.textContent = error.message;
    userStatus.className = "status-pill error";
  }
}

function renderChecklist() {
  const template = state.activeTemplate;
  if (!template) {
    checklistRows.innerHTML = "";
    return;
  }

  checklistRows.innerHTML = template.items
    .map((item) => {
      const maxScore = Math.min(Number(item.maxScore || 5), 5);
      const scoreOptions = [1, 2, 3, 4, 5]
        .filter((score) => score <= maxScore)
        .map((score) => `<option value="${score}" ${score === maxScore ? "selected" : ""}>${score}</option>`)
        .join("");
      const [statusClass, statusText] = statusForScore(maxScore, maxScore);
      return `
        <tr data-item-id="${item.id}" data-max-score="${maxScore}" data-weight="${item.weight || maxScore}">
          <td>${item.itemNo}. ${item.title}</td>
          <td>${maxScore}</td>
          <td>
            <select class="score-input">
              ${scoreOptions}
            </select>
          </td>
          <td><input class="remark-input" type="text" placeholder="-" /></td>
          <td><span class="tag ${statusClass}">${statusText}</span></td>
        </tr>
      `;
    })
    .join("");
  updateFormScore();
}

function resizeSignatureCanvas() {
  const rect = signatureCanvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const dataUrl = hasSignature ? signatureCanvas.toDataURL("image/png") : null;
  signatureCanvas.width = Math.max(1, Math.floor(rect.width * ratio));
  signatureCanvas.height = Math.max(1, Math.floor(rect.height * ratio));
  const ctx = signatureCanvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#172033";
  if (dataUrl) {
    const image = new Image();
    image.onload = () => ctx.drawImage(image, 0, 0, rect.width, rect.height);
    image.src = dataUrl;
  }
}

function signaturePoint(event) {
  const rect = signatureCanvas.getBoundingClientRect();
  const pointer = event.touches?.[0] || event;
  return {
    x: pointer.clientX - rect.left,
    y: pointer.clientY - rect.top,
  };
}

function startSignature(event) {
  event.preventDefault();
  drawingSignature = true;
  const ctx = signatureCanvas.getContext("2d");
  const point = signaturePoint(event);
  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
}

function drawSignature(event) {
  if (!drawingSignature) return;
  event.preventDefault();
  const ctx = signatureCanvas.getContext("2d");
  const point = signaturePoint(event);
  ctx.lineTo(point.x, point.y);
  ctx.stroke();
  hasSignature = true;
}

function stopSignature() {
  drawingSignature = false;
}

function clearSignature() {
  const ctx = signatureCanvas.getContext("2d");
  ctx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
  hasSignature = false;
}

function updateFormScore() {
  const rows = [...checklistRows.querySelectorAll("tr")];
  const weightedTotal = rows.reduce((sum, row) => {
    const score = Number(row.querySelector(".score-input").value || 0);
    const maxScore = Number(row.dataset.maxScore || 0);
    const weight = Number(row.dataset.weight || maxScore || 0);
    return sum + (maxScore ? (score / maxScore) * weight : 0);
  }, 0);
  const maxWeight = rows.reduce((sum, row) => sum + Number(row.dataset.weight || row.dataset.maxScore || 0), 0);
  const percent = maxWeight ? Math.round((weightedTotal / maxWeight) * 100) : 0;
  const [className, text] = statusForPercent(percent);
  formScore.textContent = String(percent);
  formStatus.textContent = text;
  formStatus.className = className;
  scoreDetail.textContent = `คะแนนถ่วงน้ำหนัก ${weightedTotal.toFixed(1)} / ${maxWeight.toFixed(1)} (${percent}%)`;

  rows.forEach((row) => {
    const score = Number(row.querySelector(".score-input").value || 0);
    const maxScore = Number(row.dataset.maxScore || 5);
    const [tagClass, tagText] = statusForScore(score, maxScore);
    row.querySelector(".tag").className = `tag ${tagClass}`;
    row.querySelector(".tag").textContent = tagText;
  });
}

function updateBranchImage() {
  return;
}

async function handleBranchChange() {
  updateBranchImage();
  renderInspectionDepartmentSelect();
  await loadTemplateForDepartment();
}

function renderDashboard(data) {
  document.querySelector("#avgScore").textContent = data.avg;
  document.querySelector("#passedCount").textContent = data.passed;
  document.querySelector("#fixCount").textContent = data.fix;
  document.querySelector("#riskCount").textContent = data.risk;

  document.querySelector("#branchChart").innerHTML = data.branchSummary
    .map((row) => {
      const barClass = row.avgPercent < 70 ? "danger-bar" : row.avgPercent < 80 ? "warn-bar" : "";
      return `
        <div class="bar ${barClass}" style="--value: ${row.avgPercent}">
          <span>${row.avgPercent}</span>
          <strong>${row.branchCode}</strong>
        </div>
      `;
    })
    .join("");

  renderHistory(data.history);
}

function renderHistory(rows) {
  state.history = rows || [];
  document.querySelector("#historyList").innerHTML = state.history
    .map((row) => {
      const branch = state.branches.find((item) => item.code === row.branchCode);
      const department = state.departments.find((item) => item.code === row.departmentCode);
      const [className] = statusForPercent(row.percent);
      return `
        <div class="history-row clickable" data-id="${row.id}">
          <span>${row.inspectionDate}</span>
          <strong>${branch?.name || row.branchCode} / ${department?.name || row.departmentCode}</strong>
          <em class="${className}">${row.status} ${row.percent}</em>
          <small>
            ${row.executiveNote || "-"}
            ${row.managerSignaturePath ? `<button class="link-button" type="button" data-action="show-signature" data-id="${row.id}">ดูลายเซ็น</button>` : ""}
            <button class="link-button" type="button" data-action="export-pdf" data-id="${row.id}">Export PDF</button>
            ${isAdmin() ? `<button class="link-button danger-link" type="button" data-action="delete-inspection" data-id="${row.id}">ลบ</button>` : ""}
          </small>
        </div>
      `;
    })
    .join("");
}

async function loadHistory() {
  const params = new URLSearchParams();
  if (historyBranchFilter.value) params.set("branch", historyBranchFilter.value);
  if (historyMonthFilter.value) params.set("month", historyMonthFilter.value);
  if (historyYearFilter.value && !historyMonthFilter.value) params.set("year", historyYearFilter.value);
  const rows = await api(`/api/inspections?${params.toString()}`);
  renderHistory(rows);
}

async function refreshDashboard() {
  const month = dashboardMonth.value;
  const dashboard = await api(`/api/dashboard?month=${encodeURIComponent(month)}`);
  state.dashboard = dashboard;
  renderDashboard(dashboard);
}

async function loadAnnualSummary() {
  annualStatus.textContent = "Loading...";
  annualStatus.className = "status-pill";
  try {
    const params = new URLSearchParams({
      departmentCode: annualDepartmentSelect.value,
      year: annualYearInput.value || new Date().getFullYear().toString(),
    });
    const report = await api(`/api/annual-summary?${params.toString()}`);
    annualSummaryHead.innerHTML = `<tr><th>สาขา</th>${report.months.map((month) => `<th>${month.month.slice(5)}</th>`).join("")}<th>เฉลี่ย</th></tr>`;
    annualSummaryRows.innerHTML = report.branchRows
      .map((branch) => {
        const nonZero = branch.values.filter(Boolean);
        const avg = nonZero.length ? Math.round(nonZero.reduce((sum, value) => sum + value, 0) / nonZero.length) : 0;
        return `<tr><td>${branch.branchCode} - ${branch.branchName}</td>${branch.values.map((value) => `<td>${value || "-"}</td>`).join("")}<td><strong>${avg || "-"}</strong></td></tr>`;
      })
      .join("");
    annualStatus.textContent = "Ready";
    annualStatus.className = "status-pill saved";
  } catch (error) {
    annualStatus.textContent = error.message;
    annualStatus.className = "status-pill error";
  }
}

function inspectionToPrintableHtml(row) {
  const branch = state.branches.find((item) => item.code === row.branchCode);
  const department = state.departments.find((item) => item.code === row.departmentCode);
  const itemRows = row.scores
    .map((score, index) => {
      return `<tr><td>${index + 1}</td><td>${score.title || score.itemId}</td><td>${score.score}/${score.maxScore || ""}</td><td>${score.remark || "-"}</td></tr>`;
    })
    .join("");
  return `
    <!doctype html>
    <html lang="th">
      <head>
        <meta charset="utf-8" />
        <title>${row.id}</title>
        <style>
          body{font-family:Segoe UI,Tahoma,sans-serif;color:#172033;padding:28px}
          h1{font-size:22px;margin:0 0 12px}
          table{width:100%;border-collapse:collapse;margin-top:14px}
          th,td{border:1px solid #cfd8e3;padding:8px;text-align:left;font-size:13px}
          th{background:#eef3f7}
          .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px}
          img{max-width:340px;border:1px solid #cfd8e3;margin-top:10px}
          @media print{button{display:none}}
        </style>
      </head>
      <body>
        <button onclick="window.print()">Print / Save PDF</button>
        <h1>รายงานผลตรวจ ${row.id}</h1>
        <div class="grid">
          <div><strong>สาขา:</strong> ${branch?.name || row.branchCode}</div>
          <div><strong>แผนก:</strong> ${department?.name || row.departmentCode}</div>
          <div><strong>เดือน:</strong> ${row.inspectionMonth}</div>
          <div><strong>วันที่ตรวจ:</strong> ${row.inspectionDate}</div>
          <div><strong>ผู้ตรวจ:</strong> ${row.inspectorName}</div>
          <div><strong>คะแนน:</strong> ${row.totalScore}/${row.maxScore} (${row.percent}%) ${row.status}</div>
          <div><strong>ผจก. รับทราบ:</strong> ${row.managerAckName || "-"} ${row.managerAckDate || ""}</div>
          <div><strong>หมายเหตุ:</strong> ${row.executiveNote || "-"}</div>
        </div>
        <table>
          <thead><tr><th>#</th><th>หัวข้อตรวจ</th><th>คะแนน</th><th>หมายเหตุ</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
        ${row.evidencePath ? `<h2>หลักฐานใบตรวจ</h2><img src="${row.evidencePath}" />` : ""}
        ${row.managerSignaturePath ? `<h2>ลายเซ็น ผจก.</h2><img src="${row.managerSignaturePath}" />` : ""}
      </body>
    </html>`;
}

function exportInspectionPdf(row) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Browser block popup กรุณา allow popup ก่อน export PDF");
    return;
  }
  printWindow.document.write(inspectionToPrintableHtml(row));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 400);
}

async function showInspectionDetail(id) {
  const row = await api(`/api/inspections/${encodeURIComponent(id)}`);
  const branch = state.branches.find((item) => item.code === row.branchCode);
  const department = state.departments.find((item) => item.code === row.departmentCode);
  inspectionDetailTitle.textContent = row.id;
  inspectionDetailContent.innerHTML = `
    <div class="detail-grid">
      <div><span>สาขา</span><strong>${branch?.name || row.branchCode}</strong></div>
      <div><span>แผนก</span><strong>${department?.name || row.departmentCode}</strong></div>
      <div><span>รอบเดือน</span><strong>${row.inspectionMonth}</strong></div>
      <div><span>วันที่ตรวจ</span><strong>${row.inspectionDate}</strong></div>
      <div><span>ผู้ตรวจ</span><strong>${row.inspectorName}</strong></div>
      <div><span>คะแนน</span><strong>${row.totalScore}/${row.maxScore} (${row.percent}%) ${row.status}</strong></div>
      <div><span>ผจก. รับทราบ</span><strong>${row.managerAckName || "-"}</strong></div>
      <div><span>วันที่รับทราบ</span><strong>${row.managerAckDate || "-"}</strong></div>
      <div><span>สรุปถึงผู้บริหาร</span><strong>${row.executiveNote || "-"}</strong></div>
    </div>
    <div class="table-wrap">
      <table class="score-table">
        <thead>
          <tr>
            <th>ลำดับ</th>
            <th>หัวข้อตรวจ</th>
            <th>คะแนน</th>
            <th>น้ำหนัก</th>
            <th>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          ${row.scores.map((score, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${score.title || score.itemId}</td>
              <td>${score.score}/${score.maxScore || "-"}</td>
              <td>${score.weight || "-"}</td>
              <td>${score.remark || "-"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    ${row.managerSignaturePath ? `<img class="signature-preview" src="${row.managerSignaturePath}" alt="ลายเซ็น ผจก." />` : ""}
  `;
  inspectionDetailPanel.hidden = false;
}

async function deleteInspection(row) {
  if (!isAdmin()) return;
  const confirmed = confirm(`ต้องการลบข้อมูลตรวจ ${row.id} ใช่หรือไม่?`);
  if (!confirmed) return;
  try {
    await api(`/api/inspections/${encodeURIComponent(row.id)}`, {
      method: "DELETE",
      body: "{}",
    });
    await refreshDashboard();
    await loadHistory();
  } catch (error) {
    alert(error.message);
  }
}

async function submitInspection(event) {
  event.preventDefault();
  if (!state.activeTemplate) return;
  if (!state.auth) {
    saveStatus.textContent = "กรุณา login ก่อนบันทึก";
    saveStatus.className = "status-pill error";
    return;
  }
  if (!hasSignature) {
    saveStatus.textContent = "กรุณาให้ ผจก. เซ็นรับทราบก่อนบันทึก";
    saveStatus.className = "status-pill error";
    return;
  }
  if (!document.querySelector("#managerName").value.trim()) {
    saveStatus.textContent = "กรุณากรอกชื่อ ผจก. ผู้รับทราบ";
    saveStatus.className = "status-pill error";
    return;
  }

  const scores = [...checklistRows.querySelectorAll("tr")].map((row) => ({
    itemId: row.dataset.itemId,
    score: Number(row.querySelector(".score-input").value || 1),
    remark: row.querySelector(".remark-input").value || "-",
  }));

  const signatureDataUrl = hasSignature ? signatureCanvas.toDataURL("image/png") : "";
  const inspectionDate = document.querySelector("#inspectionDate").value;
  const payload = {
    branchCode: branchSelect.value,
    departmentCode: departmentSelect.value,
    inspectionMonth: inspectionDate ? inspectionDate.slice(0, 7) : document.querySelector("#inspectionMonth").value,
    inspectionDate,
    inspectorName: document.querySelector("#inspectorName").value,
    evidenceName: "",
    evidenceFile: null,
    executiveNote: document.querySelector("#executiveNote").value,
    managerAck: {
      name: document.querySelector("#managerName").value,
      date: document.querySelector("#managerAckDate").value,
      signatureDataUrl,
    },
    templateId: state.activeTemplate.id,
    scores,
  };

  saveStatus.textContent = "Saving...";
  saveStatus.className = "status-pill";
  try {
    const saved = await api("/api/inspections", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    saveStatus.textContent = `Saved ${saved.id}`;
    saveStatus.className = "status-pill saved";
    dashboardMonth.value = saved.inspectionMonth;
    clearSignature();
    await refreshDashboard();
    if (state.currentPage === "history") await loadHistory();
  } catch (error) {
    saveStatus.textContent = error.message;
    saveStatus.className = "status-pill error";
  }
}

async function init() {
  document.querySelector("#inspectionDate").value = today();
  syncInspectionMonthFromDate();
  managerAckDate.value = today();
  await validateAuth();
  renderAuth();
  await refreshBootstrap();
  updateBranchImage();
  await loadTemplateForDepartment();
  await loadTemplateEditor();
  await refreshDashboard();
  await loadHistory();
  await loadAnnualSummary();
  resizeSignatureCanvas();
  showPage(state.auth ? state.currentPage : "");
}

loginForm.addEventListener("submit", login);
document.querySelector("#logoutBtn").addEventListener("click", logout);
document.querySelectorAll("[data-page-link]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    showPage(link.dataset.pageLink);
  });
});
branchSelect.addEventListener("change", handleBranchChange);
departmentSelect.addEventListener("change", loadTemplateForDepartment);
templateDepartmentSelect.addEventListener("change", loadTemplateEditor);
templateBranchSelect.addEventListener("change", handleTemplateBranchChange);
document.querySelector("#addTemplateItemBtn").addEventListener("click", addTemplateItem);
document.querySelector("#saveTemplateBtn").addEventListener("click", saveTemplate);
templateEditorRows.addEventListener("click", (event) => {
  if (event.target?.dataset?.action !== "delete-template-item" || !editingTemplate) return;
  const row = event.target.closest("tr");
  editingTemplate.items = editingTemplate.items.filter((item) => item.id !== row.dataset.id);
  renderTemplateEditorRows();
});
document.querySelector("#addBranchBtn").addEventListener("click", addBranch);
branchEditorRows.addEventListener("click", (event) => {
  const action = event.target?.dataset?.action;
  const row = event.target.closest("tr");
  if (!action || !row) return;
  if (action === "save-branch") saveBranch(row);
  if (action === "delete-branch") deleteBranch(row);
});
document.querySelector("#addDepartmentBtn").addEventListener("click", addDepartment);
departmentEditorRows.addEventListener("click", (event) => {
  const action = event.target?.dataset?.action;
  const row = event.target.closest("tr");
  if (!action || !row) return;
  if (action === "save-department") saveDepartment(row);
  if (action === "delete-department") deleteDepartment(row);
});
document.querySelector("#addUserBtn").addEventListener("click", addUser);
userEditorRows.addEventListener("click", (event) => {
  const action = event.target?.dataset?.action;
  const row = event.target.closest("tr");
  if (!action || !row) return;
  if (action === "save-user") saveUser(row);
  if (action === "delete-user") deleteUser(row);
});
document.querySelector("#historyList").addEventListener("click", (event) => {
  const action = event.target?.dataset?.action;
  const historyRow = event.target.closest(".history-row");
  const id = event.target.dataset.id || historyRow?.dataset?.id;
  if (!id) return;
  const row = state.history?.find((item) => item.id === id) || state.dashboard?.history?.find((item) => item.id === id);
  if (!row) return;
  if (!action) {
    showInspectionDetail(id);
    return;
  }
  if (action === "export-pdf") {
    exportInspectionPdf(row);
    return;
  }
  if (action === "delete-inspection") {
    deleteInspection(row);
    return;
  }
  if (action === "show-signature") {
    showEvidence({
      title: `ลายเซ็นรับทราบ ${row.id}`,
      caption: `${row.managerAckName || "ไม่ระบุชื่อ"} / ${row.managerAckDate || "-"}`,
      path: row.managerSignaturePath,
      type: "image/png",
    });
    return;
  }
});
document.querySelector("#historyFilterBtn").addEventListener("click", loadHistory);
document.querySelector("#annualLoadBtn").addEventListener("click", loadAnnualSummary);
document.querySelector("#inspectionDate").addEventListener("change", syncInspectionMonthFromDate);
clearSignatureBtn.addEventListener("click", clearSignature);
signatureCanvas.addEventListener("mousedown", startSignature);
signatureCanvas.addEventListener("mousemove", drawSignature);
window.addEventListener("mouseup", stopSignature);
signatureCanvas.addEventListener("touchstart", startSignature, { passive: false });
signatureCanvas.addEventListener("touchmove", drawSignature, { passive: false });
window.addEventListener("touchend", stopSignature);
window.addEventListener("resize", resizeSignatureCanvas);
checklistRows.addEventListener("input", updateFormScore);
inspectionForm.addEventListener("submit", submitInspection);
document.querySelector("#refreshBtn").addEventListener("click", refreshDashboard);
dashboardMonth.addEventListener("change", refreshDashboard);

init().catch((error) => {
  saveStatus.textContent = error.message;
  saveStatus.className = "status-pill error";
});
