{-# LANGUAGE OverloadedStrings #-}

module Engine.Reading
  ( ReadingError (..)
  , generateReading
  )
where

import Data.List (find, nub)
import Data.Text (Text)
import qualified Data.Text as T
import Domain.Types
  ( DomainData (..)
  , Hexagram (..)
  , LeelaState (..)
  , MovingLine (..)
  , Reading (..)
  , ReadingRequest (..)
  , movingLineFromNumber
  )
import Interpretation.Engine (interpretReading)

newtype ReadingError = ReadingError
  { renderReadingError :: Text
  }
  deriving (Eq, Show)

generateReading :: DomainData -> ReadingRequest -> Either ReadingError Reading
generateReading domain request = do
  state <- resolveState domain request
  hexagram <- resolveHexagram domain request state
  activeLines <- resolveMovingLines request state hexagram
  let interpretation =
        interpretReading
          (movingLineFocuses domain)
          (question request)
          state
          hexagram
          activeLines
  pure
    Reading
      { readingQuestion = question request
      , readingState = state
      , readingHexagram = hexagram
      , readingMovingLines = activeLines
      , readingInterpretation = interpretation
      }

resolveState :: DomainData -> ReadingRequest -> Either ReadingError LeelaState
resolveState domain request =
  case leelaStateId request of
    Just requestedId ->
      maybe
        (Left (ReadingError ("Unknown leelaStateId: " <> T.pack (show requestedId))))
        Right
        (find ((== requestedId) . stateId) (leelaStates domain))
    Nothing ->
      selectFrom "leela states" (leelaStates domain) (questionHash request)

resolveHexagram :: DomainData -> ReadingRequest -> LeelaState -> Either ReadingError Hexagram
resolveHexagram domain request state =
  case hexagramNumberInput request of
    Just requestedNumber ->
      maybe
        (Left (ReadingError ("Unknown hexagramNumber: " <> T.pack (show requestedNumber))))
        Right
        (find ((== requestedNumber) . hexagramNumber) (hexagrams domain))
    Nothing ->
      selectFrom
        "hexagrams"
        (hexagrams domain)
        (questionHash request + stateId state * 17)

resolveMovingLines ::
  ReadingRequest ->
  LeelaState ->
  Hexagram ->
  Either ReadingError [MovingLine]
resolveMovingLines request state hexagram =
  case movingLinesInput request of
    Just [] -> Left (ReadingError "movingLines must not be empty when provided")
    Just requestedLines -> Right (nub requestedLines)
    Nothing -> Right (deriveMovingLines request state hexagram)

deriveMovingLines :: ReadingRequest -> LeelaState -> Hexagram -> [MovingLine]
deriveMovingLines request state hexagram =
  take lineCount $
    toLine <$> [seed .. seed + 5]
  where
    seed =
      questionHash request
        + stateId state * 31
        + hexagramNumber hexagram * 43

    lineCount = 1 + seed `mod` 3

    toLine value =
      case movingLineFromNumber (1 + value `mod` 6) of
        Just line -> line
        Nothing -> Foundation

selectFrom :: Text -> [a] -> Int -> Either ReadingError a
selectFrom label values seed =
  case values of
    [] -> Left (ReadingError ("No " <> label <> " are loaded"))
    _ -> Right (values !! (seed `mod` length values))

questionHash :: ReadingRequest -> Int
questionHash request =
  let base = T.strip (question request)
   in T.foldl' step 5381 base
  where
    step accumulator char =
      accumulator * 33 + fromEnum char

