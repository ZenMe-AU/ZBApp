/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import { Helmet } from "react-helmet";
import { createQuestion } from "../api/question";
import { Container, Typography, Box, TextField, Button, List, ListItem, IconButton } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteIcon from "@mui/icons-material/Delete";
import { logEvent, setOperationId } from "../monitor/telemetry";

// export async function clientAction({ request }: { request: Request }) {
//   const navigate = useNavigate();
//   const formData = await request.formData();
//   const title = formData.get("title") as string;
//   const questionText = formData.get("questionText") as string;
//   const options = formData.getAll("options") as string[];

//   if (!title || !questionText) {
//     throw new Error("Title and question text are required.");
//   }

//   try {
//     const id = await createQuestion(title, questionText, options.length === 0 ? null : options);
//     // return { id };
//     navigate(`/quest5TierEg/${id}`, { replace: true });
//   } catch (error) {
//     console.error("Error creating question:", error);
//     throw error;
//   }
// }

function AddQuestion() {
  const [title, setTitle] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [newOption, setNewOption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const navigate = useNavigate();

  const handleBackClick = () => {
    const correlationId = setOperationId();
    console.log("Correlation ID:", correlationId);
    logEvent("btnNavigateBackClick", {
      parentId: "BackButton",
    });

    navigate(-1);
  };
  // Function to add a new option to the list
  const handleAddOption = () => {
    if (newOption.trim() !== "") {
      setOptions((prev) => [...prev, newOption.trim()]);
      setNewOption(""); // Clear the input field after adding
    }
  };

  // Function to remove an option from the list
  const handleRemoveOption = (index: number) => {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // Prevent default form submission behavior
    const correlationId = setOperationId();
    console.log("Correlation ID:", correlationId);
    try {
      setSubmitting(true);
      setSubmitError("");
      await createQuestion(title, questionText, options.length === 0 ? null : options);
      logEvent("btnQuestionCreatedClick", { parentId: "QuestionForm" });
      navigate("/quest5TierEg", { replace: true, state: { saved: true } });
    } catch (error) {
      console.error("Error creating question:", error); // Log error if any
      setSubmitError(error instanceof Error ? error.message : "Failed to create question. Please try again.");
    } finally {
      setSubmitting(false); // Reset submitting state
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4 }}>
      <Helmet>
        <title>Add Question</title>
      </Helmet>
      <Box display="flex" alignItems="center" mb={2}>
        <IconButton onClick={handleBackClick}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4">Add Question</Typography>
      </Box>

      <form onSubmit={handleSubmit}>
        <Box mb={3}>
          <TextField label="Title" fullWidth value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Box>

        <Box mb={3}>
          <TextField label="Question" fullWidth multiline rows={4} value={questionText} onChange={(e) => setQuestionText(e.target.value)} />
        </Box>

        <Box mb={3}>
          <Typography variant="h6">Options:</Typography>
          <List>
            {options.map((option, index) => (
              <ListItem
                key={index}
                secondaryAction={
                  <IconButton edge="end" aria-label="delete" onClick={() => handleRemoveOption(index)}>
                    <DeleteIcon />
                  </IconButton>
                }
              >
                {option}
              </ListItem>
            ))}
          </List>
          <Box display="flex" alignItems="center" gap={2}>
            <TextField label="New Option" value={newOption} onChange={(e) => setNewOption(e.target.value)} placeholder="Enter an option" sx={{ flexGrow: 1 }} />
            <Button variant="contained" onClick={handleAddOption}>
              Add
            </Button>
          </Box>
        </Box>

        <Box display="flex" justifyContent="flex-end" gap={2}>
          {/* <Button variant="outlined" color="secondary" component={Link} to="/question">
            Back to Question List
          </Button> */}
          <Button type="submit" variant="contained" color="primary" disabled={submitting}>
            {submitting ? "Saving..." : "Submit"}
          </Button>
        </Box>
        {submitError && (
          <Typography role="alert" color="error" variant="body2" sx={{ mt: 1 }}>
            {submitError}
          </Typography>
        )}
      </form>
    </Container>
  );
}
//   return (
//     <form onSubmit={handleSubmit}>
//       <h1>Add Question</h1>
//       <div>
//         <label>Title:</label>
//         <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
//       </div>
//       <div>
//         <label>Question:</label>
//         <textarea value={questionText} onChange={(e) => setQuestionText(e.target.value)} required />
//       </div>
//       <div>
//         <label>Options:</label>
//         <ul>
//           {options.map((option, index) => (
//             <li key={index}>
//               {option}
//               <span> </span>
//               <button type="button" onClick={() => handleRemoveOption(index)}>
//                 Remove
//               </button>
//             </li>
//           ))}
//         </ul>
//         <input
//           type="text"
//           value={newOption}
//           onChange={(e) => setNewOption(e.target.value)} // Update newOption state on change
//           placeholder="Enter an option"
//         />
//         <button type="button" onClick={handleAddOption}>
//           Add Option
//         </button>
//       </div>
//       <button type="submit">Submit</button>
//       <Link to="/question">Back to Question List</Link>
//     </form>
//   );
// }

export default AddQuestion;
