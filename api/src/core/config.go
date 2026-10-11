package core

import (
	"errors"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type config struct {
	Port               string
	DatabaseUrl        string
	RedisUrl           string
	CORSAllowedOrigins string
	CognitoRegion      string
	CognitoUserPoolID  string

	// Billing runs through Creem. It is optional: without these the API boots
	// with billing off, see BillingEnabled.
	CreemAPIKey        string
	CreemWebhookSecret string
	CreemProductId     string
	CreemAPIURL        string
	// AppURL is the web app's origin, where Creem sends a member back to after
	// checkout.
	AppURL string

	// Feature flags and experiments run through Statsig. It is optional:
	// without a secret the API boots with Statsig off, see StatsigEnabled.
	StatsigServerSecret string
	// StatsigEnvironment is the Statsig tier the API evaluates against.
	StatsigEnvironment string

	OtelSDKDisabled          bool
	OtelServiceName          string
	OtelExporterOTLPEndpoint string
	DeploymentEnvironment    string
}

// defaultPort is used when PORT is unset. Container platforms inject their own
// value and expect the process to honour it.
const defaultPort = "8080"

// defaultCreemAPIURL is Creem's test mode. Live is https://api.creem.io/v1,
// and each mode has its own API key.
const defaultCreemAPIURL = "https://test-api.creem.io/v1"

// defaultStatsigEnvironment is the only tier the Statsig project has keys for
// so far.
const defaultStatsigEnvironment = "development"

const (
	defaultOtelServiceName          = "steadylearn-api"
	defaultOtelExporterOTLPEndpoint = "http://localhost:4318"
	defaultDeploymentEnvironment    = "development"
)

var Config = &config{}

func LoadConfig() error {
	// .env is a local-dev convenience; deployed environments inject the vars directly
	_ = godotenv.Load()

	Config.Port = os.Getenv("PORT")
	if Config.Port == "" {
		Config.Port = defaultPort
	}

	Config.DatabaseUrl = os.Getenv("DATABASE_URL")
	Config.RedisUrl = os.Getenv("REDIS_URL")
	Config.CORSAllowedOrigins = os.Getenv("CORS_ALLOWED_ORIGINS")
	Config.CognitoRegion = os.Getenv("COGNITO_REGION")
	Config.CognitoUserPoolID = os.Getenv("COGNITO_USER_POOL_ID")

	Config.CreemAPIKey = os.Getenv("CREEM_API_KEY")
	Config.CreemWebhookSecret = os.Getenv("CREEM_WEBHOOK_SECRET")
	Config.CreemProductId = os.Getenv("CREEM_PRODUCT_ID")
	Config.CreemAPIURL = os.Getenv("CREEM_API_URL")
	if Config.CreemAPIURL == "" {
		Config.CreemAPIURL = defaultCreemAPIURL
	}
	Config.AppURL = strings.TrimRight(os.Getenv("APP_URL"), "/")

	Config.StatsigServerSecret = os.Getenv("STATSIG_SERVER_SECRET")
	Config.StatsigEnvironment = os.Getenv("STATSIG_ENVIRONMENT")
	if Config.StatsigEnvironment == "" {
		Config.StatsigEnvironment = defaultStatsigEnvironment
	}

	// OTEL_SDK_DISABLED is the OpenTelemetry spec's own name for the
	// kill-switch; reused here rather than inventing a project-specific var.
	Config.OtelSDKDisabled = os.Getenv("OTEL_SDK_DISABLED") == "true"

	Config.OtelServiceName = os.Getenv("OTEL_SERVICE_NAME")
	if Config.OtelServiceName == "" {
		Config.OtelServiceName = defaultOtelServiceName
	}

	Config.OtelExporterOTLPEndpoint = os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if Config.OtelExporterOTLPEndpoint == "" {
		Config.OtelExporterOTLPEndpoint = defaultOtelExporterOTLPEndpoint
	}

	Config.DeploymentEnvironment = os.Getenv("DEPLOYMENT_ENVIRONMENT")
	if Config.DeploymentEnvironment == "" {
		Config.DeploymentEnvironment = defaultDeploymentEnvironment
	}

	if Config.DatabaseUrl == "" {
		return errors.New("DATABASE_URL environment variable is not set")
	}

	if Config.RedisUrl == "" {
		return errors.New("REDIS_URL environment variable is not set")
	}

	if Config.CognitoRegion == "" {
		return errors.New("COGNITO_REGION environment variable is not set")
	}

	if Config.CognitoUserPoolID == "" {
		return errors.New("COGNITO_USER_POOL_ID environment variable is not set")
	}

	return nil
}

// BillingEnabled reports whether everything billing needs is set. Unlike the
// variables LoadConfig requires, these may be missing: billing is then off,
// its endpoints answer 503, and the rest of the API is unaffected.
func (c *config) BillingEnabled() bool {
	return c.CreemAPIKey != "" && c.CreemWebhookSecret != "" && c.CreemProductId != "" && c.AppURL != ""
}

// StatsigEnabled reports whether Statsig has its secret. Without it Statsig is
// off: core.Statsig stays nil and every flag reads its code default.
func (c *config) StatsigEnabled() bool {
	return c.StatsigServerSecret != ""
}
