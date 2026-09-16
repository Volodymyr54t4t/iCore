import jwt from "jsonwebtoken";

export function requireAdmin(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: "Потрібна авторизація" });
  }

  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET || "icore-dev-secret-change-in-production");
    return next();
  } catch {
    return res.status(401).json({ error: "Сесію завершено" });
  }
}
