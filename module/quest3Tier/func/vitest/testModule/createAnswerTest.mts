/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { test, expect } from "vitest";
import { AddAnswer } from "../../handler/answer/AddAnswer.mjs";
import { invokeHandler } from "./functionAppMock.mjs";

const createAnswer = (profileIdLookup, questionIdLookup) => {
  test.each(answerData())("answer question $questionId by user $userId", async (answer) => {
    const response = await invokeHandler(AddAnswer, {
      userData: {
        profileId: await profileIdLookup.getProfileId(answer.userId),
      },
      params: { questionId: questionIdLookup.getQuestionId(answer.questionId) },
      clientParams: answer,
    });
    expect(response.return.id).toBeDefined();
  });
};

function answerData() {
  return [
    // Question 1: Taiwan's Capital City
    {
      userId: 1,
      questionId: 1,
      question: "The capital city is situated in the north. What is it called?",
      option: "Taipei",
      answer: null,
      duration: 1120,
    },
    {
      userId: 2,
      questionId: 1,
      question: "The capital city is situated in the north. What is it called?",
      option: "Taichung",
      answer: null,
      duration: 1345,
    },
    {
      userId: 3,
      questionId: 1,
      question: "The capital city is situated in the north. What is it called?",
      option: "Taipei",
      answer: null,
      duration: 980,
    },
    {
      userId: 4,
      questionId: 1,
      question: "The capital city is situated in the north. What is it called?",
      option: "Tainan",
      answer: null,
      duration: 1530,
    },
    {
      userId: 5,
      questionId: 1,
      question: "The capital city is situated in the north. What is it called?",
      option: "Taichung",
      answer: null,
      duration: 1102,
    },
    {
      userId: 6,
      questionId: 1,
      question: "The capital city is situated in the north. What is it called?",
      option: "Taipei",
      answer: null,
      duration: 1423,
    },
    {
      userId: 7,
      questionId: 1,
      question: "The capital city is situated in the north. What is it called?",
      option: "Taidong",
      answer: null,
      duration: 1654,
    },
    {
      userId: 8,
      questionId: 1,
      question: "The capital city is situated in the north. What is it called?",
      option: "Tainan",
      answer: null,
      duration: 1280,
    },
    {
      userId: 9,
      questionId: 1,
      question: "The capital city is situated in the north. What is it called?",
      option: "Taipei",
      answer: null,
      duration: 1450,
    },
    {
      userId: 10,
      questionId: 1,
      question: "The capital city is situated in the north. What is it called?",
      option: "Taipei",
      answer: null,
      duration: 1720,
    },
    {
      userId: 11,
      questionId: 1,
      question: "The capital city is situated in the north. What is it called?",
      option: "Taichung",
      answer: null,
      duration: 1210,
    },
    {
      userId: 12,
      questionId: 1,
      question: "The capital city is situated in the north. What is it called?",
      option: "Taipei",
      answer: null,
      duration: 1300,
    },
    {
      userId: 13,
      questionId: 1,
      question: "The capital city is situated in the north. What is it called?",
      option: "Taidong",
      answer: null,
      duration: 1105,
    },
    {
      userId: 14,
      questionId: 1,
      question: "The capital city is situated in the north. What is it called?",
      option: "Tainan",
      answer: null,
      duration: 1430,
    },
    {
      userId: 15,
      questionId: 1,
      question: "The capital city is situated in the north. What is it called?",
      option: "Taichung",
      answer: null,
      duration: 1355,
    },
    {
      userId: 16,
      questionId: 1,
      question: "The capital city is situated in the north. What is it called?",
      option: "Taipei",
      answer: null,
      duration: 1275,
    },
    {
      userId: 17,
      questionId: 1,
      question: "The capital city is situated in the north. What is it called?",
      option: "Taipei",
      answer: null,
      duration: 1190,
    },
    {
      userId: 18,
      questionId: 1,
      question: "The capital city is situated in the north. What is it called?",
      option: "Taichung",
      answer: null,
      duration: 1405,
    },
    {
      userId: 19,
      questionId: 1,
      question: "The capital city is situated in the north. What is it called?",
      option: "Taidong",
      answer: null,
      duration: 1325,
    },
    {
      userId: 20,
      questionId: 1,
      question: "The capital city is situated in the north. What is it called?",
      option: "Taipei",
      answer: null,
      duration: 1560,
    },

    // Question 2: Taiwan's Tallest Peak
    {
      userId: 1,
      questionId: 2,
      question:
        "Taiwan is the island with the highest mountain density in the world, with 268 peaks over 3,000 meters. What is the highest peak, meaning 'Jade Mountain,' in Taiwan at 3,952 meters?",
      option: "Yushan",
      answer: null,
      duration: 1105,
    },
    {
      userId: 2,
      questionId: 2,
      question:
        "Taiwan is the island with the highest mountain density in the world, with 268 peaks over 3,000 meters. What is the highest peak, meaning 'Jade Mountain,' in Taiwan at 3,952 meters?",
      option: "Alishan",
      answer: null,
      duration: 1225,
    },
    {
      userId: 3,
      questionId: 2,
      question:
        "Taiwan is the island with the highest mountain density in the world, with 268 peaks over 3,000 meters. What is the highest peak, meaning 'Jade Mountain,' in Taiwan at 3,952 meters?",
      option: "Yushan",
      answer: null,
      duration: 1040,
    },
    {
      userId: 4,
      questionId: 2,
      question:
        "Taiwan is the island with the highest mountain density in the world, with 268 peaks over 3,000 meters. What is the highest peak, meaning 'Jade Mountain,' in Taiwan at 3,952 meters?",
      option: "Yushan",
      answer: null,
      duration: 980,
    },
    {
      userId: 5,
      questionId: 2,
      question:
        "Taiwan is the island with the highest mountain density in the world, with 268 peaks over 3,000 meters. What is the highest peak, meaning 'Jade Mountain,' in Taiwan at 3,952 meters?",
      option: "Yushan",
      answer: null,
      duration: 1130,
    },
    {
      userId: 6,
      questionId: 2,
      question:
        "Taiwan is the island with the highest mountain density in the world, with 268 peaks over 3,000 meters. What is the highest peak, meaning 'Jade Mountain,' in Taiwan at 3,952 meters?",
      option: "Yushan",
      answer: null,
      duration: 1345,
    },
    {
      userId: 7,
      questionId: 2,
      question:
        "Taiwan is the island with the highest mountain density in the world, with 268 peaks over 3,000 meters. What is the highest peak, meaning 'Jade Mountain,' in Taiwan at 3,952 meters?",
      option: "Yushan",
      answer: null,
      duration: 1200,
    },
    {
      userId: 8,
      questionId: 2,
      question:
        "Taiwan is the island with the highest mountain density in the world, with 268 peaks over 3,000 meters. What is the highest peak, meaning 'Jade Mountain,' in Taiwan at 3,952 meters?",
      option: "Alishan",
      answer: null,
      duration: 1180,
    },
    {
      userId: 9,
      questionId: 2,
      question:
        "Taiwan is the island with the highest mountain density in the world, with 268 peaks over 3,000 meters. What is the highest peak, meaning 'Jade Mountain,' in Taiwan at 3,952 meters?",
      option: "Yushan",
      answer: null,
      duration: 1250,
    },
    {
      userId: 10,
      questionId: 2,
      question:
        "Taiwan is the island with the highest mountain density in the world, with 268 peaks over 3,000 meters. What is the highest peak, meaning 'Jade Mountain,' in Taiwan at 3,952 meters?",
      option: "Yushan",
      answer: null,
      duration: 1100,
    },
    {
      userId: 11,
      questionId: 2,
      question:
        "Taiwan is the island with the highest mountain density in the world, with 268 peaks over 3,000 meters. What is the highest peak, meaning 'Jade Mountain,' in Taiwan at 3,952 meters?",
      option: "Alishan",
      answer: null,
      duration: 1210,
    },
    {
      userId: 12,
      questionId: 2,
      question:
        "Taiwan is the island with the highest mountain density in the world, with 268 peaks over 3,000 meters. What is the highest peak, meaning 'Jade Mountain,' in Taiwan at 3,952 meters?",
      option: "Yushan",
      answer: null,
      duration: 1375,
    },
    {
      userId: 13,
      questionId: 2,
      question:
        "Taiwan is the island with the highest mountain density in the world, with 268 peaks over 3,000 meters. What is the highest peak, meaning 'Jade Mountain,' in Taiwan at 3,952 meters?",
      option: "Yushan",
      answer: null,
      duration: 1220,
    },
    {
      userId: 14,
      questionId: 2,
      question:
        "Taiwan is the island with the highest mountain density in the world, with 268 peaks over 3,000 meters. What is the highest peak, meaning 'Jade Mountain,' in Taiwan at 3,952 meters?",
      option: "Yushan",
      answer: null,
      duration: 1185,
    },
    {
      userId: 15,
      questionId: 2,
      question:
        "Taiwan is the island with the highest mountain density in the world, with 268 peaks over 3,000 meters. What is the highest peak, meaning 'Jade Mountain,' in Taiwan at 3,952 meters?",
      option: "Yushan",
      answer: null,
      duration: 1305,
    },
    {
      userId: 16,
      questionId: 2,
      question:
        "Taiwan is the island with the highest mountain density in the world, with 268 peaks over 3,000 meters. What is the highest peak, meaning 'Jade Mountain,' in Taiwan at 3,952 meters?",
      option: "Yushan",
      answer: null,
      duration: 1420,
    },
    {
      userId: 17,
      questionId: 2,
      question:
        "Taiwan is the island with the highest mountain density in the world, with 268 peaks over 3,000 meters. What is the highest peak, meaning 'Jade Mountain,' in Taiwan at 3,952 meters?",
      option: "Yushan",
      answer: null,
      duration: 1275,
    },
    {
      userId: 18,
      questionId: 2,
      question:
        "Taiwan is the island with the highest mountain density in the world, with 268 peaks over 3,000 meters. What is the highest peak, meaning 'Jade Mountain,' in Taiwan at 3,952 meters?",
      option: "Yushan",
      answer: null,
      duration: 1395,
    },
    {
      userId: 19,
      questionId: 2,
      question:
        "Taiwan is the island with the highest mountain density in the world, with 268 peaks over 3,000 meters. What is the highest peak, meaning 'Jade Mountain,' in Taiwan at 3,952 meters?",
      option: "Yushan",
      answer: null,
      duration: 1400,
    },
    {
      userId: 20,
      questionId: 2,
      question:
        "Taiwan is the island with the highest mountain density in the world, with 268 peaks over 3,000 meters. What is the highest peak, meaning 'Jade Mountain,' in Taiwan at 3,952 meters?",
      option: "Yushan",
      answer: null,
      duration: 1435,
    },

    // Question 3: Sky Lantern Festival
    {
      userId: 1,
      questionId: 3,
      question: "Which town in Taiwan is famous for its sky lantern festival, where people write wishes on lanterns and release them into the night sky?",
      option: "Pingxi",
      answer: null,
      duration: 1150,
    },
    {
      userId: 2,
      questionId: 3,
      question: "Which town in Taiwan is famous for its sky lantern festival, where people write wishes on lanterns and release them into the night sky?",
      option: "Kenting",
      answer: null,
      duration: 1325,
    },
    {
      userId: 3,
      questionId: 3,
      question: "Which town in Taiwan is famous for its sky lantern festival, where people write wishes on lanterns and release them into the night sky?",
      option: "Pingxi",
      answer: null,
      duration: 1200,
    },
    {
      userId: 4,
      questionId: 3,
      question: "Which town in Taiwan is famous for its sky lantern festival, where people write wishes on lanterns and release them into the night sky?",
      option: "Tamsui",
      answer: null,
      duration: 1270,
    },
    {
      userId: 5,
      questionId: 3,
      question: "Which town in Taiwan is famous for its sky lantern festival, where people write wishes on lanterns and release them into the night sky?",
      option: "Pingxi",
      answer: null,
      duration: 1330,
    },
    {
      userId: 6,
      questionId: 3,
      question: "Which town in Taiwan is famous for its sky lantern festival, where people write wishes on lanterns and release them into the night sky?",
      option: "Pingxi",
      answer: null,
      duration: 1250,
    },
    {
      userId: 7,
      questionId: 3,
      question: "Which town in Taiwan is famous for its sky lantern festival, where people write wishes on lanterns and release them into the night sky?",
      option: "Pingxi",
      answer: null,
      duration: 1360,
    },
    {
      userId: 8,
      questionId: 3,
      question: "Which town in Taiwan is famous for its sky lantern festival, where people write wishes on lanterns and release them into the night sky?",
      option: "Kenting",
      answer: null,
      duration: 1240,
    },
    {
      userId: 9,
      questionId: 3,
      question: "Which town in Taiwan is famous for its sky lantern festival, where people write wishes on lanterns and release them into the night sky?",
      option: "Tamsui",
      answer: null,
      duration: 1305,
    },
    {
      userId: 10,
      questionId: 3,
      question: "Which town in Taiwan is famous for its sky lantern festival, where people write wishes on lanterns and release them into the night sky?",
      option: "Pingxi",
      answer: null,
      duration: 1125,
    },
    {
      userId: 11,
      questionId: 3,
      question: "Which town in Taiwan is famous for its sky lantern festival, where people write wishes on lanterns and release them into the night sky?",
      option: "Pingxi",
      answer: null,
      duration: 1260,
    },
    {
      userId: 12,
      questionId: 3,
      question: "Which town in Taiwan is famous for its sky lantern festival, where people write wishes on lanterns and release them into the night sky?",
      option: "Pingxi",
      answer: null,
      duration: 1180,
    },
    {
      userId: 13,
      questionId: 3,
      question: "Which town in Taiwan is famous for its sky lantern festival, where people write wishes on lanterns and release them into the night sky?",
      option: "Pingxi",
      answer: null,
      duration: 1375,
    },
    {
      userId: 14,
      questionId: 3,
      question: "Which town in Taiwan is famous for its sky lantern festival, where people write wishes on lanterns and release them into the night sky?",
      option: "Tamsui",
      answer: null,
      duration: 1220,
    },
    {
      userId: 15,
      questionId: 3,
      question: "Which town in Taiwan is famous for its sky lantern festival, where people write wishes on lanterns and release them into the night sky?",
      option: "Pingxi",
      answer: null,
      duration: 1165,
    },
    {
      userId: 16,
      questionId: 3,
      question: "Which town in Taiwan is famous for its sky lantern festival, where people write wishes on lanterns and release them into the night sky?",
      option: "Pingxi",
      answer: null,
      duration: 1400,
    },
    {
      userId: 17,
      questionId: 3,
      question: "Which town in Taiwan is famous for its sky lantern festival, where people write wishes on lanterns and release them into the night sky?",
      option: "Pingxi",
      answer: null,
      duration: 1185,
    },
    {
      userId: 18,
      questionId: 3,
      question: "Which town in Taiwan is famous for its sky lantern festival, where people write wishes on lanterns and release them into the night sky?",
      option: "Pingxi",
      answer: null,
      duration: 1335,
    },
    {
      userId: 19,
      questionId: 3,
      question: "Which town in Taiwan is famous for its sky lantern festival, where people write wishes on lanterns and release them into the night sky?",
      option: "Pingxi",
      answer: null,
      duration: 1205,
    },
    {
      userId: 20,
      questionId: 3,
      question: "Which town in Taiwan is famous for its sky lantern festival, where people write wishes on lanterns and release them into the night sky?",
      option: "Kenting",
      answer: null,
      duration: 1290,
    },

    // Question 4: Taiwan’s Indigenous Languages
    {
      userId: 1,
      questionId: 4,
      question:
        "Taiwan is home to 16 officially recognized indigenous groups. But did you know that their languages belong to a single language family that stretches all the way from Taiwan to the Philippines, Hawaii, New Zealand, and even Madagascar? Which language family do Taiwan’s indigenous languages belong to?",
      option: "Austronesian",
      answer: null,
      duration: 1230,
    },
    {
      userId: 2,
      questionId: 4,
      question:
        "Taiwan is home to 16 officially recognized indigenous groups. But did you know that their languages belong to a single language family that stretches all the way from Taiwan to the Philippines, Hawaii, New Zealand, and even Madagascar? Which language family do Taiwan’s indigenous languages belong to?",
      option: "Austronesian",
      answer: null,
      duration: 1210,
    },
    {
      userId: 3,
      questionId: 4,
      question:
        "Taiwan is home to 16 officially recognized indigenous groups. But did you know that their languages belong to a single language family that stretches all the way from Taiwan to the Philippines, Hawaii, New Zealand, and even Madagascar? Which language family do Taiwan’s indigenous languages belong to?",
      option: "Austronesian",
      answer: null,
      duration: 1160,
    },
    {
      userId: 4,
      questionId: 4,
      question:
        "Taiwan is home to 16 officially recognized indigenous groups. But did you know that their languages belong to a single language family that stretches all the way from Taiwan to the Philippines, Hawaii, New Zealand, and even Madagascar? Which language family do Taiwan’s indigenous languages belong to?",
      option: "Austronesian",
      answer: null,
      duration: 1195,
    },
    {
      userId: 5,
      questionId: 4,
      question:
        "Taiwan is home to 16 officially recognized indigenous groups. But did you know that their languages belong to a single language family that stretches all the way from Taiwan to the Philippines, Hawaii, New Zealand, and even Madagascar? Which language family do Taiwan’s indigenous languages belong to?",
      option: "Austronesian",
      answer: null,
      duration: 1235,
    },
    {
      userId: 6,
      questionId: 4,
      question:
        "Taiwan is home to 16 officially recognized indigenous groups. But did you know that their languages belong to a single language family that stretches all the way from Taiwan to the Philippines, Hawaii, New Zealand, and even Madagascar? Which language family do Taiwan’s indigenous languages belong to?",
      option: "Austronesian",
      answer: null,
      duration: 1270,
    },
    {
      userId: 7,
      questionId: 4,
      question:
        "Taiwan is home to 16 officially recognized indigenous groups. But did you know that their languages belong to a single language family that stretches all the way from Taiwan to the Philippines, Hawaii, New Zealand, and even Madagascar? Which language family do Taiwan’s indigenous languages belong to?",
      option: "Austronesian",
      answer: null,
      duration: 1200,
    },
    {
      userId: 8,
      questionId: 4,
      question:
        "Taiwan is home to 16 officially recognized indigenous groups. But did you know that their languages belong to a single language family that stretches all the way from Taiwan to the Philippines, Hawaii, New Zealand, and even Madagascar? Which language family do Taiwan’s indigenous languages belong to?",
      option: "Austronesian",
      answer: null,
      duration: 1295,
    },
    {
      userId: 9,
      questionId: 4,
      question:
        "Taiwan is home to 16 officially recognized indigenous groups. But did you know that their languages belong to a single language family that stretches all the way from Taiwan to the Philippines, Hawaii, New Zealand, and even Madagascar? Which language family do Taiwan’s indigenous languages belong to?",
      option: "Austronesian",
      answer: null,
      duration: 1185,
    },
    {
      userId: 10,
      questionId: 4,
      question:
        "Taiwan is home to 16 officially recognized indigenous groups. But did you know that their languages belong to a single language family that stretches all the way from Taiwan to the Philippines, Hawaii, New Zealand, and even Madagascar? Which language family do Taiwan’s indigenous languages belong to?",
      option: "Austronesian",
      answer: null,
      duration: 1220,
    },
    {
      userId: 11,
      questionId: 4,
      question:
        "Taiwan is home to 16 officially recognized indigenous groups. But did you know that their languages belong to a single language family that stretches all the way from Taiwan to the Philippines, Hawaii, New Zealand, and even Madagascar? Which language family do Taiwan’s indigenous languages belong to?",
      option: "Austronesian",
      answer: null,
      duration: 845,
    },
    {
      userId: 12,
      questionId: 4,
      question:
        "Taiwan is home to 16 officially recognized indigenous groups. But did you know that their languages belong to a single language family that stretches all the way from Taiwan to the Philippines, Hawaii, New Zealand, and even Madagascar? Which language family do Taiwan’s indigenous languages belong to?",
      option: "Austro-Asiatic",
      answer: null,
      duration: 765,
    },
    {
      userId: 13,
      questionId: 4,
      question:
        "Taiwan is home to 16 officially recognized indigenous groups. But did you know that their languages belong to a single language family that stretches all the way from Taiwan to the Philippines, Hawaii, New Zealand, and even Madagascar? Which language family do Taiwan’s indigenous languages belong to?",
      option: "Sino-Tibetan",
      answer: null,
      duration: 812,
    },
    {
      userId: 14,
      questionId: 4,
      question:
        "Taiwan is home to 16 officially recognized indigenous groups. But did you know that their languages belong to a single language family that stretches all the way from Taiwan to the Philippines, Hawaii, New Zealand, and even Madagascar? Which language family do Taiwan’s indigenous languages belong to?",
      option: "Austronesian",
      answer: null,
      duration: 932,
    },
    {
      userId: 15,
      questionId: 4,
      question:
        "Taiwan is home to 16 officially recognized indigenous groups. But did you know that their languages belong to a single language family that stretches all the way from Taiwan to the Philippines, Hawaii, New Zealand, and even Madagascar? Which language family do Taiwan’s indigenous languages belong to?",
      option: "Austro-Asiatic",
      answer: null,
      duration: 984,
    },
    {
      userId: 16,
      questionId: 4,
      question:
        "Taiwan is home to 16 officially recognized indigenous groups. But did you know that their languages belong to a single language family that stretches all the way from Taiwan to the Philippines, Hawaii, New Zealand, and even Madagascar? Which language family do Taiwan’s indigenous languages belong to?",
      option: "Austronesian",
      answer: null,
      duration: 756,
    },
    {
      userId: 17,
      questionId: 4,
      question:
        "Taiwan is home to 16 officially recognized indigenous groups. But did you know that their languages belong to a single language family that stretches all the way from Taiwan to the Philippines, Hawaii, New Zealand, and even Madagascar? Which language family do Taiwan’s indigenous languages belong to?",
      option: "Sino-Tibetan",
      answer: null,
      duration: 821,
    },
    {
      userId: 18,
      questionId: 4,
      question:
        "Taiwan is home to 16 officially recognized indigenous groups. But did you know that their languages belong to a single language family that stretches all the way from Taiwan to the Philippines, Hawaii, New Zealand, and even Madagascar? Which language family do Taiwan’s indigenous languages belong to?",
      option: "Austronesian",
      answer: null,
      duration: 794,
    },
    {
      userId: 19,
      questionId: 4,
      question:
        "Taiwan is home to 16 officially recognized indigenous groups. But did you know that their languages belong to a single language family that stretches all the way from Taiwan to the Philippines, Hawaii, New Zealand, and even Madagascar? Which language family do Taiwan’s indigenous languages belong to?",
      option: "Min",
      answer: null,
      duration: 887,
    },
    {
      userId: 20,
      questionId: 4,
      question:
        "Taiwan is home to 16 officially recognized indigenous groups. But did you know that their languages belong to a single language family that stretches all the way from Taiwan to the Philippines, Hawaii, New Zealand, and even Madagascar? Which language family do Taiwan’s indigenous languages belong to?",
      option: "Austronesian",
      answer: null,
      duration: 904,
    },

    // Question 5: Temple Culture in Taiwan
    {
      userId: 1,
      questionId: 5,
      question: "Which sea goddess is the most widely worshiped deity in Taiwan, with hundreds of temples dedicated to her?",
      option: "Mazu",
      answer: null,
      duration: 1145,
    },
    {
      userId: 2,
      questionId: 5,
      question: "Which sea goddess is the most widely worshiped deity in Taiwan, with hundreds of temples dedicated to her?",
      option: "Guanyin",
      answer: null,
      duration: 1250,
    },
    {
      userId: 3,
      questionId: 5,
      question: "Which sea goddess is the most widely worshiped deity in Taiwan, with hundreds of temples dedicated to her?",
      option: "Mazu",
      answer: null,
      duration: 1195,
    },
    {
      userId: 4,
      questionId: 5,
      question: "Which sea goddess is the most widely worshiped deity in Taiwan, with hundreds of temples dedicated to her?",
      option: "Mazu",
      answer: null,
      duration: 1220,
    },
    {
      userId: 5,
      questionId: 5,
      question: "Which sea goddess is the most widely worshiped deity in Taiwan, with hundreds of temples dedicated to her?",
      option: "Guanyin",
      answer: null,
      duration: 1160,
    },
    {
      userId: 6,
      questionId: 5,
      question: "Which sea goddess is the most widely worshiped deity in Taiwan, with hundreds of temples dedicated to her?",
      option: "Mazu",
      answer: null,
      duration: 1280,
    },
    {
      userId: 7,
      questionId: 5,
      question: "Which sea goddess is the most widely worshiped deity in Taiwan, with hundreds of temples dedicated to her?",
      option: "Mazu",
      answer: null,
      duration: 1310,
    },
    {
      userId: 8,
      questionId: 5,
      question: "Which sea goddess is the most widely worshiped deity in Taiwan, with hundreds of temples dedicated to her?",
      option: "Mazu",
      answer: null,
      duration: 1200,
    },
    {
      userId: 9,
      questionId: 5,
      question: "Which sea goddess is the most widely worshiped deity in Taiwan, with hundreds of temples dedicated to her?",
      option: "Mazu",
      answer: null,
      duration: 1265,
    },
    {
      userId: 10,
      questionId: 5,
      question: "Which sea goddess is the most widely worshiped deity in Taiwan, with hundreds of temples dedicated to her?",
      option: "Guanyin",
      answer: null,
      duration: 1180,
    },
    {
      userId: 11,
      questionId: 5,
      question: "Which sea goddess is the most widely worshiped deity in Taiwan, with hundreds of temples dedicated to her?",
      option: "Mazu",
      answer: null,
      duration: 1275,
    },
    {
      userId: 12,
      questionId: 5,
      question: "Which sea goddess is the most widely worshiped deity in Taiwan, with hundreds of temples dedicated to her?",
      option: "Mazu",
      answer: null,
      duration: 1290,
    },
    {
      userId: 13,
      questionId: 5,
      question: "Which sea goddess is the most widely worshiped deity in Taiwan, with hundreds of temples dedicated to her?",
      option: "Mazu",
      answer: null,
      duration: 1165,
    },
    {
      userId: 14,
      questionId: 5,
      question: "Which sea goddess is the most widely worshiped deity in Taiwan, with hundreds of temples dedicated to her?",
      option: "Guanyin",
      answer: null,
      duration: 1245,
    },
    {
      userId: 15,
      questionId: 5,
      question: "Which sea goddess is the most widely worshiped deity in Taiwan, with hundreds of temples dedicated to her?",
      option: "Mazu",
      answer: null,
      duration: 1215,
    },
    {
      userId: 16,
      questionId: 5,
      question: "Which sea goddess is the most widely worshiped deity in Taiwan, with hundreds of temples dedicated to her?",
      option: "Mazu",
      answer: null,
      duration: 1340,
    },
    {
      userId: 17,
      questionId: 5,
      question: "Which sea goddess is the most widely worshiped deity in Taiwan, with hundreds of temples dedicated to her?",
      option: "Mazu",
      answer: null,
      duration: 1280,
    },
    {
      userId: 18,
      questionId: 5,
      question: "Which sea goddess is the most widely worshiped deity in Taiwan, with hundreds of temples dedicated to her?",
      option: "Mazu",
      answer: null,
      duration: 1300,
    },
    {
      userId: 19,
      questionId: 5,
      question: "Which sea goddess is the most widely worshiped deity in Taiwan, with hundreds of temples dedicated to her?",
      option: "Mazu",
      answer: null,
      duration: 1190,
    },
    {
      userId: 20,
      questionId: 5,
      question: "Which sea goddess is the most widely worshiped deity in Taiwan, with hundreds of temples dedicated to her?",
      option: "Mazu",
      answer: null,
      duration: 1320,
    },

    // Question 6: Language of Taiwan

    { userId: 1, questionId: 6, question: "What is the official language of Taiwan?", option: null, answer: "Mandarin Chinese", duration: 578 },
    {
      userId: 2,
      questionId: 6,
      question: "What is the official language of Taiwan?",
      option: "Mandarin",
      answer: "Mandarin, but a lot of people also speak Taiwanese.",
      duration: 432,
    },
    {
      userId: 3,
      questionId: 6,
      question: "What is the official language of Taiwan?",
      option: "Mandarin",
      answer: "I think it's Mandarin? Not sure if Taiwanese counts.",
      duration: 587,
    },
    {
      userId: 4,
      questionId: 6,
      question: "What is the official language of Taiwan?",
      option: "Taiwanese",
      answer: "Taiwanese? Or maybe Mandarin?",
      duration: 501,
    },
    {
      userId: 5,
      questionId: 6,
      question: "What is the official language of Taiwan?",
      option: "Chinese",
      answer: "Pretty sure it's Chinese, but which kind... Mandarin?",
      duration: 468,
    },
    {
      userId: 6,
      questionId: 6,
      question: "What is the official language of Taiwan?",
      option: "Mandarin",
      answer: "Officially Mandarin, but people speak different languages.",
      duration: 512,
    },
    {
      userId: 7,
      questionId: 6,
      question: "What is the official language of Taiwan?",
      option: "Taiwanese",
      answer: "Isn't it Taiwanese? Or is that just a dialect?",
      duration: 462,
    },
    {
      userId: 8,
      questionId: 6,
      question: "What is the official language of Taiwan?",
      option: "Japanese",
      answer: "I thought it was Japanese a long time ago?",
      duration: 589,
    },
    {
      userId: 9,
      questionId: 6,
      question: "What is the official language of Taiwan?",
      option: "Mandarin",
      answer: "Mandarin, but Hokkien and Hakka are also common.",
      duration: 537,
    },
    {
      userId: 10,
      questionId: 6,
      question: "What is the official language of Taiwan?",
      option: "Mandarin",
      answer: "No idea, but people here seem to speak Mandarin.",
      duration: 560,
    },
    {
      userId: 11,
      questionId: 6,
      question: "What is the official language of Taiwan?",
      option: "Mandarin",
      answer: "It should be Mandarin, right?",
      duration: 481,
    },
    {
      userId: 12,
      questionId: 6,
      question: "What is the official language of Taiwan?",
      option: "Chinese",
      answer: "Some kind of Chinese, but I’m not sure which one.",
      duration: 453,
    },
    {
      userId: 13,
      questionId: 6,
      question: "What is the official language of Taiwan?",
      option: "Mandarin",
      answer: "I guess it’s Mandarin, but I hear people speaking other things too.",
      duration: 490,
    },
    {
      userId: 14,
      questionId: 6,
      question: "What is the official language of Taiwan?",
      option: "Mandarin",
      answer: "Either Mandarin or Taiwanese… not sure which is official.",
      duration: 532,
    },
    {
      userId: 15,
      questionId: 6,
      question: "What is the official language of Taiwan?",
      option: "Mandarin",
      answer: "Mandarin? But I heard older people speaking something else.",
      duration: 477,
    },
    {
      userId: 16,
      questionId: 6,
      question: "What is the official language of Taiwan?",
      option: "Hokkien",
      answer: "I always thought it was Hokkien, but I could be wrong.",
      duration: 509,
    },
    {
      userId: 17,
      questionId: 6,
      question: "What is the official language of Taiwan?",
      option: "Chinese",
      answer: "Isn't it just Chinese? Wait, is Mandarin different from Chinese?",
      duration: 523,
    },
    {
      userId: 18,
      questionId: 6,
      question: "What is the official language of Taiwan?",
      option: "Mandarin",
      answer: "I think it’s Mandarin, but does English count?",
      duration: 487,
    },
    {
      userId: 19,
      questionId: 6,
      question: "What is the official language of Taiwan?",
      option: "Mandarin",
      answer: "Maybe it's a mix of Mandarin and other local languages?",
      duration: 472,
    },
    {
      userId: 20,
      questionId: 6,
      question: "What is the official language of Taiwan?",
      option: "Mandarin",
      answer: "Not sure… Taiwanese sounds like a language, but Mandarin is spoken more.",
      duration: 495,
    },
  ];
}

export { createAnswer };

// Question 7: What is your favorite actor?

// {
//   "userId": 1,
//   "questionId": 7,
//   "question": "What is your favorite actor?",
//   "option": null,
//   "answer": "Brad Pitt",
//   "duration": 432
// },
// {
//   "userId": 2,
//   "questionId": 7,
//   "question": "What is your favorite actor?",
//   "option": null,
//   "answer": "Leonardo DiCaprio",
//   "duration": 387
// },
// {
//   "userId": 3,
//   "questionId": 7,
//   "question": "What is your favorite actor?",
//   "option": null,
//   "answer": "Tom Hanks",
//   "duration": 400
// },
// {
//   "userId": 4,
//   "questionId": 7,
//   "question": "What is your favorite actor?",
//   "option": null,
//   "answer": "Brad Pitt",
//   "duration": 412
// },
// {
//   "userId": 5,
//   "questionId": 7,
//   "question": "What is your favorite actor?",
//   "option": null,
//   "answer": "Meryl Streep",
//   "duration": 450
// },
// {
//   "userId": 6,
//   "questionId": 7,
//   "question": "What is your favorite actor?",
//   "option": null,
//   "answer": "Scarlett Johansson",
//   "duration": 415
// },
// {
//   "userId": 7,
//   "questionId": 7,
//   "question": "What is your favorite actor?",
//   "option": null,
//   "answer": "Johnny Depp",
//   "duration": 475
// },
// {
//   "userId": 8,
//   "questionId": 7,
//   "question": "What is your favorite actor?",
//   "option": null,
//   "answer": "Will Smith",
//   "duration": 420
// },
// {
//   "userId": 9,
//   "questionId": 7,
//   "question": "What is your favorite actor?",
//   "option": null,
//   "answer": "Brad Pitt",
//   "duration": 430
// },
// {
//   "userId": 10,
//   "questionId": 7,
//   "question": "What is your favorite actor?",
//   "option": null,
//   "answer": "Morgan Freeman",
//   "duration": 460
// },
// {
//   "userId": 11,
//   "questionId": 7,
//   "question": "What is your favorite actor?",
//   "option": null,
//   "answer": "Chris Hemsworth",
//   "duration": 395
// },
// {
//   "userId": 12,
//   "questionId": 7,
//   "question": "What is your favorite actor?",
//   "option": null,
//   "answer": "Brad Pitt",
//   "duration": 440
// },
// {
//   "userId": 13,
//   "questionId": 7,
//   "question": "What is your favorite actor?",
//   "option": null,
//   "answer": "Emma Stone",
//   "duration": 455
// },
// {
//   "userId": 14,
//   "questionId": 7,
//   "question": "What is your favorite actor?",
//   "option": null,
//   "answer": "Dwayne Johnson",
//   "duration": 470
// },
// {
//   "userId": 15,
//   "questionId": 7,
//   "question": "What is your favorite actor?",
//   "option": null,
//   "answer": "Cate Blanchett",
//   "duration": 430
// },
// {
//   "userId": 16,
//   "questionId": 7,
//   "question": "What is your favorite actor?",
//   "option": null,
//   "answer": "Ryan Reynolds",
//   "duration": 460
// },
// {
//   "userId": 17,
//   "questionId": 7,
//   "question": "What is your favorite actor?",
//   "option": null,
//   "answer": "Brad Pitt",
//   "duration": 410
// },
// {
//   "userId": 18,
//   "questionId": 7,
//   "question": "What is your favorite actor?",
//   "option": null,
//   "answer": "Keanu Reeves",
//   "duration": 420
// },
// {
//   "userId": 19,
//   "questionId": 7,
//   "question": "What is your favorite actor?",
//   "option": null,
//   "answer": "Brad Pitt",
//   "duration": 450
// },
// {
//   "userId": 20,
//   "questionId": 7,
//   "question": "What is your favorite actor?",
//   "option": null,
//   "answer": "Hugh Jackman",
//   "duration": 430
// }

// [
//   { "userId": 1, "ans": ["Taipei", "Yushan", "Pingxi", "Austronesian", "Mazu"] },
//   { "userId": 2, "ans": ["Taichung", "Alishan", "Kenting", "Austronesian", "Guanyin"] },
//   { "userId": 3, "ans": ["Taipei", "Yushan", "Pingxi", "Austronesian", "Mazu"] },
//   { "userId": 4, "ans": ["Tainan", "Yushan", "Tamsui", "Austronesian", "Mazu"] },
//   { "userId": 5, "ans": ["Taichung", "Yushan", "Pingxi", "Austronesian", "Guanyin"] },
//   { "userId": 6, "ans": ["Taipei", "Yushan", "Pingxi", "Austronesian", "Mazu"] },
//   { "userId": 7, "ans": ["Taidong", "Yushan", "Pingxi", "Austronesian", "Mazu"] },
//   { "userId": 8, "ans": ["Tainan", "Alishan", "Kenting", "Austronesian", "Mazu"] },
//   { "userId": 9, "ans": ["Taipei", "Yushan", "Tamsui", "Austronesian", "Mazu"] },
//   { "userId": 10, "ans": ["Taipei", "Yushan", "Pingxi", "Austronesian", "Guanyin"] },
//   { "userId": 11, "ans": ["Taichung", "Alishan", "Pingxi", "Austro-Asiatic", "Mazu"] },
//   { "userId": 12, "ans": ["Taipei", "Yushan", "Pingxi", "Austro-Asiatic", "Mazu"] },
//   { "userId": 13, "ans": ["Taidong", "Yushan", "Pingxi", "Sino-Tibetan", "Mazu"] },
//   { "userId": 14, "ans": ["Tainan", "Yushan", "Tamsui", "Austronesian", "Guanyin"] },
//   { "userId": 15, "ans": ["Taichung", "Yushan", "Pingxi", "Austro-Asiatic", "Mazu"] },
//   { "userId": 16, "ans": ["Taipei", "Yushan", "Pingxi", "Austronesian", "Mazu"] },
//   { "userId": 17, "ans": ["Taipei", "Yushan", "Pingxi", "Sino-Tibetan", "Mazu"] },
//   { "userId": 18, "ans": ["Taichung", "Yushan", "Pingxi", "Austronesian", "Mazu"] },
//   { "userId": 19, "ans": ["Taidong", "Yushan", "Pingxi", "Min", "Mazu"] },
//   { "userId": 20, "ans": ["Taipei", "Yushan", "Kenting", "Austronesian", "Mazu"] }
// ]
