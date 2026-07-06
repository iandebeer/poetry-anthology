{-# LANGUAGE OverloadedStrings #-}

module Interpretation.Engine
  ( interpretReading
  )
where

import Data.List (find)
import Data.Maybe (fromMaybe)
import Data.Text (Text)
import qualified Data.Text as T
import Domain.Types
  ( Hexagram (..)
  , Interpretation (..)
  , LeelaState (..)
  , MovingLine (..)
  , MovingLineFocus (..)
  , lineName
  )

interpretReading ::
  [MovingLineFocus] ->
  Text ->
  LeelaState ->
  Hexagram ->
  [MovingLine] ->
  Interpretation
interpretReading lineFocuses inquiry state hexagram activeLines =
  Interpretation
    { summary =
        "The question meets "
          <> stateName state
          <> " through Hexagram "
          <> T.pack (show (hexagramNumber hexagram))
          <> ", "
          <> hexagramName hexagram
          <> "."
    , stateReflection =
        stateName state
          <> " asks you to notice: "
          <> stateDescription state
    , changeReflection =
        "The change pattern joins "
          <> lowerTrigram hexagram
          <> " below with "
          <> upperTrigram hexagram
          <> " above. Judgment: "
          <> judgment hexagram
          <> " Image: "
          <> image hexagram
    , lineReflections = lineReflection <$> activeLines
    , practice =
        "Hold the inquiry"
          <> renderedInquiry
          <> " as a living experiment: observe the present state, allow the change, and write the meaning that emerges."
    }
  where
    renderedInquiry =
      if T.null (T.strip inquiry)
        then ""
        else " \"" <> T.strip inquiry <> "\""

    lineReflection line =
      case find ((== line) . movingLine) lineFocuses of
        Just focus ->
          lineName line
            <> " - "
            <> lineTheme focus
            <> ": "
            <> lineLesson focus
        Nothing ->
          lineName line
            <> " - "
            <> fallbackLesson line

    fallbackLesson line =
      fromMaybe
        "Return to the direct experience of this line."
        (lookup line defaultLessons)

    defaultLessons =
      [ (Foundation, "Stabilize the root of the situation before moving.")
      , (Relationship, "Look for the other, the mirror, and the bond.")
      , (Action, "Test the teaching through one embodied step.")
      , (Vision, "Open the wider pattern without leaving the ground.")
      , (Expression, "Speak or create from the ripened center.")
      , (Transcendence, "Release ownership and let the lesson complete itself.")
      ]
