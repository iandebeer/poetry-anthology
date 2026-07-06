{-# LANGUAGE OverloadedStrings #-}

module Main
  ( main
  )
where

import Domain.Types
  ( DomainData (..)
  , Hexagram (..)
  , LeelaState (..)
  , MovingLine (..)
  , Reading (..)
  , ReadingRequest (..)
  )
import Engine.Reading (generateReading)

main :: IO ()
main = do
  assert "explicit state is honored" explicitStateIsHonored
  assert "generated readings are deterministic" generatedReadingsAreDeterministic
  assert "empty explicit moving lines are rejected" emptyMovingLinesRejected

assert :: String -> Bool -> IO ()
assert label condition =
  if condition
    then putStrLn ("ok - " <> label)
    else fail ("failed - " <> label)

explicitStateIsHonored :: Bool
explicitStateIsHonored =
  case generateReading sampleDomain request of
    Right reading -> stateId (readingState reading) == 2
    Left _ -> False
  where
    request =
      ReadingRequest
        { question = "What is asking for attention?"
        , leelaStateId = Just 2
        , hexagramNumberInput = Just 1
        , movingLinesInput = Just [Foundation, Vision]
        }

generatedReadingsAreDeterministic :: Bool
generatedReadingsAreDeterministic =
  generateReading sampleDomain request == generateReading sampleDomain request
  where
    request =
      ReadingRequest
        { question = "How should I meet this transition?"
        , leelaStateId = Nothing
        , hexagramNumberInput = Nothing
        , movingLinesInput = Nothing
        }

emptyMovingLinesRejected :: Bool
emptyMovingLinesRejected =
  case generateReading sampleDomain request of
    Left _ -> True
    Right _ -> False
  where
    request =
      ReadingRequest
        { question = "Can an empty line set pass?"
        , leelaStateId = Nothing
        , hexagramNumberInput = Nothing
        , movingLinesInput = Just []
        }

sampleDomain :: DomainData
sampleDomain =
  DomainData
    { leelaStates =
        [ LeelaState 1 "Innocence" "Direct experience." "Beginner's mind"
        , LeelaState 2 "Seeking" "Longing becomes movement." "Pilgrim"
        ]
    , hexagrams =
        [ Hexagram 1 "The Creative" "Persevere." "Heaven moves." "Heaven" "Heaven"
        , Hexagram 2 "The Receptive" "Receive." "Earth yields." "Earth" "Earth"
        ]
    , movingLineFocuses = []
    }
