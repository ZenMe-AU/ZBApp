/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import jwt from "jsonwebtoken";
import * as authEntraID from "./authEntraID.mjs";

const jwtSecret = process.env.AUTH_LOCAL_SECRET;
const jwtSignOptions = {
  algorithm: "HS256",
  expiresIn: "10h",
};

const generateToken = (payload) => {
  return jwt.sign(payload, jwtSecret, jwtSignOptions);
};

const decode = async (token) => {
  const algorithm = jwt.decode(token, { complete: true })?.header?.alg;

  if (algorithm === "RS256") {
    return authEntraID.decode(token);
  }

  try {
    return jwt.verify(token, jwtSecret, { algorithms: [jwtSignOptions.algorithm] });
  } catch (error) {
    console.log("JWT verification failed:", error.message);
    const err = Object.assign(new Error("Invalid or expired token"), {
  status: 401,
});
throw err;
  }
};

export { generateToken, decode };