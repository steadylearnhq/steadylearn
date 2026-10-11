package services

import (
	"context"
	"encoding/json"
	"math"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"

	"steadylearn-api/src/core"
)

// Feature flags and experiments are read only through these helpers. A read
// never fails: when Statsig is off, or the caller can't be bucketed, it
// returns the caller's defaults, so code defaults are always the control.
//
// No read logs an exposure. An experiment's exposure is logged by
// Assignment.LogExposure, where the variant actually changes what the caller
// gets.

// Gate reports whether u passes the feature gate name. It is false when
// Statsig is off or u can't be bucketed.
func Gate(ctx context.Context, u core.FlagUser, name string) bool {
	if !flagsOn(u) {
		return false
	}
	pass := core.Statsig.CheckGate(ctx, u, name)
	recordFlag(ctx, "gate", name, attribute.Bool("feature_flag.result.value", pass))
	return pass
}

// Config is the dynamic config name for u. Every read of it falls back to its
// default when Statsig is off, u can't be bucketed or the key isn't set.
func Config(ctx context.Context, u core.FlagUser, name string) Values {
	if !flagsOn(u) {
		return Values{}
	}
	values := Values{values: core.Statsig.GetDynamicConfig(ctx, u, name)}
	recordFlag(ctx, "config", name)
	return values
}

// Experiment is u's assignment in the experiment name. When Statsig is off or
// u can't be bucketed it is in no group, every read returns its default, and
// LogExposure does nothing.
func Experiment(ctx context.Context, u core.FlagUser, name string) Assignment {
	if !flagsOn(u) {
		return Assignment{}
	}
	experiment := core.Statsig.GetExperiment(ctx, u, name)
	recordFlag(ctx, "experiment", name, attribute.String("feature_flag.result.variant", experiment.Group))
	return Assignment{
		Values: Values{values: experiment.Values},
		user:   u,
		name:   name,
		group:  experiment.Group,
		on:     true,
	}
}

// Assignment is a user's group in an experiment and its parameters.
type Assignment struct {
	Values
	user  core.FlagUser
	name  string
	group string
	on    bool
}

// Group is the name of the experiment group the user is in, or "" when they
// are in none.
func (a Assignment) Group() string {
	return a.group
}

// LogExposure counts the user in the experiment. Call it where the variant is
// actually used. Only a caller who sent a stableID is counted: the app sends
// it only with analytics consent, so a signed-in user without consent is
// bucketed but not logged.
func (a Assignment) LogExposure(ctx context.Context) {
	if !a.on || a.user.StableID == "" {
		return
	}
	core.Statsig.LogExperimentExposure(ctx, a.user, a.name)
}

// Values are a dynamic config's or an experiment group's parameters. Each read
// returns def when the key is missing or holds another type.
type Values struct {
	values map[string]any
}

func (v Values) String(key, def string) string {
	if s, ok := v.values[key].(string); ok {
		return s
	}
	return def
}

func (v Values) Bool(key string, def bool) bool {
	if b, ok := v.values[key].(bool); ok {
		return b
	}
	return def
}

// Int reads a whole number. JSON numbers arrive as float64, so one with a
// fraction is not an int and reads as def.
func (v Values) Int(key string, def int) int {
	f, ok := number(v.values[key])
	if !ok || f != math.Trunc(f) {
		return def
	}
	return int(f)
}

func (v Values) Float(key string, def float64) float64 {
	if f, ok := number(v.values[key]); ok {
		return f
	}
	return def
}

func number(value any) (float64, bool) {
	switch n := value.(type) {
	case float64:
		return n, true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case json.Number:
		f, err := n.Float64()
		return f, err == nil
	}
	return 0, false
}

// flagsOn reports whether a read for u can reach Statsig. A caller with
// neither id gets the defaults: an empty unit id would put every anonymous
// caller in one bucket.
func flagsOn(u core.FlagUser) bool {
	return core.Statsig != nil && (u.UserID != "" || u.StableID != "")
}

// recordFlag adds the evaluation to the current span as an event, so a
// request that reads several flags keeps each one.
func recordFlag(ctx context.Context, kind, name string, attrs ...attribute.KeyValue) {
	attrs = append(attrs,
		attribute.String("feature_flag.key", name),
		attribute.String("feature_flag.kind", kind),
		attribute.String("feature_flag.provider.name", "statsig"),
	)
	trace.SpanFromContext(ctx).AddEvent("feature_flag.evaluation", trace.WithAttributes(attrs...))
}
