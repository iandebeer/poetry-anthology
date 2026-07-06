{-# LANGUAGE DeriveGeneric #-}
{-# LANGUAGE OverloadedStrings #-}

module Domain.Types
  ( DomainData (..)
  , Health (..)
  , Hexagram (..)
  , Interpretation (..)
  , LeelaState (..)
  , MovingLine (..)
  , MovingLineFocus (..)
  , Reading (..)
  , ReadingRequest (..)
  , lineName
  , lineNumber
  , movingLineFromNumber
  )
where

import Control.Applicative ((<|>))
import Data.Aeson
  ( FromJSON (..)
  , ToJSON (..)
  , Value (Number, String)
  , object
  , withObject
  , (.:)
  , (.:?)
  , (.=)
  )
import Data.Scientific (toBoundedInteger)
import Data.Text (Text)
import qualified Data.Text as T
import Data.Aeson.Types (Parser)
import GHC.Generics (Generic)

data LeelaState = LeelaState
  { stateId :: Int
  , stateName :: Text
  , stateDescription :: Text
  , stateSeed :: Text
  }
  deriving (Eq, Show, Generic)

instance FromJSON LeelaState
instance ToJSON LeelaState

data Hexagram = Hexagram
  { hexagramNumber :: Int
  , hexagramName :: Text
  , judgment :: Text
  , image :: Text
  , upperTrigram :: Text
  , lowerTrigram :: Text
  }
  deriving (Eq, Show, Generic)

instance FromJSON Hexagram
instance ToJSON Hexagram

data MovingLine
  = Foundation
  | Relationship
  | Action
  | Vision
  | Expression
  | Transcendence
  deriving (Bounded, Enum, Eq, Ord, Show)

lineNumber :: MovingLine -> Int
lineNumber line = fromEnum line + 1

lineName :: MovingLine -> Text
lineName Foundation = "Foundation"
lineName Relationship = "Relationship"
lineName Action = "Action"
lineName Vision = "Vision"
lineName Expression = "Expression"
lineName Transcendence = "Transcendence"

movingLineFromNumber :: Int -> Maybe MovingLine
movingLineFromNumber n
  | n >= 1 && n <= 6 = Just (toEnum (n - 1))
  | otherwise = Nothing

instance ToJSON MovingLine where
  toJSON line =
    object
      [ "number" .= lineNumber line
      , "name" .= lineName line
      ]

instance FromJSON MovingLine where
  parseJSON (Number n) =
    case toBoundedInteger n >>= movingLineFromNumber of
      Just line -> pure line
      Nothing -> fail "MovingLine number must be between 1 and 6"
  parseJSON (String raw) = parseLineNameText raw
  parseJSON value =
    parseLineNumberObject value <|> parseLineNameObject value

parseLineNumberObject :: Value -> Parser MovingLine
parseLineNumberObject =
  withObject "MovingLine" $ \lineObject -> do
    number <- lineObject .: "number"
    case movingLineFromNumber number of
      Just line -> pure line
      Nothing -> fail "MovingLine object number must be between 1 and 6"

parseLineNameObject :: Value -> Parser MovingLine
parseLineNameObject =
  withObject "MovingLine" $ \lineObject ->
    lineObject .: "name" >>= parseLineNameText

parseLineNameText :: Text -> Parser MovingLine
parseLineNameText raw =
  case lookup (T.toCaseFold raw) names of
    Just line -> pure line
    Nothing -> fail "MovingLine string must be one of the six line names"
  where
    names = [(T.toCaseFold (lineName line), line) | line <- [minBound .. maxBound]]

data MovingLineFocus = MovingLineFocus
  { movingLine :: MovingLine
  , lineTheme :: Text
  , lineLesson :: Text
  }
  deriving (Eq, Show, Generic)

instance FromJSON MovingLineFocus where
  parseJSON = withObject "MovingLineFocus" $ \value ->
    MovingLineFocus
      <$> value .: "movingLine"
      <*> value .: "lineTheme"
      <*> value .: "lineLesson"

instance ToJSON MovingLineFocus

data Interpretation = Interpretation
  { summary :: Text
  , stateReflection :: Text
  , changeReflection :: Text
  , lineReflections :: [Text]
  , practice :: Text
  }
  deriving (Eq, Show, Generic)

instance FromJSON Interpretation
instance ToJSON Interpretation

data Reading = Reading
  { readingQuestion :: Text
  , readingState :: LeelaState
  , readingHexagram :: Hexagram
  , readingMovingLines :: [MovingLine]
  , readingInterpretation :: Interpretation
  }
  deriving (Eq, Show, Generic)

instance FromJSON Reading
instance ToJSON Reading

data ReadingRequest = ReadingRequest
  { question :: Text
  , leelaStateId :: Maybe Int
  , hexagramNumberInput :: Maybe Int
  , movingLinesInput :: Maybe [MovingLine]
  }
  deriving (Eq, Show, Generic)

instance FromJSON ReadingRequest where
  parseJSON = withObject "ReadingRequest" $ \value ->
    ReadingRequest
      <$> value .: "question"
      <*> value .:? "leelaStateId"
      <*> value .:? "hexagramNumber"
      <*> value .:? "movingLines"

instance ToJSON ReadingRequest where
  toJSON request =
    object
      [ "question" .= question request
      , "leelaStateId" .= leelaStateId request
      , "hexagramNumber" .= hexagramNumberInput request
      , "movingLines" .= movingLinesInput request
      ]

data DomainData = DomainData
  { leelaStates :: [LeelaState]
  , hexagrams :: [Hexagram]
  , movingLineFocuses :: [MovingLineFocus]
  }
  deriving (Eq, Show, Generic)

instance FromJSON DomainData
instance ToJSON DomainData

data Health = Health
  { status :: Text
  , service :: Text
  }
  deriving (Eq, Show, Generic)

instance ToJSON Health
