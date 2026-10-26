/**
 * @license SPDX-FileCopyrightText: © 2025 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { appInsights } from "./applicationInsights";
import _ from "lodash";

export const logPageView = (name: string, properties?: Record<string, any>) => {
  const operationId = appInsights.context.telemetryTrace.traceID;
  const correlationId = operationId;
  name = _.camelCase(document.title) || "pageView:" + name;
  appInsights.trackPageView({
    name: "page" + _.upperFirst(name) + "View",
    uri: window.location.pathname,
    properties: {
      appSource: "frontend",
      correlationId: correlationId,
      ...properties,
    },
  });
  console.log("Logging page view:", name, properties, operationId);
};

export const logEvent = (eventName: string, properties?: Record<string, any>) => {
  const actionType = "click";
  const parentId = "UnknownParent";
  const pageName = document.title || window.location.pathname;
  const userId = appInsights.context.user.id || "anonymous";
  const operationId = appInsights.context.telemetryTrace.traceID;
  const sessionId = appInsights.context?.sessionManager?.automaticSession?.id;
  const correlationId = operationId;

  appInsights.trackEvent({
    name: eventName,
    properties: {
      pageName,
      parentId,
      actionType,
      user_Id: userId,
      session_Id: sessionId,
      operation_Id: operationId,
      correlationId: correlationId,
      appSource: "frontend",
      ...properties,
    },
  });
};

export const setUserContext = (userId: string) => {
  appInsights.setAuthenticatedUserContext(userId);
};

export const clearUserContext = () => {
  appInsights.clearAuthenticatedUserContext();
};

export function setOperationId(operationId?: string): string {
  const traceId = operationId || crypto.randomUUID().replace(/-/g, "");
  appInsights.context.telemetryTrace.traceID = traceId;
  appInsights.addTelemetryInitializer((envelope) => {
    envelope.tags = envelope.tags || {};
    envelope.tags["ai.operation.id"] = traceId;
    envelope.tags["ai.operation.parentId"] = traceId;
  });
  return traceId;
}

export function getOperationId(): string | undefined {
  return appInsights.context.telemetryTrace?.traceID;
}
