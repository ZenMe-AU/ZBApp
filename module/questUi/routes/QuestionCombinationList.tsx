/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Helmet } from "react-helmet";
import { Link } from "react-router";
import { useState } from "react";
import { getAnswerListByQuestionId, getQuestionsByUser } from "../api/question";
import { Container, Typography, List, ListItem, ListItemButton, ListItemText, Button, Box, Divider, Chip, Checkbox, FormControlLabel } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import ShareIcon from "@mui/icons-material/Share";
import type { Question } from "../types/interfaces";
import { logEvent, setOperationId } from "../monitor/telemetry";

export async function clientLoader() {
  try {
    const profileId = localStorage.getItem("profileId");
    const questions: Question[] = await getQuestionsByUser();
    const questionsWithStatus = await Promise.all(
      questions.map(async (question) => {
        const answers = await getAnswerListByQuestionId(question.id);
        return { ...question, isAnswered: answers.some((answer: { profileId: string | null }) => answer.profileId === profileId) };
      })
    );
    return { questions: questionsWithStatus, profileId };
  } catch (error) {
    console.error("Error fetching question:", error);
    throw error;
  }
}

export default function QuestionCombinationList({ loaderData }: { loaderData: unknown }) {
  const { questions, profileId } = loaderData;
  const [statusFilter, setStatusFilter] = useState({ answered: true, unanswered: true });
  const visibleQuestions = questions.filter((question: Question & { isAnswered: boolean }) =>
    question.isAnswered ? statusFilter.answered : statusFilter.unanswered
  );
  const answeredCount = questions.filter((question: Question & { isAnswered: boolean }) => question.isAnswered).length;
  const allSelected = statusFilter.answered && statusFilter.unanswered;
  const handleOpenAnswer = (questionId: string) => {
    const correlationId = setOperationId();
    logEvent("btnAnswerDetailClick", {
      questionId,
      parentId: "QuestionList",
    });
  };
  const handleEditQuestion = (questionId: string, isNew: boolean) => (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const correlationId = setOperationId();
    logEvent(isNew ? "bntAddQuestionClick" : "btnEditQuestionClick", {
      questionId,
      parentId: "QuestionList",
    });
  };
  const handleShareQuestion = (questionId: string) => (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const correlationId = setOperationId();
    logEvent("btnShareQuestionClick", {
      questionId,
      parentId: "QuestionList",
    });
  };
  const handleAddQuestion = () => {
    const correlationId = setOperationId();
    logEvent("btnAddQuestionClick", {
      parentId: "ActionButton",
    });
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, position: "relative" }}>
      <Helmet>
        <title>Question List</title>
      </Helmet>
      <Box
        role="group"
        aria-label="Filter questions by answer status"
        sx={{
          position: { xs: "static", lg: "absolute" },
          left: { lg: -176 },
          top: 0,
          display: "flex",
          flexDirection: { xs: "row", lg: "column" },
          flexWrap: "wrap",
        }}
      >
        <FormControlLabel
          label={`All (${questions.length})`}
          control={<Checkbox size="small" checked={allSelected} onChange={(event) => setStatusFilter({ answered: event.target.checked, unanswered: event.target.checked })} />}
        />
        <FormControlLabel
          label={`Answered (${answeredCount})`}
          control={<Checkbox size="small" checked={statusFilter.answered && !statusFilter.unanswered} onChange={() => setStatusFilter({ answered: true, unanswered: false })} />}
        />
        <FormControlLabel
          label={`Unanswered (${questions.length - answeredCount})`}
          control={<Checkbox size="small" checked={!statusFilter.answered && statusFilter.unanswered} onChange={() => setStatusFilter({ answered: false, unanswered: true })} />}
        />
      </Box>
      <Typography variant="h4" gutterBottom>
        Question List
      </Typography>
      <List>
        {visibleQuestions.map((q: Question & { isAnswered: boolean }, index: number) => (
          <div key={q.id}>
            <ListItem disablePadding>
              <ListItemButton component={Link} to={`/quest5TierEg/${q.id}/answer`} onClick={() => handleOpenAnswer(q.id)}>
                <ListItemText
                  primary={
                    <Box display="flex" alignItems="center" gap={1}>
                      <span>{q.title}</span>
                      {q.isAnswered ? <Chip label="Answered" size="small" sx={{ height: 22, bgcolor: "action.hover", color: "text.secondary" }} /> : null}
                    </Box>
                  }
                />
                <Box display="flex" gap={1} ml={2}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<EditIcon />}
                    component={Link}
                    to={`/quest5TierEg/${q.id}` + (q.profileId !== profileId ? "/add" : "")}
                    onClick={() => handleEditQuestion(q.id, q.profileId !== profileId)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<ShareIcon />}
                    component={Link}
                    to={`/quest5TierEg/${q.id}/share`}
                    onClick={() => handleShareQuestion(q.id)}
                  >
                    Share
                  </Button>
                </Box>
              </ListItemButton>
            </ListItem>
            {index < questions.length - 1 && <Divider sx={{ bgcolor: "grey.800" }} />}
          </div>
        ))}
      </List>
      <Box mt={4} display="flex" justifyContent="space-between">
        <Button variant="contained" color="primary" component={Link} to="/quest5TierEg/add" onClick={() => handleAddQuestion}>
          + Add Question
        </Button>
      </Box>
    </Container>
  );
}
