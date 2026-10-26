/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import LoginIcon from "@mui/icons-material/Login";
import { Alert, Box, Button, Card, CardContent, CircularProgress, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthState } from "../auth/AuthProvider";

function safeReturnPath(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/login") ? value : "/quest5TierEg";
}

export default function Login() {
  const { isAuthenticated, isAuthReady, login } = useAuthState();
  const location = useLocation();
  const [error, setError] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const returnTo = safeReturnPath((location.state as { from?: unknown } | null)?.from ?? sessionStorage.getItem("postLoginRedirect"));

  useEffect(() => {
    if (isAuthenticated) {
      sessionStorage.removeItem("postLoginRedirect");
    } else {
      sessionStorage.setItem("postLoginRedirect", returnTo);
    }
  }, [isAuthenticated, returnTo]);

  if (!isAuthReady) {
    return (
      <Box role="status" aria-live="polite" sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress aria-label="Loading authentication" />
      </Box>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={returnTo} replace />;
  }

  const handleLogin = async () => {
    setError("");
    setIsSigningIn(true);
    try {
      await login();
    } catch (loginError) {
      console.error("Microsoft login failed", loginError);
      setError("Sign in failed. Please try again.");
      setIsSigningIn(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "grey.100", px: 2 }}>
      <Card sx={{ width: "100%", maxWidth: 400, borderRadius: 4, boxShadow: 12 }}>
        <CardContent sx={{ textAlign: "center", p: 4 }}>
          <Typography component="h1" variant="h5" fontWeight="bold" sx={{ mb: 1 }}>
            Quest 5 Tier EG
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Sign in to continue
          </Typography>
          {error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : null}
          <Button
            variant="contained"
            size="large"
            startIcon={isSigningIn ? <CircularProgress size={20} color="inherit" /> : <LoginIcon aria-hidden="true" />}
            disabled={isSigningIn}
            onClick={handleLogin}
            sx={{ width: "100%", minHeight: 48, textTransform: "none" }}
          >
            {isSigningIn ? "Redirecting…" : "Sign in with Microsoft"}
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
