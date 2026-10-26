/**
 * @license SPDX-FileCopyrightText: © 2025 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Helmet } from "react-helmet";
import { Link } from "react-router";
import { getQuestionsByUser } from "../api/question";
import { Alert, Chip, Container, Typography, List, ListItem, ListItemButton, ListItemText, Button, Box, Divider, Tooltip } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import ShareIcon from "@mui/icons-material/Share";
import CreateOutlinedIcon from "@mui/icons-material/CreateOutlined";
import type { Question } from "../types/interfaces";
import { logEvent, setOperationId } from "@zenmechat/shared-ui/monitor/telemetry";
import { Suspense } from "react";
import { Await } from "react-router";
import { Skeleton } from "@mui/material";

export async function clientLoader() {
  return { questions: getQuestionsByUser() };
}

export default function QuestionCombinationList({ loaderData }: { loaderData: any }) {
  const { questions } = loaderData;
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
    <Container maxWidth="md" sx={{ mt: 4 }}>
      <Helmet>
        <title>Question List</title>
      </Helmet>
      <Typography variant="h4" gutterBottom>
        Question List
      </Typography>
      <Suspense fallback={<QuestionListSkeleton />}>
        <Await
          resolve={questions}
          errorElement={
            <Alert severity="error" sx={{ mt: 2 }}>
              Quest 3 data could not be loaded. Please sign in again and make sure the local Quest 3 API is running.
            </Alert>
          }
        >
          {(resolvedQuestions: Question[]) => {
            const visibleQuestions = resolvedQuestions;
            return (
              <>
                <Box display="flex" justifyContent="flex-end" mb={2}>
                  <Button variant="outlined" component={Link} to="/quest3Tier/friends">
                    Manage friends
                  </Button>
                </Box>
                <List>
                  {visibleQuestions.map((q: Question, index: number) => {
                    const isOwner = q.isOwner === true;
                    return (
                      <div key={q.id}>
                        <ListItem disablePadding>
                          <ListItemButton component={Link} to={`/quest3Tier/${q.id}/answer`} onClick={() => handleOpenAnswer(q.id)}>
                            <ListItemText
                              primary={
                                <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                                  <Typography component="span">{q.title}</Typography>
                                  {q.latestAnswer && <Chip label="Answered" size="small" color="success" variant="outlined" />}
                                  {isOwner && (
                                    <Tooltip title="Created by you">
                                      <CreateOutlinedIcon aria-label="Created by you" fontSize="small" color="primary" />
                                    </Tooltip>
                                  )}
                                </Box>
                              }
                            />
                            <Box display="flex" gap={1} ml={2}>
                              <Button
                                variant="outlined"
                                size="small"
                                startIcon={<EditIcon />}
                                component={Link}
                                to={`/quest3Tier/${q.id}` + (!isOwner ? "/add" : "")}
                                onClick={() => handleEditQuestion(q.id, !isOwner)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="outlined"
                                size="small"
                                startIcon={<ShareIcon />}
                                component={Link}
                                to={`/quest3Tier/${q.id}/share`}
                                onClick={() => handleShareQuestion(q.id)}
                              >
                                Share
                              </Button>
                            </Box>
                          </ListItemButton>
                        </ListItem>
                        {index < visibleQuestions.length - 1 && <Divider sx={{ bgcolor: "grey.800" }} />}
                      </div>
                    );
                  })}
                </List>
              </>
            );
          }}
        </Await>
      </Suspense>
      <Box mt={4} display="flex" justifyContent="space-between">
        <Button variant="contained" color="primary" component={Link} to="/quest3Tier/add" onClick={() => handleAddQuestion}>
          + Add Question
        </Button>
      </Box>
    </Container>
  );
}

function QuestionListSkeleton() {
  return (
    <List>
      {Array.from({ length: 3 }).map((_, i) => (
        <Box key={i} mb={2}>
          {/* <Skeleton variant="text" width="60%" height={32} /> */}
          <Skeleton variant="rectangular" height={40} />
        </Box>
      ))}
    </List>
  );
}
