/**
 * @license SPDX-FileCopyrightText: © 2025 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState, useEffect } from "react";
import { useParams, useNavigate, redirect } from "react-router";
import { Helmet } from "react-helmet";
// import { compare } from "fast-json-patch";
import { getQuestionById, createQuestion } from "../api/question";
import { Container, Typography, Box, TextField, Button, List, ListItem, IconButton } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { styled } from "@mui/material/styles";
import type { Question } from "../types/interfaces";
import { logEvent, setOperationId } from "../monitor/telemetry";
import pkg from "fast-json-patch";

const { compare } = pkg;
const ReadOnlyText = styled("div")(() => ({
  display: "inline-block",
  padding: "8px 0",
  minHeight: "1.4375em",
  "&:hover": {
    cursor: "text",
  },
}));

export async function clientLoader({ params }: { params: { id: string } }) {
  const { id } = params;
  if (!id) {
    throw new Error("Missing question ID.");
  }

  const question = await getQuestionById(id);
  if (question.profileId === localStorage.getItem("profileId")) {
    return redirect(`/quest5TierEg/${id}`);
  }

  return { question };
}

function QuestionDetailAdd({ loaderData }: { loaderData: { question: Question } }) {
  const { question } = loaderData;
  const { id } = useParams<{ id: string }>();
  const [questionData, setQuestionData] = useState<Question | null>(question); // Original question data
  const [editedData, setEditedData] = useState<Question | null>(question); // Edited data
  const [editingFields, setEditingFields] = useState<{ [key: string]: boolean }>({}); // Fields currently being edited
  const [isEditing, setIsEditing] = useState(false); // Whether the update/cancel buttons are visible
  const [submitError, setSubmitError] = useState("");
  const navigate = useNavigate();

  // Fetch question data by ID when component mounts
  // useEffect(() => {
  //   const fetchQuestion = async () => {
  //     try {
  //       if (!id) return;
  //       const data = await getQuestionById(id);
  //       setQuestionData(data);
  //       setEditedData(data); // Initialize editing data
  //       if (data.profileId == localStorage.getItem("profileId")) {
  //         navigate(`/quest5TierEg/${id}`, { replace: true });
  //       }
  //     } catch (error) {
  //       console.error("Error fetching question:", error);
  //     }
  //   };
  //   fetchQuestion();
  // }, [id, navigate]);

  const handleBackClick = () => {
    const correlationId = setOperationId();
    console.log("Correlation ID:", correlationId);
    logEvent("btnNavigateBackClick", {
      parentId: "BackButton",
    });

    navigate(-1);
  };

  // Toggle edit mode for a specific field
  const toggleFieldEdit = (field: string) => {
    setEditingFields((prev) => ({ ...prev, [field]: true }));
  };

  // Handle changes to a specific field
  const handleFieldEdit = (field: string, value: string) => {
    if (editedData) {
      setEditedData((prev) => ({ ...prev, [field]: value } as Question));
      setIsEditing(true);
    }
  };

  // Handle blur event for a specific field
  const handleBlur = (field: string) => {
    setEditingFields((prev) => ({ ...prev, [field]: false }));
  };

  // Update options list
  const handleOptionsEdit = (options: string[]) => {
    if (editedData) {
      setEditedData((prev) => ({ ...prev, optionList: options } as Question));
      setIsEditing(true);
    }
  };

  // Update the question data using a patch API
  const handleUpdate = async () => {
    if (questionData && editedData) {
      const correlationId = setOperationId();
      console.log("Correlation ID:", correlationId);
      const patches = compare(questionData, editedData);
      if (patches.length > 0) {
        try {
          setSubmitError("");
          setIsEditing(false);
          await createQuestion(editedData.title, editedData.questionText, editedData.optionList || []);
          console.log("ADD!!!!");
          logEvent("btnSubmitAddQuestionClick", {
            parentId: "SubmitButton",
            questionId: id,
          });
          navigate("/quest5TierEg", { replace: true, state: { saved: true } });
        } catch (error) {
          setIsEditing(true);
          setSubmitError(error instanceof Error ? error.message : "Failed to create the question. Please try again.");
          console.error("Error editing question:", error);
        }
      }
    }
  };

  // Cancel edits and revert to original data
  const handleCancel = () => {
    setEditedData(questionData);
    setEditingFields({});
    setIsEditing(false);
  };

  // Return loading indicator if data is not yet available
  if (!questionData) return <div>Loading...</div>;

  const renderField = (label: string, fieldName: keyof Question) => (
    <Box mb={3}>
      <Typography variant="h6" gutterBottom>
        {label}
      </Typography>
      <Box display="flex" alignItems="center" gap={1}>
        {editingFields[fieldName] ? (
          <TextField
            fullWidth
            value={editedData ? editedData[fieldName] || "" : ""}
            onChange={(e) => handleFieldEdit(fieldName, e.target.value)}
            onBlur={() => handleBlur(fieldName)}
            autoFocus
          />
        ) : (
          <Box display="flex" alignItems="center" width="100%">
            <ReadOnlyText onClick={() => toggleFieldEdit(fieldName)}>{editedData ? editedData[fieldName] : ""}</ReadOnlyText>
            <IconButton onClick={() => toggleFieldEdit(fieldName)} size="small" sx={{ ml: 1 }}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Box>
    </Box>
  );

  const renderOptions = () => (
    <Box
      mb={3}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          handleBlur("optionList");
        }
      }}
    >
      <Typography variant="h6" gutterBottom>
        Options
        {!editingFields.optionList && (
          <IconButton onClick={() => toggleFieldEdit("optionList")} size="small" sx={{ ml: 1 }}>
            <EditIcon fontSize="small" />
          </IconButton>
        )}
      </Typography>
      <List>
        {editingFields.optionList ? (
          editedData?.optionList?.map((option, index) => (
            <ListItem key={index}>
              <TextField
                fullWidth
                value={option}
                onChange={(e) => {
                  const updatedOptions = [...(editedData.optionList || [])];
                  updatedOptions[index] = e.target.value;
                  handleOptionsEdit(updatedOptions);
                }}
              />
              <Button
                onClick={() => {
                  const updatedOptions = [...(editedData.optionList || [])];
                  updatedOptions.splice(index, 1);
                  handleOptionsEdit(updatedOptions);
                }}
              >
                <DeleteIcon />
              </Button>
            </ListItem>
          ))
        ) : (
          <Box onClick={() => toggleFieldEdit("optionList")}>
            {editedData?.optionList?.map((option, index) => (
              <ListItem key={index}>
                <ReadOnlyText>{option}</ReadOnlyText>
              </ListItem>
            ))}
          </Box>
        )}
      </List>
      {editingFields.optionList && (
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => {
            const updatedOptions = [...(editedData?.optionList || []), ""];
            handleOptionsEdit(updatedOptions);
          }}
        >
          Add Option
        </Button>
      )}
    </Box>
  );

  return (
    <Container maxWidth="md" sx={{ mt: 4 }}>
      <Helmet>
        <title>Copy Question</title>
      </Helmet>
      <Box display="flex" alignItems="center" mb={2}>
        <IconButton onClick={handleBackClick}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4">Add Question</Typography>
      </Box>
      <Box>
        {renderField("Title", "title")}
        {renderField("Question Text", "questionText")}
        {renderOptions()}
        {isEditing && (
          <Box display="flex" justifyContent="flex-end" gap={2} mb={3}>
            <Button variant="contained" color="primary" onClick={handleUpdate}>
              Create
            </Button>
            <Button variant="outlined" onClick={handleCancel}>
              Cancel
            </Button>
          </Box>
        )}
        {submitError && <Typography role="alert" color="error" variant="body2" sx={{ mt: 1 }}>{submitError}</Typography>}
      </Box>
    </Container>
  );
}

export default QuestionDetailAdd;
