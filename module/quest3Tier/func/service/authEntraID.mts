/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

const generateToken = (_payload) => {
  return "";
};

const CLIENT_ID = process.env.CLIENT_ID;
const TENANT_ID = process.env.TENANT_ID;

// Microsoft JWKS client
const msJwks = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 6 * 60 * 60 * 1000,
  timeout: 3000,
});

async function getSigningKey(kid) {
  return new Promise((resolve, reject) => {
    msJwks.getSigningKey(kid, (err, key) => {
      if (err) return reject(err);
      resolve(key.getPublicKey());
    });
  });
}
const decode = async (token) => {
  let verified;
  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded?.header?.kid) {
      throw new Error("The token is missing key id header (kid)");
    }
    const publicKey = await getSigningKey(decoded.header.kid);
    verified = jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
      issuer: `https://sts.windows.net/${TENANT_ID}/`,
      audience: `api://${CLIENT_ID}`,
    });
  } catch (error) {
    console.log("JWT verification failed:", error.message);
    throw Object.assign(new Error("Invalid or expired token"), { status: 401 });
  }
  if (!verified.scp?.split(" ").includes("access_as_user")) {
    throw Object.assign(new Error("Token is missing the access_as_user scope"), { status: 403 });
  }
  return verified;
};

export { generateToken, decode };
