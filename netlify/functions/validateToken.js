// netlify/functions/validateToken.js
import jwt from "jsonwebtoken";
import crypto from "crypto";

export async function handler(event) {
  const authHeader = event.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    return { statusCode: 401, body: "Missing token" };
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const hwid = event.headers["x-hwid"];
    if (!hwid) {
      return { statusCode: 401, body: "Missing HWID" };
    }

    const hwidHash = crypto
      .createHash("sha256")
      .update(hwid)
      .digest("hex");

    if (!payload.free && payload.hwidHash !== hwidHash) {
      return { statusCode: 401, body: "HWID mismatch" };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        username: payload.username,
        free: payload.free,
        loginMessage: payload.loginMessage || ""
      })
    };
  } catch {
    return { statusCode: 401, body: "Invalid token" };
  }
}
