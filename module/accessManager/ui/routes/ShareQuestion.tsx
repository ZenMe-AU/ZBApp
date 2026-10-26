/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Helmet } from "react-helmet";
import { shareQuestion } from "../api/question";
import { getProfileList } from "@zenmechat/shared-ui/api/profile";
import type { Profile } from "../types/interfaces";
import { Container, Typography, Box, Button, IconButton, Alert, TextField } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Autocomplete from "@mui/material/Autocomplete";
import { logEvent, setOperationId } from "@zenmechat/shared-ui/monitor/telemetry";

function ShareQuestion() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [friends, setFriends] = useState<Profile[]>([]);
  const [selectedReceivers, setSelectedReceivers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFriends = async () => {
      try {
        const profiles = await getProfileList(); // Fetch profiles using API
        setFriends(profiles);
        if (!id) throw new Error("Question ID is undefined");
      } catch (err) {
        console.error("Error fetching profile list:", err);
        setError("Failed to fetch friends list.");
      } finally {
        setLoading(false);
      }
    };

    fetchFriends();
  }, [id]);

  const handleBackClick = () => {
    const correlationId = setOperationId();
    console.log("Correlation ID:", correlationId);
    logEvent("btnNavigateBackClick", {
      parentId: "BackButton",
    });

    navigate(-1);
  };

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || selectedReceivers.length === 0) {
      setError("Please fill in all fields.");
      return;
    }

    const correlationId = setOperationId();
    console.log("Correlation ID:", correlationId);
    try {
      setLoading(true);
      setError(null);

      // Call the shareQuestion API
      await shareQuestion(
        id,
        selectedReceivers.map(({ id }) => id)
      );
      //alert("Question shared successfully!");
      logEvent("bntSendShareQuestionClick", {
        parentId: "SubmitButton",
        questionId: id,
      });
    } catch (err) {
      setError("Failed to share the question. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
      navigate(`/accessManager/${id}/answer`); // Navigate back to the question detail
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <Container maxWidth="sm" sx={{ mt: 4 }}>
      <Helmet>
        <title>Shared Question</title>
      </Helmet>
      <Box display="flex" alignItems="center" mb={2}>
        <IconButton onClick={handleBackClick}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4">Share Question</Typography>
      </Box>

      {error && (
        <Box mb={2}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}

      <form onSubmit={handleShare}>
        <Box mb={3}>
          <Autocomplete
            multiple
            id="share-receivers"
            options={friends}
            getOptionLabel={(option) => `${option.id} - ${option.name}`}
            onChange={(_, newValue) => {
              setSelectedReceivers(newValue);
            }}
            renderInput={(params) => <TextField {...params} label="Select Friends" placeholder="Choose friends to share with" />}
            value={selectedReceivers}
            limitTags={3}
          />
        </Box>

        <Box display="flex" justifyContent="center">
          <Button type="submit" variant="contained" color="primary" disabled={loading}>
            {loading ? "Sharing..." : "Share"}
          </Button>
        </Box>
      </form>
    </Container>
  );
}

export default ShareQuestion;
