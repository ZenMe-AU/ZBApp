/**
 * @license SPDX-FileCopyrightText: © 2025 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet";

import { getQuestionById, getQuestionsByUser, getAnswerListByQuestionId, sendFollowUpQuestion } from "../api/question";
import { getMyProfileId } from "../api/profile";
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
import { logEvent, setOperationId } from "@zenmechat/shared-ui/monitor/telemetry";

type CardErrors = Record<string, { question?: boolean; option?: boolean }>;

function FollowUpQuestion() {
  const { id } = useParams<{ id: string }>();
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionList, setQuestionList] = useState<Question[]>([]);
  const [answerCounts, setAnswerCounts] = useState<Record<string, Record<string, number>>>({});
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

  const [cardErrors, setCardErrors] = useState<CardErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submittingError, setSubmittingError] = useState(false);

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
    setSelectedOptions((prev) => ({ ...prev, [cardId]: [] }));
    void fetchAnswers(questionId);
    if (questionId === followUpQuestionId) {
      setFollowUpQuestionId(null);
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
    if (!followUpQuestionId || selectedInitOptions.length === 0) {
      hasError = true;
    }

    setCardErrors(newErrors);
    setSubmittingError(hasError);

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
    // return;
    try {
      setSubmitting(true);
      const response = await sendFollowUpQuestion(id, filterData, followUpQuestionId ?? "", saveFilter);
      console.log("Response:", response);
      // navigate(`/quest3Tier/${id}`, { replace: true });
    } catch (error) {
      console.error("Error send follow up question:", error); // Log error if any
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
      const [data, profileId] = await Promise.all([getAnswerListByQuestionId(questionId), getMyProfileId()]);
      const count = data.reduce((acc: Record<string, number>, item: Answer) => {
        if (item.profileId !== profileId) {
          for (const option of item.optionAnswerList ?? (item.optionId ? [item.optionId] : [])) {
            acc[option] = (acc[option] || 0) + 1;
          }
        }
        return acc;
      }, {});

      setAnswerCounts((previous) => ({ ...previous, [questionId]: count }));
      console.log("Answer Count:", count);
    } catch (error) {
      console.error("Error fetching answers:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;

    const fetchQuestion = async () => {
      try {
        setLoading(true);
        const fetchedQuestion = await getQuestionById(id);
        if (fetchedQuestion.option === null) {
          console.log("not an option");
        }
        setQuestion(fetchedQuestion);
        setOptionList(fetchedQuestion.option);
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
        const list = data.filter((q: Question) => q.id != id && q.option !== null && q.option.length > 0);
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
        <Typography>Select who you want to send a follow-up question to</Typography>

        <Card
          key="card-initial"
          sx={{
            mx: "auto",
            border: "none",
            boxShadow: "none",
          }}
        >
          <CardContent>
            <TextField
              value={question?.title || ""}
              variant="outlined"
              fullWidth
              InputProps={{ readOnly: true }}
              sx={{
                mb: 2,
                color: "text.primary",
                "& .MuiInputBase-input": {
                  color: "#000",
                  cursor: "default",
                },
              }}
            />

            <FormGroup>
              {Array.from(new Set([...(question?.option ?? []), ...Object.keys(answerCounts[question?.id ?? ""] ?? {})])).map((option) => (
                <FormControlLabel
                  key={option}
                  control={<Checkbox checked={selectedInitOptions?.includes(option) || false} onChange={() => handleInitOptionChange(option)} />}
                  label={
                    <Box display="flex" alignItems="center">
                      <Typography variant="body1" sx={{ mr: 1 }}>
                        {option}
                      </Typography>
                      {(answerCounts[question?.id ?? ""]?.[option] ?? 0) > 0 && (
                        <Typography variant="body2" sx={{ color: "#455a64", fontWeight: "bold" }}>
                          ({answerCounts[question?.id ?? ""]?.[option]} response)
                        </Typography>
                      )}
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

        {cards.map((cardId) => (
          <>
            <Divider sx={{ borderBottom: "2px dashed #757575", my: 1 }} />
            <Card
              key={cardId}
              sx={{
                mx: "auto",
                border: "none",
                boxShadow: "none",
              }}
            >
              <CardContent sx={{ py: 0 }}>
                <Box display="flex" justifyContent="right" alignItems="center">
                  <IconButton onClick={() => handleRemoveCard(cardId)} color="error">
                    <ClearIcon />
                  </IconButton>
                </Box>

                <Select
                  value={selectedQuestions[cardId] || ""}
                  onChange={(e) => handleQuestionChange(cardId, e.target.value as string)}
                  displayEmpty
                  fullWidth
                  sx={{ mb: 2, border: cardErrors[cardId]?.question ? "2px solid red" : "none" }}
                  error={cardErrors[cardId]?.question}
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

                <FormGroup>
                  {Array.from(new Set([...(questionList.find((q) => q.id === selectedQuestions[cardId])?.option ?? []), ...Object.keys(answerCounts[selectedQuestions[cardId]] ?? {})])).map((option) => (
                    <FormControlLabel
                      key={option}
                      control={<Checkbox checked={selectedOptions[cardId]?.includes(option) || false} onChange={() => handleOptionChange(cardId, option)} />}
                      label={
                        <Box display="flex" alignItems="center">
                          <Typography variant="body1" sx={{ mr: 1 }}>
                            {option}
                          </Typography>
                          {(answerCounts[selectedQuestions[cardId]]?.[option] ?? 0) > 0 && (
                            <Typography variant="body2" sx={{ color: "#455a64", fontWeight: "bold" }}>
                              ({answerCounts[selectedQuestions[cardId]]?.[option]} response)
                            </Typography>
                          )}
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
          <Button variant="text" color="primary" onClick={handleAddCard}>
            <AddIcon /> Add
          </Button>
        </Box>

        <Divider sx={{ backgroundColor: "#000000", my: 2, height: 2 }} />
        <Card
          key="card-initial"
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

        <Box display="flex" justifyContent="center" my={2}>
          <Button variant="contained" onClick={handleFollowUp} sx={{ mx: 1 }} disabled={submitting}>
            send
          </Button>
          <FormControlLabel sx={{ mx: 1 }} control={<Checkbox checked={saveFilter} onChange={(e) => setSaveFilter(e.target.checked)} />} label="Save Filter" />
        </Box>
      </Container>
    </Container>
  );
}
export default FollowUpQuestion;
