package core

import (
	"context"
	"fmt"
	"log/slog"

	statsig "github.com/statsig-io/statsig-go-core"
)

// FlagUser is who a feature flag or experiment is evaluated for. UserID is
// the Cognito sub of a signed-in caller; StableID is the app's Statsig
// stableID, sent only with analytics consent.
type FlagUser struct {
	UserID    string
	StableID  string
	IP        string
	UserAgent string
}

// FlagExperiment is a user's assignment in an experiment: the group they fall
// in and that group's parameters.
type FlagExperiment struct {
	Group  string
	Values map[string]any
}

// FeatureFlags is the part of Statsig the API calls, so a test can stand in
// for Statsig. It speaks FlagUser rather than the SDK's types: building an SDK
// user loads Statsig's native library, which only the real client should do.
// Reads never log an exposure; LogExperimentExposure does that.
type FeatureFlags interface {
	CheckGate(ctx context.Context, user FlagUser, name string) bool
	GetDynamicConfig(ctx context.Context, user FlagUser, name string) map[string]any
	GetExperiment(ctx context.Context, user FlagUser, name string) FlagExperiment
	LogExperimentExposure(ctx context.Context, user FlagUser, name string)
	Shutdown(ctx context.Context) error
}

// Statsig evaluates feature flags and experiments. InitStatsig sets it when
// STATSIG_SERVER_SECRET is set, and it stays nil when Statsig is off.
var Statsig FeatureFlags

// statsigInitTimeoutMs bounds the first download of Statsig's specs at boot.
// Past it, boot carries on and reads return defaults until the specs arrive.
const statsigInitTimeoutMs int32 = 3000

// InitStatsig starts the Statsig client when it is configured. It never fails
// boot: when the client can't start, it logs why and leaves Statsig nil.
func InitStatsig(ctx context.Context) {
	if !Config.StatsigEnabled() {
		return
	}
	client, err := newStatsigClient()
	if err != nil {
		slog.WarnContext(ctx, "statsig is off: the client failed to start", "error", err)
		return
	}
	Statsig = client
}

func newStatsigClient() (client *statsigClient, err error) {
	// The SDK panics when its native library can't be loaded, e.g. when the
	// image lacks libgcc.
	defer func() {
		if r := recover(); r != nil {
			client, err = nil, fmt.Errorf("load statsig: %v", r)
		}
	}()

	builder := statsig.NewOptionsBuilder().
		WithEnvironment(Config.StatsigEnvironment).
		WithServiceName(Config.OtelServiceName)
	timeout := statsigInitTimeoutMs
	builder.InitTimeoutMs = &timeout
	options, err := builder.Build()
	if err != nil {
		return nil, err
	}
	sdk, err := statsig.NewStatsigWithOptions(Config.StatsigServerSecret, options)
	if err != nil {
		return nil, err
	}
	sdk.Initialize()
	return &statsigClient{sdk: sdk}, nil
}

type statsigClient struct {
	sdk *statsig.Statsig
}

func (c *statsigClient) CheckGate(ctx context.Context, user FlagUser, name string) bool {
	u, ok := c.user(ctx, user)
	if !ok {
		return false
	}
	return c.sdk.CheckGateWithOptions(u, name, &statsig.FeatureGateEvaluationOptions{DisableExposureLogging: true})
}

func (c *statsigClient) GetDynamicConfig(ctx context.Context, user FlagUser, name string) map[string]any {
	u, ok := c.user(ctx, user)
	if !ok {
		return nil
	}
	return c.sdk.GetDynamicConfigWithOptions(u, name, &statsig.DynamicConfigEvaluationOptions{DisableExposureLogging: true}).Value
}

func (c *statsigClient) GetExperiment(ctx context.Context, user FlagUser, name string) FlagExperiment {
	u, ok := c.user(ctx, user)
	if !ok {
		return FlagExperiment{}
	}
	experiment := c.sdk.GetExperimentWithOptions(u, name, &statsig.ExperimentEvaluationOptions{DisableExposureLogging: true})
	assignment := FlagExperiment{Values: experiment.Value}
	if experiment.GroupName != nil {
		assignment.Group = *experiment.GroupName
	}
	return assignment
}

func (c *statsigClient) LogExperimentExposure(ctx context.Context, user FlagUser, name string) {
	if u, ok := c.user(ctx, user); ok {
		c.sdk.ManuallyLogExperimentExposure(u, name)
	}
}

// Shutdown flushes the events still queued and stops the client. It gives up
// waiting when ctx ends, leaving whatever is unflushed.
func (c *statsigClient) Shutdown(ctx context.Context) error {
	done := make(chan struct{})
	go func() {
		c.sdk.Shutdown()
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// user builds the SDK's user from a FlagUser. A caller without a userID is
// sent with none at all rather than an empty one, so the SDK buckets it by
// its stableID.
func (c *statsigClient) user(ctx context.Context, user FlagUser) (*statsig.StatsigUser, bool) {
	builder := statsig.NewUserBuilderWithUserID(user.UserID)
	if user.UserID == "" {
		builder.WithoutUserID()
	}
	if user.StableID != "" {
		builder.WithCustomIDs(map[string]any{"stableID": user.StableID})
	}
	if user.IP != "" {
		builder.WithIpAddress(user.IP)
	}
	if user.UserAgent != "" {
		builder.WithUserAgent(user.UserAgent)
	}
	u, err := builder.Build()
	if err != nil {
		slog.WarnContext(ctx, "statsig user could not be built", "error", err)
		return nil, false
	}
	return u, true
}
