import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

const JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY!;
type AuthenticatedRequest = Request & { userId?: string };

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, JWT_PUBLIC_KEY) as jwt.JwtPayload;
    if (!decoded?.sub) return res.status(401).json({ error: "Unauthorized" });
    req.userId = decoded.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}
