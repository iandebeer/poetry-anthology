{-# LANGUAGE OverloadedStrings #-}

module Domain.Loading
  ( DataLoadError (..)
  , loadDomainData
  )
where

import Data.Aeson (FromJSON, eitherDecodeFileStrict')
import Data.Text (Text)
import qualified Data.Text as T
import Domain.Types
  ( DomainData (..)
  )
import System.FilePath ((</>))

newtype DataLoadError = DataLoadError
  { renderDataLoadError :: Text
  }
  deriving (Eq, Show)

loadDomainData :: FilePath -> IO (Either DataLoadError DomainData)
loadDomainData dataDirectory = do
  statesResult <- readJson "leela.json"
  hexagramsResult <- readJson "hexagrams.json"
  linesResult <- readJson "lines.json"
  pure $ do
    states <- statesResult
    hexagramValues <- hexagramsResult
    lineValues <- linesResult
    validateNonEmpty "leela states" states
    validateNonEmpty "hexagrams" hexagramValues
    validateNonEmpty "moving line focuses" lineValues
    pure
      DomainData
        { leelaStates = states
        , hexagrams = hexagramValues
        , movingLineFocuses = lineValues
        }
  where
    readJson :: FromJSON a => FilePath -> IO (Either DataLoadError a)
    readJson fileName = do
      decoded <- eitherDecodeFileStrict' (dataDirectory </> fileName)
      pure $
        case decoded of
          Left message ->
            Left $
              DataLoadError $
                T.pack ("Could not load " <> fileName <> ": " <> message)
          Right value -> Right value

validateNonEmpty :: Text -> [a] -> Either DataLoadError ()
validateNonEmpty label values =
  if null values
    then Left (DataLoadError ("Expected at least one " <> label <> " entry"))
    else Right ()
