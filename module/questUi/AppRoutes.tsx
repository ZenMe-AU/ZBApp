/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */
// @ts-nocheck

import { Navigate, Outlet, useNavigate, useRoutes } from "react-router-dom";
import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { Button, Snackbar } from "@mui/material";
import { useAuthState } from "./auth/AuthProvider";
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

type FrameworkRouteModule = {
  default: (props: { loaderData?: unknown }) => JSX.Element;
  clientLoader?: (args: { params: Record<string, string | undefined> }) => Promise<unknown> | unknown;
};

function RouteModuleElement({ routeModule }: { routeModule: FrameworkRouteModule }) {
  const location = useLocation();
  const params = useParams();
  const routeKey = `${location.pathname}${location.search}`;
  const [loaderData, setLoaderData] = useState<unknown>(undefined);
  const [isLoading, setIsLoading] = useState(Boolean(routeModule.clientLoader));
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loadedRouteKey, setLoadedRouteKey] = useState<string | null>(null);
  const [errorRouteKey, setErrorRouteKey] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!routeModule.clientLoader) {
        setLoaderData(undefined);
        setLoadedRouteKey(routeKey);
        setErrorRouteKey(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setLoadError(null);
      setErrorRouteKey(null);
      setLoaderData(undefined);
      try {
        const nextData = await routeModule.clientLoader({ params });
        if (isMounted) {
          setLoaderData(nextData);
          setLoadedRouteKey(routeKey);
        }
      } catch (error) {
        if (isMounted) {
          setLoadError(error);
          setErrorRouteKey(routeKey);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [routeModule, routeKey]);

  if (isLoading || (routeModule.clientLoader && loadedRouteKey !== routeKey && errorRouteKey !== routeKey)) {
    return null;
  }

  if (loadError && errorRouteKey === routeKey) {
    return (
      <div role="alert" style={{ padding: 24, textAlign: "center" }}>
        Quest 5 Tier EG data could not be loaded. Please check the Q5 Tier EG API and try again.
      </div>
    );
  }

  const RouteComponent = routeModule.default;
  return <RouteComponent loaderData={loaderData} />;
}

function RequireAuth() {
  const { isAuthenticated, isAuthReady } = useAuthState();
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
  return <Outlet />;
}

export default function Quest5TierEgAppRoutes() {
  const routes = useRoutes([
    { path: "login", element: <Login /> },
    {
      element: <RequireAuth />,
      children: [
        { path: "/", element: <Navigate to="/quest5TierEg" replace /> },
        {
          path: "quest5TierEg",
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
        { path: "*", element: <Navigate to="/quest5TierEg" replace /> },
      ],
    },
  ]);
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuthState();
  const saved = (location.state as { saved?: boolean } | null)?.saved === true;

  return (
    <>
      {isAuthenticated ? (
        <Button onClick={logout} sx={{ position: "fixed", top: 8, right: 16, zIndex: 1300 }}>
          Sign out
        </Button>
      ) : null}
      {routes}
      <Snackbar
        open={saved}
        message="Saved Successfully"
        autoHideDuration={3000}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        onClose={() => navigate(location.pathname, { replace: true, state: null })}
      />
    </>
  );
}
