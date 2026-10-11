interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_USER_POOL_ID: string
  readonly VITE_USER_POOL_CLIENT_ID: string
  readonly VITE_USER_POOL_DOMAIN: string
  readonly VITE_COGNITO_OAUTH_REDIRECT_SIGN_IN: string
  readonly VITE_COGNITO_OAUTH_REDIRECT_SIGN_OUT: string
  readonly VITE_STATSIG_CLIENT_KEY?: string
  readonly VITE_STATSIG_ENVIRONMENT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
