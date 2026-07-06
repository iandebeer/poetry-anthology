module Main
  ( main
  )
where

import API.Server (app)
import Domain.Loading (DataLoadError (..), loadDomainData)
import Network.Wai.Handler.Warp (run)
import System.Environment (lookupEnv)
import Text.Read (readMaybe)

main :: IO ()
main = do
  port <- resolvePort
  loaded <- loadDomainData "data"
  case loaded of
    Left err -> fail (show (renderDataLoadError err))
    Right domain -> do
      putStrLn ("The Tao of Lila API listening on port " <> show port)
      run port (app "app/public" domain)

resolvePort :: IO Int
resolvePort = do
  maybePort <- lookupEnv "PORT"
  pure $
    case maybePort >>= readMaybe of
      Just port -> port
      Nothing -> 8080
