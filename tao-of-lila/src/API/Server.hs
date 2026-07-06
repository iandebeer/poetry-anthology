{-# LANGUAGE DataKinds #-}
{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE TypeOperators #-}

module API.Server
  ( API
  , app
  )
where

import Data.Aeson (encode, object, (.=))
import Domain.Types
  ( DomainData (..)
  , Health (..)
  , Hexagram
  , Interpretation (..)
  , LeelaState
  , Reading (..)
  , ReadingRequest
  )
import Engine.Reading (ReadingError (..), generateReading)
import Network.Wai (Application)
import Network.Wai.Application.Static (serveDirectoryWebApp)
import Servant
  ( (:<|>) (..)
  , (:>)
  , Get
  , Handler
  , JSON
  , Post
  , Proxy (..)
  , Raw
  , ReqBody
  , Server
  , err400
  , errBody
  , serve
  , throwError
  )

type API =
  "states" :> Get '[JSON] [LeelaState]
    :<|> "hexagrams" :> Get '[JSON] [Hexagram]
    :<|> "reading" :> ReqBody '[JSON] ReadingRequest :> Post '[JSON] Reading
    :<|> "interpret" :> ReqBody '[JSON] ReadingRequest :> Post '[JSON] Interpretation
    :<|> "health" :> Get '[JSON] Health
    :<|> Raw

app :: FilePath -> DomainData -> Application
app staticDirectory domain =
  serve apiProxy (server staticDirectory domain)

apiProxy :: Proxy API
apiProxy = Proxy

server :: FilePath -> DomainData -> Server API
server staticDirectory domain =
  pure (leelaStates domain)
    :<|> pure (hexagrams domain)
    :<|> createReading domain
    :<|> createInterpretation domain
    :<|> pure (Health "ok" "tao-of-lila")
    :<|> serveDirectoryWebApp staticDirectory

createReading :: DomainData -> ReadingRequest -> Handler Reading
createReading domain request =
  case generateReading domain request of
    Right reading -> pure reading
    Left err -> throwReadingError err

createInterpretation :: DomainData -> ReadingRequest -> Handler Interpretation
createInterpretation domain request =
  readingInterpretation <$> createReading domain request

throwReadingError :: ReadingError -> Handler a
throwReadingError err =
  throwError
    err400
      { errBody =
          encode
            (object ["error" .= renderReadingError err])
      }
