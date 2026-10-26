/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import jwt, { type SignOptions } from "jsonwebtoken";

const jwtSecret = process.env.AUTH_LOCAL_SECRET ?? "bb64c67554381aff324d26669540f591e02e3e993ce85c2d1ed2962e22411634";
const jwtSignOptions: SignOptions = {
  algorithm: "HS256",
  expiresIn: "10h",
};

export const generateToken = (payload: string | object | Buffer) => {
  return jwt.sign(payload, jwtSecret, jwtSignOptions);
};
