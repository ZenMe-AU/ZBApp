/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Alert, CircularProgress, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { getMyProfileId } from "../api/profile";
import { useAuthState } from "../auth/AuthProvider";

const LAB_URL = "http://127.0.0.1:4178";

export function AgentLabJoin() {
  const { account } = useAuthState();
  const [status, setStatus] = useState<"idle" | "joining" | "joined" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    let joined = false;
    let profileId = "";
    const check = async () => {
      try {
        if (!active || joined) return;
        joined = true;
        setStatus("joining");
        profileId ||= await getMyProfileId();
        localStorage.setItem("agentLabProfileId", profileId);
        const joinResponse = await fetch(`${LAB_URL}/api/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId, name: account?.name ?? "Human" }),
        });
        const result = await joinResponse.json();
        if (!joinResponse.ok) throw new Error(result.error ?? "Could not join the Agent Lab test");
        if (active) {
          setStatus("joined");
        }
      } catch (error) {
        joined = false;
        if (active) {
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "Could not join the Agent Lab test");
        }
      }
    };
    void check();
    const interval = window.setInterval(() => void check(), 2_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  if (status === "idle" || status === "joined") return null;
  return (
    <Alert severity={status === "error" ? "error" : "info"} sx={{ mb: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        {status === "joining" && <CircularProgress size={16} color="inherit" />}
        <Typography variant="body2">{message || "Joining the Agent Lab test…"}</Typography>
      </Stack>
    </Alert>
  );
}
