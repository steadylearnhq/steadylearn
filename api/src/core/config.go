package core

import (
	"errors"
	"os"

	"github.com/joho/godotenv"
)

type config struct {
	Port               string
	DatabaseUrl        string
	RedisUrl           string
	CORSAllowedOrigins string
	CognitoRegion      string
	CognitoUserPoolID  string

	OtelSDKDisabled          bool
	OtelServiceName          string
	OtelExporterOTLPEndpoint string
	DeploymentEnvironment    string
}

// defaultPort is used when PORT is unset. Container platforms inject their own
// value and expect the process to honour it.
const defaultPort = "8080"

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
