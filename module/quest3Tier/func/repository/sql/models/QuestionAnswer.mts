/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

export default (sequelize, DataTypes) => {
  const QuestionAnswer = sequelize.define(
    "QuestionAnswer",
    {
      id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      profileId: { type: DataTypes.UUID, allowNull: false },
      questionId: { type: DataTypes.UUID, allowNull: false },
      answerText: { type: DataTypes.TEXT, allowNull: true },
      optionId: { type: DataTypes.STRING, allowNull: true },
      optionAnswerList: { type: DataTypes.JSON, allowNull: true },
      when: { type: DataTypes.STRING, allowNull: true },
      duration: { type: DataTypes.INTEGER, allowNull: false },
    },
    { tableName: "questionAnswer", updatedAt: false }
  );
  QuestionAnswer.associate = (models) => {
    QuestionAnswer.belongsTo(models.Question, { as: "Question", targetKey: "id", foreignKey: "questionId" });
  };
  return QuestionAnswer;
};
