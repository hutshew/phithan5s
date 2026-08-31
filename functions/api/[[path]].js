const seed = {
  branches: [
    { code: "PB", name: "เพชรบุรีตัดใหม่" },
    { code: "RI", name: "รามอินทรา" },
    { code: "SS", name: "สุขสวัสดิ์" },
    { code: "SW", name: "สุรวงศ์" },
    { code: "TW", name: "ทวีวัฒนา" },
  ],
  users: [
    { username: "admin", password: "admin123", name: "ผู้ดูแลระบบ", role: "Admin" },
    { username: "inspector", password: "inspect123", name: "ผู้ตรวจ", role: "Inspector" },
    { username: "executive", password: "exec123", name: "ผู้บริหาร", role: "Executive" },
  ],
  departments: [
    { code: "PB-SERVICE", name: "บริการ PB", templateId: "TPL-PB-SERVICE" },
    { code: "PB-COM", name: "คอมพิวเตอร์", templateId: "TPL-PB-COM" },
    { code: "PB-CASH", name: "การเงิน-ตรวจสอบ", templateId: "TPL-PB-CASH" },
    { code: "RI-CASH", name: "การเงิน", templateId: "TPL-RI-CASH" },
    { code: "SS-CASH", name: "การเงิน", templateId: "TPL-SS-CASH" },
    { code: "SW-CASH", name: "การเงิน", templateId: "TPL-SW-CASH" },
    { code: "TW-CASH", name: "การเงิน", templateId: "TPL-TW-CASH" },
  ],
  templates: [],
  inspections: [],
};

const baseItems = [
  "โต๊ะ/เก้าอี้",
  "ตู้เก็บเอกสาร/การจัดเก็บเอกสาร",
  "เครื่องคอมพิวเตอร์/เครื่องปริ๊น/อุปกรณ์ต่อพ่วง",
  "ถังขยะ",
  "สภาพแวดล้อมโดยรวม",
];

seed.templates = seed.departments.map((department) => ({
  id: department.templateId,
  name: `แบบตรวจ${department.name}`,
  departmentCode: department.code,
  items: baseItems.map((title, index) => ({
    id: `${department.code}-${String(index + 1).padStart(3, "0")}`,
    itemNo: index + 1,
    category: "ทั่วไป",
    title,
    maxScore: 5,
    weight: 5,
  })),
}));

const db = globalThis.__phithan5sDb || structuredClone(seed);
const sessions = globalThis.__phithan5sSessions || new Map();
globalThis.__phithan5sDb = db;
globalThis.__phithan5sSessions = sessions;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function body(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function publicUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}

function sessionUser(request) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const username = sessions.get(token);
  const user = db.users.find((row) => row.username === username);
  return { token, user };
}

function requireLogin(request) {
  const { user } = sessionUser(request);
  if (!user) return [null, json({ error: "กรุณา login ก่อน" }, 401)];
  return [user, null];
}

function requireAdmin(request) {
  const [user, error] = requireLogin(request);
  if (error) return [null, error];
  if (user.role !== "Admin") return [null, json({ error: "ต้องใช้สิทธิ์ Admin" }, 403)];
  return [user, null];
}

function statusFromPercent(percent) {
  if (percent >= 80) return "ผ่าน";
  if (percent >= 70) return "ต้องแก้ไข";
  return "ความเสี่ยง";
}

function departmentGroupCode(departmentCode) {
  const parts = String(departmentCode || "").split("-");
  return parts.length > 1 ? parts.slice(1).join("-") : String(departmentCode || "");
}

function reportMonthForInspection(inspection) {
  return String(inspection.inspectionDate || inspection.inspectionMonth || "").slice(0, 7);
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
    const maxScore = Number(scoreRow.maxScore || 0);
    const weight = Number(scoreRow.weight || maxScore || 0);
    return sum + (maxScore ? (scoreRow.score / maxScore) * weight : 0);
  }, 0);
  const maxScore = normalizedScores.reduce((sum, item) => sum + Number(item.weight || item.maxScore || 0), 0);
  const percent = maxScore ? Math.round((totalScore / maxScore) * 100) : 0;

  return {
    totalScore: Math.round(totalScore * 10) / 10,
    maxScore: Math.round(maxScore * 10) / 10,
    percent,
    status: statusFromPercent(percent),
    normalizedScores,
  };
}

function withCalculatedScore(inspection) {
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

function templateSummary(template) {
  return {
    id: template.id,
    name: template.name,
    departmentCode: template.departmentCode,
    itemCount: template.items.length,
  };
}

function buildDashboard(month) {
  const inspections = db.inspections.map(withCalculatedScore).filter((row) => !month || row.inspectionMonth === month);
  const avg = inspections.length ? Math.round(inspections.reduce((sum, row) => sum + row.percent, 0) / inspections.length) : 0;
  return {
    avg,
    passed: inspections.filter((row) => row.percent >= 80).length,
    fix: inspections.filter((row) => row.percent >= 70 && row.percent < 80).length,
    risk: inspections.filter((row) => row.percent < 70).length,
    branchSummary: db.branches.map((branch) => {
      const rows = inspections.filter((row) => row.branchCode === branch.code);
      return {
        branchCode: branch.code,
        branchName: branch.name,
        avgPercent: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.percent, 0) / rows.length) : 0,
      };
    }),
    history: inspections.slice(-8).reverse(),
  };
}

function nextInspectionId(branchCode, month) {
  const yearMonth = month.replace("-", "");
  const count = db.inspections.filter((row) => row.branchCode === branchCode && row.inspectionMonth === month).length + 1;
  return `R-${yearMonth}-${branchCode}-${String(count).padStart(3, "0")}`;
}

function routePath(context) {
  const parts = context.params.path;
  return Array.isArray(parts) ? parts.join("/") : String(parts || "");
}

export async function onRequest({ request, params }) {
  const url = new URL(request.url);
  const method = request.method;
  const path = Array.isArray(params.path) ? params.path.join("/") : String(params.path || "");

  if (method === "POST" && path === "login") {
    const input = await body(request);
    const user = db.users.find((row) => row.username === input.username && row.password === input.password);
    if (!user) return json({ error: "username หรือ password ไม่ถูกต้อง" }, 401);
    const token = crypto.randomUUID();
    sessions.set(token, user.username);
    return json({ token, user: publicUser(user) });
  }

  if (method === "POST" && path === "logout") {
    const { token } = sessionUser(request);
    if (token) sessions.delete(token);
    return json({ success: true });
  }

  if (method === "GET" && path === "me") {
    return json({ user: publicUser(sessionUser(request).user) });
  }

  if (method === "GET" && path === "bootstrap") {
    const [, error] = requireLogin(request);
    if (error) return error;
    return json({
      branches: db.branches,
      departments: db.departments,
      templates: db.templates.map(templateSummary),
    });
  }

  if (method === "GET" && path === "dashboard") {
    const [, error] = requireLogin(request);
    if (error) return error;
    return json(buildDashboard(url.searchParams.get("month")));
  }

  if (method === "GET" && path === "users") {
    const [, error] = requireAdmin(request);
    if (error) return error;
    return json(db.users.map(publicUser));
  }

  if (method === "POST" && path === "users") {
    const [, error] = requireAdmin(request);
    if (error) return error;
    const input = await body(request);
    const username = String(input.username || "").trim();
    if (!username || !input.password || !input.name) return json({ error: "กรุณากรอกข้อมูล user ให้ครบ" }, 400);
    if (db.users.some((row) => row.username === username)) return json({ error: "username นี้มีอยู่แล้ว" }, 409);
    const user = { username, password: String(input.password), name: String(input.name), role: String(input.role || "Inspector") };
    db.users.push(user);
    return json(publicUser(user), 201);
  }

  if (method === "PUT" && path.startsWith("users/")) {
    const [, error] = requireAdmin(request);
    if (error) return error;
    const username = decodeURIComponent(path.slice("users/".length));
    const user = db.users.find((row) => row.username === username);
    if (!user) return json({ error: "ไม่พบ user" }, 404);
    const input = await body(request);
    user.name = String(input.name || user.name);
    user.role = String(input.role || user.role);
    if (input.password) user.password = String(input.password);
    return json(publicUser(user));
  }

  if (method === "DELETE" && path.startsWith("users/")) {
    const [, error] = requireAdmin(request);
    if (error) return error;
    const username = decodeURIComponent(path.slice("users/".length));
    if (username === "admin") return json({ error: "ไม่สามารถลบ admin หลักได้" }, 400);
    db.users = db.users.filter((row) => row.username !== username);
    return json({ success: true });
  }

  if (method === "POST" && path === "branches") {
    const [, error] = requireAdmin(request);
    if (error) return error;
    const input = await body(request);
    const code = String(input.code || "").trim().toUpperCase();
    if (!code || !input.name) return json({ error: "กรุณากรอกรหัสและชื่อสาขา" }, 400);
    if (db.branches.some((row) => row.code === code)) return json({ error: "รหัสสาขานี้มีอยู่แล้ว" }, 409);
    const branch = { code, name: String(input.name).trim() };
    db.branches.push(branch);
    return json(branch, 201);
  }

  if (method === "PUT" && path.startsWith("branches/")) {
    const [, error] = requireAdmin(request);
    if (error) return error;
    const code = decodeURIComponent(path.slice("branches/".length));
    const branch = db.branches.find((row) => row.code === code);
    if (!branch) return json({ error: "ไม่พบสาขา" }, 404);
    branch.name = String((await body(request)).name || branch.name).trim();
    return json(branch);
  }

  if (method === "DELETE" && path.startsWith("branches/")) {
    const [, error] = requireAdmin(request);
    if (error) return error;
    const code = decodeURIComponent(path.slice("branches/".length));
    if (db.inspections.some((row) => row.branchCode === code)) return json({ error: "มีประวัติตรวจของสาขานี้อยู่ ไม่สามารถลบได้" }, 409);
    db.branches = db.branches.filter((row) => row.code !== code);
    return json({ success: true });
  }

  if (method === "POST" && path === "departments") {
    const [, error] = requireAdmin(request);
    if (error) return error;
    const input = await body(request);
    const code = String(input.code || "").trim().toUpperCase();
    if (!code || !input.name) return json({ error: "กรุณากรอกรหัสและชื่อแผนก" }, 400);
    if (db.departments.some((row) => row.code === code)) return json({ error: "รหัสแผนกนี้มีอยู่แล้ว" }, 409);
    const department = { code, name: String(input.name).trim(), templateId: `TPL-${code}` };
    db.departments.push(department);
    db.templates.push({
      id: department.templateId,
      name: `แบบตรวจ${department.name}`,
      departmentCode: code,
      items: [{ id: `${code}-001`, itemNo: 1, category: "ทั่วไป", title: "หัวข้อตรวจใหม่", maxScore: 5, weight: 5 }],
    });
    return json(department, 201);
  }

  if (method === "PUT" && path.startsWith("departments/")) {
    const [, error] = requireAdmin(request);
    if (error) return error;
    const code = decodeURIComponent(path.slice("departments/".length));
    const department = db.departments.find((row) => row.code === code);
    if (!department) return json({ error: "ไม่พบแผนก" }, 404);
    department.name = String((await body(request)).name || department.name).trim();
    return json(department);
  }

  if (method === "DELETE" && path.startsWith("departments/")) {
    const [, error] = requireAdmin(request);
    if (error) return error;
    const code = decodeURIComponent(path.slice("departments/".length));
    if (db.inspections.some((row) => row.departmentCode === code)) return json({ error: "มีประวัติตรวจของแผนกนี้อยู่ ไม่สามารถลบได้" }, 409);
    db.departments = db.departments.filter((row) => row.code !== code);
    db.templates = db.templates.filter((row) => row.departmentCode !== code);
    return json({ success: true });
  }

  if (method === "GET" && path.startsWith("templates/")) {
    const [, error] = requireLogin(request);
    if (error) return error;
    const id = decodeURIComponent(path.slice("templates/".length));
    const template = db.templates.find((row) => row.id === id);
    return template ? json(template) : json({ error: "ไม่พบ Template" }, 404);
  }

  if (method === "PUT" && path.startsWith("templates/")) {
    const [, error] = requireAdmin(request);
    if (error) return error;
    const id = decodeURIComponent(path.slice("templates/".length));
    const template = db.templates.find((row) => row.id === id);
    if (!template) return json({ error: "ไม่พบ Template" }, 404);
    const input = await body(request);
    template.name = String(input.name || template.name).trim();
    template.items = (Array.isArray(input.items) ? input.items : []).map((item, index) => ({
      id: item.id || `${template.departmentCode}-${Date.now()}-${index}`,
      itemNo: index + 1,
      category: "ทั่วไป",
      title: String(item.title || "หัวข้อตรวจ").trim(),
      maxScore: Math.max(1, Math.min(5, Number(item.maxScore || 5))),
      weight: Math.max(1, Number(item.weight || 5)),
    }));
    return json(template);
  }

  if (method === "GET" && path === "inspections") {
    const [, error] = requireLogin(request);
    if (error) return error;
    const branch = url.searchParams.get("branch");
    const month = url.searchParams.get("month");
    const year = url.searchParams.get("year");
    const rows = db.inspections
      .map(withCalculatedScore)
      .filter((row) => !branch || row.branchCode === branch)
      .filter((row) => !month || reportMonthForInspection(row) === month)
      .filter((row) => !year || reportMonthForInspection(row).startsWith(`${year}-`))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json(rows);
  }

  if (method === "GET" && path.startsWith("inspections/")) {
    const [, error] = requireLogin(request);
    if (error) return error;
    const id = decodeURIComponent(path.slice("inspections/".length));
    const inspection = db.inspections.map(withCalculatedScore).find((row) => row.id === id);
    return inspection ? json(inspection) : json({ error: "ไม่พบข้อมูลตรวจ" }, 404);
  }

  if (method === "DELETE" && path.startsWith("inspections/")) {
    const [, error] = requireAdmin(request);
    if (error) return error;
    const id = decodeURIComponent(path.slice("inspections/".length));
    db.inspections = db.inspections.filter((row) => row.id !== id);
    return json({ success: true });
  }

  if (method === "POST" && path === "inspections") {
    const [user, error] = requireLogin(request);
    if (error) return error;
    const input = await body(request);
    const branch = db.branches.find((row) => row.code === input.branchCode);
    const department = db.departments.find((row) => row.code === input.departmentCode);
    const template = db.templates.find((row) => row.id === input.templateId);
    if (!branch || !department || !template) return json({ error: "ข้อมูลสาขา แผนก หรือ Template ไม่ถูกต้อง" }, 400);
    const inspectionDate = String(input.inspectionDate || "").slice(0, 10);
    const inspectionMonth = inspectionDate ? inspectionDate.slice(0, 7) : String(input.inspectionMonth || "").slice(0, 7);
    if (!inspectionDate || !input.inspectorName) return json({ error: "กรุณากรอกวันที่ตรวจ และผู้ตรวจ" }, 400);
    const managerAck = input.managerAck || {};
    if (!managerAck.signatureDataUrl) return json({ error: "กรุณาให้ ผจก. เซ็นรับทราบก่อนบันทึก" }, 400);
    const calculated = calculateWeightedScore(template, input.scores);
    const id = nextInspectionId(branch.code, inspectionMonth);
    const inspection = {
      id,
      createdAt: new Date().toISOString(),
      branchCode: branch.code,
      departmentCode: department.code,
      inspectionMonth,
      inspectionDate,
      inspectorName: String(input.inspectorName || user.name).trim(),
      templateId: template.id,
      totalScore: calculated.totalScore,
      maxScore: calculated.maxScore,
      percent: calculated.percent,
      status: calculated.status,
      evidenceName: "",
      evidencePath: "",
      evidenceType: "",
      executiveNote: String(input.executiveNote || "").trim(),
      managerAckName: String(managerAck.name || "").trim(),
      managerAckDate: String(managerAck.date || "").slice(0, 10),
      managerSignaturePath: managerAck.signatureDataUrl,
      scores: calculated.normalizedScores,
    };
    db.inspections.push(inspection);
    return json(inspection, 201);
  }

  if (method === "GET" && path === "annual-summary") {
    const [, error] = requireLogin(request);
    if (error) return error;
    const departmentCode = url.searchParams.get("departmentCode");
    const selectedGroup = departmentGroupCode(departmentCode).toUpperCase();
    const year = url.searchParams.get("year") || new Date().getFullYear().toString();
    const rows = db.inspections
      .map(withCalculatedScore)
      .filter((row) => !departmentCode || departmentGroupCode(row.departmentCode).toUpperCase() === selectedGroup)
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
    const branchRows = db.branches.map((branch) => {
      const values = months.map(({ month }) => {
        const found = rows.filter((row) => row.branchCode === branch.code && reportMonthForInspection(row) === month);
        return found.length ? Math.round(found.reduce((sum, row) => sum + row.percent, 0) / found.length) : 0;
      });
      return { branchCode: branch.code, branchName: branch.name, values };
    });
    return json({ departmentCode, year, months, branchRows });
  }

  return json({ error: "API not found" }, 404);
}
