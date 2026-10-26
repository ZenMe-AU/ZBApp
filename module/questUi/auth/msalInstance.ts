/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { PublicClientApplication } from "@azure/msal-browser";

const clientId = "87aa3687-66a4-4fab-bf59-70de6bf768fa";
const tenantId = "15fb0613-7977-4551-801b-6aadac824241";

export const appScopes = [`api://${clientId}/access_as_user`];

export const msalInstance = new PublicClientApplication({
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  },
});
