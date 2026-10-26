/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

export default (sequelize, DataTypes) => {
  const Question = sequelize.define(
    "Question",
    {
      id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      profileId: { type: DataTypes.UUID, allowNull: false },
      title: { type: DataTypes.STRING, allowNull: true },
      questionText: { type: DataTypes.TEXT, allowNull: false },
      option: { type: DataTypes.JSON, allowNull: true },
      optionList: { type: DataTypes.JSON, allowNull: true },
      eventId: { type: DataTypes.UUID, allowNull: true },
    },
    { tableName: "question", updatedAt: false }
  );
  Question.associate = (models) => {
    Question.hasMany(models.QuestionAnswer, { as: "QuestionAnswer", foreignKey: "questionId", sourceKey: "id" });
    Question.hasMany(models.QuestionShare, { as: "QuestionShares", foreignKey: "newQuestionId", sourceKey: "id" });
  };

  Question.addHook("afterSave", async (instance, options) => {
    if (!instance.changed("eventId")) {
      const QuestionLog = instance.sequelize.models.get("QuestionLog");
      if (!QuestionLog) {
        console.error("QuestionLog model not found.");
        return;
      }

      const isCreate = instance._options.isNewRecord;
      const log = await QuestionLog.create(
        {
          questionId: instance.id,
          profileId: instance.profileId,
          actionData: instance.dataValues,
          action: isCreate ? "create" : "update",
          originalData: isCreate ? null : instance._previousDataValues,
          lastEventId: isCreate ? null : instance._previousDataValues.eventId,
        },
        { transaction: options.transaction }
      );

      await instance.update({ eventId: log.id });
    }
  });

  return Question;
};
