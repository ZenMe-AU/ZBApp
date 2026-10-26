/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */
// @ts-nocheck

import { Navigate, Outlet, useRoutes } from "react-router-dom";
import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useAuthState } from "./auth/AuthProvider";
import { Button } from "@mui/material";
import * as AddQuestionModule from "./routes/AddQuestion";
import * as AnswerQuestionModule from "./routes/AnswerQuestion";
import * as EditQuestionModule from "./routes/EditQuestion";
import * as FollowUpQuestionModule from "./routes/FollowUpQuestion";
import * as QuestionCombinationListModule from "./routes/QuestionCombinationList";
import * as QuestionDetailModule from "./routes/QuestionDetail";
import * as QuestionDetailAddModule from "./routes/QuestionDetailAdd";
import * as ShareQuestionModule from "./routes/ShareQuestion";
import ManageFriends from "./routes/ManageFriends";
import Login from "./routes/Login";
import { AgentLabJoin } from "./components/AgentLabJoin";

type FrameworkRouteModule = {
  default: (props: { loaderData?: unknown }) => JSX.Element;
  clientLoader?: (args: { params: Record<string, string | undefined> }) => Promise<unknown> | unknown;
};

function RouteModuleElement({ routeModule }: { routeModule: FrameworkRouteModule }) {
  const location = useLocation();
  const params = useParams();
  const [loaderData, setLoaderData] = useState<unknown>(undefined);
  const [isLoading, setIsLoading] = useState(Boolean(routeModule.clientLoader));

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!routeModule.clientLoader) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const nextData = await routeModule.clientLoader({ params });
      if (isMounted) {
        setLoaderData(nextData);
        setIsLoading(false);
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [routeModule, location.pathname, location.search, params]);

  if (isLoading) {
    return null;
  }

  const RouteComponent = routeModule.default;
  return <RouteComponent loaderData={loaderData} />;
}

function RequireAuth() {
  const { isAuthenticated, isAuthReady, logout } = useAuthState();
  const location = useLocation();

  if (!isAuthReady)
    return (
      <div role="status" aria-live="polite">
        Loading authentication…
      </div>
    );
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }
  return (
    <>
      <AgentLabJoin />
      <Button onClick={() => void logout()} variant="outlined" size="small" sx={{ position: "fixed", top: 12, right: 16, zIndex: 1200 }}>
        Log out
      </Button>
      <Outlet />
    </>
  );
}

export default function Quest3TierAppRoutes() {
  const routes = useRoutes([
    { path: "login", element: <Login /> },
    {
      element: <RequireAuth />,
      children: [
        { path: "/", element: <Navigate to="/quest3Tier" replace /> },
        {
          path: "quest3Tier",
          children: [
            { index: true, element: <RouteModuleElement routeModule={QuestionCombinationListModule} /> },
            { path: "add", element: <RouteModuleElement routeModule={AddQuestionModule} /> },
            { path: ":id", element: <RouteModuleElement routeModule={QuestionDetailModule} /> },
            { path: ":id/add", element: <RouteModuleElement routeModule={QuestionDetailAddModule} /> },
            { path: ":id/answer", element: <RouteModuleElement routeModule={AnswerQuestionModule} /> },
            { path: ":id/followUp", element: <RouteModuleElement routeModule={FollowUpQuestionModule} /> },
            { path: ":id/edit", element: <RouteModuleElement routeModule={EditQuestionModule} /> },
            { path: ":id/share", element: <RouteModuleElement routeModule={ShareQuestionModule} /> },
            { path: "friends", element: <ManageFriends /> },
          ],
        },
        { path: "*", element: <Navigate to="/quest3Tier" replace /> },
      ],
    },
  ]);

  return routes;
}
