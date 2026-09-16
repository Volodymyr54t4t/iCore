import jwt from "jsonwebtoken";

export function jwtSecret() {
  return process.env.JWT_SECRET || "icore-dev-secret-change-in-production";
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };
}

export function readCustomer(req) {
  const token = req.cookies?.customer_token;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, jwtSecret());
    if (payload.role !== "customer") return null;
    return payload;
  } catch {
    return null;
  }
}

export function requireCustomer(req, res, next) {
  const customer = readCustomer(req);
  if (!customer) {
    return res.status(401).json({ error: "Увійдіть у кабінет" });
  }
  req.customer = customer;
  return next();
}

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
