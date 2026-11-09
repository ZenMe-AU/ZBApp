/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useState, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import { getQuestionById, submitAnswer, getAnswerListByQuestionId } from "../api/question";
import { friendlyError } from "../api/friendlyError";
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
  Select,
  MenuItem,
  Checkbox,
  FormGroup,
  InputAdornment,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import WordCloud from "react-d3-cloud";
import { logEvent, setOperationId } from "../monitor/telemetry.ts";
import _ from "lodash";
import { isDuplicateOption } from "./optionValidation";
// import { useFetcher, useLoaderData, useParams } from "react-router-dom";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
// import { Checkbox, FormControlLabel, TextField, Button, FormControl, FormLabel, FormGroup, Select, MenuItem, Box } from "@mui/material";
// import { useEffect, useState } from "react";
// import { submitAnswer, getQuestionById, getAnswerListByQuestionId } from "../api/question";

export async function clientLoader({ params }: LoaderFunctionArgs) {
  const { id } = params;
  const profileId = localStorage.getItem("profileId");
  if (!id) throw new Response("Question ID required", { status: 400 });

  const question = await getQuestionById(id);
  if (!question) {
    throw new Response("Question not found", { status: 404 });
  }
  let answer = null,
    othersAnswers = [],
    othersText = [];
  try {
    const allAnswers = await getAnswerListByQuestionId(id);
    console.log("getAnswerListByQuestionId", allAnswers);
    const answerList = allAnswers.reduce(
      (acc: { self: Answer[]; others: { option: string[]; text: (string | null)[] } }, a: Answer) => {
        if (a.profileId === profileId) {
          acc.self.push(a);
        } else {
          acc.others.option.push(...(a.optionAnswerList ?? []));
          const text = a.answerText?.trim();
          if (text) acc.others.text.push(text);
        }
        return acc;
      },
      { self: [], others: { option: [], text: [] } }
    );

    answer = answerList.self[0];
    othersAnswers = answerList.others.option.reduce((acc: Record<string, number>, text) => {
      acc[text] = (acc[text] || 0) + 1;
      return acc;
    }, {});
    othersText = answerList.others.text
      .flatMap((text) => text.toLowerCase().match(/\b[\w\d]+\b/g) || [])
      .reduce((acc: Record<string, number>, word: string) => {
        acc[word] = (acc[word] || 0) + 1;
        return acc;
      }, {});
  } catch (error) {
    console.error("Error fetching answers:", error);
  }

  const pieChart = (() => {
    const total = Object.values(othersAnswers).reduce((sum, count) => sum + count, 0);
    const chartData = Object.entries(othersAnswers)
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
    return { color: generatedColors, data: chartData };
  })();

  const wordCloud = (() => {
    const wordCount = Object.entries(othersText).map(([text, value]) => ({
      text: text,
      value: value * 100,
    }));
    return wordCount;
  })();

  return { profileId, question, answer, othersAnswers, othersText, id, pieChart, wordCloud };
}

// export async function clientAction({ request, params }: ActionFunctionArgs) {
//   const formData = await request.formData();
//   const answerText = formData.get("answerText") as string;
//   const when = formData.get("when") as string | null;
//   const options = formData.getAll("options") as string[];
//   const duration = Number(formData.get("duration") ?? 0);
//   const profileId = localStorage.getItem("profileId");

//   // await submitAnswer({
//   //   questionId: params.id,
//   //   profileId,
//   //   answerText,
//   //   optionAnswerList: options.length > 0 ? options : null,
//   //   when: when || null,
//   //   duration,
//   // });

//   return { success: true };
// }

export default function AnswerQuestion({ loaderData }: { loaderData: unknown }) {
  const { profileId, question, answer, othersAnswers, othersText, id, pieChart, wordCloud } = loaderData;

  console.log("loaderData", loaderData);
  const [prevAns, setPrevAns] = useState<{
    answerText: string | null;
    when: string | null;
    optionAnswerList: Array<string> | null;
  } | null>(answer);
  const [when, setWhen] = useState<string | null>(answer?.when || null);
  const [textAnswer, setTextAnswer] = useState<string>(answer?.answerText || "");
  const [selectedOptions, setSelectedOptions] = useState<string[]>(answer?.optionAnswerList?.filter((opt) => question?.optionList?.includes(opt)) || []);
  const startTime = useRef<number | null>(null);

  useEffect(() => {
    if (question && startTime.current === null) {
      startTime.current = performance.now();
      console.log("startTime", startTime.current);
    }
  }, [question]);
  // const { id } = useParams<{ id: string }>();
  // const [selectedOption, setSelectedOption] = useState<string | null>(null);
  // const [loading, setLoading] = useState(false);
  // const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  // const [startTime, setStartTime] = useState<number>(0);
  // const [newOptionText, setNewOptionText] = useState("");

  const [whenList, setWhenList] = useState<string[]>(["Weekends", "Next weekend", "Daily", "Weekly"]);

  // const predefinedOptions = question?.optionList || [];
  const [customOptions, setCustomOptions] = useState<{ text: string; editing: boolean; checked: boolean; hover: boolean; error?: string }[]>(() => {
    const originalOptions = (question?.optionList || []).map((text: string) => ({
      text,
      editing: false,
      checked: (answer?.optionAnswerList || []).includes(text), // 有被選的就勾選
      hover: false,
    }));

    const extraOptions = (answer?.optionAnswerList || [])
      .filter((text: string) => !question?.optionList?.includes(text))
      .map((text: string) => ({
        text,
        editing: false,
        checked: true,
        hover: false,
      }));
    return Array.from(new Set([...originalOptions, ...extraOptions, { text: "", editing: false, checked: false, hover: false }]));
  });

  // const [answerList, setAnswerList] = useState<Answer[]>([]);

  const [pieChartData, setPieChartData] = useState<{ name: string; value: number; percentage: string }[]>(pieChart.data || []);
  const [pieChartColors, setPieChartColors] = useState<string[]>(pieChart.color || []);
  const [wordCloudData, setWordCloudData] = useState<{ text: string; value: number }[]>(wordCloud || []);
  // const [isOption, setIsOption] = useState<boolean>(true);
  const navigate = useNavigate();

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
    setSubmitError("");
    const correlationId = setOperationId();
    console.log("Correlation ID:", correlationId);
    if (!id || !question) {
      setSubmitError("Invalid question ID.");
      setSubmitting(false);
      return;
    }

    const endTime = performance.now();
    const answerDuration = Math.round(endTime - (startTime?.current ?? 0));
    console.log("Answer Duration:", answerDuration);
    console.log("selectedOptions:", selectedOptions);
    console.log("customOptions:", customOptions);
    console.log(
      "customOptions:",
      customOptions.filter(({ checked }) => checked).map(({ text }) => text)
    );

    const answerPayload = {
      option: (() => {
        const selected = customOptions.filter(({ checked }) => checked).map(({ text }) => text);
        const unique = Array.from(new Set(selected));
        return unique.length > 0 ? unique : null;
      })(),
      answerText: textAnswer,
      answerDuration,
      when: when,
    };

    if (!answerPayload.option && !answerPayload.answerText) {
      setSubmitError("Please provide an answer.");
      setSubmitting(false);
      return;
    }

    if (
      _.isEqual((answerPayload.option ?? []).sort(), (prevAns?.optionAnswerList ?? []).sort()) &&
      answerPayload.answerText === prevAns?.answerText &&
      answerPayload.when === prevAns?.when
    ) {
      console.log("nothing changed!");
      console.log("Answer Payload:", answerPayload);
      console.log("prevAns:", prevAns);
      setSubmitting(false);
      return;
    }
    console.log("Answer Payload:", answerPayload);
    // return;
    try {
      await submitAnswer(id, answerPayload, question.questionText);
      navigate("/quest5TierEg", { replace: true, state: { saved: true } });
      setPrevAns((prev) => {
        if (!prev)
          return {
            optionAnswerList: answerPayload.option,
            answerText: answerPayload.answerText,
            when: answerPayload.when,
          };
        return {
          ...prev,
          optionAnswerList: answerPayload.option,
          answerText: answerPayload.answerText,
          when: answerPayload.when,
        };
      });
      // navigate(`/quest5TierEg/${id}`);
    } catch (err) {
      console.error("Error submitting answer:", err);
      setSubmitError(friendlyError(err, "We couldn’t submit your answer. Please try again.", "Please check your answer and options, then try again."));
    } finally {
      logEvent("btnAnswerQuestionClick", {
        parentId: "SubmitButton",
        questionId: id,
        questionText: question.questionText,
        ...answerPayload,
      });
      setSubmitting(false);
      startTime.current = performance.now();
      console.log("startTime reset:", startTime.current);
    }
  };
  const handleFollowUp = (questionId: string) => {
    const correlationId = setOperationId();
    console.log("Correlation ID:", correlationId);
    logEvent("btnFollowUpQuestionClick", {
      parentId: "ActionButton",
      questionId: questionId,
    });
    navigate(`/quest5TierEg/${questionId}/followUp`);
  };

  const handleCheckboxChange = (option: string) => {
    setSelectedOptions((prev) => (prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]));
  };

  // const handleAddCustomOption = () => {
  //   const trimmed = newOptionText.trim();
  //   if (trimmed && !predefinedOptions.includes(trimmed) && !customOptions.includes(trimmed)) {
  //     setCustomOptions([...customOptions, trimmed]);
  //     setSelectedOptions([...selectedOptions, trimmed]);
  //     setNewOptionText("");
  //   }
  // };

  const toggleCustomOptionHover = (idx: number, hover: boolean) => {
    setCustomOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, hover } : o)));
  };

  const toggleCustomOptionCheck = (idx: number, checked: boolean) => {
    setCustomOptions((prev) =>
      prev.map((o, i) => {
        if (i !== idx) return o;

        const editing = checked && !o.text.trim() ? true : o.editing;
        return { ...o, checked, editing };
      })
    );
  };

  const updateCustomOptionText = (idx: number, text: string) => {
    setCustomOptions((prev) =>
      prev.map((o, i) => {
        if (i !== idx) return o;

        const checked = text.trim() === "" && o.checked ? false : o.checked;
        const nextOptions = prev.map((option, optionIndex) => (optionIndex === idx ? { ...option, text } : option));
        return { ...o, text, checked, error: o.error && isDuplicateOption(nextOptions, idx) ? o.error : undefined };
      })
    );
  };

  const finishEditOption = (idx: number) => {
    setCustomOptions((prev) => {
      const updated = [...prev];
      const current = updated[idx];

      if (isDuplicateOption(updated, idx)) {
        updated[idx] = {
          ...current,
          checked: false,
          editing: true,
          error: "This option has already been added. Enter a different option.",
        };
        return updated;
      }

      const hasText = current.text.trim() !== "";
      updated[idx] = {
        ...current,
        editing: false,
        checked: hasText,
        hover: false,
        error: undefined,
      };

      const last = updated[updated.length - 1];
      const shouldAddEmptyRow = last.text.trim() !== "" && !last.editing;

      if (shouldAddEmptyRow) {
        updated.push({
          text: "",
          checked: false,
          editing: false,
          hover: false,
        });
      }

      return updated;
    });
  };

  const startEditOption = (idx: number) => {
    setCustomOptions((prev) => prev.map((o, i) => ({ ...o, editing: i === idx })));
  };

  const deleteCustomOption = (idx: number) => {
    setCustomOptions((prev) => prev.filter((_, i) => i !== idx));
  };
  // if (loading) return <p>Loading...</p>;
  // if (error) return <p>{error}</p>;
  // if (!question) return <p>No question found.</p>;

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
        <FormControl fullWidth sx={{ mb: 2 }}>
          <FormLabel>When</FormLabel>
          <Select value={when} onChange={(e) => setWhen(e.target.value)}>
            <MenuItem></MenuItem>
            {whenList.map((option, idx) => (
              <MenuItem key={idx} value={option}>
                {option}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl component="fieldset" sx={{ mb: 2 }}>
          <FormLabel component="legend">Select your answers</FormLabel>
          <FormGroup>
            {/* {predefinedOptions.map((option, idx) => (
              <FormControlLabel
                key={idx}
                control={<Checkbox checked={selectedOptions.includes(option)} onChange={() => handleCheckboxChange(option)} />}
                label={option}
              />
            ))} */}

            {customOptions.map((option, idx) => (
              <FormControlLabel
                key={idx}
                control={<Checkbox checked={option.checked} onChange={(e) => toggleCustomOptionCheck(idx, e.target.checked)} />}
                label={
                  option.editing ? (
                    // <TextField
                    //   value={option.text}
                    //   autoFocus={option.editing}
                    //   onChange={(e) => updateCustomOptionText(idx, e.target.value)}
                    //   onBlur={() => finishEditOption(idx)}
                    //   onKeyDown={(e) => {
                    //     if (e.key === "Enter") {
                    //       e.preventDefault();
                    //       finishEditOption(idx);
                    //     }
                    //   }}
                    //   variant="standard"
                    //   InputProps={{
                    //     endAdornment: (
                    //       <InputAdornment position="end">
                    //         <IconButton
                    //           sx={{ cursor: "pointer" }}
                    //           size="small"
                    //           onClick={(e) => {
                    //             e.preventDefault();
                    //             finishEditOption(idx);
                    //           }}
                    //         >
                    //           <CheckCircleOutlineIcon fontSize="small" />
                    //         </IconButton>
                    //       </InputAdornment>
                    //     ),
                    //     disableUnderline: false,
                    //   }}
                    //   sx={{
                    //     fontSize: "14px",
                    //     minWidth: `${option.text.length < 10 ? 10 : option.text.length + 1}ch`,
                    //     input: {
                    //       padding: "6px 8px",
                    //       color: "#000",
                    //     },
                    //   }}
                    // />
                    <Box key={idx} display="inline-flex" alignItems="center" sx={{ mb: 1 }} width={"100%"}>
                      <AutoWidthTextField
                        value={option.text}
                        onChange={(e) => updateCustomOptionText(idx, e.target.value)}
                        onBlur={() => finishEditOption(idx)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            finishEditOption(idx);
                          }
                        }}
                        autoFocus={option.editing}
                        error={Boolean(option.error)}
                        helperText={option.error}
                        endAdornment={
                          <InputAdornment position="end">
                            <IconButton
                              sx={{ cursor: "pointer" }}
                              size="small"
                              onClick={(e) => {
                                e.preventDefault();
                                finishEditOption(idx);
                              }}
                            >
                              <CheckCircleOutlineIcon fontSize="small" />
                            </IconButton>
                          </InputAdornment>
                        }
                      />
                    </Box>
                  ) : (
                    <Box
                      sx={{
                        px: 1,
                        flexGrow: 1,
                        cursor: "pointer",
                        userSelect: "none",
                        borderBottom: option.hover && option.text ? "1px solid #ccc" : "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        ":hover": {
                          borderBottom: option.text ? "1px solid #ccc" : "none",
                        },
                      }}
                      onMouseEnter={() => toggleCustomOptionHover(idx, true)}
                      onMouseLeave={() => toggleCustomOptionHover(idx, false)}
                    >
                      {option.text ? (
                        <>
                          <Typography sx={{ flexGrow: 1 }}>{option.text}</Typography>
                          {option.hover && (
                            <>
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.preventDefault();
                                  startEditOption(idx);
                                }}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                              {/* <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.preventDefault();
                                  deleteCustomOption(idx);
                                }}
                              >
                                <CloseIcon fontSize="small" />
                              </IconButton> */}
                            </>
                          )}
                        </>
                      ) : (
                        <Typography
                          sx={{ color: "#aaa" }}
                          onClick={(e) => {
                            e.preventDefault();
                            startEditOption(idx);
                          }}
                        >
                          Add answer
                        </Typography>
                      )}
                    </Box>
                  )
                }
              />
            ))}
          </FormGroup>
        </FormControl>

        <TextField
          label="Long Answer"
          multiline
          rows={4}
          fullWidth
          value={textAnswer}
          onChange={(e) => setTextAnswer(e.target.value)}
          placeholder="Type your answer here"
          sx={{ mb: 2 }}
        />

        <Box display="flex" justifyContent="left">
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? "Submitting..." : "Submit"}
          </Button>
          <Button variant="outlined" color="secondary" onClick={() => handleFollowUp(question.id)} sx={{ ml: 2 }}>
            Send follow up question
          </Button>
        </Box>
        {submitError && <Typography role="alert" color="error" variant="body2" sx={{ mt: 1 }}>{submitError}</Typography>}
      </form>

      {(pieChartData.length > 0 || wordCloudData.length > 0) && (
        <>
          <Box display="flex" alignItems="center" mt={3}>
            <Typography variant="h6" gutterBottom>
              Answers Received:
            </Typography>
          </Box>
          {pieChartData.length > 0 && (
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
          )}

          {wordCloudData.length > 0 && (
            <div>
              <WordCloud data={wordCloudData} fontSize={(word) => word.value / 20} rotate={0} />
            </div>
          )}

          {false && (
            <List>
              {wordCloudData.map((answer) => (
                <ListItem key={answer.id} disablePadding>
                  <ListItemText primary={answer.answerText || answer.optionList} />
                </ListItem>
              ))}
            </List>
          )}
        </>
      )}
    </Container>
  );
}

const AutoWidthTextField = ({ value, onChange, onBlur, onKeyDown, autoFocus, endAdornment, error, helperText, disableUnderline = false }) => {
  const spanRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState("10ch");

  // useEffect(() => {
  //   if (spanRef.current) {
  //     const newWidth = spanRef.current.offsetWidth + 50;

  //     setWidth(`${newWidth}px`);
  //   }
  // }, [value]);

  useEffect(() => {
    if (spanRef.current) {
      const bufferGap = 50; // Buffer gap to prevent text overflow
      const newWidth = spanRef.current.offsetWidth + bufferGap;
      const parentWidth = spanRef.current.parentElement?.offsetWidth || newWidth;
      const maxWidth = parentWidth - bufferGap > newWidth ? parentWidth - bufferGap : newWidth;
      console.log("newWidth:", newWidth, "maxWidth:", maxWidth, "parentWidth:", parentWidth, spanRef.current.parentElement?.offsetWidth);
      setWidth(`${Math.min(newWidth, maxWidth)}px`);
    }
  }, [value]);
  return (
    <>
      <TextField
        autoFocus={autoFocus}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        error={error}
        helperText={helperText}
        variant="standard"
        InputProps={{
          disableUnderline,
          style: {
            fontSize: "14px",
            width,
            padding: "6px 8px",
          },
          endAdornment,
        }}
      />
      <span
        ref={spanRef}
        style={{
          position: "absolute",
          visibility: "hidden",
          whiteSpace: "pre",
          fontSize: "14px",
          fontFamily: "inherit",
          padding: "6px 8px",
        }}
      >
        {value || ""}
      </span>
    </>
  );
};
