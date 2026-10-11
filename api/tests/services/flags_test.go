package services_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"

	"steadylearn-api/src/core"
	"steadylearn-api/src/services"
	"steadylearn-api/tests/testutil"
)

var (
	flagMember  = core.FlagUser{UserID: "user-1"}
	flagVisitor = core.FlagUser{StableID: "stable-1"}
)

func TestFlagsOff(t *testing.T) {
	ctx := context.Background()
	cases := []struct {
		name string
		user core.FlagUser
		mock bool // Statsig on, but the user can't be bucketed
	}{
		{name: "Statsig off", user: flagMember},
		{name: "no ids", user: core.FlagUser{IP: "203.0.113.1"}, mock: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.mock {
				testutil.UseStatsig(t) // any call fails the test
			}

			assert.False(t, services.Gate(ctx, tc.user, "gate"))

			config := services.Config(ctx, tc.user, "config")
			assert.Equal(t, "default", config.String("message", "default"))
			assert.Equal(t, 3, config.Int("count", 3))

			assignment := services.Experiment(ctx, tc.user, "experiment")
			assert.Empty(t, assignment.Group())
			assert.Equal(t, "control", assignment.String("variant", "control"))
			assignment.LogExposure(ctx)
		})
	}
}

func TestGate(t *testing.T) {
	ctx := context.Background()
	statsig := testutil.UseStatsig(t)
	statsig.On("CheckGate", mock.Anything, flagMember, "sl_test_gate").Return(true).Once()

	assert.True(t, services.Gate(ctx, flagMember, "sl_test_gate"))
}

func TestConfig(t *testing.T) {
	ctx := context.Background()
	statsig := testutil.UseStatsig(t)
	statsig.On("GetDynamicConfig", mock.Anything, flagVisitor, "sl_test_config").Return(map[string]any{
		"message": "hello from statsig",
		"enabled": true,
		"limit":   float64(5), // as JSON decodes it
		"ratio":   0.25,
	}).Once()

	config := services.Config(ctx, flagVisitor, "sl_test_config")

	cases := []struct {
		name string
		got  any
		want any
	}{
		{name: "string", got: config.String("message", ""), want: "hello from statsig"},
		{name: "bool", got: config.Bool("enabled", false), want: true},
		{name: "int", got: config.Int("limit", 0), want: 5},
		{name: "float", got: config.Float("ratio", 0), want: 0.25},
		{name: "missing key", got: config.String("missing", "fallback"), want: "fallback"},
		{name: "wrong type", got: config.Int("message", 7), want: 7},
		{name: "fraction as int", got: config.Int("ratio", 9), want: 9},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, tc.got)
		})
	}
}

func TestExperiment(t *testing.T) {
	ctx := context.Background()
	statsig := testutil.UseStatsig(t)
	statsig.On("GetExperiment", mock.Anything, flagVisitor, "sl_test_experiment_stable").Return(core.FlagExperiment{
		Group:  "Test",
		Values: map[string]any{"variant": "test"},
	}).Once()

	assignment := services.Experiment(ctx, flagVisitor, "sl_test_experiment_stable")

	assert.Equal(t, "Test", assignment.Group())
	assert.Equal(t, "test", assignment.String("variant", "control"))
	assert.Equal(t, "fallback", assignment.String("missing", "fallback"))
}

func TestLogExposure(t *testing.T) {
	ctx := context.Background()
	cases := []struct {
		name   string
		user   core.FlagUser
		logged bool
	}{
		{name: "with a stableID", user: core.FlagUser{UserID: "user-1", StableID: "stable-1"}, logged: true},
		{name: "signed in without consent", user: flagMember, logged: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			statsig := testutil.UseStatsig(t)
			statsig.On("GetExperiment", mock.Anything, tc.user, "sl_test_experiment").
				Return(core.FlagExperiment{Group: "Control"}).Once()
			if tc.logged {
				statsig.On("LogExperimentExposure", mock.Anything, tc.user, "sl_test_experiment").Once()
			}

			services.Experiment(ctx, tc.user, "sl_test_experiment").LogExposure(ctx)

			if !tc.logged {
				statsig.AssertNotCalled(t, "LogExperimentExposure", mock.Anything, mock.Anything, mock.Anything)
			}
		})
	}
}
