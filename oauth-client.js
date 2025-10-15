import { NodeOAuthClient } from '@atproto/oauth-client-node'
import { StateStore, SessionStore } from './auth-storage.js'

export const createOAuthClient = async (port = 3000) => {
  const url = `http://127.0.0.1:${port}`
  const enc = encodeURIComponent

  return new NodeOAuthClient({
    clientMetadata: {
      client_name: 'Ffion Tracker',
      // For local development, we use the loopback client configuration
      client_id: `http://localhost?redirect_uri=${enc(`${url}/oauth/callback`)}&scope=${enc('atproto transition:generic')}`,
      client_uri: url,
      redirect_uris: [`${url}/oauth/callback`],
      scope: 'atproto transition:generic',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      application_type: 'web',
      token_endpoint_auth_method: 'none',
      dpop_bound_access_tokens: true,
    },
    stateStore: new StateStore(),
    sessionStore: new SessionStore(),
  })
}
