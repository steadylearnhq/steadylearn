package core_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"

	"steadylearn-api/src/core"
)

// Without a secret, InitStatsig leaves Statsig off and never reaches the SDK.
func TestInitStatsigWithoutSecret(t *testing.T) {
	secret, client := core.Config.StatsigServerSecret, core.Statsig
	t.Cleanup(func() { core.Config.StatsigServerSecret, core.Statsig = secret, client })
	core.Config.StatsigServerSecret = ""
	core.Statsig = nil

	core.InitStatsig(context.Background())

	assert.False(t, core.Config.StatsigEnabled())
	assert.Nil(t, core.Statsig)
}
