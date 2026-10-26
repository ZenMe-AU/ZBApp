/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// src/pages/EditQuestion.tsx
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Helmet } from "react-helmet";
import { getQuestionById, updateQuestion } from "../api/question";
import type { Question } from "../types/interfaces";

function EditQuestion() {
  const { id } = useParams<{ id: string }>(); // Retrieve question ID from the URL
  const navigate = useNavigate();
  const [question, setQuestion] = useState<Question>({
    id: "",
    title: "",
    questionText: "",
    optionList: null,
    profileId: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Fetch the question details for editing
    const fetchQuestion = async () => {
      try {
        if (!id) return;
        const data = await getQuestionById(id);
        setQuestion(data);
      } catch (error) {
        console.error("Error fetching question:", error);
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchQuestion();
  }, [id]);

  const handleInputChange = (field: keyof Question, value: string) => {
    setQuestion({ ...question, [field]: value });
  };

  const handleOptionChange = (index: number, value: string) => {
    const updatedOptions = [...(question.optionList || [])];
    updatedOptions[index] = value;
    setQuestion({ ...question, optionList: updatedOptions });
  };

  const handleAddOption = () => {
    setQuestion({ ...question, optionList: [...(question.optionList || []), ""] });
  };

  const handleRemoveOption = (index: number) => {
    const updatedOptions = question.optionList ? question.optionList.filter((_, i) => i !== index) : null;
    setQuestion({ ...question, optionList: updatedOptions });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      if (id) {
        console.log("Question question:", question);
        // TODO: If I'm the owner of the question, then I can update it, if I'm not the owner, then any edits to the question will create a new question where I'm the owner.
        // await updateQuestion(id, question);
      } else {
        console.error("Question ID is undefined");
      }
      navigate(`/quest5TierEg/${id}`);
    } catch (err) {
      console.error("Error updating question:", err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error loading question details.</p>;
  if (submitting) return <p>Submitting...</p>;

  return (
    <div>
      <Helmet>
        <title>Edit Question</title>
      </Helmet>
      <h1>Edit Question</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="title">Title</label>
          <input id="title" type="text" value={question.title} onChange={(e) => handleInputChange("title", e.target.value)} />
        </div>
        <div>
          <label htmlFor="questionText">Question</label>
          <textarea id="questionText" value={question.questionText} onChange={(e) => handleInputChange("questionText", e.target.value)}></textarea>
        </div>
        <div>
          <label>Options</label>
          {Array.isArray(question.optionList) &&
            question.optionList.map((opt, index) => (
              <div key={index}>
                <input type="text" value={opt} onChange={(e) => handleOptionChange(index, e.target.value)} />
                <button type="button" onClick={() => handleRemoveOption(index)} disabled={!question.optionList || question.optionList.length <= 1}>
                  Remove
                </button>
              </div>
            ))}
          <button type="button" onClick={handleAddOption}>
            Add Option
          </button>
        </div>
        <button type="submit">Save Changes</button>
      </form>

      <Link to={`/quest5TierEg/${question.id}`}>Back</Link>
    </div>
  );
}

export default EditQuestion;
