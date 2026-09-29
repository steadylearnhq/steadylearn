package core

import (
	"context"
	"errors"
	"log"
	"log/slog"
	"os"
	"strings"

	"go.opentelemetry.io/contrib/bridges/otelslog"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	logglobal "go.opentelemetry.io/otel/log/global"
	"go.opentelemetry.io/otel/propagation"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.43.0"
)

// InitTelemetry wires up OpenTelemetry traces, metrics and logs, exporting
// via OTLP/HTTP to Config.OtelExporterOTLPEndpoint, and installs an
// OTel-backed slog default logger. It never fails the boot sequence: if
// telemetry is disabled or any part of the setup errors, it logs the reason
// via the stdlib logger and returns a no-op shutdown, leaving OTel's global
// no-op implementations in place.
//
// HTTP (not gRPC) is used deliberately: gRPC's long-lived HTTP/2 streams get
// silently dropped by some firewalls/proxies (observed against SigNoz Cloud
// from a real network -- connections hung until the exporter's own timeout,
// while plain HTTPS requests to the same host succeeded instantly), whereas
// OTLP/HTTP is a plain request/response POST per export and goes through the
// same paths ordinary HTTPS traffic does.
//
// Call sites should use slog.InfoContext/ErrorContext (not the bare
// slog.Info/Error, which use context.Background()) so log records carry the
// trace/span IDs of the request they belong to.
func InitTelemetry(ctx context.Context) (shutdown func(context.Context) error, err error) {
	noop := func(context.Context) error { return nil }

	if Config.OtelSDKDisabled {
		return noop, nil
	}

	res, buildErr := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(Config.OtelServiceName),
			semconv.DeploymentEnvironmentNameKey.String(Config.DeploymentEnvironment),
			attribute.String("deployment.environment", Config.DeploymentEnvironment),
		),
		resource.WithProcess(),
		resource.WithHost(),
		resource.WithTelemetrySDK(),
	)
	if buildErr != nil {
		log.Printf("otel: failed to build resource, telemetry disabled: %v", buildErr)
		return noop, nil
	}

	// otlp*http's WithEndpointURL does not append the per-signal path itself
	// (unlike the plain OTEL_EXPORTER_OTLP_ENDPOINT env var, which the SDK
	// spec requires signal paths to be appended to) -- it takes the URL as
	// given, so the /v1/<signal> suffix has to be added here.
	base := strings.TrimRight(Config.OtelExporterOTLPEndpoint, "/")

	traceExporter, buildErr := otlptracehttp.New(ctx, otlptracehttp.WithEndpointURL(base+"/v1/traces"))
	if buildErr != nil {
		log.Printf("otel: failed to create trace exporter, telemetry disabled: %v", buildErr)
		return noop, nil
	}

	metricExporter, buildErr := otlpmetrichttp.New(ctx, otlpmetrichttp.WithEndpointURL(base+"/v1/metrics"))
	if buildErr != nil {
		log.Printf("otel: failed to create metric exporter, telemetry disabled: %v", buildErr)
		_ = traceExporter.Shutdown(ctx)
		return noop, nil
	}

	logExporter, buildErr := otlploghttp.New(ctx, otlploghttp.WithEndpointURL(base+"/v1/logs"))
	if buildErr != nil {
		log.Printf("otel: failed to create log exporter, telemetry disabled: %v", buildErr)
		_ = traceExporter.Shutdown(ctx)
		_ = metricExporter.Shutdown(ctx)
		return noop, nil
	}

	tracerProvider := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(traceExporter),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tracerProvider)

	meterProvider := sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(metricExporter)),
		sdkmetric.WithResource(res),
	)
	otel.SetMeterProvider(meterProvider)

	loggerProvider := sdklog.NewLoggerProvider(
		sdklog.WithProcessor(sdklog.NewBatchProcessor(logExporter)),
		sdklog.WithResource(res),
	)
	logglobal.SetLoggerProvider(loggerProvider)

	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	otelHandler := otelslog.NewHandler(Config.OtelServiceName, otelslog.WithLoggerProvider(loggerProvider))
	stdoutHandler := slog.NewTextHandler(os.Stdout, nil)
	slog.SetDefault(slog.New(&multiHandler{handlers: []slog.Handler{otelHandler, stdoutHandler}}))

	return func(shutdownCtx context.Context) error {
		return errors.Join(
			tracerProvider.Shutdown(shutdownCtx),
			meterProvider.Shutdown(shutdownCtx),
			loggerProvider.Shutdown(shutdownCtx),
		)
	}, nil
}

// multiHandler fans a slog record out to several handlers. It exists so logs
// keep going to plain stdout (readable locally with no collector attached)
// while also being bridged to OTel logs.
type multiHandler struct {
	handlers []slog.Handler
}

func (m *multiHandler) Enabled(ctx context.Context, level slog.Level) bool {
	for _, h := range m.handlers {
		if h.Enabled(ctx, level) {
			return true
		}
	}
	return false
}

func (m *multiHandler) Handle(ctx context.Context, record slog.Record) error {
	var errs []error
	for _, h := range m.handlers {
		if !h.Enabled(ctx, record.Level) {
			continue
		}
		if err := h.Handle(ctx, record.Clone()); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func (m *multiHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	next := make([]slog.Handler, len(m.handlers))
	for i, h := range m.handlers {
		next[i] = h.WithAttrs(attrs)
	}
	return &multiHandler{handlers: next}
}

func (m *multiHandler) WithGroup(name string) slog.Handler {
	next := make([]slog.Handler, len(m.handlers))
	for i, h := range m.handlers {
		next[i] = h.WithGroup(name)
	}
	return &multiHandler{handlers: next}
}
