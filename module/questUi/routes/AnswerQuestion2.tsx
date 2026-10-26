/**
 * @license SPDX-FileCopyrightText: © 2025 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState } from "react";
import { Link, useLoaderData, useNavigate, Form, redirect, useNavigation } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { getQuestionById, getAnswerListByQuestionId, submitAnswer } from "../api/question";
import {
  Container,
  Typography,
  Box,
  Button,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  TextField,
  IconButton,
  List,
  ListItem,
  ListItemText,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import WordCloud from "react-d3-cloud";
import { logEvent, setOperationId } from "../monitor/telemetry";

export async function clientLoader({ params }: LoaderFunctionArgs) {
  const { id } = params;
  const profileId = localStorage.getItem("profileId");
  if (!id) throw new Response("Question ID required", { status: 400 });

  const question = await getQuestionById(id);
  const answers = await getAnswerListByQuestionId(id);
  return { question, answers, profileId };
}

export async function clientAction({ request, params }: ActionFunctionArgs) {
  const { id } = params;
  if (!id) throw new Response("Question ID required", { status: 400 });

  const formData = await request.formData();
  const selectedOption = formData.get("option");
  const textAnswer = formData.get("textAnswer");

  const payload = {
    option: typeof selectedOption === "string" ? selectedOption : null,
    answerText: typeof textAnswer === "string" ? textAnswer : null,
    answerDuration: parseInt(formData.get("duration") as string, 10),
  };

  await submitAnswer(id, payload, formData.get("questionText") as string);

  logEvent("btnAnswerQuestionClick", {
    parentId: "SubmitButton",
    questionId: id,
    questionText: formData.get("questionText"),
    ...payload,
  });

  return null;
}

export default function AnswerQuestion2({ loaderData }: { loaderData: any }) {
  const navigate = useNavigate();
  const navigation = useNavigation();
  const { question, answers, profileId } = loaderData;
  const isOption = question.option?.length > 0;

  const handleBackClick = () => {
    const correlationId = setOperationId();
    logEvent("btnNavigateBackClick", { parentId: "BackButton" });
    navigate(-1);
  };

  const pieChartData = isOption
    ? (() => {
        const optionCount = answers.reduce((acc: Record<string, number>, item: any) => {
          if (item.optionId) {
            acc[item.optionId] = (acc[item.optionId] || 0) + 1;
          }
          return acc;
        }, {});

        const total = answers.length;
        return Object.entries(optionCount).map(([name, value]) => ({
          name,
          value: value as number,
          percentage: (((value as number) / total) * 100).toFixed(2),
        }));
      })()
    : [];

  const pieChartColors = pieChartData.map((_, index) => `hsl(${(index * 360) / pieChartData.length}, 50%, 60%)`);

  const wordCloudData = !isOption
    ? (() => {
        const words = answers
          .flatMap((ans: any) => ans.answerText?.toLowerCase().match(/\b[\w\d]+\b/g) || [])
          .reduce((acc: Record<string, number>, word: string) => {
            acc[word] = (acc[word] || 0) + 1;
            return acc;
          }, {});
        return Object.entries(words).map(([text, value]) => ({ text, value: (value as number) * 100 }));
      })()
    : [];

  return (
    <Container maxWidth="md" sx={{ mt: 4 }}>
      <Box display="flex" alignItems="center" mb={2}>
        <IconButton onClick={handleBackClick}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4">{question.title}</Typography>
      </Box>
      <Typography variant="body1" paragraph>
        {question.questionText}
      </Typography>

      <Form method="post">
        <input type="hidden" name="questionText" value={question.questionText} />
        <input type="hidden" name="duration" value={1000} />

        {isOption ? (
          <FormControl component="fieldset" sx={{ mb: 2 }}>
            <FormLabel component="legend">Choose your answer</FormLabel>
            <RadioGroup name="option">
              {question.option.map((option: string, index: number) => (
                <FormControlLabel key={index} value={option} control={<Radio />} label={option} />
              ))}
            </RadioGroup>
          </FormControl>
        ) : (
          <TextField name="textAnswer" label="Your Answer" multiline rows={4} fullWidth placeholder="Type your answer here" sx={{ mb: 2 }} />
        )}

        <Box display="flex" justifyContent="center" gap={2}>
          <Button type="submit" variant="contained" color="primary" disabled={navigation.state === "submitting"}>
            {navigation.state === "submitting" ? "Submitting..." : "Submit Answer"}
          </Button>
          {isOption && (
            <Button type="button" variant="outlined" color="secondary" onClick={() => navigate(`/quest5TierEg/${question.id}/followUp`)}>
              Follow Up
            </Button>
          )}
        </Box>
      </Form>

      {answers.length > 0 && (
        <Box mt={3}>
          <Typography variant="h6">Answers Received:</Typography>
          {isOption ? (
            <PieChart width={400} height={400}>
              <Pie data={pieChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}>
                {pieChartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={pieChartColors[index]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          ) : (
            <WordCloud data={wordCloudData} fontSize={(word) => word.value / 20} rotate={0} />
          )}
        </Box>
      )}

      {!isOption && answers.length > 0 && (
        <List>
          {answers.map((answer: any) => (
            <ListItem key={answer.id} disablePadding>
              <ListItemText primary={answer.answerText || answer.optionId} />
            </ListItem>
          ))}
        </List>
      )}
    </Container>
  );
}
