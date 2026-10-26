/**
 * @license SPDX-FileCopyrightText: © 2025 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";

import { Helmet } from "react-helmet";

import { getQuestionById, getQuestionsByUser, getAnswerListByQuestionId, sendFollowUpQuestion } from "../api/question";
import type { Question, Answer } from "../types/interfaces";
import {
  Container,
  Box,
  IconButton,
  Typography,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Button,
  Card,
  CardContent,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import Divider from "@mui/material/Divider";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ClearIcon from "@mui/icons-material/Clear";
import AddIcon from "@mui/icons-material/Add";
import { logEvent, setOperationId } from "../monitor/telemetry";

type CardErrors = Record<string, { question?: boolean; option?: boolean }>;

export async function clientLoader({ params }: LoaderFunctionArgs) {
  // const { id } = params;
  // const profileId = localStorage.getItem("profileId");
  // if (!id) throw new Response("Question ID required", { status: 400 });
  // const question = await getQuestionById(id);
  // const answers = await getAnswerListByQuestionId(id);
  // return { question, answers, profileId };
}

export async function clientAction({ request, params }: ActionFunctionArgs) {
  // const { id } = params;
  // if (!id) throw new Response("Question ID required", { status: 400 });
  // const formData = await request.formData();
  // const selectedOption = formData.get("option");
  // const textAnswer = formData.get("textAnswer");
  // const payload = {
  //   option: typeof selectedOption === "string" ? selectedOption : null,
  //   answerText: typeof textAnswer === "string" ? textAnswer : null,
  //   answerDuration: parseInt(formData.get("duration") as string, 10),
  // };
}

function FollowUpQuestion() {
  const profileId = localStorage.getItem("profileId");
  const { id } = useParams<{ id: string }>();
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionList, setQuestionList] = useState<Question[]>([]);
  const [answerCount, setAnswerCount] = useState<Record<string, number>>({});
  const [answerCountList, setAnswerCountList] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [optionList, setOptionList] = useState<string[]>([]);

  const [saveFilter, setSaveFilter] = useState<boolean>(false);
  const [cards, setCards] = useState<string[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<Record<string, string>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [selectedInitOptions, setSelectedInitOptions] = useState<string[]>([]);

  const [followUpQuestionId, setFollowUpQuestionId] = useState<string | null>(null);
  const [followUpUserCount, setFollowUpUserCount] = useState<numberl>(0);
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([""]);

  const [cardErrors, setCardErrors] = useState<CardErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submittingError, setSubmittingError] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleBackClick = () => {
    const correlationId = setOperationId();
    console.log("Back Click Correlation ID:", correlationId);
    logEvent("btnNavigateBackClick", {
      parentId: "BackButton",
    });

    navigate(-1);
  };

  const handleAddCard = () => {
    const newCardId = `card-${cards.length + 1}`;
    setCards([...cards, newCardId]);
    setSelectedQuestions({ ...selectedQuestions, [newCardId]: "" });
    setSelectedOptions({ ...selectedOptions, [newCardId]: [] });
    console.log("cards", cards);
  };

  const handleRemoveCard = (cardId: string) => {
    setCards(cards.filter((id) => id !== cardId));
    const updatedQuestions = { ...selectedQuestions };
    const updatedOptions = { ...selectedOptions };
    delete updatedQuestions[cardId];
    delete updatedOptions[cardId];
    setSelectedQuestions(updatedQuestions);
    setSelectedOptions(updatedOptions);
  };

  const handleQuestionChange = (cardId: string, questionId: string) => {
    setSelectedQuestions((prev) => ({ ...prev, [cardId]: questionId }));
    // if (questionId === followUpQuestionId) {
    //   setFollowUpQuestionId(null);
    // }
    console.log("Selected Question ID:", questionId);
    console.log("Selected Questions:", answerCountList[questionId] ?? []);
    if (!answerCountList[questionId]) {
      fetchAnswers(questionId);
    }
    if (cardId in cardErrors && questionId) {
      setCardErrors((prev) => {
        const updatedErrors = { ...prev };
        if (updatedErrors[cardId]) {
          updatedErrors[cardId].question = false;
          !Object.values(updatedErrors[cardId]).includes(true) && delete updatedErrors[cardId];
        }
        return updatedErrors;
      });
    }
    console.log("Selected Question:", selectedQuestions);
  };

  const handleOptionChange = (cardId: string, option: string) => {
    setSelectedOptions((prev) => {
      const cardOptions = prev[cardId] || [];
      const updatedOptions = cardOptions.includes(option) ? cardOptions.filter((item) => item !== option) : [...cardOptions, option];

      if (cardId in cardErrors && cardErrors[cardId]?.option && updatedOptions.length > 0) {
        setCardErrors((prev) => {
          const updatedErrors = { ...prev };
          if (updatedErrors[cardId]) {
            updatedErrors[cardId].option = false;
            !Object.values(updatedErrors[cardId]).includes(true) && delete updatedErrors[cardId];
          }
          return updatedErrors;
        });
      }

      return { ...prev, [cardId]: updatedOptions };
    });
  };

  const handleInitOptionChange = (option: string) => {
    setSelectedInitOptions((prev) => {
      return prev.includes(option) ? prev.filter((item) => item !== option) : [...prev, option];
    });
  };

  const handleFollowUp = async () => {
    if (!id) return;
    const correlationId = setOperationId();
    console.log("FollowUp Correlation ID:", correlationId);

    let hasError = false;
    const newErrors: CardErrors = {};

    for (const cardId of cards) {
      const questionId = selectedQuestions[cardId];
      const options = selectedOptions[cardId] || [];

      if (!questionId || options.length === 0) {
        newErrors[cardId] = {
          question: !questionId,
          option: options.length === 0,
        };
        hasError = true;
      }
    }
    if (followUpQuestions.length === 0 || followUpQuestions.some((q) => !q.trim()) || selectedInitOptions.length === 0) {
      hasError = true;
    }

    setCardErrors(newErrors);
    setSubmittingError(hasError);
    setSubmitError(hasError ? "Complete each required follow-up question and option." : "");

    if (hasError) {
      console.log("hasError", newErrors);
      return;
    }

    const filterData = cards.map((cardId) => ({
      questionId: selectedQuestions[cardId],
      option: selectedOptions[cardId] || [],
    }));

    filterData.unshift({
      questionId: question?.id ?? "",
      option: selectedInitOptions,
    });
    console.log("Follow-up Data:", filterData);
    console.log("Follow-up Questions:", followUpQuestions);
    // return;
    try {
      setSubmitting(true);
      setSubmitError("");
      const response = await sendFollowUpQuestion(id, filterData, followUpQuestions, saveFilter);
      console.log("Response:", response);
      navigate("/quest5TierEg", { replace: true, state: { saved: true } });
    } catch (error) {
      console.error("Error send follow up question:", error); // Log error if any
      setSubmitError(error instanceof Error ? error.message : "Failed to send follow-up questions. Please try again.");
    } finally {
      setSubmitting(false);
      logEvent("btnSendFollowUpQuestionClick", {
        parentId: "SubmitButton",
        questionId: id,
      });
    }
    // console.log("Follow-up Data:", JSON.stringify(followUpData, null, 2));
    // console.log("Follow-up Data:", followUpData);
  };

  const fetchAnswers = async (questionId: string) => {
    try {
      const data = await getAnswerListByQuestionId(questionId);
      const count = data.reduce((acc: Record<string, number>, item: Answer) => {
        if (item.profileId !== profileId) {
          item.optionAnswerList?.forEach((option) => {
            console.log("Option:", option);
            acc[option] = (acc[option] || 0) + 1;
          });
        }
        return acc;
      }, {});

      // setAnswerCount(count);
      setAnswerCountList((prev) => ({ ...prev, [questionId]: count }));
      if (questionId === id) {
        setQuestion((prev) => {
          if (prev) {
            return { ...prev, optionList: Array.from(new Set([...(prev?.optionList ?? []), ...Object.keys(count)])) };
          }
          return prev;
        });
      } else {
        setQuestionList((prev) =>
          prev.map((q) => {
            if (q.id !== questionId) return q;

            const mergedOptions = Array.from(new Set([...(q.optionList ?? []), ...Object.keys(count)]));

            return { ...q, optionList: mergedOptions };
          })
        );
      }

      console.log("Answer Count:", answerCountList);
    } catch (error) {
      console.error("Error fetching answers:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFollowUp = () => {
    if (followUpQuestions.length < 4) {
      setFollowUpQuestions([...followUpQuestions, ""]);
    }
  };

  const handleFollowUpChange = (index: number, value: string) => {
    setFollowUpQuestions((prev) => prev.map((q, i) => (i === index ? value : q)));
  };

  const handleRemoveFollowUp = (index: number) => {
    setFollowUpQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    if (!id) return;

    const fetchQuestion = async () => {
      try {
        setLoading(true);
        const fetchedQuestion = await getQuestionById(id);
        // if (fetchedQuestion.optionList === null) {
        //   console.log("not an option");
        // }
        setQuestion(fetchedQuestion);
        setOptionList(fetchedQuestion.optionList);
        // setCards(["card-initial"]);
        // setSelectedQuestions({ "card-initial": fetchedQuestion.id });
        // setSelectedOptions({ "card-initial": [] });
      } catch (err) {
        console.error("Error fetching question:", err);
        setError("Failed to load the question.");
      } finally {
        setLoading(false);
      }
    };

    fetchQuestion();

    const fetchQuestions = async () => {
      try {
        const data = await getQuestionsByUser();
        const list = data.filter((q: Question) => q.id != id && q.optionList !== null && q.optionList.length > 0);
        console.log("List:", list);
        setQuestionList(list);
      } catch (error) {
        console.error("Error fetching questions:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchQuestions();

    fetchAnswers(id);
  }, [id]);

  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Helmet>
        <title>Follow Up Question</title>
      </Helmet>

      <Box display="flex" alignItems="center" mb={2}>
        <IconButton onClick={handleBackClick}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4">Send a follow-up Question</Typography>
      </Box>
      <Container sx={{ width: "80%", maxWidth: "lg" }}>
        <Card
          key="card-initial"
          sx={{
            mx: "auto",
            border: "none",
            boxShadow: "none",
            p: 2,
          }}
        >
          <CardContent>
            <Typography variant="h1" gutterBottom sx={{ color: "text.primary" }}>
              {question?.title || "Untitled Question"}
            </Typography>
            <Typography
              variant="body1"
              sx={{
                mt: 1,
                mb: 3,
                fontSize: "1.125rem",
                color: "black",
                whiteSpace: "pre-wrap",
              }}
            >
              {question?.questionText || ""}
            </Typography>
            <Typography>Select for which answers you want to send a follow up question.</Typography>

            <FormGroup>
              {question?.optionList?.map((option, index) => (
                <FormControlLabel
                  key={index}
                  control={<Checkbox checked={selectedInitOptions?.includes(option) || false} onChange={() => handleInitOptionChange(option)} />}
                  label={
                    <Box display="flex" alignItems="center">
                      <Typography variant="body1" sx={{ mr: 1 }}>
                        {option}
                      </Typography>

                      <Typography variant="body2" sx={{ color: "#455a64", fontWeight: "bold" }}>
                        ({answerCountList[question?.id]?.[option] ?? 0} response)
                      </Typography>
                      {/* {(answerCountList[question?.id]?.[option] ?? 0) > 0 && ()} */}
                    </Box>
                  }
                />
              ))}
            </FormGroup>

            {selectedInitOptions.length === 0 && submittingError && (
              <Typography variant="body2" color="error">
                At least one option must be selected.
              </Typography>
            )}
          </CardContent>
        </Card>
        <Typography sx={{ flexGrow: 1 }}>You can add more questions to filter the follow up audience.</Typography>

        {cards.map((cardId) => (
          <>
            <Card
              key={cardId}
              sx={{
                mx: "auto",
                border: "none",
                boxShadow: "none",
              }}
            >
              <CardContent sx={{ py: 0 }}>
                <Box display="flex" alignItems="center" mb={2}>
                  <Box flexGrow={1}>
                    <Select
                      size="small"
                      value={selectedQuestions[cardId] || ""}
                      onChange={(e) => handleQuestionChange(cardId, e.target.value as string)}
                      displayEmpty
                      fullWidth
                      error={cardErrors[cardId]?.question}
                      sx={{
                        height: 40,
                        border: cardErrors[cardId]?.question ? "2px solid red" : "none",
                        display: "flex",
                        alignItems: "center",
                        "& .MuiSelect-select": {
                          display: "flex",
                          alignItems: "center",
                        },
                      }}
                    >
                      <MenuItem value="" disabled>
                        Select a question
                      </MenuItem>
                      {questionList.map((question, index) => (
                        <MenuItem key={index} value={question.id} disabled={Object.values(selectedQuestions).includes(question.id)}>
                          {question.title}
                        </MenuItem>
                      ))}
                    </Select>
                  </Box>

                  <Box ml={1} display="flex" alignItems="center" height={40}>
                    <IconButton onClick={() => handleRemoveCard(cardId)} color="error" size="small">
                      <ClearIcon />
                    </IconButton>
                  </Box>
                </Box>

                <FormGroup>
                  {(questionList.find((q) => q.id === selectedQuestions[cardId])?.optionList || []).map((option, index) => (
                    <FormControlLabel
                      key={index}
                      control={
                        <Checkbox checked={selectedOptions[cardId]?.includes(option) || false} onChange={() => handleOptionChange(cardId, option)} />
                      }
                      label={
                        <Box display="flex" alignItems="center">
                          <Typography variant="body1" sx={{ mr: 1 }}>
                            {option}
                          </Typography>

                          <Typography variant="body2" sx={{ color: "#455a64", fontWeight: "bold" }}>
                            ({answerCountList[selectedQuestions[cardId]]?.[option] ?? 0} response)
                          </Typography>
                          {/* {(answerCountList[selectedQuestions[cardId]]?.[option] ?? 0) > 0 && ()} */}
                        </Box>
                      }
                    />
                  ))}
                </FormGroup>

                {cardErrors[cardId]?.option && (
                  <Typography variant="body2" color="error">
                    At least one option must be selected.
                  </Typography>
                )}
              </CardContent>
            </Card>
          </>
        ))}

        <Box display="flex" justifyContent="right" my={-2}>
          <Button variant="text" color="primary" onClick={handleAddCard} disabled={questionList.length - cards.length <= 0}>
            <AddIcon /> Add filter question
          </Button>
        </Box>

        <Divider sx={{ backgroundColor: "#000000", my: 2, height: 2 }} />
        <Typography sx={{ flexGrow: 1 }}>Select up to 4 questions to send to the {followUpUserCount} receivers.</Typography>
        {/* <Card
          key="card2-initial"
          sx={{
            mx: "auto",
            border: "none",
            boxShadow: "none",
          }}
        >
          <CardContent>
            <Select
              sx={{ mx: 1 }}
              displayEmpty
              value={followUpQuestionId || ""}
              onChange={(e) => setFollowUpQuestionId(e.target.value as string)}
              error={submittingError && !followUpQuestionId}
              fullWidth
            >
              <MenuItem value="" disabled>
                Select a follow-up question
              </MenuItem>
              {questionList.map((question) => (
                <MenuItem key={question.id} value={question.id} disabled={Object.values(selectedQuestions).includes(question.id)}>
                  {question.title}
                </MenuItem>
              ))}
            </Select>
          </CardContent>
        </Card>

        <Box display="flex" justifyContent="right" my={-2}>
          <Button variant="text" color="primary" onClick disabled={cards.length >= 4}>
            <AddIcon /> Add follow-up question
          </Button>
        </Box> */}
        {followUpQuestions.map((selectedId, index) => (
          <Card key={`follow-up-${index}`} sx={{ mx: "auto", border: "none", boxShadow: "none", my: 0, py: 0 }}>
            <CardContent sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Select
                required
                size="small"
                displayEmpty
                fullWidth
                value={selectedId}
                onChange={(e) => handleFollowUpChange(index, e.target.value as string)}
                error={submittingError && (!selectedId || selectedId === "")}
              >
                <MenuItem value="" disabled>
                  Select a follow-up question
                </MenuItem>
                {questionList.map((question) => (
                  <MenuItem key={question.id} value={question.id} disabled={followUpQuestions.includes(question.id)}>
                    {question.title}
                  </MenuItem>
                ))}
              </Select>

              <IconButton onClick={() => handleRemoveFollowUp(index)} color="error" disabled={followUpQuestions.length <= 1}>
                <ClearIcon />
              </IconButton>
            </CardContent>
          </Card>
        ))}
        <Box display="flex" justifyContent="flex-end" mt={1}>
          <Button
            variant="text"
            color="primary"
            onClick={handleAddFollowUp}
            disabled={followUpQuestions.length >= 4 || questionList.length - followUpQuestions.length <= 0}
            startIcon={<AddIcon />}
          >
            Add follow-up question
          </Button>
        </Box>

        <Box display="flex" justifyContent="center" my={2}>
          <Button variant="contained" onClick={handleFollowUp} sx={{ mx: 1 }} disabled={submitting}>
            {submitting ? "Sending..." : "Send"}
          </Button>
          {/* <FormControlLabel
            sx={{ mx: 1 }}
            control={<Checkbox checked={saveFilter} onChange={(e) => setSaveFilter(e.target.checked)} />}
            label="Save Filter"
          /> */}
        </Box>
        {submitError && <Typography role="alert" color="error" variant="body2" sx={{ mt: 1 }}>{submitError}</Typography>}
      </Container>
    </Container>
  );
}
export default FollowUpQuestion;
