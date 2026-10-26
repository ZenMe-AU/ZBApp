/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import { getQuestionById, submitAnswer, getAnswerListByQuestionId } from "../api/question";
import type { Question, Answer } from "../types/interfaces";
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
import { logEvent, setOperationId } from "@zenmechat/shared-ui/monitor/telemetry.ts";

function AnswerQuestion() {
  const profileId = localStorage.getItem("profileId");
  const { id } = useParams<{ id: string }>();
  const [question, setQuestion] = useState<Question | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [textAnswer, setTextAnswer] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);

  const [prevAns, setPrevAns] = useState<{
    optionId: string | null;
    answerText: string | null;
  } | null>(null);
  const [answerList, setAnswerList] = useState<Answer[]>([]);

  const [pieChartData, setPieChartData] = useState<{ name: string; value: number; percentage: string }[]>([]);
  const [pieChartColors, setPieChartColors] = useState<string[]>([]);
  const [wordCloudData, setWordCloudData] = useState<{ text: string; value: number }[]>([]);
  const [isOption, setIsOption] = useState<boolean>(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return;

    const fetchQuestion = async () => {
      try {
        setLoading(true);
        const fetchedQuestion = await getQuestionById(id);
        console.log(fetchedQuestion);
        if (fetchedQuestion.option === null) {
          setIsOption(false);
        }
        setQuestion(fetchedQuestion);
        setStartTime(performance.now());
      } catch (err) {
        console.error("Error fetching question:", err);
        setError("Failed to load the question.");
      } finally {
        setLoading(false);
      }
    };

    fetchQuestion();

    const fetchAnswers = async () => {
      try {
        const data = await getAnswerListByQuestionId(id);
        console.log(data);
        const answerList = data.reduce(
          (acc: { self: Answer[]; others: Answer[] }, q: Answer) => {
            if (q.profileId === profileId) {
              acc.self.push(q);
            } else {
              acc.others.push(q);
            }
            return acc;
          },
          { self: [], others: [] }
        );
        console.log(answerList);

        setAnswerList(answerList.others);
        if (answerList.self.length > 0) {
          setPrevAns(answerList.self[0]);
          setSelectedOption(answerList.self[0].optionId);
          setTextAnswer(answerList.self[0].answerText);
        }
      } catch (error) {
        console.error("Error fetching answers:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAnswers();
    console.log(answerList);
    console.log(prevAns);

    console.log(isOption);
  }, [id]);

  useEffect(() => {
    if (!answerList.length) return;

    if (!isOption) {
      const words = answerList
        .flatMap((ans) => ans.answerText?.toLowerCase().match(/\b[\w\d]+\b/g) || [])
        .reduce((acc: Record<string, number>, word: string) => {
          acc[word] = (acc[word] || 0) + 1;
          return acc;
        }, {});

      const wordCount = Object.entries(words).map(([text, value]) => ({
        text: text,
        value: value * 100,
      }));
      console.log(wordCount);
      setWordCloudData(wordCount);
    } else {
      const optionCount = answerList.reduce((acc: Record<string, number>, item: Answer) => {
        if (item.optionId) {
          acc[item.optionId] = (acc[item.optionId] || 0) + 1;
        }
        return acc;
      }, {});

      const total = answerList.length;
      const chartData = Object.entries(optionCount)
        .map(([option, count]) => ({
          name: option,
          value: count,
          percentage: ((count / total) * 100).toFixed(2),
        }))
        .sort((a, b) => a.value - b.value);

      const generatedColors = chartData.map((_, index) => {
        const hue = (index * 360) / chartData.length;
        return `hsl(${hue}, 50%, 60%)`;
      });
      console.log(chartData);
      console.log(generatedColors);
      setPieChartData(chartData);
      setPieChartColors(generatedColors);
    }
  }, [answerList]);

  const handleBackClick = () => {
    const correlationId = setOperationId();
    console.log("Correlation ID:", correlationId);
    logEvent("btnNavigateBackClick", {
      parentId: "BackButton",
    });

    navigate(-1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const correlationId = setOperationId();
    console.log("Correlation ID:", correlationId);
    if (!id || !question) {
      alert("Invalid question ID.");
      setSubmitting(false);
      return;
    }

    const endTime = performance.now();
    const answerDuration = Math.round(endTime - startTime);

    const answerPayload = {
      option: question?.option && question.option.length > 0 ? selectedOption : null,
      answerText: question?.option && question.option.length > 0 ? null : textAnswer,
      answerDuration,
    };

    if (!answerPayload.option && !answerPayload.answerText) {
      alert("Please provide an answer.");
      setSubmitting(false);
      return;
    }

    if (answerPayload.option === prevAns?.optionId && answerPayload.answerText === prevAns?.answerText) {
      console.log("nothing changed!");
      setSubmitting(false);
      return;
    }

    try {
      await submitAnswer(id, answerPayload, question.questionText);
      //alert("Answer submitted successfully!");
      setPrevAns((prev) => {
        if (!prev)
          return {
            optionId: answerPayload.option,
            answerText: answerPayload.answerText,
          };
        return {
          ...prev,
          optionId: answerPayload.option,
          answerText: answerPayload.answerText,
        };
      });
      // navigate(`/quest3TierCqrs/${id}`);
    } catch (err) {
      console.error("Error submitting answer:", err);
      alert("Failed to submit the answer.");
    } finally {
      logEvent("btnAnswerQuestionClick", {
        parentId: "SubmitButton",
        questionId: id,
        questionText: question.questionText,
        ...answerPayload,
      });
      setSubmitting(false);
      setStartTime(performance.now());
    }
  };
  const handleFollowUp = (questionId: string) => {
    const correlationId = setOperationId();
    console.log("Correlation ID:", correlationId);
    logEvent("btnFollowUpQuestionClick", {
      parentId: "ActionButton",
      questionId: questionId,
    });
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;
  if (!question) return <p>No question found.</p>;

  return (
    <Container maxWidth="md" sx={{ mt: 4 }}>
      <Helmet>
        <title>Answer Question</title>
      </Helmet>
      <Box display="flex" alignItems="center" mb={2}>
        <IconButton onClick={handleBackClick}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4">{question.title}</Typography>
      </Box>
      {/* <Typography variant="h5" gutterBottom>
        {question.title}
      </Typography> */}
      <Typography variant="body1" paragraph>
        {question.questionText}
      </Typography>

      <form onSubmit={handleSubmit}>
        {question.option && question.option.length > 0 ? (
          <FormControl component="fieldset" sx={{ mb: 2 }}>
            <FormLabel component="legend">choose your answer</FormLabel>
            <RadioGroup name="answer" value={selectedOption} onChange={(e) => setSelectedOption(e.target.value)}>
              {question.option.map((option, index) => (
                <FormControlLabel key={index} value={option} control={<Radio />} label={option} />
              ))}
            </RadioGroup>
          </FormControl>
        ) : (
          <TextField
            label="Your Answer"
            multiline
            rows={4}
            fullWidth
            value={textAnswer}
            onChange={(e) => setTextAnswer(e.target.value)}
            placeholder="Type your answer here"
            required
            sx={{ mb: 2 }}
          />
        )}
        <Box display="flex" justifyContent="center" gap={2}>
          <Button type="submit" variant="contained" color="primary" disabled={submitting}>
            {submitting ? "Submitting..." : "Submit Answer"}
          </Button>
          {isOption && (
            <Button
              type="button"
              variant="outlined"
              color="secondary"
              component={Link}
              to={`/quest3TierCqrs/${question.id}/followUp`}
              onClick={() => handleFollowUp(question.id)}
            >
              Follow Up
            </Button>
          )}
        </Box>
      </form>
      {answerList.length > 0 && (
        <>
          <Box display="flex" alignItems="center" mt={3}>
            <Typography variant="h6" gutterBottom>
              Answers Received:
            </Typography>
          </Box>
          {isOption ? (
            <PieChart width={400} height={400}>
              <Legend layout="horizontal" verticalAlign="top" align="center" />
              <Pie
                data={pieChartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                fill="#8884d8"
                startAngle={-270}
                legendType={"square"}
              >
                {pieChartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={pieChartColors[index]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          ) : (
            <div>
              <WordCloud data={wordCloudData} fontSize={(word) => word.value / 20} rotate={0} />
            </div>
          )}
        </>
      )}
      <List>
        {!isOption &&
          answerList.length > 0 &&
          answerList.map((answer) => (
            <ListItem key={answer.id} disablePadding>
              <ListItemText primary={answer.answerText || answer.optionId} />
            </ListItem>
          ))}
      </List>
    </Container>
  );
}

export default AnswerQuestion;
