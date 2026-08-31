const http = require("http");
const fs = require("fs/promises");
const fssync = require("fs");
const path = require("path");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DB_PATH = process.env.DB_PATH || path.join(ROOT, "data", "db.json");
const EXAMPLE_DB_PATH = path.join(ROOT, "data", "db.example.json");
const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads");
const PORT = Number(process.env.PORT || 4180);
const sessions = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

async function readDb() {
  if (!fssync.existsSync(DB_PATH) && fssync.existsSync(EXAMPLE_DB_PATH)) {
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    await fs.copyFile(EXAMPLE_DB_PATH, DB_PATH);
  }
  const raw = await fs.readFile(DB_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeDb(db) {
  const tmp = `${DB_PATH}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(db, null, 2)}\n`, "utf8");
  await fs.rename(tmp, DB_PATH);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 12_000_000) {
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function getToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function getSession(req) {
  const token = getToken(req);
  return token ? sessions.get(token) : null;
}

function requireAdmin(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { error: "กรุณา login ก่อน" });
    return null;
  }
  if (session.role !== "Admin") {
    sendJson(res, 403, { error: "ต้องใช้สิทธิ์ Admin" });
    return null;
  }
  return session;
}

function statusFromPercent(percent) {
  if (percent >= 80) return "ผ่าน";
  if (percent >= 70) return "ต้องแก้ไข";
  return "ความเสี่ยง";
}

function reportMonthForInspection(inspection) {
  return String(inspection.inspectionDate || inspection.inspectionMonth || "").slice(0, 7);
}

function departmentGroupCode(departmentCode) {
  const parts = String(departmentCode || "").split("-");
  return parts.length > 1 ? parts.slice(1).join("-") : String(departmentCode || "");
}

function matchesAnnualDepartment(rowDepartmentCode, selectedDepartment) {
  if (!selectedDepartment) return true;
  const selectedGroup = departmentGroupCode(selectedDepartment).toUpperCase();
  return departmentGroupCode(rowDepartmentCode).toUpperCase() === selectedGroup;
}

function calculateWeightedScore(template, scores) {
  const sourceScores = Array.isArray(scores) ? scores : [];
  const normalizedScores = template.items.map((item) => {
    const incoming = sourceScores.find((score) => score.itemId === item.id) || {};
    const rawScore = Number(incoming.score);
    const score = Number.isFinite(rawScore) ? Math.max(1, Math.min(item.maxScore, rawScore)) : 1;
      return {
        itemId: item.id,
        title: item.title,
        maxScore: item.maxScore,
        weight: item.weight || item.maxScore,
        score,
        remark: String(incoming.remark || "-").trim() || "-",
      };
  });

  const totalScore = normalizedScores.reduce((sum, scoreRow) => {
    const item = template.items.find((templateItem) => templateItem.id === scoreRow.itemId);
    const maxScore = Number(item?.maxScore || 0);
    const weight = Number(item?.weight || maxScore || 0);
    return sum + (maxScore ? (scoreRow.score / maxScore) * weight : 0);
  }, 0);
  const maxScore = template.items.reduce((sum, item) => sum + Number(item.weight || item.maxScore || 0), 0);
  const percent = maxScore ? Math.round((totalScore / maxScore) * 100) : 0;

  return {
    totalScore: Math.round(totalScore * 10) / 10,
    maxScore: Math.round(maxScore * 10) / 10,
    percent,
    status: statusFromPercent(percent),
    normalizedScores,
  };
}

function withCalculatedScore(db, inspection) {
  const template = db.templates.find((row) => row.id === inspection.templateId);
  if (!template) return inspection;
  const calculated = calculateWeightedScore(template, inspection.scores);
  return {
    ...inspection,
    totalScore: calculated.totalScore,
    maxScore: calculated.maxScore,
    percent: calculated.percent,
    status: calculated.status,
    scores: calculated.normalizedScores,
  };
}

function safeFileName(name) {
  const ext = path.extname(name || "").toLowerCase();
  const base = path.basename(name || "evidence", ext).replace(/[^a-zA-Z0-9ก-๙_-]+/g, "-").slice(0, 50);
  return `${base || "evidence"}${ext || ".jpg"}`;
}

async function saveDataUrlFile(file, options = {}) {
  if (!file?.dataUrl) return null;
  const match = String(file.dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("ไฟล์แนบไม่ถูกต้อง");
  const mimeType = match[1];
  const allowedTypes = options.allowedTypes || ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!allowedTypes.includes(mimeType)) {
    throw new Error(options.typeError || "รองรับเฉพาะไฟล์ JPG, PNG, WEBP หรือ PDF");
  }
  const buffer = Buffer.from(match[2], "base64");
  const maxBytes = options.maxBytes || 8 * 1024 * 1024;
  if (buffer.length > maxBytes) throw new Error(options.sizeError || "ไฟล์แนบต้องไม่เกิน 8 MB");

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${Date.now()}-${options.prefix || "file"}-${safeFileName(file.name)}`;
  const fullPath = path.join(UPLOAD_DIR, filename);
  await fs.writeFile(fullPath, buffer);
  return {
    name: file.name || filename,
    path: `/uploads/${filename}`,
    type: mimeType,
  };
}

async function saveEvidenceFile(file) {
  const saved = await saveDataUrlFile(file, { prefix: "evidence" });
  if (!saved) return null;
  return {
    evidenceName: saved.name,
    evidencePath: saved.path,
    evidenceType: saved.type,
  };
}

async function saveSignatureFile(dataUrl, inspectionId) {
  if (!dataUrl) return null;
  const saved = await saveDataUrlFile(
    { name: `${inspectionId}-manager-signature.png`, dataUrl },
    {
      prefix: "signature",
      allowedTypes: ["image/png"],
      maxBytes: 2 * 1024 * 1024,
      typeError: "ลายเซ็นต้องเป็น PNG",
      sizeError: "ไฟล์ลายเซ็นต้องไม่เกิน 2 MB",
    },
  );
  return saved?.path || "";
}

function buildDashboard(db, month) {
  const inspections = db.inspections.map((row) => withCalculatedScore(db, row)).filter((row) => !month || row.inspectionMonth === month);
  const avg = inspections.length
    ? Math.round(inspections.reduce((sum, row) => sum + row.percent, 0) / inspections.length)
    : 0;
  const branchSummary = db.branches.map((branch) => {
    const rows = inspections.filter((row) => row.branchCode === branch.code);
    const branchAvg = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.percent, 0) / rows.length) : 0;
    return {
      branchCode: branch.code,
      branchName: branch.name,
      avgPercent: branchAvg,
      passed: rows.filter((row) => row.status === "ผ่าน").length,
      fix: rows.filter((row) => row.status === "ต้องแก้ไข").length,
      risk: rows.filter((row) => row.status === "ความเสี่ยง").length,
    };
  });

  const followUps = inspections
    .filter((row) => row.status !== "ผ่าน")
    .sort((a, b) => a.percent - b.percent)
    .slice(0, 8)
    .map((row) => {
      const branch = db.branches.find((item) => item.code === row.branchCode);
      const dept = db.departments.find((item) => item.code === row.departmentCode);
      return {
        id: row.id,
        branchCode: row.branchCode,
        branchName: branch?.name || row.branchCode,
        departmentName: dept?.name || row.departmentCode,
        percent: row.percent,
        status: row.status,
        note: row.executiveNote || "-",
      };
    });

  return {
    month: month || "ทั้งหมด",
    avg,
    passed: inspections.filter((row) => row.status === "ผ่าน").length,
    fix: inspections.filter((row) => row.status === "ต้องแก้ไข").length,
    risk: inspections.filter((row) => row.status === "ความเสี่ยง").length,
    branchSummary,
    followUps,
    history: inspections.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

function nextInspectionId(db, branchCode, month) {
  const yearMonth = month.replace("-", "");
  const count = db.inspections.filter((row) => row.branchCode === branchCode && row.inspectionMonth === month).length + 1;
  return `R-${yearMonth}-${branchCode}-${String(count).padStart(3, "0")}`;
}

async function handleApi(req, res, url) {
  const db = await readDb();

  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await parseBody(req);
    const user = (db.users || []).find((row) => row.username === body.username && row.password === body.password);
    if (!user) return sendJson(res, 401, { error: "username หรือ password ไม่ถูกต้อง" });
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const session = { username: user.username, name: user.name, role: user.role };
    sessions.set(token, session);
    return sendJson(res, 200, { token, user: session });
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    return sendJson(res, 200, { user: getSession(req) });
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    const token = getToken(req);
    if (token) sessions.delete(token);
    return sendJson(res, 200, { success: true });
  }

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    return sendJson(res, 200, {
      branches: db.branches,
      departments: db.departments,
      templates: db.templates.map((template) => ({
        id: template.id,
        name: template.name,
        departmentCode: template.departmentCode,
        itemCount: template.items.length,
      })),
    });
  }

  if (req.method === "GET" && url.pathname === "/api/users") {
    if (!requireAdmin(req, res)) return;
    return sendJson(res, 200, (db.users || []).map(({ password, ...user }) => user));
  }

  if (req.method === "POST" && url.pathname === "/api/users") {
    if (!requireAdmin(req, res)) return;
    const body = await parseBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "").trim();
    const name = String(body.name || "").trim();
    const role = String(body.role || "Inspector").trim();
    if (!username || !password || !name) return sendJson(res, 400, { error: "กรุณากรอก username, password และชื่อผู้ใช้" });
    db.users = db.users || [];
    if (db.users.some((user) => user.username === username)) return sendJson(res, 400, { error: "username นี้มีอยู่แล้ว" });
    const user = { username, password, name, role };
    db.users.push(user);
    await writeDb(db);
    const { password: _password, ...safeUser } = user;
    return sendJson(res, 201, safeUser);
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/users/")) {
    if (!requireAdmin(req, res)) return;
    const username = decodeURIComponent(url.pathname.split("/").pop());
    const user = (db.users || []).find((row) => row.username === username);
    if (!user) return sendJson(res, 404, { error: "ไม่พบ user" });
    const body = await parseBody(req);
    user.name = String(body.name || user.name).trim();
    user.role = String(body.role || user.role).trim();
    if (body.password) user.password = String(body.password).trim();
    if (!user.name) return sendJson(res, 400, { error: "กรุณากรอกชื่อผู้ใช้" });
    await writeDb(db);
    const { password: _password, ...safeUser } = user;
    return sendJson(res, 200, safeUser);
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/users/")) {
    const session = requireAdmin(req, res);
    if (!session) return;
    const username = decodeURIComponent(url.pathname.split("/").pop());
    if (username === session.username) return sendJson(res, 400, { error: "ลบ user ที่กำลัง login อยู่ไม่ได้" });
    const before = (db.users || []).length;
    db.users = (db.users || []).filter((row) => row.username !== username);
    if (db.users.length === before) return sendJson(res, 404, { error: "ไม่พบ user" });
    await writeDb(db);
    return sendJson(res, 200, { success: true });
  }

  if (req.method === "POST" && url.pathname === "/api/branches") {
    if (!requireAdmin(req, res)) return;
    const body = await parseBody(req);
    const code = String(body.code || "").trim().toUpperCase();
    const name = String(body.name || "").trim();
    const area = String(body.area || "").trim();
    const image = String(body.image || "").trim() || "pb1.jpg";
    if (!code || !name) return sendJson(res, 400, { error: "กรุณากรอกรหัสและชื่อสาขา" });
    if (db.branches.some((branch) => branch.code === code)) {
      return sendJson(res, 400, { error: "รหัสสาขานี้มีอยู่แล้ว" });
    }
    const branch = { code, name, area, image };
    db.branches.push(branch);
    await writeDb(db);
    return sendJson(res, 201, branch);
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/branches/")) {
    if (!requireAdmin(req, res)) return;
    const code = decodeURIComponent(url.pathname.split("/").pop()).toUpperCase();
    const branch = db.branches.find((row) => row.code === code);
    if (!branch) return sendJson(res, 404, { error: "ไม่พบสาขา" });
    const body = await parseBody(req);
    branch.name = String(body.name || branch.name).trim();
    branch.area = body.area === undefined ? branch.area || "" : String(body.area || "").trim();
    branch.image = body.image === undefined ? branch.image || "pb1.jpg" : String(body.image || branch.image || "pb1.jpg").trim();
    if (!branch.name) return sendJson(res, 400, { error: "กรุณากรอกชื่อสาขา" });
    await writeDb(db);
    return sendJson(res, 200, branch);
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/branches/")) {
    if (!requireAdmin(req, res)) return;
    const code = decodeURIComponent(url.pathname.split("/").pop()).toUpperCase();
    if (db.inspections.some((row) => row.branchCode === code)) {
      return sendJson(res, 400, { error: "ลบไม่ได้ เพราะมีประวัติผลตรวจของสาขานี้แล้ว" });
    }
    const before = db.branches.length;
    db.branches = db.branches.filter((row) => row.code !== code);
    if (db.branches.length === before) return sendJson(res, 404, { error: "ไม่พบสาขา" });
    await writeDb(db);
    return sendJson(res, 200, { success: true });
  }

  if (req.method === "POST" && url.pathname === "/api/departments") {
    if (!requireAdmin(req, res)) return;
    const body = await parseBody(req);
    const code = String(body.code || "").trim().toUpperCase();
    const name = String(body.name || "").trim();
    if (!code || !name) return sendJson(res, 400, { error: "กรุณากรอกรหัสและชื่อแผนก" });
    if (db.departments.some((department) => department.code === code)) {
      return sendJson(res, 400, { error: "รหัสแผนกนี้มีอยู่แล้ว" });
    }
    const templateId = `TPL-${code}`;
    const department = { code, name, templateId };
    db.departments.push(department);
    if (!db.templates.some((template) => template.id === templateId)) {
      db.templates.push({
        id: templateId,
        name: `แบบตรวจ${name}`,
        departmentCode: code,
        items: [
          { id: `${code}-001`, itemNo: 1, category: "ทั่วไป", title: "หัวข้อตรวจใหม่", maxScore: 5, weight: 5 }
        ],
      });
    }
    await writeDb(db);
    return sendJson(res, 201, department);
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/departments/")) {
    if (!requireAdmin(req, res)) return;
    const code = decodeURIComponent(url.pathname.split("/").pop()).toUpperCase();
    const department = db.departments.find((row) => row.code === code);
    if (!department) return sendJson(res, 404, { error: "ไม่พบแผนก" });
    const body = await parseBody(req);
    department.name = String(body.name || department.name).trim();
    if (!department.name) return sendJson(res, 400, { error: "กรุณากรอกชื่อแผนก" });
    const template = db.templates.find((row) => row.id === department.templateId);
    if (template && body.syncTemplateName !== false) template.name = `แบบตรวจ${department.name}`;
    await writeDb(db);
    return sendJson(res, 200, department);
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/departments/")) {
    if (!requireAdmin(req, res)) return;
    const code = decodeURIComponent(url.pathname.split("/").pop()).toUpperCase();
    if (db.inspections.some((row) => row.departmentCode === code)) {
      return sendJson(res, 400, { error: "ลบไม่ได้ เพราะมีประวัติผลตรวจของแผนกนี้แล้ว" });
    }
    const department = db.departments.find((row) => row.code === code);
    if (!department) return sendJson(res, 404, { error: "ไม่พบแผนก" });
    db.departments = db.departments.filter((row) => row.code !== code);
    db.templates = db.templates.filter((row) => row.id !== department.templateId);
    await writeDb(db);
    return sendJson(res, 200, { success: true });
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/templates/")) {
    const templateId = decodeURIComponent(url.pathname.split("/").pop());
    const template = db.templates.find((row) => row.id === templateId);
    if (!template) return sendJson(res, 404, { error: "Template not found" });
    return sendJson(res, 200, template);
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/templates/")) {
    if (!requireAdmin(req, res)) return;
    const templateId = decodeURIComponent(url.pathname.split("/").pop());
    const template = db.templates.find((row) => row.id === templateId);
    if (!template) return sendJson(res, 404, { error: "Template not found" });

    const body = await parseBody(req);
    const incomingItems = Array.isArray(body.items) ? body.items : [];
    if (!incomingItems.length) {
      return sendJson(res, 400, { error: "Template ต้องมีหัวข้อตรวจอย่างน้อย 1 รายการ" });
    }

    template.name = String(body.name || template.name).trim();
    template.items = incomingItems.map((item, index) => {
      const maxScore = Number(item.maxScore);
      const weight = Number(item.weight);
      return {
        id: String(item.id || `${template.departmentCode}-${Date.now()}-${index}`).trim(),
        itemNo: index + 1,
        category: String(item.category || "ทั่วไป").trim(),
        title: String(item.title || "").trim(),
        maxScore: Number.isFinite(maxScore) && maxScore > 0 ? Math.round(maxScore) : 5,
        weight: Number.isFinite(weight) && weight > 0 ? Math.round(weight) : 5,
      };
    });

    if (template.items.some((item) => !item.title)) {
      return sendJson(res, 400, { error: "กรุณากรอกชื่อหัวข้อตรวจให้ครบ" });
    }

    await writeDb(db);
    return sendJson(res, 200, template);
  }

  if (req.method === "GET" && url.pathname === "/api/dashboard") {
    return sendJson(res, 200, buildDashboard(db, url.searchParams.get("month")));
  }

  if (req.method === "GET" && url.pathname === "/api/inspections") {
    const branch = url.searchParams.get("branch");
    const month = url.searchParams.get("month");
    const year = url.searchParams.get("year");
    const rows = db.inspections
      .map((row) => withCalculatedScore(db, row))
      .filter((row) => !branch || row.branchCode === branch)
      .filter((row) => !month || row.inspectionMonth === month)
      .filter((row) => !year || row.inspectionMonth.startsWith(`${year}-`))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return sendJson(res, 200, rows);
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/inspections/")) {
    const inspectionId = decodeURIComponent(url.pathname.split("/").pop());
    const inspection = db.inspections.map((row) => withCalculatedScore(db, row)).find((row) => row.id === inspectionId);
    if (!inspection) return sendJson(res, 404, { error: "ไม่พบข้อมูลตรวจ" });
    return sendJson(res, 200, inspection);
  }

  if (req.method === "GET" && url.pathname === "/api/annual-summary") {
    const departmentCode = url.searchParams.get("departmentCode");
    const year = url.searchParams.get("year") || new Date().getFullYear().toString();
    const rows = db.inspections
      .map((row) => withCalculatedScore(db, row))
      .filter((row) => matchesAnnualDepartment(row.departmentCode, departmentCode))
      .filter((row) => reportMonthForInspection(row).startsWith(`${year}-`));
    const months = Array.from({ length: 12 }, (_, index) => {
      const month = `${year}-${String(index + 1).padStart(2, "0")}`;
      const monthRows = rows.filter((row) => reportMonthForInspection(row) === month);
      return {
        month,
        avgPercent: monthRows.length ? Math.round(monthRows.reduce((sum, row) => sum + row.percent, 0) / monthRows.length) : 0,
        count: monthRows.length,
      };
    });
    const branchRows = db.branches.map((branchRow) => {
      const values = months.map(({ month }) => {
        const found = rows.filter((row) => row.branchCode === branchRow.code && reportMonthForInspection(row) === month);
        return found.length ? Math.round(found.reduce((sum, row) => sum + row.percent, 0) / found.length) : 0;
      });
      return { branchCode: branchRow.code, branchName: branchRow.name, values };
    });
    return sendJson(res, 200, { departmentCode, year, months, branchRows });
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/inspections/")) {
    if (!requireAdmin(req, res)) return;
    const inspectionId = decodeURIComponent(url.pathname.split("/").pop());
    const before = db.inspections.length;
    db.inspections = db.inspections.filter((row) => row.id !== inspectionId);
    if (db.inspections.length === before) return sendJson(res, 404, { error: "ไม่พบข้อมูลตรวจ" });
    await writeDb(db);
    return sendJson(res, 200, { success: true });
  }

  if (req.method === "POST" && url.pathname === "/api/inspections") {
    if (!getSession(req)) return sendJson(res, 401, { error: "กรุณา login ก่อนบันทึกผลตรวจ" });
    const body = await parseBody(req);
    const branch = db.branches.find((row) => row.code === body.branchCode);
    const department = db.departments.find((row) => row.code === body.departmentCode);
    const template = db.templates.find((row) => row.id === body.templateId);

    if (!branch || !department || !template) {
      return sendJson(res, 400, { error: "ข้อมูลสาขา แผนก หรือ Template ไม่ถูกต้อง" });
    }
    if (!department.code.toUpperCase().startsWith(branch.code.toUpperCase())) {
      return sendJson(res, 400, { error: "แผนกที่เลือกไม่ตรงกับสาขา กรุณาเลือกแผนกที่รหัสขึ้นต้นด้วยรหัสสาขา" });
    }

    const calculatedScore = calculateWeightedScore(template, body.scores);
    const inspectionDate = String(body.inspectionDate || "").slice(0, 10);
    const inspectionMonth = inspectionDate ? inspectionDate.slice(0, 7) : String(body.inspectionMonth || "").slice(0, 7);

    if (!inspectionMonth || !inspectionDate || !body.inspectorName) {
      return sendJson(res, 400, { error: "กรุณากรอกเดือน วันที่ตรวจ และผู้ตรวจ" });
    }

    const evidence = await saveEvidenceFile(body.evidenceFile);
    const inspectionId = nextInspectionId(db, branch.code, inspectionMonth);
    const managerAck = body.managerAck || {};
    const managerSignaturePath = await saveSignatureFile(managerAck.signatureDataUrl, inspectionId);
    const inspection = {
      id: inspectionId,
      createdAt: new Date().toISOString(),
      branchCode: branch.code,
      departmentCode: department.code,
      inspectionMonth,
      inspectionDate,
      inspectorName: String(body.inspectorName).trim(),
      templateId: template.id,
      totalScore: calculatedScore.totalScore,
      maxScore: calculatedScore.maxScore,
      percent: calculatedScore.percent,
      status: calculatedScore.status,
      evidenceName: evidence?.evidenceName || "",
      evidencePath: evidence?.evidencePath || "",
      evidenceType: evidence?.evidenceType || "",
      executiveNote: String(body.executiveNote || "").trim(),
      managerAckName: String(managerAck.name || "").trim(),
      managerAckDate: String(managerAck.date || "").slice(0, 10),
      managerSignaturePath,
      scores: calculatedScore.normalizedScores,
    };

    db.inspections.push(inspection);
    await writeDb(db);
    return sendJson(res, 201, inspection);
  }

  return sendJson(res, 404, { error: "API not found" });
}

async function serveStatic(req, res, url) {
  let requestPath = decodeURIComponent(url.pathname);
  if (requestPath === "/") requestPath = "/index.html";
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  if (!fssync.existsSync(filePath)) {
    res.writeHead(404);
    return res.end("Not found");
  }
  const data = await fs.readFile(filePath);
  res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Inspection MVP running at http://localhost:${PORT}`);
});
